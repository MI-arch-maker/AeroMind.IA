import { Component, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { DroneCatalogDesign } from "../lib/droneCatalog";
import type { InstalledMaterial } from "../lib/aeroEngine";
import { resolveDroneModelArchitecture, resolveDroneMotorCount } from "../lib/droneModelProfile";

type FlightState = { pitchDeg?: number; rollDeg?: number; yawDeg?: number; throttlePct?: number };
type PhysicalDroneModelProps = {
  design?: DroneCatalogDesign;
  status?: "idle" | "flying" | "paused" | "landing";
  compact?: boolean;
  construction?: { parts: number; massKg: number };
  parts?: InstalledMaterial[];
  flightState?: FlightState;
  interactive?: boolean;
  showGrid?: boolean;
  cameraZoom?: number;
  exploded?: boolean;
  autoMotion?: boolean;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const MAX_ACTIVE_WEBGL_CANVASES = 4;
let activeWebGLCanvases = 0;
let webGLWaitQueue: Array<() => void> = [];
let webGL2Support: boolean | null = null;

/**
 * Probe WebGL 2 once, then explicitly release the temporary context.
 * Three.js r163+ removed its WebGL 1 renderer, so unsupported WebGL 2 must use
 * the DOM/CSS fallback below rather than attempting an ineffective WebGL 1 retry.
 */
export function canCreateWebGL2Context(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined" || !window.WebGL2RenderingContext) return false;
  if (webGL2Support !== null) return webGL2Support;
  let context: WebGL2RenderingContext | null = null;
  try {
    const canvas = document.createElement("canvas");
    context = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      powerPreference: "low-power",
      failIfMajorPerformanceCaveat: false,
    });
    webGL2Support = context !== null;
  } catch {
    webGL2Support = false;
  } finally {
    context?.getExtension("WEBGL_lose_context")?.loseContext();
  }
  return webGL2Support;
}

export type SlotRelease = () => void;
/** Browsers commonly cap simultaneous WebGL contexts; queue offscreen library cards. */
export function reserveWebGLCanvas(onGranted: (release: SlotRelease) => void): () => void {
  let cancelled = false;
  let release: SlotRelease | null = null;
  const grant = () => {
    if (cancelled) return;
    activeWebGLCanvases += 1;
    let released = false;
    release = () => {
      if (released) return;
      released = true;
      activeWebGLCanvases = Math.max(0, activeWebGLCanvases - 1);
      while (activeWebGLCanvases < MAX_ACTIVE_WEBGL_CANVASES && webGLWaitQueue.length) {
        const next = webGLWaitQueue.shift();
        next?.();
      }
    };
    onGranted(release);
  };
  if (activeWebGLCanvases < MAX_ACTIVE_WEBGL_CANVASES) grant();
  else webGLWaitQueue.push(grant);
  return () => {
    cancelled = true;
    if (release) release();
    else webGLWaitQueue = webGLWaitQueue.filter(waiter => waiter !== grant);
  };
}

function useNearViewport(ref: React.RefObject<HTMLElement | null>) {
  const [nearViewport, setNearViewport] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setNearViewport(entry.isIntersecting), { rootMargin: "160px", threshold: 0.01 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return nearViewport;
}

function useCanvasSlot(enabled: boolean) {
  const [hasSlot, setHasSlot] = useState(false);
  const slotReleaseRef = useRef<SlotRelease | null>(null);
  useEffect(() => {
    setHasSlot(false);
    if (!enabled) return;
    const cancel = reserveWebGLCanvas(release => {
      slotReleaseRef.current = release;
      setHasSlot(true);
    });
    return () => {
      cancel();
      slotReleaseRef.current = null;
      setHasSlot(false);
    };
  }, [enabled]);
  const releaseSlot = () => {
    slotReleaseRef.current?.();
    slotReleaseRef.current = null;
    setHasSlot(false);
  };
  return { hasSlot, releaseSlot };
}

function useCarbonTexture() {
  return useMemo(() => {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#171d23";
    ctx.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 8) {
      for (let x = 0; x < 128; x += 8) {
        const light = ((x / 8 + y / 8) % 2) === 0;
        ctx.fillStyle = light ? "#333c45" : "#202830";
        ctx.fillRect(x, y, 4, 4);
        ctx.fillStyle = light ? "#202830" : "#333c45";
        ctx.fillRect(x + 4, y + 4, 4, 4);
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 2);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 2;
    return texture;
  }, []);
}

function Rotor({ position, spinning, speed = 1 }: { position: [number, number, number]; spinning: boolean; speed?: number }) {
  const blade = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (blade.current && spinning) blade.current.rotation.y += delta * speed * 18;
  });
  return <group position={position}>
    <mesh castShadow><cylinderGeometry args={[0.12, 0.16, 0.13, 16]} /><meshStandardMaterial color="#a9b7c2" metalness={0.84} roughness={0.25} /></mesh>
    <group ref={blade} position={[0, 0.09, 0]}>
      <mesh><boxGeometry args={[1.12, 0.018, 0.075]} /><meshStandardMaterial color="#26323b" metalness={0.28} roughness={0.3} transparent opacity={spinning ? 0.68 : 1} /></mesh>
    </group>
  </group>;
}

