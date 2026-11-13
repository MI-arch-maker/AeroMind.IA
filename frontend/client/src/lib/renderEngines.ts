import * as THREE from "three";
import { runEngineeringSolver, type SolverResult } from "./engineeringSolvers";
import { isTechnicalRenderPreset, technicalPresetToEngineId } from "./technicalRenderingPipeline";

export type RenderEngineId =
  | "solid" | "wireframe" | "xray" | "exploded" | "bionic" | "carbon"
  | "cyberpunk" | "crystal" | "energyflow" | "cfd" | "fea"
  | "mesh-wire" | "blueprint" | "axonometric" | "orthographic" | "perspective"
  | "npr" | "clay" | "lowpoly" | "archviz" | "interior" | "immersive" | "mechanical";

export type FieldResult = {
  values: Float32Array;
  min: number;
  max: number;
  unit: string;
  method: string;
  warning: string;
  solverId: string;
  iterations?: number;
  residual?: number;
  velocityVectors?: Float32Array;
  vectorSegments?: Float32Array;
  streamlines?: Float32Array;
  vonMises?: Float32Array;
  strainGradient?: Float32Array;
  loadZones?: Uint8Array;
  loadZonePoints?: Float32Array;
  particles?: Float32Array;
  particleEnergy?: Float32Array;
};

export type RenderEngineDefinition = {
  id: RenderEngineId;
  label: string;
  pipeline: "three-material" | "indexed-wireframe" | "transparent-cad" | "surface-field" | "exploded-assembly";
  fidelity: "presentation" | "geometry-proxy";
  solverId?: string;
  description: string;
};

export const renderEngineRegistry: Record<RenderEngineId, RenderEngineDefinition> = {
  axonometric: { id: "axonometric", label: "Axonométrique", pipeline: "three-material", fidelity: "presentation", description: "Projection parallèle, orientation libre ou vue choisie." },
  orthographic: { id: "orthographic", label: "Orthographique", pipeline: "three-material", fidelity: "presentation", description: "Projection de présentation orthographique." },
  perspective: { id: "perspective", label: "Perspective", pipeline: "three-material", fidelity: "presentation", description: "Rendu perspective temps réel." },
  npr: { id: "npr", label: "NPR / Cel", pipeline: "three-material", fidelity: "presentation", description: "Matériau toon stylisé sur le maillage actif." },
  clay: { id: "clay", label: "Argile", pipeline: "three-material", fidelity: "presentation", description: "Matériau monochrome de présentation." },
  lowpoly: { id: "lowpoly", label: "Low-poly", pipeline: "three-material", fidelity: "presentation", description: "Facettes planes du maillage source, sans simplification géométrique." },
  archviz: { id: "archviz", label: "ArchViz", pipeline: "three-material", fidelity: "presentation", description: "Matériau physique temps réel avec clearcoat, sans lancer de rayons." },
  interior: { id: "interior", label: "Intérieur / extérieur", pipeline: "three-material", fidelity: "presentation", description: "Présentation de la cellule." },
  immersive: { id: "immersive", label: "Immersif", pipeline: "three-material", fidelity: "presentation", description: "Viewport plein écran." },
  mechanical: { id: "mechanical", label: "Mécanique", pipeline: "three-material", fidelity: "presentation", description: "Matériaux mécaniques standards." },
  solid: { id: "solid", label: "Solide", pipeline: "three-material", fidelity: "presentation", description: "Matériaux PBR temps réel Three.js." },
  wireframe: { id: "wireframe", label: "Filaire", pipeline: "indexed-wireframe", fidelity: "presentation", description: "Arêtes du mesh indexé." },
  xray: { id: "xray", label: "X-ray", pipeline: "transparent-cad", fidelity: "presentation", description: "Transparence de la géométrie existante." },
  exploded: { id: "exploded", label: "Vue éclatée", pipeline: "exploded-assembly", fidelity: "geometry-proxy", description: "Séparation visuelle des sous-ensembles, sans coupe ni mutation du modèle." },
  bionic: { id: "bionic", label: "Squelette bionique", pipeline: "indexed-wireframe", fidelity: "geometry-proxy", solverId: "stress-guided-lattice-v2", description: "Treillis procédural indicatif ; les contraintes estimées ne sont pas une validation structurelle." },
  carbon: { id: "carbon", label: "Carbone composite", pipeline: "three-material", fidelity: "presentation", description: "Shader de présentation avec tissage et reflet directionnel procéduraux." },
  cyberpunk: { id: "cyberpunk", label: "Exosquelette", pipeline: "three-material", fidelity: "presentation", description: "Matériau métallique émissif." },
  crystal: { id: "crystal", label: "Clear Tech", pipeline: "transparent-cad", fidelity: "presentation", description: "Shader translucide stylisé, sans réfraction de la scène ni couches physiques." },
  energyflow: { id: "energyflow", label: "Flux énergétique", pipeline: "surface-field", fidelity: "geometry-proxy", solverId: "surface-transport-particles-v2", description: "Visualisation procédurale indicative, pas un calcul de réseau énergétique." },
  cfd: { id: "cfd", label: "CFD surface panel", pipeline: "surface-field", fidelity: "geometry-proxy", solverId: "surface-panel-cfd-v2", description: "Estimation locale sur la surface ; pas de CFD volumique validée." },
  fea: { id: "fea", label: "MEF Von Mises", pipeline: "surface-field", fidelity: "geometry-proxy", solverId: "euler-bernoulli-fea-v2", description: "Approximation de poutre 1D par pièce ; ce n’est pas une analyse EF 3D." },
  "mesh-wire": { id: "mesh-wire", label: "Wireframe mesh", pipeline: "indexed-wireframe", fidelity: "geometry-proxy", solverId: "topology-extractor-v2", description: "Extraction directe des sommets, index et arêtes." },
  blueprint: { id: "blueprint", label: "CAO Blueprint", pipeline: "transparent-cad", fidelity: "geometry-proxy", description: "Maillage filaire cyan sur grille, projection parallèle ; sans élimination exacte des lignes cachées." },
};

