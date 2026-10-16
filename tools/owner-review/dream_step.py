"""Archive-grounded experiment proposals, not a renderer or acceptance learner."""
from collections import Counter, defaultdict
from datetime import datetime
import hashlib
import json
import re
import statistics


def scope(row):
    # Analytical subelement only: never rewrite producer identity.
    if row['element'] == 'night-banner' and (row['lane'] == 'banner-greenery'
            or row['defect_id'] == 'banner-greenery-coverage'):
        return 'night-banner-greenery'
    return row['element']


def observation_time(row):
    try:
        dt = datetime.fromisoformat(row['timestamp'].replace('Z', '+00:00'))
        return dt.timestamp() if dt.tzinfo else None
    except (TypeError, ValueError, KeyError, AttributeError):
        return None


def outcome(row, calibrations):
    """Diagnostic nonwin is separate from calibrated payoff/owner rejection."""
    from meta_loop import owner_outcome, judge_outcome
    if (row.get('source', {}).get('evidence_only') or row['status'] != 'completed'
            or row['self_review'].get('status', '').lower() == 'control'
            or row['metrics'].get('mode') == 'CLEAR' or row['metrics'].get('technical_delivery')):
        return None, 'not a completed visual experiment'
    value = owner_outcome(row)
    if value is not None:
        return value, 'receipted owner decision'
    value = judge_outcome(row, calibrations)
    if value is not None:
        return value, 'qualified judge decision'
    if row.get('failure_class') in ('implementation', 'resource', 'evidence', 'scope'):
        return None, 'nonvisual failure'
    if row.get('source', {}).get('defect_adjudicated') and row.get('historical_keep') is not None:
        return int(row['historical_keep']), 'adjudicated historical defect outcome'
    if not row.get('artifacts_verified'):
        return None, 'unverified artifacts'
    metrics = row['metrics']
    if (metrics.get('max_zoom_gate') == 'fail' and metrics.get('max_zoom_evidence')):
        return 0, 'verified hard gate failure (not owner rejection)'
    if not any(a['path'].lower().endswith(('.png', '.jpg', '.exr', '.webp')) for a in row['artifacts']):
        return None, 'no rendered experiment evidence'
    review = row['self_review']
    notes = review.get('notes', '').lower()
    if metrics.get('crop_gate') == 'fail':
        return 0, 'producer crop-gate failure (diagnostic only)'
    if row.get('failure_class') == 'mechanism':
        return 0, 'producer mechanism failure (diagnostic only)'
    if review.get('status', '').lower() in ('reject', 'rejected') or notes.startswith('reject '):
        return 0, 'producer appearance rejection (diagnostic only)'
    if str(metrics.get('reference_match', '')).lower().startswith('residual mismatch'):
        return 0, 'explicit residual reference mismatch (diagnostic only)'
    return None, 'unknown; HOLD alone is not failure'


def stuck(rows, calibrations):
    groups = defaultdict(list)
    for row in rows:
        if not row['defect_id'].startswith('unresolved:'):
            groups[(scope(row), row['defect_id'])].append(row)
    result = []
    for (element, defect), group in sorted(groups.items()):
        failures, bases, configurations = [], {}, {}
        ordered = sorted((r for r in group if observation_time(r) is not None),
                         key=lambda r: (observation_time(r), r['trial_id']))
        for row in ordered:
            value, basis = outcome(row, calibrations)
            if value == 1:
                failures, bases, configurations = [], {}, {}
            elif value == 0:
                configuration = json.dumps([row['mechanism_class'], row['parameters']], sort_keys=True) if row['parameters'] else row['trial_id']
                scene = tuple(sorted(a['sha256'] for a in row['artifacts'] if a['path'].endswith('.blend'))) or None
                seen = configurations.get(configuration, set())
                if not seen or (scene is not None and None not in seen and scene not in seen):
                    failures.append(row['trial_id'])
                    bases[row['trial_id']] = basis
                    configurations.setdefault(configuration, set()).add(scene)
        if len(failures) >= 2:
            result.append(dict(element=element, defect_id=defect, failed_trials=failures,
                consecutive_nonwins=len(failures), evidence_basis=bases,
                source_elements=sorted({r['element'] for r in group}),
                unknown_trial_ids=[r['trial_id'] for r in group
                    if observation_time(r) is None or outcome(r, calibrations)[0] is None],
                action='dream_then_owner_checkpoint',
                caveat='Consecutive assessed nonwins, not necessarily consecutive attempts; unknowns excluded.'))
    return result


