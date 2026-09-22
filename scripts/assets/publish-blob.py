#!/usr/bin/env python3
"""
Publish DZI WebP tiles to Vercel Blob.

Reads tile manifests from the asset pyramid and uploads them to a Vercel Blob
store.  Parallelizes uploads for speed.

Usage:
  python3 scripts/assets/publish-blob.py [--store <name>] [--dry-run] [--concurrency N]

Environment variables:
  BLOB_READ_WRITE_TOKEN  – Vercel Blob read/write token

The tile layout expected:
  <asset_root>/<theme>/<frame_id>/{level}/{x}_{y}.webp

Example:
  /mnt/zer0models/quackles-200mp/dzi-webp/blue/p0000000/0/0_0.webp
"""

import argparse
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urljoin

# ---------------------------------------------------------------------------
# Vercel Blob REST API helpers
# ---------------------------------------------------------------------------

BLOB_API_BASE = "https://blob.vercel-storage.com"


def blob_auth():
    token = os.environ.get("BLOB_READ_WRITE_TOKEN")
    if not token:
        print("ERROR: BLOB_READ_WRITE_TOKEN not set", file=sys.stderr)
        sys.exit(1)
    return token


def blob_put(store: str, pathname: str, data: bytes, token: str, overwrite: bool = True):
    """Upload a single file to Vercel Blob."""
    import urllib.request
    import urllib.error

    url = f"{BLOB_API_BASE}/v1/stores/{store}/blobs/{pathname}"
    req = urllib.request.Request(
        url,
        data=data,
        method="PUT",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/octet-stream",
            "x-vercel-allow-overwrite": "true" if overwrite else "false",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            if resp.status not in (200, 201):
                return {"error": f"unexpected status {resp.status}", "pathname": pathname}
            return {"ok": True, "pathname": pathname, "url": resp.headers.get("Location", "")}
    except urllib.error.HTTPError as e:
        return {"error": f"HTTP {e.code}: {e.reason}", "pathname": pathname}
    except Exception as e:
        return {"error": str(e), "pathname": pathname}


def blob_list(store: str, prefix: str, token: str):
    """List blobs in a store under a prefix."""
    import urllib.request
    import urllib.parse

    url = f"{BLOB_API_BASE}/v1/stores/{store}/blobs"
    params = urllib.parse.urlencode({"prefix": prefix})
    req = urllib.request.Request(f"{url}?{params}", headers={
        "Authorization": f"Bearer {token}",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
            return data.get("blobs", [])
    except Exception as e:
        print(f"WARNING: blob list failed: {e}", file=sys.stderr)
        return []


# ---------------------------------------------------------------------------
# Tile discovery
# ---------------------------------------------------------------------------

def discover_tiles(root: Path, pattern: str = "**/*.webp"):
    """Yield (relative_path, absolute_path) for every WebP tile under root."""
    if not root.is_dir():
        print(f"ERROR: tile root not found: {root}", file=sys.stderr)
        sys.exit(1)

    assets = []
    for path in sorted(root.glob(pattern)):
        if path.is_file():
            rel = path.relative_to(root)
            assets.append((str(rel), path))
    return assets


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Publish DZI WebP tiles to Vercel Blob")
    parser.add_argument("--store", default="quackles-assets", help="Vercel Blob store name")
    parser.add_argument("--root", default=None, help="Root directory containing tile pyramid")
    parser.add_argument("--dry-run", action="store_true", help="List tiles without uploading")
    parser.add_argument("--concurrency", type=int, default=16, help="Parallel upload workers")
    parser.add_argument("--prefix", default="", help="Blob key prefix (e.g. blue/)")
    args = parser.parse_args()

    token = blob_auth()

    # Determine tile root
    if args.root:
        tile_root = Path(args.root)
    else:
        # Default: look for common locations
        candidates = [
            Path("/mnt/zer0models/quackles-200mp/dzi-webp"),
            Path("/home/kvn/zer0/assets/dzi-webp"),
        ]
        tile_root = None
        for c in candidates:
            if c.is_dir():
                tile_root = c
                break
        if tile_root is None:
            print("ERROR: tile root not specified and no default found", file=sys.stderr)
            print("Use --root /path/to/tiles", file=sys.stderr)
            sys.exit(1)

    print(f"Tile root: {tile_root}")
    print(f"Store: {args.store}")
    print(f"Concurrency: {args.concurrency}")
    print(f"Dry run: {args.dry_run}")
    print()

    tiles = discover_tiles(tile_root)
    print(f"Found {len(tiles)} tiles")

    if not tiles:
        print("No tiles to publish")
        return

    # Show a sample
    sample = tiles[:3]
    for rel, abs_path in sample:
        print(f"  {rel} ({abs_path.stat().st_size} bytes)")
    if len(tiles) > 3:
        print(f"  ... and {len(tiles) - 3} more")

    if args.dry_run:
        print("\nDry run — no uploads performed")
        return

    # Upload
    started = time.time()
    success = 0
    failed = 0
    errors = []

    with ThreadPoolExecutor(max_workers=args.concurrency) as executor:
        futures = {}
        for rel, abs_path in tiles:
            blob_path = f"{args.prefix}{rel}" if args.prefix else rel
            data = abs_path.read_bytes()
            futures[executor.submit(blob_put, args.store, blob_path, data, token)] = rel

        for future in as_completed(futures):
            rel = futures[future]
            try:
                result = future.result()
            except Exception as e:
                result = {"error": str(e)}

            if result.get("ok"):
                success += 1
            else:
                failed += 1
                errors.append(f"{rel}: {result.get('error', 'unknown')}")

            if (success + failed) % 50 == 0:
                elapsed = time.time() - started
                rate = (success + failed) / elapsed if elapsed > 0 else 0
                print(f"  Progress: {success + failed}/{len(tiles)} ({rate:.1f} tiles/s)")

    elapsed = time.time() - started
    print()
    print(f"Complete: {success} success, {failed} failed in {elapsed:.1f}s")
    if errors:
        print("\nErrors:")
        for e in errors[:20]:
            print(f"  {e}")
        if len(errors) > 20:
            print(f"  ... and {len(errors) - 20} more")

    if failed > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
