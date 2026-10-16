"""Pack approved thumbnails at display scale using bounded lossy WebP.
Ordinary builds consume committed pages. LINEAGE_ASSETS is build-time only.
The same packer can consume local review thumbnails without publishing paths.
"""
import hashlib
import io
import json
import os
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def pack(entries, paths, destination, dataset_sha):
    size, gutter = 2048, 2
    pages, sprites = [], []
    page = Image.new('RGB', (size, size), '#e3e3de')
    x = y = shelf = 0

    def save_page():
        out = io.BytesIO()
        page.save(out, format='WEBP', quality=74, method=6)
        encoded = out.getvalue()
        name = 'atlas.'+hashlib.sha256(encoded).hexdigest()[:16]+'.webp'
        (destination/name).write_bytes(encoded)
        pages.append(dict(file=name,width=size,height=size,bytes=len(encoded)))
        decoded = Image.open(io.BytesIO(encoded)).convert('RGB')
        for sprite in sprites:
            if sprite['page'] != len(pages)-1:
                continue
            u,v,w,h = sprite['uv']
            crop = decoded.crop((round(u*size),round(v*size),round((u+w)*size),round((v+h)*size)))
            sprite['decodedSha256'] = hashlib.sha256(crop.tobytes()).hexdigest()

    for entry, path in zip(entries, paths, strict=True):
        with Image.open(path) as source:
            image = source.convert('RGB')
            image.thumbnail((180,240), Image.Resampling.LANCZOS)
        w, h = image.size
        if max(w,h)+2*gutter > size:
            raise ValueError('Thumbnail exceeds atlas page')
        if x+w+2*gutter > size:
            x, y, shelf = 0, y+shelf, 0
        if y+h+2*gutter > size:
            save_page()
            page = Image.new('RGB', (size,size), '#e3e3de')
            x = y = shelf = 0
        px, py = x+gutter, y+gutter
        # Duplicate edge texels: bilinear filtering must never sample neighbors.
        page.paste(image, (px,py))
        page.paste(image.crop((0,0,1,h)).resize((gutter,h)),(x,py))
        page.paste(image.crop((w-1,0,w,h)).resize((gutter,h)),(px+w,py))
        page.paste(image.crop((0,0,w,1)).resize((w,gutter)),(px,y))
        page.paste(image.crop((0,h-1,w,h)).resize((w,gutter)),(px,py+h))
        sprites.append(dict(key=entry['theme']+'/'+entry['version'],page=len(pages),
                            uv=[px/size,py/size,w/size,h/size],
                            sourceRgbSha256=hashlib.sha256(image.tobytes()).hexdigest(),
                            date=entry['date'],theme=entry['theme'],status=entry['status']))
        x += w+2*gutter
        shelf = max(shelf,h+2*gutter)
    if sprites:
        save_page()
    atlas=dict(schema=1,datasetSha256=dataset_sha,pages=pages,sprites=sprites)
    encoded=(json.dumps(atlas,separators=(',',':'))+'\n').encode()
    name='atlas.'+hashlib.sha256(encoded).hexdigest()[:16]+'.json'
    (destination/name).write_bytes(encoded)
    return name,atlas


def main():
    destination=ROOT/'public/lineage'
    archive=json.loads((ROOT/'content/lineage.json').read_text())
    raw=(destination/archive['dataset']).read_bytes()
    entries=json.loads(raw)['entries']
    source=Path(os.environ['LINEAGE_ASSETS'])/'lineage/v1'
    name,atlas=pack(entries,[source/e['thumbs']['small'][0] for e in entries],destination,hashlib.sha256(raw).hexdigest())
    (ROOT/'content/lineage-atlas.json').write_text(json.dumps(dict(dataset=name))+'\n')
    print(json.dumps(dict(dataset=name,sprites=len(atlas['sprites']),pages=len(atlas['pages']),bytes=sum(p['bytes'] for p in atlas['pages']))))


if __name__=='__main__':
    main()