function ExtendedAeroMesh({ material, exploded }: { material: THREE.Material; exploded: boolean }) {
  const gap = exploded ? 0.3 : 0;
  return <group rotation={[0, 0, Math.PI / 2]}>
    <mesh castShadow material={material}><cylinderGeometry args={[0.12, 0.19, 2.15, 20]} /></mesh>
    <mesh position={[0, 0.96, gap]} rotation={[0, 0, Math.PI / 2]} castShadow material={material}><coneGeometry args={[0.23, 0.34, 24]} /></mesh>
    <mesh position={[0, -0.63, 0]} rotation={[0, 0, Math.PI / 2]} castShadow material={material}><boxGeometry args={[0.08, 1.42, 0.05]} /></mesh>
    <mesh position={[0, -0.78, 0.18 + gap * 0.55]} rotation={[0.3, 0, 0]} castShadow material={material}><boxGeometry args={[0.06, 0.52, 0.055]} /></mesh>
    <mesh position={[0, -0.78, -0.18 - gap * 0.55]} rotation={[-0.3, 0, 0]} castShadow material={material}><boxGeometry args={[0.06, 0.52, 0.055]} /></mesh>
    <mesh position={[0, -0.18, gap]} rotation={[0, 0, Math.PI / 2]} castShadow material={material}><boxGeometry args={[0.055, 2.4, 0.035]} /></mesh>
  </group>;
}
function ProfiledAeroMesh({ material, exploded }: { material: THREE.Material; exploded: boolean }) {
  const gap = exploded ? 0.3 : 0;
  return <group rotation={[0, 0, Math.PI / 2]}>
    <mesh castShadow material={material}><capsuleGeometry args={[0.18, 1.45, 10, 24]} /></mesh>
    <mesh position={[0, 0.85, gap]} castShadow material={material}><sphereGeometry args={[0.28, 24, 16]} /></mesh>
    <mesh position={[0, -0.1, gap]} rotation={[0, 0, Math.PI / 2]} castShadow material={material}><boxGeometry args={[0.08, 1.85, 0.045]} /></mesh>
    <mesh position={[0, -0.75, 0.16 + gap * 0.55]} rotation={[0.34, 0, 0]} castShadow material={material}><boxGeometry args={[0.055, 0.42, 0.045]} /></mesh>
    <mesh position={[0, -0.75, -0.16 - gap * 0.55]} rotation={[-0.34, 0, 0]} castShadow material={material}><boxGeometry args={[0.055, 0.42, 0.045]} /></mesh>
  </group>;
}
function StealthWingMesh({ material, exploded }: { material: THREE.Material; exploded: boolean }) {
  const shape = useMemo(() => { const sh = new THREE.Shape(); sh.moveTo(-1.55, 0); sh.lineTo(0.95, 0.55); sh.lineTo(1.35, 0); sh.lineTo(0.95, -0.55); sh.closePath(); return sh; }, []);
  return <group rotation={[0, 0, Math.PI / 2]}>
    <mesh castShadow material={material}><extrudeGeometry args={[shape, { depth: 0.11, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.025, bevelThickness: 0.025 }]} /></mesh>
    <mesh position={[0.15, 0, 0.11 + (exploded ? 0.46 : 0)]} castShadow><boxGeometry args={[0.42, 0.12, 0.12]} /><meshStandardMaterial color="#101c24" metalness={0.7} roughness={0.26} /></mesh>
  </group>;
}

