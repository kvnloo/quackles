"""Source-bound image catalog. Crops use SVG viewports without resampling.

PNG, JPEG and WebP pixels are decoded by the browser. No imaging dependency or
private history mapping is needed by the local server.
"""
import base64
import hashlib
import json
import mimetypes
from pathlib import Path
import struct
import meta_loop as ml


def image_size(path):
    with Path(path).open('rb') as stream:
        head = stream.read(32)
        if head.startswith(b'\x89PNG\r\n\x1a\n') and head[12:16] == b'IHDR':
            return list(struct.unpack('>II',head[16:24]))
        if head[:2] == b'\xff\xd8':
            stream.seek(2)
            while True:
                byte = stream.read(1)
                if not byte:
                    break
                if byte != b'\xff':
                    continue
                marker = stream.read(1)
                while marker == b'\xff':
                    marker = stream.read(1)
                if marker in (b'\xd8',b'\xd9'):
                    continue
                raw = stream.read(2)
                if len(raw) != 2:
                    break
                length = int.from_bytes(raw,'big')
                if length < 2:
                    break
                code = marker[0] if marker else 0
                if code in (0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf):
                    frame = stream.read(5)
                    height,width = struct.unpack('>HH',frame[1:5])
                    return [width,height]
                stream.seek(length-2,1)
        if head[:4] == b'RIFF' and head[8:12] == b'WEBP':
            if head[12:16] == b'VP8X':
                return [1+int.from_bytes(head[24:27],'little'),1+int.from_bytes(head[27:30],'little')]
            if head[12:16] == b'VP8L' and head[20] == 0x2f:
                bits = int.from_bytes(head[21:25],'little')
                return [(bits & 0x3fff)+1,((bits >> 14) & 0x3fff)+1]
            if head[12:16] == b'VP8 ' and head[23:26] == b'\x9d\x01\x2a':
                return [int.from_bytes(head[26:28],'little') & 0x3fff,
                        int.from_bytes(head[28:30],'little') & 0x3fff]
    raise ValueError('Unsupported or malformed image '+str(path))


def asset_content(asset):
    path = Path(asset['path'])
    pixels = path.read_bytes()
    if hashlib.sha256(pixels).hexdigest() != asset.get('sha256'):
        raise ValueError('Image changed; wait for a source-bound lane refresh')
    kind = mimetypes.guess_type(path.name)[0] or 'image/png'
    if 'crop' not in asset:
        return pixels, kind
    x,y,right,bottom = asset['crop']
    width,height = right-x,bottom-y
    full_width,full_height = asset['source_size']
    encoded = base64.b64encode(pixels).decode('ascii')
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
           f'viewBox="{x} {y} {width} {height}"><image width="{full_width}" height="{full_height}" '
           f'href="data:{kind};base64,{encoded}"/></svg>')
    return svg.encode(), 'image/svg+xml'


class Catalog:
    def __init__(self, data):
        self.data = Path(data)
        self.assets = {}
        self.candidates = []

    def asset(self, path, provenance=None):
        path = Path(path).resolve()
        if not path.is_file():
            raise ValueError('Missing catalog image '+str(path))
        digest = ml.digest(path)
        key = hashlib.sha256((str(path)+'\0'+digest).encode()).hexdigest()[:24]
        if key not in self.assets:
            self.assets[key] = dict(path=str(path), sha256=digest, size=image_size(path),
                provenance=str(provenance) if isinstance(provenance, Path) else provenance)
        return '/assets/'+key

    def crop(self, path, box, provenance):
        url = self.asset(path)
        source = self.assets[url.split('/')[-1]]
        if box is None:
            return url
        if (not isinstance(box, (list,tuple)) or len(box) != 4 or any(type(n) is not int for n in box)
                or not 0 <= box[0] < box[2] <= source['size'][0]
                or not 0 <= box[1] < box[3] <= source['size'][1]):
            raise ValueError('Crop must be an integer box within source pixels')
        key = hashlib.sha256((url+json.dumps(box)).encode()).hexdigest()[:24]
        self.assets[key] = dict(source, crop=list(box), source_size=source['size'],
            size=[box[2]-box[0],box[3]-box[1]],
            provenance=dict(source=str(Path(path)),box=list(box),resampled=False,receipt=str(provenance)))
        return '/assets/'+key

    def view(self, path, target, kind, region='main', metadata=None, provenance=None):
        metadata = metadata or {}
        full = metadata.get('full_frame') or metadata.get('full_resolution')
        box = metadata.get('pixel_box_top_left') or metadata.get('box') or metadata.get('border_pixels')
        target_url = self.asset(target, provenance)
        if full and box:
            tw,th = image_size(target)
            target_box = [round(box[i]*(tw/full[0] if i % 2 == 0 else th/full[1])) for i in range(4)]
            target_url = self.crop(target,target_box,provenance)
        return dict(kind=kind,region=region,image=self.asset(path,provenance),target=target_url,
            target_note='Source-resolution reference only; no 201 MP or 1 GP target truth.',
            receipt=str(provenance or ''),full_frame=full,box=box)

    def add(self, row, queue, title, views, other=None, comparisons=None):
        if not views:
            raise ValueError('No images for '+row['trial_id'])
        self.candidates.append(dict(trial_id=row['trial_id'],element=row['element'],queue=queue,
            title=title,hypothesis=row['hypothesis'],views=views,compare_to=other,
            comparisons=comparisons or [],mechanism=row['mechanism_class']))
