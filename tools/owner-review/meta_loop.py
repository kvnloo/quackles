#!/usr/bin/env python3
"""Local, evidence-conservative Blender meta-learning loop. No scene promotion."""
from __future__ import annotations
import argparse
import copy
from collections import defaultdict
from datetime import datetime, timezone
import hashlib
import html
import json
import math
import os
from pathlib import Path
import random
import statistics
import sys
import time
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATA = Path(os.environ.get('OWNER_REVIEW_DATA') or
                    str(Path(os.environ.get('XDG_CACHE_HOME') or Path.home()/'.cache')/'owner-review')).expanduser()
MECHANISMS = ('geometry', 'procedural_shader', 'traced_vector', 'projection_paint',
              'ai_udim', 'layer_stack', 'lighting', 'post', 'generated_vector', 'unknown')


def digest(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for chunk in iter(lambda: f.read(1024*1024), b''):
            h.update(chunk)
    return h.hexdigest()


def now():
    return datetime.now(timezone.utc).isoformat()


def json_text(value):
    return json.dumps(value, sort_keys=True, allow_nan=False)


def read_jsonl(path):
    """Do not consume an incomplete final write; all other bad lines are errors."""
    if not Path(path).exists():
        return [], []
    data = Path(path).read_bytes()
    rows, errors = [], []
    for n, line in enumerate(data.splitlines(keepends=True), 1):
        if not line.endswith(b'\n'):
            errors.append(f'{path}:{n}: incomplete final line deferred')
            continue
        try:
            rows.append(json.loads(line))
        except (ValueError, UnicodeDecodeError) as e:
            errors.append(f'{path}:{n}: {e}')
    return rows, errors


_VALIDATOR = None


def validate_trial(row):
    global _VALIDATOR
    if _VALIDATOR is None:
        from trial_schema import load_validator
        _VALIDATOR = load_validator()
    _VALIDATOR(row)
    required = ('event_id', 'trial_id', 'run_id', 'lane', 'parents', 'element',
                'defect_id', 'hypothesis', 'mechanism_class', 'parameters', 'cost',
                'artifacts', 'metrics', 'self_review', 'judge_verdicts', 'owner_reaction', 'status')
    for key in required:
        if key not in row:
            raise ValueError('missing '+key)
    if row.get('event') != 'meta_trial' or row.get('schema_version') != 1:
        raise ValueError('unsupported event/schema')
    if row['mechanism_class'] not in MECHANISMS:
        raise ValueError('unknown mechanism class')
    for key in ('gpu_seconds', 'wall_seconds'):
        value = row['cost'].get(key)
        if value is not None and (isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0):
            raise ValueError('invalid cost '+key)
    if row['owner_reaction']['status'] in ('approved', 'rejected', 'preferred') and not row['owner_reaction'].get('receipt'):
        raise ValueError('owner decision missing receipt')
    if row['trial_id'] in row['parents']:
        raise ValueError('self parent')
    json_text(row)


def materialize(events):
    """Revision order is append order within one lane, not guessed timestamps."""
    ids, trials, errors, owners = {}, {}, [], {}
    for row in events:
        try:
            validate_trial(row)
            event_id, trial_id = row['event_id'], row['trial_id']
            encoded = json_text(row)
            if event_id in ids:
                if ids[event_id] != encoded:
                    raise ValueError('event_id conflict '+event_id)
                continue
            if trial_id in owners and owners[trial_id] != row['lane']:
                raise ValueError('cross-lane trial ownership conflict '+trial_id)
            if trial_id in trials:
                previous = trials[trial_id]
                for key in ('element', 'run_id', 'defect_id'):
                    if row[key] != previous[key]:
                        raise ValueError('immutable trial field changed '+key)
            ids[event_id] = encoded
            owners[trial_id] = row['lane']
            materialized = copy.deepcopy(row)
            if trial_id in trials:
                previous = trials[trial_id]
                for field, history_key in (('mechanism_class', 'classification_history'), ('parents', 'parent_history')):
                    history = copy.deepcopy(previous.get(history_key, []))
                    if previous[field] != row[field]:
                        if not history:
                            history.append(copy.deepcopy({k: previous[k] for k in ('event_id', field)}))
                        history.append(copy.deepcopy({k: row[k] for k in ('event_id', field)}))
                    if history:
                        materialized[history_key] = history
            trials[trial_id] = materialized
        except (ValueError, TypeError, KeyError) as e:
            errors.append(str(e))
    # Keep unresolved external parents, but quarantine cycles and descendants.
    bad, visiting, visited = set(), set(), set()
    def visit(node):
        if node in visiting:
            bad.update(visiting)
            return
        if node in visited or node not in trials:
            return
        visiting.add(node)
        for parent in trials[node]['parents']:
            visit(parent)
            if parent in bad:
                bad.add(node)
        visiting.remove(node)
        visited.add(node)
    for node in trials:
        visit(node)
    if bad:
        errors.append('parent cycle quarantined: '+', '.join(sorted(bad)))
    return [r for key, r in trials.items() if key not in bad], errors


def posterior(successes, failures):
    a, b = 1 + successes, 1 + failures
    # Deterministic Monte Carlo central interval, not a normal approximation.
    rng = random.Random(173)
    draws = sorted(rng.betavariate(a, b) for _ in range(2048))
    return dict(alpha=a, beta=b, n=successes+failures, mean=a/(a+b),
                interval95=[draws[51], draws[1996]], interval_method='2048 seeded Beta draws')


def owner_outcome(row):
    reaction = row['owner_reaction']
    if not reaction.get('receipt'):
        return None
    return {'approved': 1, 'rejected': 0}.get(reaction['status'])


def judge_outcome(row, calibrations):
    values = []
    for verdict in row['judge_verdicts']:
        calibration = calibrations.get(verdict.get('calibration_id'), {})
        if not (calibration.get('qualified') and calibration.get('prospective_holdout')
                and verdict.get('protocol_id') == calibration.get('protocol_id')
                and verdict.get('receipt') and verdict.get('evidence_verified') is True):
            continue
        if verdict.get('preference') in ('candidate', 'parent'):
            values.append(int(verdict['preference'] == 'candidate'))
    # Repeats are one trial, and discordant/swapped votes abstain.
    return values[0] if values and len(set(values)) == 1 else None


def mechanism_key(row):
    # Preserve the producer token; only the analytical grouping distinguishes
    # explicitly authored vector synthesis from tracing observed source contours.
    if (row['lane'] == 'banner-generator'
            and (row['mechanism_class'] == 'traced_vector' or row.get('parameters', {}).get('family') in ('H','D','M','F'))
            and row.get('parameters', {}).get('new_detail') == 'authored deterministic vectors; not recovered target strokes'):
        return 'generated_vector'
    return row['mechanism_class']


def learn(rows, calibrations):
    groups = defaultdict(list)
    for row in rows:
        if not row.get('source', {}).get('evidence_only'):
            groups[(row['element'], mechanism_key(row))].append(row)
    result = defaultdict(dict)
    for (element, mechanism), group in sorted(groups.items()):
        values = dict(owner_accept=[], owner_preference=[], judge_win=[], historical_keep=[], max_zoom_pass=[])
        for row in group:
            active_labels = row.get('owner_labels_by_aspect', {'overall': row.get('owner_label', {})})
            preferences = {(label.get('pairwise') or {}).get('preference')
                           for label in active_labels.values() if label.get('pairwise')}
            if len(preferences) == 1 and next(iter(preferences)) in ('candidate', 'other'):
                values['owner_preference'].append(int(next(iter(preferences)) == 'candidate'))
            owner, judge = owner_outcome(row), judge_outcome(row, calibrations)
            if owner is not None:
                values['owner_accept'].append(owner)
            if judge is not None:
                values['judge_win'].append(judge)
            if row.get('historical_keep') is not None:
                values['historical_keep'].append(int(row['historical_keep']))
            gate = row['metrics'].get('max_zoom_gate')
            if gate in ('pass', 'fail') and row.get('artifacts_verified') and row['metrics'].get('max_zoom_evidence'):
                values['max_zoom_pass'].append(int(gate == 'pass'))
        stats: dict[str, Any] = {key: posterior(sum(v), len(v)-sum(v)) for key, v in values.items()}
        stats['owner_aspects'] = count_owner_aspects(
            label for row in group for label in row.get('owner_labels_by_aspect', {}).values()
            if label.get('scope', 'trial') != 'trial')
        stats['trials'] = len(group)
        stats['implementation_failures'] = sum(x.get('failure_class') == 'implementation' for x in group)
        for kind in ('gpu_seconds', 'wall_seconds'):
            costs = [r['cost'].get(kind) for r in group if r['cost'].get(kind) is not None]
            stats[kind+'_mean'] = statistics.mean(costs) if costs else None
            stats[kind+'_n'] = len(costs)
        result[element][mechanism] = stats
    return dict(result)


def plateaus(rows, calibrations):
    streaks = defaultdict(int)
    ordered = [r for r in rows if r.get('timestamp') is not None]
    ordered.sort(key=lambda r: datetime.fromisoformat(r['timestamp'].replace('Z', '+00:00')))
    for row in ordered:
        key = row['defect_id']
        if key.startswith('unresolved:'):
            continue
        if row.get('failure_class') in ('implementation', 'resource', 'evidence'):
            continue
        reward = owner_outcome(row)
        if reward is None:
            reward = judge_outcome(row, calibrations)
        if reward is None and row.get('artifacts_verified') and row['metrics'].get('max_zoom_gate') == 'fail':
            reward = 0  # hard gate failure, NOT owner rejection
        if reward is None and row.get('source', {}).get('defect_adjudicated'):
            reward = row.get('historical_keep')
        if reward is not None:
            streaks[key] = 0 if reward else streaks[key]+1
    return [{'defect_id': k, 'consecutive_nonwins': v, 'action': 'checkpoint_or_switch'}
            for k, v in sorted(streaks.items()) if v >= 2]


def eligible_recipe(row, calibrations):
    metrics = row['metrics']
    winner = owner_outcome(row) == 1 or (owner_outcome(row) is None and judge_outcome(row, calibrations) == 1)
    bound_paths = {a['path'] for a in row['artifacts']}
    script = row.get('recipe', {}).get('script_path')
    return bool(winner and row.get('artifacts_verified') is True
                and metrics.get('max_zoom_evidence') in bound_paths and script in bound_paths
                and row.get('status') == 'completed' and row.get('failure_class') in ('none', 'unknown')
                and metrics.get('max_zoom_gate') == 'pass'
                and metrics.get('max_zoom_evidence') and metrics.get('crop_gate') == 'pass'
                and row.get('recipe', {}).get('script_path'))


def plan(rows, element, calibrations, exploration_slots=2):
    if exploration_slots not in (1, 2, 3):
        raise ValueError('exploration_slots must be 1..3 of four')
    scoped = [r for r in rows if r['element'] == element]
    stats = learn(scoped, calibrations).get(element, {})
    plateau = plateaus(scoped, calibrations)
    candidates = (['traced_vector', 'generated_vector', 'procedural_shader', 'layer_stack']
                  if 'banner' in element else ['geometry', 'procedural_shader', 'layer_stack', 'projection_paint', 'ai_udim'])
    pending = [r for r in scoped if r['status'] == 'pending']
    inflight = {mechanism_key(r) for r in pending}
    def rank(mechanism):
        s = stats.get(mechanism, {})
        for source in ('owner_accept', 'judge_win'):
            p = s.get(source, {})
            if p.get('n', 0):
                return p['mean'], p['n']
        return 0.5, 0
    best = None
    # Sparse/no accepted history means test form, not claim a learned best.
    preferred = (['traced_vector', 'procedural_shader', 'layer_stack', 'geometry']
                 if 'banner' in element else ['geometry', 'layer_stack', 'procedural_shader', 'projection_paint'])
    explored = sorted([c for c in candidates if c not in inflight], key=lambda k: (stats.get(k, {}).get('trials', 0),
                     preferred.index(k) if k in preferred else len(preferred), k))
    qualified = [r for r in scoped if eligible_recipe(r, calibrations)]
    winners = [r for r in scoped if mechanism_key(r) in candidates and r['status'] == 'completed'
               and (owner_outcome(r) == 1 or (owner_outcome(r) is None and judge_outcome(r, calibrations) == 1))]
    if winners:
        best = max({mechanism_key(r) for r in winners}, key=lambda key: (rank(key), key))
    batch = []
    for mechanism in explored[:exploration_slots]:
        batch.append(dict(action='new_mechanism', mechanism_class=mechanism, parents=[],
                          reason='Explicit breadth budget; least-observed eligible representation. Owner/brief permission required.'))
    while len(batch) < exploration_slots:
        batch.append(dict(action='repair', mechanism_class=None, parents=[],
                          reason='Breadth slot reserved: await running mechanisms rather than duplicate work.'))
    if len(batch) < 4:
        if winners and not plateau:
            winner = next((r for r in reversed(winners) if mechanism_key(r) == best), winners[-1])
            batch.append(dict(action='refine_best', mechanism_class=mechanism_key(winner), parents=[winner['trial_id']],
                              reason='Depth slot on an evidenced win; retain locked fixture and measure final-density crop.'))
        else:
            batch.append(dict(action='repair', mechanism_class=preferred[0], parents=[],
                              reason='No qualified best, or same-defect plateau. Repair evidence/interpretation and request owner checkpoint; not another blind parameter retry.'))
    while len(batch) < 4:
        if len(qualified) >= 2:
            batch.append(dict(action='recombine_winners', mechanism_class='layer_stack',
                              parents=[r['trial_id'] for r in qualified[-2:]], reason='Compose two gated recipes on an isolated copy; recheck interfaces.'))
        else:
            batch.append(dict(action='repair', mechanism_class=preferred[1], parents=[],
                              reason='Recombination withheld: fewer than two max-zoom-gated winners. Capture native target/baseline/candidate and stable defect evidence.'))
    return dict(element=element, batch=batch, exploration_slots=exploration_slots,
                batch_size=4, stop=False, plateaus=plateau,
                pending_trial_ids=[r['trial_id'] for r in pending], allowed_mechanisms=candidates,
                evidence_trial_ids=[r['trial_id'] for r in scoped],
                policy='breadth-depth-v1', learned_best=best if winners else None,
                caveat='Recommendations are experiments, not owner acceptance or demonstrated policy superiority.')


def policy_action(prefix, policy, step):
    """Only observed prefix enters scheduling. Fixed action space has no future leak."""
    actions = MECHANISMS[:-1]
    if policy == 'round_robin':
        return actions[step % len(actions)]
    if policy == 'sequential_refine':
        return prefix[-1]['mechanism_class'] if prefix else actions[0]
    counts = {a: [0, 0] for a in actions}
    for row in prefix:
        a, reward = row['mechanism_class'], row.get('historical_keep')
        if a in counts and reward is not None:
            counts[a][0] += int(reward)
            counts[a][1] += 1
    if step % 4 < 2:  # two breadth slots, two depth slots
        return min(actions, key=lambda a: (counts[a][1], actions.index(a)))
    return max(actions, key=lambda a: ((1+counts[a][0])/(2+counts[a][1]), -actions.index(a)))


def replay(rows) -> dict[str, Any]:
    groups = defaultdict(list)
    excluded = 0
    unknown_mechanism = 0
    for row in rows:
        if row['mechanism_class'] == 'unknown':
            unknown_mechanism += 1
            continue
        if row.get('replay_group') is not None and row.get('replay_order') is not None:
            groups[row['replay_group']].append(row)
        else:
            excluded += 1
    result = dict(protocol='prefix-only logged-action support audit', excluded_unknown_order=excluded,
                  excluded_unknown_mechanism=unknown_mechanism,
                  reward='historical kept proxy, NOT owner acceptance', policies={})
    for policy in ('portfolio', 'sequential_refine', 'round_robin'):
        decisions = []
        for group, sequence in sorted(groups.items()):
            prefix = []
            for step, row in enumerate(sorted(sequence, key=lambda r: (r['replay_order'], r['trial_id']))):
                action = policy_action(prefix, policy, step)
                supported = action == row['mechanism_class']
                decisions.append(dict(trial_id=row['trial_id'], group=group, recommended=action,
                                      observed_ids=[p['trial_id'] for p in prefix], matched=supported,
                                      reward=row.get('historical_keep') if supported else None))
                prefix.append(row)
        matched = sum(d['matched'] for d in decisions)
        rewards = [d['reward'] for d in decisions if d['reward'] is not None]
        result['policies'][policy] = dict(decisions=decisions, matched=matched,
            unsupported=len(decisions)-matched, observed_rewards=len(rewards), wins=sum(rewards),
            conditional_keep_rate=sum(rewards)/len(rewards) if rewards else None,
            value_estimate=None)
    result['conclusion'] = ('No off-policy superiority or cost saving identified. Unsupported actions have unknown outcomes; '
        'matched subsets differ. Logged-path prefix replay is a leakage/support test, not a simulator. '
        'Sequential and round-robin baselines use the same fixed mechanism action space and one recommendation per step.')
    return result


def blank_trial(trial_id, lane, element, mechanism='unknown') -> dict[str, Any]:
    return dict(event='meta_trial', schema_version=1, event_id=trial_id+'-v1', trial_id=trial_id,
        run_id=lane, timestamp=None, lane=lane, parents=[], element=element,
        defect_id='unresolved:'+trial_id, hypothesis='Not recovered', mechanism_class=mechanism,
        parameters={}, cost=dict(gpu_seconds=None, wall_seconds=None), artifacts=[],
        metrics=dict(max_zoom_texel_density=None, crop_gate=None, sharpness=None),
        self_review=dict(status='not_recovered', notes=''), judge_verdicts=[],
        owner_reaction=dict(status='not_reviewed', receipt=None), status='completed', failure_class='unknown')


def infer_identity(row):
    # Source path identifies a lane; generic "material" is NOT proof of procedural shading.
    path = row['id'].lower()
    scene = row.get('scene') or 'unknown'
    element = scene+'-scene'
    if any(s in path for s in ('stone', 'plinth')):
        element = scene+'-stone'
    elif any(s in path for s in ('relief', 'banner')):
        element = scene+'-banner'
    elif row.get('component_lane'):
        element = scene+'-'+str(row['component_lane'])
    mechanism = 'unknown'
    if any(s in path for s in ('stone-lowpoly', 'stone-geo', 'relief-2')):
        mechanism = 'geometry'
    elif 'comic-style' in path:
        mechanism = 'layer_stack'
    else:
        classes = set(row.get('change_class', []))
        if classes and classes <= {'massing', 'mesh'}:
            mechanism = 'geometry'
        elif classes == {'lighting'}:
            mechanism = 'lighting'
    return element, mechanism


def import_history(evals):
    evals = Path(evals)
    raw, errors = read_jsonl(evals/'rounds.jsonl')
    anchors, anchor_errors = read_jsonl(evals/'owner_labels.jsonl')
    if errors or anchor_errors:
        raise ValueError('; '.join(errors+anchor_errors))
    events = []
    dataset_hash = digest(evals/'rounds.jsonl')
    for index, source in enumerate(raw):
        element, mechanism = infer_identity(source)
        row = blank_trial(source['id'], 'history', element, mechanism)
        row.update(timestamp=source.get('timestamp'), hypothesis=source.get('hypothesis') or 'Not recovered',
                   parents=[source['parent_node']] if source.get('parent_node') else [])
        row['historical_keep'] = source.get('status', {}).get('kept')
        row['cost']['wall_seconds'] = source.get('costs', {}).get('render_seconds')
        # Render seconds are elapsed renderer time, not GPU utilization seconds.
        row['cost_scope'] = 'render elapsed only; not whole trial or GPU time'
        row['artifacts'] = [{'path': x['path'], 'sha256': x['sha256']} for x in source.get('sources', [])
                            if x.get('path') and x.get('sha256')]
        row['source'] = dict(path=str(evals/'rounds.jsonl'), sha256=dataset_hash, line=index+1,
            timestamp_basis=source.get('timestamp_basis'), class_basis='path/declaration mapping; ambiguous material/coupled classes unknown',
            original_change_classes=source.get('change_class'), owner_reactions=source.get('owner_reactions', []),
            defect_adjudicated=False)
        row['historical_gates'] = source.get('gate_values', {})
        row['historical_judges'] = source.get('judge_record_ids', [])
        contexts = [x for x in source.get('raw_ledger', []) if isinstance(x.get('locator'), int)
                    and x.get('source') == source.get('score_context')]
        if contexts and source.get('evaluation_role') != 'baseline_rejudge':
            row['replay_group'] = contexts[0]['source']
            row['replay_order'] = contexts[0]['locator']
        events.append(row)
    return events, anchors


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix+'.new')
    temporary.write_text(json.dumps(value, indent=2, allow_nan=False)+'\n')
    temporary.replace(path)


