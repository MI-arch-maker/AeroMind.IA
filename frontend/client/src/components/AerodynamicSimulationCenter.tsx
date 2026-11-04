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
  AERODYNAMIC_HISTORY_KEY,
  AERODYNAMIC_SCENARIOS_KEY,
  calculateAirDensity,
  createLocalRun,
  defaultAerodynamicParameters,
  estimateAerodynamicPerformance,
  estimateMeshWork,
  makeOpenFoamHandoff,
  reportMarkdown,
  type AerodynamicParameters,
  type AirframeKind,
  type LocalRun,
  type LocalScenario,
} from "../lib/aerodynamicWorkspace";
import { standardAtmospherePressurePa } from "../lib/fixedWingAerodynamics";
import "./aerodynamic-simulation-center.css";

type ViewId = "parametric-center" | "mechanical-center";
type Props = {
  config: ConceptConfig;
  projectName: string;
  onNavigate: (view: ViewId) => void;
};
type SectionId =
  | "dashboard" | "importer" | "setup" | "mesh" | "cfd" | "airflow"
  | "pressure" | "rotor" | "comparison" | "optimization" | "history"
  | "reports" | "solver" | "settings";
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

const sections: Array<{ id: SectionId; label: string; short: string; icon: typeof Activity }> = [
  { id: "dashboard", label: "Aerodynamic Dashboard", short: "Overview", icon: Activity },
  { id: "importer", label: "3D Model Importer", short: "3D Model", icon: Box },
  { id: "cfd", label: "CFD Workspace", short: "CFD", icon: Wind },
  { id: "setup", label: "Simulation Setup", short: "Conditions", icon: SlidersHorizontal },
  { id: "mesh", label: "Mesh Generator", short: "Mesh", icon: Layers },
  { id: "airflow", label: "Airflow Visualization", short: "Airflow", icon: Wind },
  { id: "pressure", label: "Pressure Analysis", short: "Pressure", icon: Gauge },
  { id: "rotor", label: "Rotor Flow Analysis", short: "Rotor flow", icon: Activity },
  { id: "comparison", label: "Performance Comparison", short: "Compare", icon: ArrowDownToLine },
  { id: "optimization", label: "Design Optimization", short: "Optimize", icon: Wrench },
  { id: "history", label: "Simulation History", short: "History", icon: ClipboardList },
  { id: "reports", label: "Technical Reports", short: "Reports", icon: FileText },
  { id: "solver", label: "Solver Management", short: "Solver", icon: Settings2 },
  { id: "settings", label: "Settings", short: "Settings", icon: Settings2 },
];
const flowModes = ["3D Flow", "Pressure Map", "Velocity Map", "Streamlines", "Cross Sections", "Comparative View"] as const;
type FlowMode = typeof flowModes[number];
const STORAGE_FALLBACK = "Stockage local indisponible dans ce navigateur.";
const maxFileSize = 50 * 1024 * 1024;

