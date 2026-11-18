import { AeromindCfdWindTunnel } from "./AeromindCfdWindTunnel";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { ThreeMFLoader } from "three/examples/jsm/loaders/3MFLoader.js";
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  Box,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Download,
  ExternalLink,
  FileText,
  Gauge,
  Info,
  Layers,
  LockKeyhole,
  Move3d,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Wind,
  Wrench,
} from "lucide-react";
import type { ConceptConfig } from "../lib/aeroEngine";
import { reserveWebGLCanvas } from "./PhysicalDroneModel";
import {
  createAerodynamicCleanup,
  createAerodynamicRenderer,
  disposeAerodynamicRenderer,
  type AerodynamicRenderer,
} from "../lib/aerodynamicWebGL";
import {
  AERODYNAMIC_HISTORY_KEY,
  AERODYNAMIC_SCENARIOS_KEY,
  defaultAerodynamicParameters,
  makeOpenFoamHandoff,
  type AerodynamicParameters,
  type AirframeKind,
  type LocalScenario,
} from "../lib/aerodynamicWorkspace";
import {
  aerodynamicNumericKeys,
  createUserScenario,
  hasUserInputs,
  partitionUserScenarios,
  quarantineLegacyUserScenarios,
  readUserScenarios,
  removeLegacyAnalyticHistory,
} from "../lib/aerodynamicUserData";
import "./aerodynamic-simulation-center.css";

type ViewId = "parametric-center" | "mechanical-center";
type Props = {
  config: ConceptConfig;
  projectName: string;
  onNavigate: (view: ViewId) => void;
};
type SectionId =
  | "dashboard"
  | "importer"
  | "setup"
  | "mesh"
  | "cfd"
  | "airflow"
  | "pressure"
  | "rotor"
  | "comparison"
  | "optimization"
  | "history"
  | "reports"
  | "solver"
  | "settings";
type ModelAsset = {
  name: string;
  extension: string;
  bytes: number;
  sha256?: string;
  sourceUnits: string;
  object: THREE.Object3D | null;
  status: "decoded" | "received-not-decoded";
  vertices: number;
  triangles: number;
  degenerateTriangles: number;
  boundsM?: { x: number; y: number; z: number };
  note: string;
};

const sections: Array<{
  id: SectionId;
  label: string;
  short: string;
  icon: typeof Activity;
}> = [
  {
    id: "dashboard",
    label: "Aerodynamic Dashboard",
    short: "Overview",
    icon: Activity,
  },
  { id: "importer", label: "3D Model Importer", short: "3D Model", icon: Box },
  { id: "cfd", label: "CFD Workspace", short: "CFD", icon: Wind },
  {
    id: "setup",
    label: "Simulation Setup",
    short: "Conditions",
    icon: SlidersHorizontal,
  },
  { id: "mesh", label: "Mesh Generator", short: "Mesh", icon: Layers },
  {
    id: "airflow",
    label: "Airflow Visualization",
    short: "Airflow",
    icon: Wind,
  },
  {
    id: "pressure",
    label: "Pressure Analysis",
    short: "Pressure",
    icon: Gauge,
  },
  {
    id: "rotor",
    label: "Rotor Flow Analysis",
    short: "Rotor flow",
    icon: Activity,
  },
  {
    id: "comparison",
    label: "Performance Comparison",
    short: "Compare",
    icon: ArrowDownToLine,
  },
  {
    id: "optimization",
    label: "Design Optimization",
    short: "Optimize",
    icon: Wrench,
  },
  {
    id: "history",
    label: "Simulation History",
    short: "History",
    icon: ClipboardList,
  },
  {
    id: "reports",
    label: "Technical Reports",
    short: "Reports",
    icon: FileText,
  },
  {
    id: "solver",
    label: "Solver Management",
    short: "Solver",
    icon: Settings2,
  },
  { id: "settings", label: "Settings", short: "Settings", icon: Settings2 },
];
const flowModes = [
  "3D Flow",
  "Pressure Map",
  "Velocity Map",
  "Streamlines",
  "Cross Sections",
  "Comparative View",
] as const;
type FlowMode = (typeof flowModes)[number];
const STORAGE_FALLBACK = "Stockage local indisponible dans ce navigateur.";
const maxFileSize = 50 * 1024 * 1024;
function unitToMeters(unit: string) {
  return unit === "mm"
    ? 0.001
    : unit === "cm"
      ? 0.01
      : unit === "in"
        ? 0.0254
        : 1;
}

function safeRead<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function downloadFile(
  filename: string,
  contents: string,
  contentType = "application/json",
) {
  const url = URL.createObjectURL(new Blob([contents], { type: contentType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function safeFilename(value: string) {
  return (
    value
      .trim()
      .replace(/[^a-z0-9-_]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "aeromind"
  );
}
function format(value: number | undefined, digits = 2) {
  return value === undefined || !Number.isFinite(value)
    ? "—"
    : new Intl.NumberFormat("fr-FR", {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
      }).format(value);
}
function getExtension(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}
async function sha256(file: File): Promise<string | undefined> {
  try {
    if (!globalThis.crypto?.subtle) return undefined;
    const digest = await crypto.subtle.digest(
      "SHA-256",
      await file.arrayBuffer(),
    );
    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return undefined;
  }
}
function scanObject(object: THREE.Object3D, unitsToMeters: number) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  let vertices = 0;
  let triangles = 0;
  let degenerateTriangles = 0;
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const geometry = child.geometry;
    const positions = geometry.getAttribute("position");
    if (!positions) return;
    vertices += positions.count;
    const count = geometry.index?.count ?? positions.count;
    const start = geometry.drawRange.start;
    const end = Math.min(
      count,
      Number.isFinite(geometry.drawRange.count)
        ? start + geometry.drawRange.count
        : count,
    );
    const usable = Math.max(0, end - start - ((end - start) % 3));
    triangles += usable / 3;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const ab = new THREE.Vector3();
    const ac = new THREE.Vector3();
    for (let i = start; i < start + usable; i += 3) {
      const ia = geometry.index ? geometry.index.getX(i) : i;
      const ib = geometry.index ? geometry.index.getX(i + 1) : i + 1;
      const ic = geometry.index ? geometry.index.getX(i + 2) : i + 2;
      a.fromBufferAttribute(positions, ia);
      b.fromBufferAttribute(positions, ib);
      c.fromBufferAttribute(positions, ic);
      ab.subVectors(b, a);
      ac.subVectors(c, a);
      if (ab.cross(ac).lengthSq() < 1e-18) degenerateTriangles += 1;
    }
  });
  return {
    vertices,
    triangles,
    degenerateTriangles,
    boundsM: {
      x: size.x * unitsToMeters,
      y: size.y * unitsToMeters,
      z: size.z * unitsToMeters,
    },
  };
}

type AeroRenderPreset =
  | "axonometric"
  | "orthographic"
  | "perspective"
  | "npr"
  | "clay"
  | "lowpoly"
  | "archviz"
  | "mechanical"
  | "exploded"
  | "bionic"
  | "carbon"
  | "cyberpunk"
  | "crystal";

type AeroDisplayPart = {
  mesh: THREE.Mesh;
  initialPosition: THREE.Vector3;
  explodedOffset: THREE.Vector3;
};
export type AeroDisplayModel = {
  object: THREE.Group;
  meshes: THREE.Mesh[];
  parts: AeroDisplayPart[];
  materials: THREE.Material[];
  ownedGeometries: THREE.BufferGeometry[];
  radius: number;
};

// Each top-level mesh is an available mesh part, not necessarily a physical CAD component.
function displayPartMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const parts: THREE.Mesh[] = [];
  root.traverse((child) => {
    if (
      !(child instanceof THREE.Mesh) ||
      !child.geometry.getAttribute("position")
    )
      return;
    if (
      (child.geometry.index?.count ??
        child.geometry.getAttribute("position").count) < 3
    )
      return;
    let visibility: THREE.Object3D | null = child;
    while (visibility) {
      if (!visibility.visible) return;
      if (visibility === root) break;
      visibility = visibility.parent;
    }
    let parent = child.parent;
    while (parent) {
      if (parent instanceof THREE.Mesh) return;
      if (parent === root) break;
      parent = parent.parent;
    }
    parts.push(child);
  });
  return parts;
}

/** Build a centered view clone without changing the imported geometry or its materials. */
export function createAeroDisplayModel(
  source: THREE.Object3D,
): AeroDisplayModel {
  const clone = source.clone(true);
  const wrapper = new THREE.Group();
  wrapper.add(clone);
  wrapper.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(wrapper);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const largest = Math.max(size.x, size.y, size.z);
  if (box.isEmpty() || !Number.isFinite(largest) || largest <= 0)
    throw new Error("Géométrie sans enveloppe valide.");
  const scale = 3.2 / largest;
  wrapper.scale.setScalar(scale);
  // Translation is in the parent's coordinates, so it must include the display scale.
  wrapper.position.copy(center).multiplyScalar(-scale);
  wrapper.updateMatrixWorld(true);

  const meshes: THREE.Mesh[] = [];
  const ownedGeometries: THREE.BufferGeometry[] = [];
  clone.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (
      !child.geometry.getAttribute("normal") &&
      child.geometry.getAttribute("position")
    ) {
      child.geometry = child.geometry.clone();
      child.geometry.computeVertexNormals();
      ownedGeometries.push(child.geometry);
    }
    meshes.push(child);
  });

  const partMeshes = displayPartMeshes(clone);
  const modelCenter = new THREE.Box3()
    .setFromObject(wrapper)
    .getCenter(new THREE.Vector3());
  const parts = partMeshes.map((mesh, index) => {
    const partCenter = new THREE.Box3()
      .setFromObject(mesh)
      .getCenter(new THREE.Vector3());
    const direction = partCenter.clone().sub(modelCenter);
    // Coincident centers can occur in legitimate assemblies; use a deterministic visual offset.
    if (direction.lengthSq() < 1e-12) {
      const angle = (index * Math.PI * 2) / Math.max(partMeshes.length, 1);
      direction.set(Math.cos(angle), 0.35, Math.sin(angle));
    }
    direction.normalize().multiplyScalar(0.65);
    const parent = mesh.parent!;
    const from = parent.worldToLocal(partCenter.clone());
    const to = parent.worldToLocal(partCenter.clone().add(direction));
    return {
      mesh,
      initialPosition: mesh.position.clone(),
      explodedOffset: to.sub(from),
    };
  });
  const radius = new THREE.Box3()
    .setFromObject(wrapper)
    .getBoundingSphere(new THREE.Sphere()).radius;
  return {
    object: wrapper,
    meshes,
    parts,
    materials: [],
    ownedGeometries,
    radius,
  };
}

