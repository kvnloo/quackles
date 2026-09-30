// Page-side controller for the flagged (?sim=1) live simulator. Owns:
//  - the pure hand-off machine (lib/sim/handoff-machine) and its effects,
//  - one module Worker per SIM session (physics steps there at 50 Hz),
//  - input while the simulator owns the frame (wheel, keys, drag, D-pad),
//  - the per-frame pose/camera it writes into the shared poseRef.
// It never steps physics and never runs its own animation loop: `frame()` is
// called from the single R3F render loop (SimDirector), and snapshots arrive
// by message. OfficialDuck remains the only writer of the rig.
import { Box3, type Scene, type WebGLRenderer, type Color, type Texture } from "three";
import { blendPoseInto, copyPoseInto, explodedPoseInto, assembledPoseInto } from "@/lib/cinematic-handoff";
import { poseAt, poseAtInto, type Pose } from "@/lib/pose";
import { assetPath } from "@/lib/paths";
import { snapshot as storySnapshot, subscribe as subscribeStory } from "@/lib/sequence/store";
import { applyThemeT } from "@/lib/theme";
import { setGradeOverrides, setGradeTheme } from "@/lib/sim/render-grade";
import { HANDOFF, handoffWeights, initialHandoff, loadStage, reduceHandoff, type HandoffEvent, type HandoffPhase, type HandoffState } from "./handoff-machine";
import { liveBridge, type SimSeed, type SimSnapshot } from "./live-bridge";
import { loadRobotSurfaceSource } from "./robot-surfaces";
import pins from "./native/asset-manifest.json";

type WorkerSnapshot = SimSnapshot & { type: string; token: number; generation: number; steps?: number; dropped?: number; stepMs?: number };
type WorkerMessage =
  | { type: "loaded"; token: number; loadMs: number }
  | { type: "error"; token: number; message: string }
  | { type: "disposed"; token: number }
  | WorkerSnapshot;

const ACTIVE: ReadonlySet<HandoffPhase> = new Set(["swap-in", "reassemble", "await", "sim"]);
const TIMED: ReadonlySet<HandoffPhase> = new Set(["swap-in", "reassemble", "return", "disassemble", "swap-out"]);
const MOVE_KEYS = /^(Arrow(Up|Down|Left|Right)|Key[WASD])$/;
const SCROLL_KEYS = /^(Space|PageUp|PageDown|Home|End)$/;
/** Sequence theme index (day, white, blue, dark, night) -> 3-anchor live rig t. */
const LIVE_THEME_T = [1, 0, 0.5, 1, 1];

export function liveThemeT(presented: number) {
  const low = Math.max(0, Math.min(4, Math.floor(presented)));
  const high = Math.min(4, low + 1);
  const f = Math.max(0, Math.min(1, presented - low));
  return LIVE_THEME_T[low] + (LIVE_THEME_T[high] - LIVE_THEME_T[low]) * f;
}

/** Every file the native loader fetches, in the loader's own URL form. */
function runtimeFiles() {
  return [
    ...pins.files.filter((f) => f.path.startsWith("runtime/") || f.path === "alpha_walking.onnx").map((f) => f.path),
    pins.prepared_model.path,
    ...pins.collision_meshes.map((f) => `assets/${f.file}`),
  ];
}

/** Camera orbits `pivot` (the robot trunk, followed smoothly on the floor
 * plane); `aim` eases from the reassembly look-at onto the pivot, so entering
 * SIM pans instead of jumping. */
type Orbit = { azimuth: number; elevation: number; minElevation: number; distance: number; minDistance: number; maxDistance: number; pivot: [number, number, number]; aim: [number, number, number] };
export type HudSnapshot = { phase: HandoffPhase; canEnter: boolean; loading: boolean; reduced: boolean; error: boolean };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Keep-in margin from the plinth top edge (world m, feet half-length). */
const FENCE_MARGIN = 0.045;
/** Stopping distance allowance for the walking policy at 0.25 m/s (world m). */
const FENCE_LOOKAHEAD = 0.08;
type Fence = { minX: number; maxX: number; minZ: number; maxZ: number };

