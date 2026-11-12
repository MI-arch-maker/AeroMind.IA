import * as THREE from "three";
import { runEngineeringSolver, type SolverResult } from "./engineeringSolvers";

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
  axonometric: { id: "axonometric", label: "Axonométrique", pipeline: "three-material", fidelity: "presentation", description: "Caméra orbitale axonométrique." },
  orthographic: { id: "orthographic", label: "Orthographique", pipeline: "three-material", fidelity: "presentation", description: "Projection de présentation orthographique." },
  perspective: { id: "perspective", label: "Perspective", pipeline: "three-material", fidelity: "presentation", description: "Rendu perspective temps réel." },
  npr: { id: "npr", label: "NPR / Cel", pipeline: "three-material", fidelity: "presentation", description: "Présentation stylisée temps réel." },
  clay: { id: "clay", label: "Argile", pipeline: "three-material", fidelity: "presentation", description: "Matériau monochrome de présentation." },
  lowpoly: { id: "lowpoly", label: "Low-poly", pipeline: "three-material", fidelity: "presentation", description: "Présentation sur le maillage source." },
  archviz: { id: "archviz", label: "ArchViz", pipeline: "three-material", fidelity: "presentation", solverId: "progressive-physical-ray-v2", description: "Matériau physique progressif avec AO, clearcoat et réflexions." },
  interior: { id: "interior", label: "Intérieur / extérieur", pipeline: "three-material", fidelity: "presentation", description: "Présentation de la cellule." },
  immersive: { id: "immersive", label: "Immersif", pipeline: "three-material", fidelity: "presentation", description: "Viewport plein écran." },
  mechanical: { id: "mechanical", label: "Mécanique", pipeline: "three-material", fidelity: "presentation", description: "Matériaux mécaniques standards." },
  solid: { id: "solid", label: "Solide", pipeline: "three-material", fidelity: "presentation", description: "Matériaux PBR temps réel Three.js." },
  wireframe: { id: "wireframe", label: "Filaire", pipeline: "indexed-wireframe", fidelity: "presentation", description: "Arêtes du mesh indexé." },
  xray: { id: "xray", label: "X-ray", pipeline: "transparent-cad", fidelity: "presentation", description: "Transparence de la géométrie existante." },
  exploded: { id: "exploded", label: "Écorché", pipeline: "exploded-assembly", fidelity: "geometry-proxy", solverId: "assembly-explode-clipping-v2", description: "Vecteur d’éloignement radial et plan de coupe GPU." },
  bionic: { id: "bionic", label: "Squelette bionique", pipeline: "indexed-wireframe", fidelity: "geometry-proxy", solverId: "stress-guided-lattice-v2", description: "Treillis procédural stress-guided généré selon le champ Von Mises." },
  carbon: { id: "carbon", label: "Carbone composite", pipeline: "three-material", fidelity: "presentation", solverId: "anisotropic-carbon-shader-v2", description: "Shader PBR anisotrope avec fibres et tissage procéduraux." },
  cyberpunk: { id: "cyberpunk", label: "Exosquelette", pipeline: "three-material", fidelity: "presentation", description: "Matériau métallique émissif." },
  crystal: { id: "crystal", label: "Clear Tech", pipeline: "transparent-cad", fidelity: "presentation", solverId: "ior-refraction-depth-peeling-v2", description: "Shader Snell/IOR avec accumulation multi-couches." },
  energyflow: { id: "energyflow", label: "Flux énergétique", pipeline: "surface-field", fidelity: "geometry-proxy", solverId: "surface-transport-particles-v2", description: "Transport scalaire avec particules et traces advectées." },
  cfd: { id: "cfd", label: "CFD surface panel", pipeline: "surface-field", fidelity: "geometry-proxy", solverId: "surface-panel-cfd-v2", description: "Pression, vecteurs de vitesse et streamlines intégrées." },
  fea: { id: "fea", label: "MEF Von Mises", pipeline: "surface-field", fidelity: "geometry-proxy", solverId: "euler-bernoulli-fea-v2", description: "Flèche, Von Mises, gradients de déformation et zones de charge." },
  "mesh-wire": { id: "mesh-wire", label: "Wireframe mesh", pipeline: "indexed-wireframe", fidelity: "geometry-proxy", solverId: "topology-extractor-v2", description: "Extraction directe des sommets, index et arêtes." },
  blueprint: { id: "blueprint", label: "CAO Blueprint", pipeline: "transparent-cad", fidelity: "geometry-proxy", solverId: "hidden-line-depth-peeling-v2", description: "Arêtes avec occlusion partielle par profondeur et X-Ray." },
};

export function getRenderEngine(id: string): RenderEngineDefinition {
  return renderEngineRegistry[id as RenderEngineId] ?? renderEngineRegistry.solid;
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
