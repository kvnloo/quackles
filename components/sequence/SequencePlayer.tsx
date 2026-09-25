/* eslint-disable @next/next/no-img-element -- The fallback is an authored, statically exported Cycles still. */
"use client";
import { useEffect, useRef } from "react";
import { assetPath } from "@/lib/paths";
import { BUILD_SHA } from "@/lib/build-info";
import { FrameCache } from "@/lib/sequence/cache";
import { imageAt, isImage, parseManifest, spanAt, THEME_IDS, type ImageAsset, type SequenceManifest, type ThemeId } from "@/lib/sequence/manifest";
import { detailPlan, inspectionCrop, paintBase, paintDetail, tileAssets, viewportCrop } from "@/lib/sequence/render";
import { inspectionSnapshot, setInspectionMaxZoom, subscribeInspection } from "@/lib/sequence/inspection";
import { sequencePerfProfile, type SequencePerfProfile } from "@/lib/sequence/perf-profile";
import { applyPalette, configure, selectTheme, setProgress, snapshot, subscribe } from "@/lib/sequence/store";
import { applyStoryProgress } from "./SequenceScroll";

type FrameState = { frameId: string; frameProgress: number; progress: number; themes: ThemeId[]; mix: number; tierWidth: number; generation: number; urls: string[] };
type PlayerState = { ready: boolean; manifestId: string | null; frameCount: number; frames: { id: string; progress: number; phase: string }[]; requested: FrameState | null; rendered: FrameState | null; detailWidth: number; detailTiles: number; drawCount: number; errors: string[]; stalePaints: number };
type SequenceDebug = {
  setProgress: (value: number) => void;
  setTheme: (id: ThemeId) => void;
  getState: () => PlayerState & {
    current: ReturnType<typeof snapshot>;
    cache: ReturnType<FrameCache["stats"]> | null;
    surfaceBytes: number;
    zoom: number;
    inspection: ReturnType<typeof inspectionSnapshot>;
    profile: SequencePerfProfile;
  };
};
declare global { interface Window { __QUACKLES_SEQUENCE__?: SequenceDebug } }