export class LiveSimController {
  state: HandoffState;
  progress = 0;
  liveReady = false;
  backend: "idle" | "loading" | "ready" | "error" = "idle";
  prefetch: "none" | "running" | "done" | "error" = "none";
  token = 0;
  steps = 0;
  simTime = 0;
  twist: [number, number, number] = [0, 0, 0];
  seed: SimSeed | null = null;
  seedJointError: number | null = null;
  loadMs = 0;
  staleDropped = 0;
  errors: string[] = [];
  /** Structural guarantee: the page never steps physics (Worker only). */
  readonly mainThreadSteps = 0;
  /** Story progress whose pose the live rig shows under the last plate. */
  storyProgress = 1;

  private worker: Worker | null = null;
  private retiring = new Set<Worker>();
  private seeded = false;
  private lastSnapshot: SimSnapshot | null = null;
  private returnFrom: { snapshot: SimSnapshot; camPos: [number, number, number]; lookAt: [number, number, number] } | null = null;
  private orbit: Orbit | null = null;
  private keys = new Set<string>();
  private pad = new Set<string>();
  private drag: { id: number; x: number; y: number } | null = null;
  private prefetchAbort: AbortController | null = null;
  private listeners = new Set<() => void>();
  private hud: HudSnapshot;
  private cleanups: Array<() => void> = [];
  private simInput: Array<() => void> = [];
  private frameEl: HTMLElement | null = null;
  private canvasEl: HTMLElement | null = null;
  private poseRef: { current: Pose } | null = null;
  private renderer: { invalidate: () => void; scene: Scene; gl: WebGLRenderer } | null = null;
  private exploded = explodedPoseInto(poseAt(1));
  private assembled = assembledPoseInto(poseAt(0));
  private robotOnlySaved: { background: Color | Texture | null } | null = null;
  private liveOpacity = 0;
  private lastTheme = -1;
  private animating = false;
  private phaseLog: HandoffPhase[] = [];
  private fence: Fence | null = null;
  private applied: [number, number, number] = [0, 0, 0];
  private fenceBlocks = 0;
  private lastFrameAt = 0;

  constructor(reduced: boolean) {
    this.state = initialHandoff(reduced);
    this.hud = this.computeHud();
  }