export function getRenderEngine(id: string): RenderEngineDefinition {
  return renderEngineRegistry[id as RenderEngineId] ?? renderEngineRegistry.solid;
}

export type RenderSurfaceMode = "solid" | "wireframe" | "xray";
export type RenderPlan = {
  preset: string;
  engine: RenderEngineDefinition;
  mode: RenderSurfaceMode;
  projection: "orthographic" | "perspective";
  explosion: number;
};

/** Un preset explicite prévaut ; « mechanical » conserve le mode fourni par l’éditeur. */
export function resolveRenderPlan(preset: string | undefined, legacyMode: RenderSurfaceMode, explosion: number): RenderPlan {
  const chosen = preset || "mechanical";
  const engineId = chosen === "mechanical" && legacyMode !== "solid"
    ? legacyMode
    : isTechnicalRenderPreset(chosen) ? technicalPresetToEngineId(chosen) : chosen;
  const engine = getRenderEngine(engineId);
  const mode: RenderSurfaceMode = engine.id === "xray" ? "xray"
    : engine.id === "wireframe" || engine.id === "mesh-wire" ? "wireframe" : "solid";
  const amount = Number.isFinite(explosion) ? Math.max(0, explosion) : 0;
  return {
    preset: chosen,
    engine,
    mode,
    projection: ["axonometric", "orthographic", "blueprint"].includes(engine.id) ? "orthographic" : "perspective",
    // Le curseur existant reste prioritaire ; 0.55 sert seulement de valeur initiale du preset.
    explosion: engine.id === "exploded" && amount === 0 ? 0.55 : amount,
  };
}

/** Backward-compatible field adapter over the explicit engineering solver registry. */
export function computeSurfaceField(
  positions: Float32Array,
  indices: number[],
  mode: "cfd" | "fea",
  options: { airspeedMps?: number; airDensityKgM3?: number; youngModulusGPa?: number; loadN?: number } = {},
): FieldResult {
  const result: SolverResult = runEngineeringSolver(mode, positions, indices, options as Record<string, number>);
  return {
    values: result.values ?? new Float32Array(positions.length / 3),
    min: result.min ?? 0,
    max: result.max ?? 0,
    unit: result.unit,
    method: result.method,
    warning: `${result.warnings.join(" ")} ${mode === "cfd" ? "Navier–Stokes complet non exécuté." : "Résultat non certifié pour le dimensionnement."}`,
    solverId: result.solverId,
    iterations: result.iterations,
    residual: result.residual,
    velocityVectors: result.velocityVectors,
    vectorSegments: result.vectorSegments,
    streamlines: result.streamlines,
    vonMises: result.vonMises,
    strainGradient: result.strainGradient,
    loadZones: result.loadZones,
    loadZonePoints: result.loadZonePoints,
    particles: result.particles,
    particleEnergy: result.particleEnergy,
  };
}

export function fieldColors(result: FieldResult): Float32Array {
  const colors = new Float32Array(result.values.length * 3);
  const range = Math.max(1e-9, result.max - result.min);
  for (let i = 0; i < result.values.length; i++) {
    const t = Math.max(0, Math.min(1, (result.values[i] - result.min) / range));
    const color = new THREE.Color().setHSL((1 - t) * 0.68, 0.92, 0.52);
    colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b;
  }
  return colors;
}
