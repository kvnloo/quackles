import {
  Color, Group, Material, Mesh, MeshBasicMaterial, MeshStandardMaterial, ShaderChunk,
  SRGBColorSpace, Texture, TextureLoader,
} from "three";
import { assetPath } from "./paths";
import { ensureProbe } from "./probe";
import { BUILD_SHA } from "./build-info";
import { getThemeSnapshot, paletteAt } from "./theme";

type ThemeMaps = { white: string; blue: string; dark: string; };
type MaterialMaps = {
  colorMaps: ThemeMaps;
  emissive?: boolean;
  roughnessMap?: string;
  normalMap?: string;
  roughness?: number;
  metalness?: number;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseMaterials(value: unknown): Map<string, MaterialMaps> {
  if (!isObject(value) || !isObject(value.materials))
    throw new Error("Studio manifest must contain materials");
  const result = new Map<string, MaterialMaps>();
  for (const [name, entry] of Object.entries(value.materials)) {
    if (!isObject(entry) || !isObject(entry.colorMaps))
      throw new Error(`Studio material ${name} must contain colorMaps`);
    const maps = entry.colorMaps;
    if (entry.emissive !== undefined && typeof entry.emissive !== "boolean")
      throw new Error(`Invalid emissive flag for studio material ${name}`);
    if (typeof maps.white !== "string" || typeof maps.blue !== "string" || typeof maps.dark !== "string")
      throw new Error(`Studio material ${name} requires white, blue, and dark color maps`);
    for (const key of ["roughnessMap", "normalMap"])
      if (entry[key] !== undefined && typeof entry[key] !== "string")
        throw new Error(`Invalid ${key} for studio material ${name}`);
    for (const key of ["roughness", "metalness"])
      if (entry[key] !== undefined && (typeof entry[key] !== "number" || !Number.isFinite(entry[key])))
        throw new Error(`Invalid ${key} for studio material ${name}`);
    result.set(name, {
      colorMaps: { white: maps.white, blue: maps.blue, dark: maps.dark },
      ...(typeof entry.emissive === "boolean" ? { emissive: entry.emissive } : {}),
      ...(typeof entry.roughnessMap === "string" ? { roughnessMap: entry.roughnessMap } : {}),
      ...(typeof entry.normalMap === "string" ? { normalMap: entry.normalMap } : {}),
      ...(typeof entry.roughness === "number" ? { roughness: entry.roughness } : {}),
      ...(typeof entry.metalness === "number" ? { metalness: entry.metalness } : {}),
    });
  }
  return result;
}

export async function prepareStudioMaterials(set: Group) {
  const response = await fetch(assetPath(`/preview-scene/studio-set-manifest.json?v=${encodeURIComponent(BUILD_SHA)}`));
  if (!response.ok) throw new Error(`Studio manifest failed: ${response.status}`);
  const definitions = parseMaterials(await response.json());
  const loader = new TextureLoader();
  const textures = new Map<string, Promise<Texture>>();
  const owned = new Set<Texture>();
  const materials = new Set<MeshStandardMaterial>();
  const theme = { value: getThemeSnapshot() };
  const walls: MeshBasicMaterial[] = [];
  const inks: { material: MeshStandardMaterial; white: Color }[] = [];
  const darkInk = new Color("#5688ff");
  const prepareWall = (material: Material) => {
    if (!material.name.endsWith("__POSTER-wall")) return material;
    const wall = new MeshBasicMaterial({ color: paletteAt(theme.value).paper, side: material.side, toneMapped: false });
    wall.name = material.name;
    walls.push(wall);
    material.dispose();
    return wall;
  };
  set.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    node.material = Array.isArray(node.material) ? node.material.map(prepareWall) : prepareWall(node.material);
    for (const material of Array.isArray(node.material) ? node.material : [node.material])
      if (material instanceof MeshStandardMaterial) materials.add(material);
  });
  const load = (path: string, color: boolean) => {
    const key = `${color}:${path}`;
    let pending = textures.get(key);
    if (!pending) {
      pending = loader.loadAsync(assetPath(`/preview-scene/${path}?v=${encodeURIComponent(BUILD_SHA)}`)).then((texture) => {
        texture.flipY = false;
        if (color) texture.colorSpace = SRGBColorSpace;
        owned.add(texture);
        return texture;
      });
      textures.set(key, pending);
    }
    return pending;
  };
  try {
    await Promise.all([...materials].map(async (material) => {
      const definition = definitions.get(material.name);
      if (!definition) {
        if (material.name.endsWith("__POSTER-plinth-ink")) inks.push({ material, white: material.color.clone() });
        return;
      }
      const [white, blue, dark] = await Promise.all([
        load(definition.colorMaps.white, true), load(definition.colorMaps.blue, true), load(definition.colorMaps.dark, true),
      ]);
      if (definition.roughnessMap) material.roughnessMap = await load(definition.roughnessMap, false);
      if (definition.normalMap) material.normalMap = await load(definition.normalMap, false);
      if (definition.roughness !== undefined) material.roughness = definition.roughness;
      if (definition.metalness !== undefined) material.metalness = definition.metalness;
      bindColorMapThemes({ material, white, blue, dark, theme, emissive: definition.emissive });
    }));
  } catch (error) {
    owned.forEach((texture) => texture.dispose());
    throw error;
  }
  return {
    update() {
      theme.value = getThemeSnapshot();
      const probe = ensureProbe();
      if (probe) probe.setTheme = theme.value;
      for (const wall of walls) wall.color.set(paletteAt(theme.value).paper);
      const darkWeight = Math.max(0, (theme.value - 0.5) * 2);
      for (const { material, white } of inks) {
        material.color.copy(white).lerp(darkInk, darkWeight);
        material.emissive.copy(darkInk).multiplyScalar(darkWeight * 0.08);
      }
    },
    dispose() { owned.forEach((texture) => texture.dispose()); },
  };
}