# Fixed proposal vocabulary, not inferred visual truth or permission to edit.
# Each tuple is (technique, schema mechanism, hypothesis, coupon, signal, risk).
TAXONOMY = {
    'stone': [
        ('target-conditioned-pebble-scatter', 'geometry',
         'Replace the contiguous cell tessellation with overlapping irregular pebble instances, positioned from a target-projected front-face mask; model real depth, not another crown-height tweak.',
         'One front-face strip with a glyph edge: target-mask scatter versus the archived mosaic, fixed camera/material/light.',
         'Irregular spacing and occlusion in CLEAR without mirrored tile rows; glyph silhouette unchanged in LOOK.',
         'Geometry permission required; overlap can bury lettering and change support silhouette.'),
        ('separate-stone-wet-film', 'layer_stack',
         'Decouple dry faceted body, sparse physical glints and wet-film roughness instead of increasing whole-cell coat.',
         'One front/top junction; freeze geometry and split roughness/coat masks with a no-change control.',
         'Small separated wet glints rather than broad facet flashes; no loss of pebble relief.',
         'A material layer cannot repair shallow geometry; inspect CLEAR first.'),
        ('source-bound-ai-wear', 'ai_udim',
         'Use AI-authored wear only as a UV-bound residual over real pebble geometry, never as replacement relief or a screen paint-over.',
         'One approved wear tile with source-density audit, geometry unchanged.',
         'Localized weathering without seams or fictitious high-resolution anatomy.',
         'Requires representation permission; source coverage may fail native density.'),
        ('regional-traced-fractures', 'traced_vector',
         'Trace observed nonperiodic fracture segments by region rather than repeating a global cell network.',
         'One native front patch, compare isolated traced grooves against the existing Voronoi gaps.',
         'No honeycomb connectivity or wire-network highlights at hero and native scale.',
         'Tracing cannot recover target detail absent from the source.')],
    'greenery': [
        ('semantic-target-mask-scatter', 'geometry',
         'Split the existing target envelope into curl, crown and column masks; scatter oriented branching tufts by region instead of merely increasing global coverage.',
         'One curl/column junction with a face exclusion mask; keep C material balance and change placement only.',
         'Better regional target overlap with zero new face occlusion; no bead-like clumps in CLEAR.',
         'The coarse target envelope already exists; this must add regional structure, not repeat C density parameters.'),
        ('branch-connected-growth', 'geometry',
         'Replace independent spherical clumps with connected tapered stems carrying heterogeneous leaves and moss fans.',
         'One 3D curl silhouette, a few branch chains versus the existing clump coupon.',
         'Continuous branching silhouette rather than bead necklaces in LOOK and CLEAR.',
         'Can become wiry or obscure carving; preserve the approved exclusion boundary.'),
        ('moss-ivy-response-stack', 'layer_stack',
         'Separate dark moss cushion response from sparse ivy leaf response while preserving region-specific geometry.',
         'One crown coupon with independent moss/ivy masks and fixed lighting.',
         'Dark clustered moss plus readable leaf edges without a uniform green coat.',
         'Material contrast will not repair missing column coverage.'),
        ('traced-growth-skeleton', 'traced_vector',
         'Trace only visible growth centerlines, then use them as 3D placement guides rather than painting foliage.',
         'One target curl centerline projected onto the receiver, populated with real leaf instances.',
         'Correct curl direction and taper, not repeated procedural arcs.',
         'Single-view placement needs alternate-view consistency checks.')],
    'optics': [
        ('region-conditioned-background-diffusion', 'post',
         'Replace one uniform background Gaussian with a region-conditioned diffusion field while retaining I normalized-mask isolation.',
         'Reuse a saved CLEAR radiance/depth pair; compare two background regions and a foreground rim, no new full-scene render.',
         'Background transition widths approach reference while foreground rim stays uncontaminated; disclose low sample counts.',
         'Nonphysical optics; apparent edge widths are not recovered PSFs and texture/contrast confound them.'),
        ('depth-aware-layered-occlusion', 'post',
         'Split background radiance into depth layers with occlusion-aware normalized filtering rather than increasing a single blur radius.',
         'One background/robot silhouette coupon using existing depth and masks; compare against I.',
         'No bright halo or silhouette bleed, independently controllable background softness.',
         'Z cannot recover hidden surfaces; missing disocclusion information remains unknown.'),
        ('physical-aperture-control', 'post',
         'Use a matched-samples physical aperture control to isolate how much softness is optical versus inherited artwork.',
         'One f/32 control and current hybrid at the same samples/resolution; lock camera matrix and lens.',
         'Region-level blur difference without attributing carving softness to optics.',
         'Near-equal banner/background depths limit independent physical focus; requires authorized optical edits.')],
    'anatomy': [
        ('landmark-constrained-tone', 'projection_paint',
         'Reconstruct broad anatomical planes from explicit brow, cheek and jaw landmarks on the existing UV receiver before restoring engraving.',
         'A cheek/brow coupon with print disabled: current band-limited tone versus landmark-constrained broad tone.',
         'Readable anatomical planes at hero scale without claiming invented native source detail.',
         'Owner interpretation approval required; painted tone is not recovered geometry.'),
        ('region-aligned-tone-stack', 'layer_stack',
         'Keep the inherited cavity/weather graph but separate anatomical low-frequency tone from high-frequency engraving with explicit region masks.',
         'One cheek patch with tone-only, ink-only and composed controls under fixed light.',
         'Anatomy remains legible when ink is toggled; engraving does not flatten the face.',
         'Cannot recover missing high-frequency anatomy from an upscaled source.'),
        ('landmark-guided-vector-fields', 'traced_vector',
         'Guide engraving by traced anatomical landmarks instead of the smoothed tone-gradient proxy alone.',
         'One jaw/cheek boundary with observed contour guides and density kept constant.',
         'Strokes follow form without hollow outlines, cellular rings or coarse facet emphasis.',
         'Contour guides can become outline artwork; compare against the negative examples.')],
    'engraving': [
        ('regional-nested-stroke-grammar', 'traced_vector',
         'Use region-specific observed nested strokes with explicit adjacency and interruptions instead of global maze or Hilbert wallpaper.',
         'One cheek patch containing a shadow/light boundary; traced local grammar with fixed broad anatomy.',
         'Nested adjacent lines without crossings, recursive wallpaper or raster striping.',
         'Sparse source marks cannot establish exact native-detail truth.'),
        ('tone-conditioned-ink-layer', 'layer_stack',
         'Keep hero-scale ink visibility and native nested detail on separate masks; select polarity by anatomical region, not a global overlay.',
         'One cheek coupon with separate hero ink and fine-detail toggles, matched contrast.',
         'Both hero readability and native stroke separation; no muddy double screen.',
         'A prior overlay failed; component ablation is mandatory before whole-face composition.'),
        ('procedural-nonperiodic-bundles', 'procedural_shader',
         'Generate interrupted stroke bundles from a region adjacency graph rather than a continuous global path.',
         'One procedural patch with matched stroke density and no global lattice.',
         'Unequal nested bundles rather than worms, zebra stripes or uniform corridors.',
         'Authored grammar may still be stylistically wrong; needs owner exemplar approval.')],
    'general': [
        ('target-projected-regions', 'geometry', 'Drive placement from target-projected regional masks rather than a global seed.',
         'One affected region with a no-change control.', 'Improved target coverage with protected boundaries unchanged.', 'Requires scoped geometry permission.'),
        ('separate-response-layers', 'layer_stack', 'Separate form, pigment and response into independently ablated layers.',
         'One coupon with each layer toggled.', 'Identify which layer improves the stable defect.', 'Coupled interfaces may regress.'),
        ('source-bound-tracing', 'traced_vector', 'Trace observed local structure instead of extending an ungrounded global procedural family.',
         'One observed contour patch.', 'Local morphology agrees without repeated motifs.', 'Missing source detail remains unknown.')]
}


