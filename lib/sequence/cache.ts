import type { ImageAsset } from "./manifest";

export const DECODED_BUDGET = 96 * 1024 * 1024;
const COMPRESSED_BUDGET = 128 * 1024 * 1024;
const HIGH_TIER = 12 * 1024 * 1024;
export type Decoded = { key: string; asset: ImageAsset; bitmap: ImageBitmap; bytes: number; touched: number };
type Job = { asset: ImageAsset; priority: number; bytes: number; reserved: boolean; controller: AbortController; resolve: (image: Decoded) => void; reject: (error: Error) => void; promise: Promise<Decoded>; active: boolean };

class CompressedCache {
  private cache: Promise<Cache | null>;
  private sizes = new Map<string, number>();
  private writes: Promise<void> = Promise.resolve();
  bytes = 0;
  constructor(revision: string) {
    this.cache = this.open(revision);
  }
  private async open(revision: string) {
    if (!("caches" in window)) return null;
    try {
      const name = `quackles-sequence-${revision}`;
      const cache = await caches.open(name);
      const keys = await cache.keys();
      for (const key of keys) {
        const response = await cache.match(key);
        const bytes = Number(response?.headers.get("x-sequence-bytes")) || 0;
        this.sizes.set(key.url, bytes); this.bytes += bytes;
      }
      while (this.bytes > COMPRESSED_BUDGET) {
        const oldest = this.sizes.entries().next().value;
        if (!oldest) break;
        await cache.delete(oldest[0]); this.sizes.delete(oldest[0]); this.bytes -= oldest[1];
      }
      for (const previous of await caches.keys())
        if (previous.startsWith("quackles-sequence-") && previous !== name) await caches.delete(previous);
      return cache;
    } catch { return null; }
  }
  async read(url: string) {
    try {
      const cache = await this.cache, response = await cache?.match(url);
      if (!response) return null;
      const size = this.sizes.get(url) ?? 0;
      this.sizes.delete(url); this.sizes.set(url, size);
      return await response.blob();
    } catch { return null; }
  }
  write(url: string, blob: Blob) {
    this.writes = this.writes.then(async () => {
      const cache = await this.cache;
      if (!cache || blob.size > COMPRESSED_BUDGET) return;
      const previous = this.sizes.get(url) ?? 0;
      if (previous) { await cache.delete(url); this.sizes.delete(url); this.bytes -= previous; }
      while (this.bytes + blob.size > COMPRESSED_BUDGET && this.sizes.size) {
        const oldest = this.sizes.entries().next().value;
        if (!oldest) break;
        await cache.delete(oldest[0]); this.sizes.delete(oldest[0]); this.bytes -= oldest[1];
      }
      await cache.put(url, new Response(blob, { headers: { "content-type": blob.type, "x-sequence-bytes": String(blob.size) } }));
      this.sizes.set(url, blob.size); this.bytes += blob.size;
    }).catch(() => {});
  }
}

