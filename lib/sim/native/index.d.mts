export type NumericVector = readonly number[] | Float32Array | Float64Array;
export interface NativeSeed {
  /** MJCF world metres, Z up. Defaults to [0, 0, 0.12]. */
  position?: NumericVector;
  /** Unit quaternion in MuJoCo WXYZ order. Defaults to identity. */
  quaternion?: NumericVector;
  /** Fourteen absolute hinge angles in JOINT_NAMES order, radians. */
  joints?: NumericVector;
  /** Twenty generalized velocities in the validated model's qvel order. */
  velocity?: NumericVector;
}
export interface NativeCommand {
  /** [vx, vy, wz], metres/second and radians/second. Walking normally uses vy=0. */
  twist?: NumericVector;
  /** [neck_pitch, head_pitch, head_yaw, head_roll], radians; EMA alpha 0.2. */
  head?: NumericVector;
  /** [x, y, z, roll, pitch, yaw], metres/radians; normally all zero. */
  body?: NumericVector;
}
/** Every buffer is a caller-owned copy, never a MuJoCo/ORT view. */
export interface NativeSnapshot {
  generation: number;
  time: number;
  position: Float64Array;
  quaternion: Float64Array;
  joints: Float64Array;
  qpos: Float64Array;
  velocity: Float64Array;
  controls: Float64Array;
  previousAction: Float32Array;
  /** Latest command targets (13), not necessarily the last inference input. */
  command: Float32Array;
  /** Committed smoothed head command (4). */
  head: Float32Array;
}
export type NativeStepResult =
  | { status: 'stepped'; steps: number; snapshot: NativeSnapshot }
  | { status: 'paused' | 'disposed' | 'busy' | 'stale'; steps: number; snapshot: null };
export interface NativeBackend {
  readonly status: 'paused' | 'running' | 'disposed';
  readonly generation: number;
  snapshot(): NativeSnapshot;
  /** Resets time, velocities (unless given), and all command/action histories. Pauses. */
  seed(pose?: NativeSeed): NativeSnapshot;
  setCommand(command?: NativeCommand): void;
  resume(): void;
  pause(): void;
  /** No queue. At most three 20ms ticks; excess catch-up is dropped. */
  step(count?: number): Promise<NativeStepResult>;
  /** Invalidates immediately, then waits for in-flight ORT before resource release. */
  dispose(): Promise<void>;
}
export function loadNativeBackend(options: { baseUrl: string | URL; signal?: AbortSignal }): Promise<NativeBackend>;
export const JOINT_NAMES: readonly string[];
export const DEFAULT_POSE: readonly number[];
export const CONTROL_DT: number;
