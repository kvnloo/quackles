"""RFC-005 spike: render a multi-view nerfstudio dataset of the Blue hero scene (pose p=0, static).
usage: blender -b --factory-startup --python render_dataset.py -- OUTDIR --views i0,i1,... [--plan-only] [--width 544]
Camera plan is deterministic (plan()). View 'hero' == exact PosterCam at p=0 (held-out test).
Zoom views 'zoomN_<name>' == PosterCam rotated to a detail target with lens*N (held-out, deep-zoom question).
Recipe mirrors overnight/scene-match/recipes.sh blue (saved Sep-16 scene + edits/final-blue.json, OptiX denoise)."""
import bpy, sys, json, math, time, random
from pathlib import Path
from mathutils import Vector, Matrix
SM = Path('/mnt/zer0models/project-artifacts/quackles/overnight/scene-match')
sys.path.insert(0, str(SM / 'runner-saved'))
BLEND = '/mnt/zer0models/project-artifacts/quackles/overnight/preserved/proofs-v2-scenes/blue-cinematic.blend'
a = sys.argv[sys.argv.index('--') + 1:]
out = Path(a[0]); out.mkdir(parents=True, exist_ok=True)
def opt(k, d=None): return a[a.index(k) + 1] if k in a else d
W = int(opt('--width', '544')); H = W * 3 // 2
SPP_TRAIN = int(opt('--samples', '32'))

TARGET = Vector((0.075, 0.04, 0.27))      # robot bbox centre-ish (Blender coords)
HERO_LOC = Vector((0.11, -0.62, 0.19330376386642456))

def look_at(loc, tgt):
    q = (tgt - loc).to_track_quat('-Z', 'Y')
    return Matrix.Translation(loc) @ q.to_matrix().to_4x4()

def plan():
    """Return list of (id, split, c2w Matrix, lens_mm)."""
    rng = random.Random(47)
    views = []
    hero_dir = (HERO_LOC - TARGET); hero_az = math.atan2(hero_dir.x, -hero_dir.y)  # az 0 == -Y (front)
    # front arc (hero side), 5 elevation rings, radius bands
    i = 0
    for el in (-4, 8, 20, 34, 50, 66):
        n = {-4: 15, 8: 19, 20: 19, 34: 17, 50: 13, 66: 8}[el]
        span = math.radians({-4: 150, 8: 170, 20: 170, 34: 180, 50: 200, 66: 260}[el])
        for k in range(n):
            az = hero_az - span / 2 + span * (k + .5) / n + rng.uniform(-.04, .04)
            r = rng.uniform(.42, .78)
            e = math.radians(el + rng.uniform(-3, 3))
            loc = TARGET + Vector((math.sin(az) * math.cos(e), -math.cos(az) * math.cos(e), math.sin(e))) * r
            tgt = TARGET + Vector((rng.uniform(-.05, .05), rng.uniform(-.04, .04), rng.uniform(-.06, .05)))
            views.append((f'arc{i:03d}', 'train', look_at(loc, tgt), rng.uniform(26, 42))); i += 1
    # rear/side dome inside the studio (back wall at y>=0.457): short radius
    for k in range(12):
        az = math.radians(100 + 160 * (k + .5) / 12) + hero_az
        e = math.radians(rng.uniform(15, 55)); r = rng.uniform(.30, .38)
        loc = TARGET + Vector((math.sin(az) * math.cos(e), -math.cos(az) * math.cos(e), math.sin(e))) * r
        loc.y = min(loc.y, .43)
        views.append((f'dome{k:03d}', 'train', look_at(loc, TARGET), 24.)); i += 1
    # close-ups near the hero line of sight (dense supervision where we evaluate)
    for k in range(10):
        loc = HERO_LOC.lerp(TARGET, rng.uniform(.25, .55)) + Vector((rng.uniform(-.12, .12), 0, rng.uniform(-.08, .1)))
        tgt = TARGET + Vector((rng.uniform(-.06, .06), rng.uniform(-.03, .03), rng.uniform(-.1, .1)))
        views.append((f'near{k:03d}', 'train', look_at(loc, tgt), rng.uniform(30, 45)))
    # novel held-out test views (not hero): between-ring positions
    for k in range(6):
        az = hero_az + math.radians(-70 + 140 * k / 5 + 7); e = math.radians(rng.choice((14, 27, 42)))
        r = .6
        loc = TARGET + Vector((math.sin(az) * math.cos(e), -math.cos(az) * math.cos(e), math.sin(e))) * r
        views.append((f'novel{k:03d}', 'test', look_at(loc, TARGET), 34.))
    return views

