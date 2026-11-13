import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, TransformControls } from "@react-three/drei";
import * as THREE from "three";
import "./mechanical-render-presets.css";
import {
  canCreateWebGL2Context,
  reserveWebGLCanvas,
} from "./PhysicalDroneModel";
import {
  transformedPartVertices,
  type MechanicalModel,
  type MechanicalPart,
  type Vec3,
} from "../lib/mechanicalTwinGeometry";
import { fieldColors, getRenderEngine, resolveRenderPlan } from "../lib/renderEngines";
import { runEngineeringSolver, type SolverResult, type TechnicalRenderMode } from "../lib/engineeringSolvers";
import { createArchvizMaterial, createCarbonMaterial, createCrystalMaterial } from "../lib/engineeringMaterials";
import { snapPartDelta, type SnapMode } from "../lib/mechanicalSnapping";
import {
  clipPolygonAtZ,
  createTechnicalRenderContext,
  emitTechnicalRenderAudit,
  technicalRenderPresetOptions,
  xrayCutPosition,
  type TechnicalRenderContextOverrides,
} from "../lib/technicalRenderingPipeline";

export type MechanicalView = "iso" | "top" | "front" | "side";
export type MechanicalRender = "solid" | "wireframe" | "xray";
export type XrayLayerState = Record<string, number>;
/**
 * Convertit un déplacement écran (X droite, Y bas) en déplacement monde.
 * La base caméra est construite explicitement pour éviter que l'inversion
 * d'une matrice lookAt ne retourne l'axe horizontal selon la vue.
 */
export function screenDeltaToWorld(view: MechanicalView, orbit: [number, number], dx: number, dy: number): Vec3 {
  const direction = directions[view];
  const eye = new THREE.Vector3(...direction).applyAxisAngle(new THREE.Vector3(0, 1, 0), orbit[0]);
  if (view === "iso") eye.y += orbit[1];
  const forward = new THREE.Vector3().subVectors(new THREE.Vector3(), eye).normalize();
  const referenceUp = Math.abs(forward.dot(new THREE.Vector3(0, 1, 0))) > 0.98
    ? new THREE.Vector3(0, 0, -1)
    : new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(forward, referenceUp).normalize();
  const screenUp = new THREE.Vector3().crossVectors(right, forward).normalize();
  const result = right.multiplyScalar(dx).add(screenUp.multiplyScalar(-dy));
  return [result.x, result.y, result.z];
}
type Props = {
  model: MechanicalModel;
  selected: string;
  onSelect: (id: string) => void;
  view: MechanicalView;
  mode: MechanicalRender;
  explosion: number;
  resetKey: number;
  forceVector?: boolean;
  xrayCut: number;
  xrayOpacity: XrayLayerState;
  xrayIsolatedLayer?: string;
  kinematicsPlaying?: boolean;
  autoRotate?: boolean;
  previewPartId?: string;
  previewEnabled?: boolean;
  readOnly?: boolean;
  renderPreset?: string;
  onRenderPresetChange?: (preset: string) => void;
  /** Identité et provenance résolues par le centre qui fournit le modèle. */
  technicalContext?: TechnicalRenderContextOverrides;
  /** Enables a mouse-drag translation gizmo for the selected part. */
  transformEnabled?: boolean;
  /** Receives a world-space delta to persist on the selected part edit. */
  onPartTransform?: (id: string, delta: Vec3) => void;
  onTransformDragging?: (dragging: boolean) => void;
  snapEnabled?: boolean;
  snapMode?: SnapMode;
  snapIncrement?: number;
};
const directions: Record<MechanicalView, [number, number, number]> = {
  iso: [1.2, 0.85, 1.45],
  top: [0, 2, 0.001],
  front: [0, 0.001, 2],
  side: [2, 0.001, 0],
};