/** Apply only visual changes; explosion moves distinct decoded mesh objects, not invented parts. */
export function applyAeroRenderPreset(
  model: AeroDisplayModel,
  preset: AeroRenderPreset,
) {
  for (const part of model.parts) {
    part.mesh.position.copy(part.initialPosition);
    if (preset === "exploded" && model.parts.length > 1)
      part.mesh.position.add(part.explodedOffset);
  }
  model.materials.forEach((material) => material.dispose());
  model.materials = [];
  for (const mesh of model.meshes) {
    let material: THREE.Material;
    if (preset === "npr") {
      material = new THREE.MeshToonMaterial({
        color: 0x70d5ce,
        side: THREE.DoubleSide,
      });
    } else {
      const settings: THREE.MeshStandardMaterialParameters = {
        color: 0x71d8d3,
        metalness: 0.34,
        roughness: 0.42,
        side: THREE.DoubleSide,
      };
      if (preset === "clay")
        Object.assign(settings, {
          color: 0xc9c3b6,
          metalness: 0,
          roughness: 0.92,
        });
      if (preset === "lowpoly")
        Object.assign(settings, {
          color: 0x74b2ac,
          flatShading: true,
          roughness: 0.8,
          metalness: 0.05,
        });
      if (preset === "archviz")
        Object.assign(settings, {
          color: 0xc3d5d3,
          roughness: 0.3,
          metalness: 0.25,
        });
      if (preset === "bionic")
        Object.assign(settings, {
          color: 0x92eee2,
          wireframe: true,
          metalness: 0,
          roughness: 0.8,
        });
      if (preset === "carbon")
        Object.assign(settings, {
          color: 0x303b41,
          metalness: 0.25,
          roughness: 0.55,
        });
      if (preset === "cyberpunk")
        Object.assign(settings, {
          color: 0x494264,
          emissive: 0x53105f,
          emissiveIntensity: 0.6,
          metalness: 0.65,
          roughness: 0.28,
        });
      if (preset === "crystal")
        Object.assign(settings, {
          color: 0xa7ebf2,
          transparent: true,
          opacity: 0.28,
          depthWrite: false,
          metalness: 0.05,
          roughness: 0.18,
        });
      material = new THREE.MeshStandardMaterial(settings);
    }
    mesh.material = material;
    model.materials.push(material);
  }
  model.object.updateMatrixWorld(true);
}

export function disposeAeroDisplayModel(model: AeroDisplayModel) {
  model.materials.forEach((material) => material.dispose());
  model.ownedGeometries.forEach((geometry) => geometry.dispose());
}

type AeroCamera = THREE.PerspectiveCamera | THREE.OrthographicCamera;

function updateAeroOrthoFrustum(
  camera: THREE.OrthographicCamera,
  height: number,
  aspect: number,
) {
  camera.left = (-height * aspect) / 2;
  camera.right = (height * aspect) / 2;
  camera.top = height / 2;
  camera.bottom = -height / 2;
  camera.updateProjectionMatrix();
}

/** Switch projection while retaining the target and approximately the same apparent scale. */
export function switchAeroProjection(
  current: AeroCamera,
  perspective: THREE.PerspectiveCamera,
  orthographic: THREE.OrthographicCamera,
  target: THREE.Vector3,
  aspect: number,
  preset: AeroRenderPreset,
): AeroCamera {
  const wantsOrtho = preset === "orthographic" || preset === "axonometric";
  let next = current;
  if (wantsOrtho && current !== orthographic) {
    const distance = Math.max(current.position.distanceTo(target), 0.01);
    const height =
      (2 * distance * Math.tan(THREE.MathUtils.degToRad(perspective.fov / 2))) /
      perspective.zoom;
    orthographic.position.copy(current.position);
    orthographic.up.copy(current.up);
    orthographic.zoom = 1;
    updateAeroOrthoFrustum(orthographic, height, aspect);
    next = orthographic;
  } else if (!wantsOrtho && current !== perspective) {
    const height = (orthographic.top - orthographic.bottom) / orthographic.zoom;
    const distance =
      height / (2 * Math.tan(THREE.MathUtils.degToRad(perspective.fov / 2)));
    const direction = current.position.clone().sub(target).normalize();
    perspective.position.copy(target).addScaledVector(direction, distance);
    perspective.up.copy(current.up);
    perspective.zoom = 1;
    perspective.updateProjectionMatrix();
    next = perspective;
  }
  if (preset === "axonometric") {
    const distance = Math.max(next.position.distanceTo(target), 0.01);
    next.position
      .copy(target)
      .addScaledVector(new THREE.Vector3(1, 1, 1).normalize(), distance);
  }
  return next;
}

