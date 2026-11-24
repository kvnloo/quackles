"""Build the offline gigapixel gallery from the public preview refs."""
import argparse
import base64
import io
import os
import re
import signal
import socket
import subprocess
import sys
import tarfile
import tempfile
import time
from collections import Counter
from html import escape
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps
from playwright.sync_api import Error as BrowserError, sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PRIMARY = "origin/preview/gigapixel-single"
RELATED = "origin/preview/scenes-gigapixel"
DOCS = ROOT / "docs/gigapixel-timeline"
# Downsample tracked renders even if their originals are 200MP.
Image.MAX_IMAGE_PIXELS = 250_000_000


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)


def commits(revisions):
    for line in git("log", "--reverse", "--format=%H%x00%aI%x00%s", revisions).decode(
        errors="replace"
    ).splitlines():
        yield line.split("\0", 2)


def changed(sha):
    # First-parent comparison includes the files brought in by merge iterations.
    parent = git("show", "-s", "--format=%P", sha).decode().split()[0]
    output = git("diff", "--name-status", "--no-renames", "-z", parent, sha)
    fields = iter(output.decode(errors="surrogateescape").split("\0")[:-1])
    return list(zip(fields, fields))


def thumbnail(blob):
    with Image.open(io.BytesIO(blob)) as image:
        image.draft("RGB", (480, 480))
        image = ImageOps.exif_transpose(image)
        image.thumbnail((480, 480), Image.Resampling.LANCZOS)
        out = io.BytesIO()
        image.convert("RGBA" if "A" in image.getbands() else "RGB").save(
            out, "WEBP", quality=78
        )
        return out.getvalue()


def scene_route(files):
    for prefix in ("app/", "components/", "lib/"):
        scene_files = [p for _, p in files if p.startswith(prefix)
                       and Path(p).suffix in {".tsx", ".ts", ".css", ".json"}]
        if scene_files:
            return "/process/" if all(p.startswith("app/process/") for p in scene_files) else "/"
    if any(p.startswith("public/preview-scene/") or p == "next.config.ts" for _, p in files):
        return "/"
    return None


def replay(sha, route, chromium, result, workspace):
    tree = workspace / "tree"
    tree.mkdir()
    archive = workspace / "snapshot.tar"
    with archive.open("wb") as output:
        subprocess.run(["git", "archive", sha], cwd=ROOT, stdout=output, check=True)
    with tarfile.open(archive) as snapshot:
        snapshot.extractall(tree, filter="data")
    archive.unlink()
    if (tree / "package-lock.json").read_bytes() != (ROOT / "package-lock.json").read_bytes():
        raise ValueError("Snapshot lockfile differs from installed dependency lockfile")
    # Keep imports resolved against the installed dependencies without modifying the
    # archived sources or installing packages during the capture.
    (tree / "node_modules").symlink_to(ROOT / "node_modules", target_is_directory=True)
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    origin = f"http://127.0.0.1:{port}"
    env = {**os.environ, "NEXT_TELEMETRY_DISABLED": "1", "NEXT_PUBLIC_BASE_PATH": "",
           "NEXT_PUBLIC_ASSET_ORIGIN": ""}
    with (workspace / "next.log").open("wb") as log:
        # The parent runs this whole worker in its own process group and cleans it up.
        server = subprocess.Popen(
            ["node", str(tree / "node_modules/next/dist/bin/next"), "dev",
             "--webpack", "--hostname", "127.0.0.1", "--port", str(port)],
            cwd=tree, env=env, stdout=log, stderr=subprocess.STDOUT
        )
    try:
        for _ in range(100):
            try:
                with socket.create_connection(("127.0.0.1", port), timeout=0.1):
                    break
            except OSError:
                time.sleep(0.1)
        else:
            raise ValueError("Scene server did not start")
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path=chromium)
            context = browser.new_context(viewport={"width": 960, "height": 720},
                                          reduced_motion="reduce", service_workers="block")
            context.route("**/*", lambda r: r.continue_()
                          if r.request.url.startswith(origin + "/") else r.abort())
            page = context.new_page()
            url = origin + route
            response = page.goto(url, wait_until="load", timeout=35000)
            if not response or not response.ok:
                raise ValueError(f"Scene returned HTTP {response.status if response else 'unknown'}")
            page.locator("canvas, main").first.wait_for(state="visible", timeout=5000)
            page.wait_for_timeout(750)
            if page.locator("nextjs-portal [data-nextjs-dialog-overlay]").count():
                raise ValueError("Next.js error overlay")
            result.write_bytes(thumbnail(page.screenshot(timeout=4000)))
            browser.close()
    finally:
        server.terminate()
        try:
            server.wait(timeout=2)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait()