  // ---------------------------------------------------------------- wiring
  attach({ frame, canvas, hud, poseRef }: { frame: HTMLElement; canvas: HTMLElement; hud: HTMLElement; poseRef: { current: Pose } }) {
    this.frameEl = frame;
    this.canvasEl = canvas;
    this.poseRef = poseRef;
    poseAtInto(poseRef.current, this.storyProgress);
    const onStory = () => this.onStory();
    this.cleanups.push(subscribeStory(onStory));
    onStory();
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => this.dispatch({ type: "reduced-motion", reduced: media.matches });
    media.addEventListener("change", onMotion);
    this.cleanups.push(() => media.removeEventListener("change", onMotion));
    const onWheel = (event: WheelEvent) => {
      if (this.state.phase !== "story" || !this.liveReady) return;
      this.dispatch({ type: "wheel", deltaY: this.wheelDelta(event), now: event.timeStamp, progress: this.progress, atMinZoom: true });
    };
    addEventListener("wheel", onWheel, { passive: true });
    this.cleanups.push(() => removeEventListener("wheel", onWheel));
    // Element-level (never window) handlers: HUD actions and orbit drag.
    const onHudDown = (event: PointerEvent) => {
      const action = (event.target as Element | null)?.closest<HTMLElement>("[data-sim-action]");
      if (!action) return;
      event.stopPropagation();
      const dir = action.dataset.simPad;
      if (dir) { action.setPointerCapture(event.pointerId); this.press(dir, true); }
    };
    const onHudUp = (event: PointerEvent) => {
      const action = (event.target as Element | null)?.closest<HTMLElement>("[data-sim-pad]");
      if (action?.dataset.simPad) { event.stopPropagation(); this.press(action.dataset.simPad, false); }
    };
    const onHudClick = (event: MouseEvent) => {
      const action = (event.target as Element | null)?.closest<HTMLElement>("[data-sim-action]")?.dataset.simAction;
      if (!action) return;
      event.stopPropagation();
      if (action === "enter") this.enter();
      else if (action === "back") this.exit();
    };
    hud.addEventListener("pointerdown", onHudDown);
    hud.addEventListener("pointerup", onHudUp);
    hud.addEventListener("pointercancel", onHudUp);
    hud.addEventListener("lostpointercapture", onHudUp);
    hud.addEventListener("click", onHudClick);
    const onDown = (event: PointerEvent) => {
      if (this.state.phase === "story") return;
      event.stopPropagation();
      if (this.state.phase !== "sim" || !event.isPrimary) return;
      this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
    };
    const onMove = (event: PointerEvent) => {
      if (!this.drag || event.pointerId !== this.drag.id || !this.orbit) return;
      event.stopPropagation();
      const dx = event.clientX - this.drag.x, dy = event.clientY - this.drag.y;
      this.drag.x = event.clientX; this.drag.y = event.clientY;
      this.orbit.azimuth -= dx * 0.008;
      this.orbit.elevation = Math.max(this.orbit.minElevation, Math.min(1.25, this.orbit.elevation + dy * 0.006));
      this.renderer?.invalidate();
    };
    const onUp = (event: PointerEvent) => {
      if (this.drag && event.pointerId === this.drag.id) {
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
        this.drag = null;
      }
    };
    const stop = (event: Event) => { if (this.state.phase !== "story") event.stopPropagation(); };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("click", stop);
    this.cleanups.push(() => {
      hud.removeEventListener("pointerdown", onHudDown);
      hud.removeEventListener("pointerup", onHudUp);
      hud.removeEventListener("pointercancel", onHudUp);
      hud.removeEventListener("lostpointercapture", onHudUp);
      hud.removeEventListener("click", onHudClick);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("click", stop);
    });
    this.applyPresentation();
  }

  detach() {
    this.prefetchAbort?.abort();
    this.stopSession();
    this.removeSimInput();
    this.cleanups.splice(0).forEach((fn) => fn());
    for (const worker of this.retiring) worker.terminate();
    this.retiring.clear();
    liveBridge.authority = "cinematic";
    liveBridge.snapshot = null;
    liveBridge.seed = null;
    if (this.frameEl) delete this.frameEl.dataset.simPhase;
    this.frameEl = null;
    this.canvasEl = null;
  }

  bindRenderer(renderer: { invalidate: () => void; scene: Scene; gl: WebGLRenderer } | null) {
    this.renderer = renderer;
    renderer?.invalidate();
  }

