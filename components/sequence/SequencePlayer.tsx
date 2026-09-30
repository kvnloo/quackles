/* eslint-disable @next/next/no-img-element -- The fallback is an authored, statically exported Cycles still. */
"use client";
import { useEffect, useRef } from "react";
import { assetPath } from "@/lib/paths";
import { BUILD_SHA } from "@/lib/build-info";
import { FrameCache } from "@/lib/sequence/cache";
import { imageAt, isImage, parseManifest, spanAt, THEME_IDS, type ImageAsset, type SequenceManifest, type ThemeId, type TileAsset, type Variant } from "@/lib/sequence/manifest";
import { applyHiddenPolicy, describeInspectionSources, type InspectionSourcesReceipt } from "@/lib/sequence/inspection-source";
import { PREVIEW } from "@/lib/preview";
import { mushroomScene, previewManifest, previewNote, previewPolicy, previewThemeIndices } from "@/lib/sequence/preview-policy";
import { mayWarm, warmPlan, WARM_SETTLE_MS } from "@/lib/sequence/warm-plan";
import { placeDetail, cropInside, detailPlan, eggWeight, inspectionCrop, paintBase, paintDetail, paintEgg, sharpPlan, tileAssets, underlayPlan, viewportCrop, type Crop } from "@/lib/sequence/render";
import { TileSurface, type PaintedRect } from "@/lib/sequence/tile-surface";
import { probeTier, tierKnown } from "@/lib/sequence/tier-probe";
import { inspectionSnapshot, setInspectionMaxZoom, subscribeInspection } from "@/lib/sequence/inspection";
import { sequencePerfProfile, type SequencePerfProfile } from "@/lib/sequence/perf-profile";
import { requestedDetailWidth } from "@/lib/sequence/motion-quality";
import { armLockFade, startLockFade } from "@/lib/sequence/lock-fade";
import { applyPalette, configure, presentTheme, selectTheme, setProgress, setThemeRange, snapshot, subscribe, themeIndices } from "@/lib/sequence/store";
import { syncedTheme, themeDetailReady, type ThemeRelease } from "@/lib/sequence/synced-theme";
import { applyStoryProgress } from "./SequenceScroll";

type FrameState = { frameId: string; frameProgress: number; progress: number; themes: ThemeId[]; mix: number; tierWidth: number; generation: number; urls: string[] };
type PlayerState = { ready: boolean; manifestId: string | null; frameCount: number; frames: { id: string; progress: number; phase: string }[]; requested: FrameState | null; rendered: FrameState | null; detailWidth: number; detailTiles: number; drawCount: number; errors: string[]; stalePaints: number; inspectionSources: InspectionSourcesReceipt; preview: string; note: string | null };
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
/** What is painted where (source space, last rect on top), for the gigapixel-feel harness. */
type PaintReport = { detail: { rects: PaintedRect[] }; underlay: { rects: PaintedRect[] }; floor: { rects: PaintedRect[] } };
declare global { interface Window { __QUACKLES_SEQUENCE__?: SequenceDebug; __QUACKLES_PAINT__?: PaintReport } }