function safeRead<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}
function downloadFile(filename: string, contents: string, contentType = "application/json") {
  const url = URL.createObjectURL(new Blob([contents], { type: contentType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function safeFilename(value: string) {
  return value.trim().replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "aeromind";
}
function format(value: number | undefined, digits = 2) {
  return value === undefined || !Number.isFinite(value)
    ? "—"
    : new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
}
function getExtension(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}
async function sha256(file: File): Promise<string | undefined> {
  try {
    if (!globalThis.crypto?.subtle) return undefined;
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
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
  object.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    const geometry = child.geometry;
    const positions = geometry.getAttribute("position");
    if (!positions) return;
    vertices += positions.count;
    const count = geometry.index?.count ?? positions.count;
    const start = geometry.drawRange.start;
    const end = Math.min(count, Number.isFinite(geometry.drawRange.count) ? start + geometry.drawRange.count : count);
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
    boundsM: { x: size.x * unitsToMeters, y: size.y * unitsToMeters, z: size.z * unitsToMeters },
  };
}

function ModelViewport({ asset, unitsToMeters, onSurface }: { asset: ModelAsset | null; unitsToMeters: number; onSurface: (surface: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const modelRef = useRef<THREE.Object3D | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const [renderError, setRenderError] = useState("");
  const [renderStatus, setRenderStatus] = useState("Initialisation du viewport WebGL…");
  const [retryRenderer, setRetryRenderer] = useState(0);
  const [rendererFailed, setRendererFailed] = useState(false);
  const [surface, setSurface] = useState("");

  useEffect(() => {
    const node = host.current;
    if (!node) return;

    let disposed = false;
    let releaseSlot: (() => void) | null = null;
    let cleanupRenderer: (() => void) | null = null;
    setRenderError("");
    setRendererFailed(false);
    setRenderStatus("En attente d’un créneau WebGL…");

    const cancelReservation = reserveWebGLCanvas(release => {
      if (disposed) {
        release();
        return;
      }
      releaseSlot = release;
      setRenderStatus("Initialisation du renderer WebGL…");

      let renderer: THREE.WebGLRenderer;
      let canvas: HTMLCanvasElement;
      let context: WebGL2RenderingContext | null = null;
      try {
        canvas = document.createElement("canvas");
        context = canvas.getContext("webgl2", {
          alpha: false,
          antialias: true,
          depth: true,
          powerPreference: "high-performance",
          failIfMajorPerformanceCaveat: false,
          preserveDrawingBuffer: false,
        });
        if (!context) throw new Error("Contexte WebGL2 indisponible");
        renderer = new THREE.WebGLRenderer({
          canvas,
          context,
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
          failIfMajorPerformanceCaveat: false,
        });
      } catch (error) {
        context?.getExtension("WEBGL_lose_context")?.loseContext();
        releaseSlot?.();
        releaseSlot = null;
        const detail = error instanceof Error ? ` (${error.message})` : "";
        setRenderStatus("");
        setRenderError(`WebGL 2 est obligatoire pour ce viewport, mais le navigateur n’a pas accordé de contexte${detail}. Activez WebGL / l’accélération matérielle, fermez d’autres vues 3D, puis réessayez.`);
        setRendererFailed(true);
        return;
      }

      rendererRef.current = renderer;
      setRenderStatus("");
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const initialWidth = node.clientWidth || 640;
      const initialHeight = node.clientHeight || 400;
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(initialWidth, initialHeight);
      canvas.dataset.renderer = "webgl";
      node.replaceChildren(canvas);
      canvas.setAttribute("aria-label", "Viewport 3D WebGL interactif; glisser pour tourner, molette pour zoomer, clic pour sélectionner une face");

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x071216);
      const camera = new THREE.PerspectiveCamera(42, initialWidth / initialHeight, 0.01, 10_000);
      camera.position.set(3.8, 2.8, 4.8);
      cameraRef.current = camera;
      scene.add(new THREE.HemisphereLight(0xb7f6f2, 0x132128, 2.2));
      const key = new THREE.DirectionalLight(0xffffff, 3.0);
      key.position.set(4, 8, 5);
      scene.add(key);
      const fill = new THREE.DirectionalLight(0x59c6c1, 1.1);
      fill.position.set(-5, 2, -4);
      scene.add(fill);
      const grid = new THREE.GridHelper(8, 24, 0x376169, 0x1b3238);
      grid.position.y = -1.45;
      scene.add(grid);
      const axes = new THREE.AxesHelper(0.8);
      axes.position.set(-3.4, -1.42, -3.1);
      scene.add(axes);
      const controls = new OrbitControls(camera, canvas);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.screenSpacePanning = true;
      controlsRef.current = controls;

      const observer = new ResizeObserver(entries => {
        const rect = entries[0]?.contentRect;
        if (!rect || !rect.width || !rect.height) return;
        renderer.setSize(rect.width, rect.height);
        camera.aspect = rect.width / rect.height;
        camera.updateProjectionMatrix();
      });
      observer.observe(node);
      let frame = 0;
      let contextLost = false;
      const handleContextLost = (event: Event) => {
        event.preventDefault();
        contextLost = true;
        window.cancelAnimationFrame(frame);
        setRenderStatus("Contexte WebGL2 interrompu — récupération en cours…");
        setRenderError("Le contexte WebGL2 a été interrompu par le navigateur. Le viewport va être recréé sans basculer vers un rendu 2D.");
        setRendererFailed(true);
      };
      const handleContextRestored = () => {
        if (disposed) return;
        setRenderError("");
        setRendererFailed(false);
        setRenderStatus("Contexte WebGL2 récupéré — reconstruction du viewport…");
        window.setTimeout(() => {
          if (!disposed) setRetryRenderer(value => value + 1);
        }, 0);
      };
      canvas.addEventListener("webglcontextlost", handleContextLost, false);
      canvas.addEventListener("webglcontextrestored", handleContextRestored, false);
      const animate = () => {
        if (contextLost || disposed) return;
        frame = window.requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      };
      frame = window.requestAnimationFrame(animate);

      const selectSurface = (event: MouseEvent) => {
        if (!modelRef.current) return;
        const rect = canvas.getBoundingClientRect();
        const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObject(modelRef.current, true)[0];
        if (!hit) return;
        const name = hit.faceIndex == null ? "Surface sélectionnée" : `Face maillage ${hit.faceIndex + 1}`;
        setSurface(name);
        onSurface(name);
      };
      canvas.addEventListener("dblclick", selectSurface);
      const previousAsset = modelRef.current;
      if (previousAsset) scene.remove(previousAsset);
      if (asset?.status === "decoded" && asset.object) {
        const object = asset.object.clone(true);
        const wrapper = new THREE.Group();
        wrapper.add(object);
        wrapper.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(wrapper);
        const center = box.getCenter(new THREE.Vector3());
        wrapper.position.sub(center);
        wrapper.scale.setScalar(unitsToMeters);
        const scaledSize = box.getSize(new THREE.Vector3()).multiplyScalar(unitsToMeters);
        const biggest = Math.max(scaledSize.x, scaledSize.y, scaledSize.z, 0.01);
        wrapper.scale.multiplyScalar(3.2 / biggest);
        wrapper.traverse(child => {
          if (!(child instanceof THREE.Mesh)) return;
          child.material = new THREE.MeshStandardMaterial({
            color: 0x71d8d3,
            metalness: 0.34,
            roughness: 0.42,
            side: THREE.DoubleSide,
          });
          child.geometry.computeVertexNormals();
        });
        modelRef.current = wrapper;
        scene.add(wrapper);
        controls.target.set(0, 0, 0);
        camera.position.set(3.8, 2.8, 4.8);
        camera.lookAt(0, 0, 0);
        controls.update();
        setSurface("");
      } else {
        modelRef.current = null;
      }

      cleanupRenderer = () => {
        window.cancelAnimationFrame(frame);
        observer.disconnect();
        canvas.removeEventListener("dblclick", selectSurface);
        canvas.removeEventListener("webglcontextlost", handleContextLost);
        canvas.removeEventListener("webglcontextrestored", handleContextRestored);
        controls.dispose();
        renderer.dispose();
        rendererRef.current = null;
        controlsRef.current = null;
        cameraRef.current = null;
        modelRef.current = null;
        node.replaceChildren();
      };
    });

    return () => {
      disposed = true;
      cleanupRenderer?.();
      cancelReservation();
      releaseSlot?.();
      releaseSlot = null;
    };
  }, [asset, unitsToMeters, onSurface, retryRenderer]);

  const reset = () => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    camera.position.set(3.8, 2.8, 4.8);
    controls.target.set(0, 0, 0);
    controls.update();
    setSurface("");
    onSurface("");
  };
  return <div className="aero-viewport-shell" data-renderer="webgl-required">
    <div className="aero-viewport" ref={host} />
    {!asset?.object && <div className="aero-viewport-empty"><Box size={28} /><strong>{asset?.status === "received-not-decoded" ? "Fichier reçu — géométrie non décodée" : "Aucune géométrie inspectée"}</strong><span>{asset?.note ?? "Importez un fichier STL, OBJ ou 3MF pour ouvrir un viewport 3D interactif."}</span></div>}
    {renderStatus && <div className="aero-viewport-waiting" role="status">{renderStatus}</div>}
    {renderError && <div className="aero-viewport-error" role="alert">{renderError}{rendererFailed && <button type="button" onClick={() => setRetryRenderer(value => value + 1)}>Réessayer WebGL</button>}</div>}
    <div className="aero-viewport-tools"><span><Move3d size={13} /> Glisser : orbite · molette : zoom · clic droit : pan · double-clic : sélectionner une face</span><button type="button" onClick={reset}><RotateCcw size={13} /> Réinitialiser la vue</button></div>
    {surface && <div className="aero-surface-selected" role="status">Sélection géométrique : <strong>{surface}</strong></div>}
  </div>;
}

function NumberField({ label, value, unit, step = "any", min, max, onChange }: {
  label: string; value: number; unit: string; step?: string; min?: number; max?: number; onChange: (value: string) => void;
}) {
  return <label className="aero-number-field"><span>{label}</span><div><input type="number" step={step} min={min} max={max} value={Number.isFinite(value) ? value : ""} onChange={event => onChange(event.target.value)} /><small>{unit}</small></div></label>;
}
function Badge({ kind = "info", children }: { kind?: "info" | "warn" | "ok" | "locked"; children: React.ReactNode }) {
  return <span className={`aero-badge is-${kind}`}>{kind === "locked" ? <LockKeyhole size={12} /> : kind === "warn" ? <AlertTriangle size={12} /> : kind === "ok" ? <CheckCircle2 size={12} /> : <Info size={12} />}{children}</span>;
}
function Metric({ label, value, unit, note }: { label: string; value: string; unit?: string; note?: string }) {
  return <article className="aero-metric"><span>{label}</span><strong>{value}{unit && <small> {unit}</small>}</strong>{note && <small className="aero-metric-note">{note}</small>}</article>;
}

export function AerodynamicSimulationCenter({ config, projectName, onNavigate }: Props) {
  const initial = useMemo(() => defaultAerodynamicParameters(config), [config]);
  const [section, setSection] = useState<SectionId>("dashboard");
  const [airframe, setAirframe] = useState<AirframeKind>(initial.airframe);
  const [parameters, setParameters] = useState<AerodynamicParameters>(initial.parameters);
  const [demoValues, setDemoValues] = useState(initial.isDemonstration);
  const [modelName, setModelName] = useState(config.designName || projectName || "Modèle AeroMind");
  const [modelVersion, setModelVersion] = useState("Brouillon local");
  const [asset, setAsset] = useState<ModelAsset | null>(null);
  const [lengthUnit, setLengthUnit] = useState("mm");
  const [selectedSurface, setSelectedSurface] = useState("");
  const [scenarios, setScenarios] = useState<LocalScenario[]>(() => safeRead(AERODYNAMIC_SCENARIOS_KEY, []));
  const [history, setHistory] = useState<LocalRun[]>(() => safeRead(AERODYNAMIC_HISTORY_KEY, []));
  const [scenarioName, setScenarioName] = useState("");
  const [activeScenario, setActiveScenario] = useState("");
  const [flowMode, setFlowMode] = useState<FlowMode>("3D Flow");
  const [meshEstimate, setMeshEstimate] = useState<ReturnType<typeof estimateMeshWork>>(null);
  const [latestRun, setLatestRun] = useState<LocalRun | null>(null);
  const [notice, setNotice] = useState("");
  const [flowTouched, setFlowTouched] = useState(false);
  const [meshBusy, setMeshBusy] = useState(false);
  const performance = useMemo(() => estimateAerodynamicPerformance(airframe, parameters), [airframe, parameters]);
  const unitsToMeters = lengthUnit === "mm" ? 0.001 : lengthUnit === "cm" ? 0.01 : lengthUnit === "in" ? 0.0254 : 1;
  const density = calculateAirDensity(parameters.pressurePa, parameters.temperatureC);
  const currentScenarioName = activeScenario ? scenarios.find(item => item.id === activeScenario)?.name : undefined;

  useEffect(() => {
    try {
      window.localStorage.setItem(AERODYNAMIC_SCENARIOS_KEY, JSON.stringify(scenarios.slice(-30)));
    } catch { setNotice(STORAGE_FALLBACK); }
  }, [scenarios]);
  useEffect(() => {
    try {
      window.localStorage.setItem(AERODYNAMIC_HISTORY_KEY, JSON.stringify(history.slice(-50)));
    } catch { setNotice(STORAGE_FALLBACK); }
  }, [history]);

  const patch = <K extends keyof AerodynamicParameters>(key: K, value: AerodynamicParameters[K]) => {
    setParameters(current => ({ ...current, [key]: value }));
    setActiveScenario("");
    setMeshEstimate(null);
    setLatestRun(null);
  };
  const setNumber = (key: keyof AerodynamicParameters, value: string) => {
    const numericKeys: Array<keyof AerodynamicParameters> = ["speedMps", "flowDirectionDeg", "altitudeM", "temperatureC", "pressurePa", "massKg", "wingspanM", "chordM", "taperRatio", "angleOfAttackDeg", "bankDeg", "cd0", "oswaldEfficiency", "clMax", "viscosityPaS", "rotorCount", "rotorDiameterM", "meshCellSizeMm"];
    if (!numericKeys.includes(key)) return;
    const number = value === "" ? Number.NaN : Number(value);
    if (key === "pressurePa") {
      setParameters(current => ({ ...current, pressurePa: number, pressureMode: "manual" }));
      setActiveScenario(""); setMeshEstimate(null); setLatestRun(null);
      return;
    }
    if (key === "altitudeM" && parameters.pressureMode === "isa") {
      const pressure = standardAtmospherePressurePa(number);
      setParameters(current => ({ ...current, altitudeM: number, pressurePa: pressure ?? Number.NaN }));
      setActiveScenario(""); setMeshEstimate(null); setLatestRun(null);
      return;
    }
    patch(key, number as AerodynamicParameters[typeof key]);
  };
  const loadProjectProfile = () => {
    const next = defaultAerodynamicParameters(config);
    setAirframe(next.airframe);
    setParameters(next.parameters);
    setDemoValues(next.isDemonstration);
    setModelName(config.designName || projectName || "Modèle AeroMind");
    setActiveScenario("");
    setLatestRun(null);
    setNotice(next.isDemonstration ? "Profil rechargé avec des hypothèses de démonstration signalées." : "Profil rechargé depuis le projet actif.");
  };
  const saveScenario = () => {
    const name = scenarioName.trim();
    if (!name) { setNotice("Saisissez un nom avant d’enregistrer le scénario."); return; }
    const record: LocalScenario = {
      id: `scenario-${Date.now().toString(36)}`,
      name: name.slice(0, 60),
      airframe,
      parameters: { ...parameters },
      createdAt: new Date().toISOString(),
      provenance: "local-user-scenario",
    };
    setScenarios(current => [...current, record].slice(-30));
    setActiveScenario(record.id);
    setScenarioName("");
    setNotice(`Scénario « ${record.name} » enregistré dans ce navigateur uniquement.`);
  };
  const loadScenario = (scenario: LocalScenario) => {
    setAirframe(scenario.airframe);
    setParameters({ ...scenario.parameters, pressureMode: scenario.parameters.pressureMode ?? "manual" });
    setActiveScenario(scenario.id);
    setLatestRun(null);
    setNotice(`Scénario local « ${scenario.name} » chargé.`);
  };
  const removeScenario = (id: string) => {
    setScenarios(current => current.filter(item => item.id !== id));
    if (activeScenario === id) setActiveScenario("");
    setNotice("Scénario supprimé du stockage local.");
  };
  const runEstimate = () => {
    if (performance.status === "invalid" || performance.status === "not-applicable") {
      setNotice(performance.warnings[0] ?? "Corrigez les entrées avant de calculer.");
      return;
    }
    const started = globalThis.performance.now();
    const computed = estimateAerodynamicPerformance(airframe, parameters);
    const run = createLocalRun({
      modelName,
      modelVersion,
      elapsedMs: globalThis.performance.now() - started,
      initialConditions: `${parameters.speedMps} m/s · ${parameters.flowDirectionDeg}° · altitude ${parameters.altitudeM} m · ${parameters.temperatureC} °C · pression ${parameters.pressureMode} ${parameters.pressurePa} Pa`,
      performance: computed,
      parameters,
    });
    setLatestRun(run);
    setHistory(current => [run, ...current].slice(0, 50));
    setNotice(`Estimation locale ${run.id} créée. Aucun solveur CFD n’a été lancé.`);
  };
  const prepareMeshEstimate = () => {
    if (!asset?.boundsM) { setNotice("Importez une géométrie décodée pour estimer le domaine; aucun maillage n’est généré."); return; }
    setMeshBusy(true);
    window.setTimeout(() => {
      setMeshEstimate(estimateMeshWork(asset.boundsM!, parameters));
      setMeshBusy(false);
      setNotice("Estimation de taille du domaine terminée. Aucun maillage numérique n’a été créé.");
    }, 180);
  };
  const checkSolver = () => {
    setNotice("OpenFOAM non connecté : aucun solveur accessible dans cette Preview. Aucun calcul CFD n’a démarré.");
  };
  const exportManifest = () => {
    const manifest = makeOpenFoamHandoff({
      modelName,
      modelVersion,
      geometryFileName: asset?.name,
      geometrySha256: asset?.sha256,
      geometryDecoded: asset?.status === "decoded",
      airframe,
      parameters,
    });
    downloadFile(`${safeFilename(modelName)}-openfoam-handoff.json`, JSON.stringify(manifest, null, 2));
    setNotice("Manifeste de raccordement exporté. Ce fichier n’est pas un cas exécutable et ne contient aucun résultat CFD.");
  };
  const exportRun = () => {
    if (!latestRun) { setNotice("Créez une estimation ou sélectionnez un résultat avant d’exporter un rapport."); return; }
    const payload = {
      reportType: "aeromind-analytical-estimate-not-cfd",
      run: latestRun,
      geometry: asset ? { name: asset.name, sha256: asset.sha256 ?? null, decoded: asset.status === "decoded", triangles: asset.triangles } : null,
      project: { name: projectName, design: config.designName ?? null },
      scientificClassification: "MODÈLE ANALYTIQUE SIMPLIFIÉ — PAS UNE CFD, PAS UN RÉSULTAT EXPÉRIMENTAL",
      uncertainty: "Coefficients conceptuels non étalonnés; incertitude quantitative non déterminée.",
      limitations: latestRun.limitations,
    };
    downloadFile(`${safeFilename(modelName)}-${latestRun.id}.json`, JSON.stringify(payload, null, 2));
    setNotice("Rapport JSON exporté avec hypothèses, paramètres, provenance et limites.");
  };
  const exportMarkdown = () => {
    if (!latestRun) { setNotice("Créez d’abord une estimation pour préparer un rapport."); return; }
    downloadFile(`${safeFilename(modelName)}-${latestRun.id}.md`, reportMarkdown(latestRun, asset?.name), "text/markdown;charset=utf-8");
    setNotice("Rapport Markdown exporté.");
  };
  const printReport = () => {
    if (!latestRun) { setNotice("Créez d’abord une estimation pour préparer un rapport imprimable."); return; }
    window.print();
  };
  const exportOptimisation = () => {
    const proposal = {
      documentType: "AEROMIND_PARAMETRIC_REVIEW_PROPOSAL",
      state: "LOCAL_DRAFT_NOT_TRANSMITTED",
      preparedAt: new Date().toISOString(),
      project: projectName,
      model: { name: modelName, version: modelVersion },
      basis: performance.sourceLabel,
      comparison: { current: performance, parameters },
      proposedReview: performance.fixedWing?.status === "stall-risk"
        ? "Revoir la marge de vitesse et les dimensions d’aile avec le Centre Parametric."
        : "Comparer une variante de géométrie avec une source et des coefficients vérifiés.",
      note: "Proposition locale à valider; non transmise au Centre PARAMETRIC.",
    };
    downloadFile(`${safeFilename(modelName)}-parametric-review-proposal.json`, JSON.stringify(proposal, null, 2));
    setNotice("Proposition locale exportée pour revue humaine; elle n’a pas été transmise au Centre PARAMETRIC.");
  };
  const exportHistoryCsv = () => {
    if (!history.length) { setNotice("Aucun historique local à exporter."); return; }
    const rows = [
      ["id", "date", "model", "version", "classification", "solver", "mesh", "convergence", "drag_N", "lift_N", "limits"],
      ...history.map(run => [run.id, run.createdAt, run.modelName, run.modelVersion, run.status, run.solver, run.mesh, run.convergence, run.performance.dragN ?? "", run.performance.liftN ?? "", run.limitations.join(" | ")]),
    ];
    const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    downloadFile("aeromind-aero-history.csv", csv, "text/csv;charset=utf-8");
    setNotice("Historique local exporté en CSV.");
  };
  const importModel = async (file?: File) => {
    if (!file) return;
    if (file.size > maxFileSize) { setNotice("Fichier supérieur à 50 Mo; import refusé pour protéger la mémoire du navigateur."); return; }
    const ext = getExtension(file.name);
    const hash = await sha256(file);
    if (!["stl", "obj", "3mf"].includes(ext)) {
      setAsset({
        name: file.name, extension: ext.toUpperCase() || "CAD", bytes: file.size, sha256: hash,
        sourceUnits: "non vérifiées", object: null, status: "received-not-decoded", vertices: 0, triangles: 0,
        degenerateTriangles: 0,
        note: `${ext.toUpperCase() || "Ce format CAD"} a été reçu; aucun convertisseur/parseur vérifié n’est disponible dans ce module. Convertissez-le en STL, OBJ ou 3MF décodable pour ouvrir le viewport.`,
      });
      setNotice(`Fichier ${file.name} reçu, mais géométrie non décodée. Aucune inspection 3D n’est revendiquée.`);
      return;
    }
    try {
      const data = await file.arrayBuffer();
      let object: THREE.Object3D;
      if (ext === "stl") {
        const geometry = new STLLoader().parse(data);
        geometry.computeVertexNormals();
        object = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x71d8d3, side: THREE.DoubleSide }));
      } else if (ext === "obj") {
        object = new OBJLoader().parse(new TextDecoder().decode(data));
      } else {
        object = new ThreeMFLoader().parse(data);
      }
      const scan = scanObject(object, unitsToMeters);
      if (!scan.vertices || scan.vertices > 1_000_000) throw new Error("Géométrie vide ou dépassant la limite de 1 000 000 sommets.");
      const parsed: ModelAsset = {
        name: file.name,
        extension: ext.toUpperCase(),
        bytes: file.size,
        sha256: hash,
        sourceUnits: ext === "3mf" ? "unités du fichier (à confirmer)" : `${lengthUnit} (choix utilisateur)`,
        object,
        status: "decoded",
        ...scan,
        note: "Géométrie décodée localement dans le navigateur. Inspection dimensionnelle/triangles uniquement; fermeture manifold, B-Rep et qualité CAD industrielle non vérifiées.",
      };
      setAsset(parsed);
      setSelectedSurface("");
      setMeshEstimate(null);
      setNotice(`${file.name} décodé localement : ${scan.vertices.toLocaleString("fr-FR")} sommets et ${scan.triangles.toLocaleString("fr-FR")} triangles. La source n’a pas été téléversée.`);
    } catch (error) {
      setAsset({
        name: file.name, extension: ext.toUpperCase(), bytes: file.size, sha256: hash, sourceUnits: `${lengthUnit} (choix utilisateur)`, object: null,
        status: "received-not-decoded", vertices: 0, triangles: 0, degenerateTriangles: 0,
        note: `Le parseur a refusé la géométrie : ${error instanceof Error ? error.message : "erreur de décodage"}. Le contenu reste local au navigateur.`,
      });
      setNotice("Import refusé ou incomplet; consultez le diagnostic. Aucun modèle décodé n’est déclaré.");
    }
  };
  const clearAsset = () => { setAsset(null); setSelectedSurface(""); setMeshEstimate(null); setNotice("Référence géométrique locale retirée du viewport."); };
  const setComparisonScenario = (scenario: LocalScenario) => loadScenario(scenario);
  const runCount = history.length;
  const currentFieldValues = [parameters.speedMps, parameters.temperatureC, parameters.pressurePa, parameters.massKg];

  return <main className="aero-cfd-center" aria-labelledby="aero-cfd-heading">
    <header className="aero-cfd-header">
      <div className="aero-cfd-brand"><div className="aero-cfd-mark"><Wind size={21} /></div><div><p className="aero-eyebrow">AEROMIND / AERODYNAMIC SIMULATION CENTER</p><h1 id="aero-cfd-heading">Centre aérodynamique</h1><p>{projectName} · conception, préparation de calcul et analyses traçables</p></div></div>
      <div className="aero-cfd-status"><Badge kind="locked">CFD SOLVER NOT CONNECTED</Badge><small>ESTIMATIONS ANALYTIQUES DISPONIBLES · MODE VIRTUEL</small></div>
    </header>
    <div className="aero-science-banner" role="note"><ShieldCheck size={16} /><span><strong>Vérité scientifique :</strong> aucune animation ne vaut calcul CFD. Les métriques disponibles sont des estimations analytiques simplifiées; maillage, convergence et résultats CFD restent indisponibles tant qu’OpenFOAM n’est pas raccordé.</span></div>
    <div className="aero-cfd-shell">
      <nav className="aero-cfd-nav" aria-label="Rubriques du centre aérodynamique">
        <span className="aero-nav-caption">WORKSPACE</span>
        {sections.map(item => { const Icon = item.icon; return <button key={item.id} type="button" className={section === item.id ? "is-active" : ""} onClick={() => setSection(item.id)} title={item.label}><Icon size={15} /><span>{item.label}</span><ChevronRight size={13} className="aero-nav-chevron" /></button>; })}
        <div className="aero-nav-footer"><span><i /> Local · navigateur</span><small>Aucune transmission distante</small></div>
      </nav>
      <section className="aero-cfd-content">
        {notice && <div className="aero-notice" role="status"><Info size={15} /><span>{notice}</span><button type="button" onClick={() => setNotice("")} aria-label="Fermer le message">×</button></div>}
        {demoValues && <div className="aero-demo-warning"><AlertTriangle size={15} /><span>VALEURS DE DÉMONSTRATION — modifiez-les avec les données de votre conception avant toute interprétation.</span><button type="button" onClick={() => setDemoValues(false)}>Masquer</button></div>}

        {section === "dashboard" && <>
          <div className="aero-section-heading"><div><p className="aero-eyebrow">AERODYNAMIC DASHBOARD / 01</p><h2>Synthèse aérodynamique</h2><p>Configuration locale, statut du solveur et résultats disponibles pour le projet actif.</p></div><button className="aero-secondary-button" type="button" onClick={loadProjectProfile}><RefreshCw size={14} /> Recharger le profil projet</button></div>
          <div className="aero-summary-grid"><Metric label="Architecture" value={airframe === "fixed-wing" ? "Aile fixe" : airframe === "vtol" ? "VTOL" : "Multirotor"} note={demoValues ? "Hypothèse de démonstration" : "Profil projet"} /><Metric label="Vitesse de référence" value={format(parameters.speedMps, 1)} unit="m/s" note="Entrée de scénario" /><Metric label="Densité estimée" value={format(density ?? undefined, 3)} unit="kg/m³" note={`${parameters.pressureMode === "isa" ? "ISA standard" : "Pression manuelle"} · gaz parfait`} /><Metric label="Historique local" value={String(runCount)} note="Runs analytiques, pas CFD" /></div>
          <div className="aero-dashboard-grid"><article className="aero-panel aero-dashboard-model"><div className="aero-panel-heading"><div><p className="aero-eyebrow">GÉOMÉTRIE / VIEWPORT</p><h3>{asset?.name ?? modelName}</h3></div><Badge kind={asset?.status === "decoded" ? "ok" : "warn"}>{asset?.status === "decoded" ? "MAILLAGE DÉCODÉ" : "GÉOMÉTRIE ABSENTE"}</Badge></div><ModelViewport asset={asset} unitsToMeters={unitsToMeters} onSurface={setSelectedSurface} /><div className="aero-inline-actions"><button type="button" className="aero-secondary-button" onClick={() => setSection("importer")}><Box size={14} /> Importer / inspecter</button><span>{asset?.triangles ? `${asset.triangles.toLocaleString("fr-FR")} triangles` : "Aucun maillage chargé"}</span></div></article>
            <article className="aero-panel aero-solver-card"><div className="aero-panel-heading"><div><p className="aero-eyebrow">SOLVER MANAGEMENT</p><h3>OpenFOAM</h3></div><Badge kind="locked">INDISPONIBLE</Badge></div><div className="aero-solver-orb"><Wind size={22} /><span>RUNTIME NON RACCORDÉ</span></div><p>Aucun binaire de solveur ni service CFD documenté n’est accessible depuis cette Preview. Les fonctions de cas résolu, maillage volumique, convergence et cartes de champs restent bloquées.</p><button type="button" className="aero-secondary-button" onClick={() => setSection("solver")}><Settings2 size={14} /> Gestion du solveur</button></article>
          </div>
          <div className="aero-dashboard-grid aero-dashboard-lower"><article className="aero-panel"><div className="aero-panel-heading"><div><p className="aero-eyebrow">ANALYSE DISPONIBLE</p><h3>Estimation conceptuelle</h3></div><Badge>ANALYTIQUE · NON VALIDÉE</Badge></div><div className="aero-metrics-row"><Metric label="Traînée" value={format(performance.dragN, 2)} unit="N" /><Metric label="Portance" value={format(performance.liftN, 2)} unit="N" /><Metric label="L / D" value={format(performance.liftDragRatio, 2)} /></div><p className="aero-fineprint">Ces valeurs proviennent de modèles simplifiés et coefficients non étalonnés. {performance.warnings[0]}</p><div className="aero-inline-actions"><button type="button" className="aero-primary-button" onClick={runEstimate}><Activity size={14} /> Créer une estimation analytique</button><button type="button" className="aero-secondary-button" onClick={() => setSection("setup")}><SlidersHorizontal size={14} /> Revoir les paramètres</button></div></article><article className="aero-panel"><div className="aero-panel-heading"><div><p className="aero-eyebrow">CENTRES AEROMIND</p><h3>Échanges et validations</h3></div><ExternalLink size={17} /></div><div className="aero-integration-list"><span><b>PARAMETRIC</b><em>Revue manuelle · non transmise</em><button type="button" onClick={() => onNavigate("parametric-center")}>Ouvrir le centre</button></span><span><b>MECANIC / ELECTRONICS</b><em>Contraintes à raccorder</em><button type="button" onClick={() => onNavigate("mechanical-center")}>Ouvrir le centre mécanique</button></span><span><b>VIRTUAL FACTORY / INTELLIGENCE</b><em>Non connectés à cette vue</em><small>Pas de partage automatique</small></span></div></article></div>
          <div className="aero-footer-note"><Info size={14} /> Classification visible dans chaque rapport : simulation réelle · modèle analytique simplifié · estimation théorique · expérimental · non validé.</div>
        </>}

        {section === "importer" && <>
          <div className="aero-section-heading"><div><p className="aero-eyebrow">3D MODEL IMPORTER / GEOMETRY</p><h2>Importer et inspecter une géométrie</h2><p>STL, OBJ et 3MF sont décodés localement; les fichiers STEP/CAD non supportés sont reçus sans prétendre analyser leur géométrie.</p></div><Badge kind="warn">50 Mo max · local navigateur</Badge></div>
          <div className="aero-import-grid"><article className="aero-panel aero-import-tools"><div className="aero-file-drop"><input aria-label="Choisir un fichier 3D" type="file" accept=".stl,.obj,.3mf,.step,.stp,.iges,.igs,.dxf" onChange={event => void importModel(event.target.files?.[0])} /><Box size={22} /><strong>Choisir un modèle 3D</strong><span>STL · OBJ · 3MF · STEP / CAD reçus sans parseur vérifié</span></div>
              <div className="aero-field-stack"><label>Unité source déclarée<select value={lengthUnit} onChange={event => setLengthUnit(event.target.value)}><option value="mm">Millimètres (mm)</option><option value="cm">Centimètres (cm)</option><option value="m">Mètres (m)</option><option value="in">Pouces (in)</option></select><small>STL/OBJ n’encodent pas nécessairement les unités; vérification humaine requise.</small></label><label>Nom de modèle<input value={modelName} onChange={event => setModelName(event.target.value)} /></label><label>Version / révision<input value={modelVersion} onChange={event => setModelVersion(event.target.value)} /></label></div>
              {asset && <div className="aero-asset-card"><div><strong>{asset.name}</strong><Badge kind={asset.status === "decoded" ? "ok" : "warn"}>{asset.status === "decoded" ? "DÉCODÉ" : "REÇU · NON DÉCODÉ"}</Badge></div><dl><dt>Format / taille</dt><dd>{asset.extension} · {(asset.bytes / 1024).toFixed(1)} Ko</dd><dt>Source SHA-256</dt><dd>{asset.sha256 ? `${asset.sha256.slice(0, 18)}…` : "non calculé"}</dd><dt>Unités</dt><dd>{asset.sourceUnits}</dd><dt>Sommets / triangles</dt><dd>{asset.vertices.toLocaleString("fr-FR")} / {asset.triangles.toLocaleString("fr-FR")}</dd><dt>Triangles dégénérés détectés</dt><dd className={asset.degenerateTriangles ? "is-warning" : ""}>{asset.degenerateTriangles}</dd><dt>Dimensions estimées</dt><dd>{asset.boundsM ? `${format(asset.boundsM.x, 3)} × ${format(asset.boundsM.y, 3)} × ${format(asset.boundsM.z, 3)} m` : "indisponibles"}</dd></dl><p>{asset.note}</p><button type="button" className="aero-danger-button" onClick={clearAsset}><Trash2 size={13} /> Retirer du viewport</button></div>}
            </article><article className="aero-panel aero-import-viewport"><div className="aero-panel-heading"><div><p className="aero-eyebrow">INSPECTION 3D</p><h3>Viewport interactif</h3></div><span className="aero-units-chip">{lengthUnit.toUpperCase()}</span></div><ModelViewport asset={asset} unitsToMeters={unitsToMeters} onSurface={setSelectedSurface} /><div className="aero-inspection-status"><span><i className={asset?.status === "decoded" ? "is-pass" : ""} />{asset?.status === "decoded" ? "Dimensions et triangles inspectés" : "Aucune géométrie inspectée"}</span><span>Surface : {selectedSurface || "aucune sélection"}</span><span>Fermeture, topologie et B-Rep : non vérifiés</span></div></article></div>
        </>}

        {section === "setup" && <>
          <div className="aero-section-heading"><div><p className="aero-eyebrow">SIMULATION SETUP / BOUNDARY CONDITIONS</p><h2>Conditions et paramètres physiques</h2><p>Les entrées alimentent un modèle conceptuel local; elles ne sont pas envoyées à un solveur.</p></div><button type="button" className="aero-secondary-button" onClick={loadProjectProfile}><RefreshCw size={14} /> Reprendre le projet</button></div>
          <div className="aero-panel aero-setup-toolbar"><label>Architecture<select value={airframe} onChange={event => { setAirframe(event.target.value as AirframeKind); setLatestRun(null); }}><option value="fixed-wing">Aile fixe</option><option value="multirotor">Multirotor</option><option value="vtol">VTOL hybride</option></select></label><span><strong>{currentScenarioName ?? "Scénario personnalisé"}</strong><small>{demoValues ? "Hypothèses de démonstration" : "Profil local"}</small></span><label>Nom à enregistrer<input value={scenarioName} maxLength={60} placeholder="Ex. vent traversier v2" onChange={event => setScenarioName(event.target.value)} /></label><button type="button" className="aero-primary-button" onClick={saveScenario}><Save size={14} /> Enregistrer scénario</button></div>
          <div className="aero-scenario-strip"><strong>SCÉNARIOS LOCAUX</strong>{scenarios.length ? scenarios.map(item => <span key={item.id}><button type="button" onClick={() => loadScenario(item)}>{item.name}</button><button className="aero-mini-remove" title={`Supprimer ${item.name}`} onClick={() => removeScenario(item.id)}><Trash2 size={12} /></button></span>) : <small>Aucun scénario enregistré sur cet appareil.</small>}</div>
          <div className="aero-setup-grid"><article className="aero-panel"><div className="aero-panel-heading"><div><p className="aero-eyebrow">01 / FLOW & ATMOSPHERE</p><h3>Conditions d’écoulement</h3></div><Wind size={17} /></div><div className="aero-form-grid"><NumberField label="Vitesse du flux" value={parameters.speedMps} unit="m/s" min={0.1} max={300} step="0.1" onChange={v => setNumber("speedMps", v)} /><NumberField label="Direction du flux" value={parameters.flowDirectionDeg} unit="°" min={-180} max={180} step="1" onChange={v => setNumber("flowDirectionDeg", v)} /><NumberField label="Altitude" value={parameters.altitudeM} unit="m" min={0} max={11000} step="10" onChange={v => setNumber("altitudeM", v)} /><NumberField label="Température" value={parameters.temperatureC} unit="°C" min={-80} max={60} step="0.5" onChange={v => setNumber("temperatureC", v)} /><NumberField label={parameters.pressureMode === "isa" ? "Pression ISA (altitude)" : "Pression statique manuelle"} value={parameters.pressurePa} unit="Pa" min={1000} max={200000} step="10" onChange={v => setNumber("pressurePa", v)} /><label className="aero-select-field">Mode de pression atmosphérique<select value={parameters.pressureMode} onChange={event => { const mode = event.target.value as AerodynamicParameters["pressureMode"]; if (mode === "isa") { const pressure = standardAtmospherePressurePa(parameters.altitudeM); if (pressure === null) { setNotice("Altitude hors domaine ISA (0–11 000 m); corrigez l’altitude avant de choisir ce mode."); return; } setParameters(current => ({ ...current, pressureMode: mode, pressurePa: pressure })); } else { setParameters(current => ({ ...current, pressureMode: mode })); } setActiveScenario(""); setLatestRun(null); }}><option value="isa">Atmosphère ISA, dérivée de l’altitude</option><option value="manual">Pression statique manuelle</option></select><small>En ISA, l’altitude recalcule la pression. Modifier directement la pression bascule en mode manuel.</small></label><NumberField label="Viscosité dynamique" value={parameters.viscosityPaS} unit="Pa·s" min={0.0000001} max={10} step="0.000001" onChange={v => setNumber("viscosityPaS", v)} /><div className="aero-derived-readout"><span>Densité calculée</span><strong>{format(density ?? undefined, 4)} kg/m³</strong><small>Gaz parfait · p / (R · T); estimation dérivée des entrées.</small></div></div></article>
            <article className="aero-panel"><div className="aero-panel-heading"><div><p className="aero-eyebrow">02 / BODY & TURBULENCE</p><h3>Géométrie et modèle</h3></div><Settings2 size={17} /></div><div className="aero-form-grid"><NumberField label="Masse de référence" value={parameters.massKg} unit="kg" min={0.05} max={10000} step="0.1" onChange={v => setNumber("massKg", v)} /><NumberField label="Envergure" value={parameters.wingspanM} unit="m" min={0.1} max={100} step="0.01" onChange={v => setNumber("wingspanM", v)} /><NumberField label="Corde moyenne" value={parameters.chordM} unit="m" min={0.02} max={30} step="0.01" onChange={v => setNumber("chordM", v)} /><NumberField label="Angle d’incidence" value={parameters.angleOfAttackDeg} unit="°" min={-20} max={45} step="0.5" onChange={v => setNumber("angleOfAttackDeg", v)} /><NumberField label="Facteur de forme / taper" value={parameters.taperRatio} unit="ratio" min={0.01} max={1} step="0.01" onChange={v => setNumber("taperRatio", v)} /><NumberField label="CD₀ indicatif" value={parameters.cd0} unit="—" min={0.001} max={1} step="0.001" onChange={v => setNumber("cd0", v)} /><label className="aero-select-field">Modèle de turbulence<select value={parameters.turbulenceModel} onChange={event => patch("turbulenceModel", event.target.value as AerodynamicParameters["turbulenceModel"])}><option value="laminar">Laminaire</option><option value="k-epsilon">k-ε</option><option value="k-omega-sst">k-ω SST</option></select><small>Paramètre de préparation uniquement; aucun modèle de turbulence n’est résolu dans cette Preview.</small></label><label className="aero-select-field">Type de calcul<select value={parameters.calculationType} onChange={event => patch("calculationType", event.target.value as AerodynamicParameters["calculationType"])}><option value="steady-incompressible">Stationnaire incompressible</option><option value="transient-incompressible">Transitoire incompressible</option></select><small>Choix documentaire pour futur raccordement OpenFOAM.</small></label></div></article>
            <article className="aero-panel aero-boundary-panel"><div className="aero-panel-heading"><div><p className="aero-eyebrow">03 / BOUNDARY CONDITIONS</p><h3>Conditions aux limites</h3></div><Layers size={17} /></div><label>Entrée<input value={parameters.inletBoundary} onChange={event => patch("inletBoundary", event.target.value)} /></label><label>Sortie<input value={parameters.outletBoundary} onChange={event => patch("outletBoundary", event.target.value)} /></label><p>Les surfaces murales, la référence de pression, les conditions thermiques et les critères de convergence devront être validés avant l’exécution d’un solveur.</p></article>
          </div>
          <div className="aero-setup-footer"><Badge kind="warn">Entrées non calibrées</Badge><span>La vitesse, température, pression et géométrie doivent provenir d’une configuration validée avant toute décision d’ingénierie.</span><button type="button" className="aero-primary-button" onClick={runEstimate}><Activity size={14} /> Créer une estimation analytique</button></div>{latestRun && <div className="aero-footer-note" role="status"><CheckCircle2 size={14} /> Estimation {latestRun.id} créée; aucun calcul CFD lancé. <button type="button" className="aero-run-link" onClick={() => setSection("reports")}>Ouvrir le rapport</button></div>}
        </>}

        {section === "mesh" && <>
          <div className="aero-section-heading"><div><p className="aero-eyebrow">MESH GENERATOR / PREPARATION</p><h2>Préparation du domaine</h2><p>Évaluez la taille théorique du domaine d’écoulement; aucun maillage CFD n’est généré sans solveur/mesher.</p></div><Badge kind="warn">PAS DE MAILLAGE RÉSOLU</Badge></div>
          <div className="aero-mesh-grid"><article className="aero-panel"><div className="aero-panel-heading"><div><p className="aero-eyebrow">DOMAIN SIZING</p><h3>Hypothèses de discrétisation</h3></div><Layers size={17} /></div><div className="aero-form-grid"><NumberField label="Cellule de référence" value={parameters.meshCellSizeMm} unit="mm" min={0.1} max={100} step="0.1" onChange={v => setNumber("meshCellSizeMm", v)} /><label className="aero-select-field">Niveau de raffinement<select value={parameters.meshRefinement} onChange={event => patch("meshRefinement", event.target.value as AerodynamicParameters["meshRefinement"])}><option value="coarse">Grossier</option><option value="standard">Standard</option><option value="fine">Fin</option></select></label></div><p>Estimation cubique basée sur une boîte de domaine hypothétique (× 2,5 autour de l’enveloppe importée). Nombre de cellules/ressources purement indicatif.</p><button type="button" className="aero-primary-button" onClick={prepareMeshEstimate} disabled={meshBusy}>{meshBusy ? <RefreshCw size={14} className="aero-spin" /> : <Layers size={14} />}{meshBusy ? "Calcul d’estimation…" : "Estimer la taille du domaine"}</button></article><article className="aero-panel aero-mesh-result"><p className="aero-eyebrow">OUTPUT / ENGINE STATUS</p>{meshEstimate ? <><h3>{meshEstimate.estimatedCells.toLocaleString("fr-FR")} cellules estimées</h3><Badge kind="warn">{meshEstimate.status}</Badge><div className="aero-metrics-row"><Metric label="Domaine hypothétique" value={`${format(meshEstimate.domainM.x, 1)} × ${format(meshEstimate.domainM.y, 1)} × ${format(meshEstimate.domainM.z, 1)}`} unit="m" /><Metric label="RAM indicative" value={`~${format(meshEstimate.estimatedRamGb, 1)}`} unit="Go" /></div></> : <div className="aero-empty-state"><Layers size={28} /><strong>Aucune estimation calculée</strong><span>Importez une géométrie décodée, puis demandez l’estimation du domaine.</span></div>}<p className="aero-fineprint">Résultat de cette opération : un ordre de grandeur de ressources, pas un maillage volumique utilisable.</p></article></div>
        </>}

        {section === "cfd" && <>
          <div className="aero-section-heading"><div><p className="aero-eyebrow">CFD WORKSPACE / SOLVER HANDOFF</p><h2>Préparer un cas CFD</h2><p>Les paramètres sont prêts à être exportés comme manifeste de demande; OpenFOAM ne s’exécute pas dans ce bac.</p></div><Badge kind="locked">RUNTIME ABSENT</Badge></div>
          <div className="aero-cfd-warning"><LockKeyhole size={20} /><div><strong>Calcul CFD indisponible — aucune tâche n’a été créée</strong><p>Aucun exécutable OpenFOAM ni endpoint solver documenté n’est configuré. Le bouton de lancement vérifie ce garde-fou et retourne l’état bloqué; il ne simule pas la progression d’un calcul.</p></div></div>
          <div className="aero-cfd-action-grid"><article className="aero-panel"><p className="aero-eyebrow">01 / CONDITIONS PRÉPARÉES</p><h3>{modelName} · {modelVersion}</h3><dl className="aero-key-values"><dt>Modèle</dt><dd>{airframe}</dd><dt>Écoulement</dt><dd>{format(parameters.speedMps, 2)} m/s · {format(parameters.flowDirectionDeg, 1)}°</dd><dt>Fluide</dt><dd>ρ {format(density ?? undefined, 4)} kg/m³ · μ {parameters.viscosityPaS} Pa·s</dd><dt>Turbulence demandée</dt><dd>{parameters.turbulenceModel}</dd><dt>Type</dt><dd>{parameters.calculationType}</dd><dt>Géométrie</dt><dd>{asset?.name ?? "absente"} · {asset?.status === "decoded" ? "décodée" : "non décodée"}</dd><dt>Maillage</dt><dd>non généré</dd><dt>Convergence</dt><dd>non applicable</dd></dl><div className="aero-inline-actions"><button type="button" className="aero-secondary-button" onClick={checkSolver}><RefreshCw size={14} /> Lancer la vérification du solveur</button><button type="button" className="aero-primary-button" onClick={exportManifest}><Download size={14} /> Exporter le manifeste</button></div></article><article className="aero-panel"><p className="aero-eyebrow">02 / RUN CONTROL</p><h3>Gestion de tâche de calcul</h3><div className="aero-run-gate"><span className="aero-gate-step is-done">1 <small>Entrées locales</small></span><i /><span className="aero-gate-step is-blocked">2 <small>Solvabilité</small></span><i /><span className="aero-gate-step">3 <small>Maillage</small></span><i /><span className="aero-gate-step">4 <small>Convergence</small></span></div><button type="button" className="aero-disabled-explained" onClick={checkSolver}><LockKeyhole size={15} /> Démarrer un calcul CFD <small>Action refusée — aucun solveur disponible</small></button><p className="aero-fineprint">Aucune ressource, durée, tâche ou convergence n’est inventée. Le manifeste est un handoff documentaire, pas un cas OpenFOAM runnable.</p></article></div>
          <div className="aero-footer-note"><AlertTriangle size={14} /> Pour activer un calcul réel ultérieurement : installer/mettre à disposition OpenFOAM dans un runtime autorisé, définir un contrat de version, de sécurité et de traitement, puis ajouter validation de géométrie, exécution, convergence et extraction des champs.</div>
        </>}

        {section === "airflow" && <>
          <div className="aero-section-heading"><div><p className="aero-eyebrow">AIRFLOW VISUALIZATION / FIELD DATA</p><h2>Visualisation des écoulements</h2><p>Choisissez une couche de résultat. Les vues de champ attendent un jeu de données CFD réel.</p></div><Badge kind="locked">AUCUN CHAMP CFD</Badge></div>
          <div className="aero-mode-bar">{flowModes.map(mode => <button type="button" key={mode} className={flowMode === mode ? "is-active" : ""} onClick={() => { setFlowMode(mode); setFlowTouched(true); }}>{mode}</button>)}</div>
          <div className="aero-panel aero-flow-panel"><div className="aero-panel-heading"><div><p className="aero-eyebrow">DISPLAY MODE</p><h3>{flowMode}</h3></div><Badge kind="warn">EN ATTENTE DE DONNÉES DE SOLVEUR</Badge></div><div className="aero-flow-empty"><div className="aero-flow-axis"><span>INLET</span><i /><b>{asset?.name ?? "Géométrie non chargée"}</b><i /><span>OUTLET</span></div><strong>{flowMode === "Comparative View" && history.length ? "Les résultats présents sont des estimations analytiques seulement." : "Aucun champ de vitesse/pression/turbulence disponible"}</strong><p>{flowMode === "Cross Sections" ? "Les coupes de section exigent des champs de solution; aucune coupe numérique n’est fabriquée ici." : flowMode === "Streamlines" ? "Les lignes de courant seront rendues uniquement à partir de vecteurs de vitesse provenant d’un calcul vérifiable." : "Ce schéma de domaine est une aide de préparation, pas une visualisation d’écoulement calculée."}</p><div className="aero-flow-legend"><span><i className="is-cyan" /> Géométrie / données importées</span><span><i className="is-empty" /> Champ de solution indisponible</span></div></div><div className="aero-inline-actions"><button type="button" className="aero-secondary-button" onClick={() => setSection("cfd")}><Wind size={14} /> Préparer le calcul</button><span>{flowTouched ? `Mode actif : ${flowMode}` : "Pas d’animation CFD"}</span></div></div>
        </>}

        {section === "pressure" && <>
          <div className="aero-section-heading"><div><p className="aero-eyebrow">PRESSURE ANALYSIS / SURFACE FIELDS</p><h2>Analyse de pression</h2><p>Pression ambiante d’entrée disponible; distribution de pression surfacique absente sans solveur.</p></div><Badge kind="warn">PAS DE CARTE SURFACIQUE</Badge></div>
          <div className="aero-panel aero-pressure-grid"><div><p className="aero-eyebrow">CONDITION AMBIANTE</p><strong>{format(parameters.pressurePa, 1)} Pa</strong><span>Pression statique saisie</span></div><div><p className="aero-eyebrow">PRESSION DYNAMIQUE</p><strong>{format(performance.dynamicPressurePa, 2)} Pa</strong><span>q = ½ ρ V² · estimation analytique</span></div><div><p className="aero-eyebrow">PRESSION SURFACE / Cp</p><strong>INCONNUE</strong><span>Requires a converged CFD field</span></div></div>
          <article className="aero-panel aero-empty-section"><Gauge size={26} /><h3>Les champs de pression ne sont pas disponibles</h3><p>La pression d’entrée et la pression dynamique théorique ne permettent pas d’inférer une carte de pression sur la surface. Les coefficients Cp, séparations et gradients resteront vides jusqu’à un calcul réel.</p><button type="button" className="aero-secondary-button" onClick={() => setSection("solver")}><Settings2 size={14} /> Vérifier le solveur</button></article>
        </>}

        {section === "rotor" && <>
          <div className="aero-section-heading"><div><p className="aero-eyebrow">ROTOR FLOW ANALYSIS / ACTUATOR-DISK ESTIMATE</p><h2>Analyse rotor & propulsion</h2><p>Modèle théorique de disque actuateur en stationnaire idéal, sans interaction aérodynamique résolue.</p></div><Badge kind="warn">THÉORIQUE · NON CFD</Badge></div>
          <div className="aero-panel aero-rotor-grid"><div><div className="aero-panel-heading"><div><p className="aero-eyebrow">PROPULSION INPUTS</p><h3>Configuration des rotors</h3></div><Wind size={17} /></div><div className="aero-form-grid"><NumberField label="Nombre de rotors" value={parameters.rotorCount} unit="rotors" min={1} max={32} step="1" onChange={v => setNumber("rotorCount", v)} /><NumberField label="Diamètre de rotor" value={parameters.rotorDiameterM} unit="m" min={0.01} max={10} step="0.01" onChange={v => setNumber("rotorDiameterM", v)} /><NumberField label="Masse totale" value={parameters.massKg} unit="kg" min={0.05} max={10000} step="0.1" onChange={v => setNumber("massKg", v)} /><NumberField label="Densité utilisée" value={density ?? Number.NaN} unit="kg/m³" min={0.01} max={2} step="0.001" onChange={v => { const next = Number(v); if (Number.isFinite(next) && next > 0) setNumber("pressurePa", String(next * 287.05287 * (parameters.temperatureC + 273.15))); }} /></div></div><div className="aero-rotor-readout"><p className="aero-eyebrow">IDEAL HOVER POWER</p><strong>{format(performance.rotorIdealHoverPowerW, 1)} <small>W</small></strong><span>Puissance induite idéale théorique</span><div className="aero-rotor-ring"><i style={{ transform: `scale(${Math.min(1, Math.max(0.15, (parameters.rotorCount || 0) / 8))})` }} /><b>{Math.max(0, Math.round(parameters.rotorCount || 0))}<small>rotors</small></b></div><p>Ignore pertes de profil, effets de paroi, vitesse d’avancement, sillage croisé, régime moteur, rendement, bruit et déformation du rotor.</p></div></div>
          <div className="aero-panel aero-assumption-panel"><AlertTriangle size={16} /><span>Interférence entre rotors, structures et flux d’air : <strong>non résolue</strong>. Pour les quantifier, un modèle rotor documenté et un solveur CFD réel sont requis.</span></div>
        </>}

        {section === "comparison" && <>
          <div className="aero-section-heading"><div><p className="aero-eyebrow">PERFORMANCE COMPARISON / LOCAL VARIANTS</p><h2>Comparer des configurations</h2><p>Les variantes sont des instantanés locaux; leurs estimations ne sont pas des résultats CFD.</p></div><button type="button" className="aero-secondary-button" onClick={() => setSection("setup")}><Plus size={14} /> Ajouter une variante</button></div>
          <div className="aero-panel"><div className="aero-panel-heading"><div><p className="aero-eyebrow">SAVED SCENARIOS</p><h3>Scénarios sauvegardés sur cet appareil</h3></div><Badge>{scenarios.length} scénario(s)</Badge></div>{scenarios.length ? <div className="aero-compare-table-wrap"><table className="aero-compare-table"><thead><tr><th>Variante</th><th>Architecture</th><th>Vitesse m/s</th><th>Densité kg/m³</th><th>Statut</th><th>Actions</th></tr></thead><tbody>{scenarios.map(item => { const estimate = estimateAerodynamicPerformance(item.airframe, item.parameters); return <tr key={item.id}><td><strong>{item.name}</strong><small>{new Date(item.createdAt).toLocaleString("fr-FR")}</small></td><td>{item.airframe}</td><td>{format(item.parameters.speedMps, 1)}</td><td>{format(estimate.densityKgM3, 3)}</td><td><Badge kind="warn">ESTIMATION ANALYTIQUE</Badge></td><td><button type="button" onClick={() => setComparisonScenario(item)}>Charger</button><button type="button" onClick={() => removeScenario(item.id)} aria-label={`Supprimer ${item.name}`}><Trash2 size={13} /></button></td></tr>; })}</tbody></table></div> : <div className="aero-empty-state"><ClipboardList size={26} /><strong>Aucune variante sauvegardée</strong><span>Créez un scénario dans Simulation Setup pour le comparer ici.</span><button type="button" className="aero-primary-button" onClick={() => setSection("setup")}>Ouvrir la préparation</button></div>}</div>
          <div className="aero-panel aero-estimate-compare"><div className="aero-panel-heading"><div><p className="aero-eyebrow">CURRENT VARIANT</p><h3>{modelName}</h3></div><Badge kind="warn">ESTIMATION, PAS CFD</Badge></div><div className="aero-metrics-row"><Metric label="Traînée" value={format(performance.dragN)} unit="N" /><Metric label="Portance" value={format(performance.liftN)} unit="N" /><Metric label="L / D" value={format(performance.liftDragRatio)} /><Metric label="Puissance" value={format(performance.powerW ?? performance.rotorIdealHoverPowerW)} unit="W" /></div></div>
        </>}

        {section === "optimization" && <>
          <div className="aero-section-heading"><div><p className="aero-eyebrow">DESIGN OPTIMIZATION / HUMAN REVIEW</p><h2>Compromis et pistes de conception</h2><p>Suggestions issues d’un modèle conceptuel; aucune modification géométrique n’est appliquée automatiquement.</p></div><Badge kind="warn">PROPOSITION À VALIDER</Badge></div>
          <article className="aero-panel aero-optimization-summary"><div className="aero-panel-heading"><div><p className="aero-eyebrow">CURRENT BASELINE</p><h3>{modelName} · {modelVersion}</h3></div><span className="aero-proposal-status">BROUILLON LOCAL</span></div><div className="aero-suggestion-list"><div><span>01</span><div><strong>Vérifier les hypothèses de géométrie</strong><p>{asset?.status === "decoded" ? "Le maillage est décodé; confirmer unités, axes et surfaces auprès du modèle de référence." : "Importer une géométrie décodée et confirmer les unités avant comparaison."}</p></div></div><div><span>02</span><div><strong>Tester la sensibilité à la vitesse et à la masse</strong><p>Comparer des scénarios enregistrés; la pression dynamique varie avec le carré de la vitesse, selon le modèle simplifié.</p></div></div><div><span>03</span><div><strong>Compléter avec validation indépendante</strong><p>Les coefficients non étalonnés et interactions de propulsion nécessitent des données vérifiées et une revue ingénieur.</p></div></div></div><div className="aero-inline-actions"><button type="button" className="aero-primary-button" onClick={exportOptimisation}><Download size={14} /> Exporter la proposition locale</button><button type="button" className="aero-secondary-button" onClick={() => onNavigate("parametric-center")}><ExternalLink size={14} /> Ouvrir le Centre PARAMETRIC</button></div><p className="aero-fineprint">L’export n’enregistre et ne transmet rien au Centre PARAMETRIC. La validation de version y reste manuelle.</p></article>
        </>}

        {section === "history" && <>
          <div className="aero-section-heading"><div><p className="aero-eyebrow">SIMULATION HISTORY / LOCAL RECORDS</p><h2>Historique des analyses</h2><p>Seuls les runs analytiques réalisés dans ce navigateur sont conservés.</p></div><button type="button" className="aero-secondary-button" onClick={exportHistoryCsv} disabled={!history.length}><Download size={14} /> Exporter CSV</button></div>
          {history.length ? <div className="aero-panel aero-history-table-wrap"><table className="aero-compare-table"><thead><tr><th>Identifiant</th><th>Date</th><th>Modèle / version</th><th>Solver / mesh</th><th>Convergence</th><th>Traînée</th><th>Rapport</th></tr></thead><tbody>{history.map(run => <tr key={run.id}><td><button type="button" className="aero-run-link" onClick={() => { setLatestRun(run); setSection("reports"); }}>{run.id}</button><small>{run.status}</small></td><td>{new Date(run.createdAt).toLocaleString("fr-FR")}</td><td>{run.modelName}<small>{run.modelVersion}</small></td><td>{run.solver}<small>{run.mesh}</small></td><td>{run.convergence}</td><td>{format(run.performance.dragN)} N</td><td><button type="button" onClick={() => { setLatestRun(run); setSection("reports"); }}>Ouvrir</button></td></tr>)}</tbody></table></div> : <div className="aero-panel aero-empty-state"><ClipboardList size={28} /><strong>Historique vide</strong><span>Les estimations ajoutées ici gardent identifiant, date, entrées, provenance et limites.</span><button type="button" className="aero-primary-button" onClick={() => setSection("setup")}>Configurer une analyse</button></div>}
          <div className="aero-footer-note"><Info size={14} /> La durée de calcul CFD, les résultats numériques et le niveau de convergence sont explicitement indiqués comme non disponibles.</div>
        </>}

        {section === "reports" && <>
          <div className="aero-section-heading"><div><p className="aero-eyebrow">TECHNICAL REPORTS / TRACEABLE OUTPUT</p><h2>Rapports techniques</h2><p>Les exports incluent hypothèses, conditions, provenance, incertitudes connues et limites.</p></div><Badge kind="warn">NON VALIDÉ · ANALYTIQUE</Badge></div>
          <div className="aero-panel aero-report-panel"><div className="aero-panel-heading"><div><p className="aero-eyebrow">REPORT SNAPSHOT</p><h3>{latestRun?.id ?? "Aucun résultat sélectionné"}</h3></div>{latestRun && <Badge kind="warn">{latestRun.status}</Badge>}</div>{latestRun ? <><div className="aero-report-facts"><span><b>Modèle</b>{latestRun.modelName}</span><span><b>Version</b>{latestRun.modelVersion}</span><span><b>Date</b>{new Date(latestRun.createdAt).toLocaleString("fr-FR")}</span><span><b>Solver</b>{latestRun.solver}</span><span><b>Mesh</b>{latestRun.mesh}</span><span><b>Convergence</b>{latestRun.convergence}</span></div><div className="aero-report-classification"><AlertTriangle size={16} /><p><strong>Classe scientifique :</strong> modèle analytique simplifié. Les incertitudes quantitatives n’ont pas été déterminées; aucun résultat expérimental ou CFD n’est joint.</p></div><h4>Hypothèses et limites déclarées</h4><ul>{[...latestRun.performance.assumptions, ...latestRun.performance.warnings, ...latestRun.limitations].map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul><div className="aero-inline-actions"><button type="button" className="aero-primary-button" onClick={exportRun}><Download size={14} /> Exporter JSON</button><button type="button" className="aero-secondary-button" onClick={exportMarkdown}><FileText size={14} /> Exporter Markdown</button><button type="button" className="aero-secondary-button" onClick={printReport}><ArrowDownToLine size={14} /> Imprimer / PDF</button></div></> : <div className="aero-empty-state"><FileText size={28} /><strong>Aucun rapport prêt</strong><span>Exécutez d’abord une estimation analytique.</span><button type="button" className="aero-primary-button" onClick={() => setSection("setup")}>Ouvrir Simulation Setup</button></div>}</div>
        </>}

        {section === "solver" && <>
          <div className="aero-section-heading"><div><p className="aero-eyebrow">SOLVER MANAGEMENT / RUNTIME STATUS</p><h2>Gestionnaire de solveur</h2><p>Disponibilité, contrat de raccordement et capacité de calcul.</p></div><Badge kind="locked">NO SOLVER DETECTED</Badge></div>
          <div className="aero-solver-grid"><article className="aero-panel aero-solver-status"><div className="aero-solver-orb is-large"><Wind size={24} /><span>OFFLINE</span></div><h3>OpenFOAM · non raccordé</h3><p>Vérification d’environnement effectuée avant la modernisation : aucun exécutable OpenFOAM ni service CFD n’est accessible dans cette session.</p><dl className="aero-key-values"><dt>Exécutable</dt><dd>indisponible</dd><dt>Version détectée</dt><dd>indisponible</dd><dt>Service distant</dt><dd>non configuré</dd><dt>Ressources CPU/RAM</dt><dd>non réservées</dd><dt>Queue de calcul</dt><dd>aucune tâche</dd><dt>Run CFD</dt><dd>aucun</dd></dl><button type="button" className="aero-primary-button" onClick={checkSolver}><RefreshCw size={14} /> Vérifier de nouveau</button></article><article className="aero-panel"><p className="aero-eyebrow">CONTRAT POUR RACCORDEMENT FUTUR</p><h3>Préconditions à documenter</h3><ol className="aero-checklist"><li>Version OpenFOAM et solveur cible nommés</li><li>Environnement de calcul isolé et limites de ressources</li><li>Validateur d’entrée, formats et limites géométriques</li><li>État de tâche, journal, arrêt et gestion d’échec</li><li>Extraction de convergence et données de champs provenance</li><li>Hypothèses et limites présentes dans chaque rapport</li></ol><p className="aero-fineprint">Ce checklist prépare l’intégration mais n’active pas un backend CFD.</p></article></div>
        </>}

        {section === "settings" && <>
          <div className="aero-section-heading"><div><p className="aero-eyebrow">SETTINGS / PROVENANCE</p><h2>Paramètres de travail</h2><p>Ces réglages sont locaux au workspace; les données source et le projet ne sont pas modifiés implicitement.</p></div><Settings2 size={18} /></div>
          <div className="aero-panel aero-settings-grid"><label>Unité de longueur<select value={lengthUnit} onChange={event => setLengthUnit(event.target.value)}><option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option><option value="in">in</option></select><small>Valeur choisie pour interpréter STL/OBJ; les unités source restent à vérifier.</small></label><label>Nom du modèle<input value={modelName} onChange={event => setModelName(event.target.value)} /></label><label>Version / révision<input value={modelVersion} onChange={event => setModelVersion(event.target.value)} /></label><div><span>Persistances</span><strong>Scénarios et historique dans localStorage</strong><small>Pas de synchronisation serveur ni de partage multi-utilisateur.</small></div><div><span>Protection physique</span><strong>VIRTUAL ONLY · contrôle matériel désactivé</strong><small>Ce module n’émet aucune commande vers drone, rotor ou banc matériel.</small></div><button type="button" className="aero-danger-button" onClick={() => { setScenarios([]); setHistory([]); setLatestRun(null); setNotice("Scénarios et historique aérodynamique locaux supprimés de ce navigateur."); }}><Trash2 size={14} /> Effacer mes scénarios et mon historique locaux</button></div>
        </>}

        <div className="aero-workspace-bottom"><span><i /> Aeromind / {sections.find(item => item.id === section)?.label}</span><span><ShieldCheck size={13} /> Aucune commande matérielle · aucun calcul CFD déclaré</span></div>
        <div className="aero-print-report" aria-hidden="true">{latestRun && <pre>{reportMarkdown(latestRun, asset?.name)}</pre>}</div>
      </section>
    </div>
  </main>;
}
