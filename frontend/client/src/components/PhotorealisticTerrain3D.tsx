/**
 * PhotorealisticTerrain3D — Real animated 3D test field for AeroMind.
 *
 * Renders a true 3D scene with React Three Fiber (Three.js). Each of the 8
 * environments (forest, urban, flatland, mountain, scrubland, snow, hot, sea)
 * has its own procedural terrain mesh, lighting, fog, and animated 3D objects
 * (swaying trees, flickering windows, falling snow, waving water, drifting
 * camera). Replaces the static SVG scenes in AeroTestFieldStation.
 */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Instances, Instance } from "@react-three/drei";
import { useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";

export type Environment3D =
  | "forest" | "urban" | "flatland" | "mountain"
  | "scrubland" | "snow" | "hot" | "sea";

type Props = {
  environment: Environment3D;
  dronePosition?: { x: number; y: number; z: number; yaw: number };
  isPlaying?: boolean;
  className?: string;
};

type EnvConfig = {
  skyColor: string;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  ambient: number;
  sunPos: [number, number, number];
  sunIntensity: number;
  sunColor: string;
  terrainColor: string;
  terrainAmplitude: number;
  terrainFreq: number;
  terrainRoughness: number;
};

const ENV_CONFIG: Record<Environment3D, EnvConfig> = {
  forest:    { skyColor: "#3a5e44", fogColor: "#1a2e22", fogNear: 30, fogFar: 180, ambient: 0.45, sunPos: [40, 35, 20], sunIntensity: 1.1, sunColor: "#ffe8c8", terrainColor: "#2a4a2a", terrainAmplitude: 3.5,  terrainFreq: 0.18, terrainRoughness: 0.85 },
  urban:     { skyColor: "#2c3a52", fogColor: "#0a121e", fogNear: 40, fogFar: 200, ambient: 0.5,  sunPos: [50, 45, 15], sunIntensity: 1.2, sunColor: "#ffd0a0", terrainColor: "#2a2a2e", terrainAmplitude: 0.2,  terrainFreq: 0.05, terrainRoughness: 0.95 },
  flatland:  { skyColor: "#9ec0d4", fogColor: "#d8b878", fogNear: 50, fogFar: 220, ambient: 0.6,  sunPos: [30, 50, 25], sunIntensity: 1.4, sunColor: "#fff4d0", terrainColor: "#8a7a3a", terrainAmplitude: 0.6,  terrainFreq: 0.12, terrainRoughness: 0.9 },
  mountain:  { skyColor: "#6a8aaa", fogColor: "#c8d4e4", fogNear: 35, fogFar: 190, ambient: 0.4,  sunPos: [60, 40, 30], sunIntensity: 1.3, sunColor: "#fff0d8", terrainColor: "#4a5a6a", terrainAmplitude: 16,   terrainFreq: 0.22, terrainRoughness: 0.92 },
  scrubland: { skyColor: "#d4a878", fogColor: "#8a6038", fogNear: 40, fogFar: 200, ambient: 0.55, sunPos: [45, 50, 20], sunIntensity: 1.5, sunColor: "#ffe4a8", terrainColor: "#7a5a3a", terrainAmplitude: 1.2,  terrainFreq: 0.14, terrainRoughness: 0.9 },
  snow:      { skyColor: "#b8c8d8", fogColor: "#e8eef4", fogNear: 30, fogFar: 180, ambient: 0.7,  sunPos: [35, 30, 40], sunIntensity: 1.0, sunColor: "#e8f0ff", terrainColor: "#e8eef4", terrainAmplitude: 4.5,  terrainFreq: 0.16, terrainRoughness: 0.7 },
  hot:       { skyColor: "#e8642a", fogColor: "#c87830", fogNear: 35, fogFar: 190, ambient: 0.65, sunPos: [70, 60, 10], sunIntensity: 1.8, sunColor: "#fff8d0", terrainColor: "#c8a050", terrainAmplitude: 5,    terrainFreq: 0.1,  terrainRoughness: 0.95 },
  sea:       { skyColor: "#4a7a9a", fogColor: "#2a4a6a", fogNear: 40, fogFar: 210, ambient: 0.5,  sunPos: [50, 8, 60],  sunIntensity: 1.2, sunColor: "#ffd890", terrainColor: "#1a3a5a", terrainAmplitude: 0.8,  terrainFreq: 0.3,  terrainRoughness: 0.3 },
};

/* ── Procedural heightmap (simple sine-based pseudo-noise) ── */
function terrainHeight(x: number, z: number, env: EnvConfig): number {
  const f = env.terrainFreq;
  const a = env.terrainAmplitude;
  if (env.terrainRoughness < 0.4) {
    // Sea: smooth waves
    return Math.sin(x * f * 2) * a * 0.4 + Math.sin(z * f * 1.7) * a * 0.3;
  }
  // Multi-octave sine noise
  const h1 = Math.sin(x * f) * Math.cos(z * f * 1.3) * a;
  const h2 = Math.sin(x * f * 2.3 + 1.5) * Math.cos(z * f * 1.9) * a * 0.4;
  const h3 = Math.sin(x * f * 4.1) * Math.cos(z * f * 3.7) * a * 0.15;
  return h1 + h2 + h3;
}

/* ── Terrain mesh (animated for sea) ── */
function TerrainMesh({ env, environment }: { env: EnvConfig; environment: Environment3D }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(140, 140, 80, 80);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, terrainHeight(x, z, env));
    }
    geo.computeVertexNormals();
    return geo;
  }, [env]);

  useFrame((state) => {
    if (environment === "sea" && meshRef.current) {
      // Animate sea surface waves
      const geo = meshRef.current.geometry as THREE.PlaneGeometry;
      const pos = geo.attributes.position as THREE.BufferAttribute;
      const t = state.clock.elapsedTime;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        pos.setY(i, Math.sin(x * 0.3 + t) * 0.4 + Math.sin(z * 0.4 + t * 0.8) * 0.3);
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
    } else if (environment === "hot" && meshRef.current) {
      // Subtle heat shimmer on sand
      const geo = meshRef.current.geometry as THREE.PlaneGeometry;
      const pos = geo.attributes.position as THREE.BufferAttribute;
      const t = state.clock.elapsedTime;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        pos.setY(i, terrainHeight(x, z, env) + Math.sin(x * 0.5 + t * 2) * 0.1);
      }
      pos.needsUpdate = true;
    }
  });

  return (
    <mesh ref={meshRef} geometry={geometry} receiveShadow>
      <meshStandardMaterial
        color={env.terrainColor}
        roughness={env.terrainRoughness}
        metalness={environment === "sea" ? 0.3 : 0.05}
        flatShading={environment === "mountain"}
      />
    </mesh>
  );
}

