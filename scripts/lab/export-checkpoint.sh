#!/usr/bin/env bash
# Quackles Lab checkpoint export (#53). Use it while pushes are refused, or whenever a wave ends.
#
#   scripts/lab/export-checkpoint.sh OUT_DIR BASE_BUNDLE RUN_DIR...
#
# OUT_DIR      new, empty directory for the export
# BASE_BUNDLE  a previous full bundle that contains nightly's history (used only for the restore test)
# RUN_DIR      results/<run-id> directories whose raw evidence belongs in this checkpoint
#
# Writes:
#   - a thin git bundle of the report head + every lab/53-* branch (prerequisite: nightly 71c9813a);
#   - an evidence tar.gz (raw receipts, traces, run.json and visual checks for RUN_DIRs, plus the lab tree at HEAD);
#   - a screens tar of the RUN_DIRs' end-of-trial screenshots;
#   - MANIFEST.md, COMMITS.txt, SHA256SUMS, and every file over 29 MiB split into parts (PARTS.SHA256SUMS).
# Then it restores everything in a fresh directory: base bundle + thin bundle into an empty repo (refs and trees must
# match), evidence and screens checksums, the patch -> SHA round trip, and the lab unit tests from the extracted tree.
set -euo pipefail
OUT=$1; BASE_BUNDLE=$2; shift 2; RUNS=("$@")
REPO=$(git rev-parse --show-toplevel); cd "$REPO"
NIGHTLY=71c9813ae8c216abe96740d96efd745a0ae3c77c
HEAD_REF=$(git symbolic-ref --short HEAD)
REFS=("$HEAD_REF" $(git for-each-ref --format='%(refname:short)' 'refs/heads/lab/53-*'))
[ -z "$(git status --porcelain)" ] || { echo "uncommitted changes: commit them first" >&2; exit 1; }
mkdir -p "$OUT"; [ -z "$(ls -A "$OUT")" ] || { echo "$OUT is not empty" >&2; exit 1; }
STAGE=$(mktemp -d); NAME=$(basename "$OUT"); E=$STAGE/$NAME-evidence; mkdir -p "$E/results" "$E/repo-at-head" "$E/environment"

git bundle create "$OUT/$NAME-thin.bundle" "${REFS[@]}" "^$NIGHTLY" 2>/dev/null
{ echo "# Commits beyond nightly $NIGHTLY (full IDs, author, committer, date)"
  for r in "${REFS[@]}"; do echo; echo "## $r -> $(git rev-parse "$r")"; git log --format='%H  author=%an <%ae>  committer=%cn <%ce>  date=%aI  %s' "$NIGHTLY..$r"; done; } > "$OUT/COMMITS.txt"

git archive HEAD experiments scripts/lab .gitignore package.json package-lock.json | tar -x -C "$E/repo-at-head"
for r in "${RUNS[@]}"; do tar -c --exclude='*/screens' "$r" | tar -x -C "$E"; done
SCREENS=$(for r in "${RUNS[@]}"; do find "$r" -path '*/screens/*.png'; done | sort)
[ -n "$SCREENS" ] && sha256sum $SCREENS > "$E/results/SCREENS.sha256"
{ echo "node=$(node -v)"; echo "chromium=$(/opt/pw-browsers/chromium --version 2>/dev/null || echo unknown)"
  echo "package-lock.sha256=$(sha256sum package-lock.json | cut -d' ' -f1)"; echo "os=$(uname -srm)"
  echo "cpu=$(grep -m1 'model name' /proc/cpuinfo | cut -d: -f2 | xargs) x$(nproc)"; echo "gpu=$([ -e /dev/dri ] && echo present || echo 'none (/dev/dri absent): SwiftShader')"
  echo "assets=kvnloo/quackles-assets@$(git -C ../quackles-assets rev-parse HEAD 2>/dev/null || echo unknown) tree blue/p0000000=$(git -C ../quackles-assets rev-parse HEAD:blue/p0000000 2>/dev/null || echo unknown)"; } > "$E/environment/ENV.txt"
{ for d in "$REPO" $(git worktree list --porcelain | awk '/^worktree /{print $2}'); do echo "== $d $(git -C "$d" rev-parse HEAD)"; git -C "$d" status --porcelain --untracked-files=all | grep -v ' node_modules$' || echo "(clean)"; done; } > "$E/environment/UNCOMMITTED.txt"
cat > "$OUT/MANIFEST.md" <<EOF
# Quackles Lab #53 checkpoint \`$NAME\`

