#!/bin/bash
# splatfacto on the Blue multi-view set; world frame kept (no auto-orient/centre/scale) so plan cameras render directly.
R=/mnt/zer0models/project-artifacts/quackles/process/analysis/rfc-005
. $R/venv/bin/activate
export XDG_CACHE_HOME=$R/cache/xdg TORCH_HOME=$R/cache/torch TMPDIR=$R/cache/tmp
name=${1:-sf15k}; iters=${2:-15000}; shift 2
cd $R && $R/scripts/gpu_run.sh 9000 ns-train splatfacto --experiment-name blue --timestamp $name \
  --max-num-iterations $iters --steps-per-save 7000 --save-only-latest-checkpoint False \
  --vis tensorboard --viewer.quit-on-train-completion True --output-dir $R/outputs "$@" \
  nerfstudio-data --data $R/data/blue --orientation-method none --center-method none --auto-scale-poses False \
  --downscale-factor 1 --load-3D-points True
