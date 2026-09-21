#!/usr/bin/env python3
import json
import sys
from pathlib import Path
import html
root=Path(sys.argv[1])
reports=[]
for file in sorted(root.glob('*/report.json')):
    data=json.loads(file.read_text())
    if 'idle' in data: reports.append((file.parent.name,data))
rows=[]
md=['# Mobile validation results','','These are desktop Chromium mobile-emulation measurements on SwiftShader. They do not validate physical Samsung S25 performance or 120 Hz presentation. A hidden-canvas run is a diagnostic and cannot pass visible-scene quality.','', '| Run | Viewport / pass | p95 | p99 | Worst interval | Misses | React commits |','|---|---|---:|---:|---:|---:|---:|']
for name,r in reports:
    for t in r['timings']:
        s=t['statistics']; label=f"{t['viewport']['width']}×{t['viewport']['height']} {t['direction']}"
        values=[name,label,f"{s['p95']:.1f} ms",f"{s['p99']:.1f} ms",f"{s['max']:.1f} ms",f"{s['missedIntervals']}/{s['samples']}",str(t['reactCommits'])]
        rows.append('<tr>'+''.join(f'<td>{html.escape(v)}</td>' for v in values)+'</tr>')
        md.append('| '+' | '.join(values)+' |')
    md.extend(['',f"{name}: build `{r.get('buildId','unknown')}`, idle median {r['idle']['p50']:.2f} ms, idle WebGL frames {r.get('idleRenderedFrames','unknown')}. Cold ready-and-settled {r['cold']['timeToReadyAndSettled']:.0f} ms; maximum cold interval {max(r['cold']['frameIntervals'],default=0):.1f} ms.",''])
md.extend(['','The unchanged application with only canvas visibility hidden sustains the measured host cadence. This isolates a strong dependency on visible rendering/presentation, while preserving scroll scheduling and rig updates. It does not prove which GPU substage causes the delay.','', 'See the baseline manual review for rejected pose, title overlap and handoff defects. Automated finite sampling and pixel variance checks do not establish perceptual quality.'])
(root/'results.md').write_text('\n'.join(md))
links=''.join(f'<li><b>{html.escape(name)}</b>: <a href="{name}/report.json">raw frames and environment</a> '+(f'· <a href="{name}/index.html">all captured frames</a>' if (root/name/'index.html').exists() else '')+'</li>' for name,r in reports)
(root/'index.html').write_text(f'<!doctype html><meta charset="utf-8"><title>Quackles mobile validation</title><style>body{{font:15px system-ui;max-width:1250px;margin:36px auto;padding:0 20px;background:#f5f4ef;color:#20222a}}h1{{font-size:30px}}table{{border-collapse:collapse;width:100%;font-size:13px}}td,th{{padding:9px;border-bottom:1px solid #d3d4dc;text-align:left}}a{{color:#163bcc}}.notice{{padding:18px;background:#fff0d2;border-left:4px solid #ac7800;line-height:1.6}}</style><h1>Quackles · mobile validation</h1><p class="notice">Desktop Chromium, mobile viewport, SwiftShader software rendering. Physical Galaxy S25 120 Hz remains unverified. Hidden-canvas results are diagnostic only. Visible runs must be evaluated separately.</p><p>Timing passes exclude screenshots and retain every interval. Cold load, reverse traversal, theme changes, smaller viewport and reduced motion are recorded separately.</p><table><thead><tr><th>Run</th><th>Viewport / pass</th><th>P95</th><th>P99</th><th>Worst</th><th>Missed intervals</th><th>React commits</th></tr></thead><tbody>{"".join(rows)}</tbody></table><h2>Evidence</h2><ul>{links}</ul><p><a href="validation-method.md">Method and limitations</a> · <a href="results.md">Plain-text results</a> · <a href="baseline/manual-review.md">Baseline visual defects</a> · <a href="glb-budget.json">Model budget</a> · <a href="baseline/image-budget.json">Decoded image budget</a></p>')
print(root/'index.html')