def import_reports(process, events):
    """Index every requested report; do not count an already represented report twice."""
    represented = {a['path'] for r in events for a in r['artifacts']}
    paths = sorted(set(list((process/'night-v2').glob('*/REPORT.md'))+
                       list((process/'fidelity-zoom').glob('REPORT.md'))+
                       list((process/'ai-texture-paint').glob('REPORT.md'))))
    index, additions = [], []
    for path in paths:
        receipt = dict(path=str(path), sha256=digest(path))
        linked = [r['trial_id'] for r in events if any(a['path'] == str(path) for a in r['artifacts'])]
        index.append(dict(**receipt, trial_ids=linked, interpretation='report evidence, not owner approval'))
        if str(path) not in represented:
            trial_id = 'report:'+str(path.relative_to(process))
            element, mechanism = infer_identity(dict(id=str(path), scene='night', change_class=[]))
            row = blank_trial(trial_id, 'report-priors', element, mechanism)
            row['hypothesis'] = 'Report-level prior; see exact receipt, subtrials not reconstructed'
            row['artifacts'] = [receipt]
            row['source'] = dict(path=str(path), sha256=receipt['sha256'], evidence_only=True)
            additions.append(row)
    return additions, index


def adapt_lane(raw, path, line):
    if raw.get('event') == 'meta_trial':
        return raw
    # Explicit adapter for two already-running lanes; never mutate their source log.
    lane = Path(path).stem
    if lane not in ('banner-generator', 'layer-stack') or not raw.get('trial_id'):
        raise ValueError('unsupported intake record; use EVENTS.md')
    aliases = {'space-filling-vector':'generated_vector', 'reaction-diffusion-contour':'generated_vector',
               'warped-spanning-tree':'generated_vector', 'snapped-flow-vector':'generated_vector',
               'masked_material_layer_composition':'layer_stack'}
    element = {'banner':'night-banner', 'stone':'night-stone', 'both':'night-banner-and-stone'}.get(raw.get('element'), raw.get('element'))
    mechanism = aliases.get(raw.get('mechanism_class'), 'unknown')
    row = blank_trial(raw['trial_id'], lane, element, mechanism)
    row['event_id'] = raw['trial_id']+'-'+hashlib.sha256(json_text(raw).encode()).hexdigest()[:16]
    row['parents'] = [raw['parent']] if raw.get('parent') else []
    row['defect_id'] = raw.get('defect_id') or row['defect_id']
    row['hypothesis'] = raw.get('hypothesis') or row['hypothesis']
    row['parameters'] = raw.get('params', {})
    row['cost']['wall_seconds'] = raw.get('cost_s')
    row['artifacts'] = raw.get('artifacts', [])
    row['metrics'].update(raw.get('metrics', {}))
    row['self_review'] = dict(status='imported', notes=str(raw.get('self_review', '')))
    row['status'] = 'pending'  # rendered/technical_verified is not an adjudicated outcome
    row['source'] = dict(path=str(path), line=line, adapter='legacy-live-v1', raw=raw,
                         alias_basis='explicit adapter table; original tokens retained verbatim',
                         unknown_timestamp=True)
    return row