function BlendedPusherMesh({ material, spinning, exploded }: { material: THREE.Material; spinning: boolean; exploded: boolean }) {
  const gap = exploded ? 0.32 : 0;
  return <group rotation={[0, Math.PI / 2, 0]}>
    <mesh castShadow material={material} scale={[1, 0.7, 0.55]}><capsuleGeometry args={[0.24, 1.8, 10, 24]} /></mesh>
    <mesh position={[0, 0.02, gap]} rotation={[0, 0, Math.PI / 2]} castShadow material={material}><boxGeometry args={[0.09, 3.1, 0.055]} /></mesh>
    <mesh position={[0, 0.38, gap * 0.65]} castShadow material={material}><boxGeometry args={[0.06, 0.72, 0.42]} /></mesh>
    <mesh position={[0, -0.72, 0.34 + gap * 0.55]} rotation={[0.38, 0, 0]} castShadow material={material}><boxGeometry args={[0.06, 0.62, 0.08]} /></mesh>
    <mesh position={[0, -0.72, -0.34 - gap * 0.55]} rotation={[-0.38, 0, 0]} castShadow material={material}><boxGeometry args={[0.06, 0.62, 0.08]} /></mesh>
    <Rotor position={[0, 1.03, gap]} spinning={spinning} speed={-1} />
  </group>;
}