def topics(element, defect, rows):
    if 'greenery' in element or 'greenery' in defect:
        return ['greenery']
    if 'optics' in element:
        return ['optics']
    if 'stone' in element:
        return ['stone']
    if 'banner' in element:
        text = ' '.join(r['self_review'].get('notes', '')+' '+str(r['metrics'].get('appearance_gate', '')) for r in rows).lower()
        return ['engraving', 'anatomy'] if 'anatom' in text or 'form' in text else ['engraving']
    return ['general']


def parameter_similarity(a, b):
    """Shared semantic keys, numeric tolerance; metadata cannot hide a clone."""
    ignored = {'seed', 'name', 'variant', 'seconds', 'metrics', 'map_size', 'atlas'}
    def flatten(value, prefix=''):
        result = {}
        for key, val in value.items():
            if key in ignored:
                continue
            name = prefix+key
            if isinstance(val, dict):
                result.update(flatten(val, name+'.'))
            else:
                result[name] = val
        return result
    a, b = flatten(a), flatten(b)
    if not a or not b:
        return 1.0 if a == b else 0.0
    common = set(a) & set(b)
    if not common:
        return 0.0
    def similarity(x, y):
        if isinstance(x, (int, float)) and not isinstance(x, bool) and isinstance(y, (int, float)) and not isinstance(y, bool):
            return 1.0 if abs(x-y) <= .15*max(abs(x), abs(y), 1e-12) else 0.0
        return float(x == y)
    return sum(similarity(a[k], b[k]) for k in common)/min(len(a), len(b))