def verify_artifacts(rows):
    checked = {}
    for row in rows:
        checks = []
        for artifact in row['artifacts']:
            key = (artifact['path'], artifact['sha256'])
            if key not in checked:
                path = Path(artifact['path'])
                try:
                    actual = digest(path) if path.is_file() else None
                    checked[key] = dict(path=str(path), expected_sha256=artifact['sha256'], actual_sha256=actual, ok=actual==artifact['sha256'])
                except OSError as exc:
                    checked[key] = dict(path=str(path), ok=False, error=str(exc))
            checks.append(checked[key]['ok'])
        row['artifacts_verified'] = bool(checks) and all(checks)
    return list(checked.values())


OWNER_VERDICTS = ('accept', 'reject', 'maybe', 'lock', 'direction')


def validate_chat_source(label):
    for key in ('quote', 'aspect'):
        if not isinstance(label.get(key), str) or not label[key].strip():
            raise ValueError('missing chat '+key)
    receipt = label.get('source_receipt')
    if not isinstance(receipt, dict) or any(not isinstance(receipt.get(k), str) or not receipt[k].strip()
            for k in ('kind', 'path', 'session_id', 'message_id')):
        raise ValueError('invalid source_receipt')
    if label.get('mapping_confidence') not in ('high', 'medium', 'low'):
        raise ValueError('invalid mapping_confidence')
    if not isinstance(label.get('mapping_evidence'), list):
        raise ValueError('mapping_evidence must be a list')
    if 'defect_id' not in label or (label['defect_id'] is not None
            and (not isinstance(label['defect_id'], str) or not label['defect_id'].strip())):
        raise ValueError('defect_id must be a string or null')