Made on $(date -u +%FT%TZ) from the report head \`$(git rev-parse HEAD)\`.

## Refs

$(for r in "${REFS[@]}"; do echo "- \`$r\` \`$(git rev-parse "$r")\`"; done)

## Files

- \`$NAME-thin.bundle\`: every ref above. Its prerequisite is nightly \`$NIGHTLY\`, which is on GitHub and in the checkpoint-1 full bundle (\`quackles-lab53-full.bundle\`).
- \`$NAME-evidence.tar.gz\`: raw receipts, traces, \`run.json\` and visual checks for $(printf '`%s` ' "${RUNS[@]}"). It also holds the complete lab tree at HEAD (\`experiments/\`: RESEARCH.md, issue comment drafts, candidate patches, all summaries; \`scripts/lab/\`: runner, tapes, this script), plus the environment and an uncommitted-state check.
- \`$NAME-screens.tar\`: the end-of-trial screenshots of those runs, listed in \`results/SCREENS.sha256\` inside the evidence archive.
- \`COMMITS.txt\` and \`SHA256SUMS\`. Files over 29 MiB are split into \`*.part-NN\` files, with \`PARTS.SHA256SUMS\`.

## Restore

\`\`\`bash
sha256sum -c PARTS.SHA256SUMS   # if split
for f in *.part-00; do cat "\${f%.part-00}".part-* > "\${f%.part-00}"; done
sha256sum -c SHA256SUMS
git init lab && cd lab
git fetch ../quackles-lab53-full.bundle 'refs/heads/*:refs/heads/*'          # checkpoint 1 (nightly history)
git fetch ../$NAME-thin.bundle 'refs/heads/*:refs/heads/*'                  # this checkpoint
\`\`\`
EOF
cp "$OUT/MANIFEST.md" "$OUT/COMMITS.txt" "$E/"
(cd "$E" && find . -type f ! -name MANIFEST.sha256 | sort | xargs sha256sum > MANIFEST.sha256)
tar -C "$STAGE" -czf "$OUT/$NAME-evidence.tar.gz" "$NAME-evidence"
[ -n "$SCREENS" ] && tar -cf "$OUT/$NAME-screens.tar" $SCREENS
(cd "$OUT" && sha256sum * > SHA256SUMS)

# ---- restore test in a fresh directory -------------------------------------------------------------------------------
T=$(mktemp -d); cp "$OUT"/* "$T"/; cd "$T"
sha256sum -c --quiet SHA256SUMS && echo "restore: SHA256SUMS ok"
git init -q r && cd r
git fetch -q "$BASE_BUNDLE" 'refs/heads/*:refs/heads/base/*'
git bundle verify "../$NAME-thin.bundle" >/dev/null 2>&1 && echo "restore: thin bundle verifies on the base"
git fetch -q "../$NAME-thin.bundle" 'refs/heads/*:refs/heads/*'
for r in "${REFS[@]}"; do [ "$(git rev-parse "$r")" = "$(git -C "$REPO" rev-parse "$r")" ] && [ "$(git rev-parse "$r^{tree}")" = "$(git -C "$REPO" rev-parse "$r^{tree}")" ] && echo "restore: $r ok" || { echo "restore: $r MISMATCH"; exit 1; }; done
git fsck --no-dangling >/dev/null 2>&1 && echo "restore: fsck ok"
cd "$T" && tar -xzf "$NAME-evidence.tar.gz" && (cd "$NAME-evidence" && sha256sum -c --quiet MANIFEST.sha256) && echo "restore: evidence manifest ok"
if [ -f "$NAME-screens.tar" ]; then mkdir sc && tar -xf "$NAME-screens.tar" -C sc && (cd sc && sha256sum -c --quiet "../$NAME-evidence/results/SCREENS.sha256") && echo "restore: screens ok"; fi
cd "$T/r" && for p in "$T/$NAME-evidence/repo-at-head/experiments/candidates/"*.patch; do
  want=$(head -1 "$p" | cut -d' ' -f2); parent=$(git -C "$REPO" rev-parse "$want^")
  git checkout -q --detach "$parent" && git -c user.name=Claude -c user.email=noreply@anthropic.com am -q --committer-date-is-author-date "$p" && [ "$(git rev-parse HEAD)" = "$want" ] && echo "restore: $(basename "$p") -> $want ok" || { echo "restore: $(basename "$p") MISMATCH"; exit 1; }
done
(cd "$T/$NAME-evidence/repo-at-head" && node --test scripts/lab/lab.test.mjs 2>&1 | grep -E '^# (pass|fail)' | sed 's/^/restore: lab tests /')

# ---- split for delivery ----------------------------------------------------------------------------------------------
cd "$OUT"; for f in *; do [ "$(stat -c %s "$f")" -gt 30408704 ] && split -b 29M -d -a 2 "$f" "$f.part-" && rm "$f"; done
ls *.part-* >/dev/null 2>&1 && sha256sum *.part-* > PARTS.SHA256SUMS
rm -rf "$STAGE" "$T"; ls -la "$OUT"