def partial_features(row):
    """Return exact quoted hints, never promote a partial win to acceptance."""
    notes = row['self_review'].get('notes', '')
    hints = []
    for part in re.split(r'(?<=[.;])\s+', notes):
        named = re.match(r'^([A-Z]) (?:repairs|best)\b', part)
        if named and named.group(1) not in row['trial_id'].split('-'):
            continue  # a batch note praising another variant is not this trial's win
        if re.search(r'\b(useful|improved|improves|stronger|strongest|retains|restored|closer|sharp|selected|best|repairs)\b', part, re.I):
            hints.append(dict(source='self_review.notes', quote=part))
    for key in ('coverage', 'preservation'):
        if isinstance(row['metrics'].get(key), dict):
            values = {k: v for k, v in row['metrics'][key].items() if isinstance(v, (int, float, bool))}
            if values:
                hints.append(dict(source='metrics.'+key, measured=values,
                                  caveat='A measured property, not a visual acceptance score.'))
    return hints


def schedule_replay(rows, calibrations):
    """Logged-prefix support audit; never reveal future outcomes to a controller."""
    from meta_loop import MECHANISMS, mechanism_key
    actions = tuple(m for m in MECHANISMS if m != 'unknown')
    sequences, excluded, unknown = defaultdict(list), [], []
    for row in rows:
        if row.get('source', {}).get('evidence_only') or row['status'] != 'completed':
            continue
        if observation_time(row) is None:
            excluded.append(row['trial_id'])
        elif mechanism_key(row) == 'unknown':
            unknown.append(row['trial_id'])
        else:
            sequences[(scope(row), row['defect_id'])].append(row)
    policies, gaps = {}, []
    for policy in ('breadth', 'depth', 'earlier_switch'):
        decisions = []
        for (element, defect), sequence in sorted(sequences.items()):
            prefix = []
            for row in sorted(sequence, key=lambda r: (observation_time(r), r['trial_id'])):
                # Equal timestamps are unordered peers, not an invented within-batch history.
                observed = [r for r in prefix if observation_time(r) < observation_time(row)]
                counts = Counter(mechanism_key(r) for r in observed)
                breadth = min(actions, key=lambda a: (counts[a], actions.index(a)))
                previous = mechanism_key(observed[-1]) if observed else actions[0]
                streak = 0
                for old in reversed(observed):
                    value, _ = outcome(old, calibrations)
                    if value == 1:
                        break
                    if value == 0:
                        streak += 1
                action = breadth if policy == 'breadth' or (policy == 'earlier_switch' and streak >= 2) else previous
                matched = action == mechanism_key(row)
                reward, basis = outcome(row, calibrations) if matched else (None, 'unsupported action')
                decision = dict(trial_id=row['trial_id'], element=element, defect_id=defect,
                    observed_ids=[r['trial_id'] for r in observed], recommended=action,
                    logged_mechanism=mechanism_key(row), matched=matched, reward=reward,
                    reward_basis=basis, assessed_nonwin_streak=streak)
                decisions.append(decision)
                if policy == 'earlier_switch' and streak >= 2 and action != previous:
                    gaps.append(dict(element=element, defect_id=defect, before_trial_id=row['trial_id'],
                        evidence_ids=[r['trial_id'] for r in observed], alternative=action,
                        prior_trials_in_alternative=counts[action], logged_mechanism=mechanism_key(row),
                        interpretation='Exploration opportunity under an earlier-switch rule; not proof that this branch would win.'))
                prefix.append(row)
        policies[policy] = dict(decisions=decisions, matched=sum(d['matched'] for d in decisions),
            unsupported=sum(not d['matched'] for d in decisions),
            known_rewards=sum(d['reward'] is not None for d in decisions), value_estimate=None)
    return dict(protocol='dream-prefix-support-v1', policies=policies, exploration_gaps=gaps,
        excluded_unknown_order=sorted(excluded), excluded_unknown_mechanism=sorted(unknown),
        limitation='Timestamped materialized observations only, not original-time event revision replay. No future rows enter decisions. '
                   'Matched mechanism is weak support, not identical parameters/parents. No off-policy value or GPU saving identified.')


