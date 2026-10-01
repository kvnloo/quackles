"""Render a trained splatfacto model at exact plan cameras and score against the Cycles references.
usage: python eval_splat.py CONFIG.yml OUTDIR [--ids hero,novel000,...|all-test|zoom]
Writes OUTDIR/<id>-splat.png, OUTDIR/<id>-diff.png and OUTDIR/metrics.json."""
import sys, json, time
from pathlib import Path
import numpy as np, torch
from PIL import Image
from skimage.metrics import structural_similarity
from skimage.color import rgb2lab, deltaE_ciede2000
from nerfstudio.utils.eval_utils import eval_setup
from nerfstudio.cameras.cameras import Cameras, CameraType

DATA = Path('/mnt/zer0models/project-artifacts/quackles/process/analysis/rfc-005/data/blue')
cfg, out = Path(sys.argv[1]), Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
sel = sys.argv[sys.argv.index('--ids') + 1] if '--ids' in sys.argv else 'all-test'
plan = json.loads((DATA / 'plan.json').read_text())['frames']
by = {f['file_path'][7:-4]: f for f in plan}
ids = ([k for k, f in by.items() if f['split'] == 'test'] if sel == 'all-test' else
       [k for k, f in by.items() if f['split'] == 'zoom'] if sel == 'zoom' else sel.split(','))

# Regions (normalized hero-frame boxes x0,y0,x1,y1) for region dE; only meaningful on 'hero'.
REGIONS = dict(head=(.34, .26, .70, .41), torso=(.55, .46, .78, .55), legs=(.49, .55, .85, .78),
               plinth=(.0, .76, 1., 1.), wall=(.0, .02, .38, .55), print=(.70, .07, 1., .48), orb=(.0, .66, .16, .78))

_, pipe, _, _ = eval_setup(cfg, test_mode='inference')
model = pipe.model.eval()
tf = json.loads((cfg.parent / 'dataparser_transforms.json').read_text())
T = torch.tensor(tf['transform'], dtype=torch.float32); sc = tf['scale']
try:
    import lpips; lp = lpips.LPIPS(net='alex', verbose=False).cuda()
except Exception as e:  # pragma: no cover
    lp = None; print('LPIPS unavailable', e)

def cam_for(f):
    c2w = torch.tensor(f['transform_matrix'], dtype=torch.float32)[:3]
    c2w = T @ torch.cat([c2w, torch.tensor([[0, 0, 0, 1.]])]); c2w[:3, 3] *= sc
    return Cameras(camera_to_worlds=c2w[None, :3], fx=f['fl_x'], fy=f['fl_y'], cx=f['cx'], cy=f['cy'],
                   width=f['w'], height=f['h'], camera_type=CameraType.PERSPECTIVE).to('cuda')

res = {}
for i in ids:
    f = by[i]; cam = cam_for(f)
    with torch.no_grad():
        model.get_outputs_for_camera(cam)  # warm
        torch.cuda.synchronize(); t = time.perf_counter()
        o = model.get_outputs_for_camera(cam); torch.cuda.synchronize(); ms = (time.perf_counter() - t) * 1e3
    pred = o['rgb'].clamp(0, 1).cpu().numpy()
    ref = np.asarray(Image.open(DATA / 'images' / f'{i}.png').convert('RGB'), dtype=np.float32) / 255
    Image.fromarray((pred * 255 + .5).astype(np.uint8)).save(out / f'{i}-splat.png')
    mse = float(((pred - ref) ** 2).mean()); psnr = -10 * np.log10(mse)
    ssim = float(structural_similarity(ref, pred, channel_axis=2, data_range=1.0))
    lpv = None
    if lp is not None:
        tt = lambda x: torch.tensor(x).permute(2, 0, 1)[None].cuda() * 2 - 1
        with torch.no_grad(): lpv = float(lp(tt(pred), tt(ref)).item())
    de = deltaE_ciede2000(rgb2lab(ref), rgb2lab(pred))
    diff = np.clip(de / 10, 0, 1)  # 10 dE == white
    Image.fromarray((diff * 255).astype(np.uint8)).save(out / f'{i}-dE.png')
    r = dict(psnr=round(psnr, 2), ssim=round(ssim, 4), lpips=None if lpv is None else round(lpv, 4),
             dE_mean=round(float(de.mean()), 2), dE_p95=round(float(np.percentile(de, 95)), 2),
             frac_dE_gt5=round(float((de > 5).mean()), 4), render_ms_rtx3080ti=round(ms, 2), n_gaussians=int(model.num_points))
    if i == 'hero':
        H, W = de.shape; r['regions'] = {}
        for k, (x0, y0, x1, y1) in REGIONS.items():
            reg = de[int(y0 * H):int(y1 * H), int(x0 * W):int(x1 * W)]
            r['regions'][k] = dict(dE_mean=round(float(reg.mean()), 2), dE_p95=round(float(np.percentile(reg, 95)), 2))
    res[i] = r; print(i, r, flush=True)
(out / 'metrics.json').write_text(json.dumps(res, indent=1))