/* ── Forest: instanced pine trees with sway ── */
function ForestTrees() {
  const groupRef = useRef<THREE.Group>(null);
  const positions = useMemo(() => {
    const arr: [number, number, number][] = [];
    for (let i = 0; i < 35; i++) {
      const x = (Math.random() - 0.5) * 110;
      const z = (Math.random() - 0.5) * 110;
      if (Math.abs(x) < 8 && Math.abs(z) < 8) continue;
      arr.push([x, 0, z]);
    }
    return arr;
  }, []);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    groupRef.current.children.forEach((child, i) => {
      child.rotation.z = Math.sin(t * 0.8 + i * 0.5) * 0.04;
    });
  });

  return (
    <group ref={groupRef}>
      {positions.map(([x, y, z], i) => (
        <group key={i} position={[x, y, z]}>
          <mesh castShadow position={[0, 1.5, 0]}>
            <cylinderGeometry args={[0.25, 0.35, 3, 6]} />
            <meshStandardMaterial color="#3a2a1a" roughness={0.9} />
          </mesh>
          <mesh castShadow position={[0, 4, 0]}>
            <coneGeometry args={[2.2, 4, 8]} />
            <meshStandardMaterial color="#1e3a1e" roughness={0.85} />
          </mesh>
          <mesh castShadow position={[0, 6, 0]}>
            <coneGeometry args={[1.7, 3.2, 8]} />
            <meshStandardMaterial color="#245218" roughness={0.85} />
          </mesh>
          <mesh castShadow position={[0, 8, 0]}>
            <coneGeometry args={[1.2, 2.5, 8]} />
            <meshStandardMaterial color="#2a5e22" roughness={0.85} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ── Urban: buildings with flickering windows ── */
function UrbanBuildings() {
  const buildings = useMemo(() => {
    const arr: { x: number; z: number; h: number; w: number; d: number; lit: boolean[] }[] = [];
    const spots: [number, number][] = [
      [-20,-15],[-15,-25],[-5,-20],[5,-30],[15,-22],[25,-18],
      [-25,10],[-18,18],[-10,25],[0,15],[10,22],[20,12],[28,5],
      [-22,-5],[-12,8],[-8,-12],[2,-8],[12,-15],[22,-10],
    ];
    spots.forEach(([x, z]) => {
      if (Math.abs(x) < 8 && Math.abs(z) < 8) return;
      const h = 5 + Math.random() * 20;
      const w = 3 + Math.random() * 3;
      const d = 3 + Math.random() * 3;
      const lit = Array.from({ length: Math.floor(h / 3) * 2 }, () => Math.random() > 0.6);
      arr.push({ x, z, h, w, d, lit });
    });
    return arr;
  }, []);

  const windowRefs = useRef<THREE.MeshStandardMaterial[]>([]);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    windowRefs.current.forEach((mat, i) => {
      if (!mat) return;
      if (Math.sin(t * 0.5 + i * 1.7) > 0.95) {
        mat.emissiveIntensity = 0.2 + Math.random() * 0.8;
      }
    });
  });

  let wIdx = 0;
  return (
    <group>
      {buildings.map((b, i) => (
        <group key={i} position={[b.x, b.h / 2, b.z]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[b.w, b.h, b.d]} />
            <meshStandardMaterial color="#2a3040" roughness={0.7} metalness={0.2} />
          </mesh>
          {/* Window grid */}
          {Array.from({ length: Math.floor(b.h / 3) }).map((_, r) =>
            Array.from({ length: 2 }).map((_, c) => {
              const lit = b.lit[r * 2 + c] ?? false;
              const idx = wIdx++;
              return (
                <mesh key={`${r}-${c}`} position={[(c - 0.5) * b.w * 0.5, r * 3 - b.h / 2 + 2, b.d / 2 + 0.01]}>
                  <planeGeometry args={[0.6, 1]} />
                  <meshStandardMaterial
                    ref={(m) => { if (m) windowRefs.current[idx] = m; }}
                    color={lit ? "#ffd096" : "#1a2030"}
                    emissive={lit ? "#ffaa44" : "#000000"}
                    emissiveIntensity={lit ? 0.6 : 0}
                  />
                </mesh>
              );
            })
          )}
        </group>
      ))}
    </group>
  );
}

/* ── Flatland: wheat stalks ── */
function FlatlandWheat() {
  const groupRef = useRef<THREE.Group>(null);
  const positions = useMemo(() => {
    const arr: [number, number][] = [];
    for (let i = 0; i < 60; i++) {
      arr.push([(Math.random() - 0.5) * 120, (Math.random() - 0.5) * 120]);
    }
    return arr;
  }, []);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    groupRef.current.children.forEach((child, i) => {
      child.rotation.z = Math.sin(t * 1.5 + i * 0.3) * 0.15;
    });
  });

  return (
    <group ref={groupRef}>
      {positions.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 1, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 2, 4]} />
            <meshStandardMaterial color="#8a7a30" roughness={0.9} />
          </mesh>
          <mesh position={[0, 2.2, 0]}>
            <sphereGeometry args={[0.25, 6, 6]} />
            <meshStandardMaterial color="#d4a850" emissive="#aa8030" emissiveIntensity={0.2} roughness={0.8} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ── Mountain: large peaks with snow caps ── */
function MountainPeaks() {
  const peaks = useMemo(() => {
    return [
      { x: -30, z: -20, h: 22, r: 12 },
      { x: 5, z: -35, h: 30, r: 16 },
      { x: 35, z: -10, h: 18, r: 10 },
      { x: -15, z: 30, h: 16, r: 9 },
    ];
  }, []);
  return (
    <group>
      {peaks.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]}>
          <mesh castShadow receiveShadow position={[0, p.h / 2, 0]}>
            <coneGeometry args={[p.r, p.h, 6]} />
            <meshStandardMaterial color="#4a4a5a" roughness={0.9} flatShading />
          </mesh>
          <mesh castShadow position={[0, p.h - 1, 0]}>
            <coneGeometry args={[p.r * 0.35, p.h * 0.25, 6]} />
            <meshStandardMaterial color="#f0f4fa" roughness={0.5} flatShading />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ── Scrubland: bush clusters ── */
function ScrublandBushes() {
  const groupRef = useRef<THREE.Group>(null);
  const positions = useMemo(() => {
    const arr: [number, number][] = [];
    for (let i = 0; i < 28; i++) {
      arr.push([(Math.random() - 0.5) * 110, (Math.random() - 0.5) * 110]);
    }
    return arr;
  }, []);
  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    groupRef.current.children.forEach((child, i) => {
      child.rotation.z = Math.sin(t * 1.2 + i * 0.4) * 0.05;
    });
  });
  return (
    <group ref={groupRef}>
      {positions.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh castShadow position={[-0.8, 0.8, 0]}>
            <sphereGeometry args={[1.1, 8, 6]} />
            <meshStandardMaterial color="#5a6e2a" roughness={0.95} flatShading />
          </mesh>
          <mesh castShadow position={[0.8, 0.8, 0]}>
            <sphereGeometry args={[1.1, 8, 6]} />
            <meshStandardMaterial color="#6a7e34" roughness={0.95} flatShading />
          </mesh>
          <mesh castShadow position={[0, 1.5, 0]}>
            <sphereGeometry args={[1.3, 8, 6]} />
            <meshStandardMaterial color="#7a8e3e" roughness={0.95} flatShading />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ── Snow: falling flakes + snowy pines ── */
function SnowScene() {
  const flakesRef = useRef<THREE.Group>(null);
  const flakes = useMemo(() => {
    return Array.from({ length: 80 }, () => ({
      x: (Math.random() - 0.5) * 120,
      y: Math.random() * 40 + 10,
      z: (Math.random() - 0.5) * 120,
      speed: 0.5 + Math.random() * 1.5,
      size: 0.1 + Math.random() * 0.2,
    }));
  }, []);
  useFrame((_, delta) => {
    if (!flakesRef.current) return;
    flakesRef.current.children.forEach((child, i) => {
      child.position.y -= flakes[i].speed * delta * 5;
      if (child.position.y < 0) child.position.y = 40;
    });
  });
  return (
    <group>
      {/* Snowy pines */}
      {Array.from({ length: 8 }).map((_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        const r = 35;
        return (
          <group key={i} position={[Math.cos(angle) * r, 0, Math.sin(angle) * r]}>
            <mesh castShadow position={[0, 1.5, 0]}>
              <cylinderGeometry args={[0.25, 0.35, 3, 6]} />
              <meshStandardMaterial color="#3a2a1a" roughness={0.9} />
            </mesh>
            <mesh castShadow position={[0, 4, 0]}>
              <coneGeometry args={[2.2, 4, 8]} />
              <meshStandardMaterial color="#1a2e22" roughness={0.85} />
            </mesh>
            <mesh castShadow position={[0, 5, 0]}>
              <coneGeometry args={[1.5, 1.5, 8]} />
              <meshStandardMaterial color="#ffffff" roughness={0.5} />
            </mesh>
          </group>
        );
      })}
      {/* Falling snowflakes */}
      <group ref={flakesRef}>
        {flakes.map((f, i) => (
          <mesh key={i} position={[f.x, f.y, f.z]}>
            <sphereGeometry args={[f.size, 4, 4]} />
            <meshStandardMaterial color="#ffffff" emissive="#e0e8f0" emissiveIntensity={0.3} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/* ── Hot: sun + heat shimmer ── */
function HotScene() {
  const sunRef = useRef<THREE.Mesh>(null);
  const shimmerRef = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (sunRef.current) sunRef.current.rotation.y = t * 0.1;
    if (shimmerRef.current) {
      const geo = shimmerRef.current.geometry as THREE.PlaneGeometry;
      const pos = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        pos.setZ(i, Math.sin(pos.getX(i) * 0.5 + t * 3) * 0.5);
      }
      pos.needsUpdate = true;
    }
  });
  return (
    <group>
      <mesh ref={sunRef} position={[50, 45, -40]}>
        <sphereGeometry args={[6, 32, 32]} />
        <meshStandardMaterial color="#fff8d0" emissive="#ffd060" emissiveIntensity={1.5} />
      </mesh>
      <mesh ref={shimmerRef} position={[0, 8, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[120, 120, 40, 40]} />
        <meshStandardMaterial color="#ffd0a0" transparent opacity={0.15} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/* ── Sea: sun at horizon + (waves handled by TerrainMesh) ── */
function SeaSun() {
  return (
    <mesh position={[0, 6, -55]}>
      <sphereGeometry args={[5, 32, 32]} />
      <meshStandardMaterial color="#fff0c0" emissive="#ffb060" emissiveIntensity={2} />
    </mesh>
  );
}

/* ── Drone overlay (quadcopter silhouette) ── */
function DroneOverlay({ position }: { position: { x: number; y: number; z: number; yaw: number } }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!ref.current) return;
    ref.current.position.set(position.x - 50, position.z * 0.2 + 12, position.y - 50);
    ref.current.rotation.y = (position.yaw * Math.PI) / 180;
  });
  return (
    <group ref={ref}>
      {/* Central body */}
      <mesh castShadow>
        <boxGeometry args={[1.5, 0.4, 1.5]} />
        <meshStandardMaterial color="#1a1a1a" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* 4 rotors */}
      {[[1.2, 1.2], [-1.2, 1.2], [1.2, -1.2], [-1.2, -1.2]].map(([rx, rz], i) => (
        <mesh key={i} position={[rx, 0.1, rz]} rotation={[0, (i * Math.PI) / 4, 0]}>
          <cylinderGeometry args={[0.8, 0.8, 0.05, 16]} />
          <meshStandardMaterial color="#2a2a2a" transparent opacity={0.3} />
        </mesh>
      ))}
      {/* LED indicator */}
      <mesh position={[0, 0.3, 0]}>
        <sphereGeometry args={[0.15, 8, 8]} />
        <meshStandardMaterial color="#25d0d9" emissive="#25d0d9" emissiveIntensity={2} />
      </mesh>
    </group>
  );
}

/* ── Scene composition ── */
function Scene({ environment, dronePosition }: { environment: Environment3D; dronePosition?: Props["dronePosition"] }) {
  const env = ENV_CONFIG[environment];
  const { scene } = useThree();
  scene.background = useMemo(() => new THREE.Color(env.skyColor), [env.skyColor]);
  scene.fog = useMemo(() => new THREE.Fog(env.fogColor, env.fogNear, env.fogFar), [env.fogColor, env.fogNear, env.fogFar]);

  let decor: ReactNode = null;
  if (environment === "forest") decor = <ForestTrees />;
  else if (environment === "urban") decor = <UrbanBuildings />;
  else if (environment === "flatland") decor = <FlatlandWheat />;
  else if (environment === "mountain") decor = <MountainPeaks />;
  else if (environment === "scrubland") decor = <ScrublandBushes />;
  else if (environment === "snow") decor = <SnowScene />;
  else if (environment === "hot") decor = <HotScene />;
  else if (environment === "sea") decor = <SeaSun />;

  return (
    <>
      <ambientLight intensity={env.ambient} />
      <directionalLight
        position={env.sunPos}
        intensity={env.sunIntensity}
        color={env.sunColor}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-80}
        shadow-camera-right={80}
        shadow-camera-top={80}
        shadow-camera-bottom={-80}
        shadow-camera-near={0.1}
        shadow-camera-far={300}
      />
      <TerrainMesh env={env} environment={environment} />
      {decor}
      {dronePosition && <DroneOverlay position={dronePosition} />}
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        autoRotate
        autoRotateSpeed={0.3}
        minPolarAngle={Math.PI / 4}
        maxPolarAngle={Math.PI / 2.2}
        target={[0, 5, 0]}
      />
    </>
  );
}

export function PhotorealisticTerrain3D({ environment, dronePosition, className }: Props) {
  return (
    <div className={className} style={{ width: "100%", height: "100%", minHeight: "400px", background: "#000" }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [50, 40, 80], fov: 45, near: 0.1, far: 1000 }}
        gl={{ antialias: true, alpha: false }}
        style={{ width: "100%", height: "100%", display: "block" }}
      >
        <Scene environment={environment} dronePosition={dronePosition} />
      </Canvas>
    </div>
  );
}

export default PhotorealisticTerrain3D;
