"""Sample init points on the authored mesh surfaces (synthetic 'SfM' replacement). Pose p=0. CPU only."""
import bpy, sys, json, random
import numpy as np
from mathutils import Vector
SM='/mnt/zer0models/project-artifacts/quackles/overnight/scene-match'
sys.path.insert(0, SM+'/runner-saved')
out=sys.argv[sys.argv.index('--')+1]
bpy.ops.wm.open_mainfile(filepath='/mnt/zer0models/project-artifacts/quackles/overnight/preserved/proofs-v2-scenes/blue-cinematic.blend')
s=bpy.context.scene
from cinematic_motion import configure_motion, apply_motion
st=configure_motion(s); apply_motion(s,st,0)
dg=bpy.context.evaluated_depsgraph_get()
rng=np.random.default_rng(47); P=[]
robot={o.name for o in [st['root'],*st['root'].children_recursive]}
for o in s.objects:
    if o.type not in ('MESH','FONT') or o.hide_render: continue
    e=o.evaluated_get(dg); m=e.to_mesh(); m.calc_loop_triangles(); mw=o.matrix_world
    n=len(m.loop_triangles)
    if n==0: e.to_mesh_clear(); continue
    v=np.array([mw@vv.co for vv in m.vertices]); t=np.array([lt.vertices[:] for lt in m.loop_triangles])
    A,B,C=v[t[:,0]],v[t[:,1]],v[t[:,2]]
    area=np.linalg.norm(np.cross(B-A,C-A),axis=1)/2
    density=4e6 if o.name in robot else 1.2e6   # points per m^2
    k=int(min(max(area.sum()*density,200), 60000 if o.name not in robot else 1e9))
    idx=rng.choice(n,size=k,p=area/area.sum())
    r1=np.sqrt(rng.random(k))[:,None]; r2=rng.random(k)[:,None]
    pts=(1-r1)*A[idx]+r1*(1-r2)*B[idx]+r1*r2*C[idx]
    keep=(np.abs(pts[:,0])<1.2)&(pts[:,1]>-1.0)&(pts[:,1]<1.0)&(pts[:,2]<1.4)
    P.append(pts[keep]); e.to_mesh_clear()
P=np.concatenate(P).astype(np.float32); print('POINTS',len(P))
with open(out,'wb') as f:
    f.write(f'ply\nformat binary_little_endian 1.0\nelement vertex {len(P)}\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n'.encode())
    rec=np.zeros(len(P),dtype=[('p','<f4',3),('c','u1',3)]); rec['p']=P; rec['c']=128; f.write(rec.tobytes())
