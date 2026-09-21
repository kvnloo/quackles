import { Group, Mesh, Vector3 } from "three";
import { DEFAULT_POSE, JOINT_NAMES } from "@/vendor/microduck-simulator/constants.js";
import { setJoint, setJawOpen } from "@/vendor/microduck-simulator/duck.js";
import type { Pose } from "@/lib/pose";
import calibration from "../poster-camera.json";
export type Rig = {
  placer: Group;
  root: Group;
  bodies: Map<string, Group>;
  joints: Map<string, unknown>;
};
export function isRig(value: unknown): value is Rig {
  return (
    typeof value === "object" &&
    value !== null &&
    "placer" in value &&
    value.placer instanceof Group &&
    "root" in value &&
    value.root instanceof Group &&
    "bodies" in value &&
    value.bodies instanceof Map &&
    Array.from(value.bodies.entries()).every(
      ([name, body]) => typeof name === "string" && body instanceof Group,
    ) &&
    "joints" in value &&
    value.joints instanceof Map
  );
}
type Part = {
  body: Group;
  rest: Vector3;
  away: Vector3;
};
type Sole = {
  mesh: Mesh;
  bottom: Vector3[];
};
export function prepareRig(rig: Rig) {
  const parts: Part[] = [];
  const soles: Sole[] = [];
  for (const [name, body] of rig.bodies) {
    const rest = body.position.clone();
    const away = rest.clone().normalize();
    if (name.includes("left")) away.y += 0.2;
    if (name.includes("right")) away.y -= 0.2;
    parts.push({ body, rest, away: away.normalize() });
  }
  rig.root.traverse((node) => {
    if (
      !(node instanceof Mesh) ||
      !String(node.userData.meshName).includes("sole")
    )
      return;
    node.geometry.computeBoundingBox();
    const box = node.geometry.boundingBox;
    if (!box) return;
    const positions = node.geometry.getAttribute("position");
    const seen = new Set<string>();
    const bottom: Vector3[] = [];
    for (let i = 0; i < positions.count; i++) {
      const v = new Vector3().fromBufferAttribute(positions, i);
      const key = `${v.x.toFixed(5)},${v.y.toFixed(5)},${v.z.toFixed(5)}`;
      if (!seen.has(key)) {
        seen.add(key);
        bottom.push(v);
      }
    }
    soles.push({ mesh: node, bottom });
  });
  return { parts, soles };
}
const point = new Vector3();

export function jointTargetsForPose(pose: Pose) {
  const crouch = pose.crouch;
  const hip = calibration.hip + crouch * 0.25 - pose.jump * 0.14;
  const knee = calibration.knee + crouch * 0.42 + pose.jump * 0.15;
  const cinematic = [
    0,
    -0.087266,
    -hip,
    -knee,
    hip - knee,
    pose.neckPitch,
    pose.headPitch,
    pose.headYaw,
    0,
    0,
    0.087266,
    hip,
    knee,
    knee - hip,
  ];
  const blend = Math.max(0, Math.min(1, pose.simulatorBlend ?? 0));
  return cinematic.map(
    (value, index) => value + (DEFAULT_POSE[index] - value) * blend,
  );
}

export function simulatorHandoffError(pose: Pose) {
  const targets = jointTargetsForPose(pose);
  const perJoint = JOINT_NAMES.map((name, index) => ({
    name,
    target: targets[index],
    simulator: DEFAULT_POSE[index],
    abs: Math.abs(targets[index] - DEFAULT_POSE[index]),
  }));
  const maxAbs = Math.max(...perJoint.map((entry) => entry.abs));
  const rms = Math.sqrt(
    perJoint.reduce((sum, entry) => sum + entry.abs * entry.abs, 0) /
      perJoint.length,
  );
  return { maxAbs, rms, perJoint };
}