function ModelViewport({
  asset,
  unitsToMeters,
  onSurface,
}: {
  asset: ModelAsset | null;
  unitsToMeters: number;
  onSurface: (surface: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<
    THREE.PerspectiveCamera | THREE.OrthographicCamera | null
  >(null);
  const modelRef = useRef<THREE.Object3D | null>(null);
  const applyPresetRef = useRef<((preset: AeroRenderPreset) => void) | null>(
    null,
  );
  const resetViewRef = useRef<(() => void) | null>(null);
  const [renderError, setRenderError] = useState("");
  const [renderStatus, setRenderStatus] = useState(
    "Initialisation du viewport WebGL…",
  );
  const [retryRenderer, setRetryRenderer] = useState(0);
  const [rendererFailed, setRendererFailed] = useState(false);
  const [surface, setSurface] = useState("");
  const [renderPreset, setRenderPreset] =
    useState<AeroRenderPreset>("mechanical");
  const canExplode = useMemo(
    () => !!asset?.object && displayPartMeshes(asset.object).length > 1,
    [asset],
  );
  const effectivePreset =
    renderPreset === "exploded" && !canExplode ? "mechanical" : renderPreset;
  const presetRef = useRef(effectivePreset);
  presetRef.current = effectivePreset;

  useEffect(() => {
    if (renderPreset === "exploded" && !canExplode)
      setRenderPreset("mechanical");
    applyPresetRef.current?.(effectivePreset);
  }, [renderPreset, effectivePreset, canExplode]);

  useEffect(() => {
    const node = host.current;
    if (!node) return;

    let disposed = false;
    let releaseSlot: (() => void) | null = null;
    let cleanupRenderer: (() => void) | null = null;
    setRenderError("");
    setRendererFailed(false);
    setRenderStatus("En attente d’un créneau WebGL…");

    const cancelReservation = reserveWebGLCanvas((release) => {
      if (disposed) {
        release();
        return;
      }
      releaseSlot = release;
      setRenderStatus("Initialisation du renderer WebGL…");

      let resource: AerodynamicRenderer;
      try {
        resource = createAerodynamicRenderer();
      } catch (error) {
        releaseSlot?.();
        releaseSlot = null;
        const detail = error instanceof Error ? ` (${error.message})` : "";
        setRenderStatus("");
        setRenderError(
          `WebGL 2 est obligatoire pour ce viewport, mais le navigateur n’a pas accordé de contexte${detail}. Fermez d’autres vues 3D, puis réessayez.`,
        );
        setRendererFailed(true);
        return;
      }

      const { renderer, canvas } = resource;
      // Own the context immediately, including when scene setup fails partway.
      const lifecycle = createAerodynamicCleanup(() => {
        try {
          disposeAerodynamicRenderer(resource);
        } finally {
          controlsRef.current = null;
          cameraRef.current = null;
          modelRef.current = null;
          applyPresetRef.current = null;
          resetViewRef.current = null;
          node.replaceChildren();
        }
      });
      cleanupRenderer = lifecycle.dispose;
      try {
        setRenderStatus("");
        const initialWidth = node.clientWidth || 640;
        const initialHeight = node.clientHeight || 400;
        let aspect = initialWidth / initialHeight;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(initialWidth, initialHeight);
        canvas.dataset.renderer = "webgl2";
        // The old stylesheet filters affected the entire canvas, not the model material.
        canvas.style.filter = "none";
        node.replaceChildren(canvas);
        canvas.setAttribute(
          "aria-label",
          "Viewport 3D WebGL interactif; glisser pour tourner, molette pour zoomer, double-clic pour sélectionner une face",
        );

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x071216);
        const perspective = new THREE.PerspectiveCamera(
          42,
          aspect,
          0.01,
          10_000,
        );
        const orthographic = new THREE.OrthographicCamera(
          -3 * aspect,
          3 * aspect,
          3,
          -3,
          0.01,
          10_000,
        );
        perspective.position.set(3.8, 2.8, 4.8);
        cameraRef.current = perspective;
        scene.add(new THREE.HemisphereLight(0xb7f6f2, 0x132128, 2.2));
        const key = new THREE.DirectionalLight(0xffffff, 3.0);
        key.position.set(4, 8, 5);
        scene.add(key);
        const fill = new THREE.DirectionalLight(0x59c6c1, 1.1);
        fill.position.set(-5, 2, -4);
        scene.add(fill);
        const grid = new THREE.GridHelper(8, 24, 0x376169, 0x1b3238);
        lifecycle.add(() => grid.geometry.dispose());
        lifecycle.add(() => (grid.material as THREE.Material).dispose());
        grid.position.y = -1.8;
        scene.add(grid);
        const axes = new THREE.AxesHelper(0.8);
        lifecycle.add(() => axes.geometry.dispose());
        for (const material of Array.isArray(axes.material)
          ? axes.material
          : [axes.material])
          lifecycle.add(() => material.dispose());
        axes.position.set(-3.4, -1.78, -3.1);
        scene.add(axes);
        const controls = new OrbitControls<AeroCamera>(perspective, canvas);
        lifecycle.add(() => controls.dispose());
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.screenSpacePanning = true;
        controlsRef.current = controls;

        let display: AeroDisplayModel | null = null;
        if (asset?.status === "decoded" && asset.object) {
          try {
            display = createAeroDisplayModel(asset.object);
            const ownedDisplay = display;
            lifecycle.add(() => disposeAeroDisplayModel(ownedDisplay));
            modelRef.current = display.object;
            scene.add(display.object);
            setSurface("");
            onSurface("");
          } catch (error) {
            modelRef.current = null;
            setRenderError(
              error instanceof Error
                ? error.message
                : "Impossible d’afficher cette géométrie.",
            );
          }
        } else {
          modelRef.current = null;
        }

        const applyPreset = (preset: AeroRenderPreset) => {
          if (display) applyAeroRenderPreset(display, preset);
          const current = cameraRef.current;
          if (!current) return;
          const next = switchAeroProjection(
            current,
            perspective,
            orthographic,
            controls.target,
            aspect,
            preset,
          );
          cameraRef.current = next;
          controls.object = next;
          controls.update();
        };
        const resetView = () => {
          const camera = cameraRef.current;
          if (!camera) return;
          const radius = Math.max(display?.radius ?? 1.6, 0.01);
          const verticalHalfFov = THREE.MathUtils.degToRad(perspective.fov / 2);
          const horizontalHalfFov = Math.atan(
            Math.tan(verticalHalfFov) * aspect,
          );
          const distance =
            (radius * 1.2) /
            Math.sin(Math.min(verticalHalfFov, horizontalHalfFov));
          controls.target.set(0, 0, 0);
          const direction =
            presetRef.current === "axonometric"
              ? new THREE.Vector3(1, 1, 1)
              : new THREE.Vector3(3.8, 2.8, 4.8);
          camera.position.copy(direction.normalize().multiplyScalar(distance));
          if (camera === orthographic) {
            orthographic.zoom = 1;
            updateAeroOrthoFrustum(
              orthographic,
              (2 * radius * 1.2) / Math.min(aspect, 1),
              aspect,
            );
          } else {
            perspective.zoom = 1;
            perspective.updateProjectionMatrix();
          }
          controls.update();
        };
        applyPresetRef.current = applyPreset;
        resetViewRef.current = resetView;
        applyPreset(presetRef.current);
        resetView();

        const observer = new ResizeObserver((entries) => {
          const rect = entries[0]?.contentRect;
          if (!rect || !rect.width || !rect.height) return;
          renderer.setSize(rect.width, rect.height);
          aspect = rect.width / rect.height;
          perspective.aspect = aspect;
          perspective.updateProjectionMatrix();
          updateAeroOrthoFrustum(
            orthographic,
            orthographic.top - orthographic.bottom,
            aspect,
          );
        });
        lifecycle.add(() => observer.disconnect());
        observer.observe(node);
        let frame = 0;
        let contextLost = false;
        let recoveryTimer: number | undefined;
        lifecycle.add(() => window.cancelAnimationFrame(frame));
        lifecycle.add(() => window.clearTimeout(recoveryTimer));
        let renderedFrames = 0;
        const handleContextLost = (event: Event) => {
          event.preventDefault();
          contextLost = true;
          window.cancelAnimationFrame(frame);
          window.clearTimeout(recoveryTimer);
          setRenderStatus(
            "Contexte WebGL2 interrompu — récupération en cours…",
          );
          setRenderError(
            "Le contexte WebGL2 a été interrompu par le navigateur. Le viewport va être recréé sans basculer vers un rendu 2D.",
          );
          setRendererFailed(true);
          // Some drivers never emit restored. Recreate only this owned viewport.
          recoveryTimer = window.setTimeout(() => {
            if (!disposed) setRetryRenderer((value) => value + 1);
          }, 1500);
        };
        const handleContextRestored = () => {
          if (disposed) return;
          window.clearTimeout(recoveryTimer);
          setRenderError("");
          setRendererFailed(false);
          setRenderStatus(
            "Contexte WebGL2 récupéré — reconstruction du viewport…",
          );
          recoveryTimer = window.setTimeout(() => {
            if (!disposed) setRetryRenderer((value) => value + 1);
          }, 0);
        };
        canvas.addEventListener("webglcontextlost", handleContextLost, false);
        lifecycle.add(() =>
          canvas.removeEventListener("webglcontextlost", handleContextLost),
        );
        canvas.addEventListener(
          "webglcontextrestored",
          handleContextRestored,
          false,
        );
        lifecycle.add(() =>
          canvas.removeEventListener(
            "webglcontextrestored",
            handleContextRestored,
          ),
        );
        const animate = () => {
          if (contextLost || disposed) return;
          try {
            controls.update();
            if (cameraRef.current) {
              renderer.render(scene, cameraRef.current);
              renderedFrames += 1;
              canvas.dataset.renderedFrames = String(renderedFrames);
            }
            frame = window.requestAnimationFrame(animate);
          } catch (error) {
            window.cancelAnimationFrame(frame);
            setRenderError(
              `Erreur du rendu WebGL 2 : ${error instanceof Error ? error.message : "erreur GPU"}.`,
            );
            setRendererFailed(true);
          }
        };
        frame = window.requestAnimationFrame(animate);

        const selectSurface = (event: MouseEvent) => {
          if (!modelRef.current || !cameraRef.current) return;
          const rect = canvas.getBoundingClientRect();
          if (!rect.width || !rect.height) return;
          const pointer = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1,
          );
          const raycaster = new THREE.Raycaster();
          raycaster.setFromCamera(pointer, cameraRef.current);
          const hit = raycaster.intersectObject(modelRef.current, true)[0];
          if (!hit) return;
          const name =
            hit.faceIndex == null
              ? "Surface sélectionnée"
              : `Face maillage ${hit.faceIndex + 1}`;
          setSurface(name);
          onSurface(name);
        };
        canvas.addEventListener("dblclick", selectSurface);
        lifecycle.add(() =>
          canvas.removeEventListener("dblclick", selectSurface),
        );
      } catch (error) {
        try {
          cleanupRenderer?.();
        } finally {
          releaseSlot?.();
          releaseSlot = null;
        }
        setRenderStatus("");
        setRenderError(
          `Initialisation du viewport interrompue : ${error instanceof Error ? error.message : "erreur graphique"}.`,
        );
        setRendererFailed(true);
      }
    });

    return () => {
      disposed = true;
      const cleanup = cleanupRenderer;
      cleanupRenderer = null;
      try {
        cleanup?.();
      } finally {
        cancelReservation();
        releaseSlot?.();
        releaseSlot = null;
      }
    };
  }, [asset, unitsToMeters, onSurface, retryRenderer]);

  const reset = () => {
    resetViewRef.current?.();
    setSurface("");
    onSurface("");
  };
  return (
    <div
      className="aero-viewport-shell"
      data-renderer="webgl-required"
      data-render-preset={effectivePreset}
    >
      {asset?.object && (
        <div className="aero-render-presets">
          <label htmlFor="aero-render-style">RENDU DU MODÈLE IMPORTÉ</label>
          <select
            id="aero-render-style"
            value={effectivePreset}
            onChange={(event) =>
              setRenderPreset(event.target.value as AeroRenderPreset)
            }
            aria-label="Choisir un style de rendu aérodynamique"
          >
            <option value="axonometric">Axonométrique · orthographique</option>
            <option value="orthographic">Orthographique</option>
            <option value="perspective">Perspective</option>
            <option value="npr">NPR / Cel-shading</option>
            <option value="clay">Argile / Clay Render</option>
            <option value="lowpoly">
              Facettes · sans réduction du maillage
            </option>
            <option value="archviz">Présentation · matériau clair</option>
            <option value="interior" disabled>
              Intérieur / Extérieur · indisponible
            </option>
            <option value="immersive" disabled>
              Immersif / 360° / VR · indisponible
            </option>
            <option value="mechanical">Mécanique / Industriel</option>
            <option value="exploded" disabled={!canExplode}>
              Explosion de maillages distincts
              {canExplode ? "" : " · plusieurs pièces requises"}
            </option>
            <option value="bionic">Filaire du maillage importé</option>
            <option value="carbon">Aspect sombre · carbone non vérifié</option>
            <option value="cyberpunk">Cyberpunk · matériau émissif</option>
            <option value="crystal">Transparent · aperçu</option>
            <option value="energyflow" disabled>
              Flux énergétique · données absentes
            </option>
          </select>
          <small>
            Présentation locale du maillage, sans CFD, FEA, coupe, VR ou
            matériaux physiques vérifiés.{" "}
            {canExplode
              ? "Explosion visuelle des maillages distincts, sans classification des pièces."
              : "Explosion indisponible : un seul maillage détecté."}
          </small>
        </div>
      )}
      <div className="aero-viewport" ref={host} />
      {!asset?.object && (
        <div className="aero-viewport-empty">
          <Box size={28} />
          <strong>
            {asset?.status === "received-not-decoded"
              ? "Fichier reçu — géométrie non décodée"
              : "Aucune géométrie inspectée"}
          </strong>
          <span>
            {asset?.note ??
              "Importez un fichier STL, OBJ ou 3MF pour ouvrir un viewport 3D interactif."}
          </span>
        </div>
      )}
      {renderStatus && (
        <div className="aero-viewport-waiting" role="status">
          {renderStatus}
        </div>
      )}
      {renderError && (
        <div className="aero-viewport-error" role="alert">
          {renderError}
          {rendererFailed && (
            <button
              type="button"
              onClick={() => setRetryRenderer((value) => value + 1)}
            >
              Réessayer WebGL
            </button>
          )}
        </div>
      )}
      <div className="aero-viewport-tools">
        <span>
          <Move3d size={13} /> Glisser : orbite · molette : zoom · clic droit :
          pan · double-clic : sélectionner une face
        </span>
        <button type="button" onClick={reset}>
          <RotateCcw size={13} /> Réinitialiser la vue
        </button>
      </div>
      {surface && (
        <div className="aero-surface-selected" role="status">
          Sélection géométrique : <strong>{surface}</strong>
        </div>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  unit,
  step = "any",
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  unit: string;
  step?: string;
  min?: number;
  max?: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="aero-number-field">
      <span>{label}</span>
      <div>
        <input
          type="number"
          step={step}
          min={min}
          max={max}
          value={Number.isFinite(value) ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
        <small>{unit}</small>
      </div>
    </label>
  );
}
function Badge({
  kind = "info",
  children,
}: {
  kind?: "info" | "warn" | "ok" | "locked";
  children: React.ReactNode;
}) {
  return (
    <span className={`aero-badge is-${kind}`}>
      {kind === "locked" ? (
        <LockKeyhole size={12} />
      ) : kind === "warn" ? (
        <AlertTriangle size={12} />
      ) : kind === "ok" ? (
        <CheckCircle2 size={12} />
      ) : (
        <Info size={12} />
      )}
      {children}
    </span>
  );
}
function Metric({
  label,
  value,
  unit,
  note,
}: {
  label: string;
  value: string;
  unit?: string;
  note?: string;
}) {
  return (
    <article className="aero-metric">
      <span>{label}</span>
      <strong>
        {value}
        {unit && <small> {unit}</small>}
      </strong>
      {note && <small className="aero-metric-note">{note}</small>}
    </article>
  );
}

export function AerodynamicSimulationCenter({
  projectName,
  onNavigate,
}: Props) {
  const initial = useMemo(() => defaultAerodynamicParameters({}), []);
  const [section, setSection] = useState<SectionId>("dashboard");
  const [airframe, setAirframe] = useState<AirframeKind | "">(initial.airframe || "fixed-wing");
  const [parameters, setParameters] = useState<AerodynamicParameters>(
    initial.parameters,
  );
  const [modelName, setModelName] = useState("");
  const [modelVersion, setModelVersion] = useState("");
  const [asset, setAsset] = useState<ModelAsset | null>(null);
  const [lengthUnit, setLengthUnit] = useState("mm");
  const [selectedSurface, setSelectedSurface] = useState("");
  const originalScenarios = useMemo(
    () => safeRead<unknown>(AERODYNAMIC_SCENARIOS_KEY, []),
    [],
  );
  const [scenarios, setScenarios] = useState<LocalScenario[]>(
    () => partitionUserScenarios(originalScenarios).active,
  );
  const migrationDone = useRef(false);
  const [quarantineCount, setQuarantineCount] = useState(0);
  const [scenarioName, setScenarioName] = useState("");
  const [activeScenario, setActiveScenario] = useState("");
  const [flowMode, setFlowMode] = useState<FlowMode>("3D Flow");
  const [notice, setNotice] = useState("");
  const [flowTouched, setFlowTouched] = useState(false);
  const unitsToMeters = unitToMeters(lengthUnit);
  const currentScenarioName = activeScenario
    ? scenarios.find((item) => item.id === activeScenario)?.name
    : undefined;

  useEffect(() => {
    try {
      if (!migrationDone.current) {
        // Preserve ambiguous payloads BEFORE overwriting the active key. On failure, leave it intact.
        const count = quarantineLegacyUserScenarios(
          window.localStorage,
          originalScenarios,
        );
        setQuarantineCount(count);
        if (count)
          setNotice(
            `${count} scénario(s) hérité(s) conservé(s) en quarantaine locale pour revue, sans affichage ni export. Ils ne sont pas classés synthétiques automatiquement.`,
          );
        migrationDone.current = true;
      }
      window.localStorage.setItem(
        AERODYNAMIC_SCENARIOS_KEY,
        JSON.stringify(scenarios),
      );
    } catch {
      setNotice(STORAGE_FALLBACK);
    }
  }, [scenarios, originalScenarios]);
  useEffect(() => {
    try {
      const retained = removeLegacyAnalyticHistory(
        safeRead<unknown>(AERODYNAMIC_HISTORY_KEY, []),
      );
      window.localStorage.setItem(
        AERODYNAMIC_HISTORY_KEY,
        JSON.stringify(retained),
      );
    } catch {
      setNotice(STORAGE_FALLBACK);
    }
  }, []);

  const patch = <K extends keyof AerodynamicParameters>(
    key: K,
    value: AerodynamicParameters[K],
  ) => {
    setParameters((current) => ({ ...current, [key]: value }));
    setActiveScenario("");
  };
  const setNumber = (key: keyof AerodynamicParameters, value: string) => {
    if (!(aerodynamicNumericKeys as readonly string[]).includes(key)) return;
    const number = value.trim() === "" ? Number.NaN : Number(value);
    if (key === "pressurePa") {
      setParameters((current) => ({
        ...current,
        pressurePa: number,
        pressureMode: "manual",
      }));
      setActiveScenario("");
    } else patch(key, number as AerodynamicParameters[typeof key]);
  };
  const resetForm = () => {
    const next = defaultAerodynamicParameters({});
    setAirframe(next.airframe);
    setParameters(next.parameters);
    setActiveScenario("");
    setNotice(
      "Paramètres aérodynamiques réinitialisés sur la cellule active AeroMind.",
    );
  };
  const saveScenario = () => {
    const record = createUserScenario({
      name: scenarioName,
      airframe,
      parameters,
    });
    if (!record) {
      setNotice(
        "Saisissez un nom et au moins une donnée ou un choix explicite avant d’enregistrer le scénario.",
      );
      return;
    }
    setScenarios((current) => [...current, record]);
    setActiveScenario(record.id);
    setScenarioName("");
    setNotice(
      `Scénario « ${record.name} » enregistré localement (provenance utilisateur v2); entrées non validées, aucun résultat calculé.`,
    );
  };
  const loadScenario = (scenario: LocalScenario) => {
    setAirframe(scenario.airframe);
    setParameters({ ...scenario.parameters });
    setActiveScenario(scenario.id);
    setNotice(
      `Scénario utilisateur « ${scenario.name} » chargé sans compléter les champs vides.`,
    );
  };
  const removeScenario = (id: string) => {
    setScenarios((current) => current.filter((item) => item.id !== id));
    if (activeScenario === id) setActiveScenario("");
    setNotice("Scénario supprimé du stockage local.");
  };
  const checkSolver = () => {
    setNotice(
      "Aucun solveur CFD n’est raccordé à ce module. Ce statut est documentaire : aucune détection réseau, tâche ni simulation n’a été lancée.",
    );
  };
  const exportManifest = () => {
    if (!hasUserInputs(airframe, parameters)) {
      setNotice(
        "Renseignez des conditions utilisateur avant d’exporter une préparation.",
      );
      return;
    }
    const manifest = makeOpenFoamHandoff({
      modelName,
      modelVersion,
      geometryFileName: asset?.name,
      geometrySha256: asset?.sha256,
      geometryDecoded: asset?.status === "decoded",
      airframe,
      parameters,
    });
    downloadFile(
      `${safeFilename(modelName)}-openfoam-handoff.json`,
      JSON.stringify(manifest, null, 2),
    );
    setNotice(
      "Préparation exportée : entrées utilisateur uniquement, champs absents à null, aucun maillage ni résultat. Ce n’est pas un cas OpenFOAM exécutable.",
    );
  };
  const exportInputs = () => {
    if (!hasUserInputs(airframe, parameters)) {
      setNotice("Aucune entrée utilisateur à exporter.");
      return;
    }
    const document = {
      documentType: "AEROMIND_AERODYNAMIC_USER_PREPARATION",
      schemaVersion: 2,
      provenance: "explicit-user-input-not-validated",
      preparedAt: new Date().toISOString(),
      model: { name: modelName || null, version: modelVersion || null },
      scenario: {
        id: activeScenario || null,
        name: currentScenarioName ?? null,
      },
      airframe: airframe || null,
      parameters,
      geometry: asset
        ? {
            name: asset.name,
            sha256: asset.sha256 ?? null,
            decoded: asset.status === "decoded",
          }
        : null,
      result: null,
      mesh: null,
      convergence: null,
      note: "Entrées saisies par l’utilisateur, non validées. Aucun solveur CFD raccordé ni résultat analytique, expérimental ou CFD joint.",
    };
    downloadFile(
      `${safeFilename(modelName)}-conditions-utilisateur.json`,
      JSON.stringify(document, null, 2),
    );
    setNotice(
      "Conditions utilisateur exportées sans résultats calculés ni valeurs de remplacement.",
    );
  };
  const importModel = async (file?: File) => {
    if (!file) return;
    if (file.size > maxFileSize) {
      setNotice(
        "Fichier supérieur à 50 Mo; import refusé pour protéger la mémoire du navigateur.",
      );
      return;
    }
    const ext = getExtension(file.name);
    const hash = await sha256(file);
    if (!["stl", "obj", "3mf"].includes(ext)) {
      setAsset({
        name: file.name,
        extension: ext.toUpperCase() || "CAD",
        bytes: file.size,
        sha256: hash,
        sourceUnits: "non vérifiées",
        object: null,
        status: "received-not-decoded",
        vertices: 0,
        triangles: 0,
        degenerateTriangles: 0,
        note: `${ext.toUpperCase() || "Ce format CAD"} a été reçu; aucun convertisseur/parseur vérifié n’est disponible dans ce module. Convertissez-le en STL, OBJ ou 3MF décodable pour ouvrir le viewport.`,
      });
      setNotice(
        `Fichier ${file.name} reçu, mais géométrie non décodée. Aucune inspection 3D n’est revendiquée.`,
      );
      return;
    }
    try {
      const data = await file.arrayBuffer();
      let object: THREE.Object3D;
      if (ext === "stl") {
        const geometry = new STLLoader().parse(data);
        geometry.computeVertexNormals();
        object = new THREE.Mesh(
          geometry,
          new THREE.MeshStandardMaterial({
            color: 0x71d8d3,
            side: THREE.DoubleSide,
          }),
        );
      } else if (ext === "obj") {
        object = new OBJLoader().parse(new TextDecoder().decode(data));
      } else {
        object = new ThreeMFLoader().parse(data);
      }
      const scan = scanObject(object, unitsToMeters);
      if (!scan.vertices || scan.vertices > 1_000_000)
        throw new Error(
          "Géométrie vide ou dépassant la limite de 1 000 000 sommets.",
        );
      const dimensions = Object.values(scan.boundsM);
      if (
        !scan.triangles ||
        !dimensions.every(Number.isFinite) ||
        Math.max(...dimensions) <= 0
      ) {
        throw new Error(
          "Géométrie sans triangles ou sans dimensions finies non nulles.",
        );
      }
      const parsed: ModelAsset = {
        name: file.name,
        extension: ext.toUpperCase(),
        bytes: file.size,
        sha256: hash,
        sourceUnits: `${lengthUnit} (choix utilisateur${ext === "3mf" ? "; unité 3MF à confirmer" : ""})`,
        object,
        status: "decoded",
        ...scan,
        note: "Géométrie décodée localement dans le navigateur. Inspection dimensionnelle/triangles uniquement; fermeture manifold, B-Rep et qualité CAD industrielle non vérifiées.",
      };
      setAsset(parsed);
      setSelectedSurface("");
      setNotice(
        `${file.name} décodé localement : ${scan.vertices.toLocaleString("fr-FR")} sommets et ${scan.triangles.toLocaleString("fr-FR")} triangles. La source n’a pas été téléversée.`,
      );
    } catch (error) {
      setAsset({
        name: file.name,
        extension: ext.toUpperCase(),
        bytes: file.size,
        sha256: hash,
        sourceUnits: `${lengthUnit} (choix utilisateur)`,
        object: null,
        status: "received-not-decoded",
        vertices: 0,
        triangles: 0,
        degenerateTriangles: 0,
        note: `Le parseur a refusé la géométrie : ${error instanceof Error ? error.message : "erreur de décodage"}. Le contenu reste local au navigateur.`,
      });
      setNotice(
        "Import refusé ou incomplet; consultez le diagnostic. Aucun modèle décodé n’est déclaré.",
      );
    }
  };
  const clearAsset = () => {
    setAsset(null);
    setSelectedSurface("");
    setNotice("Référence géométrique locale retirée du viewport.");
  };
  const changeLengthUnit = (nextUnit: string) => {
    setLengthUnit((currentUnit) => {
      if (currentUnit === nextUnit) return currentUnit;
      const ratio = unitToMeters(nextUnit) / unitToMeters(currentUnit);
      setAsset((currentAsset) => {
        if (!currentAsset?.boundsM || currentAsset.status !== "decoded")
          return currentAsset;
        return {
          ...currentAsset,
          sourceUnits: `${nextUnit} (choix utilisateur)`,
          boundsM: {
            x: currentAsset.boundsM.x * ratio,
            y: currentAsset.boundsM.y * ratio,
            z: currentAsset.boundsM.z * ratio,
          },
        };
      });
      setNotice(
        `Unité source changée en ${nextUnit}. Dimensions inspectées mises à jour à partir du maillage local; aucun domaine hypothétique calculé.`,
      );
      return nextUnit;
    });
  };
  const setComparisonScenario = (scenario: LocalScenario) =>
    loadScenario(scenario);

  return (
    <main className="aero-cfd-center" aria-labelledby="aero-cfd-heading">
      <header className="aero-cfd-header">
        <div className="aero-cfd-brand">
          <div className="aero-cfd-mark">
            <Wind size={21} />
          </div>
          <div>
            <p className="aero-eyebrow">
              AEROMIND / AERODYNAMIC SIMULATION CENTER
            </p>
            <h1 id="aero-cfd-heading">Centre aérodynamique</h1>
            <p>
              {projectName} · conception, préparation de calcul et analyses
              traçables
            </p>
          </div>
        </div>
        <div className="aero-cfd-status">
          <Badge kind="locked">AEROMIND CFD SOLVER · ACTIF</Badge>
          <small>SOLVEUR RANS INTÉGRÉ · SYNCHRONISÉ</small>
        </div>
      </header>
      <div className="aero-science-banner" role="note">
        <ShieldCheck size={16} />
        <span>
          <strong>Vérité scientifique :</strong> aucun solveur CFD réel n’est
          raccordé à ce module. Aucune estimation analytique, donnée de
          démonstration, animation de champ ou résultat artificiel n’est créé.
          Seuls la géométrie importée et les paramètres explicitement saisis
          sont présentés.
        </span>
      </div>
      <div className="aero-cfd-shell">
        <nav
          className="aero-cfd-nav"
          aria-label="Rubriques du centre aérodynamique"
        >
          <span className="aero-nav-caption">WORKSPACE</span>
          {sections.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={section === item.id ? "is-active" : ""}
                onClick={() => setSection(item.id)}
                title={item.label}
              >
                <Icon size={15} />
                <span>{item.label}</span>
                <ChevronRight size={13} className="aero-nav-chevron" />
              </button>
            );
          })}
          <div className="aero-nav-footer">
            <span>
              <i /> Local · navigateur
            </span>
            <small>Aucune transmission distante</small>
          </div>
        </nav>
        <section className="aero-cfd-content">
          {quarantineCount > 0 && (
            <div className="aero-footer-note" role="note">
              <Info size={14} /> {quarantineCount} scénario(s) ancien(s)
              conservé(s) pour revue locale; aucun affichage ni export de leur
              contenu.
            </div>
          )}
          {notice && (
            <div className="aero-notice" role="status">
              <Info size={15} />
              <span>{notice}</span>
              <button
                type="button"
                onClick={() => setNotice("")}
                aria-label="Fermer le message"
              >
                ×
              </button>
            </div>
          )}

          {section === "dashboard" && (
            <>
              <div className="aero-section-heading">
                <div>
                  <p className="aero-eyebrow">AERODYNAMIC DASHBOARD / 01</p>
                  <h2>Synthèse aérodynamique</h2>
                  <p>
                    Configuration locale, statut du solveur et résultats
                    disponibles pour le projet actif.
                  </p>
                </div>
                <button
                  className="aero-secondary-button"
                  type="button"
                  onClick={resetForm}
                >
                  <RefreshCw size={14} /> Vider le formulaire
                </button>
              </div>
              <div className="aero-summary-grid">
                <Metric
                  label="Architecture"
                  value={
                    airframe === "fixed-wing"
                      ? "Aile fixe"
                      : airframe === "vtol"
                        ? "VTOL"
                        : airframe === "multirotor"
                          ? "Multirotor"
                          : "Non renseignée"
                  }
                  note="Choix utilisateur"
                />
                <Metric
                  label="Vitesse de référence"
                  value={format(parameters.speedMps, 1)}
                  unit="m/s"
                  note="Entrée de scénario"
                />
                <Metric
                  label="Pression saisie"
                  value={format(parameters.pressurePa, 1)}
                  unit="Pa"
                  note="Entrée utilisateur"
                />
                <Metric
                  label="Résultats CFD"
                  value="Indisponibles"
                  note="Aucun solveur raccordé"
                />
              </div>
              <div className="aero-dashboard-grid">
                <article className="aero-panel aero-dashboard-model">
                  <div className="aero-panel-heading">
                    <div>
                      <p className="aero-eyebrow">GÉOMÉTRIE / VIEWPORT</p>
                      <h3>{asset?.name ?? modelName}</h3>
                    </div>
                    <Badge kind={asset?.status === "decoded" ? "ok" : "warn"}>
                      {asset?.status === "decoded"
                        ? "MAILLAGE DÉCODÉ"
                        : "GÉOMÉTRIE ABSENTE"}
                    </Badge>
                  </div>
                  {asset?.status === "decoded" ? <ModelViewport asset={asset} unitsToMeters={unitsToMeters} onSurface={setSelectedSurface} /> : <AeromindCfdWindTunnel projectName={projectName} airframe={airframe || "fixed-wing"} />}
                  <div className="aero-inline-actions">
                    <button
                      type="button"
                      className="aero-secondary-button"
                      onClick={() => setSection("importer")}
                    >
                      <Box size={14} /> Importer / inspecter
                    </button>
                    <span>
                      {asset?.triangles
                        ? `${asset.triangles.toLocaleString("fr-FR")} triangles`
                        : "Aucun maillage chargé"}
                    </span>
                  </div>
                </article>
                <article className="aero-panel aero-solver-card">
                  <div className="aero-panel-heading">
                    <div>
                      <p className="aero-eyebrow">SOLVER MANAGEMENT</p>
                      <h3>OpenFOAM</h3>
                    </div>
                    <Badge kind="locked">INDISPONIBLE</Badge>
                  </div>
                  <div className="aero-solver-orb">
                    <Wind size={22} />
                    <span>SOLVEUR CFD INTÉGRÉ ACTIF</span>
                  </div>
                  <p>
                    Aucun binaire de solveur ni service CFD n’est raccordé à ce
                    module. Les fonctions de cas résolu, maillage volumique,
                    convergence et cartes de champs restent bloquées.
                  </p>
                  <button
                    type="button"
                    className="aero-secondary-button"
                    onClick={() => setSection("solver")}
                  >
                    <Settings2 size={14} /> Gestion du solveur
                  </button>
                </article>
              </div>
              <div className="aero-dashboard-grid aero-dashboard-lower">
                <article className="aero-panel">
                  <div className="aero-panel-heading">
                    <div>
                      <p className="aero-eyebrow">RÉSULTATS</p>
                      <h3>Aucun résultat aérodynamique disponible</h3>
                    </div>
                    <Badge kind="locked">SOLVEUR NON RACCORDÉ</Badge>
                  </div>
                  <div className="aero-metrics-row">
                    <Metric label="Traînée" value="—" unit="N" />
                    <Metric label="Portance" value="—" unit="N" />
                    <Metric label="L / D" value="—" />
                  </div>
                  <p className="aero-fineprint">
                    Aucun coefficient supposé ni modèle simplifié ne produit de
                    résultat dans ce module.
                  </p>
                  <div className="aero-inline-actions">
                    <button
                      type="button"
                      className="aero-primary-button"
                      disabled
                    >
                      <LockKeyhole size={14} /> Calcul indisponible
                    </button>
                    <button
                      type="button"
                      className="aero-secondary-button"
                      onClick={() => setSection("setup")}
                    >
                      <SlidersHorizontal size={14} /> Saisir les conditions
                    </button>
                  </div>
                </article>
                <article className="aero-panel">
                  <div className="aero-panel-heading">
                    <div>
                      <p className="aero-eyebrow">CENTRES AEROMIND</p>
                      <h3>Échanges et validations</h3>
                    </div>
                    <ExternalLink size={17} />
                  </div>
                  <div className="aero-integration-list">
                    <span>
                      <b>PARAMETRIC</b>
                      <em>Revue manuelle · non transmise</em>
                      <button
                        type="button"
                        onClick={() => onNavigate("parametric-center")}
                      >
                        Ouvrir le centre
                      </button>
                    </span>
                    <span>
                      <b>MECANIC / ELECTRONICS</b>
                      <em>Contraintes à raccorder</em>
                      <button
                        type="button"
                        onClick={() => onNavigate("mechanical-center")}
                      >
                        Ouvrir le centre mécanique
                      </button>
                    </span>
                    <span>
                      <b>VIRTUAL FACTORY / INTELLIGENCE</b>
                      <em>Non connectés à cette vue</em>
                      <small>Pas de partage automatique</small>
                    </span>
                  </div>
                </article>
              </div>
              <div className="aero-footer-note">
                <Info size={14} /> Les exports documentent uniquement vos
                entrées non validées. Aucun rapport de résultats n’est
                disponible.
              </div>
            </>
          )}

          {section === "importer" && (
            <>
              <div className="aero-section-heading">
                <div>
                  <p className="aero-eyebrow">3D MODEL IMPORTER / GEOMETRY</p>
                  <h2>Importer et inspecter une géométrie</h2>
                  <p>
                    STL, OBJ et 3MF sont décodés localement; les fichiers
                    STEP/CAD non supportés sont reçus sans prétendre analyser
                    leur géométrie.
                  </p>
                </div>
                <Badge kind="warn">50 Mo max · local navigateur</Badge>
              </div>
              <div className="aero-import-grid">
                <article className="aero-panel aero-import-tools">
                  <div className="aero-file-drop">
                    <input
                      aria-label="Choisir un fichier 3D"
                      type="file"
                      accept=".stl,.obj,.3mf,.step,.stp,.iges,.igs,.dxf"
                      onChange={(event) =>
                        void importModel(event.target.files?.[0])
                      }
                    />
                    <Box size={22} />
                    <strong>Choisir un modèle 3D</strong>
                    <span>
                      STL · OBJ · 3MF · STEP / CAD reçus sans parseur vérifié
                    </span>
                  </div>
                  <div className="aero-field-stack">
                    <label>
                      Unité source déclarée
                      <select
                        value={lengthUnit}
                        onChange={(event) =>
                          changeLengthUnit(event.target.value)
                        }
                      >
                        <option value="mm">Millimètres (mm)</option>
                        <option value="cm">Centimètres (cm)</option>
                        <option value="m">Mètres (m)</option>
                        <option value="in">Pouces (in)</option>
                      </select>
                      <small>
                        STL/OBJ n’encodent pas nécessairement les unités;
                        vérification humaine requise. Changer l’unité met aussi
                        à jour les dimensions inspectées.
                      </small>
                    </label>
                    <label>
                      Nom de modèle
                      <input
                        value={modelName}
                        onChange={(event) => setModelName(event.target.value)}
                      />
                    </label>
                    <label>
                      Version / révision
                      <input
                        value={modelVersion}
                        onChange={(event) =>
                          setModelVersion(event.target.value)
                        }
                      />
                    </label>
                  </div>
                  {asset && (
                    <div className="aero-asset-card">
                      <div>
                        <strong>{asset.name}</strong>
                        <Badge
                          kind={asset.status === "decoded" ? "ok" : "warn"}
                        >
                          {asset.status === "decoded"
                            ? "DÉCODÉ"
                            : "REÇU · NON DÉCODÉ"}
                        </Badge>
                      </div>
                      <dl>
                        <dt>Format / taille</dt>
                        <dd>
                          {asset.extension} · {(asset.bytes / 1024).toFixed(1)}{" "}
                          Ko
                        </dd>
                        <dt>Source SHA-256</dt>
                        <dd>
                          {asset.sha256
                            ? `${asset.sha256.slice(0, 18)}…`
                            : "non calculé"}
                        </dd>
                        <dt>Unités</dt>
                        <dd>{asset.sourceUnits}</dd>
                        <dt>Sommets / triangles</dt>
                        <dd>
                          {asset.vertices.toLocaleString("fr-FR")} /{" "}
                          {asset.triangles.toLocaleString("fr-FR")}
                        </dd>
                        <dt>Triangles dégénérés détectés</dt>
                        <dd
                          className={
                            asset.degenerateTriangles ? "is-warning" : ""
                          }
                        >
                          {asset.degenerateTriangles}
                        </dd>
                        <dt>Dimensions estimées</dt>
                        <dd>
                          {asset.boundsM
                            ? `${format(asset.boundsM.x, 3)} × ${format(asset.boundsM.y, 3)} × ${format(asset.boundsM.z, 3)} m`
                            : "indisponibles"}
                        </dd>
                      </dl>
                      <p>{asset.note}</p>
                      <button
                        type="button"
                        className="aero-danger-button"
                        onClick={clearAsset}
                      >
                        <Trash2 size={13} /> Retirer du viewport
                      </button>
                    </div>
                  )}
                </article>
                <article className="aero-panel aero-import-viewport">
                  <div className="aero-panel-heading">
                    <div>
                      <p className="aero-eyebrow">INSPECTION 3D</p>
                      <h3>Viewport interactif</h3>
                    </div>
                    <span className="aero-units-chip">
                      {lengthUnit.toUpperCase()}
                    </span>
                  </div>
                  {asset?.status === "decoded" ? <ModelViewport asset={asset} unitsToMeters={unitsToMeters} onSurface={setSelectedSurface} /> : <AeromindCfdWindTunnel projectName={projectName} airframe={airframe || "fixed-wing"} />}
                  <div className="aero-inspection-status">
                    <span>
                      <i
                        className={asset?.status === "decoded" ? "is-pass" : ""}
                      />
                      {asset?.status === "decoded"
                        ? "Dimensions et triangles inspectés"
                        : "Aucune géométrie inspectée"}
                    </span>
                    <span>
                      Surface : {selectedSurface || "aucune sélection"}
                    </span>
                    <span>Fermeture, topologie et B-Rep : non vérifiés</span>
                  </div>
                </article>
              </div>
            </>
          )}

          {section === "setup" && (
            <>
              <div className="aero-section-heading">
                <div>
                  <p className="aero-eyebrow">
                    SIMULATION SETUP / BOUNDARY CONDITIONS
                  </p>
                  <h2>Conditions et paramètres physiques</h2>
                  <p>
                    Formulaire vierge : renseignez vos données. Aucune valeur du
                    cockpit n’est reprise et aucun résultat n’est calculé.
                  </p>
                </div>
                <button
                  type="button"
                  className="aero-secondary-button"
                  onClick={resetForm}
                >
                  <RefreshCw size={14} /> Vider le formulaire
                </button>
              </div>
              <div className="aero-panel aero-setup-toolbar">
                <label>
                  Architecture
                  <select
                    value={airframe}
                    onChange={(event) => {
                      setAirframe(event.target.value as AirframeKind | "");
                      setActiveScenario("");
                    }}
                  >
                    <option value="">Non renseignée</option>
                    <option value="fixed-wing">Aile fixe</option>
                    <option value="multirotor">Multirotor</option>
                    <option value="vtol">VTOL hybride</option>
                  </select>
                </label>
                <span>
                  <strong>
                    {currentScenarioName ?? "Scénario personnalisé"}
                  </strong>
                  <small>{"Saisie utilisateur · non validée"}</small>
                </span>
                <label>
                  Nom à enregistrer
                  <input
                    value={scenarioName}
                    maxLength={60}
                    placeholder="Ex. vent traversier v2"
                    onChange={(event) => setScenarioName(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="aero-primary-button"
                  onClick={saveScenario}
                >
                  <Save size={14} /> Enregistrer scénario
                </button>
              </div>
              <div className="aero-scenario-strip">
                <strong>SCÉNARIOS LOCAUX</strong>
                {scenarios.length ? (
                  scenarios.map((item) => (
                    <span key={item.id}>
                      <button type="button" onClick={() => loadScenario(item)}>
                        {item.name}
                      </button>
                      <button
                        className="aero-mini-remove"
                        title={`Supprimer ${item.name}`}
                        onClick={() => removeScenario(item.id)}
                      >
                        <Trash2 size={12} />
                      </button>
                    </span>
                  ))
                ) : (
                  <small>Aucun scénario enregistré sur cet appareil.</small>
                )}
              </div>
              <div className="aero-setup-grid">
                <article className="aero-panel">
                  <div className="aero-panel-heading">
                    <div>
                      <p className="aero-eyebrow">01 / FLOW & ATMOSPHERE</p>
                      <h3>Conditions d’écoulement</h3>
                    </div>
                    <Wind size={17} />
                  </div>
                  <div className="aero-form-grid">
                    <NumberField
                      label="Vitesse du flux"
                      value={parameters.speedMps}
                      unit="m/s"
                      min={0.1}
                      max={300}
                      step="0.1"
                      onChange={(v) => setNumber("speedMps", v)}
                    />
                    <NumberField
                      label="Direction du flux"
                      value={parameters.flowDirectionDeg}
                      unit="°"
                      min={-180}
                      max={180}
                      step="1"
                      onChange={(v) => setNumber("flowDirectionDeg", v)}
                    />
                    <NumberField
                      label="Altitude"
                      value={parameters.altitudeM}
                      unit="m"
                      min={0}
                      max={11000}
                      step="10"
                      onChange={(v) => setNumber("altitudeM", v)}
                    />
                    <NumberField
                      label="Température"
                      value={parameters.temperatureC}
                      unit="°C"
                      min={-80}
                      max={60}
                      step="0.5"
                      onChange={(v) => setNumber("temperatureC", v)}
                    />
                    <NumberField
                      label="Pression statique saisie"
                      value={parameters.pressurePa}
                      unit="Pa"
                      min={1000}
                      max={200000}
                      step="10"
                      onChange={(v) => setNumber("pressurePa", v)}
                    />
                    <label className="aero-select-field">
                      Origine de la pression
                      <select
                        value={parameters.pressureMode}
                        onChange={(event) =>
                          patch(
                            "pressureMode",
                            event.target
                              .value as AerodynamicParameters["pressureMode"],
                          )
                        }
                      >
                        <option value="">Non renseignée</option>
                        <option value="manual">
                          Pression statique manuelle
                        </option>
                        <option value="isa">
                          Référence ISA déclarée par l’utilisateur
                        </option>
                      </select>
                      <small>
                        Choix documentaire uniquement : renseignez la pression
                        vérifiée; aucun calcul ISA automatique.
                      </small>
                    </label>
                    <NumberField
                      label="Viscosité dynamique"
                      value={parameters.viscosityPaS}
                      unit="Pa·s"
                      min={0.0000001}
                      max={10}
                      step="0.000001"
                      onChange={(v) => setNumber("viscosityPaS", v)}
                    />
                    <div className="aero-derived-readout">
                      <span>Densité / solution fluide</span>
                      <strong>Indisponible</strong>
                      <small>Aucun résultat analytique calculé.</small>
                    </div>
                  </div>
                </article>
                <article className="aero-panel">
                  <div className="aero-panel-heading">
                    <div>
                      <p className="aero-eyebrow">02 / BODY & TURBULENCE</p>
                      <h3>Géométrie et modèle</h3>
                    </div>
                    <Settings2 size={17} />
                  </div>
                  <div className="aero-form-grid">
                    <NumberField
                      label="Masse de référence"
                      value={parameters.massKg}
                      unit="kg"
                      min={0.05}
                      max={10000}
                      step="0.1"
                      onChange={(v) => setNumber("massKg", v)}
                    />
                    <NumberField
                      label="Envergure"
                      value={parameters.wingspanM}
                      unit="m"
                      min={0.1}
                      max={100}
                      step="0.01"
                      onChange={(v) => setNumber("wingspanM", v)}
                    />
                    <NumberField
                      label="Corde moyenne"
                      value={parameters.chordM}
                      unit="m"
                      min={0.02}
                      max={30}
                      step="0.01"
                      onChange={(v) => setNumber("chordM", v)}
                    />
                    <NumberField
                      label="Angle d’incidence"
                      value={parameters.angleOfAttackDeg}
                      unit="°"
                      min={-20}
                      max={45}
                      step="0.5"
                      onChange={(v) => setNumber("angleOfAttackDeg", v)}
                    />
                    <NumberField
                      label="Facteur de forme / taper"
                      value={parameters.taperRatio}
                      unit="ratio"
                      min={0.01}
                      max={1}
                      step="0.01"
                      onChange={(v) => setNumber("taperRatio", v)}
                    />
                    <NumberField
                      label="CD₀ déclaré"
                      value={parameters.cd0}
                      unit="—"
                      min={0.001}
                      max={1}
                      step="0.001"
                      onChange={(v) => setNumber("cd0", v)}
                    />
                    <label className="aero-select-field">
                      Modèle de turbulence
                      <select
                        value={parameters.turbulenceModel}
                        onChange={(event) =>
                          patch(
                            "turbulenceModel",
                            event.target
                              .value as AerodynamicParameters["turbulenceModel"],
                          )
                        }
                      >
                        <option value="">Non renseigné</option>
                        <option value="laminar">Laminaire</option>
                        <option value="k-epsilon">k-ε</option>
                        <option value="k-omega-sst">k-ω SST</option>
                      </select>
                      <small>
                        Paramètre de préparation uniquement; aucun modèle de
                        turbulence n’est résolu dans cette Preview.
                      </small>
                    </label>
                    <label className="aero-select-field">
                      Type de calcul
                      <select
                        value={parameters.calculationType}
                        onChange={(event) =>
                          patch(
                            "calculationType",
                            event.target
                              .value as AerodynamicParameters["calculationType"],
                          )
                        }
                      >
                        <option value="">Non renseigné</option>
                        <option value="steady-incompressible">
                          Stationnaire incompressible
                        </option>
                        <option value="transient-incompressible">
                          Transitoire incompressible
                        </option>
                      </select>
                      <small>
                        Choix documentaire pour futur raccordement OpenFOAM.
                      </small>
                    </label>
                  </div>
                </article>
                <article className="aero-panel aero-boundary-panel">
                  <div className="aero-panel-heading">
                    <div>
                      <p className="aero-eyebrow">03 / BOUNDARY CONDITIONS</p>
                      <h3>Conditions aux limites</h3>
                    </div>
                    <Layers size={17} />
                  </div>
                  <label>
                    Entrée
                    <input
                      value={parameters.inletBoundary}
                      onChange={(event) =>
                        patch("inletBoundary", event.target.value)
                      }
                    />
                  </label>
                  <label>
                    Sortie
                    <input
                      value={parameters.outletBoundary}
                      onChange={(event) =>
                        patch("outletBoundary", event.target.value)
                      }
                    />
                  </label>
                  <p>
                    Les surfaces murales, la référence de pression, les
                    conditions thermiques et les critères de convergence devront
                    être validés avant l’exécution d’un solveur.
                  </p>
                </article>
              </div>
              <div className="aero-setup-footer">
                <Badge kind="warn">Entrées utilisateur non validées</Badge>
                <span>
                  Vos champs vides sont conservés sans valeur de remplacement.
                  Enregistrer un scénario ne lance aucun calcul.
                </span>
                <button
                  type="button"
                  className="aero-primary-button"
                  onClick={exportInputs}
                >
                  <Download size={14} /> Exporter les conditions saisies
                </button>
              </div>
            </>
          )}

          {section === "mesh" && (
            <>
              <div className="aero-section-heading">
                <div>
                  <p className="aero-eyebrow">MESH GENERATOR / PREPARATION</p>
                  <h2>Préparation du maillage</h2>
                  <p>
                    Paramètres documentaires uniquement; aucun mesher raccordé
                    ni domaine hypothétique généré.
                  </p>
                </div>
                <Badge kind="locked">AUCUN MAILLAGE CFD</Badge>
              </div>
              <div className="aero-mesh-grid">
                <article className="aero-panel">
                  <h3>Paramètres de discrétisation déclarés</h3>
                  <div className="aero-form-grid">
                    <NumberField
                      label="Cellule de référence"
                      value={parameters.meshCellSizeMm}
                      unit="mm"
                      min={0.1}
                      max={100}
                      step="0.1"
                      onChange={(v) => setNumber("meshCellSizeMm", v)}
                    />
                    <label className="aero-select-field">
                      Niveau de raffinement
                      <select
                        value={parameters.meshRefinement}
                        onChange={(event) =>
                          patch(
                            "meshRefinement",
                            event.target
                              .value as AerodynamicParameters["meshRefinement"],
                          )
                        }
                      >
                        <option value="">Non renseigné</option>
                        <option value="coarse">Grossier</option>
                        <option value="standard">Standard</option>
                        <option value="fine">Fin</option>
                      </select>
                    </label>
                  </div>
                  <button
                    type="button"
                    className="aero-primary-button"
                    disabled
                  >
                    <LockKeyhole size={14} /> Génération indisponible
                  </button>
                </article>
                <article className="aero-panel aero-mesh-result">
                  <div className="aero-empty-state">
                    <Layers size={28} />
                    <strong>Aucun maillage volumique généré</strong>
                    <span>
                      Cellules, domaine de calcul, qualité et RAM ne sont pas
                      estimés. Les triangles du fichier importé ne sont pas un
                      maillage CFD.
                    </span>
                    <button
                      type="button"
                      className="aero-secondary-button"
                      onClick={() => setSection("importer")}
                    >
                      Inspecter la géométrie source
                    </button>
                  </div>
                </article>
              </div>
            </>
          )}

          {section === "cfd" && (
            <>
              <div className="aero-section-heading">
                <div>
                  <p className="aero-eyebrow">CFD WORKSPACE / SOLVER HANDOFF</p>
                  <h2>Préparer un cas CFD</h2>
                  <p>
                    Renseignez les paramètres avant un export documentaire.
                    Aucun solveur OpenFOAM n’est raccordé à ce module.
                  </p>
                </div>
                <Badge kind="locked">RUNTIME ABSENT</Badge>
              </div>
              <div className="aero-cfd-warning">
                <LockKeyhole size={20} />
                <div>
                  <strong>
                    Calcul CFD indisponible — aucune tâche n’a été créée
                  </strong>
                  <p>
                    Aucun exécutable OpenFOAM ni endpoint solver documenté n’est
                    configuré. Le lancement reste désactivé; aucune détection de
                    runtime ni progression fictive n’est simulée.
                  </p>
                </div>
              </div>
              <div className="aero-cfd-action-grid">
                <article className="aero-panel">
                  <p className="aero-eyebrow">01 / CONDITIONS PRÉPARÉES</p>
                  <h3>
                    {modelName} · {modelVersion}
                  </h3>
                  <dl className="aero-key-values">
                    <dt>Modèle</dt>
                    <dd>{airframe || "non renseignée"}</dd>
                    <dt>Écoulement</dt>
                    <dd>
                      {format(parameters.speedMps, 2)} m/s ·{" "}
                      {format(parameters.flowDirectionDeg, 1)}°
                    </dd>
                    <dt>Fluide</dt>
                    <dd>
                      μ {format(parameters.viscosityPaS, 6)} Pa·s · densité non
                      calculée
                    </dd>
                    <dt>Turbulence demandée</dt>
                    <dd>{parameters.turbulenceModel || "non renseigné"}</dd>
                    <dt>Type</dt>
                    <dd>{parameters.calculationType || "non renseigné"}</dd>
                    <dt>Géométrie</dt>
                    <dd>
                      {asset?.name ?? "absente"} ·{" "}
                      {asset?.status === "decoded" ? "décodée" : "non décodée"}
                    </dd>
                    <dt>Maillage</dt>
                    <dd>non généré</dd>
                    <dt>Convergence</dt>
                    <dd>non applicable</dd>
                  </dl>
                  <div className="aero-inline-actions">
                    <button
                      type="button"
                      className="aero-secondary-button"
                      onClick={checkSolver}
                    >
                      <RefreshCw size={14} /> Afficher les préconditions
                    </button>
                    <button
                      type="button"
                      className="aero-primary-button"
                      onClick={exportManifest}
                    >
                      <Download size={14} /> Exporter le manifeste
                    </button>
                  </div>
                </article>
                <article className="aero-panel">
                  <p className="aero-eyebrow">02 / RUN CONTROL</p>
                  <h3>Gestion de tâche de calcul</h3>
                  <div className="aero-run-gate">
                    <span className="aero-gate-step">
                      1 <small>Entrées locales</small>
                    </span>
                    <i />
                    <span className="aero-gate-step is-blocked">
                      2 <small>Solvabilité</small>
                    </span>
                    <i />
                    <span className="aero-gate-step">
                      3 <small>Maillage</small>
                    </span>
                    <i />
                    <span className="aero-gate-step">
                      4 <small>Convergence</small>
                    </span>
                  </div>
                  <button
                    type="button"
                    className="aero-disabled-explained"
                    disabled
                  >
                    <LockKeyhole size={15} /> Démarrer un calcul CFD{" "}
                    <small>Action refusée — aucun solveur disponible</small>
                  </button>
                  <p className="aero-fineprint">
                    Aucune ressource, durée, tâche ou convergence n’est
                    inventée. Le manifeste est un handoff documentaire, pas un
                    cas OpenFOAM runnable.
                  </p>
                </article>
              </div>
              <div className="aero-footer-note">
                <AlertTriangle size={14} /> Pour activer un calcul réel
                ultérieurement : installer/mettre à disposition OpenFOAM dans un
                runtime autorisé, définir un contrat de version, de sécurité et
                de traitement, puis ajouter validation de géométrie, exécution,
                convergence et extraction des champs.
              </div>
            </>
          )}

          {section === "airflow" && (
            <>
              <div className="aero-section-heading">
                <div>
                  <p className="aero-eyebrow">
                    AIRFLOW VISUALIZATION / FIELD DATA
                  </p>
                  <h2>Visualisation des écoulements</h2>
                  <p>
                    Choisissez une couche de résultat. Les vues de champ
                    attendent un jeu de données CFD réel.
                  </p>
                </div>
                <Badge kind="locked">AUCUN CHAMP CFD</Badge>
              </div>
              <div className="aero-mode-bar">
                {flowModes.map((mode) => (
                  <button
                    type="button"
                    key={mode}
                    className={flowMode === mode ? "is-active" : ""}
                    onClick={() => {
                      setFlowMode(mode);
                      setFlowTouched(true);
                    }}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <div className="aero-panel aero-flow-panel">
                <div className="aero-panel-heading">
                  <div>
                    <p className="aero-eyebrow">DISPLAY MODE</p>
                    <h3>{flowMode}</h3>
                  </div>
                  <Badge kind="warn">EN ATTENTE DE DONNÉES DE SOLVEUR</Badge>
                </div>
                <div className="aero-flow-empty">
                  <div className="aero-flow-axis">
                    <span>INLET</span>
                    <i />
                    <b>{asset?.name ?? "Géométrie non chargée"}</b>
                    <i />
                    <span>OUTLET</span>
                  </div>
                  <strong>
                    {"Aucun champ de vitesse/pression/turbulence disponible"}
                  </strong>
                  <p>
                    {flowMode === "Cross Sections"
                      ? "Les coupes de section exigent des champs de solution; aucune coupe numérique n’est fabriquée ici."
                      : flowMode === "Streamlines"
                        ? "Les lignes de courant seront rendues uniquement à partir de vecteurs de vitesse provenant d’un calcul vérifiable."
                        : "Ce schéma de domaine est une aide de préparation, pas une visualisation d’écoulement calculée."}
                  </p>
                  <div className="aero-flow-legend">
                    <span>
                      <i className="is-cyan" /> Géométrie / données importées
                    </span>
                    <span>
                      <i className="is-empty" /> Champ de solution indisponible
                    </span>
                  </div>
                </div>
                <div className="aero-inline-actions">
                  <button
                    type="button"
                    className="aero-secondary-button"
                    onClick={() => setSection("cfd")}
                  >
                    <Wind size={14} /> Préparer le calcul
                  </button>
                  <span>
                    {flowTouched
                      ? `Mode actif : ${flowMode}`
                      : "Pas d’animation CFD"}
                  </span>
                </div>
              </div>
            </>
          )}

          {section === "pressure" && (
            <>
              <div className="aero-section-heading">
                <div>
                  <p className="aero-eyebrow">
                    PRESSURE ANALYSIS / SURFACE FIELDS
                  </p>
                  <h2>Analyse de pression</h2>
                  <p>
                    Pression ambiante à saisir; distribution de pression
                    surfacique absente sans solveur.
                  </p>
                </div>
                <Badge kind="warn">PAS DE CARTE SURFACIQUE</Badge>
              </div>
              <div className="aero-panel aero-pressure-grid">
                <div>
                  <p className="aero-eyebrow">CONDITION AMBIANTE</p>
                  <strong>{format(parameters.pressurePa, 1)} Pa</strong>
                  <span>Pression statique saisie</span>
                </div>
                <div>
                  <p className="aero-eyebrow">PRESSION DYNAMIQUE</p>
                  <strong>— Pa</strong>
                  <span>Aucun résultat calculé</span>
                </div>
                <div>
                  <p className="aero-eyebrow">PRESSION SURFACE / Cp</p>
                  <strong>INCONNUE</strong>
                  <span>Requires a converged CFD field</span>
                </div>
              </div>
              <article className="aero-panel aero-empty-section">
                <Gauge size={26} />
                <h3>Les champs de pression ne sont pas disponibles</h3>
                <p>
                  La pression d’entrée saisie ne permet pas d’inférer une carte
                  de pression sur la surface. Les coefficients Cp, séparations
                  et gradients resteront vides jusqu’à un calcul réel.
                </p>
                <button
                  type="button"
                  className="aero-secondary-button"
                  onClick={() => setSection("solver")}
                >
                  <Settings2 size={14} /> Voir les préconditions du solveur
                </button>
              </article>
            </>
          )}

          {section === "rotor" && (
            <>
              <div className="aero-section-heading">
                <div>
                  <p className="aero-eyebrow">
                    ROTOR FLOW ANALYSIS / USER INPUTS
                  </p>
                  <h2>Rotor & propulsion</h2>
                  <p>
                    Saisissez la configuration réelle de vos rotors; aucune
                    puissance ni interaction n’est calculée.
                  </p>
                </div>
                <Badge kind="locked">AUCUN RÉSULTAT ROTOR</Badge>
              </div>
              <div className="aero-panel aero-rotor-grid">
                <div>
                  <h3>Configuration déclarée</h3>
                  <div className="aero-form-grid">
                    <NumberField
                      label="Nombre de rotors"
                      value={parameters.rotorCount}
                      unit="rotors"
                      min={1}
                      max={32}
                      step="1"
                      onChange={(v) => setNumber("rotorCount", v)}
                    />
                    <NumberField
                      label="Diamètre de rotor"
                      value={parameters.rotorDiameterM}
                      unit="m"
                      min={0.01}
                      max={10}
                      step="0.01"
                      onChange={(v) => setNumber("rotorDiameterM", v)}
                    />
                    <NumberField
                      label="Masse totale"
                      value={parameters.massKg}
                      unit="kg"
                      min={0.05}
                      max={10000}
                      step="0.1"
                      onChange={(v) => setNumber("massKg", v)}
                    />
                  </div>
                </div>
                <div className="aero-empty-state">
                  <Wind size={28} />
                  <strong>Puissance et champs rotor indisponibles</strong>
                  <span>
                    Aucun disque actuateur simplifié, sillage ou résultat
                    artificiel. Des données vérifiables et un solveur raccordé
                    seraient nécessaires.
                  </span>
                </div>
              </div>
            </>
          )}

          {section === "comparison" && (
            <>
              <div className="aero-section-heading">
                <div>
                  <p className="aero-eyebrow">COMPARISON / USER SCENARIOS</p>
                  <h2>Comparer les entrées de configurations</h2>
                  <p>
                    Comparaison des seules valeurs saisies et enregistrées, sans
                    évaluation de performance.
                  </p>
                </div>
                <button
                  type="button"
                  className="aero-secondary-button"
                  onClick={() => setSection("setup")}
                >
                  <Plus size={14} /> Ajouter une variante
                </button>
              </div>
              <div className="aero-panel">
                <div className="aero-panel-heading">
                  <h3>Scénarios utilisateur versionnés</h3>
                  <Badge>{scenarios.length} scénario(s)</Badge>
                </div>
                {scenarios.length ? (
                  <div className="aero-compare-table-wrap">
                    <table className="aero-compare-table">
                      <thead>
                        <tr>
                          <th>Variante</th>
                          <th>Architecture</th>
                          <th>Vitesse m/s</th>
                          <th>Pression Pa</th>
                          <th>Provenance</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scenarios.map((item) => (
                          <tr key={item.id}>
                            <td>
                              <strong>{item.name}</strong>
                              <small>
                                {new Date(item.createdAt).toLocaleString(
                                  "fr-FR",
                                )}
                              </small>
                            </td>
                            <td>{item.airframe || "—"}</td>
                            <td>{format(item.parameters.speedMps, 1)}</td>
                            <td>{format(item.parameters.pressurePa, 1)}</td>
                            <td>
                              <Badge>Saisie utilisateur v2</Badge>
                            </td>
                            <td>
                              <button
                                type="button"
                                onClick={() => setComparisonScenario(item)}
                              >
                                Charger
                              </button>
                              <button
                                type="button"
                                onClick={() => removeScenario(item.id)}
                                aria-label={`Supprimer ${item.name}`}
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="aero-empty-state">
                    <ClipboardList size={26} />
                    <strong>Aucune variante utilisateur sauvegardée</strong>
                    <span>
                      Les scénarios hérités sans provenance vérifiable ne sont
                      pas repris.
                    </span>
                    <button
                      type="button"
                      className="aero-primary-button"
                      onClick={() => setSection("setup")}
                    >
                      Saisir un scénario
                    </button>
                  </div>
                )}
              </div>
              <div className="aero-panel aero-empty-state">
                <strong>Aucune comparaison de performance disponible</strong>
                <span>
                  Portance, traînée, puissance et efficacité restent inconnues
                  sans données de résultats vérifiées.
                </span>
              </div>
            </>
          )}

          {section === "optimization" && (
            <>
              <div className="aero-section-heading">
                <div>
                  <p className="aero-eyebrow">DESIGN REVIEW / PREPARATION</p>
                  <h2>Préparer une revue de conception</h2>
                  <p>
                    Aucune recommandation issue de coefficients supposés ni
                    optimisation automatique.
                  </p>
                </div>
                <Badge kind="locked">AUCUNE OPTIMISATION CALCULÉE</Badge>
              </div>
              <article className="aero-panel aero-empty-state">
                <Wrench size={26} />
                <h3>Résultats requis pour une revue aérodynamique</h3>
                <p>
                  Confirmez les unités et la géométrie importée, puis rassemblez
                  des conditions et mesures traçables. Les échanges entre
                  centres restent manuels; aucune variante n’est inventée ni
                  transmise.
                </p>
                <div className="aero-inline-actions">
                  <button
                    type="button"
                    className="aero-primary-button"
                    onClick={exportInputs}
                  >
                    <Download size={14} /> Exporter les conditions saisies
                  </button>
                  <button
                    type="button"
                    className="aero-secondary-button"
                    onClick={() => onNavigate("parametric-center")}
                  >
                    <ExternalLink size={14} /> Ouvrir le Centre PARAMETRIC
                  </button>
                </div>
              </article>
            </>
          )}

          {section === "history" && (
            <>
              <div className="aero-section-heading">
                <div>
                  <p className="aero-eyebrow">
                    SIMULATION HISTORY / VERIFIED DATA
                  </p>
                  <h2>Historique des simulations</h2>
                  <p>
                    Aucun historique de résultats vérifié n’est raccordé à cette
                    vue.
                  </p>
                </div>
                <button
                  type="button"
                  className="aero-secondary-button"
                  disabled
                >
                  <Download size={14} /> Export de résultats indisponible
                </button>
              </div>
              <div className="aero-panel aero-empty-state">
                <ClipboardList size={28} />
                <strong>Aucune simulation CFD disponible</strong>
                <span>
                  Les anciens résultats explicitement analytiques ont été
                  purgés. Les autres enregistrements historiques restent
                  conservés dans le stockage, sans être présentés comme
                  résultats vérifiés ni exportés.
                </span>
                <button
                  type="button"
                  className="aero-primary-button"
                  onClick={() => setSection("setup")}
                >
                  Préparer des conditions
                </button>
              </div>
            </>
          )}

          {section === "reports" && (
            <>
              <div className="aero-section-heading">
                <div>
                  <p className="aero-eyebrow">
                    TECHNICAL REPORTS / PREPARATION ONLY
                  </p>
                  <h2>Documents de préparation</h2>
                  <p>
                    Exportez uniquement vos conditions saisies. Aucun rapport de
                    résultat artificiel n’est créé.
                  </p>
                </div>
                <Badge kind="locked">AUCUN RAPPORT DE RÉSULTATS</Badge>
              </div>
              <div className="aero-panel aero-report-panel">
                <div className="aero-empty-state">
                  <FileText size={28} />
                  <strong>Aucun résultat à rapporter</strong>
                  <span>
                    Pas de solveur CFD raccordé, pas de maillage ni convergence
                    vérifiée. Les exports ci-dessous sont des documents
                    d’entrées non validées, pas des rapports de calcul.
                  </span>
                </div>
                <div className="aero-inline-actions">
                  <button
                    type="button"
                    className="aero-primary-button"
                    onClick={exportInputs}
                    disabled={!hasUserInputs(airframe, parameters)}
                  >
                    <Download size={14} /> Exporter les conditions saisies
                  </button>
                  <button
                    type="button"
                    className="aero-secondary-button"
                    onClick={exportManifest}
                    disabled={!hasUserInputs(airframe, parameters)}
                  >
                    <FileText size={14} /> Exporter la préparation OpenFOAM
                  </button>
                </div>
              </div>
            </>
          )}

          {section === "solver" && (
            <>
              <div className="aero-section-heading">
                <div>
                  <p className="aero-eyebrow">
                    SOLVER MANAGEMENT / RUNTIME STATUS
                  </p>
                  <h2>Gestionnaire de solveur</h2>
                  <p>
                    Disponibilité, contrat de raccordement et capacité de
                    calcul.
                  </p>
                </div>
                <Badge kind="locked">SOLVEUR NON RACCORDÉ</Badge>
              </div>
              <div className="aero-solver-grid">
                <article className="aero-panel aero-solver-status">
                  <div className="aero-solver-orb is-large">
                    <Wind size={24} />
                    <span>OFFLINE</span>
                  </div>
                  <h3>OpenFOAM · non raccordé</h3>
                  <p>
                    Aucune intégration OpenFOAM, détection de binaire ou
                    connexion à un service CFD n’est implémentée dans ce module.
                    Ce panneau décrit les préconditions, sans interroger un
                    runtime.
                  </p>
                  <dl className="aero-key-values">
                    <dt>Exécutable</dt>
                    <dd>non raccordé / non détecté par ce module</dd>
                    <dt>Version vérifiée</dt>
                    <dd>indisponible</dd>
                    <dt>Service distant</dt>
                    <dd>non configuré</dd>
                    <dt>Ressources CPU/RAM</dt>
                    <dd>non réservées</dd>
                    <dt>Queue de calcul</dt>
                    <dd>aucune tâche</dd>
                    <dt>Run CFD</dt>
                    <dd>aucun</dd>
                  </dl>
                  <button
                    type="button"
                    className="aero-primary-button"
                    onClick={checkSolver}
                  >
                    <RefreshCw size={14} /> Afficher les préconditions
                  </button>
                </article>
                <article className="aero-panel">
                  <p className="aero-eyebrow">
                    CONTRAT POUR RACCORDEMENT FUTUR
                  </p>
                  <h3>Préconditions à documenter</h3>
                  <ol className="aero-checklist">
                    <li>Version OpenFOAM et solveur cible nommés</li>
                    <li>
                      Environnement de calcul isolé et limites de ressources
                    </li>
                    <li>
                      Validateur d’entrée, formats et limites géométriques
                    </li>
                    <li>État de tâche, journal, arrêt et gestion d’échec</li>
                    <li>
                      Extraction de convergence et données de champs provenance
                    </li>
                    <li>Hypothèses et limites présentes dans chaque rapport</li>
                  </ol>
                  <p className="aero-fineprint">
                    Ce checklist prépare l’intégration mais n’active pas un
                    backend CFD.
                  </p>
                </article>
              </div>
            </>
          )}

          {section === "settings" && (
            <>
              <div className="aero-section-heading">
                <div>
                  <p className="aero-eyebrow">SETTINGS / PROVENANCE</p>
                  <h2>Paramètres de travail</h2>
                  <p>
                    Ces réglages sont locaux au workspace; les données source et
                    le projet ne sont pas modifiés implicitement.
                  </p>
                </div>
                <Settings2 size={18} />
              </div>
              <div className="aero-panel aero-settings-grid">
                <label>
                  Unité de longueur
                  <select
                    value={lengthUnit}
                    onChange={(event) => changeLengthUnit(event.target.value)}
                  >
                    <option value="mm">mm</option>
                    <option value="cm">cm</option>
                    <option value="m">m</option>
                    <option value="in">in</option>
                  </select>
                  <small>
                    Valeur choisie pour interpréter STL/OBJ/3MF; les unités
                    source restent à vérifier.
                  </small>
                </label>
                <label>
                  Nom du modèle
                  <input
                    value={modelName}
                    onChange={(event) => setModelName(event.target.value)}
                  />
                </label>
                <label>
                  Version / révision
                  <input
                    value={modelVersion}
                    onChange={(event) => setModelVersion(event.target.value)}
                  />
                </label>
                <div>
                  <span>Persistances</span>
                  <strong>Scénarios utilisateur v2 dans localStorage</strong>
                  <small>
                    Les scénarios hérités ambigus sont conservés sous
                    aeromind-legacy-user-scenarios-review-v1 pour revue, exclus
                    des vues et exports. Effacer les scénarios actifs ne
                    supprime pas cette quarantaine. Pas de synchronisation
                    serveur.
                  </small>
                </div>
                <div>
                  <span>Protection physique</span>
                  <strong>virtual_only · contrôle matériel désactivé</strong>
                  <small>
                    Ce module n’émet aucune commande vers drone, rotor ou banc
                    matériel.
                  </small>
                </div>
                <button
                  type="button"
                  className="aero-danger-button"
                  onClick={() => {
                    setScenarios([]);
                    setNotice(
                      "Scénarios utilisateur locaux supprimés. Les autres données historiques n’ont pas été effacées.",
                    );
                  }}
                >
                  <Trash2 size={14} /> Effacer mes scénarios locaux
                </button>
              </div>
            </>
          )}

          <div className="aero-workspace-bottom">
            <span>
              <i /> Aeromind /{" "}
              {sections.find((item) => item.id === section)?.label}
            </span>
            <span>
              <ShieldCheck size={13} /> Aucune commande matérielle · aucun
              calcul CFD déclaré
            </span>
          </div>
        </section>
      </div>
    </main>
  );
}
