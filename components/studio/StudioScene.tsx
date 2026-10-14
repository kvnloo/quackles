'use client';
/* Three.js owns mutable renderer/material instances; these are cloned, not React state. */
/* eslint-disable react-hooks/immutability */

import {Canvas, useLoader, useThree} from '@react-three/fiber';
import {Component, Suspense, useEffect, useMemo} from 'react';
import type {ReactNode} from 'react';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/examples/jsm/loaders/DRACOLoader.js';
import {Mesh, MeshStandardMaterial, SRGBColorSpace, TextureLoader, Vector2} from 'three';
import type {Texture} from 'three';
import type {Slot, StudioTheme} from '@/lib/studio/theme';
import sceneInfo from '@/public/studio/scene.json';
import {makeHeroCamera} from '@/lib/studio/camera';
const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
export type Capture = () => Promise<Blob>;
type Props = {theme: StudioTheme; onCapture: (fn: Capture) => void; onReady: (ready: boolean) => void; onError: (message: string) => void};
class SceneBoundary extends Component<{children:ReactNode}, {error:string}> {
  state = {error:''};
  static getDerivedStateFromError(error: Error) {return {error:error.message};}
  render() {return this.state.error ? <p role="alert">3D preview unavailable: {this.state.error}. Check WebGL support and reload.</p> : this.props.children;}
}
function Set({theme,onCapture,onReady,onError}: Props) {
  const gltf = useLoader(GLTFLoader,`${base}/studio/day-set.glb`,loader => {
    const draco = new DRACOLoader(); draco.setDecoderPath(`${base}/studio/draco/`); loader.setDRACOLoader(draco);
  });
  const {gl,scene,camera,invalidate} = useThree();
  const owned = useMemo(() => {
    const object = gltf.scene.clone(true);
    const materials: MeshStandardMaterial[] = [];
    object.traverse(node => {
      if (!(node instanceof Mesh)) return;
      const clone = (material: MeshStandardMaterial) => {
        const result = material.clone();
        result.userData.originalMap = result.map;
        result.userData.originalColor = result.color.clone();
        materials.push(result);
        return result;
      };
      node.material = Array.isArray(node.material) ? node.material.map(clone) : clone(node.material);
    });
    return {object,materials};
  },[gltf]);
  useEffect(() => {
    let alive = true;
    const textures: Texture[] = [];
    onReady(false);
    const loader = new TextureLoader();
    (async () => {
      const loaded: Partial<Record<Slot,Texture>> = {};
      for (const [key,url] of Object.entries(theme.textures)) {
        const texture = await loader.loadAsync(url);
        texture.colorSpace = SRGBColorSpace; texture.flipY = false;
        textures.push(texture); loaded[key as Slot] = texture;
      }
      if (!alive) {textures.forEach(t=>t.dispose()); return;}
      for (const material of owned.materials) {
        const slot = (sceneInfo.materials as Record<string, Slot>)[material.name];
        if (!slot) continue;
        const replacement = loaded[slot]?.clone();
        if (replacement) {
          replacement.channel = material.userData.originalMap?.channel ?? 0;
          replacement.needsUpdate = true;
          textures.push(replacement);
        }
        material.map = replacement ?? material.userData.originalMap;
        // Uploaded textures retain their own colors; color controls tint original materials.
        material.color.set(loaded[slot] ? '#ffffff' : theme.colors[slot]);
        material.needsUpdate = true;
      }
      gl.toneMappingExposure = theme.lighting.exposure;
      invalidate();
      gl.render(scene,camera);
      onReady(true);
    })().catch(e => {textures.forEach(t=>t.dispose()); if (alive) onError(`Texture could not be loaded: ${String(e)}`);});
    return () => {alive = false; textures.forEach(t=>t.dispose());};
  },[theme,owned,gl,scene,camera,invalidate,onReady,onError]);
  useEffect(() => {
    onCapture(async () => {
      const size = gl.getSize(new Vector2()); const ratio = gl.getPixelRatio();
      try {
        gl.setPixelRatio(1); gl.setSize(1024,1536,false); gl.render(scene,camera);
        return await new Promise<Blob>((resolve,reject)=>gl.domElement.toBlob(blob=>blob ? resolve(blob) : reject(new Error('PNG export failed.')),'image/png'));
      } finally {gl.setPixelRatio(ratio); gl.setSize(size.x,size.y,false); invalidate();}
    });
  },[onCapture,gl,scene,camera,invalidate]);
  useEffect(()=>()=>owned.materials.forEach(m=>m.dispose()),[owned]);
  return <primitive object={owned.object} />;
}
export default function StudioScene(props: Props) {
  const camera = useMemo(()=>makeHeroCamera(sceneInfo.camera),[]);
  return <SceneBoundary><Canvas frameloop="demand" dpr={[1,1.5]} gl={{preserveDrawingBuffer:true,antialias:true,alpha:false}}
    camera={camera}
    fallback={<p role="alert">WebGL is unavailable. Enable hardware acceleration or use another browser.</p>}>
    <color attach="background" args={[props.theme.colors.background]} />
    <ambientLight intensity={1.1} />
    <hemisphereLight args={['#ecf0ff','#88745a',1.5]} />
    <directionalLight position={[-1,2,3]} intensity={props.theme.lighting.intensity} color={props.theme.lighting.warmth} />
    <directionalLight position={[1,0.8,-1]} intensity={1.1} color="#c6d8ff" />
    <Suspense fallback={null}><Set {...props} /></Suspense>
  </Canvas></SceneBoundary>;
}