ZOOM_REGIONS = dict(head=(0.52, 0.31), foot=(0.76, 0.745), plinth=(0.78, 0.885))  # normalized hero-frame centres

def zoom_views(hero_mw, hero_lens):
    """Deep zoom == exact crop of the hero frame: same pose, lens*N, sensor shift to the region centre.
    Returned lens entries are (lens, shift_x, shift_y)."""
    out_v = []
    for name, (u, v) in ZOOM_REGIONS.items():
        for n in (4, 8):
            sx = n * (u - .5); sy = -n * (v - .5) * H / W   # shift unit == sensor-fit axis (HORIZONTAL -> width)
            out_v.append((f'zoom{n}_{name}', 'zoom', hero_mw, (hero_lens * n, sx, sy)))
    return out_v

bpy.ops.wm.open_mainfile(filepath=BLEND)
s = bpy.context.scene; s.render.engine = 'CYCLES'
import importlib.util as _u
_sp = _u.spec_from_file_location('apply_edits', str(SM / 'tools/apply_edits.py')); _ae = _u.module_from_spec(_sp); _sp.loader.exec_module(_ae)
applied = _ae.apply(s, json.loads((SM / 'edits/final-blue.json').read_text()))
from cinematic_motion import configure_motion, apply_motion
state = configure_motion(s); apply_motion(s, state, 0)
cam = s.camera; hero_mw = cam.matrix_world.copy(); hero_lens = cam.data.lens
assert cam.data.sensor_fit == 'HORIZONTAL' and cam.data.sensor_width == 24.0
views = [('hero', 'test', hero_mw, hero_lens)] + plan() + zoom_views(hero_mw, hero_lens)
want = opt('--views')
sel = views if not want else [v for v in views if v[0] in set(want.split(','))]

def intr(lens):
    lens, sx, sy = lens if isinstance(lens, tuple) else (lens, 0., 0.)
    fx = lens / 24.0 * W  # sensor_fit HORIZONTAL, sensor 24 mm; shift is in units of the fit axis (W)
    return dict(fl_x=fx, fl_y=fx, cx=W / 2 - sx * W, cy=H / 2 + sy * W, w=W, h=H)

if '--plan-only' in a:
    frames = []
    for vid, split, mw, lens in views:
        frames.append(dict(file_path=f'images/{vid}.png', split=split, transform_matrix=[list(r) for r in mw], **intr(lens)))
    (out / 'plan.json').write_text(json.dumps(dict(width=W, height=H, frames=frames, applied=applied), indent=1))
    print('PLAN', len(views), sum(v[1] == 'train' for v in views)); sys.exit(0)

exec((SM / 'runner-saved/use_optix.py').read_text())
s.cycles.denoiser = 'OPTIX'; s.cycles.use_denoising = True
s.cycles.adaptive_threshold = .010; s.cycles.adaptive_min_samples = 16
s.render.resolution_x = W; s.render.resolution_y = H; s.render.resolution_percentage = 100
s.render.image_settings.color_mode = 'RGB'; s.render.image_settings.color_depth = '8'; s.render.image_settings.file_format = 'PNG'
s.render.use_border = False
(out / 'images').mkdir(exist_ok=True)
for vid, split, mw, lens in sel:
    lens, sx, sy = lens if isinstance(lens, tuple) else (lens, 0., 0.)
    cam.matrix_world = mw; cam.data.lens = lens; cam.data.shift_x = sx; cam.data.shift_y = sy
    s.cycles.samples = 48 if split != 'train' else SPP_TRAIN   # held-out refs at shipped 48 spp
    p = out / 'images' / f'{vid}.png'; s.render.filepath = str(p)
    t = time.monotonic(); bpy.ops.render.render(write_still=True)
    print('SAVED_VIEW', vid, split, round(time.monotonic() - t, 2), flush=True)