def capture(sha, route, chromium):
    with tempfile.TemporaryDirectory(prefix="gigapixel-") as temp:
        workspace = Path(temp)
        result = workspace / "capture.webp"
        command = [sys.executable, __file__, "--replay", sha, route, temp]
        if chromium:
            command += ["--chromium", chromium]
        with (workspace / "worker.log").open("w+") as log:
            process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT,
                                       start_new_session=True)
            try:
                process.wait(timeout=60)
                if process.returncode == 0:
                    return result.read_bytes(), None
                log.seek(0)
                diagnostic = log.read().strip().splitlines()
                print(f"  replay: {diagnostic[0] if diagnostic else process.returncode}", flush=True)
                return None, "Historical scene replay failed"
            except subprocess.TimeoutExpired:
                return None, "Historical scene replay exceeded 60 seconds"
            finally:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                process.wait()


def visual(sha, files, chromium):
    for status, path in files:
        if status in {"A", "M"} and Path(path).suffix.lower() in {".png", ".webp", ".jpg", ".jpeg"}:
            try:
                return thumbnail(git("show", f"{sha}:{path}")), "Changed image", path
            except (OSError, ValueError, Image.DecompressionBombError) as error:
                print(f"  skipped image {path}: {error}", flush=True)
    route = scene_route(files)
    if route:
        image, failure = capture(sha, route, chromium)
        if image:
            return image, "Scene replay", route
        return None, "No visual", failure
    return None, "No visual", "No changed image or web scene"


STYLE = """
:root{color-scheme:dark;background:#10161c;color:#edf2f7;font:16px/1.5 system-ui,sans-serif}
*{box-sizing:border-box}body{margin:0 auto;max-width:1540px;padding:clamp(16px,4vw,60px)}
header{border-bottom:1px solid #394552;margin-bottom:24px;padding-bottom:20px}
h1{font-size:clamp(2rem,5vw,4rem);line-height:1.05;margin:.24em 0}.eyebrow{color:#91e6d3;
font:700 .84rem ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase}
p{max-width:80ch}.meta,figcaption,summary,.related li{color:#b8c7d6;font-size:.86rem}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:16px}
article,.related{background:#19222c;border:1px solid #394552;border-radius:12px;padding:16px;min-width:0}
h2{margin:.45em 0;font-size:1.08rem;overflow-wrap:anywhere}code{overflow-wrap:anywhere}
figure{margin:12px 0}.visual{display:block;width:100%;height:200px;object-fit:contain;
background:#10161c;border-radius:7px}.placeholder{display:grid;place-content:center;
text-align:center;color:#b8c7d6;padding:16px;overflow-wrap:anywhere}
figcaption{margin-top:6px;overflow-wrap:anywhere}summary{cursor:pointer}
ul{padding-left:1.2em}.related{margin-top:24px}
"""


def safe(value):
    # Keep personal paths, address literals and email addresses out of the archive.
    value = re.sub(r"/(?:Users|home)/[^\s<>]+", "[local path]", value)
    value = re.sub(r"\b[^\s<>@]+@[^\s<>@]+\.[A-Za-z]+\b", "[email]", value)
    value = re.sub(r"\b(?:\d{1,3}\.){3}\d{1,3}\b", "[address]", value)
    return escape(value.encode("utf-8", "replace").decode())


def card(i, sha, date, subject, files, image, kind, source):
    subject = safe(subject)
    graphic = (f'<img class="visual" alt="{kind} for iteration {i}" src="data:image/webp;base64,'
               f'{base64.b64encode(image).decode()}">' if image else
               f'<div class="visual placeholder"><strong>No visual</strong><span>{subject}</span></div>')
    paths = "".join(f"<li><code>{status} {safe(path)}</code></li>" for status, path in files)
    return f"""<article data-commit="{sha}" data-iteration="{i}">
<span class="eyebrow">Iteration {i:03}</span><h2>{subject}</h2>
<div class="meta"><time datetime="{date}">{date}</time><br><code>{sha}</code></div>
<figure>{graphic}<figcaption>{kind} · {safe(source)}</figcaption></figure>
<details><summary>{len(files)} changed files</summary><ul>{paths}</ul></details>
</article>"""


