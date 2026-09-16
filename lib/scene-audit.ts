import { Box3, Camera, Frustum, Matrix4, Mesh, Object3D, Vector3 } from "three";

export function auditBounds(object: Object3D, camera: Camera) {
  object.updateWorldMatrix(true, true);
  camera.updateMatrixWorld();
  const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  let frustumVisible = false;
  const world = new Box3();
  const projected = new Box3();
  const corner = new Vector3();
  const include = () => {
    world.expandByPoint(corner);
    corner.project(camera);
    corner.set((corner.x + 1) / 2, (1 - corner.y) / 2, corner.z);
    projected.expandByPoint(corner);
  };
  object.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    let visible = true;
    for (let parent: Object3D | null = node;parent;parent = parent.parent)
      if (!parent.visible) visible = false;
    if (visible && !frustumVisible) {
      const positions = node.geometry.getAttribute("position");
      const index = node.geometry.index;
      for (let i = 0;i < (index?.count ?? positions.count);i += 3) {
        let polygon = [0, 1, 2].map((offset) => new Vector3().fromBufferAttribute(positions, index ? index.getX(i + offset) : i + offset).applyMatrix4(node.matrixWorld));
        for (const plane of frustum.planes) {
          const clipped: Vector3[] = [];
          for (let j = 0;j < polygon.length;j++) {
            const a = polygon[j], b = polygon[(j + 1) % polygon.length];
            const distanceA = plane.distanceToPoint(a), distanceB = plane.distanceToPoint(b);
            if (distanceA >= 0) clipped.push(a);
            if ((distanceA >= 0) !== (distanceB >= 0))
              clipped.push(a.clone().lerp(b, distanceA / (distanceA - distanceB)));
          }
          polygon = clipped;
          if (!polygon.length) break;
        }
        if (polygon.length) { frustumVisible = true; break; }
      }
    }
    if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
    const box = node.geometry.boundingBox;
    if (!box) return;
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z]) {
          corner.set(x, y, z).applyMatrix4(node.matrixWorld);
          include();
        }
  });
  if (world.isEmpty()) {
    object.getWorldPosition(corner);
    include();
  }
  return {
    frustumVisible,
    worldBounds: [world.min.toArray(), world.max.toArray()],
    projectedBounds: [projected.min.x, projected.min.y, projected.max.x, projected.max.y],
    projectedDepth: [projected.min.z, projected.max.z],
  };
}