export function SequencePlayer() {
  const host = useRef<HTMLDivElement>(null), base = useRef<HTMLCanvasElement>(null), detail = useRef<HTMLCanvasElement>(null), fallback = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const container = host.current, baseCanvas = base.current, detailCanvas = detail.current;
    if (!container || !baseCanvas || !detailCanvas) return;
    const profile = sequencePerfProfile();
    let manifest: SequenceManifest | null = null, cache: FrameCache | null = null;
    let cancelled = false, pendingFrame = 0, settleTimer = 0, settled = true, generation = 0;
    let inspectionSettleTimer = 0, inspectionSettled = true;
    let intentKey = "", loadIntentKey = "", baseKey = "", detailKey = "", inspectionIntentKey = "";
    let paintedKeys: string[] = [], detailKeys: string[] = [];
  const waiting = new Set<string>(), failed = new Set<string>(), warmed = new Set<string>();
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
    function warmTheme(theme: ThemeId) {
      if (!manifest || !cache || warmed.has(theme)) return;
      const hero = manifest.frames.find((item) => item.id === "p0000000") ?? manifest.frames[0];
      if (!hero) return;
      const tiled = hero.assets[theme].filter((variant) => !isImage(variant));
      if (!tiled.length) { warmed.add(theme); return; }
      warmed.add(theme);
      const mid = tiled.find((variant) => variant.width >= 2896) ?? tiled[0];
      const top = tiled[tiled.length - 1];
      if (isImage(mid) || isImage(top)) return;
      for (const tile of [
        ...tileAssets(mid, { x: 0, y: 0, width: 1, height: 1, scale: 1 }, 0),
        ...tileAssets(top, { x: 0.22, y: 0.18, width: 0.56, height: 0.5, scale: 4 }, 0),
      ]) cache.warm(tile.asset);
    }
    function render() {
      pendingFrame = 0;
      if (!manifest || !cache || cancelled) return;
      const current = snapshot(), span = spanAt(manifest, current.progress, current.reducedMotion);
      applyPalette(current.theme);
      const frame = span.mix < 0.5 ? span.before : span.after;
      const nextLoadIntent = `${frame.id}/${current.target}`;
      if (nextLoadIntent !== loadIntentKey) { loadIntentKey = nextLoadIntent; failed.clear(); }
      const low = Math.floor(current.theme), high = Math.ceil(current.theme), mix = current.theme - low;
      const indices = low === high ? [low] : [low, high];
      const themes = indices.map((i) => THEME_IDS[i]);
      const beforeAssets = themes.map((theme) => imageAt(span.before, theme, 1024));
      const afterAssets = span.mix > 0 && span.after !== span.before ? themes.map((theme) => imageAt(span.after, theme, 1024)) : [];
      const assets = [...beforeAssets, ...afterAssets];
      const rect = container!.getBoundingClientRect();
      const sourceWidths = themes.map((theme) =>
        Math.max(...frame.assets[theme].map((variant) => variant.width)),
      );
      const maxSourceWidth = Math.min(...sourceWidths);
      setInspectionMaxZoom(
        Math.min(
          profile.maxZoomCap,
          Math.max(
            1,
            maxSourceWidth / Math.max(1, rect.width * devicePixelRatio),
          ),
        ),
      );

      // Native pinch continues to use the visual viewport. Desktop product
      // inspection instead predicts the target camera crop, so Gigapixel tiles
      // can start decoding before the eased camera has physically arrived.
      const nativeCrop = viewportCrop(container!);
      const inspect = inspectionSnapshot();
      const crop =
        inspect.active || inspect.targetZoom > 1.0005
          ? inspectionCrop(
              inspect.targetZoom,
              inspect.targetFocusX,
              inspect.targetFocusY,
            )
          : nativeCrop;
      const desiredWidth = Math.min(
        profile.maxDetailWidth,
        Math.ceil(rect.width * devicePixelRatio * crop.scale),
      );
      const detailEligible =
        inspect.active ||
        inspect.targetZoom > 1.0005 ||
        nativeCrop.scale > 1.02;
      const nextIntent = `${span.before.id}/${span.after.id}/${span.mix}/${current.theme}/${desiredWidth}`;
      if (nextIntent !== intentKey) { intentKey = nextIntent; generation++; }
      state.requested = { frameId: frame.id, frameProgress: frame.progress, progress: current.progress, themes, mix, tierWidth: desiredWidth, generation, urls: assets.map((asset) => asset.url) };
      const tasks = assets.map((asset) => ({ asset, priority: 100 }));
      let detailVariant: ReturnType<typeof imageAt> | Exclude<(typeof frame.assets.white)[number], ImageAsset> | null = null;
      let detailTasks: { asset: ImageAsset; x: number; y: number; sourceX: number; sourceY: number }[] = [];
      if (detailEligible && low === high && span.mix === 0 && crop.width > 0 && crop.height > 0 && desiredWidth > beforeAssets[0].width) {
        const plan = detailPlan(
          frame.assets[themes[0]],
          desiredWidth,
          crop,
          profile.decodedBudgetBytes -
            beforeAssets[0].width * beforeAssets[0].height * 4,
          profile.tileOverscan,
          profile.maxDetailWidth,
        );
        if (plan && plan.variant.width > beforeAssets[0].width) {
          detailVariant = plan.variant;
          detailTasks = plan.tasks;
          tasks.push(...detailTasks.map(({ asset }) => ({ asset, priority: 90 })));
        }
      }
      const center = manifest.frames.indexOf(span.before), selected = Math.round(current.target);
      for (const offset of [1, -1, 2, 3]) {
        const adjacent = manifest.frames[center + offset];
        if (adjacent) tasks.push({ asset: imageAt(adjacent, THEME_IDS[selected], 1024), priority: 20 - Math.abs(offset) });
      }
      for (const offset of [-1, 1]) {
        const theme = THEME_IDS[selected + offset];
        if (theme) tasks.push({ asset: imageAt(frame, theme, 1024), priority: 30 });
      }
      cache.pin([...assets.map((asset) => asset.url), ...detailTasks.map(({ asset }) => asset.url)]);
      cache.retain(tasks.map(({ asset }) => asset.url));
      for (const task of tasks) request(task.asset, task.priority);
      const selectedTheme = THEME_IDS[selected];
      if (selectedTheme) warmTheme(selectedTheme);
      warmTheme("blue");
      const beforeImages = beforeAssets.map((asset) => cache!.peek(asset.url));
      const afterImages = afterAssets.map((asset) => cache!.peek(asset.url));
      const nextBase = `${span.before.id}/${span.after.id}/${span.mix.toFixed(3)}/${current.theme.toFixed(3)}/${rect.width}/${devicePixelRatio}`;
      if (beforeImages.every((image) => image !== undefined) && afterImages.every((image) => image !== undefined) && nextBase !== baseKey) {
        paintBase(baseCanvas!, beforeImages as NonNullable<(typeof beforeImages)[number]>[], afterImages.length ? afterImages as NonNullable<(typeof afterImages)[number]>[] : undefined, span.mix, mix, rect.width);
        applyPalette(current.theme);
        baseKey = nextBase; paintedKeys = assets.map((asset) => asset.url);
        detailCanvas!.style.visibility = "hidden"; detailCanvas!.width = 1; detailCanvas!.height = 1; detailKeys = []; detailKey = "";
        state.detailWidth = 0; state.detailTiles = 0;
        state.ready = true; state.drawCount++;
        state.rendered = { ...state.requested, tierWidth: beforeAssets[0].width, urls: [...paintedKeys] };
        if (fallback.current) fallback.current.style.visibility = "hidden";
        baseCanvas!.style.visibility = "visible";
        window.dispatchEvent(new Event("quackles:base-painted"));
      }
      if (baseKey === nextBase) applyStoryProgress(current.progress);
      if (detailVariant && detailTasks.length && baseKey === nextBase) {
        const decoded = detailTasks.map((task) => ({ ...task, image: cache!.peek(task.asset.url) }));
        const nextDetail = `${frame.id}/${low}/${detailVariant.width}/${JSON.stringify(crop)}`;
        if (decoded.every((task) => task.image !== undefined) && nextDetail !== detailKey) {
          paintDetail(detailCanvas!, container!, crop, detailVariant, decoded.map(({ image, x, y, sourceX, sourceY }) => ({ image: image!, x, y, sourceX, sourceY })));
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
    const inspectionChanged = () => {
      const next = inspectionSnapshot();
      const nextKey = [
        next.active ? 1 : 0,
        next.targetZoom.toFixed(4),
        next.targetFocusX.toFixed(4),
        next.targetFocusY.toFixed(4),
        next.maxZoom.toFixed(3),
      ].join("/");
      if (nextKey === inspectionIntentKey) return;
      inspectionIntentKey = nextKey;

      inspectionSettled = false;
      window.clearTimeout(inspectionSettleTimer);
      inspectionSettleTimer = window.setTimeout(() => {
        inspectionSettled = true;
        schedule();
      }, 32);
      schedule();
    };
    inspectionChanged();
    const unsubscribeInspection = subscribeInspection(inspectionChanged);
    const observer = new ResizeObserver(changed); observer.observe(container);
    visualViewport?.addEventListener("resize", changed);
    visualViewport?.addEventListener("scroll", changed);
    window.__QUACKLES_SEQUENCE__ = {
      setProgress(value) { scrollTo({ top: Math.max(0, Math.min(1, value)) * Math.max(1, document.documentElement.scrollHeight - innerHeight), behavior: "instant" }); setProgress(value); },
      setTheme: selectTheme,
      getState: () => ({ ...state, current: snapshot(), cache: cache?.stats() ?? null, surfaceBytes: (baseCanvas.width * baseCanvas.height + detailCanvas.width * detailCanvas.height) * 4, zoom: visualViewport?.scale ?? 1, inspection: inspectionSnapshot(), profile }),
    };
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(assetPath(`/preview-scene/sequence/manifest.json?v=${encodeURIComponent(BUILD_SHA)}`), { signal: controller.signal });
        if (!response.ok) throw new Error(`Sequence manifest failed: ${response.status}`);
        const parsed = parseManifest(await response.json(), response.url);
        if (cancelled) return;
        manifest = parsed;
        cache = new FrameCache(parsed.id, {
          decodedBudgetBytes: profile.decodedBudgetBytes,
          compressedBudgetBytes: profile.compressedBudgetBytes,
          maxActiveJobs: profile.maxActiveJobs,
        });
        state.manifestId = parsed.id; state.frameCount = parsed.frames.length;
        state.frames = parsed.frames.map(({ id, progress, phase }) => ({ id, progress, phase }));
        configure(parsed); schedule(); warmTheme("blue");
      } catch (error) {
        if (!cancelled) state.errors.push(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => {
      cancelled = true; controller.abort(); unsubscribe(); unsubscribeInspection(); observer.disconnect();
      cancelAnimationFrame(pendingFrame); clearTimeout(settleTimer); clearTimeout(inspectionSettleTimer);
      visualViewport?.removeEventListener("resize", changed); visualViewport?.removeEventListener("scroll", changed);
      delete window.__QUACKLES_SEQUENCE__; cache?.dispose();
    };
  }, []);
  return <div ref={host} className="sequence-player" data-testid="sequence-player">
    <div className="sequence-camera">
      <img ref={fallback} className="poster-plate" src={assetPath("/preview-scene/sequence/cinematic-proof-v2/blue/p0000000-1024.webp")} width={1024} height={1536} alt="Microduck in the rendered studio" fetchPriority="high" />
      <canvas ref={base} className="sequence-base" role="img" aria-label="Rendered Microduck sequence" />
      <canvas ref={detail} className="sequence-detail" aria-hidden />
    </div>
  </div>;
}
