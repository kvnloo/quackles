"""Generate public, content-addressed 96x128 sprite pages from public thumbnails.
Run with LINEAGE_ASSETS pointing at the approved asset checkout. No source paths
are emitted. Ordinary builds consume the checked-in pages without Pillow/I/O.
"""
import hashlib
import io
import json
import os
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]

def main():
    destination = ROOT / 'public/lineage'
    archive = json.loads((ROOT / 'content/lineage.json').read_text())
    raw = (destination / archive['dataset']).read_bytes()
    entries = json.loads(raw)['entries']
    source = Path(os.environ['LINEAGE_ASSETS']) / 'lineage/v1'
    width, height, cols, rows, gutter = 96, 128, 16, 16, 2
    cellw, cellh = width+2*gutter, height+2*gutter
    pages, sprites = [], []
    for start in range(0, len(entries), cols*rows):
        page = Image.new('RGB', (cols*cellw, rows*cellh), '#e3e3de')
        for n, entry in enumerate(entries[start:start+cols*rows]):
            x, y = (n % cols)*cellw+gutter, (n//cols)*cellh+gutter
            with Image.open(source / entry['thumbs']['small'][0]) as image:
                thumb = ImageOps.contain(image.convert('RGB'), (width, height), Image.Resampling.LANCZOS)
                page.paste(thumb, (x+(width-thumb.width)//2, y+(height-thumb.height)//2))
            sprites.append(dict(key=entry['theme']+'/'+entry['version'], page=len(pages),
                                uv=[x/page.width,y/page.height,width/page.width,height/page.height],
                                date=entry['date'], theme=entry['theme'], status=entry['status']))
        out = io.BytesIO()
        page.save(out, format='WEBP', quality=78, method=6)
        encoded = out.getvalue()
        name = 'atlas.'+hashlib.sha256(encoded).hexdigest()[:16]+'.webp'
        (destination/name).write_bytes(encoded)
        pages.append(dict(file=name,width=page.width,height=page.height,bytes=len(encoded)))
    atlas = dict(schema=1,datasetSha256=hashlib.sha256(raw).hexdigest(),pages=pages,sprites=sprites)
    encoded = (json.dumps(atlas,separators=(',',':'))+'\n').encode()
    name = 'atlas.'+hashlib.sha256(encoded).hexdigest()[:16]+'.json'
    (destination/name).write_bytes(encoded)
    (ROOT/'content/lineage-atlas.json').write_text(json.dumps(dict(dataset=name))+'\n')
    print(json.dumps(dict(dataset=name,sprites=len(sprites),pages=len(pages),bytes=sum(p['bytes'] for p in pages))))

if __name__ == '__main__':
    main()
