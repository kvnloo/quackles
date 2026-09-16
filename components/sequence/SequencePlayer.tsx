/* eslint-disable @next/next/no-img-element -- The fallback is an authored, statically exported Cycles still. */
"use client";
import { useEffect, useRef } from "react";
import { assetPath } from "@/lib/paths";
import { BUILD_SHA } from "@/lib/build-info";
import { DECODED_BUDGET, FrameCache } from "@/lib/sequence/cache";
import { frameAt, imageAt, isImage, parseManifest, THEME_IDS, type ImageAsset, type SequenceManifest, type ThemeId } from "@/lib/sequence/manifest";
import { detailPlan, paintBase, paintDetail, viewportCrop } from "@/lib/sequence/render";
import { applyPalette, configure, selectTheme, setProgress, snapshot, subscribe } from "@/lib/sequence/store";
import { applyStoryProgress } from "./SequenceScroll";

type FrameState = { frameId: string; frameProgress: number; progress: number; themes: ThemeId[]; mix: number; tierWidth: number; generation: number; urls: string[] };
type PlayerState = { ready: boolean; manifestId: string | null; frameCount: number; frames: { id: string; progress: number; phase: string }[]; requested: FrameState | null; rendered: FrameState | null; detailWidth: number; detailTiles: number; drawCount: number; errors: string[]; stalePaints: number };
type SequenceDebug = {
  setProgress: (value: number) => void;
  setTheme: (id: ThemeId) => void;
  getState: () => PlayerState & { current: ReturnType<typeof snapshot>; cache: ReturnType<FrameCache["stats"]> | null; surfaceBytes: number; zoom: number };
};
declare global { interface Window { __QUACKLES_SEQUENCE__?: SequenceDebug } }