def contact_sheet(tiles, output):
    cols, width, height = 8, 184, 144
    sheet = Image.new("RGB", (cols * width, 62 + ((len(tiles) + cols - 1) // cols) * height),
                      "#10161c")
    draw = ImageDraw.Draw(sheet)
    title = ImageFont.load_default(size=22)
    small = ImageFont.load_default(size=13)
    draw.text((12, 8), "Gigapixel / iteration contact sheet", font=title, fill="#edf2f7")
    draw.text((12, 38), f"{len(tiles)} iterations · oldest first · read left to right",
              font=small, fill="#91e6d3")
    for index, (sha, image, kind) in enumerate(tiles):
        x, y = (index % cols) * width, 62 + (index // cols) * height
        draw.rounded_rectangle((x + 4, y + 4, x + width - 4, y + height - 4),
                               radius=6, fill="#19222c")
        if image:
            with Image.open(io.BytesIO(image)) as im:
                im.thumbnail((width - 16, 104), Image.Resampling.LANCZOS)
                sheet.paste(im, (x + (width - im.width) // 2, y + 8 + (104 - im.height) // 2),
                            im if im.mode == "RGBA" else None)
        else:
            draw.text((x + width // 2, y + 60), "No visual", font=small,
                      fill="#b8c7d6", anchor="mm")
        draw.text((x + 12, y + 117), f"{index + 1:03}  {sha[:8]} · {kind}",
                  font=small, fill="#edf2f7")
    sheet.save(output, optimize=True)


def build(chromium):
    tiles, cards = [], []
    for i, (sha, date, subject) in enumerate(commits(f"origin/main..{PRIMARY}"), 1):
        files = changed(sha)
        image, kind, source = visual(sha, files, chromium)
        print(f"{i:03} {sha[:8]} {kind}: {source}", flush=True)
        cards.append(card(i, sha, date, subject, files, image, kind, source))
        tiles.append((sha, image, kind))
    counts = Counter(kind for _, _, kind in tiles)
    related = list(commits(f"{PRIMARY}..{RELATED}"))
    notes = "".join(f"<li><code>{sha}</code> · <time>{date}</time> · {safe(subject)}</li>"
                    for sha, date, subject in related)
    DOCS.mkdir(parents=True, exist_ok=True)
    (DOCS / "index.html").write_text(f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
<title>Gigapixel / iteration archive</title><style>{STYLE}</style></head>
<body><header><div class="eyebrow">Quackles · GL-109 / K06</div><h1>Gigapixel iteration archive</h1>
<p>{len(tiles)} commits in <code>{PRIMARY}</code> beyond <code>origin/main</code>,
in reverse git-log order (oldest first). Changed files are relative to each commit's first parent.</p>
<p>{counts['Changed image']} changed images · {counts['Scene replay']} local scene replays ·
{counts['No visual']} placeholders. Replays show the initial view using assets available in the snapshot.</p>
</header><main><div class="grid">{''.join(cards)}</div>
<section class="related"><h2>Only on preview/scenes-gigapixel ({len(related)})</h2>
<p>Related commits not reachable from the primary branch; not included in the iteration count.</p>
<ul>{notes}</ul></section></main></body></html>
""", encoding="utf-8")
    contact_sheet(tiles, DOCS / "contact-sheet.png")
    print(f"iterations={len(tiles)} changed_images={counts['Changed image']} "
          f"scene_replays={counts['Scene replay']} placeholders={counts['No visual']}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chromium", help="Path to an installed Chromium or Chrome executable")
    parser.add_argument("--replay", nargs=3, metavar=("SHA", "ROUTE", "WORKSPACE"),
                        help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.replay:
        sha, route, temp = args.replay
        workspace = Path(temp)
        try:
            replay(sha, route, args.chromium, workspace / "capture.webp", workspace)
        except (OSError, ValueError, BrowserError, subprocess.CalledProcessError) as error:
            print(str(error), flush=True)
            log = workspace / "next.log"
            if log.exists():
                print(log.read_text(errors="replace")[-4000:])
            sys.exit(1)
    else:
        if not (ROOT / "node_modules/next/dist/bin/next").is_file():
            parser.error("Install the repository's dependencies first with npm ci --ignore-scripts")
        build(args.chromium)