export function SequencePlayer() {
  const host = useRef<HTMLDivElement>(null), base = useRef<HTMLCanvasElement>(null), floor = useRef<HTMLCanvasElement>(null), under = useRef<HTMLCanvasElement>(null), detail = useRef<HTMLCanvasElement>(null), fallback = useRef<HTMLImageElement>(null), note = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const container = host.current, baseCanvas = base.current, floorCanvas = floor.current, underCanvas = under.current, detailCanvas = detail.current;
    if (!container || !baseCanvas || !floorCanvas || !underCanvas || !detailCanvas) return;
    // Floor: the whole image at the lowest pyramid tier, painted once while idle (hidden at 1x), kept for the session.
    // Its tiles are pinned only until drawn; the canvas keeps the pixels. Nothing zoomed ever falls back to the bare plate.
    const floorSurface = new TileSurface(floorCanvas);
    let floorPlan: { key: string; variant: TileAsset; tasks: ReturnType<typeof tileAssets> } | null = null;
    // Persistent low-tier underlay (render.ts underlayPlan): painted tile by tile under the detail layer, pinned in the cache,
    // so a pan, flick or zoom-out past the painted detail shows a pyramid tier, not the 1024 plate.
    const underlay = new TileSurface(underCanvas);
    let underlayCurrent: NonNullable<ReturnType<typeof underlayPlan>> | null = null;
    const paint: PaintReport = { detail: { rects: [] }, underlay: { rects: [] }, floor: { rects: [] } };
    window.__QUACKLES_PAINT__ = paint;
    const UNDERLAY_BACKING = 2048;
    const releaseUnderlay = () => {
      underCanvas.style.visibility = "hidden"; underlay.clear(); underlayCurrent = null; paint.underlay.rects = [];
    };
    const profile = sequencePerfProfile();
    // Preview config (lib/preview.ts): theme range, tile families, mushroom-only scene. Production = "policy", all five themes.
    const sources = previewPolicy(PREVIEW);
    setThemeRange(previewThemeIndices(PREVIEW));
    const eggAsset: ImageAsset = { url: assetPath("/preview-scene/sequence/hidden/night-moss.png"), width: 768, height: 1152 };
    let manifest: SequenceManifest | null = null, cache: FrameCache | null = null, mushroomPyramid: Variant[] = [];
    let cancelled = false, pendingFrame = 0, settleTimer = 0, settled = true, generation = 0;
    let inspectionSettleTimer = 0, inspectionSettled = true;
    let intentKey = "", loadIntentKey = "", baseKey = "", detailKey = "", inspectionIntentKey = "";
    let paintedKeys: string[] = [], detailKeys: string[] = [];
    let paintedCoverage: Crop | null = null, paintedMix = -1, failCrop = "", detailThemeKey = "", paintedInMotion = false;
    let heldTheme = 2;
    let themeRelease: ThemeRelease | null = null;
    const releaseDetail = () => {
      detailCanvas.style.visibility = "hidden";
      if (detailCanvas.width !== 1 || detailCanvas.height !== 1) { detailCanvas.width = 1; detailCanvas.height = 1; }
      detailKeys = []; detailKey = ""; detailThemeKey = ""; paintedCoverage = null; paintedMix = -1; paintedInMotion = false;
      state.detailWidth = 0; state.detailTiles = 0; paint.detail.rects = [];
      releaseUnderlay();
    };
  const waiting = new Set<string>(), failed = new Set<string>(), warmed = new Set<string>();
    const state: PlayerState = { ready: false, manifestId: null, frameCount: 0, frames: [], requested: null, rendered: null, detailWidth: 0, detailTiles: 0, drawCount: 0, errors: [], stalePaints: 0, inspectionSources: describeInspectionSources(sources.themes, sources.hidden), preview: PREVIEW.id, note: null };
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
    let firstPaintAt = 0, warmTimer = 0;
    const notePaint = () => {
      if (firstPaintAt) return;
      firstPaintAt = performance.now();
      warmTimer = window.setTimeout(schedule, WARM_SETTLE_MS + 50);
    };
    function warmTheme(theme: ThemeId, inspecting: boolean, moving: boolean) {
      if (!manifest || !cache || warmed.has(theme)) return;
      const hero = manifest.frames.find((item) => item.id === "p0000000") ?? manifest.frames[0];
      if (!hero) return;
      const tiled = hero.assets[theme].filter((variant): variant is TileAsset => !isImage(variant));
      if (!tiled.length) { warmed.add(theme); return; }
      // No HQ/DZI traffic until the base hero is painted and the app has settled.
      const now = performance.now();
      if (!mayWarm({ painted: firstPaintAt > 0, inspecting, moving, sinceFirstPaintMs: firstPaintAt ? now - firstPaintAt : 0 })) return;
      const present = tiled.filter((variant) => !variant.tiles.urlTemplate.includes("/gp/") || tierKnown(variant) === true);
      for (const variant of tiled) {
        if (variant.tiles.urlTemplate.includes("/gp/") && tierKnown(variant) === undefined) void probeTier(variant).then(() => schedule());
      }
      if (!present.length) return;
      warmed.add(theme);
      for (const tile of warmPlan(present, tileAssets)) cache.warm(tile.asset);
    }
    function render() {
      pendingFrame = 0;
      if (!manifest || !cache || cancelled) return;
      const current = snapshot(), span = spanAt(manifest, current.progress, current.reducedMotion);
      const frame = span.mix < 0.5 ? span.before : span.after;

      const nextLoadIntent = `${frame.id}/${current.target}`;
      if (nextLoadIntent !== loadIntentKey) { loadIntentKey = nextLoadIntent; failed.clear(); }
      const { indices, mix } = themeIndices(current.theme);
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
      const moving = inspect.cameraMoving;
      // No new decode starts while the camera moves (decode + GPU upload inside the motion was the zoom/pan lag).
      cache.setPaused(moving);
      const crop =
        inspect.active || inspect.targetZoom > 1.0005
          ? inspectionCrop(
              moving ? Math.max(inspect.zoom, inspect.targetZoom) : inspect.targetZoom,
              moving ? inspect.focusX : inspect.targetFocusX,
              moving ? inspect.focusY : inspect.targetFocusY,
            )
          : nativeCrop;
      const settledWidth = Math.ceil(rect.width * devicePixelRatio * crop.scale);
      const inspecting = inspect.active || inspect.targetZoom > 1.0005;
      const plateWidth = beforeAssets[0].width;
      const desiredWidth = requestedDetailWidth({ moving, settledWidth, paintedWidth: state.detailWidth, plateWidth });
      const detailEligible = inspecting || nativeCrop.scale > 1.02;
      const nextIntent = `${span.before.id}/${span.after.id}/${span.mix}/${current.theme}/${desiredWidth}`;
      if (nextIntent !== intentKey) { intentKey = nextIntent; generation++; }
      state.requested = { frameId: frame.id, frameProgress: frame.progress, progress: current.progress, themes, mix, tierWidth: desiredWidth, generation, urls: assets.map((asset) => asset.url) };
      const tasks = assets.map((asset) => ({ asset, priority: 100 }));
      const detailMix = Math.round(mix * 50) / 50;
      const known = (variants: Variant[]) => variants.filter((variant) => isImage(variant) || !variant.tiles.urlTemplate.includes("/gp/") || tierKnown(variant) === true);
      const eggShown = eggWeight(current.theme) > 0.5 && frame.id === "p0000000";
      const probeSource = eggShown ? mushroomPyramid : frame.assets[themes[0]];
      for (const variant of probeSource) {
        if (!isImage(variant) && variant.tiles.urlTemplate.includes("/gp/") && tierKnown(variant) === undefined) void probeTier(variant).then(() => schedule());
      }
      if (inspecting && frame.id === "p0000000") {
        for (const theme of themes.length > 1 ? themes : THEME_IDS) {
          for (const variant of frame.assets[theme]) {
            if (!isImage(variant) && variant.tiles.urlTemplate.includes("/gp/") && tierKnown(variant) === undefined) void probeTier(variant).then(() => schedule());
          }
        }
      }
      let visible = current.theme;
      if (inspecting && frame.id === "p0000000" && !eggShown && crop.width > 0 && desiredWidth > plateWidth) {
        const syncBudget = profile.decodedBudgetBytes - plateWidth * beforeAssets[0].height * 4;
        const ready = [false, false, false, false, false];
        const want = new Set([Math.floor(current.theme), Math.ceil(current.theme), Math.floor(heldTheme), Math.ceil(heldTheme)]);
        for (const index of want) {
          const id = THEME_IDS[index];
          if (!id) continue;
          const variants = known(frame.assets[id]);
          const plan = detailPlan(variants, desiredWidth, crop, syncBudget, 0);
          ready[index] = themeDetailReady({ hasDetailSource: variants.some((variant) => !isImage(variant)), planReady: !!plan && plan.variant.width > plateWidth && plan.tasks.every((task) => cache!.peek(task.asset.url) !== undefined) });
          if (plan && !ready[index]) for (const task of plan.tasks) tasks.push({ asset: task.asset, priority: 100 });
        }
        const synced = syncedTheme({ requested: current.theme, held: heldTheme, ready, now: performance.now(), release: themeRelease });
        themeRelease = synced.release;
        visible = synced.theme;
        if (themeRelease) schedule();
      } else {
        themeRelease = null;
      }
      heldTheme = visible;
      presentTheme(visible);
      applyPalette(visible);
      const showLow = Math.floor(visible), showHigh = Math.ceil(visible), showMix = visible - showLow;
      const showThemes = (showLow === showHigh ? [showLow] : [showLow, showHigh]).map((index) => THEME_IDS[index]);
      type Planned = NonNullable<ReturnType<typeof sharpPlan>>;
      const layers: { plan: Planned; alpha: number }[] = [];
      if (detailEligible && span.mix === 0 && crop.width > 0 && crop.height > 0 && desiredWidth > plateWidth) {
        // The pinned underlay takes its own share first, so the pinned detail plan always fits beside it.
        const budget = profile.decodedBudgetBytes - plateWidth * beforeAssets[0].height * 4 - profile.underlayBudgetBytes;
        if (eggShown && mushroomPyramid.length) {
          const planned = sharpPlan(known(mushroomPyramid), desiredWidth, crop, budget, rect.width, rect.height, devicePixelRatio, profile.tileOverscan);
          if (planned && planned.variant.width > plateWidth) layers.push({ plan: planned, alpha: 1 });
        } else if (!eggShown) {
          const sources = showThemes.map((theme) => known(frame.assets[theme]));
          const tiled = sources.map((list) => list.some((variant) => !isImage(variant))); // every list holds its plate image, so length alone proves nothing
          if (showThemes.length > 1 && tiled[0] && tiled[1]) {
            const from = detailPlan(sources[0], desiredWidth, crop, budget, 0);
            const to = sources[1] ? detailPlan(sources[1], from?.variant.width ?? desiredWidth, crop, budget, 0, Number.POSITIVE_INFINITY, from?.variant.width ?? 0) : null;
            if (from && from.variant.width > plateWidth) layers.push({ plan: { ...from, coverage: crop }, alpha: 1 });
            if (from && to) layers.push({ plan: { ...to, coverage: crop }, alpha: showMix });
          } else if (showThemes.length === 1) {
            // Single visible theme only: during a crossfade where one side has no tiles, painting the other side's
            // detail at full alpha would show one scene's art over the mix.
            const primary = sources[0]?.length ? sharpPlan(sources[0], desiredWidth, crop, budget, rect.width, rect.height, devicePixelRatio, profile.tileOverscan) : null;
            if (primary && primary.variant.width > plateWidth) {
              layers.push({ plan: primary, alpha: 1 });
              if (!moving) {
                for (const offset of [-1, 1]) {
                  const neighbor = THEME_IDS[showLow + offset];
                  if (!neighbor) continue;
                  const same = known(frame.assets[neighbor]).find((variant) => variant.width === primary.variant.width);
                  if (!same || isImage(same)) continue;
                  for (const tile of tileAssets(same, crop, 0)) tasks.push({ asset: tile.asset, priority: 80 });
                }
              }
            }
          }
        }
        for (const layer of layers) tasks.push(...layer.plan.tasks.map(({ asset }) => ({ asset, priority: showThemes.length > 1 ? 100 : 90 })));

        const coverageId = layers[0] ? `${layers[0].plan.coverage.x.toFixed(3)}/${layers[0].plan.coverage.y.toFixed(3)}` : "";
        if (coverageId && coverageId !== failCrop) {
          for (const url of [...failed]) if (url.includes("/gp/")) failed.delete(url);
          failCrop = coverageId;
        }
      }
      // Underlay plan: from the settled (uncapped) tier, so it never waits for a promotion.
      const underlaySource = span.mix > 0 ? null : eggShown ? (mushroomPyramid.length ? known(mushroomPyramid) : null) : showThemes.length === 1 ? known(frame.assets[showThemes[0]]) : null;
      const underlayTiers = (underlaySource ?? []).filter((variant): variant is TileAsset => !isImage(variant)).sort((a, b) => a.width - b.width);
      if (!underlayTiers.length) underlayCurrent = null;
      else if (detailEligible && crop.width > 0) {
        const settledTier = underlayTiers.find((variant) => variant.width >= settledWidth) ?? underlayTiers[underlayTiers.length - 1];
        const next = underlayPlan(underlaySource!, settledTier.width, crop, plateWidth, profile.underlayBudgetBytes);
        // Keep the current underlay while the crop stays well inside it at the same tier; re-plan near an edge or on a tier move.
        const keep = underlayCurrent && next && underlayCurrent.variant.width === next.variant.width && cropInside(crop, underlayCurrent.coverage, Math.min(crop.width, crop.height) * 0.2);
        underlayCurrent = keep ? underlayCurrent : next;
      }
      if (underlayCurrent) for (const { asset } of underlayCurrent.tasks) tasks.push({ asset, priority: 88 });
      // Floor: planned once the hero has settled (mayWarm) or as soon as inspection starts; re-planned only for a new scene.
      const lowest = underlayTiers.find((variant) => variant.width > plateWidth);
      const floorKey = lowest ? `${frame.id}/${showThemes.join("+")}/${eggShown ? "egg" : ""}/${lowest.width}` : "";
      if (floorPlan && floorPlan.key !== floorKey) { floorSurface.clear(); floorPlan = null; paint.floor.rects = []; floorCanvas!.style.visibility = "hidden"; }
      if (!floorPlan && lowest && (inspecting || mayWarm({ painted: firstPaintAt > 0, inspecting, moving, sinceFirstPaintMs: firstPaintAt ? performance.now() - firstPaintAt : 0 }))) {
        const full = tileAssets(lowest, { x: 0, y: 0, width: 1, height: 1, scale: 1 }, 0);
        if (full.reduce((sum, { asset }) => sum + asset.width * asset.height * 4, 0) <= profile.underlayBudgetBytes) floorPlan = { key: floorKey, variant: lowest, tasks: full };
      }
      const floorTodo = floorPlan ? floorPlan.tasks.filter((task) => !floorSurface.has(task.asset.url)) : [];
      for (const { asset } of floorTodo) tasks.push({ asset, priority: 60 });
      const center = manifest.frames.indexOf(span.before), selected = Math.round(current.target);
      for (const offset of [1, -1, 2, 3]) {
        const adjacent = manifest.frames[center + offset];
        if (adjacent) tasks.push({ asset: imageAt(adjacent, THEME_IDS[selected], 1024), priority: 20 - Math.abs(offset) });
      }
      for (const offset of [-1, 1]) {
        const theme = THEME_IDS[selected + offset];
        if (theme) tasks.push({ asset: imageAt(frame, theme, 1024), priority: 30 });
      }
      const egg = eggWeight(current.theme);
      if (current.theme > 3.05 && current.theme < 3.95) tasks.push({ asset: eggAsset, priority: 85 });
      cache.pin([...assets.map((asset) => asset.url), ...layers.flatMap((layer) => layer.plan.tasks.map(({ asset }) => asset.url)), ...(underlayCurrent?.tasks.map(({ asset }) => asset.url) ?? []), ...floorTodo.map(({ asset }) => asset.url)]);
      cache.retain(tasks.map(({ asset }) => asset.url));
      for (const task of tasks) request(task.asset, task.priority);
      const selectedTheme = THEME_IDS[selected];
      if (selectedTheme) warmTheme(selectedTheme, inspecting, moving);
      warmTheme("blue", inspecting, moving);
      const beforeImages = beforeAssets.map((asset) => cache!.peek(asset.url));
      const afterImages = afterAssets.map((asset) => cache!.peek(asset.url));
      const eggImage = cache!.peek(eggAsset.url);
      const nextBase = `${span.before.id}/${span.after.id}/${span.mix.toFixed(3)}/${current.theme.toFixed(3)}/${rect.width}/${devicePixelRatio}/${egg.toFixed(3)}/${eggImage ? 1 : 0}`;
      if (beforeImages.every((image) => image !== undefined) && afterImages.every((image) => image !== undefined) && nextBase !== baseKey) {
        paintBase(baseCanvas!, beforeImages as NonNullable<(typeof beforeImages)[number]>[], afterImages.length ? afterImages as NonNullable<(typeof afterImages)[number]>[] : undefined, span.mix, mix, rect.width);
        if (eggImage && egg > 0.001) paintEgg(baseCanvas!, eggImage, egg);
        applyPalette(current.theme);
        baseKey = nextBase; paintedKeys = assets.map((asset) => asset.url);
        if (!inspecting || span.mix > 0) releaseDetail();
        state.ready = true; state.drawCount++; notePaint();
        state.rendered = { ...state.requested, tierWidth: state.detailWidth || plateWidth, urls: [...paintedKeys, ...detailKeys] };
        if (fallback.current) fallback.current.style.visibility = "hidden";
        baseCanvas!.style.visibility = "visible";
        window.dispatchEvent(new Event("quackles:base-painted"));
      }
      if (baseKey === nextBase) applyStoryProgress(current.progress);
      // A detail layer painted for one scene must never survive a change of the visible theme(s).
      const visibleThemeKey = showThemes.join("+");
      if (detailKey && detailThemeKey !== visibleThemeKey) releaseDetail();
      // Settled and the plate already satisfies the requested tier (zoomed back out): drop the now-unneeded detail canvas.
      if (detailKey && !layers.length && !moving && desiredWidth <= plateWidth) releaseDetail();
      if (floorPlan && floorTodo.length && !moving && baseKey === nextBase) {
        const f = floorPlan, long = Math.min(UNDERLAY_BACKING, f.variant.height);
        floorSurface.place(rect.width, rect.height, { x: 0, y: 0, width: 1, height: 1, scale: 1 }, { width: Math.round(long * f.variant.width / f.variant.height), height: long });
        floorSurface.setQueue(floorTodo.filter((task) => cache!.peek(task.asset.url)).map((task) => ({ key: task.asset.url, bitmap: () => cache!.peek(task.asset.url)?.bitmap, variantWidth: f.variant.width, variantHeight: f.variant.height, sourceX: task.sourceX, sourceY: task.sourceY, width: task.asset.width, height: task.asset.height })));
        if (floorSurface.drain(performance.now() + 3)) paint.floor.rects = floorSurface.rects();
        if (floorSurface.pending) schedule();
      }
      if (underlayCurrent && !moving && baseKey === nextBase) {
        // Fixed backing (the coverage is always 2:3 in image pixels): a re-place is a pixel copy, never a reallocation.
        const u = underlayCurrent, long = Math.min(UNDERLAY_BACKING, Math.ceil(u.coverage.height * u.variant.height));
        underlay.place(rect.width, rect.height, u.coverage, { width: Math.round(long * (u.coverage.width * u.variant.width) / (u.coverage.height * u.variant.height)), height: long });
        underlay.setQueue(u.tasks.filter((task) => cache!.peek(task.asset.url)).map((task) => ({ key: task.asset.url, bitmap: () => cache!.peek(task.asset.url)?.bitmap, variantWidth: u.variant.width, variantHeight: u.variant.height, sourceX: task.sourceX, sourceY: task.sourceY, width: task.asset.width, height: task.asset.height })));
        if (underlay.drain(performance.now() + 4)) paint.underlay.rects = underlay.rects();
        if (underlay.pending) schedule();
      }
      if (layers.length && (baseKey === nextBase || inspecting)) {
        const coverage = layers[0].plan.coverage;
        const decoded = layers.map((layer) => ({
          ...layer,
          images: layer.plan.tasks.map((task) => ({ ...task, image: cache!.peek(task.asset.url) })),
        }));
        const expected = eggShown || showThemes.length === 1 ? 1 : 2;
        const ready = (layer: (typeof decoded)[number]) => layer.images.every((task) => task.image !== undefined);
        const allReady = decoded.length === expected && decoded.every(ready);
        const primaryReady = ready(decoded[0]);
        const mixChanged = Math.abs(showMix - paintedMix) > 0.001;
        const upgrade = layers[0].plan.variant.width > state.detailWidth;
        // While a finger drives the camera, a repaint (a full tile upload) inside the gesture was the pan hitch: the
        // painted layer rides with the camera (plate underlay beyond it) and repaints once the finger rests or lifts.
        const escaping = !paintedCoverage || (!(moving && inspect.dragging) && !cropInside(crop, paintedCoverage, crop.width * 0.12));
        const paintLayers = allReady ? decoded : primaryReady && paintedMix <= 0.001 ? [decoded[0]] : null;
        // A layer painted mid-motion used the cheap resample: repaint it at full quality once the camera rests.
        const refine = paintedInMotion && !moving;
        if (paintLayers && (allReady ? mixChanged || upgrade || escaping || refine || !detailKey : upgrade || escaping || refine || !detailKey)) {
          // First appearance of the sharp layer (it was hidden/released): dissolve it in. Repaints of a visible layer do not re-fade.
          const freshLock = !detailKey; const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          if (freshLock) armLockFade(detailCanvas!, reduced);
          paintDetail(detailCanvas!, container!, coverage, paintLayers.map((layer) => ({
            variant: layer.plan.variant,
            alpha: layer.alpha,
            images: layer.images.map(({ image, x, y, sourceX, sourceY }) => ({ image: image!, x, y, sourceX, sourceY })),
          })), moving);
          paintedInMotion = moving;
          if (freshLock) startLockFade(detailCanvas!, reduced);
          window.dispatchEvent(new Event("quackles:detail-painted"));
          detailKey = `${frame.id}/${paintLayers.map((layer) => `${layer.plan.variant.width}@${layer.alpha.toFixed(2)}`).join("+")}/${coverage.x.toFixed(4)}/${coverage.y.toFixed(4)}`;
          detailKeys = paintLayers.flatMap((layer) => layer.plan.tasks.map(({ asset }) => asset.url));
          paintedCoverage = coverage;
          paint.detail.rects = [[coverage.x, coverage.y, coverage.x + coverage.width, coverage.y + coverage.height, Math.min(paintLayers[0].plan.variant.width, detailCanvas!.width / coverage.width)]];
          detailThemeKey = visibleThemeKey;
          paintedMix = allReady ? showMix : 0;
          state.detailWidth = paintLayers[0].plan.variant.width;
          state.detailTiles = paintLayers.reduce((sum, layer) => sum + (isImage(layer.plan.variant) ? 0 : layer.plan.tasks.length), 0);
          state.drawCount++;
          if (state.rendered) state.rendered = { ...state.rendered, tierWidth: state.detailWidth, urls: [...paintedKeys, ...detailKeys], generation };
        }
      }
      // The pyramid underlay shows only while inspecting (at 1x it is decoded and painted, but hidden: the hero stays the plate).
      underCanvas!.style.visibility = inspecting && underlay.coverage && paint.underlay.rects.length ? "visible" : "hidden";
      floorCanvas!.style.visibility = inspecting && paint.floor.rects.length ? "visible" : "hidden";
      if (inspecting) {
        // The base is a persistent underlay: keep it visible so any part of the viewport the detail canvas does not
        // cover (camera jump beyond the painted buffer) shows the plate, never the page background.
        baseCanvas!.style.visibility = "visible";
        if (fallback.current) fallback.current.style.visibility = "hidden";
      } else if (baseKey) {
        baseCanvas!.style.visibility = "visible";
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
      const places = next.cameraMoving ? 3 : 4;
      const followX = next.cameraMoving ? next.focusX : next.targetFocusX;
      const followY = next.cameraMoving ? next.focusY : next.targetFocusY;
      const followZoom = next.cameraMoving ? next.zoom : next.targetZoom;
      const nextKey = [
        next.cameraMoving ? 1 : 0,
        next.active ? 1 : 0,
        followZoom.toFixed(places),
        followX.toFixed(places),
        followY.toFixed(places),
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
    // The detail canvas is placed in css px (transform), so a container resize (window resize, mobile URL bar) must re-place it.
    // Re-place immediately (registration is exact at once) and force a repaint for the new resolution without hiding the layer.
    const resized = () => {
      if (underlay.coverage) { const r = container.getBoundingClientRect(); placeDetail(underCanvas, r.width, r.height, underlay.coverage); }
      if (floorSurface.coverage) { const r = container.getBoundingClientRect(); placeDetail(floorCanvas, r.width, r.height, floorSurface.coverage); }
      if (detailKey && detailCanvas.dataset.crop) {
        const [x, y, w, h] = detailCanvas.dataset.crop.split(",").map(Number);
        const r = container.getBoundingClientRect();
        placeDetail(detailCanvas, r.width, r.height, { x, y, width: w, height: h });
        paintedCoverage = null;
      }
      changed();
    };
    const observer = new ResizeObserver(resized); observer.observe(container);
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
        // The A/B candidate flag only applies to the production policy; a preview's families are fixed by its config.
        const allowCandidates = PREVIEW.zoom === "policy" && new URLSearchParams(location.search).get("inspectionCandidates") === "1";
        const policed = previewManifest(parseManifest(await response.json(), response.url), PREVIEW, { allowCandidates });
        const hidden = await fetch(assetPath(`/preview-scene/sequence/hidden-pyramids.json?v=${encodeURIComponent(BUILD_SHA)}`), { signal: controller.signal });
        if (hidden.ok) {
          const body = await hidden.json() as { mushroom?: { variants?: Variant[] } };
          mushroomPyramid = applyHiddenPolicy(body.mushroom?.variants ?? [], sources.hidden, { allowCandidates }).slice().sort((a, b) => a.width - b.width);
        }
        if (cancelled) return;
        // gigapixel-single: the hidden moss egg (plate + pyramid) is the sole scene.
        const parsed = PREVIEW.scenes === "mushroom" ? mushroomScene(policed, eggAsset, mushroomPyramid) : policed;
        state.note = previewNote(PREVIEW, parsed);
        if (note.current) { note.current.textContent = state.note ?? ""; note.current.hidden = !state.note; }
        manifest = parsed;
        cache = new FrameCache(parsed.id, {
          decodedBudgetBytes: profile.decodedBudgetBytes,
          compressedBudgetBytes: profile.compressedBudgetBytes,
          maxActiveJobs: profile.maxActiveJobs,
        });
        state.manifestId = parsed.id; state.frameCount = parsed.frames.length;
        state.frames = parsed.frames.map(({ id, progress, phase }) => ({ id, progress, phase }));
        configure(parsed); schedule();
      } catch (error) {
        if (!cancelled) state.errors.push(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => {
      cancelled = true; controller.abort(); unsubscribe(); unsubscribeInspection(); observer.disconnect();
      cancelAnimationFrame(pendingFrame); clearTimeout(settleTimer); clearTimeout(inspectionSettleTimer); clearTimeout(warmTimer);
      visualViewport?.removeEventListener("resize", changed); visualViewport?.removeEventListener("scroll", changed);
      delete window.__QUACKLES_SEQUENCE__; delete window.__QUACKLES_PAINT__; cache?.dispose();
    };
  }, []);
  return <div ref={host} className="sequence-player" data-testid="sequence-player">
    <div className="sequence-camera">
      {PREVIEW.scenes === "mushroom"
        ? <img ref={fallback} className="poster-plate" src={assetPath("/preview-scene/sequence/hidden/night-moss.png")} width={768} height={1152} alt="Microduck on the night moss" fetchPriority="high" />
        : <img ref={fallback} className="poster-plate" src={assetPath("/preview-scene/sequence/cinematic-proof-v2/blue/p0000000-1024.webp")} width={1024} height={1536} alt="Microduck in the rendered studio" fetchPriority="high" />}
      <canvas ref={base} className="sequence-base" role="img" aria-label="Rendered Microduck sequence" />
      <canvas ref={floor} className="sequence-floor" aria-hidden />
      <canvas ref={under} className="sequence-underlay" aria-hidden />
      <canvas ref={detail} className="sequence-detail" aria-hidden />
    </div>
    <p ref={note} className="preview-note" data-testid="preview-note" hidden />
  </div>;
}