export function SequencePlayer() {
  const host = useRef<HTMLDivElement>(null), base = useRef<HTMLCanvasElement>(null), detail = useRef<HTMLCanvasElement>(null), fallback = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const container = host.current, baseCanvas = base.current, detailCanvas = detail.current;
    if (!container || !baseCanvas || !detailCanvas) return;
    let manifest: SequenceManifest | null = null, cache: FrameCache | null = null;
    let cancelled = false, pendingFrame = 0, settleTimer = 0, settled = true, generation = 0;
    let intentKey = "", loadIntentKey = "", baseKey = "", detailKey = "";
    let paintedKeys: string[] = [], detailKeys: string[] = [];
    const waiting = new Set<string>(), failed = new Set<string>();
    const state: PlayerState = { ready: false, manifestId: null, frameCount: 0, frames: [], requested: null, rendered: null, detailWidth: 0, detailTiles: 0, drawCount: 0, errors: [], stalePaints: 0 };
    const schedule = () => { if (!pendingFrame && !cancelled) pendingFrame = requestAnimationFrame(render); };
    const request = (asset: ImageAsset, priority: number) => {
      if (!cache || cache.peek(asset.url) || waiting.has(asset.url) || failed.has(asset.url)) return;
      waiting.add(asset.url);
      void cache.load(asset, priority).catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          failed.add(asset.url); state.errors.push(error instanceof Error ? error.message : String(error));
          if (state.errors.length > 32) state.errors.shift();
        }
      }).finally(() => { waiting.delete(asset.url); schedule(); });
    };
    function render() {
      pendingFrame = 0;
      if (!manifest || !cache || cancelled) return;
      const current = snapshot(), frame = frameAt(manifest, current.progress, current.reducedMotion);
      const nextLoadIntent = `${frame.id}/${current.target}`;
      if (nextLoadIntent !== loadIntentKey) { loadIntentKey = nextLoadIntent; failed.clear(); }
      const low = Math.floor(current.theme), high = Math.ceil(current.theme), mix = current.theme - low;
      const indices = low === high ? [low] : [low, high];
      const themes = indices.map((i) => THEME_IDS[i]);
      const assets = themes.map((theme) => imageAt(frame, theme, 1024));
      const rect = container!.getBoundingClientRect(), crop = viewportCrop(container!);
      const desiredWidth = Math.ceil(rect.width * devicePixelRatio * crop.scale);
      const nextIntent = `${frame.id}/${current.theme}/${desiredWidth}`;
      if (nextIntent !== intentKey) { intentKey = nextIntent; generation++; }
      state.requested = { frameId: frame.id, frameProgress: frame.progress, progress: current.progress, themes, mix, tierWidth: desiredWidth, generation, urls: assets.map((asset) => asset.url) };
      const tasks = assets.map((asset) => ({ asset, priority: 100 }));
      let detailVariant: ReturnType<typeof imageAt> | Exclude<(typeof frame.assets.white)[number], ImageAsset> | null = null;
      let detailTasks: { asset: ImageAsset; x: number; y: number }[] = [];
      if (settled && low === high && crop.width > 0 && crop.height > 0 && desiredWidth > assets[0].width) {
        const plan = detailPlan(frame.assets[themes[0]], desiredWidth, crop, DECODED_BUDGET - assets[0].width * assets[0].height * 4);
        if (plan && plan.variant.width > assets[0].width) {
          detailVariant = plan.variant;
          detailTasks = plan.tasks;
          tasks.push(...detailTasks.map(({ asset }) => ({ asset, priority: 90 })));
        }
      }
      const center = manifest.frames.indexOf(frame), selected = Math.round(current.target);
      for (const offset of [1, -1, 2]) {
        const adjacent = manifest.frames[center + offset];
        if (adjacent) tasks.push({ asset: imageAt(adjacent, THEME_IDS[selected], 1024), priority: 20 - Math.abs(offset) });
      }
      for (const offset of [-1, 1]) {
        const theme = THEME_IDS[selected + offset];
        if (theme) tasks.push({ asset: imageAt(frame, theme, 1024), priority: 30 });
      }
      // Canvas keeps the complete previous picture while its decoded tiles can be evicted.
      cache.pin([...assets.map((asset) => asset.url), ...detailTasks.map(({ asset }) => asset.url)]);
      cache.retain(tasks.map(({ asset }) => asset.url));
      for (const task of tasks) request(task.asset, task.priority);
      const images = assets.map((asset) => cache!.peek(asset.url));
      const nextBase = `${frame.id}/${current.theme}/${rect.width}/${devicePixelRatio}`;
      if (images.every((image) => image !== undefined) && nextBase !== baseKey) {
        paintBase(baseCanvas!, images, mix, rect.width);
        applyPalette(current.theme);
        baseKey = nextBase; paintedKeys = assets.map((asset) => asset.url);
        detailCanvas!.style.visibility = "hidden"; detailCanvas!.width = 1; detailCanvas!.height = 1; detailKeys = []; detailKey = "";
        state.detailWidth = 0; state.detailTiles = 0;
        state.ready = true; state.drawCount++;
        state.rendered = { ...state.requested, tierWidth: assets[0].width, urls: [...paintedKeys] };
        if (fallback.current) fallback.current.style.visibility = "hidden";
        baseCanvas!.style.visibility = "visible";
      }
      if (baseKey === nextBase) applyStoryProgress(current.reducedMotion ? current.progress : frame.progress);
      if (detailVariant && detailTasks.length && baseKey === nextBase) {
        const decoded = detailTasks.map((task) => ({ ...task, image: cache!.peek(task.asset.url) }));
        const nextDetail = `${frame.id}/${low}/${detailVariant.width}/${JSON.stringify(crop)}`;
        if (decoded.every((task) => task.image !== undefined) && nextDetail !== detailKey) {
          paintDetail(detailCanvas!, container!, crop, detailVariant, decoded.map(({ image, x, y }) => ({ image: image!, x, y })));
          detailKey = nextDetail; detailKeys = detailTasks.map(({ asset }) => asset.url);
          state.detailWidth = detailVariant.width; state.detailTiles = isImage(detailVariant) ? 0 : detailTasks.length; state.drawCount++;
          if (state.rendered) state.rendered = { ...state.rendered, tierWidth: detailVariant.width, urls: [...paintedKeys, ...detailKeys], generation };
        }
      }
    }
    const changed = () => {
      settled = false; window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => { settled = true; schedule(); }, 140);
      schedule();
    };
    const unsubscribe = subscribe(changed);
    const observer = new ResizeObserver(changed); observer.observe(container);
    visualViewport?.addEventListener("resize", changed);
    visualViewport?.addEventListener("scroll", changed);
    window.__QUACKLES_SEQUENCE__ = {
      setProgress(value) { scrollTo({ top: Math.max(0, Math.min(1, value)) * Math.max(1, document.documentElement.scrollHeight - innerHeight), behavior: "instant" }); setProgress(value); },
      setTheme: selectTheme,
      getState: () => ({ ...state, current: snapshot(), cache: cache?.stats() ?? null, surfaceBytes: (baseCanvas.width * baseCanvas.height + detailCanvas.width * detailCanvas.height) * 4, zoom: visualViewport?.scale ?? 1 }),
    };
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(assetPath(`/preview-scene/sequence/manifest.json?v=${encodeURIComponent(BUILD_SHA)}`), { signal: controller.signal });
        if (!response.ok) throw new Error(`Sequence manifest failed: ${response.status}`);
        const parsed = parseManifest(await response.json(), response.url);
        if (cancelled) return;
        manifest = parsed; cache = new FrameCache(parsed.id);
        state.manifestId = parsed.id; state.frameCount = parsed.frames.length;
        state.frames = parsed.frames.map(({ id, progress, phase }) => ({ id, progress, phase }));
        configure(parsed); schedule();
      } catch (error) {
        if (!cancelled) state.errors.push(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => {
      cancelled = true; controller.abort(); unsubscribe(); observer.disconnect();
      cancelAnimationFrame(pendingFrame); clearTimeout(settleTimer);
      visualViewport?.removeEventListener("resize", changed); visualViewport?.removeEventListener("scroll", changed);
      delete window.__QUACKLES_SEQUENCE__; cache?.dispose();
    };
  }, []);
  return <div ref={host} className="sequence-player" data-testid="sequence-player">
    <img ref={fallback} className="poster-plate" src={assetPath("/preview-scene/frame-white-1536.webp")} width={1536} height={2304} alt="Microduck in the rendered studio" fetchPriority="high" />
    <canvas ref={base} className="sequence-base" role="img" aria-label="Rendered Microduck sequence" />
    <canvas ref={detail} className="sequence-detail" aria-hidden />
  </div>;
}
