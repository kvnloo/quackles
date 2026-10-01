#!/usr/bin/env bash
# Rebuild tools/compiler/registry from today's local masters (RFC-001 / #44).
# Registers every known master, attaches the shipped plates/pyramids as claims,
# verifies them, and promotes only what the gate ACCEPTs. CPU only, ~4 min cold.
# Needs /mnt/zer0models (masters are never committed). Exit status is 0 even though
# five verifications REFUSE: those refusals are the expected, recorded outcome.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)
C="python3 $here/compile.py"
GP=/mnt/zer0models/quackles-1gp
A=$GP/assets-repo
SEQ=$repo/public/preview-scene/sequence

# Blue ~201MP: the accepted control (D1/D2).
$C register blue-201mp --theme blue --family legacy-201mp --source /mnt/zer0models/quackles-200mp/blue-p0-200mp.png \
  --sidecar /mnt/zer0models/quackles-200mp/blue-p0-200mp.json --recipe "blender/render_blue_200mp.py@72b0786" \
  --notes "Accepted Blue control (DECISIONS D1/D2). Rendered as 2x2 crops, stitched."
$C derive blue-201mp plate --adopt "$SEQ/cinematic-proof-v2/blue/p0000000-1024.webp" --url cinematic-proof-v2/blue/p0000000-1024.webp
$C derive blue-201mp pyramid --adopt "$A/blue/p0000000" --url /quackles-assets/blue/p0000000
blue=$($C verify blue-201mp --plate "$SEQ/cinematic-proof-v2/blue/p0000000-1024.webp" --pyramid "$A/blue/p0000000" | head -1)
echo "$blue"

# Hidden mushroom egg: 1GP rendered from its own scene (D8 still open with the owner).
$C register mushroom-1gp-r1 --theme mushroom --family gp-1gp --source $GP/mushroom/chunks --recipe render_1gp.py \
  --notes "Hidden egg scene. Audited against its authored plate; DECISIONS D8 open."
$C derive mushroom-1gp-r1 plate --adopt "$SEQ/hidden/night-moss.png" --url hidden/night-moss.png
$C derive mushroom-1gp-r1 pyramid --adopt "$A/mushroom/p0000000/gp" --url /quackles-assets/mushroom/p0000000/gp
mush=$($C verify mushroom-1gp-r1 --plate "$SEQ/hidden/night-moss.png" --pyramid "$A/mushroom/p0000000/gp" | head -1)
echo "$mush"

# The historical 1GP renders for the five themes (studio scene drift, #43). Registered so
# their tiles have an identity; verified against today's plates; expected to REFUSE.
for t in day white blue dark night; do
  $C register "$t-1gp-r1" --theme "$t" --family gp-1gp --source "$GP/$t/chunks" --recipe render_1gp.py \
    --notes "Historical 1GP render (quality-final-* studio scene, not the theme's cinematic plate scene)."
  $C derive "$t-1gp-r1" plate --adopt "$SEQ/cinematic-proof-v2/$t/p0000000-1024.webp"
  $C derive "$t-1gp-r1" pyramid --adopt "$A/$t/p0000000/gp" --url "/quackles-assets/$t/p0000000/gp"
  $C verify "$t-1gp-r1" --plate "$SEQ/cinematic-proof-v2/$t/p0000000-1024.webp" --pyramid "$A/$t/p0000000/gp" | head -1 || true
done

$C promote "$(echo "$blue" | awk '{print $NF}')"
$C promote "$(echo "$mush" | awk '{print $NF}')"
$C check-manifest "$SEQ/manifest.json" --policy "$repo/lib/sequence/inspection-source.ts" --root "$SEQ" --hidden "$SEQ/hidden-pyramids.json" >/dev/null \
  && echo "INVARIANT OK"