function DroneMesh({ design, status, flightState, parts = [], exploded = false, autoMotion = true }: Pick<PhysicalDroneModelProps, "design" | "status" | "flightState" | "parts" | "exploded" | "autoMotion">) {
  const root = useRef<THREE.Group>(null);
  const carbonMap = useCarbonTexture();
  const config = design?.configuration ?? {};
  const modelType = design?.modelType ?? (Number(config.motorCount) > 4 ? "hexacoptère" : "quadcopter");
  const architecture = resolveDroneModelArchitecture(design);
  const vtol = architecture === "vtol";
  const fixedWing = architecture === "fixed-wing";
  const count = resolveDroneMotorCount(design);
  const span = clamp(config.wingspan ?? 2.4, 0.8, 6);
  const fuselageLength = clamp(config.fuselageLength ?? span * (fixedWing ? 0.52 : 0.42), 0.45, 4.5);
  const fuselageRadius = clamp(span * (fixedWing ? 0.055 : 0.095), 0.06, 0.19);
  const fuselageBodyLength = Math.max(0.2, fuselageLength - fuselageRadius * 2);
  const tailZ = -fuselageLength * 0.38;
  const noseZ = fuselageLength * 0.43;
  const flying = status === "flying";
  const frameMaterial = useMemo(() => new THREE.MeshStandardMaterial({ map: carbonMap, color: "#d1dce3", metalness: 0.22, roughness: 0.34 }), [carbonMap]);
  const alloy = <meshStandardMaterial color="#9aa8b3" metalness={0.86} roughness={0.24} />;
  const polymer = <meshStandardMaterial color="#dbe5eb" metalness={0.04} roughness={0.47} />;

  useFrame(({ clock }, delta) => {
    if (!root.current) return;
    const t = clock.elapsedTime;
    const targetPitch = THREE.MathUtils.degToRad(flightState?.pitchDeg ?? 0);
    const targetRoll = THREE.MathUtils.degToRad(flightState?.rollDeg ?? 0);
    const targetYaw = THREE.MathUtils.degToRad(flightState?.yawDeg ?? 0);
    root.current.rotation.x = THREE.MathUtils.damp(root.current.rotation.x, targetPitch + (flying ? Math.sin(t * 0.6) * 0.025 : 0), 4, delta);
    root.current.rotation.z = THREE.MathUtils.damp(root.current.rotation.z, -targetRoll, 4, delta);
    root.current.rotation.y = THREE.MathUtils.damp(root.current.rotation.y, targetYaw + (autoMotion ? Math.sin(t * 0.18) * 0.06 : 0), 2, delta);
    root.current.position.y = THREE.MathUtils.damp(root.current.position.y, (flying ? 0.11 : status === "landing" ? -0.08 : 0) + (status === "paused" || !autoMotion ? 0 : Math.sin(t * (flying ? 3.1 : 1.2)) * (flying ? 0.055 : 0.025)), 3, delta);
  });

  const rotorPositions: [number, number, number][] = vtol
    ? Array.from({ length: Math.max(4, count) }, (_, i) => {
      const perSide = Math.ceil(Math.max(4, count) / 2);
      const side = i % 2 === 0 ? -1 : 1;
      const station = Math.floor(i / 2);
      return [side * span * 0.31, 0.06, (station - (perSide - 1) / 2) * 0.4];
    })
    : Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + Math.PI / 4;
    const radius = fixedWing ? 0.7 : 0.72;
    return [Math.cos(angle) * radius, 0.06, Math.sin(angle) * radius];
  });
  const extraPart = (part: InstalledMaterial, index: number) => {
    const category = part.category;
    const color = category === "propulsion" ? "#8999a5" : category === "payload" ? "#141b22" : category === "energy" ? "#374754" : "#ccd6dd";
    const scale = clamp(part.scale ?? 1, 0.5, 2);
    const vertical = exploded ? (category === "payload" ? -0.42 : 0.28 + (index % 3) * 0.12) : 0.12 + (index % 2) * 0.025;
    const position: [number, number, number] = [clamp((part.offsetX ?? (index % 3 - 1) * 12) / 60, -0.55, 0.55), vertical, clamp((part.offsetY ?? 0) / 60, -0.45, 0.45)];
    return <mesh key={part.id} position={position} scale={scale} castShadow>
      <boxGeometry args={[category === "payload" ? 0.28 : 0.2, 0.14, 0.2]} />
      <meshStandardMaterial color={color} metalness={category === "propulsion" ? 0.78 : 0.32} roughness={category === "payload" ? 0.26 : 0.42} />
    </mesh>;
  };

  const specialized = modelType === "hale-voilure" || modelType === "male-voilure" || modelType === "stealth-wing" || modelType === "blended-pusher";
  return <group ref={root}>
    {specialized ? (modelType === "blended-pusher" ? <BlendedPusherMesh material={frameMaterial} spinning={flying} exploded={exploded} /> : modelType === "stealth-wing" ? <StealthWingMesh material={frameMaterial} exploded={exploded} /> : modelType === "hale-voilure" ? <ExtendedAeroMesh material={frameMaterial} exploded={exploded} /> : <ProfiledAeroMesh material={frameMaterial} exploded={exploded} />) : <>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow material={frameMaterial} scale={[0.86, 1, 0.82]}><capsuleGeometry args={[fuselageRadius, fuselageBodyLength, 8, 20]} /></mesh>
    {fixedWing ? <>
      <mesh position={[0, exploded ? 0.36 : 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow><boxGeometry args={[0.13, span * 0.72, 0.09]} /><meshStandardMaterial color="#c5d0d7" metalness={0.28} roughness={0.38} /></mesh>
      <mesh position={[0, exploded ? 0.2 : 0, tailZ]} rotation={[0, 0, Math.PI / 2]} castShadow><boxGeometry args={[0.07, span * 0.2, 0.055]} />{polymer}</mesh>
      <mesh position={[0, 0.16 + (exploded ? 0.32 : 0), tailZ]} castShadow><boxGeometry args={[0.06, 0.36, 0.36]} />{polymer}</mesh>
      {vtol ? rotorPositions.map((position, index) => <Rotor key={`vtol-${index}`} position={[position[0], position[1] + (exploded ? 0.52 : 0), position[2]]} spinning={flying} speed={index % 2 ? -1 : 1} />) : <Rotor position={[0, 0.02 + (exploded ? 0.5 : 0), noseZ]} spinning={flying} />}
    </> : <>
      {rotorPositions.map((p, i) => <mesh key={`arm-${i}`} position={[p[0] * 0.52, exploded ? 0.19 : 0, p[2] * 0.52]} rotation={[0, -Math.atan2(p[2], p[0]), Math.PI / 2]} castShadow><cylinderGeometry args={[0.045, 0.055, 0.92, 10]} />{alloy}</mesh>)}
      {rotorPositions.map((p, i) => <Rotor key={`rotor-${i}`} position={[p[0], p[1] + (exploded ? 0.5 : 0), p[2]]} spinning={flying} speed={i % 2 ? -1 : 1} />)}
      <mesh position={[0, -0.13 - (exploded ? 0.33 : 0), 0]} castShadow><boxGeometry args={[0.16, 0.15, 0.2]} /><meshStandardMaterial color="#101820" metalness={0.24} roughness={0.28} /></mesh>
    </>}
    </>}
    {parts.slice(0, 24).map(extraPart)}
  </group>;
}

function Scene({ design, status, flightState, parts, interactive, showGrid, cameraZoom = 1, exploded = false, autoMotion = true }: PhysicalDroneModelProps & { interactive: boolean }) {
  const cameraScale = clamp(cameraZoom, 0.7, 2);
  return <Canvas
    camera={{ position: [3.8 / cameraScale, 2.8 / cameraScale, 5.2 / cameraScale], fov: 38 }}
    dpr={[1, 1.5]}
    gl={{ antialias: true, alpha: true, powerPreference: "high-performance", failIfMajorPerformanceCaveat: false }}
    onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.08; gl.shadowMap.type = THREE.PCFSoftShadowMap; }}
    shadows="soft"
  >
    {showGrid && <gridHelper args={[8, 32, "#00e5ff", "#123a43"]} position={[0, -0.72, 0]} />}
    {showGrid && <axesHelper args={[2.8]} position={[0, -0.70, 0]} />}
    <ambientLight intensity={0.52} />
    <hemisphereLight args={["#eff7ff", "#18212b", 1.25]} />
    <directionalLight position={[4, 6, 3]} intensity={3.8} color="#fff4e3" castShadow shadow-mapSize={[1024, 1024]} />
    <directionalLight position={[-4, 2, -3]} intensity={1.65} color="#78c8ed" />
    <pointLight position={[0, 2.5, 2.8]} intensity={1.1} distance={7} color="#4d9fff" />
    <Suspense fallback={null}>
      <DroneMesh design={design} status={status} flightState={flightState} parts={parts} exploded={exploded} autoMotion={autoMotion} />
    </Suspense>
    <OrbitControls makeDefault target={[0, 0.16, 0]} enablePan={false} enableZoom={interactive} minDistance={2.7 / cameraScale} maxDistance={8 / cameraScale} minPolarAngle={0.45} maxPolarAngle={Math.PI / 2.05} autoRotate={!interactive && status !== "flying"} autoRotateSpeed={0.38} />
  </Canvas>;
}

class RendererErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode; onError: () => void }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error) {
    console.warn("AeroMind 3D indisponible, affichage de secours activé.", error.message);
    this.props.onError();
  }
  render() { return this.state.hasError ? this.props.fallback : this.props.children; }
}

function StaticDroneFallback({ design, parts = [], exploded = false }: { design?: DroneCatalogDesign; parts?: InstalledMaterial[]; exploded?: boolean }) {
  const architecture = resolveDroneModelArchitecture(design);
  const vtol = architecture === "vtol";
  const fixedWing = architecture === "fixed-wing";
  const count = resolveDroneMotorCount(design);
  return <div className="drone-webgl-fallback drone-compatibility-3d" role="img" aria-label={`${design?.label ?? "Drone"}, maquette volumétrique de compatibilité`}>
    <div className={`drone-compatibility-model ${fixedWing ? "is-fixed-wing" : ""} ${exploded ? "is-exploded" : ""}`} aria-hidden="true">
      <span className="compatibility-body" /><span className="compatibility-nose" /><span className="compatibility-wing compatibility-wing-left" /><span className="compatibility-wing compatibility-wing-right" />
      {Array.from({ length: fixedWing && !vtol ? 1 : count }, (_, index) => <span className="compatibility-motor" key={index} style={{ "--motor-angle": `${(index / count) * 360 + 45}deg` } as CSSProperties}><i /><b /></span>)}
      {parts.slice(0, 8).map((part, index) => <span className="compatibility-payload" key={part.id} style={{ "--payload-index": index } as CSSProperties} />)}
    </div>
    <span className="drone-fallback-title">{design?.label ?? "Aperçu du drone"} · mode compatibilité 3D</span>
    <small>Rendu volumétrique local actif · WebGL indisponible, aucune géométrie 2D plate.</small>
  </div>;
}