export function driveRig(
  rig: Rig,
  pose: Pose,
  prepared: ReturnType<typeof prepareRig>,
) {
  const jointTargets = jointTargetsForPose(pose);
  JOINT_NAMES.forEach((name, index) => setJoint(rig, name, jointTargets[index]));
  setJawOpen(rig, pose.beak);
  for (const part of prepared.parts)
    part.body.position
      .copy(part.rest)
      .addScaledVector(part.away, pose.explode * 0.032);
  rig.placer.rotation.set(
    pose.duckRotation[0],
    -Math.PI / 2 + pose.duckRotation[1],
    pose.duckRotation[2],
  );
  rig.placer.position.set(pose.duckPosition[0], 0, pose.duckPosition[2]);
  rig.placer.scale.setScalar(pose.duckScale);
  rig.placer.updateWorldMatrix(true, true);
  let minY = Infinity;
  for (const sole of prepared.soles)
    for (const corner of sole.bottom)
      minY = Math.min(
        minY,
        point.copy(corner).applyMatrix4(sole.mesh.matrixWorld).y,
      );
  if (!Number.isFinite(minY)) minY = 0;
  rig.placer.position.y = -minY + pose.duckPosition[1] + pose.jump * 0.11;
  return pose.duckPosition[1] + pose.jump * 0.11;
}
export function auditFeet(rig: Rig, prepared: ReturnType<typeof prepareRig>) {
  rig.placer.updateWorldMatrix(true, true);
  let feetMinY = Infinity,
    soleVertices = 0;
  const soles = prepared.soles.map((sole) => {
    let minY = Infinity;
    const vertices = sole.mesh.geometry.getAttribute("position");
    for (let i = 0; i < vertices.count; i++) {
      point
        .fromBufferAttribute(vertices, i)
        .applyMatrix4(sole.mesh.matrixWorld);
      minY = Math.min(minY, point.y);
    }
    feetMinY = Math.min(feetMinY, minY);
    soleVertices += vertices.count;
    const index = sole.mesh.geometry.index;
    const a = new Vector3(),
      b = new Vector3(),
      c = new Vector3(),
      area = new Vector3();
    const planes = new Map<string, { vector: Vector3; triangles: number }>();
    for (let i = 0; i < (index?.count ?? vertices.count); i += 3) {
      a.fromBufferAttribute(vertices, index ? index.getX(i) : i).applyMatrix4(
        sole.mesh.matrixWorld,
      );
      b.fromBufferAttribute(
        vertices,
        index ? index.getX(i + 1) : i + 1,
      ).applyMatrix4(sole.mesh.matrixWorld);
      c.fromBufferAttribute(
        vertices,
        index ? index.getX(i + 2) : i + 2,
      ).applyMatrix4(sole.mesh.matrixWorld);
      area.crossVectors(b.sub(a), c.sub(a)).multiplyScalar(0.5);
      const length = area.length();
      if (length === 0 || area.y / length > -0.7) continue;
      const key = `${Math.round((area.x / length) * 100)},${Math.round((area.y / length) * 100)},${Math.round((area.z / length) * 100)}`;
      const plane = planes.get(key) ?? { vector: new Vector3(), triangles: 0 };
      plane.vector.add(area);
      plane.triangles++;
      planes.set(key, plane);
    }
    let dominant = { vector: new Vector3(), triangles: 0 };
    for (const plane of planes.values())
      if (plane.vector.lengthSq() > dominant.vector.lengthSq())
        dominant = plane;
    const planeAreaM2 = dominant.vector.length();
    const normal = dominant.vector.normalize();
    const tiltDegrees =
      (Math.acos(Math.min(1, Math.abs(normal.y))) * 180) / Math.PI;
    return {
      name: String(sole.mesh.userData.meshName),
      minY,
      vertexCount: vertices.count,
      tiltDegrees,
      planeAreaM2,
      planeTriangles: dominant.triangles,
    };
  });
  return { feetMinY, soleVertices, soles };
}
