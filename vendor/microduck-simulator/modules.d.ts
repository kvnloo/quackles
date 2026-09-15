declare module "@/vendor/microduck-simulator/duck.js" {
  export const MODEL_DIR: string;
  export const MESH_VERSION: string;
  export const SITTING_POSE: Record<string, number>;
  export const JAW_MAX_OPEN: number;
  export function loadKinematics(url: string): Promise<unknown>;
  export function buildRig(
    kinematics: unknown,
    opts?: { materialForMesh?: (mesh: string, body?: string, rgba?: number[]) => unknown }
  ): Promise<unknown>;
  export function cloneRig(rig: unknown): unknown;
  export function setJoint(rig: unknown, name: string, angle: number): void;
  export function setJawOpen(rig: unknown, open: number): void;
  export function applyPose(rig: unknown, pose: Record<string, number>): void;
  export function groundFullBody(rig: unknown, floorY?: number): number;
}

declare module "@/vendor/microduck-simulator/variants.js" {
  export const VARIANTS: Record<string, Record<string, unknown>>;
  export const DEFAULT_VARIANT: string;
  export const VARIANT_LABELS: Record<string, string>;
  export const VARIANT_SWATCH_HEX: Record<string, string>;
  export function materialHookFor(variant: unknown): (mesh: string) => unknown;
  export function applyVariant(rig: unknown, variant: string | unknown): void;
}

declare module "three/addons/environments/RoomEnvironment.js" {
  import type { Scene } from "three";
  export class RoomEnvironment extends Scene {
    dispose(): void;
  }
}

declare module "@/vendor/microduck-simulator/constants.js" {
  export const JOINT_NAMES: string[];
  export const DEFAULT_POSE: Float32Array;
  export const NUM_JOINTS: number;
}
