"""Synthetic owner conversation receipts. No archive or live data access."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
import meta_loop as ml


def chat(**changes):
    label = dict(event='owner_label', schema_version=1, event_id='chat-1',
        trial_id='A', element='sample-panel', timestamp='2026-01-02T03:04:05Z',
        source='chat-backfill', status='backfilled', scope='component', aspect='edges',
        defect_id=None, verdict='accept', stars=None, quote='Synthetic example: keep this edge.',
        source_receipt=dict(kind='conversation', path='synthetic/session.json',
                            session_id='synthetic-session', message_id='7'),
        mapping_confidence='high', mapping_evidence=[dict(kind='explicit-trial', trial_id='A')])
    label.update(changes)
    return label


def trial():
    return ml.blank_trial('A', 'synthetic', 'sample-panel', 'geometry')


class ChatBackfill(unittest.TestCase):
    def test_null_binding_is_preserved_without_a_fake_trial(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as tmp:
            data=Path(tmp); (data/'events').mkdir()
            label=chat(trial_id=None, scope='element', mapping_confidence='low')
            (data/'events/owner.jsonl').write_text(json.dumps(label)+'\n')
            rows, errors=ml.ingest(data)
            self.assertEqual(errors, [])
            self.assertEqual(rows, [])
            summary=json.loads((data/'owner-evidence.json').read_text())
            self.assertEqual(summary['element_only']['sample-panel']['edges']['accept'], 1)
            self.assertEqual(summary['unbound_labels'], [label])
            self.assertEqual(ml.learn(rows, {}), {})

    def test_distinct_unbound_receipts_are_not_assumed_to_be_the_same_trial(self):
        first=chat(trial_id=None,scope='element')
        second=chat(event_id='chat-2',trial_id=None,scope='element',quote='Another synthetic edge.',
                    source_receipt=dict(kind='conversation',path='synthetic/session.json',session_id='synthetic-session',message_id='8'))
        confirmation=dict(first,event_id='ui',source='owner-ui',status='confirmed',confirmed_from='chat-1',
                          source_timestamp=first['timestamp'],verdict='reject')
        for events in ([first,second,confirmation],[confirmation,first,second]):
            result=ml.owner_evidence_summary([],events)
            self.assertEqual(result['errors'],[])
            self.assertEqual(len(result['unbound_labels']),2)
            self.assertEqual(result['element_only']['sample-panel']['edges']['accept'],1)
            self.assertEqual(result['element_only']['sample-panel']['edges']['reject'],1)
            self.assertEqual(len(result['history']),3)

    def test_validates_chat_metadata_without_inventing_stars(self):
        labels=[chat(verdict=v, event_id=v) for v in ('accept','reject','maybe','lock','direction')]
        for label in labels:
            with self.subTest(verdict=label['verdict']):
                self.assertIsNone(ml.validate_owner_label(label, {'A':trial()}))
        for change in ({'source_receipt':None}, {'source_receipt':{'kind':'conversation'}},
                       {'mapping_confidence':'certain'}, {'mapping_evidence':'guess'},
                       {'schema_version':True}, {'quote':''}, {'quote':None}, {'timestamp':'2026-01-02T03:04:05'},
                       {'timestamp':'2026-01-02T03:04:05+01:00'}, {'stars':5},
                       {'aspect':''}, {'defect_id':[]}, {'trial_id':None},
                       {'trial_id':'missing'}, {'scope':'element','trial_id':'missing'},
                       {'status':'confirmed'}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                ml.validate_owner_label(chat(**change), {'A':trial()})

    def test_ui_precedence_is_per_aspect_in_both_ingestion_orders(self):
        backfill=chat()
        ui=chat(event_id='ui-1', source='owner-ui', status='confirmed', stars=2, verdict='reject')
        other=chat(event_id='chat-2', aspect='color', verdict='direction')
        for events in ([ui,backfill,other], [backfill,other,ui]):
            rows, errors=ml.apply_owner_labels([trial()], events, 'synthetic/owner.jsonl')
            self.assertEqual(errors, [])
            self.assertEqual(rows[0]['owner_labels_by_aspect']['edges']['event_id'], 'ui-1')
            self.assertEqual(rows[0]['owner_labels_by_aspect']['color']['event_id'], 'chat-2')
            self.assertEqual(len(rows[0]['owner_label_history']), 3)
            self.assertIsNone(ml.owner_outcome(rows[0]))

    def test_component_counts_do_not_promote_a_trial_or_recipe(self):
        events=[chat(),chat(event_id='color', aspect='color', verdict='lock'),chat()]
        rows, errors=ml.apply_owner_labels([trial()], events, 'synthetic/owner.jsonl')
        self.assertEqual(errors, [])
        self.assertEqual(len(rows[0]['owner_label_history']), 2)
        self.assertIsNone(ml.owner_outcome(rows[0]))
        self.assertFalse(ml.eligible_recipe(rows[0], {}))
        stats=ml.learn(rows, {})['sample-panel']['geometry']
        self.assertEqual(stats['owner_accept']['n'], 0)
        self.assertEqual(stats['owner_aspects']['edges']['accept'], 1)
        self.assertEqual(stats['owner_aspects']['color']['lock'], 1)
        conflict=chat(verdict='reject')
        _, errors=ml.apply_owner_labels(rows,events+[conflict], 'synthetic/owner.jsonl')
        self.assertTrue(any('conflict' in e for e in errors))
        again, errors=ml.apply_owner_labels(rows, events, 'synthetic/owner.jsonl')
        self.assertEqual(again, rows)

    def test_null_star_ui_overlay_requires_an_authentic_source_receipt(self):
        ui=chat(event_id='ui',source='owner-ui',status='confirmed',confirmed_from='missing',
                source_timestamp='2026-01-02T03:04:05Z')
        rows,errors=ml.apply_owner_labels([trial()],[ui],'synthetic/owner.jsonl')
        self.assertTrue(errors)
        ui['confirmed_from']='chat-1'
        for change in ({'quote':'Changed quote'},{'aspect':'overall'},{'scope':'trial'},
                       {'source_timestamp':'2026-01-03T03:04:05Z'}):
            with self.subTest(change=change):
                rows,errors=ml.apply_owner_labels([trial()],[chat(),dict(ui,**change)],'synthetic/owner.jsonl')
                self.assertTrue(errors)
        rows,errors=ml.apply_owner_labels([trial()],[ui,chat()],'synthetic/owner.jsonl')
        self.assertEqual(errors,[])
        self.assertEqual(rows[0]['owner_labels_by_aspect']['edges']['source'],'owner-ui')

    def test_malformed_confirmation_metadata_is_rejected_without_crashing_intake(self):
        for stamp in (None,[],1):
            bad=chat(event_id='ui',source='owner-ui',status='confirmed',confirmed_from='chat-1',source_timestamp=stamp)
            with self.subTest(stamp=stamp), self.assertRaises(ValueError):
                ml.validate_owner_label(bad,{'A':trial()})

    def test_pairwise_counts_survive_other_aspects_and_count_each_trial_once(self):
        a=trial();b=ml.blank_trial('B','synthetic','sample-panel','geometry')
        pair=chat(pairwise=dict(other_trial_id='B',preference='candidate'))
        extra=chat(event_id='color',aspect='color',verdict='direction')
        for events in ([pair,extra],[extra,pair],[pair,dict(extra,pairwise=pair['pairwise'])]):
            rows,errors=ml.apply_owner_labels([a,b],events,'synthetic/owner.jsonl')
            self.assertEqual(errors,[])
            self.assertEqual(ml.learn(rows,{})['sample-panel']['geometry']['owner_preference']['n'],1)

    def test_trial_acceptance_and_component_correction_are_scoped(self):
        approved=chat(scope='trial',aspect='overall')
        component=chat(event_id='ui',source='owner-ui',status='confirmed',stars=4,aspect='overall')
        for events, expected in (([approved],1),([approved,component],None),([component,approved],None)):
            rows, errors=ml.apply_owner_labels([trial()],events,'synthetic/owner.jsonl')
            self.assertEqual(errors, [])
            self.assertEqual(ml.owner_outcome(rows[0]),expected)
        for verdict in ('lock','direction','maybe'):
            rows,errors=ml.apply_owner_labels([trial()],[chat(scope='trial',verdict=verdict)],'synthetic/owner.jsonl')
            self.assertEqual(errors,[])
            self.assertIsNone(ml.owner_outcome(rows[0]))


if __name__=='__main__': unittest.main()