export function bindColorMapThemes({ material, white, blue, dark, theme, emissive = false }: {
  material: MeshStandardMaterial;
  white: Texture;
  blue: Texture;
  dark: Texture;
  theme: { value: number; };
  emissive?: boolean;
}) {
  material.color.set("#ffffff");
  if (emissive) {
    material.color.set("#000000");
    material.map = null;
    material.emissive.set("#ffffff");
    material.emissiveMap = white;
    material.toneMapped = false;
  } else {
    material.map = white;
  }
  material.onBeforeCompile = (shader) => {
    shader.uniforms.studioTheme = theme;
    shader.uniforms.studioBlueMap = { value: blue };
    shader.uniforms.studioDarkMap = { value: dark };
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <map_pars_fragment>", `${ShaderChunk.map_pars_fragment}\nuniform float studioTheme;\nuniform sampler2D studioBlueMap;\nuniform sampler2D studioDarkMap;`)
      .replace("#include <map_fragment>", ShaderChunk.map_fragment.replace(
        "vec4 sampledDiffuseColor = texture2D( map, vMapUv );",
        `vec4 sampledDiffuseColor = studioTheme <= 0.5
              ? mix(texture2D(map, vMapUv), texture2D(studioBlueMap, vMapUv), studioTheme * 2.0)
              : mix(texture2D(studioBlueMap, vMapUv), texture2D(studioDarkMap, vMapUv), (studioTheme - 0.5) * 2.0);`,
      ))
      .replace("#include <emissivemap_fragment>", ShaderChunk.emissivemap_fragment.replace(
        "vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );",
        `vec4 emissiveColor = studioTheme <= 0.5
              ? mix(texture2D(emissiveMap, vEmissiveMapUv), texture2D(studioBlueMap, vEmissiveMapUv), studioTheme * 2.0)
              : mix(texture2D(studioBlueMap, vEmissiveMapUv), texture2D(studioDarkMap, vEmissiveMapUv), (studioTheme - 0.5) * 2.0);`,
      ));
  };
  material.customProgramCacheKey = () => "quackles-studio-theme-v1";
  material.needsUpdate = true;
}