def validate_owner_label(label, trials):
    """Validate evidence at intake without inventing a trial binding or rating."""
    if not isinstance(label, dict) or label.get('event') != 'owner_label' or (type(label.get('schema_version')) is not int or label['schema_version'] != 1):
        raise ValueError('unsupported owner label schema')
    for key in ('event_id', 'element', 'timestamp'):
        if not isinstance(label.get(key), str) or not label[key].strip():
            raise ValueError('missing owner label '+key)
    chat = label.get('source') == 'chat-backfill'
    if (label.get('source'), label.get('status')) not in (('owner-ui', 'confirmed'), ('chat-backfill', 'backfilled')):
        raise ValueError('unsupported owner label source/status')
    if label.get('verdict') not in OWNER_VERDICTS:
        raise ValueError('invalid owner verdict')
    if 'judged_on' in label and label['judged_on'] not in ('look', 'clear', 'both'):
        raise ValueError('invalid judged_on')
    if 'aspect' in label and (not isinstance(label['aspect'], str) or not label['aspect'].strip()):
        raise ValueError('invalid aspect')
    stars = label.get('stars')
    if chat:
        validate_chat_source(label)
        if 'stars' not in label or stars is not None:
            raise ValueError('chat stars must be null')
    elif stars is None and label.get('confirmed_from'):
        validate_chat_source(label)
        if not isinstance(label['confirmed_from'], str) or not label['confirmed_from'].strip():
            raise ValueError('invalid confirmed_from')
        if not isinstance(label.get('source_timestamp'), str):
            raise ValueError('source_timestamp must be a UTC timestamp')
        source_stamp = datetime.fromisoformat(label['source_timestamp'].replace('Z', '+00:00'))
        if source_stamp.utcoffset() is None or source_stamp.utcoffset().total_seconds() != 0:
            raise ValueError('chat source timestamp requires UTC')
    elif type(stars) is not int or not 1 <= stars <= 5:
        raise ValueError('stars must be 1..5, or null when confirming chat evidence')
    if not isinstance(label.get('note', ''), str) or len(label.get('note', '')) > 12000:
        raise ValueError('invalid note')
    scope = label.get('scope', 'trial')
    if scope not in ('trial', 'component', 'element'):
        raise ValueError('invalid label scope')
    if chat and 'scope' not in label:
        raise ValueError('missing chat scope')
    stamp = datetime.fromisoformat(label['timestamp'].replace('Z', '+00:00'))
    if stamp.utcoffset() is None or (chat and stamp.utcoffset().total_seconds() != 0):
        raise ValueError('owner timestamp requires timezone; chat requires UTC')
    tid = label.get('trial_id')
    if 'trial_id' not in label or (tid is None and scope != 'element'):
        raise ValueError('null trial_id requires element scope')
    row = None
    if tid is not None:
        if not isinstance(tid, str):
            raise ValueError('invalid trial_id')
        row = trials.get(tid)
        if not row or row.get('source', {}).get('evidence_only'):
            raise ValueError('owner label must identify a real trial')
        if row['element'] != label['element']:
            raise ValueError('owner element does not match trial')
    pair = label.get('pairwise')
    if pair is not None:
        if not isinstance(pair, dict) or pair.get('preference') not in ('candidate', 'other', 'tie'):
            raise ValueError('invalid pairwise preference')
        other_id = pair.get('other_trial_id')
        other = trials.get(other_id) if isinstance(other_id, str) else None
        if not row or not other or other['trial_id'] == row['trial_id'] or other.get('source', {}).get('evidence_only'):
            raise ValueError('pairwise requires another real trial')
    json_text(label)


