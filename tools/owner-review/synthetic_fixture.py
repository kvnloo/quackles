#!/usr/bin/env python3
"""Create an explicitly synthetic review demo in a new, external data directory."""
import argparse
import json
from pathlib import Path
import struct
import zlib
from catalog import Catalog
import meta_loop as ml


def png(path, width=20, height=30, color=(255,0,0)):
    def chunk(kind, data):
        return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data))
    pixels = b''.join(b'\0'+bytes(color)*width for _ in range(height))
    path.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,8,2,0,0,0))+
                     chunk(b'IDAT',zlib.compress(pixels))+chunk(b'IEND',b''))


def create(data):
    data = Path(data).resolve()
    if data.exists() and any(data.iterdir()):
        raise ValueError('Fixture requires a new or empty directory')
    (data/'events').mkdir(parents=True,exist_ok=True)
    image = data/'synthetic-red.png'
    png(image)
    trial = ml.blank_trial('A','synthetic','sample-panel','geometry')
    trial.update(status='completed',hypothesis='Synthetic example of edge review')
    trial['artifacts'] = [dict(path=str(image),sha256=ml.digest(image))]
    label = dict(event='owner_label',schema_version=1,event_id='chat-1',trial_id='A',
        element='sample-panel',timestamp='2026-01-02T03:04:05Z',source='chat-backfill',status='backfilled',
        scope='component',aspect='edges',defect_id=None,verdict='accept',stars=None,
        quote='Synthetic example: keep this edge.',
        source_receipt=dict(kind='conversation',path='synthetic/session.json',session_id='synthetic-session',message_id='7'),
        mapping_confidence='high',mapping_evidence=[dict(kind='explicit-trial',trial_id='A')])
    element = dict(label,event_id='element-1',trial_id=None,scope='element',verdict='direction',
                   mapping_confidence='low',mapping_evidence=[])
    (data/'events/synthetic.jsonl').write_text(ml.json_text(trial)+'\n')
    (data/'events/owner.jsonl').write_text(ml.json_text(label)+'\n'+ml.json_text(element)+'\n')
    ml.refresh(data)
    catalog = Catalog(data)
    crop = catalog.crop(image,[2,3,7,11],'synthetic')
    catalog.add(trial,'banner','Synthetic panel',[dict(kind='hero',region='panel',look=crop,clear=crop,
                image=crop,target=crop,target_note='Synthetic red pixels only.')])
    ml.write_json(data/'rating-catalog.json',dict(candidates=catalog.candidates,assets=catalog.assets,
                  history=[],generated_at=ml.now()))
    return data


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data',type=Path,required=True)
    args=parser.parse_args()
    try:
        print(json.dumps(dict(data=str(create(args.data)),synthetic=True)))
    except ValueError as exc:
        parser.error(str(exc))


if __name__=='__main__': main()
