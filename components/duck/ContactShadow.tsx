"use client";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Mesh, ShaderMaterial } from "three";
import type { Pose } from "@/lib/pose";
import { getThemeSnapshot } from "@/lib/theme";
export function ContactShadow({ poseRef }: { poseRef: { current: Pose } }) {
  const mesh = useRef<Mesh>(null);
  const uniforms = useMemo(() => ({ opacity: { value: 0.1 } }), []);
  useFrame(() => {
    const node = mesh.current;
    if (!node) return;
    const p = poseRef.current;
    node.position.set(p.duckPosition[0], 0.0001, p.duckPosition[2]);
    node.scale.setScalar(1 + p.explode * 0.8 + p.jump * 0.7);
    if (node.material instanceof ShaderMaterial)
      node.material.uniforms.opacity.value =
        (0.1 + getThemeSnapshot() * 0.06) * (1 - p.jump * 0.78);
  });
  return (
    <mesh
      ref={mesh}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.0001, 0]}
      renderOrder={-1}
    >
      <planeGeometry args={[0.23, 0.15]} />
      <shaderMaterial
        transparent
        depthWrite={false}
        uniforms={uniforms}
        vertexShader="varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}"
        fragmentShader="uniform float opacity;varying vec2 vUv;void main(){vec2 p=(vUv-.5)*2.;float a=exp(-dot(p,p)*5.)*smoothstep(1.,.55,length(p));gl_FragColor=vec4(.025,.027,.035,a*opacity);}"
      />
    </mesh>
  );
}
