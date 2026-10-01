"""3DGS .ply (ns-export gaussian-splat) -> antimatter15 .splat (32 B/gaussian, SH0 only), sorted by importance.
usage: python ply_to_splat.py in.ply out.splat [--keep N]"""
import sys, numpy as np
from plyfile import PlyData
v = PlyData.read(sys.argv[1])['vertex'].data
n = len(v); keep = int(sys.argv[sys.argv.index('--keep') + 1]) if '--keep' in sys.argv else n
pos = np.stack([v['x'], v['y'], v['z']], 1).astype(np.float32)
scl = np.exp(np.stack([v['scale_0'], v['scale_1'], v['scale_2']], 1)).astype(np.float32)
C0 = 0.28209479177387814
rgb = np.stack([v['f_dc_0'], v['f_dc_1'], v['f_dc_2']], 1) * C0 + .5
op = 1 / (1 + np.exp(-v['opacity']))
rot = np.stack([v['rot_0'], v['rot_1'], v['rot_2'], v['rot_3']], 1); rot /= np.linalg.norm(rot, axis=1, keepdims=True)
order = np.argsort(-(scl.prod(1) * op))[:keep]
rec = np.zeros(len(order), dtype=[('p', '<f4', 3), ('s', '<f4', 3), ('c', 'u1', 4), ('r', 'u1', 4)])
rec['p'] = pos[order]; rec['s'] = scl[order]
rec['c'] = np.clip(np.concatenate([rgb[order], op[order, None]], 1) * 255, 0, 255).astype(np.uint8)
rec['r'] = np.clip(rot[order] * 128 + 128, 0, 255).astype(np.uint8)
open(sys.argv[2], 'wb').write(rec.tobytes()); print('SPLAT', n, len(order), rec.nbytes)