def archive_snapshot(data):
    from meta_loop import digest
    paths = sorted((data/'events').glob('*.jsonl'))
    if (data/'calibration.json').exists():
        paths.append(data/'calibration.json')
    return [{'path': str(p), 'sha256': digest(p)} for p in paths]


def publish_portfolio(data, result):
    from meta_loop import write_json
    element = result['element']
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]*', element):
        raise ValueError('Unsafe element output name')
    # Defect-specific requests do not silently overwrite the whole-element portfolio.
    suffix = '' if result['requested_defect'] is None else '-'+hashlib.sha256(result['requested_defect'].encode()).hexdigest()[:12]
    target = data/'dream'/(element+suffix)
    write_json(target.with_suffix('.json'), result)
    lines = ['# Dream portfolio: '+element, '', result['caveat'], '',
             'Generated: '+result.get('generated_at', 'not recorded'), '', '## Stuck defects', '']
    for defect in result['stuck_defects']:
        lines += [f"- `{defect['defect_id']}`: {defect['consecutive_nonwins']} assessed nonwins; evidence: "+', '.join(defect['failed_trials'])]
    lines += ['', 'Unknown outcomes, pending work and implementation/resource/evidence failures do not establish a visual plateau.', '', '## Ranked directions', '']
    for d in result['directions']+result['reserved_directions']:
        lines += [f"### {d['rank']}. {d['technique']} — {d['kind']} / {d['mechanism_class']}", '',
            f"Defects: {', '.join(d['defect_ids'])} · topic: {d['topic']} · id: `{d['id']}` · status: **{d['status']}**", '', d['hypothesis'], '',
            '- **Why:** '+d['reason'], '- **Cheapest coupon:** '+d['cheapest_coupon_test'],
            '- **Expected signal:** '+d['expected_signal'], '- **Cost estimate:** '+json.dumps(d['cost_estimate']),
            '- **Risk:** '+d['risk'], '- **Evidence IDs:** '+', '.join(d['evidence_ids']),
            '- **Parameters:** '+json.dumps(d['parameters']), '- **Partial feature evidence:** '+json.dumps(d['partial_features']),
            '- **Start from:**']
        lines += [f"  - `{a['path']}` · SHA256 `{a['sha256']}` · verified={a['verified']} · {a['trial_id']}" for a in d['start_artifacts']]
        if d.get('recipe_card'):
            lines += ['- **Borrowed recipe card:** '+json.dumps(d['recipe_card'])]
        lines += ['']
    lines += ['## Prefix-only scheduling audit', '', result['replay']['limitation'], '',
              '| Policy | Matched mechanisms | Unsupported | Known diagnostic rewards |', '|---|---:|---:|---:|']
    for name, policy in result['replay']['policies'].items():
        lines += [f"| {name} | {policy['matched']} | {policy['unsupported']} | {policy['known_rewards']} |"]
    lines += ['', f"Earlier-switch opportunity points: {len(result['replay']['exploration_gaps'])}. Full prefix IDs and exclusions are in the JSON.", '',
              '## Withheld directions', '', '```json', json.dumps(result['suppressed'], indent=2), '```', '',
              'Archive path/hash manifest is recorded in the JSON. Recheck it before dispatch; no automatic scene edits or labels.', '']
    temporary = target.with_suffix('.md.new')
    temporary.write_text('\n'.join(lines))
    temporary.replace(target.with_suffix('.md'))