def reduce_owner_labels(rows, labels):
    trials = {r['trial_id']: r for r in rows}
    history, effective, errors, seen = [], {}, [], {}
    sources = {l.get('event_id'): l for l in labels if isinstance(l, dict)
               and isinstance(l.get('event_id'), str) and l.get('source') == 'chat-backfill'}
    for label in labels:
        try:
            validate_owner_label(label, trials)
            if label.get('source') == 'owner-ui' and label.get('confirmed_from'):
                original = sources.get(label['confirmed_from'])
                if original is None:
                    raise ValueError('Unknown chat confirmation source')
                validate_owner_label(original, trials)
                for key in ('trial_id', 'element', 'quote', 'source_receipt', 'scope', 'aspect',
                            'defect_id', 'mapping_confidence', 'mapping_evidence'):
                    if label.get(key) != original.get(key):
                        raise ValueError('Confirmation changed source '+key)
                if label.get('source_timestamp') != original['timestamp']:
                    raise ValueError('Confirmation changed source timestamp')
            encoded = json_text(label)
            if label['event_id'] in seen:
                if seen[label['event_id']] != encoded:
                    raise ValueError('owner event_id conflict '+label['event_id'])
                continue
            seen[label['event_id']] = encoded
            history.append(copy.deepcopy(label))
            key = (label['element'], label['trial_id'], label.get('aspect', 'overall'))
            if label['trial_id'] is None:
                key += (label.get('confirmed_from') or label['event_id'],)
            previous = effective.get(key)
            if previous is None or label['source'] == 'owner-ui' or previous['source'] != 'owner-ui':
                effective[key] = copy.deepcopy(label)
        except (ValueError, TypeError, KeyError) as exc:
            errors.append('owner label: '+str(exc))
    return history, effective, errors


def count_owner_aspects(labels):
    counts = {}
    for label in labels:
        aspect = label.get('aspect', 'overall')
        bucket = counts.setdefault(aspect, {v: 0 for v in OWNER_VERDICTS})
        bucket[label['verdict']] += 1
    return counts


