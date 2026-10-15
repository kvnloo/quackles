"""Build a content-bound public numeric index from the already scrubbed dataset."""
import hashlib
import json
from pathlib import Path
from timeline_index import build_index

ROOT = Path(__file__).resolve().parents[1]


def main():
    archive = json.loads((ROOT / 'content/lineage.json').read_text())
    raw = (ROOT / 'public/lineage' / archive['dataset']).read_bytes()
    data = json.loads(raw)
    index = {**build_index(data['entries']), 'datasetSha256': hashlib.sha256(raw).hexdigest()}
    encoded = (json.dumps(index, separators=(',', ':')) + '\n').encode()
    name = 'timeline.' + hashlib.sha256(encoded).hexdigest()[:16] + '.json'
    (ROOT / 'public/lineage' / name).write_bytes(encoded)
    (ROOT / 'content/lineage-timeline.json').write_text(json.dumps(dict(dataset=name, versions=len(data['entries']))))
    print(f'Timeline index: {len(data["entries"])} entries, {len(encoded)} bytes, {name}')


if __name__ == '__main__':
    main()
