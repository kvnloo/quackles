"use client";
import { useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { Box3, Group, Material, Mesh, MeshStandardMaterial, Texture } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { useExperience } from "@/components/providers/ExperienceProvider";
import { assetPath } from "@/lib/paths";
import { BUILD_SHA } from "@/lib/build-info";
import { ensureProbe } from "@/lib/probe";
import { auditBounds } from "@/lib/scene-audit";
import { prepareStudioMaterials } from "@/lib/studio-materials";
import { getThemeSnapshot, subscribeTheme } from "@/lib/theme";

const SET_GROUPS = [
  "set_robot_plinth", "set_left_step", "set_orb_pedestal", "set_banner",
  "set_arch", "set_square_frame", "set_print", "set_backdrop",
  "set_floor", "set_foliage", "set_rear_block",
] as const;

function materialsIn(object: Group) {
  const materials = new Set<Material>();
  object.traverse((node) => {
    if (node instanceof Mesh) {
      for (const material of Array.isArray(node.material) ? node.material : [node.material])
        materials.add(material);
    }
  });
  return materials;
}

function disposeSet(object: Group) {
  const textures = new Set<Texture>();
  object.traverse((node) => {
    if (node instanceof Mesh) node.geometry.dispose();
  });
  for (const material of materialsIn(object)) {
    for (const value of Object.values(material))
      if (value instanceof Texture) textures.add(value);
    material.dispose();
  }
  textures.forEach((texture) => texture.dispose());
}

export function StudioSet() {
  const host = useRef<Group>(null);
  const { camera, gl, scene, invalidate } = useThree();
  const { setSetReady, setWebgl } = useExperience();
  useEffect(() => {
    const group = host.current;
    if (!group) return;
    let cancelled = false;
    let activeSet: Group | null = null;
    let themedMaterials: Awaited<ReturnType<typeof prepareStudioMaterials>> | null = null;
    let unsubscribe: (() => void) | undefined;
    async function load() {
      try {
        const gltf = await new GLTFLoader().loadAsync(
          assetPath(`/preview-scene/studio-set.glb?v=${encodeURIComponent(BUILD_SHA)}`),
        );
        if (cancelled) {
          disposeSet(gltf.scene);
          return;
        }
        const set = gltf.scene;
        activeSet = set;
        set.name = "quackles_studio";
        set.traverse((node) => {
          if (node.userData.cameraInvisible === true) node.visible = false;
        });
        for (const name of SET_GROUPS)
          if (!set.getObjectByName(name)) throw new Error(`Studio group missing: ${name}`);
        themedMaterials = await prepareStudioMaterials(set);
        if (cancelled) {
          themedMaterials.dispose();
          return;
        }
        themedMaterials.update();
        set.traverse((node) => {
          if (!(node instanceof Mesh)) return;
          const materials = Array.isArray(node.material) ? node.material : [node.material];
          const lit = materials.some((material) => material instanceof MeshStandardMaterial && material.emissiveMap === null);
          node.castShadow = node.visible && lit;
          node.receiveShadow = node.visible && lit;
        });
        group!.add(set);
        set.updateWorldMatrix(true, true);
        const orb = set.getObjectByName("set_orb_pedestal")?.children.find(
          (node) => node.userData.source_object === "Cobalt optical glass",
        );
        if (!(orb instanceof Mesh)) throw new Error("Studio optical orb missing");
        // The fixed set permits one precise world box for camera and shadow culling.
        const orbWorldBounds = new Box3().setFromObject(orb, true).expandByScalar(1e-7);
        orb.intersectsFrustum = (frustum) => frustum.intersectsBox(orbWorldBounds);
        window.__QUACKLES_SET_AUDIT__ = () => ({
          sceneId: set.uuid,
          viewport: { left: gl.domElement.getBoundingClientRect().left, top: gl.domElement.getBoundingClientRect().top, width: gl.domElement.clientWidth, height: gl.domElement.clientHeight },
          camera: { position: camera.position.toArray(), worldMatrix: camera.matrixWorld.toArray() },
          theme: getThemeSnapshot(),
          groups: SET_GROUPS.map((name) => {
            const node = set.getObjectByName(name);
            if (!node) throw new Error(`Studio group missing: ${name}`);
            node.updateWorldMatrix(true, true);
            const materialOpacities: { name: string; opacity: number; transparent: boolean; }[] = [];
            node.traverse((child) => {
              if (child instanceof Mesh)
                for (const material of Array.isArray(child.material) ? child.material : [child.material])
                  materialOpacities.push({ name: material.name, opacity: material.opacity, transparent: material.transparent });
            });
            const shadowMeshes: { name: string; castShadow: boolean; receiveShadow: boolean; visible: boolean }[] = [];
            node.traverse((child) => {
              if (child instanceof Mesh) shadowMeshes.push({ name: child.name, castShadow: child.castShadow, receiveShadow: child.receiveShadow, visible: child.visible });
            });
            return { shadowCastingMeshCount: shadowMeshes.filter((mesh) => mesh.castShadow).length, shadowReceivingMeshCount: shadowMeshes.filter((mesh) => mesh.receiveShadow).length, shadowMeshes, name, id: node.uuid, visible: node.visible, worldMatrix: node.matrixWorld.toArray(), ...auditBounds(node, camera), materialOpacities };
          }),
        });
        unsubscribe = subscribeTheme(() => {
          themedMaterials?.update();
          invalidate();
        });
        await gl.compileAsync(scene, camera);
        if (cancelled) return;
        const q = ensureProbe();
        if (q) q.setReady = true;
        setSetReady(true);
        invalidate();
      } catch (error) {
        if (!cancelled) {
          console.error("Microduck studio load failed", error);
          setWebgl(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
      unsubscribe?.();
      themedMaterials?.dispose();
      delete window.__QUACKLES_SET_AUDIT__;
      if (activeSet) {
        group.remove(activeSet);
        disposeSet(activeSet);
      }
    };
  }, [camera, gl, invalidate, scene, setSetReady, setWebgl]);
  return <group ref={host} />;
}