def owner_evidence_summary(rows, labels):
    history, effective, errors = reduce_owner_labels(rows, labels)
    unbound = [label for label in effective.values() if label['trial_id'] is None]
    elements = sorted({label['element'] for label in unbound})
    return dict(history=history, unbound_labels=unbound, errors=errors,
        element_only={element: count_owner_aspects(l for l in unbound if l['element'] == element)
                      for element in elements})


def apply_owner_labels(rows, labels, receipt_path):
    rows = copy.deepcopy(rows)
    history, effective, errors = reduce_owner_labels(rows, labels)
    for row in rows:
        if 'owner_reaction_before_ui' in row:
            row['owner_reaction'] = copy.deepcopy(row['owner_reaction_before_ui'])
        for key in ('owner_label_history', 'owner_label', 'owner_labels_by_aspect'):
            row.pop(key, None)
        bound = [l for l in history if l['trial_id'] == row['trial_id']]
        active = {key[2]: label for key, label in effective.items() if key[1] == row['trial_id']}
        if not bound:
            continue
        row.setdefault('owner_reaction_before_ui', copy.deepcopy(row['owner_reaction']))
        row['owner_label_history'] = bound
        row['owner_labels_by_aspect'] = active
        active_ids = {l['event_id'] for l in active.values()}
        ordered = [l for l in bound if l['event_id'] in active_ids]
        row['owner_label'] = copy.deepcopy(ordered[-1])
        trial_labels = [l for l in ordered if l.get('scope', 'trial') == 'trial']
        if trial_labels:
            label = trial_labels[-1]
            row['owner_reaction'] = dict(
                status={'accept': 'approved', 'reject': 'rejected'}.get(label['verdict'], 'uncertain'),
                receipt=str(receipt_path)+'#'+label['event_id'])
    return rows, errors


def ingest(data, evals=None):
    data = Path(data)
    if evals is not None:
        events, anchors = import_history(evals)
        additions, reports = import_reports(Path(evals).parents[1], events)
        # Content-addressed imports are append-only and idempotent across refreshes.
        target = data/'events/history.jsonl'
        target.parent.mkdir(parents=True, exist_ok=True)
        existing, errors = read_jsonl(target)
        if errors:
            raise ValueError('; '.join(errors))
        ids = {r['event_id'] for r in existing}
        with target.open('a') as f:
            for row in events+additions:
                token = hashlib.sha256(json_text(row).encode()).hexdigest()[:16]
                row['event_id'] = row['trial_id']+'-'+token
                if row['event_id'] not in ids:
                    f.write(json_text(row)+'\n')
                    ids.add(row['event_id'])
        write_json(data/'owner-anchors.json', anchors)
        write_json(data/'report-sources.json', reports)
    events, errors, superseded, labels = [], [], [], []
    for path in sorted((data/'events').glob('*.jsonl')):
        rows, issues = read_jsonl(path)
        if path.name == 'owner.jsonl':
            labels.extend(rows)
            errors.extend(issues)
            continue
        native_ids = set()
        for row in rows:
            if row.get('event') == 'meta_trial':
                try:
                    validate_trial(row)
                    native_ids.add(row['trial_id'])
                except ValueError:
                    pass
        for line, row in enumerate(rows, 1):
            if row.get('event') != 'meta_trial' and row.get('trial_id') in native_ids:
                superseded.append(dict(path=str(path), line=line, trial_id=row['trial_id'],
                                       reason='formal native event supersedes partial legacy intake', raw=row))
                continue
            try:
                events.append(adapt_lane(row, path, line))
            except (ValueError, KeyError, TypeError) as exc:
                errors.append(f'{path}:{line}: {exc}')
        errors.extend(issues)
    trials, issues = materialize(events)
    errors.extend(issues)
    trials, issues = apply_owner_labels(trials, labels, data/'events/owner.jsonl')
    write_json(data/'owner-evidence.json', owner_evidence_summary(trials, labels))
    write_json(data/'superseded-intake.json', superseded)
    errors.extend(issues)
    artifact_receipts = verify_artifacts(trials)
    write_json(data/'artifact-verification.json', artifact_receipts)
    known = {r['trial_id'] for r in trials}
    missing = sorted({parent for r in trials for parent in r['parents'] if parent not in known})
    write_json(data/'ledger.json', trials)
    write_json(data/'ingest.json', dict(timestamp=now(), events=len(events), trials=len(trials),
                                       errors=errors, unresolved_parents=missing))
    return trials, errors


def recipe_index(rows, calibrations, data, integrity_ok=True):
    cards = []
    for row in rows:
        if not row.get('recipe'):
            continue
        recipe = row['recipe']
        script = Path(recipe['script_path'])
        card = dict(id=row['trial_id'], element=row['element'], mechanism_class=row['mechanism_class'],
                    status='qualified' if eligible_recipe(row, calibrations) else 'candidate',
                    inputs=recipe.get('inputs', {}), parameters=recipe.get('parameters', row['parameters']),
                    script_path=str(script), script_sha256=digest(script) if script.is_file() else None,
                    entrypoint=recipe.get('entrypoint', 'apply'), evidence=row['artifacts'],
                    failures=recipe.get('failure_notes', []), source_trial=row['trial_id'])
        if not script.is_file():
            card['status'] = 'blocked_missing_script'
        if not integrity_ok:
            card['status'] = 'blocked_ledger_integrity'
        name = hashlib.sha256(row['trial_id'].encode()).hexdigest()[:16]+'.json'
        write_json(data/'recipes'/name, card)
        cards.append(card)
    write_json(data/'recipes/index.json', cards)
    return cards


def refresh(data, evals=None):
    data = Path(data)
    rows, errors = ingest(data, evals)
    return publish_materialized(data, rows, errors)


