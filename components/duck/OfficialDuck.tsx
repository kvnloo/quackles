"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { Group, Matrix4, Mesh, MeshStandardMaterial, Object3D, Quaternion, Texture, Vector3 } from "three";
import { poseAt, type Pose } from "@/lib/pose";
import {
  auditFeet,
  driveRig,
  isRig,
  prepareRig,
  type Rig,
} from "@/lib/sim/drive";
import { applyRobotSurfaces } from "@/lib/sim/robot-surfaces";
import { auditBounds } from "@/lib/scene-audit";
import { ensureProbe } from "@/lib/probe";
import {
  auditRenderBatches,
  prepareRigForRendering,
} from "@/lib/sim/render-rig";
import {
  buildRig,
  loadKinematics,
  MODEL_DIR,
  setJoint,
} from "@/vendor/microduck-simulator/duck.js";
import { JOINT_NAMES } from "@/vendor/microduck-simulator/constants.js";
import { useExperience } from "@/components/providers/ExperienceProvider";
import { liveBridge, type SimSeed } from "@/lib/sim/live-bridge";

const _inverse = new Matrix4();
const _point = new Vector3();
const _world = new Vector3();
const _relative = new Quaternion();
type JointRecord = { body: Group; axis: Vector3; baseQuat: Quaternion };
/** Angle actually rendered for a hinge: baseQuat^-1 * body.quaternion about the joint axis. */
function renderedJointAngle(rig: Rig, name: string) {
  const joint = rig.joints.get(name) as JointRecord | undefined;
  if (!joint) return 0;
  _relative.copy(joint.baseQuat).invert().multiply(joint.body.quaternion);
  const s = _relative.x * joint.axis.x + _relative.y * joint.axis.y + _relative.z * joint.axis.z;
  let angle = 2 * Math.atan2(s, _relative.w);
  if (angle > Math.PI) angle -= 2 * Math.PI;
  if (angle < -Math.PI) angle += 2 * Math.PI;
  return angle;
}
const shell = { color: [0.71, 0.68, 0.61], roughness: 0.46, metalness: 0.02 };
const dark = { color: [0.015, 0.017, 0.02], roughness: 0.39, metalness: 0.2 };
const metal = { color: [0.25, 0.27, 0.29], roughness: 0.31, metalness: 0.78 };
function materialForMesh(name: string) {
  if (name === "noenoeil.stl") return shell;
  if (name === "lens.stl")
    return {
      color: [0.008, 0.015, 0.025],
      roughness: 0.09,
      metalness: 0.2,
      clearcoat: 0.6,
    };
  if (name === "bottom_head_shell.stl") return dark;
  if (
    /head_shell|left_shell|right_shell|upper_leg|foot|ankle|eye_ring/.test(name)
  )
    return shell;
  if (/bracket|bearing|horn|holder|support/.test(name)) return metal;
  return dark;
}
/** Native authority: the placer stays at the seeded (assembled) placement with
 * the MJCF floor (z = 0) exactly where the rendered soles were; the physics
 * snapshot owns the trunk and the 14 joints. Returns false when not native. */
function applyNative(rig: Rig) {
  const sim = liveBridge.authority === "native" ? liveBridge.snapshot : null;
  const seed = liveBridge.seed;
  const trunk = rig.bodies.get("trunk_base");
  if (!sim || !seed || !trunk) return false;
  rig.placer.position.y = seed.placerY + seed.soleMinZ * rig.placer.scale.y;
  trunk.position.set(sim.position[0], sim.position[1], sim.position[2]);
  trunk.quaternion.set(sim.quaternion[1], sim.quaternion[2], sim.quaternion[3], sim.quaternion[0]);
  JOINT_NAMES.forEach((name: string, i: number) => setJoint(rig, name, sim.joints[i]));
  if (liveBridge.seedWorldJumpMm === null) {
    rig.placer.updateWorldMatrix(true, true);
    trunk.getWorldPosition(_world);
    liveBridge.seedWorldJumpMm = Math.hypot(_world.x - seed.trunkWorld[0], _world.y - seed.trunkWorld[1], _world.z - seed.trunkWorld[2]) * 1000;
  }
  liveBridge.appliedFrames++;
  return true;
}

