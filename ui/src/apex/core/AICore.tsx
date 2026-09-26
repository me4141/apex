import React, { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Sparkles } from "@react-three/drei";
import { Bloom, ChromaticAberration, EffectComposer, Vignette } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import * as THREE from "three";
import type { ApexCoreState } from "../types";

const STATE = {
  idle: { color: "#8b5cf6", speed: 0.34, amplitude: 0.09, bloom: 0.82 },
  listening: { color: "#22d3ee", speed: 0.76, amplitude: 0.2, bloom: 1.2 },
  thinking: { color: "#e879f9", speed: 1.12, amplitude: 0.31, bloom: 1.42 },
  speaking: { color: "#a78bfa", speed: 0.88, amplitude: 0.24, bloom: 1.25 },
} satisfies Record<ApexCoreState, { color: string; speed: number; amplitude: number; bloom: number }>;

const vertexShader = `
  uniform float uTime;
  uniform float uAmplitude;
  varying float vPulse;
  void main() {
    vec3 p = position;
    float wave = sin(p.x * 5.0 + uTime * 1.7)
      * cos(p.y * 4.2 - uTime * 1.25)
      * sin(p.z * 4.8 + uTime * 0.9);
    float pulse = sin(uTime * 1.1 + length(p) * 2.0) * 0.5 + 0.5;
    p += normal * (wave * uAmplitude + pulse * uAmplitude * 0.22);
    vPulse = pulse + wave * 0.35;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const fragmentShader = `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vPulse;
  void main() {
    float glow = 0.68 + vPulse * 0.34;
    gl_FragColor = vec4(uColor * glow, uOpacity);
  }
`;

function ReactiveOrb({ state, level }: { state: ApexCoreState; level: number }) {
  const group = useRef<THREE.Group>(null);
  const shader = useRef<THREE.ShaderMaterial>(null);
  const inner = useRef<THREE.Mesh>(null);
  const config = STATE[state];
  const targetColor = useMemo(() => new THREE.Color(config.color), [config.color]);

  useFrame(({ clock }, delta) => {
    if (group.current) {
      group.current.rotation.y += delta * config.speed * 0.22;
      group.current.rotation.x = Math.sin(clock.elapsedTime * config.speed * 0.22) * 0.11;
      const responseScale = 1 + Math.min(0.18, level * 0.15);
      group.current.scale.lerp(new THREE.Vector3(responseScale, responseScale, responseScale), 0.08);
    }
    if (shader.current) {
      shader.current.uniforms.uTime!.value = clock.elapsedTime * config.speed;
      shader.current.uniforms.uAmplitude!.value = config.amplitude + level * 0.12;
      (shader.current.uniforms.uColor!.value as THREE.Color).lerp(targetColor, 0.055);
    }
    if (inner.current) inner.current.rotation.z -= delta * config.speed * 0.11;
  });

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uAmplitude: { value: config.amplitude },
    uColor: { value: new THREE.Color(config.color) },
    uOpacity: { value: 0.9 },
  }), []);

  return (
    <Float speed={1.15} rotationIntensity={0.16} floatIntensity={0.28}>
      <group ref={group}>
        <mesh>
          <icosahedronGeometry args={[1.62, 20]} />
          <shaderMaterial
            ref={shader}
            uniforms={uniforms}
            vertexShader={vertexShader}
            fragmentShader={fragmentShader}
            transparent
            wireframe
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
        <mesh ref={inner} scale={0.72}>
          <icosahedronGeometry args={[1.5, 5]} />
          <meshBasicMaterial color={config.color} transparent opacity={0.055} wireframe />
        </mesh>
        <points scale={1.04}>
          <icosahedronGeometry args={[1.65, 9]} />
          <pointsMaterial color={config.color} size={0.018} transparent opacity={0.74} sizeAttenuation />
        </points>
        <pointLight color={config.color} intensity={8 + level * 12} distance={7} />
      </group>
    </Float>
  );
}

function Scene({ state, level, cinematic }: { state: ApexCoreState; level: number; cinematic: boolean }) {
  const config = STATE[state];
  return (
    <>
      <ambientLight intensity={0.2} />
      <ReactiveOrb state={state} level={level} />
      <Sparkles count={cinematic ? 130 : 55} scale={[7, 4.5, 4]} size={1.4} speed={0.18} opacity={0.48} color={config.color} />
      {cinematic && (
        <EffectComposer multisampling={0}>
          <Bloom luminanceThreshold={0.08} luminanceSmoothing={0.42} intensity={config.bloom} mipmapBlur />
          <ChromaticAberration blendFunction={BlendFunction.NORMAL} offset={new THREE.Vector2(0.00065, 0.00035)} radialModulation modulationOffset={0.32} />
          <Vignette eskil={false} offset={0.25} darkness={0.72} />
        </EffectComposer>
      )}
    </>
  );
}

function canUseWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export function AICore({ state, level, cinematic }: { state: ApexCoreState; level: number; cinematic: boolean }) {
  if (!canUseWebGL()) return <div className={`apex-core-fallback is-${state}`} aria-label={`APEX ${state}`} />;
  return (
    <Canvas
      className="apex-core-canvas"
      camera={{ position: [0, 0, 5.6], fov: 42 }}
      dpr={[1, cinematic ? 1.7 : 1.2]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
    >
      <Scene state={state} level={level} cinematic={cinematic} />
    </Canvas>
  );
}