function CameraRig({
  model,
  view,
  resetKey,
}: Pick<Props, "model" | "view" | "resetKey">) {
  const { camera, invalidate, controls, size } = useThree();
  const orthoState = useRef<{ camera: THREE.OrthographicCamera; size: number; extent: number; designId: string; resetKey: number } | null>(null);
  useEffect(() => {
    if (!(camera instanceof THREE.OrthographicCamera)) return;
    const extent = Math.max(0.5, model.extent);
    const minSize = Math.max(1, Math.min(size.width, size.height));
    const previous = orthoState.current;
    camera.left = -size.width / 2;
    camera.right = size.width / 2;
    camera.top = size.height / 2;
    camera.bottom = -size.height / 2;
    camera.zoom = previous && previous.camera === camera && previous.extent === extent && previous.designId === model.designId && previous.resetKey === resetKey
      ? camera.zoom * minSize / previous.size
      : minSize / (extent * 1.5);
    orthoState.current = { camera, size: minSize, extent, designId: model.designId, resetKey };
    camera.near = extent / 1000;
    camera.far = extent * 100;
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, size.width, size.height, model.designId, model.extent, resetKey, invalidate]);
  useEffect(() => {
    const d = directions[view];
    const extent = Math.max(0.5, model.extent);
    camera.position.set(d[0] * extent, d[1] * extent, d[2] * extent);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.near = extent / 1000;
      camera.far = extent * 100;
      camera.updateProjectionMatrix();
    }
    if (controls && "target" in controls) {
      (
        controls as unknown as { target: THREE.Vector3; update: () => void }
      ).target.set(0, 0, 0);
      (controls as unknown as { update: () => void }).update();
    }
    invalidate();
  }, [
    view,
    resetKey,
    model.designId,
    model.extent,
    camera,
    controls,
    invalidate,
  ]);
  return null;
}
function MechanicalMesh({
  part,
  selected,
  onSelect,
  mode,
  explosion,
  cutZ,
  xrayOpacity,
  xrayIsolatedLayer,
  kinematicsPlaying = false,
  previewPartId,
  previewEnabled = false,
  readOnly = false,
  renderPreset = "mechanical",
  airspeedMps = 20,
  transformEnabled = false,
  onPartTransform,
  onTransformDragging,
}: {
  part: MechanicalPart;
  selected: boolean;
  onSelect: (id: string) => void;
  mode: MechanicalRender;
  explosion: number;
  cutZ?: number;
  xrayOpacity: XrayLayerState;
  xrayIsolatedLayer?: string;
  kinematicsPlaying?: boolean;
  previewPartId?: string;
  previewEnabled?: boolean;
  readOnly?: boolean;
  renderPreset?: string;
  airspeedMps?: number;
  transformEnabled?: boolean;
  onPartTransform?: (id: string, delta: Vec3) => void;
  onTransformDragging?: (dragging: boolean) => void;
}) {
  const pivotRef = useRef<THREE.Group>(null);
  const dragStart = useRef<THREE.Vector3 | null>(null);
  const isPreview = previewEnabled && previewPartId === part.id;
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        transformedPartVertices(part, explosion),
        3,
      ),
    );
    g.setIndex(part.indices);
    const technicalModes = new Set<TechnicalRenderMode>(["cfd", "fea", "energyflow", "bionic"]);
    if (technicalModes.has(renderPreset as TechnicalRenderMode)) {
      const solver = runEngineeringSolver(renderPreset as TechnicalRenderMode, g.getAttribute("position").array as Float32Array, part.indices, { airspeedMps });
      if (solver.values) {
        g.setAttribute("color", new THREE.BufferAttribute(fieldColors({ ...solver, values: solver.values, min: solver.min ?? 0, max: solver.max ?? 0, unit: solver.unit, method: solver.method, warning: solver.warnings.join(" "), solverId: solver.solverId }), 3));
      }
      g.userData.engineeringSolver = solver;
    }
    g.computeVertexNormals();
    g.computeBoundingBox();
    const center = g.boundingBox?.getCenter(new THREE.Vector3()) ?? new THREE.Vector3();
    g.translate(-center.x, -center.y, -center.z);
    g.userData.pivotCenter = center.toArray();
    return g;
  }, [part, explosion, renderPreset, airspeedMps]);
  const pivotCenter = geometry.userData.pivotCenter as [number, number, number] | undefined;
  const solver = geometry.userData.engineeringSolver as SolverResult | undefined;
  const engine = getRenderEngine(renderPreset);
  const presetMaterial: Record<string, { color?: string; metalness?: number; roughness?: number; opacity?: number; wireframe?: boolean; emissive?: string; emissiveIntensity?: number; vertexColors?: boolean }> = {
    clay: { color: "#c7c7c4", metalness: 0, roughness: 0.88 },
    npr: { metalness: 0, roughness: 0.9 },
    lowpoly: { metalness: 0.08, roughness: 0.8 },
    bionic: { color: "#93a9a4", metalness: 0.68, roughness: 0.34, wireframe: true, emissive: "#123b35", emissiveIntensity: 0.34 },
    carbon: { color: "#252d33", metalness: 0.52, roughness: 0.24, emissive: "#101b21", emissiveIntensity: 0.16 },
    cyberpunk: { color: "#303344", metalness: 0.76, roughness: 0.23, emissive: "#7418ab", emissiveIntensity: 0.9 },
    crystal: { color: "#9de9ed", metalness: 0.25, roughness: 0.08, opacity: 0.3 },
    exploded: { color: "#c1ccd0", metalness: 0.42, roughness: 0.42 },
    energyflow: { color: "#30d5c8", metalness: 0.28, roughness: 0.3, emissive: "#087a78", emissiveIntensity: 0.85, vertexColors: true },
    cfd: { color: "#ffffff", metalness: 0.05, roughness: 0.85, vertexColors: true },
    fea: { color: "#ffffff", metalness: 0.05, roughness: 0.85, vertexColors: true },
    "mesh-wire": { color: "#4bd6e5", metalness: 0.12, roughness: 0.75, wireframe: true, emissive: "#064d67", emissiveIntensity: 0.25 },
    blueprint: { color: "#c4f2ff", metalness: 0.05, roughness: 0.8, opacity: 0.42, wireframe: true, emissive: "#72d9ff", emissiveIntensity: 0.42 },
  };
  const style = presetMaterial[renderPreset];
  const clippingPlanes = useMemo(() => mode === "xray" && cutZ !== undefined
    ? [new THREE.Plane(new THREE.Vector3(0, 0, -1), cutZ)] : undefined, [mode, cutZ]);
  const specializedMaterial = useMemo(() => {
    if (renderPreset === "carbon") return createCarbonMaterial();
    if (renderPreset === "crystal") return createCrystalMaterial();
    if (renderPreset === "archviz") return createArchvizMaterial();
    return null;
  }, [renderPreset]);
  useEffect(() => () => { specializedMaterial?.dispose(); }, [specializedMaterial]);
  const isRotorBlade = /propeller-|cyclo-blade-|rotor-blade-/i.test(part.id);
  useFrame(({ clock }) => {
    if (!pivotRef.current) return;
    pivotRef.current.rotation.y = kinematicsPlaying && isRotorBlade ? clock.elapsedTime * 18 : 0;
  });
  const edges = useMemo(
    () => new THREE.EdgesGeometry(geometry, 28),
    [geometry],
  );
  useEffect(
    () => () => {
      geometry.dispose();
      edges.dispose();
    },
    [geometry, edges],
  );
  if (part.hidden) return null;
  const layerOpacity = Math.max(0, Math.min(1, (xrayOpacity[part.category] ?? 100) / 100));
  if (mode === "xray" && xrayIsolatedLayer && xrayIsolatedLayer !== part.category) return null;
  const opacity = isPreview ? 0.48 : (mode === "xray" ? 0.25 * layerOpacity : style?.opacity ?? 1) * (part.opacity ?? 1);
  const wireframe = mode === "wireframe" || engine.pipeline === "indexed-wireframe" || Boolean(style?.wireframe);
  const materialColor = isPreview ? "#ffcf70" : selected ? "#79eadb" : (style?.color ?? part.color);
  const materialEmissive = isPreview ? "#9a5a16" : selected ? "#145b59" : (style?.emissive ?? "#000000");
  const materialEmissiveIntensity = isPreview ? 0.55 : selected ? 0.2 : (style?.emissiveIntensity ?? 0);
  const meshContent = (
    <group ref={pivotRef} position={pivotCenter ?? [0, 0, 0]}>
      <mesh
        geometry={geometry}
        onPointerDown={(event) => {
          event.stopPropagation();
          if (!readOnly) onSelect(part.id);
        }}
        onClick={(event) => {
          event.stopPropagation();
          if (!readOnly) onSelect(part.id);
        }}
        onPointerOver={() => {
          document.body.style.cursor = readOnly ? "grab" : "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "";
        }}
      >
        {specializedMaterial && !selected && !isPreview && mode === "solid" && (part.opacity ?? 1) >= 1 ? <primitive object={specializedMaterial} attach="material" /> : renderPreset === "npr" ? <meshToonMaterial
          color={materialColor}
          emissive={materialEmissive}
          emissiveIntensity={materialEmissiveIntensity}
          wireframe={wireframe}
          transparent={opacity < 1}
          opacity={opacity}
          depthWrite={opacity >= 0.99}
          clippingPlanes={clippingPlanes}
          side={THREE.DoubleSide}
        /> : <meshStandardMaterial
          color={materialColor}
          vertexColors={Boolean(style?.vertexColors)}
          metalness={style?.metalness ?? part.metalness}
          roughness={style?.roughness ?? part.roughness}
          emissive={materialEmissive}
          emissiveIntensity={materialEmissiveIntensity}
          wireframe={wireframe}
          flatShading={renderPreset === "lowpoly"}
          transparent={opacity < 1}
          opacity={opacity}
          depthWrite={opacity >= 0.99}
          clippingPlanes={clippingPlanes}
          side={THREE.DoubleSide}
        />}
      </mesh>
      {!wireframe && (
        <lineSegments geometry={edges}>
          <lineBasicMaterial
            color={isPreview ? "#ffe6a8" : selected ? "#c8fff2" : "#647c88"}
            transparent
            opacity={(isPreview ? 1 : selected ? 0.8 : 0.22) * (mode === "xray" ? layerOpacity : 1) * (part.opacity ?? 1)}
            clippingPlanes={clippingPlanes}
          />
        </lineSegments>
      )}
      <EngineeringOverlay solver={solver} center={pivotCenter ?? [0, 0, 0]} />
    </group>
  );
  if (transformEnabled && selected && !readOnly && onPartTransform) {
    return (
      <TransformControls
        mode="translate"
        space="world"
        size={0.78}
        onMouseDown={() => {
          onTransformDragging?.(true);
          dragStart.current = pivotRef.current?.getWorldPosition(new THREE.Vector3()) ?? null;
        }}
        onMouseUp={() => {
          onTransformDragging?.(false);
          const start = dragStart.current;
          const group = pivotRef.current;
          dragStart.current = null;
          if (!start || !group) return;
          const end = group.getWorldPosition(new THREE.Vector3());
          const delta = end.sub(start);
          if (delta.lengthSq() > 1e-8) onPartTransform(part.id, [delta.x, delta.y, delta.z]);
        }}
      >
        {meshContent}
      </TransformControls>
    );
  }
  return meshContent;
}

