# Gigapixel iteration archive

Open `docs/gigapixel-timeline/index.html` directly in a browser, or skim
`docs/gigapixel-timeline/contact-sheet.png`. Expand a card to see its file list.

From the repository root, with the three origin refs present, Node/npm, and Python 3.12+:

```sh
npm ci --ignore-scripts
python3 -m venv "${TMPDIR:-/tmp}/quackles-timeline-venv"
. "${TMPDIR:-/tmp}/quackles-timeline-venv/bin/activate"
pip install -r scripts/gigapixel-timeline/requirements.txt
python -m playwright install chromium
python scripts/gigapixel-timeline/build.py
python scripts/gigapixel-timeline/test_timeline.py --screenshot artifacts/gigapixel-timeline.png
```

An existing Chrome/Chromium can be used instead of installing one with
Playwright: pass `--chromium /path/to/chromium` to both scripts.

The builder reads the origin refs (not the current checkout's commits) and prefers
the first decodable changed raster image in Git path order. Otherwise it replays
the relevant web scene when a runtime path changed. Replay uses the archived
tree, the matching installed lockfile, and a local-only browser session. It is
limited to 60 seconds per scene, and does not load remote tile pyramids or
simulate gestures. A replay is evidence of the default view, not of every
interactive change in that commit. Run only against trusted history: historical
Next.js code executes in the local dev server.