export function OfficialDuck({
  poseRef,
}: {
  poseRef: {
    current: Pose;
  };
}) {
  const host = useRef<Group>(null),
    rigRef = useRef<{
      rig: Rig;
      prepared: ReturnType<typeof prepareRig>;
      trunkRest: Quaternion | null;
    } | null>(null);
  const { gl, scene, camera, invalidate } = useThree();
  const { setRigReady, setWebgl } = useExperience();
  useEffect(() => {
    const group = host.current;
    if (!group) return;
    let cancelled = false;
    let activeRig: Rig | null = null;
    let disposeSurfaces: (() => void) | undefined;
    async function load() {
      try {
        const kinematics = await loadKinematics(`${MODEL_DIR}/kinematics.json`);
        const rig = await buildRig(kinematics, { materialForMesh });
        if (!isRig(rig)) throw new Error("Invalid Microduck hierarchy");
        if (cancelled) return;
        const registration = prepareRig(rig);
        driveRig(rig, poseAt(0), registration);
        const robotSurfaces = await applyRobotSurfaces(rig);
        disposeSurfaces = robotSurfaces.dispose;
        if (cancelled) return;
        const prepared = prepareRig(rig);
        prepareRigForRendering(rig);
        rig.root.traverse((node) => {
          if (node instanceof Mesh) {
            node.castShadow = true;
            node.receiveShadow = true;
          }
        });
        activeRig = rig;
        group!.add(rig.placer);
        const trunk = rig.bodies.get("trunk_base");
        rigRef.current = { rig, prepared, trunkRest: trunk ? trunk.quaternion.clone() : null };
        liveBridge.trunkWorld = () => {
          const body = rig.bodies.get("trunk_base");
          if (!body) return null;
          body.getWorldPosition(_world);
          return [_world.x, _world.y, _world.z];
        };
        liveBridge.captureSeed = (pose: Pose): SimSeed | null => {
          const body = rig.bodies.get("trunk_base");
          const active = rigRef.current;
          if (!body || !active) return null;
          if (active.trunkRest) body.quaternion.copy(active.trunkRest);
          driveRig(rig, pose, prepared);
          rig.placer.updateWorldMatrix(true, true);
          _inverse.copy(rig.root.matrixWorld).invert();
          let soleMinZ = Infinity;
          for (const sole of prepared.soles)
            for (const corner of sole.bottom) {
              _point.copy(corner).applyMatrix4(sole.mesh.matrixWorld).applyMatrix4(_inverse);
              soleMinZ = Math.min(soleMinZ, _point.z);
            }
          body.getWorldPosition(_world);
          const q = body.quaternion;
          return {
            position: [body.position.x, body.position.y, body.position.z - soleMinZ],
            quaternion: [q.w, q.x, q.y, q.z],
            joints: JOINT_NAMES.map((name: string) => renderedJointAngle(rig, name)),
            soleMinZ,
            placerY: rig.placer.position.y,
            trunkWorld: [_world.x, _world.y, _world.z],
          };
        };
        liveBridge.applyNow = () => { applyNative(rig); invalidate(); };
        liveBridge.trunkHeading = () => {
          const body = rig.bodies.get("trunk_base");
          if (!body) return null;
          const e = body.matrixWorld.elements;
          const n = Math.hypot(e[0], e[2]);
          return n > 1e-6 ? [e[0] / n, e[2] / n] : null;
        };
        liveBridge.robotOnly = (enabled: boolean) => {
          const inRig = (node: Object3D) => { for (let n: Object3D | null = node; n; n = n.parent) if (n === rig.placer) return true; return false; };
          scene.traverse((node) => {
            if (!(node instanceof Mesh)) return;
            if (enabled && node.visible && !inRig(node)) { node.userData.simHidden = true; node.visible = false; }
            else if (!enabled && node.userData.simHidden) { node.visible = true; delete node.userData.simHidden; }
          });
          invalidate();
        };
        window.__QUACKLES_PREPARE_AUDIT__ = robotSurfaces.prepareAudit;
        window.__QUACKLES_AUDIT__ = () => {
          const feet = auditFeet(rig, prepared);
          return {
            ...feet,
            robotSurfaces: robotSurfaces.getAudit(),
            duckBounds: auditBounds(rig.placer, camera),
            support: { group: "set_robot_plinth", topY: 0, contact: Math.abs(feet.feetMinY) < 0.0005 },
            batchGeometry: auditRenderBatches(rig),
          };
        };
        driveRig(rig, poseRef.current, prepared);
        await gl.compileAsync(scene, camera);
        if (cancelled) return;
        const q = ensureProbe();
        if (q) {
          q.rigReady = true;
          q.rigLoaded = true;
        }
        setRigReady(true);
        invalidate();
      } catch (error) {
        if (!cancelled) {
          console.error("Microduck model load failed", error);
          setWebgl(false);
          setRigReady(true);
        }
      }
    }
    void load();
    return () => {
      delete window.__QUACKLES_AUDIT__;
      delete window.__QUACKLES_PREPARE_AUDIT__;
      cancelled = true;
      rigRef.current = null;
      liveBridge.captureSeed = null;
      liveBridge.applyNow = null;
      liveBridge.trunkWorld = null;
      liveBridge.trunkHeading = null;
      liveBridge.robotOnly = null;
      liveBridge.authority = "cinematic";
      liveBridge.snapshot = null;
      disposeSurfaces?.();
      if (activeRig) {
        group.remove(activeRig.placer);
        const materials = new Set<MeshStandardMaterial>();
        const textures = new Set<Texture>();
        activeRig.root.traverse((node) => {
          if (
            node instanceof Mesh &&
            node.material instanceof MeshStandardMaterial
          )
            materials.add(node.material);
          if (node instanceof Mesh && (node.userData.mergedForRendering || node.userData.robotSurface))
            node.geometry.dispose();
        });
        materials.forEach((material) => {
          for (const value of Object.values(material))
            if (value instanceof Texture) textures.add(value);
          material.dispose();
        });
        textures.forEach((texture) => texture.dispose());
      }
    };
  }, [camera, gl, invalidate, poseRef, scene, setRigReady, setWebgl]);
  useFrame(() => {
    const active = rigRef.current;
    if (!active) return;
    if (applyNative(active.rig)) return;
    const trunk = active.rig.bodies.get("trunk_base");
    if (trunk && active.trunkRest) trunk.quaternion.copy(active.trunkRest);
    const feetMinY = driveRig(active.rig, poseRef.current, active.prepared);
    const q = ensureProbe();
    if (q) {
      q.feetMinY = feetMinY;
      q.renderedProgress = q.progress;
      q.renderedAt = performance.now();
      const p = active.rig.placer.position;
      q.rootPosition[0] = p.x;
      q.rootPosition[1] = p.y;
      q.rootPosition[2] = p.z;
    }
  }, -1);
  return <group ref={host} />;
}