function EngineeringOverlay({ solver, center }: { solver?: SolverResult; center: [number, number, number] }) {
  const overlays = useMemo(() => {
    if (!solver) return null;
    const shift = (x: number, y: number, z: number) => [x - center[0], y - center[1], z - center[2]];
    const streamlineVertices: number[] = [];
    if (solver.streamlines) {
      const lineCount = Math.floor(solver.streamlines.length / (18 * 3));
      for (let line = 0; line < lineCount; line += 1) for (let step = 0; step < 17; step += 1) {
        const a = (line * 18 + step) * 3, b = a + 3;
        streamlineVertices.push(...shift(solver.streamlines[a], solver.streamlines[a + 1], solver.streamlines[a + 2]), ...shift(solver.streamlines[b], solver.streamlines[b + 1], solver.streamlines[b + 2]));
      }
    }
    const streamlineGeometry = new THREE.BufferGeometry();
    if (streamlineVertices.length) streamlineGeometry.setAttribute("position", new THREE.Float32BufferAttribute(streamlineVertices, 3));
    const vectorGeometry = new THREE.BufferGeometry();
    if (solver.vectorSegments) {
      const points: number[] = [];
      for (let i = 0; i < solver.vectorSegments.length; i += 6) points.push(...shift(solver.vectorSegments[i], solver.vectorSegments[i + 1], solver.vectorSegments[i + 2]), ...shift(solver.vectorSegments[i + 3], solver.vectorSegments[i + 4], solver.vectorSegments[i + 5]));
      vectorGeometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    }
    const latticeGeometry = new THREE.BufferGeometry();
    if (solver.latticeNodes && solver.latticeEdges) {
      const points: number[] = [];
      for (let i = 0; i < solver.latticeEdges.length; i += 2) {
        const a = solver.latticeEdges[i] * 3, b = solver.latticeEdges[i + 1] * 3;
        points.push(...shift(solver.latticeNodes[a], solver.latticeNodes[a + 1], solver.latticeNodes[a + 2]), ...shift(solver.latticeNodes[b], solver.latticeNodes[b + 1], solver.latticeNodes[b + 2]));
      }
      latticeGeometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    }
    const particleGeometry = new THREE.BufferGeometry();
    if (solver.particles) {
      const points = new Float32Array(solver.particles.length);
      for (let i = 0; i < solver.particles.length; i += 3) { const p = shift(solver.particles[i], solver.particles[i + 1], solver.particles[i + 2]); points.set(p, i); }
      particleGeometry.setAttribute("position", new THREE.BufferAttribute(points, 3));
    }
    const loadZoneGeometry = new THREE.BufferGeometry();
    if (solver.loadZonePoints) {
      const points = new Float32Array(solver.loadZonePoints.length);
      for (let i = 0; i < solver.loadZonePoints.length; i += 3) points.set(shift(solver.loadZonePoints[i], solver.loadZonePoints[i + 1], solver.loadZonePoints[i + 2]), i);
      loadZoneGeometry.setAttribute("position", new THREE.BufferAttribute(points, 3));
    }
    return { streamlineGeometry, vectorGeometry, latticeGeometry, particleGeometry, loadZoneGeometry, hasStreamlines: streamlineVertices.length > 0, hasVectors: Boolean(solver.vectorSegments?.length), hasLattice: Boolean(solver.latticeNodes?.length), hasParticles: Boolean(solver.particles?.length), hasLoadZones: Boolean(solver.loadZonePoints?.length) };
  }, [solver, center]);
  useEffect(() => () => { overlays?.streamlineGeometry.dispose(); overlays?.vectorGeometry.dispose(); overlays?.latticeGeometry.dispose(); overlays?.particleGeometry.dispose(); overlays?.loadZoneGeometry.dispose(); }, [overlays]);
  if (!overlays) return null;
  return <>
    {overlays.hasStreamlines && <lineSegments geometry={overlays.streamlineGeometry}><lineBasicMaterial color="#71f6ff" transparent opacity={0.74} /></lineSegments>}
    {overlays.hasVectors && <lineSegments geometry={overlays.vectorGeometry}><lineBasicMaterial color="#f4fbff" transparent opacity={0.62} /></lineSegments>}
    {overlays.hasLattice && <lineSegments geometry={overlays.latticeGeometry}><lineBasicMaterial color="#ffcf70" transparent opacity={0.9} /></lineSegments>}
    {overlays.hasParticles && <points geometry={overlays.particleGeometry}><pointsMaterial color="#30d5c8" size={0.035} sizeAttenuation /></points>}
    {overlays.hasLoadZones && <points geometry={overlays.loadZoneGeometry}><pointsMaterial color="#ff5d6c" size={0.06} sizeAttenuation /></points>}
  </>;
}
class TwinRendererBoundary extends Component<
  { children: ReactNode; fallback: ReactNode; onFailure: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFailure();
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** The fallback projects the SAME editable mesh, not a CSS sphere or generic icon. */
export function MechanicalVectorView({
  model,
  selected,
  onSelect,
  view,
  mode,
  explosion,
  xrayCut,
  xrayOpacity,
  xrayIsolatedLayer,
  previewPartId,
  previewEnabled,
  renderPreset,
  readOnly = false,
  transformEnabled = false,
  onPartTransform,
}: Omit<Props, "resetKey">) {
  const plan = resolveRenderPlan(renderPreset, mode, explosion);
  const wireframe = plan.mode === "wireframe" || plan.engine.pipeline === "indexed-wireframe" || plan.engine.id === "blueprint";
  const [orbit, setOrbit] = useState<[number, number]>([0, 0]);
  const [zoom, setZoom] = useState(1);
  const drag = useRef<{
    x: number;
    y: number;
    startX: number;
    startY: number;
    moved: boolean;
    partId?: string;
  } | null>(null);
  const [partDrag, setPartDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  useEffect(() => {
    setOrbit([0, 0]);
    setZoom(1);
  }, [view, model.designId]);
  const faces = useMemo(() => {
    const d = directions[view];
    const eye = new THREE.Vector3(...d).applyAxisAngle(
      new THREE.Vector3(0, 1, 0),
      orbit[0],
    );
    if (view === "iso") eye.y += orbit[1];
    const camera = new THREE.Matrix4().lookAt(
      eye,
      new THREE.Vector3(),
      new THREE.Vector3(0, 1, 0),
    );
    const inverse = camera.invert();
    const cutoff = plan.mode === "xray" ? xrayCutPosition(model, plan.explosion, xrayCut) : undefined;
    const cameraDistance = Math.max(0.5, model.extent) * 3;
    const projected = model.parts
      .filter((p) => !p.hidden)
      .filter((p) => plan.mode !== "xray" || !xrayIsolatedLayer || xrayIsolatedLayer === p.category)
      .flatMap((part) => {
        const vertices = transformedPartVertices(part, plan.explosion);
        const isPreview = previewEnabled && part.id === previewPartId;
        const base = new THREE.Color(isPreview ? "#ffcf70" : part.id === selected ? "#79eadb" : plan.engine.id === "clay" ? "#c7c7c4" : plan.engine.id === "blueprint" ? "#c4f2ff" : part.color);
        const light = new THREE.Vector3(-0.3, 0.85, 0.5).normalize();
        const result: Array<{
          key: string;
          id: string;
          name: string;
          category: string;
          opacity: number;
          points: THREE.Vector3[];
          depth: number;
          color: string;
        }> = [];
        for (let i = 0; i + 2 < part.indices.length; i += 3) {
          const triangle = part.indices.slice(i, i + 3).map((index): Vec3 => [vertices[index * 3], vertices[index * 3 + 1], vertices[index * 3 + 2]]);
          if (triangle.some((point) => point.some((value) => !Number.isFinite(value)))) continue;
          const polygon = clipPolygonAtZ(triangle, cutoff).map((point) => new THREE.Vector3(...point).applyMatrix4(inverse));
          if (polygon.length < 3) continue;
          const [a, b, c] = polygon;
          const normal = new THREE.Vector3()
            .subVectors(b, a)
            .cross(new THREE.Vector3().subVectors(c, a))
            .normalize();
          if (normal.z < -0.001 && !wireframe && plan.mode !== "xray")
            continue;
          const lightAmount = Math.max(0, normal.dot(light));
          const shade = plan.engine.id === "npr" ? (lightAmount > 0.65 ? 1 : lightAmount > 0.25 ? 0.72 : 0.48) : 0.55 + 0.5 * lightAmount;
          const color = base.clone().multiplyScalar(shade).getStyle();
          const depth = polygon.reduce((sum, point) => sum + point.z, 0) / polygon.length;
          const displayPoints = polygon.map((point) => {
            if (plan.projection === "orthographic") return point;
            const scale = cameraDistance / Math.max(cameraDistance * 0.1, cameraDistance - point.z);
            return new THREE.Vector3(point.x * scale, point.y * scale, point.z);
          });
          result.push({
            key: `${part.id}-${i}`,
            id: part.id,
            name: part.name,
            category: part.category,
            opacity: part.opacity ?? 1,
            points: displayPoints,
            depth,
            color,
          });
        }
        return result;
      });
    projected.sort((a, b) => a.depth - b.depth);
    const max = projected.reduce(
      (n, f) =>
        Math.max(
          n,
          ...f.points.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y) * 1.7)),
        ),
      Math.max(model.span, model.length) * 0.5,
    );
    const factor = (300 / Math.max(0.25, max)) * zoom;
    return {
      factor,
      inverse,
      items: projected.map((f) => ({
        ...f,
        coords: f.points
          .map((p) => `${400 + p.x * factor},${230 - p.y * factor}`)
          .join(" "),
      })),
    };
  }, [model, selected, view, plan.mode, plan.engine.id, plan.projection, plan.explosion, wireframe, orbit, zoom, xrayCut, xrayIsolatedLayer, previewPartId, previewEnabled]);
  return (
    <svg
      className="mt-vector-view"
      viewBox="0 0 800 460"
      role="img"
      data-vector-projection={plan.projection}
      data-vector-engine={plan.engine.id}
      aria-label={`Assemblage mécanique ${model.name}, projection ${view}, ${model.parts.filter((p) => !p.hidden).length} pièces paramétriques`}
      onPointerDown={(e) => {
        const target = (e.target as Element).closest("polygon[data-part]");
        const partId = readOnly ? undefined : target?.getAttribute("data-part") ?? undefined;
        drag.current = {
          x: e.clientX,
          y: e.clientY,
          startX: e.clientX,
          startY: e.clientY,
          moved: false,
          partId,
        };
        if (transformEnabled && partId) onSelect(partId);
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const dx = e.clientX - drag.current.x,
          dy = e.clientY - drag.current.y;
        if (drag.current.partId && transformEnabled && !readOnly) {
          const totalX = e.clientX - drag.current.startX;
          const totalY = e.clientY - drag.current.startY;
          if (Math.abs(totalX) + Math.abs(totalY) > 2) {
            drag.current.moved = true;
            setPartDrag({ id: drag.current.partId, dx: totalX * 800 / e.currentTarget.getBoundingClientRect().width, dy: totalY * 460 / e.currentTarget.getBoundingClientRect().height });
          }
          return;
        }
        if (view !== "iso") return;
        if (Math.abs(dx) + Math.abs(dy) > 2) {
          drag.current.moved = true;
          setOrbit((o) => [
            o[0] + dx * 0.012,
            Math.max(-0.6, Math.min(1.8, o[1] + dy * 0.012)),
          ]);
          drag.current.x = e.clientX;
          drag.current.y = e.clientY;
        }
      }}
      onPointerUp={(e) => {
        const state = drag.current;
        if (!readOnly && state?.partId && transformEnabled && state.moved) {
          const rect = e.currentTarget.getBoundingClientRect();
          const dx = (e.clientX - state.startX) * 800 / rect.width;
          const dy = (e.clientY - state.startY) * 460 / rect.height;
          onPartTransform?.(state.partId, screenDeltaToWorld(view, orbit, dx / faces.factor, dy / faces.factor));
        } else if (!readOnly && state?.partId && !state.moved) {
          onSelect(state.partId);
        }
        setPartDrag(null);
        e.currentTarget.releasePointerCapture(e.pointerId);
        window.setTimeout(() => {
          drag.current = null;
        }, 0);
      }}
      onPointerCancel={(e) => {
        drag.current = null;
        setPartDrag(null);
        try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* pointer already released */ }
      }}
      onWheel={(e) =>
        setZoom((z) =>
          Math.max(0.4, Math.min(2.5, z * (e.deltaY > 0 ? 0.93 : 1.07))),
        )
      }
    >
      {faces.items.map((face) => (
        <polygon
          key={face.key}
          data-part={face.id}
          points={face.coords}
          transform={partDrag?.id === face.id ? `translate(${partDrag.dx} ${partDrag.dy})` : undefined}
          style={{ cursor: transformEnabled && !readOnly ? "grab" : undefined, pointerEvents: transformEnabled && !readOnly ? "all" : undefined }}
          fill={wireframe ? "none" : face.color}
          fillOpacity={previewEnabled && face.id === previewPartId ? 0.48 : (plan.mode === "xray" ? 0.25 * Math.max(0, Math.min(1, (xrayOpacity[face.category] ?? 100) / 100)) : 1) * face.opacity}
          stroke={
            face.id === selected
              ? "#cafff2"
              : previewEnabled && face.id === previewPartId
                ? "#ffe6a8"
                : wireframe
                ? plan.engine.id === "blueprint" ? "#c4f2ff" : "#78adba"
                : face.color
          }
          strokeOpacity={(plan.mode === "xray" ? Math.max(0, Math.min(1, (xrayOpacity[face.category] ?? 100) / 100)) : 1) * face.opacity}
          strokeWidth={wireframe ? 0.55 : 0.4}
        >
          <title>{readOnly ? face.name : `${face.name} · sélectionner pour modifier`}</title>
        </polygon>
      ))}
    </svg>
  );
}
export function MechanicalTwinViewport(props: Props) {
  const {
    model,
    selected,
    onSelect,
    view,
    mode,
    explosion,
    resetKey,
    forceVector,
    xrayCut,
    xrayOpacity,
    xrayIsolatedLayer,
    kinematicsPlaying = false,
    autoRotate = false,
    previewPartId,
    previewEnabled = false,
    readOnly = false,
  } = props;
  const root = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [slot, setSlot] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pointerActive, setPointerActive] = useState(false);
  const [rendererWebgl, setRendererWebgl] = useState(false);
  const [transformDragging, setTransformDragging] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(props.snapEnabled ?? true);
  const [snapMode, setSnapMode] = useState<SnapMode>(props.snapMode ?? "component");
  const [snapIncrement, setSnapIncrement] = useState(props.snapIncrement ?? 0.01);
  useEffect(() => { if (props.snapEnabled !== undefined) setSnapEnabled(props.snapEnabled); }, [props.snapEnabled]);
  useEffect(() => { if (props.snapMode) setSnapMode(props.snapMode); }, [props.snapMode]);
  useEffect(() => { if (props.snapIncrement) setSnapIncrement(props.snapIncrement); }, [props.snapIncrement]);
  const pointerReleaseTimer = useRef<number | null>(null);
  const [localRenderPreset, setRenderPreset] = useState("mechanical");
  const renderPreset = props.renderPreset ?? localRenderPreset;
  const previousRenderInputs = useRef({ mode, renderPreset });
  useEffect(() => {
    const previous = previousRenderInputs.current;
    previousRenderInputs.current = { mode, renderPreset };
    // Une commande de mode externe utilisée après un preset reprend la main.
    // Si le parent change mode et preset ensemble, son preset reste prioritaire.
    if (previous.mode !== mode && previous.renderPreset === renderPreset && renderPreset !== "mechanical") {
      if (props.renderPreset === undefined) setRenderPreset("mechanical");
      else props.onRenderPresetChange?.("mechanical");
    }
  }, [mode, renderPreset, props.renderPreset, props.onRenderPresetChange]);
  const [analysisAirspeed, setAnalysisAirspeed] = useState(20);
  const [immersive, setImmersive] = useState(false);
  const renderPlan = resolveRenderPlan(renderPreset, mode, explosion);
  const selectedEngine = renderPlan.engine;
  const cutZ = useMemo(() => renderPlan.mode === "xray"
    ? xrayCutPosition(model, renderPlan.explosion, xrayCut) : undefined,
  [model, renderPlan.mode, renderPlan.explosion, xrayCut]);
  const technicalContext = useMemo(
    () => createTechnicalRenderContext(model, props.technicalContext),
    [model, props.technicalContext],
  );
  const handleSelect = (id: string) => {
    emitTechnicalRenderAudit("component_selected", technicalContext, { componentId: id });
    onSelect(id);
  };
  const release = useRef<(() => void) | null>(null);
  const supported = !forceVector && canCreateWebGL2Context();
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(entry.isIntersecting),
    );
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!supported || !visible || failed) return;
    const cancel = reserveWebGLCanvas((free) => {
      release.current = free;
      setSlot(true);
    });
    return () => {
      cancel();
      release.current = null;
      setSlot(false);
    };
  }, [supported, visible, failed]);
  const requestedWebgl = supported && slot && !failed;
  useEffect(() => {
    if (!pointerActive) setRendererWebgl(requestedWebgl);
  }, [requestedWebgl, pointerActive]);
  const releasePointerLock = () => {
    if (pointerReleaseTimer.current !== null) window.clearTimeout(pointerReleaseTimer.current);
    pointerReleaseTimer.current = window.setTimeout(() => {
      pointerReleaseTimer.current = null;
      setPointerActive(false);
    }, 80);
  };
  const canTransform = Boolean(props.transformEnabled && renderPlan.explosion === 0);
  const applyPartTransform = (id: string, delta: Vec3) => {
    const part = model.parts.find(candidate => candidate.id === id);
    if (!part) return;
    props.onPartTransform?.(id, snapPartDelta(model, part, delta, { enabled: snapEnabled, mode: snapMode, increment: snapIncrement }));
  };
  const vector = (
    <MechanicalVectorView key={`${resetKey}-${view}`} {...props} renderPreset={renderPreset} onSelect={handleSelect} transformEnabled={canTransform} onPartTransform={applyPartTransform} snapEnabled={snapEnabled} snapMode={snapMode} snapIncrement={snapIncrement} />
  );
  const webgl = rendererWebgl;
  return (
    <div
      ref={root}
      className="mt-viewport"
      onPointerDownCapture={() => {
        if (pointerReleaseTimer.current !== null) window.clearTimeout(pointerReleaseTimer.current);
        pointerReleaseTimer.current = null;
        setPointerActive(true);
      }}
      onPointerUpCapture={releasePointerLock}
      onPointerCancelCapture={releasePointerLock}
      data-renderer={webgl ? "webgl" : "vector"}
      data-auto-motion={autoRotate ? "true" : "false"}
      data-render-preset={renderPreset}
      data-render-engine={selectedEngine.id}
      data-render-mode={renderPlan.mode}
      data-render-projection={renderPlan.projection}
      data-render-pipeline={selectedEngine.pipeline}
      data-render-solver={selectedEngine.solverId ?? "presentation"}
    >
      <div className="mt-viewport-grid" />
      {webgl ? (
        <TwinRendererBoundary
          fallback={vector}
          onFailure={() => {
            release.current?.();
            release.current = null;
            setFailed(true);
          }}
        >
          <Canvas
            key={renderPlan.projection}
            orthographic={renderPlan.projection === "orthographic"}
            frameloop={kinematicsPlaying || autoRotate ? "always" : "demand"}
            dpr={[1, 1.5]}
            camera={{
              position: [
                model.extent * 1.2,
                model.extent * 0.85,
                model.extent * 1.45,
              ],
              fov: 35,
            }}
            gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true, localClippingEnabled: true }}
            onCreated={({ gl }) => {
              gl.toneMapping = THREE.ACESFilmicToneMapping;
              gl.toneMappingExposure = 1.25;
            }}
          >
            <ambientLight intensity={1.1} />
            <hemisphereLight args={["#e8f6ff", "#111a22", 1.8]} />
            <directionalLight position={[5, 8, 5]} intensity={3.5} />
            <directionalLight
              position={[-5, 2, -4]}
              color="#93cbdc"
              intensity={2}
            />
            {model.parts.map((part) => (
              <MechanicalMesh
                key={`${part.id}-${selectedEngine.id}`}
                part={part}
                selected={selected === part.id}
                onSelect={handleSelect}
                mode={renderPlan.mode}
                explosion={renderPlan.explosion}
                cutZ={cutZ}
                xrayOpacity={xrayOpacity}
                xrayIsolatedLayer={xrayIsolatedLayer}
                kinematicsPlaying={kinematicsPlaying}
                previewPartId={previewPartId}
                previewEnabled={previewEnabled}
                readOnly={readOnly}
                renderPreset={selectedEngine.id}
                airspeedMps={analysisAirspeed}
                transformEnabled={canTransform}
                onPartTransform={applyPartTransform}
                onTransformDragging={setTransformDragging}
              />
            ))}
            <OrbitControls
              makeDefault
              enabled={!transformDragging}
              autoRotate={autoRotate}
              enableDamping
              enablePan
              minDistance={model.extent * 0.2}
              maxDistance={model.extent * 8}
            />
            <CameraRig model={model} view={view} resetKey={resetKey} />
          </Canvas>
        </TwinRendererBoundary>
      ) : (
        vector
      )}
      <div className="mt-render-presets" role="group" aria-label="Styles de rendu du modèle sélectionné">
        <label htmlFor={`render-${model.designId}`}>RENDU</label>
        <select id={`render-${model.designId}`} value={renderPreset === "mechanical" && mode !== "solid" ? mode : renderPreset} onChange={event => { const next = event.target.value; setRenderPreset(next); emitTechnicalRenderAudit(next === "exploded" ? "exploded_view_opened" : "preset_changed", technicalContext, { preset: next, engineId: resolveRenderPlan(next, mode, explosion).engine.id }); props.onRenderPresetChange?.(next); }} aria-label="Choisir un style de rendu du drone sélectionné">
          <optgroup label="Presets techniques requis">{technicalRenderPresetOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</optgroup>
          <optgroup label="Projections et analyses avancées"><option value="axonometric">Axonométrique</option><option value="orthographic">Orthographique</option><option value="perspective">Perspective</option><option value="npr">NPR / Cel-shading</option><option value="clay">Argile</option><option value="lowpoly">Low-poly</option><option value="mesh-wire">Maillage filaire sur grille</option><option value="archviz">ArchViz · matériau temps réel</option><option value="interior">Intérieur / Extérieur</option><option value="immersive">Immersif · plein écran</option><option value="mechanical">Mécanique / Industriel</option><option value="bionic">Squelette bionique · treillis indicatif</option><option value="carbon">Carbone · shader procédural</option><option value="cyberpunk">Exosquelette cyberpunk</option><option value="crystal">Cristal · translucide stylisé</option><option value="energyflow">Flux · particules indicatives</option><option value="cfd">CFD · estimation de surface</option><option value="fea">MEF · approximation de poutre</option></optgroup>
        </select>
        <small>{selectedEngine.description} · solveur {selectedEngine.solverId ?? "présentation"}</small>
        <label className="mt-snap-control"><input type="checkbox" checked={snapEnabled} onChange={event => setSnapEnabled(event.target.checked)} /> Magnétisme</label>
        <select value={snapMode} onChange={event => setSnapMode(event.target.value as SnapMode)} aria-label="Mode de magnétisme">
          <option value="component">Composants + grille</option><option value="axis">Axes voisins</option><option value="grid">Grille métrique</option>
        </select>
        <select value={snapIncrement} onChange={event => setSnapIncrement(Number(event.target.value))} aria-label="Pas de magnétisme">
          <option value="0.001">1 mm</option><option value="0.005">5 mm</option><option value="0.01">1 cm</option><option value="0.05">5 cm</option>
        </select>
        {renderPreset === "immersive" && <button type="button" onClick={async () => { try { if (!document.fullscreenElement) await root.current?.requestFullscreen(); else await document.exitFullscreen(); setImmersive(Boolean(document.fullscreenElement)); } catch { setImmersive(false); } }} aria-label="Basculer le viewport immersif plein écran">{immersive ? "Quitter le plein écran" : "Ouvrir en plein écran"}</button>}
      </div>
      {previewEnabled && previewPartId && <div className="mt-preview-tag"><span>FEATURE TREE PREVIEW</span><b>{previewPartId}</b></div>}
      {(renderPreset === "cfd" || renderPreset === "fea" || renderPreset === "energyflow") && <div className="mt-field-legend" role="note"><strong>{renderPreset === "fea" ? "POUTRE 1D · CONTRAINTE ESTIMÉE" : renderPreset === "energyflow" ? "FLUX · VISUALISATION INDICATIVE" : "CFD · ESTIMATION DE SURFACE"}</strong>{renderPreset === "cfd" && <label>V∞ <input aria-label="Vitesse de flux CFD en mètres par seconde" type="number" min="0" max="80" step="1" value={analysisAirspeed} onChange={event => setAnalysisAirspeed(Math.max(0, Math.min(80, Number(event.target.value) || 0)))} /> m/s</label>}<span>MAX</span><i /><span>MIN</span><small>{webgl ? "Proxies locaux non validés, normalisés par pièce : ni CFD volumique ni MEF 3D, impropres au dimensionnement." : "Secours vectoriel : aucun champ, vecteur ou particule calculé n’est affiché."}</small></div>}
      <div className="mt-scene-tag">
        <span>MECHANICAL TWIN / {model.modelType.toUpperCase()}</span>
        <b>{webgl ? "3D INTERACTIVE" : "PROJECTION MÉCANIQUE INTERACTIVE"}</b>
      </div>
      <div className="mt-technical-meta" aria-label="Provenance du modèle technique">
        <span>DRONE · {technicalContext.droneId}</span>
        <span>MODÈLE · {technicalContext.modelId} · {technicalContext.modelVersion}</span>
        <span>SOURCE · {technicalContext.source.toUpperCase()} · {technicalContext.centreContext}</span>
        <span className={technicalContext.syncStatus === "ready" ? "is-ready" : technicalContext.syncStatus === "unsynced" || technicalContext.syncStatus === "partial" ? "is-warning" : "is-error"}>{technicalContext.statusLabel}</span>
      </div>
      {technicalContext.syncStatus !== "ready" && <div className="mt-technical-state" role="status"><strong>{technicalContext.statusLabel}</strong><span>{technicalContext.statusMessage}</span></div>}
      {!webgl && <div className="mt-technical-state is-fallback" role="status"><strong>Projection vectorielle de secours</strong><span>Maillage actif conservé ; styles, éclairage, transparence et profondeur sont approximatifs. Pas de shaders, d’overlays d’analyse, d’animation cinématique ni de rotation automatique.</span></div>}
      <div className="mt-axis">
        <i>X</i>
        <i>Y</i>
        <i>Z</i>
      </div>
      <div className="mt-dimension">
        <span>ENVERGURE / {model.span.toFixed(2)} m</span>
        <i />
        <span>LONGUEUR / {model.length.toFixed(2)} m</span>
      </div>
      <div className="mt-viewport-note">
        {readOnly
          ? "Glisser pour orbiter · molette pour zoomer · consultation seule"
          : canTransform
            ? webgl
              ? "Glissez les axes du manipulateur sur la pièce sélectionnée · molette pour zoomer"
              : "Glissez directement la pièce sélectionnée dans la projection · molette pour zoomer"
            : props.transformEnabled
              ? renderPreset === "exploded" ? "Quittez le mode éclaté pour déplacer une pièce" : "Réassemblez le drone pour déplacer une pièce"
            : "Glisser pour orbiter · molette pour zoomer · cliquer une pièce pour modifier"}
        {!webgl ? " · secours vectoriel, même géométrie" : ""}
      </div>
    </div>
  );
}