export class FrameCache {
  private decoded = new Map<string, Decoded>();
  private jobs = new Map<string, Job>();
  private pinned = new Set<string>();
  private wanted = new Set<string>();
  private disk: CompressedCache;
  private disposed = false;
  private active = 0;
  private highActive = 0;
  private used = 0;
  private reserved = 0;
  private staleDiscard = 0;
  private maxBytes = 0;
  private maxInflight = 0;
  private maxHighTierInflight = 0;
  private decoding = 0;
  private maxDecoding = 0;
  private networkRequests = 0;
  private completedDecodes = 0;
  private closedBitmaps = 0;
  private failures = 0;
  constructor(revision: string) { this.disk = new CompressedCache(revision); }
  peek(key: string): Decoded | undefined {
    const image = this.decoded.get(key);
    if (image) image.touched = performance.now();
    return image;
  }
  pin(keys: Iterable<string>) { this.pinned = new Set(keys); this.pump(); }
  retain(keys: Iterable<string>) {
    this.wanted = new Set(keys);
    for (const [key, job] of this.jobs) {
      if (this.wanted.has(key) || this.pinned.has(key)) continue;
      job.controller.abort();
      if (!job.active) { this.jobs.delete(key); job.reject(new DOMException("Frame superseded", "AbortError")); }
    }
    this.pump();
  }
  load(asset: ImageAsset, priority = 0): Promise<Decoded> {
    const cached = this.peek(asset.url);
    if (cached) return Promise.resolve(cached);
    const existing = this.jobs.get(asset.url);
    if (existing) { existing.priority = Math.max(existing.priority, priority); return existing.promise; }
    if (this.disposed) return Promise.reject(new DOMException("Player disposed", "AbortError"));
    const bytes = asset.width * asset.height * 4;
    if (bytes > DECODED_BUDGET) return Promise.reject(new Error("Full image exceeds the decoded budget; use tiles"));
    let resolve!: Job["resolve"], reject!: Job["reject"];
    const promise = new Promise<Decoded>((success, failure) => { resolve = success; reject = failure; });
    this.jobs.set(asset.url, { asset, priority, bytes, reserved: false, controller: new AbortController(), resolve, reject, promise, active: false });
    this.pump();
    return promise;
  }
  private room(bytes: number) {
    const evictable = [...this.decoded.values()].filter((image) => !this.pinned.has(image.key)).sort((a, b) => a.touched - b.touched);
    while (this.used + this.reserved + bytes > DECODED_BUDGET && evictable.length) {
      const image = evictable.shift()!;
      this.decoded.delete(image.key); this.used -= image.bytes; this.close(image.bitmap);
    }
    return this.used + this.reserved + bytes <= DECODED_BUDGET;
  }
  private pump() {
    if (this.disposed) return;
    const pending = [...this.jobs.values()].filter((job) => !job.active).sort((a, b) => b.priority - a.priority);
    for (const job of pending) {
      if (this.active >= 3) break;
      const high = job.bytes >= HIGH_TIER;
      if ((high && this.highActive) || !this.room(job.bytes)) continue;
      job.active = true; this.active++; if (high) this.highActive++;
      this.maxInflight = Math.max(this.maxInflight, this.active); this.maxHighTierInflight = Math.max(this.maxHighTierInflight, this.highActive);
      job.reserved = true; this.reserved += job.bytes; this.maxBytes = Math.max(this.maxBytes, this.used + this.reserved);
      void this.run(job).finally(() => {
        this.active--; if (high) this.highActive--;
        if (job.reserved) this.reserved -= job.bytes;
        this.jobs.delete(job.asset.url); this.pump();
      });
    }
  }
  private async run(job: Job) {
    try {
      let blob = await this.disk.read(job.asset.url);
      if (!blob) {
        this.networkRequests++;
        const response = await fetch(job.asset.url, { signal: job.controller.signal });
        if (!response.ok) throw new Error(`Frame request failed: ${response.status}`);
        blob = await response.blob();
        this.disk.write(job.asset.url, blob);
      }
      job.controller.signal.throwIfAborted();
      this.decoding++; this.maxDecoding = Math.max(this.maxDecoding, this.decoding);
      let bitmap: ImageBitmap;
      try { bitmap = await createImageBitmap(blob); this.completedDecodes++; }
      finally { this.decoding--; }
      if (this.disposed || job.controller.signal.aborted) {
        this.close(bitmap); this.staleDiscard++;
        throw new DOMException("Decoded frame superseded", "AbortError");
      }
      if (bitmap.width !== job.asset.width || bitmap.height !== job.asset.height) {
        this.close(bitmap); throw new Error("Decoded frame dimensions differ from manifest");
      }
      const image = { key: job.asset.url, asset: job.asset, bitmap, bytes: job.bytes, touched: performance.now() };
      this.reserved -= job.bytes; job.reserved = false;
      this.decoded.set(image.key, image); this.used += job.bytes;
      job.resolve(image);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) this.failures++;
      job.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }
  private close(bitmap: ImageBitmap) { bitmap.close(); this.closedBitmaps++; }
  stats() {
    return { decodedBytes: this.used, reservedBytes: this.reserved, totalBytes: this.used + this.reserved, budgetBytes: DECODED_BUDGET, maxBytes: this.maxBytes, pinnedBytes: [...this.pinned].reduce((sum, key) => sum + (this.decoded.get(key)?.bytes ?? 0), 0), entries: this.decoded.size, inflight: this.active, maxInflight: this.maxInflight, queued: this.jobs.size - this.active, highTierInflight: this.highActive, maxHighTierInflight: this.maxHighTierInflight, decoding: this.decoding, maxDecoding: this.maxDecoding, networkRequests: this.networkRequests, completedDecodes: this.completedDecodes, closedBitmaps: this.closedBitmaps, staleDiscard: this.staleDiscard, failures: this.failures, compressedBytes: this.disk.bytes, compressedBudgetBytes: COMPRESSED_BUDGET };
  }
  dispose() {
    this.disposed = true;
    for (const job of this.jobs.values()) {
      job.controller.abort();
      if (!job.active) job.reject(new DOMException("Player disposed", "AbortError"));
    }
    this.decoded.forEach((image) => this.close(image.bitmap)); this.decoded.clear(); this.used = 0;
  }
}
