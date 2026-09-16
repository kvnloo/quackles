import {
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
  type BufferGeometry,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Rig } from "./drive";

const batchAudits = new WeakMap<
  Rig,
  { batches: number; vertexCount: number; maxDeviation: number }
>();
const renderBatches = new WeakMap<Rig, { merged: Mesh; originals: Mesh[] }[]>();

/** Combine rigid, same-material parts without changing any joint or surface. */
export function prepareRigForRendering(rig: Rig) {
  const records: { merged: Mesh; originals: Mesh[] }[] = [];
  renderBatches.set(rig, records);
  const materials = new Map<MeshStandardMaterial, MeshStandardMaterial>();
  const groups: Group[] = [];
  rig.root.traverse((node) => {
    if (node instanceof Group) groups.push(node);
    if (
      !(node instanceof Mesh) ||
      !(node.material instanceof MeshStandardMaterial)
    )
      return;
    const original = node.material;
    let material = materials.get(original);
    if (!material) {
      material = new MeshStandardMaterial({
        color: original.color,
        roughness: original.roughness,
        metalness: original.metalness,
        envMapIntensity: original.envMapIntensity,
      });
      materials.set(original, material);
    }
    node.material = material;
  });
  for (const group of groups) {
    const batches = new Map<MeshStandardMaterial, Mesh[]>();
    for (const child of group.children) {
      if (
        !(child instanceof Mesh) ||
        !(child.material instanceof MeshStandardMaterial) ||
        String(child.userData.meshName).includes("sole")
      )
        continue;
      const batch = batches.get(child.material) ?? [];
      batch.push(child);
      batches.set(child.material, batch);
    }
    for (const [material, meshes] of batches) {
      if (meshes.length < 2) continue;
      const transformed: BufferGeometry[] = meshes.map((mesh) => {
        mesh.updateMatrix();
        return mesh.geometry.clone().applyMatrix4(mesh.matrix);
      });
      const geometry = mergeGeometries(transformed, false);
      transformed.forEach((part) => part.dispose());
      if (!geometry) continue;
      geometry.computeBoundingSphere();
      const merged = new Mesh(geometry, material);
      merged.userData.mergedForRendering = true;
      merged.name = `${group.name}_surface`;
      records.push({ merged, originals: meshes });
      group.add(merged);
      meshes.forEach((mesh) => group.remove(mesh));
    }
  }
  materials.forEach((_, original) => original.dispose());
}

/** Check every batched vertex against its source part in the same rigid body. */
export function auditRenderBatches(rig: Rig) {
  const cached = batchAudits.get(rig);
  if (cached) return cached;
  let vertexCount = 0,
    maxDeviation = 0;
  const point = new Vector3();
  const records = renderBatches.get(rig) ?? [];
  for (const { merged, originals } of records) {
    const combined = merged.geometry.getAttribute("position");
    let offset = 0;
    for (const original of originals) {
      const positions = original.geometry.getAttribute("position");
      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i).applyMatrix4(original.matrix);
        const target = offset + i;
        maxDeviation = Math.max(
          maxDeviation,
          Math.abs(point.x - combined.getX(target)),
          Math.abs(point.y - combined.getY(target)),
          Math.abs(point.z - combined.getZ(target)),
        );
      }
      offset += positions.count;
    }
    if (offset !== combined.count)
      throw new Error("Batch changed the number of source vertices");
    vertexCount += offset;
  }
  const result = { batches: records.length, vertexCount, maxDeviation };
  batchAudits.set(rig, result);
  return result;
}