def transfer_component(topic, row):
    """Explicit compatibility rules; never transfer a donor's whole appearance."""
    from meta_loop import mechanism_key
    mechanism = mechanism_key(row)
    text = (row['self_review'].get('notes', '')+' '+json.dumps(row['parameters'])).lower()
    if topic == 'optics':
        return (5 if 'coverage' in row['metrics'] else 1,
                'regional mask isolation and protected-boundary checks, adapted to background diffusion only', 'post')
    if topic == 'greenery' and mechanism == 'geometry':
        return (5, 'bounded instance placement and protected-silhouette checks; replace stone shapes with branching foliage', 'geometry')
    if topic == 'stone' and mechanism == 'geometry':
        return (4, 'target-envelope placement and exclusion masks; replace foliage instances with deep irregular pebbles', 'geometry')
    if mechanism == 'layer_stack' and any(word in text for word in ('coat', 'pigment', 'wet', 'mask')):
        return (5, 'separated pigment, wet-coat and roughness response masks, not the donor print pattern', 'layer_stack')
    return (0, 'isolated component interface (compatibility unproven; inspect the quoted feature first)', mechanism)


def portfolio(rows, element, calibrations, defect=None):
    from meta_loop import mechanism_key
    scoped = [r for r in rows if (scope(r) == element or r['element'] == element)
              and not r.get('source', {}).get('evidence_only')]
    if not scoped:
        raise ValueError('No archive trials for element '+element)
    if defect is not None and not any(r['defect_id'] == defect for r in scoped):
        raise ValueError('Unknown exact defect ID '+defect)
    blocked = [s for s in stuck(rows, calibrations) if
               (s['element'] == element or element in s['source_elements']) and (defect is None or s['defect_id'] == defect)]
    defects = [s['defect_id'] for s in blocked] or ([defect] if defect else
               sorted({r['defect_id'] for r in scoped if not r['defect_id'].startswith('unresolved:')}))
    directions, suppressed, reserved = [], [], []
    all_ids = {r['trial_id']: r for r in rows}
    partials = [r for r in rows if r['status'] == 'completed' and r.get('artifacts_verified')
                and not r.get('source', {}).get('evidence_only') and partial_features(r)]
    awaiting_rows = [r for r in scoped if r['status'] == 'pending' or
                     (r['status'] == 'completed' and r['self_review'].get('status', '').lower() == 'pending'
                      and outcome(r, calibrations)[0] is None)]
    pending = {mechanism_key(r) for r in awaiting_rows}
    counts = Counter(mechanism_key(r) for r in scoped if r['status'] == 'completed')

    def add(kind, defect_id, topic, spec, evidence, parameters, reason, priority):
        technique, mechanism, hypothesis, coupon, signal, risk = spec
        awaiting = mechanism in pending
        if awaiting:
            suppressed.append(dict(technique=technique, reason='pending mechanism', mechanism_class=mechanism))
        failed = [r for r in scoped if r['defect_id'] == defect_id and outcome(r, calibrations)[0] == 0
                  and mechanism_key(r) == mechanism]
        nearest = max(((parameter_similarity(parameters, r['parameters']), r['trial_id']) for r in failed), default=(0, None))
        if nearest[0] >= .8:
            suppressed.append(dict(technique=technique, reason='near-duplicate failed mechanism+parameters',
                                   trial_id=nearest[1], similarity=nearest[0]))
            return
        evidence = list(dict.fromkeys(evidence))
        starts = []
        for eid in evidence:
            row = all_ids[eid]
            # Prefer reusable scenes/scripts, then diagnosis images/reports. Preserve hashes.
            artifacts = sorted(row['artifacts'], key=lambda a: (not a['path'].endswith(('.blend', '.py', '.svg', '.npy')), a['path']))
            for a in artifacts[:5]:
                starts.append(dict(**a, trial_id=eid, verified=row.get('artifacts_verified', False)))
        measured = [all_ids[e]['cost'].get('wall_seconds') for e in evidence
                    if all_ids[e]['cost'].get('wall_seconds') is not None]
        destination = reserved if awaiting else directions
        destination.append(dict(kind=kind, defect_id=defect_id, topic=topic, technique=technique,
            hypothesis=hypothesis, mechanism_class=mechanism, parameters=parameters,
            cheapest_coupon_test=coupon, expected_signal=signal, risk=risk,
            reason=reason, evidence_ids=evidence, start_artifacts=starts,
            cost_estimate=dict(wall_seconds=statistics.median(measured) if measured else None,
                gpu_seconds=None, basis='Median recorded source-trial wall time; phase-mixed planning anchor, NOT measured coupon cost.'
                if measured else 'Unknown source cost; time the isolated coupon before expansion.',
                sample_count=len(measured), proposed_budget='one isolated coupon + control; stop before full-scene render'),
            partial_features={eid: partial_features(all_ids[eid]) for eid in evidence if partial_features(all_ids[eid])},
            nearest_failed=dict(trial_id=nearest[1], similarity=nearest[0]),
            priority_score=priority, status='await_pending_mechanism' if awaiting else 'proposal_requires_scoped_permission_and_owner_checkpoint'))
        return destination[-1]

    for did in defects:
        local = [r for r in scoped if r['defect_id'] == did]
        if not local:
            continue
        evidence = [r['trial_id'] for r in local if outcome(r, calibrations)[0] == 0][-3:] or [local[-1]['trial_id']]
        for topic in topics(element, did, local):
            specs = TAXONOMY[topic]
            # Preserve meaningful representation changes even when a broad class has many trials.
            ordered = sorted(enumerate(specs), key=lambda item: (counts[item[1][1]], item[0]))
            for index, spec in ordered:
                n = counts[spec[1]]
                add('breadth', did, topic, spec, evidence,
                    {'construction': spec[0], 'regional_control': True},
                    f'{n} completed element trials in {spec[1]}; taxonomy alternative with a different construction, not a seed/scale retry.',
                    120 - 8*index - min(n, 10))
        topic = topics(element, did, local)[0]
        candidates = sorted([r for r in partials if r['trial_id'] not in evidence or scope(r)==element],
                            key=lambda r: (scope(r)!=scope(local[0]), r['lane']==local[0]['lane'], r['trial_id']))
        def feature_rank(row):
            text = ' '.join(x.get('quote', '') for x in partial_features(row)).lower()
            return (5*('strongest' in text) + 3*('selected' in text) + 2*('improved' in text)
                    + 2*('repairs' in text) + ('useful' in text))
        local_partials = sorted((r for r in candidates if r in local),
                                key=lambda r: (-feature_rank(r), r['trial_id']))
        first = local_partials[0] if local_partials else None
        if first is None:
            first = next((r for r in partials if scope(r)==scope(local[0])), None)
        other_lanes = sorted((r for r in candidates if first and r['lane'] != first['lane']),
                             key=lambda r: (scope(r)!=scope(local[0]) if topic != 'optics' else False,
                                            -transfer_component(topic, r)[0], -feature_rank(r), r['trial_id']))
        second = other_lanes[0] if other_lanes else None
        if first and second:
            ids = [first['trial_id'], second['trial_id']]
            spec = ('partial-feature-ablation', 'layer_stack',
                'Combine only the quoted useful components from '+ ' + '.join(ids)+', not their failed whole appearances.',
                'One affected patch: A component alone, B alone, A+B, and unchanged parent. Keep target, exposure and geometry fixture identical.',
                'Both quoted component signals survive without reintroducing either archived regression.',
                'Partial reviewer hints are not calibrated wins; integration and source-density may fail.')
            add('recombination', did, topic, spec, ids,
                {'construction': 'component-ablation', 'components': ids},
                'Cross-lane partial features quoted below; experimental recombination, not promotion of gated winners.', 93)
        else:
            suppressed.append(dict(defect_id=did, kind='recombination', reason='Fewer than two evidenced cross-lane partial components; do not invent them.'))
        donors = [r for r in partials if scope(r) != scope(local[0]) and r.get('recipe')]
        donors.sort(key=lambda r: (-transfer_component(topic, r)[0], mechanism_key(r) in counts,
                                   -len(partial_features(r)), r['trial_id']))
        if donors:
            donor = donors[0]
            _, component, transfer_mechanism = transfer_component(topic, donor)
            spec = ('cross-element-recipe-coupon', transfer_mechanism,
                'Borrow '+component+' from '+donor['trial_id']+' for '+topic+'; transfer the useful feature only.',
                'Import the archived recipe into a disposable receiver; check inert import, idempotence, preserved fixture and a matched coupon.',
                'The quoted donor feature transfers to this receiver without repeating its listed failure notes.',
                'Candidate recipe, not a qualified winner. Different scale, UVs and interfaces may invalidate the transfer.')
            transfer = add('recipe_transfer', did, topic, spec, [donor['trial_id']]+evidence[:1],
                {'construction': 'receiver-adapted-transfer', 'donor': donor['trial_id'], 'target_defect': did},
                'Other-element recipe with exact feature evidence; inputs/script remain in the evidence manifest.', 85)
            if transfer is not None:
                transfer['recipe_card'] = dict(donor['recipe'], source_trial=donor['trial_id'],
                                                    qualification='candidate; no automatic promotion')
        spec = ('earlier-mechanism-switch', 'unknown',
                'Reserve a breadth coupon after the second assessed nonwin rather than spending the next slot on the same construction.',
                'Run prefix-only scheduling audit before commissioning one newly scoped coupon.',
                'Identify unsupported breadth/depth opportunities, not invented outcomes or cost savings.',
                'Logged actions are not interchangeable states; no causal policy value is identified.')
        add('counterfactual', did, topic, spec, evidence,
            {'policy': 'earlier_switch', 'after_nonwins': 2},
            'Two assessed nonwins warrant an alternative schedule, not abandonment of the entire element.', 70)
    if defects:
        did = defects[0]
        local = [r for r in scoped if r['defect_id']==did]
        spec = ('wildcard-negative-space-exemplar', 'generated_vector',
            'Wildcard: invert the design problem—author one negative-space contour/occupancy exemplar from the target before choosing a surface representation.',
            'A single target-aligned silhouette/void coupon and a deliberately wrong negative example; request owner interpretation before 3D expansion.',
            'An owner-recognizable morphology that the current representation family cannot express.',
            'Speculative interpretation, no archive success claimed; not permission to alter the target or replace a render with artwork.')
        add('wildcard', did, 'wildcard', spec, [local[-1]['trial_id']],
            {'construction': 'negative-space-exemplar', 'target_locked': True},
            'Explicit diverse slot outside the repeated surface-parameter family; hypothesis only.', 60)
    def consolidate(items):
        groups = {}
        for item in items:
            params = {k:v for k,v in item['parameters'].items() if k != 'target_defect'}
            key = json.dumps([item['kind'], item['technique'], item['mechanism_class'], params], sort_keys=True)
            if key not in groups:
                item['defect_ids'] = [item['defect_id']]
                groups[key] = item
                continue
            retained = groups[key]
            retained['defect_ids'] = sorted(set(retained['defect_ids']+[item['defect_id']]))
            retained['evidence_ids'] = sorted(set(retained['evidence_ids']+item['evidence_ids']))
            retained['partial_features'].update(item['partial_features'])
            artifacts = {(a['path'], a['sha256']): a for a in retained['start_artifacts']+item['start_artifacts']}
            retained['start_artifacts'] = list(artifacts.values())
        for item in groups.values():
            measured = [all_ids[e]['cost'].get('wall_seconds') for e in item['evidence_ids']
                        if all_ids[e]['cost'].get('wall_seconds') is not None]
            item['cost_estimate'].update(wall_seconds=statistics.median(measured) if measured else None,
                                         sample_count=len(measured))
        return list(groups.values())
    directions, reserved = consolidate(directions), consolidate(reserved)
    directions.sort(key=lambda d: (-d['priority_score'], d['defect_id'], d['technique']))
    reserved.sort(key=lambda d: (-d['priority_score'], d['defect_id'], d['technique']))
    for rank, direction in enumerate(directions+reserved, 1):
        direction['rank'] = rank
        direction['id'] = 'dream-'+hashlib.sha256(json.dumps([element, direction['defect_id'], direction['technique'], direction['parameters']], sort_keys=True).encode()).hexdigest()[:12]
    replay = schedule_replay([r for r in scoped if r['defect_id'] in defects], calibrations)
    for direction in directions:
        if direction['kind'] == 'counterfactual':
            gaps = [g for g in replay['exploration_gaps'] if g['defect_id'] in direction['defect_ids']]
            direction['replay_opportunities'] = gaps
            direction['expected_signal'] = f'{len(gaps)} logged decision points expose an earlier-switch opportunity; untried outcomes remain unknown.'
    return dict(element=element, requested_defect=defect, stuck_defects=blocked, directions=directions, reserved_directions=reserved, replay=replay,
                suppressed=suppressed, awaiting_trial_ids=[r['trial_id'] for r in awaiting_rows], taxonomy_classes=sorted({s[1] for specs in TAXONOMY.values() for s in specs}),
                caveat='Rank is a transparent heuristic, not predicted visual payoff. No render, owner label, promotion or causal counterfactual reward is produced.')