def publish_materialized(data, rows, errors):
    """Publish derived outputs from a validated snapshot, without re-importing lanes."""
    data = Path(data)
    registry = data/'calibration.json'
    calibrations = json.loads(registry.read_text()).get('registry', {}) if registry.exists() else {}
    labels, label_errors = read_jsonl(data/'events/owner.jsonl')
    owner_evidence = owner_evidence_summary(rows, labels)
    write_json(data/'owner-evidence.json', owner_evidence)
    errors = list(dict.fromkeys(errors + label_errors + owner_evidence['errors']))
    payoffs = learn(rows, calibrations)
    replay_result = replay(rows)
    recipes = recipe_index(rows, calibrations, data, integrity_ok=not errors)
    elements = sorted(set(r['element'] for r in rows) | set(owner_evidence['element_only']) | {'night-banner', 'night-stone'})
    plans = {element: plan(rows, element, calibrations) for element in elements}
    if errors:
        for value in plans.values():
            value.update(batch=[], blocked='Ledger incomplete/invalid; repair before dispatch', errors=errors)
    for element, value in plans.items():
        safe = ''.join(c if c.isalnum() or c in '-_' else '_' for c in element)
        write_json(data/('next-'+safe+'.json'), value)
    write_json(data/'payoffs.json', payoffs)
    write_json(data/'replay.json', replay_result)
    summary = dict(generated_at=now(), record_count=len(rows),
        trial_count=sum(not r.get('source', {}).get('evidence_only') for r in rows),
        evidence_document_count=sum(bool(r.get('source', {}).get('evidence_only')) for r in rows),
        historical_trial_count=sum(r['lane']=='history' for r in rows),
        live_trial_count=sum(r['lane'] not in ('history','report-priors','curated-priors') for r in rows),
        owner_accept_observations=sum(owner_outcome(r) is not None for r in rows),
        qualified_judge_observations=sum(judge_outcome(r, calibrations) is not None for r in rows),
        recipe_count=len(recipes), qualified_recipe_count=sum(c['status'] == 'qualified' for c in recipes), errors=errors)
    write_json(data/'summary.json', summary)
    with (data/'polls.jsonl').open('a') as log:
        log.write(json_text(summary)+'\n')
    def block(value):
        return '<pre>'+html.escape(json.dumps(value, indent=2))+'</pre>'
    table = '<table><tr><th>Element / mechanism</th><th>Trials</th><th>Owner α, β</th><th>Judge α, β</th><th>Historical keep α, β (not acceptance)</th><th>Wall seconds</th></tr>'
    for element, mechanisms in payoffs.items():
        for mechanism, stats in mechanisms.items():
            cells = [element+' / '+mechanism, stats['trials']]
            for field in ('owner_accept', 'judge_win', 'historical_keep'):
                p = stats[field]
                cells.append(f"{p['alpha']}, {p['beta']} (n={p['n']}; 95% {p['interval95'][0]:.2f}–{p['interval95'][1]:.2f})")
            cells.append(stats['wall_seconds_mean'])
            table += '<tr>'+''.join('<td>'+html.escape(str(c))+'</td>' for c in cells)+'</tr>'
    table += '</table>'
    tree = [{'trial_id':r['trial_id'], 'parents':r['parents'], 'mechanism':r['mechanism_class'],
             'status':r['status'], 'owner':r['owner_reaction']['status']} for r in rows]
    learned = ('The archive supports typed failures and representation portfolios, not a validated scheduler advantage. '
               'Historical kept decisions are separate from owner approval. Uncalibrated judge votes do not train acceptance. '
               'Two failures trigger a checkpoint/switch, not an automatic stop. Unknown source density is not PASS.')
    document = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Blender meta-loop</title><style>body{font:15px system-ui;background:#15191c;color:#edf0eb;margin:3rem;max-width:1500px}h1,h2{color:#bed6ba}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#20272a;padding:1rem}td,th{padding:.6rem;border-bottom:1px solid #394148;text-align:left}a{color:#b9d9ef}details{margin:1rem 0}</style><h1>Blender meta-learning loop</h1>'
    document += '<p>Local experiment planner. Nothing here is production approval.</p>'+block(summary)
    document += '<h2>What the loop learned</h2><p>'+html.escape(learned)+'</p>'
    document += '<h2>Next portfolio</h2>'+block({k: plans[k] for k in ('night-banner','night-stone')})
    document += '<h2>Payoff by mechanism</h2>'+table
    document += '<h2>Replay qualification</h2>'+block({**replay_result,'policies':{k:{a:b for a,b in v.items() if a!='decisions'} for k,v in replay_result['policies'].items()}})
    document += '<h2>Recipe cards</h2>'+block(recipes)+'<details><summary>Trial tree</summary>'+block(tree)+'</details>'
    document += '<p><a href="REPORT.md">Report</a> · <a href="EVENTS.md">Live contract</a> · <a href="ledger.json">Ledger</a> · <a href="calibration.json">Judge calibration</a></p></html>'
    (data/'index.html').write_text(document)
    write_report(data, rows, summary, plans, replay_result, recipes)
    return summary


def write_report(data, rows, summary, plans, replay_result, recipes):
    """Describe this snapshot only; historical case studies belong in receipts."""
    lines = ['# Meta-learning report', '', 'Updated: '+summary['generated_at'], '',
             'Owner acceptance is trial scoped. Component and element feedback remains descriptive evidence. '
             'Recommendations do not authorize scene or recipe promotion.', '']
    for title, value in (('Snapshot', summary), ('Next batch', plans),
                         ('Payoffs', json.loads((data/'payoffs.json').read_text())), ('Replay', replay_result), ('Recipes', recipes)):
        lines += ['## '+title, '', '```json', json.dumps(value, indent=2, allow_nan=False), '```', '']
    lines += ['## Limits', '',
              'Unknown costs, unbound labels and unsupported replay actions remain unknown. '
              'Qualified native image evidence and explicit owner decisions are required for promotion. '
              'Read the event log and source receipts before interpreting descriptive counts.', '']
    (data/'REPORT.md').write_text('\n'.join(lines))


def calibrate(records) -> dict[str, Any]:
    # One valid first replicate per family/setup. Repeated votes are not N owners.
    cells = {(r['pair_id'], r['rubric']): r for r in records
             if r.get('valid') and r.get('evidence') == 'both' and r.get('replicate') == 1}
    families = sorted({family for family, rubric in cells})
    folds = []
    for heldout in families:
        training = [f for f in families if f != heldout]
        scores = {rubric: sum(bool(cells.get((f, rubric), {}).get('agreement')) for f in training)
                  for rubric in ('brief','plain')}
        selected = max(('brief','plain'), key=lambda rubric: scores[rubric])
        record = cells.get((heldout, selected))
        folds.append(dict(heldout_family=heldout, training_families=training,
                          selected_rubric=selected, training_correct=scores,
                          agreement=record.get('agreement') if record else None,
                          result_id=record.get('id') if record else None))
    evaluated = [f for f in folds if f['agreement'] is not None]
    correct = sum(bool(f['agreement']) for f in evaluated)
    brief = [r for (family, rubric),r in cells.items() if rubric == 'brief']
    return dict(protocol_id='brief-aware-v1', folds=folds,
        heldout_agreement=dict(correct=correct, n=len(evaluated), rate=correct/len(evaluated) if evaluated else None,
                               posterior=posterior(correct,len(evaluated)-correct)),
        fixed_brief_agreement=dict(correct=sum(bool(r['agreement']) for r in brief), n=len(brief)),
        prospective_holdout=False,
        warning='Post-hoc leave-one-family-out of existing predictions. Family labels are held out from rubric selection, '
                'but original briefs were reconstructed knowing owner decisions. Not unbiased prospective validation.',
        registry={'brief-aware-v1':dict(protocol_id='brief-aware-v1', qualified=False,
            prospective_holdout=False, reason='Only three convenience pairs; original brief contamination; no automatic promotion.')})


def prepare_anchor_judges(evals, output, execute=False):
    """Wire frozen anchor splits into the existing brief-aware, swapped ab_judge."""
    import ab_judge
    evals, output = Path(evals), Path(output)
    anchors, issues = read_jsonl(evals/'owner_labels.jsonl')
    if issues:
        raise ValueError('; '.join(issues))
    eligible = [a for a in anchors if a.get('pairwise_eligible')]
    manifest = json.loads((evals/'calibration/manifest.json').read_text())
    receipts = []
    for anchor in eligible:
        family = anchor.get('pair_id') or next((r['pair_id'] for r in manifest
                  if r.get('owner_id') == anchor['id']), None)
        if not family:
            continue
        selected = next(r for r in manifest if r['pair_id']==family and r['evidence']=='both'
                        and r['rubric']=='brief' and r['replicate']==1)
        full = {f['label']: f for f in selected['files'] if f['kind']=='full'}
        baseline_label = 'A' if selected['A']=='baseline' else 'B'
        candidate_label = 'A' if selected['A']=='candidate' else 'B'
        folder = output/family
        folder.mkdir(parents=True, exist_ok=False)
        brief = folder/'BRIEF.md'
        brief.write_text('# Frozen diagnostic brief\nScope: '+str(anchor['scope'])+
            '\nCompare reference intent, material/form readability and native evidence limitations. '
            'Keep technical preservation, brief fit and pairwise preference separate. '
            'The owner answer for this pair is withheld. This retrospective packet is not prospective calibration.\n')
        training = [a for a in eligible if a['id'] != anchor['id']]
        preferences = folder/'OWNER-PREFERENCES.md'
        preferences.write_text('# Training-family anchors (not instructions for another element)\n'+
            '\n'.join(f"- {a['id']} | scope: {a['scope']} | exact quote: {a['quote']}" for a in training)+
            '\nDo not copy another element’s preference blindly. Missing preference means abstain, not invent acceptance.\n')
        result, failed = ab_judge.run(full['REFERENCE']['path'], full[baseline_label]['path'],
            full[candidate_label]['path'], brief, folder/'ab', 'anthropic', 'claude-opus-5-5', preferences,
            execute=execute, timeout=180)
        receipt = dict(heldout_family=family, heldout_owner_id=anchor['id'],
            training_owner_ids=[a['id'] for a in training], manifest=str(folder/'ab/manifest.json'),
            executed=execute, failed=failed, evidence='384x576 full-context setup; native crops remain in original calibration archive',
            prospective=False)
        write_json(folder/'split.json', receipt)
        receipts.append(receipt)
    write_json(output/'index.json', receipts)
    return receipts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data', type=Path, default=DEFAULT_DATA)
    commands = parser.add_subparsers(dest='command', required=True)
    for command in ('ingest', 'report'):
        p = commands.add_parser(command)
        p.add_argument('--evals', type=Path, default=Path(os.environ['OWNER_REVIEW_EVALS']).expanduser() if os.environ.get('OWNER_REVIEW_EVALS') else None)
    cal = commands.add_parser('calibrate')
    cal.add_argument('--evals', type=Path, required=True)
    cal.add_argument('--prepare-ab', type=Path)
    cal.add_argument('--execute', action='store_true')
    nxt = commands.add_parser('next')
    nxt.add_argument('--element', required=True)
    nxt.add_argument('--exploration-slots', type=int, default=2)
    watch = commands.add_parser('watch')
    watch.add_argument('--interval', type=float, default=900)
    watch.add_argument('--polls', type=int, default=17)
    watch.add_argument('--evals', type=Path, default=Path(os.environ['OWNER_REVIEW_EVALS']).expanduser() if os.environ.get('OWNER_REVIEW_EVALS') else None)
    args = parser.parse_args()
    if args.command == 'calibrate':
        records, errors = read_jsonl(args.evals/'calibration/results.jsonl')
        if errors:
            parser.error('; '.join(errors))
        result = calibrate(records)
        result['source'] = {'path':str(args.evals/'calibration/results.jsonl'), 'sha256':digest(args.evals/'calibration/results.jsonl')}
        write_json(args.data/'calibration.json', result)
        if args.prepare_ab:
            result['ab_packets'] = prepare_anchor_judges(args.evals, args.prepare_ab, args.execute)
        print(json.dumps(result, indent=2))
    elif args.command == 'next':
        rows, errors = ingest(args.data)
        if errors:
            parser.exit(2, 'Ledger incomplete/invalid; repair before dispatch: '+json.dumps(errors)+'\n')
        path = args.data/'calibration.json'
        registry = json.loads(path.read_text()).get('registry', {}) if path.exists() else {}
        print(json.dumps(plan(rows, args.element, registry, args.exploration_slots), indent=2))
        if errors:
            print(json.dumps(errors), file=sys.stderr)
    elif args.command == 'watch':
        if not (0 < args.interval <= 900 and 1 <= args.polls <= 17):
            parser.error('watch is bounded: interval (0,900], polls 1..17')
        for poll in range(args.polls):
            print(json.dumps(dict(poll=poll, **refresh(args.data, args.evals))), flush=True)
            if poll+1 < args.polls:
                time.sleep(args.interval)
    else:
        print(json.dumps(refresh(args.data, args.evals), indent=2))


if __name__ == '__main__':
    main()
