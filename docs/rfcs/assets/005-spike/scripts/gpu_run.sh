#!/bin/bash
# gpu_run.sh NEED_MIB cmd...   Wait (lock NOT held) until NEED_MIB VRAM is free, then run cmd under the shared GPU lock.
# Re-checks inside the lock; if VRAM vanished meanwhile, releases the lock immediately and waits again.
need=$1; shift
free() { nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits | head -1; }
while true; do
  until [ "$(free)" -ge "$need" ]; do sleep 15; done
  flock /tmp/claude-1000/gpu.lock bash -c '[ "$(nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits | head -1)" -ge '"$need"' ] || exit 75; exec "$@"' _ "$@"
  rc=$?; [ $rc -ne 75 ] && exit $rc
  echo "gpu_run: VRAM taken while waiting for lock; retrying" >&2
done