export function PhysicalDroneModel({ design, status = "idle", compact = false, construction, parts = [], flightState, interactive = true, showGrid = false, cameraZoom = 1, exploded = false, autoMotion = true }: PhysicalDroneModelProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const nearViewport = useNearViewport(stageRef);
  const webGLAvailable = canCreateWebGL2Context();
  const { hasSlot: hasCanvasSlot, releaseSlot } = useCanvasSlot(nearViewport && webGLAvailable);
  const [rendererFailed, setRendererFailed] = useState(false);
  const configuration = design?.configuration ?? {};
  const architecture = resolveDroneModelArchitecture(design);
  const motorCount = resolveDroneMotorCount(design);
  const propulsionLabel = architecture === "fixed-wing" ? `${motorCount} MOTEUR${motorCount > 1 ? "S" : ""}` : `${motorCount} ROTOR${motorCount > 1 ? "S" : ""}`;
  const wingspan = clamp(configuration.wingspan ?? 2.4, 0.8, 6);
  // Le rendu borne l'envergure pour rester dans le cadre, mais la légende doit
  // afficher la valeur déclarée : une cellule HALE de 13 m ne peut pas être
  // annoncée comme 6 m.
  const declaredWingspan =
    configuration.wingspan && configuration.wingspan > 0
      ? configuration.wingspan
      : wingspan;
  const fallbackMessage = !webGLAvailable
    ? "WebGL 2 n’est pas disponible dans ce navigateur ; aperçu 2D utilisé."
    : rendererFailed
      ? "Le contexte graphique n’a pas pu être créé ; aperçu 2D utilisé."
      : !nearViewport
        ? "L’aperçu 3D sera chargé à l’approche de la zone visible."
        : "Limite de contextes graphiques atteinte ; aperçu 2D temporaire.";
  if (!design) {
    return <div ref={stageRef} className={`physical-drone-stage physical-drone-stage-3d is-unselected ${compact ? "is-compact" : ""}`} data-model="none" role="status" aria-label="Aucun drone sélectionné"><div className="drone-selection-required"><span>NO ACTIVE AIRFRAME</span><b>Sélection humaine requise</b><small>Aucune maquette n’est rendue avant le choix explicite d’un utilisateur.</small></div></div>;
  }
  return <div ref={stageRef} className={`physical-drone-stage physical-drone-stage-3d ${compact ? "is-compact" : ""} status-${status}`} data-model={design?.modelType ?? "multirotor"} data-presentation={exploded ? "exploded" : "horizon"}>
    <div className="physical-drone-canvas" aria-label={`${design?.label ?? "Drone AeroMind"}, aperçu tridimensionnel paramétrique, ${motorCount} ${architecture === "fixed-wing" ? "moteur(s)" : "rotor(s)"}`}>
      {webGLAvailable && hasCanvasSlot && !rendererFailed
        ? <RendererErrorBoundary key={`${design?.id ?? design?.key ?? "default-drone"}-${exploded ? "exploded" : "horizon"}`} onError={() => { releaseSlot(); setRendererFailed(true); }} fallback={<StaticDroneFallback design={design} parts={parts} exploded={exploded} />}>
            <Scene design={design} status={status} parts={parts} flightState={flightState} interactive={interactive} showGrid={showGrid} cameraZoom={cameraZoom} exploded={exploded} autoMotion={autoMotion} />
          </RendererErrorBoundary>
        : <StaticDroneFallback design={design} parts={parts} exploded={exploded} />}
    </div>
    <div className="physical-drone-caption"><span>{design?.label ?? "AEROMIND · MODÈLE 3D PARAMÉTRIQUE"}</span><small>{propulsionLabel} · {declaredWingspan.toFixed(2)} M ENVERGURE{construction ? ` · ${construction.parts} PIÈCES · ${construction.massKg.toFixed(2)} KG` : ""}{declaredWingspan > wingspan ? " · ÉCHELLE DE PRÉVISUALISATION RÉDUITE" : ""}</small></div>
  </div>;
}
