import { BufferGeometry, Matrix4, Mesh, MeshStandardMaterial, SRGBColorSpace, Texture, TextureLoader, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { assetPath } from "../paths";
import { ensureProbe } from "../probe";
import { BUILD_SHA } from "../build-info";
import { bindColorMapThemes } from "../studio-materials";
import { getThemeSnapshot, subscribeTheme } from "../theme";
import type { Rig } from "./drive";

function textureInfo(texture: Texture | null) {
  if (!texture) return null;
  const data: unknown = texture.source.data;
  const width = typeof data === "object" && data !== null && "width" in data && typeof data.width === "number" ? data.width : 0;
  const height = typeof data === "object" && data !== null && "height" in data && typeof data.height === "number" ? data.height : 0;
  return { name: texture.name, width, height, colorSpace: texture.colorSpace };
}

function positions(geometry: BufferGeometry) {
  const attribute = geometry.getAttribute("position");
  const result: Vector3[] = [];
  const seen = new Set<string>();
  for (let i = 0;i < attribute.count;i++) {
    const point = new Vector3().fromBufferAttribute(attribute, i);
    const key = `${point.x},${point.y},${point.z}`;
    if (!seen.has(key)) { seen.add(key); result.push(point); }
  }
  return result;
}
function maxSurfaceDistance(points: Vector3[], surface: BufferGeometry, MeshBVH: typeof import("three-mesh-bvh").MeshBVH) {
  const geometry = surface.clone();
  const bvh = new MeshBVH(geometry);
  const hit = { point: new Vector3(), distance: 0, faceIndex: 0 };
  let maximum = 0;
  for (const point of points) {
    const nearest = bvh.closestPointToPoint(point, hit);
    if (!nearest) throw new Error("Robot surface contains no triangles");
    maximum = Math.max(maximum, nearest.distance);
  }
  geometry.dispose();
  return maximum;
}

export async function applyRobotSurfaces(rig: Rig) {
  const url = (suffix: string) => assetPath(`/preview-scene/robot-surface.glb${suffix}?v=${encodeURIComponent(BUILD_SHA)}`);
  const compressed = typeof DecompressionStream === "function";
  let response = await fetch(url(compressed ? ".gz" : ""));
  if (compressed && response.status === 404) response = await fetch(url(""));
  if (response.status === 404) return { getAudit: () => ({ complete: false, meshes: [] }), prepareAudit: async () => { }, dispose: () => { } };
  if (!response.ok) throw new Error(`Robot surfaces failed: ${response.status}`);
  let buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    buffer = await new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  }
  const gltf = await new GLTFLoader().parseAsync(buffer, "");
  const receipt = await fetch(assetPath(`/preview-scene/robot-surface-manifest.json?v=${encodeURIComponent(BUILD_SHA)}`));
  if (!receipt.ok) throw new Error(`Robot surface receipt failed: ${receipt.status}`);
  const manifest: unknown = await receipt.json();
  const theme = { value: getThemeSnapshot() };
  // The Blender recovery surface is useful geometry, but its production color
  // came from PHOTO-pigment-* camera projections. Keep that look opt-in for
  // forensic A/B comparison instead of shipping poster imagery on the robot.
  const projectedPigment =
    typeof location !== "undefined" &&
    new URLSearchParams(location.search).get("pigment") === "1";
  let themeMaps: { blue: Texture; dark: Texture; } | null = null;
  if (projectedPigment && typeof manifest === "object" && manifest !== null && "themeColorMaps" in manifest) {
    const maps = manifest.themeColorMaps;
    if (typeof maps !== "object" || maps === null || !("blue" in maps) || !("dark" in maps) || typeof maps.blue !== "string" || typeof maps.dark !== "string")
      throw new Error("Robot theme maps require blue and dark file names");
    const loader = new TextureLoader();
    const [blue, dark] = await Promise.all([maps.blue, maps.dark].map(async (name) => {
      const texture = await loader.loadAsync(assetPath(`/preview-scene/${name}?v=${encodeURIComponent(BUILD_SHA)}`));
      texture.flipY = false;
      texture.colorSpace = SRGBColorSpace;
      return texture;
    }));
    themeMaps = { blue, dark };
  }
  const themed = new Set<MeshStandardMaterial>();
  const updateTheme = () => {
    theme.value = getThemeSnapshot();
    const probe = ensureProbe();
    if (probe) probe.robotTheme = theme.value;
  };
  updateTheme();
  const unsubscribe = subscribeTheme(updateTheme);
  gltf.scene.updateWorldMatrix(true, true);
  rig.placer.updateWorldMatrix(true, true);
  const meshes: Array<{ bodyName: string; meshName: string; sourceTriangles: number; renderTriangles: number; maxSurfaceDeviation: number | null; comparison: "previous-web-tessellation"; materialName: string; colorMap: ReturnType<typeof textureInfo>; roughnessMap: ReturnType<typeof textureInfo>; normalMap: ReturnType<typeof textureInfo>; }> = [];
  const inverse = new Matrix4();
  const assigned = new Set<Mesh>();
  const sources: { original: BufferGeometry; replacement: BufferGeometry; }[] = [];
  gltf.scene.traverse((patch) => {
    if (!(patch instanceof Mesh)) return;
    const { bodyName, meshName } = patch.userData;
    if (typeof bodyName !== "string" || typeof meshName !== "string")
      throw new Error("Robot surface requires bodyName and meshName");
    const body = rig.bodies.get(bodyName);
    if (!body) throw new Error(`Robot surface body missing: ${bodyName}`);
    const matches: Mesh[] = [];
    body.traverse((node) => {
      if (node instanceof Mesh && node.userData.meshName === meshName && !assigned.has(node)) matches.push(node);
    });
    if (!matches.length) throw new Error(`Robot surface has no official mesh: ${bodyName}/${meshName}`);
    patch.geometry.computeBoundingBox();
    const center = new Vector3();
    patch.geometry.boundingBox?.getCenter(center);
    center.applyMatrix4(patch.matrixWorld);
    const centerDistance = (mesh: Mesh) => {
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const point = new Vector3();
      mesh.geometry.boundingBox?.getCenter(point);
      return point.applyMatrix4(mesh.matrixWorld).distanceToSquared(center);
    };
    matches.sort((a, b) => centerDistance(a) - centerDistance(b));
    if (matches.length > 1 && Math.abs(centerDistance(matches[0]) - centerDistance(matches[1])) < 1e-12)
      throw new Error(`Robot surface matching is ambiguous: ${bodyName}/${meshName}`);
    const original = matches[0];
    assigned.add(original);
    if (!(patch.material instanceof MeshStandardMaterial))
      throw new Error(`Robot surface must use one PBR material: ${bodyName}/${meshName}`);
    if (!(original.material instanceof MeshStandardMaterial))
      throw new Error(`Official robot mesh must use one PBR material: ${bodyName}/${meshName}`);
    const renderMaterial = projectedPigment ? patch.material : original.material;
    const geometry = patch.geometry.clone().applyMatrix4(patch.matrixWorld).applyMatrix4(inverse.copy(original.matrixWorld).invert());
    meshes.push({ bodyName, meshName, sourceTriangles: (original.geometry.index?.count ?? original.geometry.getAttribute("position").count) / 3, renderTriangles: (geometry.index?.count ?? geometry.getAttribute("position").count) / 3, maxSurfaceDeviation: null, comparison: "previous-web-tessellation", materialName: renderMaterial.name, colorMap: textureInfo(renderMaterial.map), roughnessMap: textureInfo(renderMaterial.roughnessMap), normalMap: textureInfo(renderMaterial.normalMap) });
    sources.push({ original: original.geometry, replacement: geometry });
    original.userData.robotSurface = true;
    original.userData.robotSurfacePigment = projectedPigment;
    original.geometry = geometry;
    if (projectedPigment && themeMaps && !themed.has(patch.material)) {
      if (!patch.material.map) throw new Error("Robot surface is missing its white color map");
      bindColorMapThemes({ material: patch.material, white: patch.material.map, ...themeMaps, theme });
      themed.add(patch.material);
    }
    if (projectedPigment) {
      patch.material.userData.robotSurface = true;
      original.material = patch.material;
    }
    patch.geometry.dispose();
  });
  let pending: Promise<void> | null = null;
  let complete = false;
  return {
    dispose() { unsubscribe(); themeMaps?.blue.dispose(); themeMaps?.dark.dispose(); },
    getAudit: () => ({ complete, projectedPigment, method: "Symmetric nearest-triangle distances at unique vertices; sampled comparison with the previous web tessellation", meshes }),
    prepareAudit() {
      pending ??= (async () => {
        const { MeshBVH } = await import("three-mesh-bvh");
        sources.forEach(({ original, replacement }, i) => {
          meshes[i].maxSurfaceDeviation = Math.max(
            maxSurfaceDistance(positions(original), replacement, MeshBVH),
            maxSurfaceDistance(positions(replacement), original, MeshBVH),
          );
        });
        complete = true;
      })();
      return pending;
    },
  };
}