  setLiveReady(ready: boolean) {
    if (ready === this.liveReady) return;
    this.liveReady = ready;
    this.renderer?.invalidate();
    this.emit();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  getHud = () => this.hud;

  enter() { this.dispatch({ type: "enter", progress: this.progress }); }
  exit() { this.dispatch({ type: "exit" }); }

  // ------------------------------------------------------------ the machine
  dispatch(event: HandoffEvent) {
    if (event.type === "enter" && !this.liveReady) return;
    const previous = this.state;
    this.state = reduceHandoff(previous, event);
    if (previous.phase !== this.state.phase) this.onPhase(previous.phase, this.state.phase);
    if (previous.phase !== this.state.phase || event.type === "reduced-motion") {
      this.applyPresentation();
      this.renderer?.invalidate();
      this.emit();
    }
  }

  private onPhase(from: HandoffPhase, to: HandoffPhase) {
    this.phaseLog.push(to);
    if (this.phaseLog.length > 64) this.phaseLog.shift();
    if (from === "story") { this.installSimInput(); this.startSession(); }
    if (ACTIVE.has(from) && !ACTIVE.has(to)) {
      if (to === "return" && this.seeded && this.lastSnapshot && this.poseRef) {
        const pose = this.poseRef.current;
        this.returnFrom = { snapshot: this.lastSnapshot, camPos: [...pose.camPos], lookAt: [...pose.lookAt] };
      }
      this.stopSession();
    }
    if (to === "sim") this.seedSession();
    if (to === "story") {
      this.removeSimInput();
      this.returnFrom = null;
      this.orbit = null;
      liveBridge.authority = "cinematic";
      liveBridge.snapshot = null;
    }
    if (to === "disassemble" || to === "swap-out") {
      liveBridge.authority = "cinematic";
      liveBridge.snapshot = null;
    }
  }

  private applyPresentation() {
    const frame = this.frameEl;
    if (!frame) return;
    if (this.state.phase === "story") delete frame.dataset.simPhase;
    else frame.dataset.simPhase = this.state.phase;
  }

  // -------------------------------------------------------------- per frame
  /** Called once per rendered frame by SimDirector (inside the R3F loop). Returns true to request another frame. */
  frame() {
    // Wall-clock transitions: the frame after an idle (demand-mode) gap counts
    // as one nominal frame, otherwise the real elapsed time (capped at 1 s).
    const now = performance.now();
    const elapsed = this.animating ? Math.min(1000, now - this.lastFrameAt) : 16;
    this.lastFrameAt = now;
    const deltaSeconds = elapsed / 1000;
    if (TIMED.has(this.state.phase)) this.dispatch({ type: "tick", dt: elapsed });
    const pose = this.poseRef?.current;
    if (!pose) return false;
    const w = handoffWeights(this.state);
    const phase = this.state.phase;
    let animate = TIMED.has(phase);
    if (phase === "story" || phase === "swap-in" || phase === "swap-out") poseAtInto(pose, this.storyProgress);
    else if (phase === "reassemble" || phase === "disassemble") blendPoseInto(pose, this.exploded, this.assembled, w.assemblyT);
    else copyPoseInto(pose, this.assembled);

    if (phase === "sim" && this.orbit) animate = this.applyOrbit(pose, deltaSeconds) || animate;
    if (phase === "return" && this.returnFrom && this.seed) {
      // Physics is already disposed: blend the last physical state back to the
      // exact seeded pose, then hand the rig back to the cinematic driver.
      const k = 1 - w.simPose, from = this.returnFrom.snapshot, seed = this.seed;
      const q = slerpWxyz(from.quaternion, seed.quaternion, k);
      liveBridge.authority = "native";
      liveBridge.snapshot = {
        position: [0, 1, 2].map((i) => lerp(from.position[i], seed.position[i], k)),
        quaternion: q,
        joints: seed.joints.map((v, i) => lerp(from.joints[i], v, k)),
        time: 0,
      };
      for (let i = 0; i < 3; i++) {
        pose.camPos[i] = lerp(this.returnFrom.camPos[i], this.assembled.camPos[i], k);
        pose.lookAt[i] = lerp(this.returnFrom.lookAt[i], this.assembled.lookAt[i], k);
      }
    }
    this.animating = animate;
    if (w.liveOpacity !== this.liveOpacity && this.canvasEl) {
      this.liveOpacity = w.liveOpacity;
      this.canvasEl.style.opacity = String(w.liveOpacity);
      this.canvasEl.style.visibility = w.liveOpacity > 0 ? "visible" : "hidden";
    }
    return animate;
  }

  private applyOrbit(pose: Pose, deltaSeconds: number) {
    const orbit = this.orbit!;
    const trunk = liveBridge.authority === "native" ? liveBridge.trunkWorld?.() : null;
    const k = 1 - Math.exp(-Math.min(0.25, deltaSeconds) * 4);
    let moving = false;
    const ease = (from: number, to: number) => {
      const next = from + (to - from) * k;
      if (Math.abs(next - from) > 1e-5) moving = true;
      return next;
    };
    if (trunk) { orbit.pivot[0] = ease(orbit.pivot[0], trunk[0]); orbit.pivot[2] = ease(orbit.pivot[2], trunk[2]); }
    for (let i = 0; i < 3; i++) orbit.aim[i] = ease(orbit.aim[i], orbit.pivot[i]);
    const cosE = Math.cos(orbit.elevation);
    pose.lookAt[0] = orbit.aim[0];
    pose.lookAt[1] = orbit.aim[1];
    pose.lookAt[2] = orbit.aim[2];
    pose.camPos[0] = orbit.pivot[0] + orbit.distance * cosE * Math.sin(orbit.azimuth);
    pose.camPos[1] = orbit.pivot[1] + orbit.distance * Math.sin(orbit.elevation);
    pose.camPos[2] = orbit.pivot[2] + orbit.distance * cosE * Math.cos(orbit.azimuth);
    return moving;
  }

  // ------------------------------------------------------------- sessions
  private startSession() {
    this.token++;
    this.backend = "loading";
    this.seeded = false;
    this.lastSnapshot = null;
    this.seed = null;
    this.seedJointError = null;
    this.steps = 0;
    this.simTime = 0;
    liveBridge.seedWorldJumpMm = null;
    const started = performance.now();
    const worker = new Worker(new URL("./native/worker.mjs", import.meta.url), { type: "module" });
    this.worker = worker;
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => this.onMessage(worker, event.data, started);
    worker.onerror = (event) => this.onMessage(worker, { type: "error", token: this.token, message: event.message || "worker error" }, started);
    worker.postMessage({ type: "load", token: this.token, baseUrl: new URL(assetPath("/sim/native/"), location.href).href });
    const onVisibility = () => {
      if (!this.worker || !this.seeded) return;
      this.worker.postMessage({ type: document.hidden ? "pause" : "run", token: this.token });
    };
    document.addEventListener("visibilitychange", onVisibility);
    this.simInput.push(() => document.removeEventListener("visibilitychange", onVisibility));
  }

  private stopSession() {
    const worker = this.worker;
    this.worker = null;
    this.token++;
    this.seeded = false;
    this.backend = "idle";
    if (!worker) return;
    this.retiring.add(worker);
    worker.postMessage({ type: "dispose", token: this.token });
    const kill = () => { if (this.retiring.delete(worker)) worker.terminate(); };
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => { if (event.data?.type === "disposed") kill(); else this.staleDropped++; };
    setTimeout(kill, 1000);
  }

  private seedSession() {
    if (!this.worker || this.backend !== "ready" || !this.poseRef) return;
    const seed = liveBridge.captureSeed?.(this.assembled) ?? null;
    if (!seed) { this.fail("rig not ready for seeding"); return; }
    this.seed = seed;
    liveBridge.seed = seed;
    liveBridge.seedWorldJumpMm = null;
    this.token++;
    this.worker.postMessage({ type: "seed", token: this.token, pose: { position: seed.position, quaternion: seed.quaternion, joints: seed.joints } });
    const plinth = this.renderer?.scene.getObjectByName("set_robot_plinth");
    if (plinth) {
      const box = new Box3().setFromObject(plinth);
      this.fence = { minX: box.min.x + FENCE_MARGIN, maxX: box.max.x - FENCE_MARGIN, minZ: box.min.z + FENCE_MARGIN, maxZ: box.max.z - FENCE_MARGIN };
    }
    const a = this.assembled;
    const pivot: [number, number, number] = [...seed.trunkWorld];
    const offset = [0, 1, 2].map((i) => a.camPos[i] - pivot[i]);
    const distance = Math.hypot(offset[0], offset[1], offset[2]);
    const elevation = Math.asin(offset[1] / distance);
    this.orbit = {
      azimuth: Math.atan2(offset[0], offset[2]),
      elevation, minElevation: Math.min(elevation, 0.02),
      distance, maxDistance: distance, minDistance: distance * 0.3,
      pivot, aim: [...a.lookAt],
    };
  }

  private onMessage(worker: Worker, message: WorkerMessage, started: number) {
    if (worker !== this.worker || message.token !== this.token) { this.staleDropped++; return; }
    switch (message.type) {
      case "loaded":
        this.backend = "ready";
        this.loadMs = +(performance.now() - started).toFixed(1);
        this.dispatch({ type: "backend-ready" });
        this.emit();
        return;
      case "seeded": {
        const snap = message as WorkerSnapshot;
        const seed = this.seed!;
        this.seedJointError = Math.max(...seed.joints.map((v, i) => Math.abs(v - snap.joints[i])));
        this.seeded = true;
        this.lastSnapshot = snap;
        liveBridge.snapshot = snap;
        liveBridge.authority = "native";
        liveBridge.applyNow?.();
        this.applied = [NaN, NaN, NaN];
        this.sendCommand();
        if (!document.hidden) worker.postMessage({ type: "run", token: this.token });
        this.renderer?.invalidate();
        return;
      }
      case "snapshot": {
        if (this.state.phase !== "sim" || !this.seeded) { this.staleDropped++; return; }
        const snap = message as WorkerSnapshot;
        this.lastSnapshot = snap;
        liveBridge.snapshot = snap;
        this.steps = snap.steps ?? this.steps;
        this.simTime = snap.time;
        this.renderer?.invalidate();
        if (this.twist[0] !== 0) this.sendCommand();
        return;
      }
      case "error":
        this.fail((message as { message: string }).message);
        return;
    }
  }

  private fail(message: string) {
    this.errors.push(message);
    if (this.errors.length > 16) this.errors.shift();
    this.backend = "error";
    this.dispatch({ type: "backend-lost" });
    this.emit();
  }

  // ----------------------------------------------------------------- input
  private installSimInput() {
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (this.state.phase !== "sim" || !this.orbit) return;
      const dy = this.wheelDelta(event);
      const orbit = this.orbit;
      const atMin = orbit.distance >= orbit.maxDistance * 0.999;
      if (dy < 0 && atMin) {
        this.dispatch({ type: "wheel", deltaY: dy, now: event.timeStamp, progress: this.progress, atMinZoom: true });
        return;
      }
      this.dispatch({ type: "wheel", deltaY: dy, now: event.timeStamp, progress: this.progress, atMinZoom: false });
      orbit.distance = Math.max(orbit.minDistance, Math.min(orbit.maxDistance, orbit.distance * Math.exp(-dy * 0.0012)));
      this.renderer?.invalidate();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.code === "Escape" && event.type === "keydown") {
        event.preventDefault(); event.stopImmediatePropagation();
        this.exit();
        return;
      }
      if (MOVE_KEYS.test(event.code)) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (event.type === "keydown") this.keys.add(event.code); else this.keys.delete(event.code);
        this.updateCommand();
      } else if (SCROLL_KEYS.test(event.code) && !(event.target instanceof HTMLButtonElement)) {
        event.preventDefault(); event.stopImmediatePropagation();
      }
    };
    const onBlur = () => { this.keys.clear(); this.pad.clear(); this.updateCommand(); };
    addEventListener("wheel", onWheel, { passive: false, capture: true });
    addEventListener("keydown", onKey, { capture: true });
    addEventListener("keyup", onKey, { capture: true });
    addEventListener("blur", onBlur);
    this.simInput.push(() => {
      removeEventListener("wheel", onWheel, { capture: true });
      removeEventListener("keydown", onKey, { capture: true });
      removeEventListener("keyup", onKey, { capture: true });
      removeEventListener("blur", onBlur);
    });
  }

  private removeSimInput() {
    this.simInput.splice(0).forEach((fn) => fn());
    this.keys.clear();
    this.pad.clear();
    this.drag = null;
    this.twist = [0, 0, 0];
    this.applied = [0, 0, 0];
  }

  press(direction: string, down: boolean) {
    if (down) this.pad.add(direction); else this.pad.delete(direction);
    this.updateCommand();
  }

  private updateCommand() {
    const has = (code: string, pad: string) => this.keys.has(code) || this.pad.has(pad);
    const forward = (has("ArrowUp", "up") || this.keys.has("KeyW") ? 1 : 0) - (has("ArrowDown", "down") || this.keys.has("KeyS") ? 1 : 0);
    const turn = (has("ArrowLeft", "left") || this.keys.has("KeyA") ? 1 : 0) - (has("ArrowRight", "right") || this.keys.has("KeyD") ? 1 : 0);
    // Existing policy UI limits: forward 0.25 m/s, back 0.2 m/s, yaw 1 rad/s.
    this.twist = [forward > 0 ? 0.25 : forward < 0 ? -0.2 : 0, 0, turn];
    this.sendCommand();
  }

  /** Soft fence: the physics floor is an infinite plane at plinth height, so a
   * forward/back command that would carry the trunk off the plinth top is
   * zeroed (turning stays free). Re-evaluated on every snapshot. */
  private sendCommand() {
    let vx = this.twist[0];
    // Evaluated on the latest PHYSICS state (not the last rendered frame, which
    // can lag far behind at low frame rates), mapped through the rig root.
    const snap = this.lastSnapshot, fence = this.fence, toWorld = liveBridge.mjcfToWorld;
    if (vx !== 0 && fence && snap && toWorld && liveBridge.authority === "native") {
      const [w, x, y, z] = [snap.quaternion[0], snap.quaternion[1], snap.quaternion[2], snap.quaternion[3]];
      const trunk = toWorld(snap.position);
      const dir = toWorld([1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)], true);
      const n = dir ? Math.hypot(dir[0], dir[2]) : 0;
      if (trunk && dir && n > 1e-6) {
        const sign = Math.sign(vx);
        const px = trunk[0] + (dir[0] / n) * sign * FENCE_LOOKAHEAD, pz = trunk[2] + (dir[2] / n) * sign * FENCE_LOOKAHEAD;
        if (px < fence.minX || px > fence.maxX || pz < fence.minZ || pz > fence.maxZ) { vx = 0; this.fenceBlocks++; }
      }
    }
    const next: [number, number, number] = [vx, this.twist[1], this.twist[2]];
    if (next[0] === this.applied[0] && next[1] === this.applied[1] && next[2] === this.applied[2]) return;
    this.applied = next;
    if (this.worker && this.seeded) this.worker.postMessage({ type: "command", token: this.token, twist: next });
  }

  private wheelDelta(event: WheelEvent) {
    return event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * innerHeight : event.deltaY;
  }

  // ------------------------------------------------------ story + loading
  private onStory() {
    const story = storySnapshot();
    const wasEnterable = this.progress >= HANDOFF.enterProgress;
    this.progress = story.progress;
    if (this.progress >= HANDOFF.enterProgress !== wasEnterable) this.emit();
    setGradeTheme(story.presented);
    const t = liveThemeT(story.presented);
    if (Math.abs(t - this.lastTheme) > 1e-4) { this.lastTheme = t; applyThemeT(t, { css: false }); }
    const stage = loadStage(this.progress);
    if (stage === "none") { this.prefetchAbort?.abort(); if (this.prefetch === "running") this.prefetch = "none"; return; }
    if (stage === "runtime" && this.prefetch === "none") void this.prefetchRuntime();
  }

  get stage() { return loadStage(this.progress); }

  private async prefetchRuntime() {
    const abort = new AbortController();
    this.prefetchAbort = abort;
    this.prefetch = "running";
    const init: RequestInit & { priority?: "low" } = { signal: abort.signal, priority: "low" };
    try {
      void loadRobotSurfaceSource(abort.signal).catch(() => {});
      const base = new URL(assetPath("/sim/native/"), location.href);
      // Sequential, low priority, cancellable: warms the HTTP cache the Worker
      // reads from; bodies are discarded here.
      for (const path of runtimeFiles()) {
        const response = await fetch(new URL(path, base), init);
        await response.arrayBuffer();
        if (abort.signal.aborted) return;
      }
      this.prefetch = "done";
    } catch {
      this.prefetch = abort.signal.aborted ? "none" : "error";
    }
  }

  // ------------------------------------------------------------ debugging
  setRobotOnly(enabled: boolean) {
    const r = this.renderer;
    if (!r) return;
    if (enabled && !this.robotOnlySaved) {
      this.robotOnlySaved = { background: r.scene.background as Color | Texture | null };
      r.scene.background = null;
      r.gl.setClearAlpha(0);
    } else if (!enabled && this.robotOnlySaved) {
      r.scene.background = this.robotOnlySaved.background;
      this.robotOnlySaved = null;
    }
    liveBridge.robotOnly?.(enabled);
    r.invalidate();
  }

  debugRenderer() {
    const r = this.renderer;
    if (!r) return null;
    const bg = r.scene.background as { isColor?: boolean; getHexString?: () => string } | null;
    return { background: bg ? (bg.isColor ? bg.getHexString?.() : "texture") : null, clearAlpha: r.gl.getClearAlpha(), robotOnly: !!this.robotOnlySaved };
  }

  /** Calibration only: shallow per-theme grade overrides (see lib/sim/render-grade.ts); null restores the table. */
  setDebugGrade(overrides: Parameters<typeof setGradeOverrides>[0]) {
    setGradeOverrides(overrides);
    this.renderer?.invalidate();
  }

  /** Parity/registration only: show the live rig at a story pose regardless of phase. */
  setDebugLive(opacity: number | null, storyProgress = 1) {
    this.storyProgress = storyProgress;
    if (this.canvasEl) {
      this.canvasEl.style.opacity = opacity === null ? String(this.liveOpacity) : String(opacity);
      this.canvasEl.style.visibility = (opacity ?? this.liveOpacity) > 0 ? "visible" : "hidden";
    }
    this.renderer?.invalidate();
  }

  getState() {
    const o = this.orbit;
    const snap = this.lastSnapshot;
    return {
      phase: this.state.phase, stage: this.stage, prefetch: this.prefetch, liveReady: this.liveReady, reduced: this.state.reduced,
      backend: this.backend, token: this.token, entries: this.state.entries, exits: this.state.exits,
      steps: this.steps, simTime: this.simTime, twist: [...this.twist], appliedTwist: [...this.applied],
      fence: this.fence, fenceBlocks: this.fenceBlocks, trunkWorld: snap && liveBridge.mjcfToWorld ? liveBridge.mjcfToWorld(snap.position) : null,
      root: snap ? Array.from(snap.position) : [], joints: snap ? Array.from(snap.joints) : [],
      seed: this.seed ? { position: [...this.seed.position], quaternion: [...this.seed.quaternion], joints: [...this.seed.joints] } : null,
      seedJointError: this.seedJointError, seedWorldJumpMm: liveBridge.seedWorldJumpMm, loadMs: this.loadMs,
      mainThreadSteps: this.mainThreadSteps, appliedFrames: liveBridge.appliedFrames, staleDropped: this.staleDropped,
      authority: liveBridge.authority, liveOpacity: this.liveOpacity, storyProgress: this.storyProgress,
      camera: o ? { azimuth: o.azimuth, elevation: o.elevation, distance: o.distance, minDistance: o.minDistance, maxDistance: o.maxDistance } : null,
      workers: (this.worker ? 1 : 0) + this.retiring.size,
      phaseLog: [...this.phaseLog],
      errors: [...this.errors],
    };
  }

  private computeHud(): HudSnapshot {
    return {
      phase: this.state.phase,
      canEnter: this.state.phase === "story" && this.liveReady && this.progress >= HANDOFF.enterProgress,
      loading: this.state.phase === "await",
      reduced: this.state.reduced,
      error: this.backend === "error",
    };
  }

  private emit() {
    const next = this.computeHud();
    const prev = this.hud;
    if (prev.phase === next.phase && prev.canEnter === next.canEnter && prev.loading === next.loading && prev.reduced === next.reduced && prev.error === next.error) return;
    this.hud = next;
    this.listeners.forEach((fn) => fn());
  }
}

function slerpWxyz(a: ArrayLike<number>, b: ArrayLike<number>, t: number) {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const sign = dot < 0 ? -1 : 1;
  dot *= sign;
  if (dot > 0.9995) {
    const out = [0, 1, 2, 3].map((i) => lerp(a[i], sign * b[i], t));
    const n = Math.hypot(out[0], out[1], out[2], out[3]);
    return out.map((v) => v / n);
  }
  const theta = Math.acos(dot), s = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / s, wb = (Math.sin(t * theta) / s) * sign;
  return [0, 1, 2, 3].map((i) => a[i] * wa + b[i] * wb);
}
