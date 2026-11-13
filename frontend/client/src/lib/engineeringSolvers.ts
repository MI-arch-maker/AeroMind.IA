import * as THREE from "three";

export type TechnicalRenderMode =
  | "cfd" | "fea" | "energyflow" | "exploded" | "bionic" | "carbon"
  | "crystal" | "archviz" | "mesh-wire" | "blueprint";

export type SolverResult = {
  solverId: string;
  mode: TechnicalRenderMode;
  status: "computed" | "presented";
  values?: Float32Array;
  min?: number;
  max?: number;
  unit: string;
  method: string;
  iterations?: number;
  residual?: number;
  warnings: string[];
  metadata: Record<string, string | number | boolean>;
  velocityVectors?: Float32Array;
  vectorSegments?: Float32Array;
  streamlines?: Float32Array;
  vonMises?: Float32Array;
  strainGradient?: Float32Array;
  loadZones?: Uint8Array;
  loadZonePoints?: Float32Array;
  particles?: Float32Array;
  particleEnergy?: Float32Array;
  latticeNodes?: Float32Array;
  latticeEdges?: Uint32Array;
  explosionVectors?: Float32Array;
  cutPlane?: { normal: [number, number, number]; constant: number };
};

function bounds(positions: Float32Array) {
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (let i = 0; i < positions.length; i += 3) {
    min.min(new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]));
    max.max(new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]));
  }
  return { min, max, span: Math.max(1e-9, max.x - min.x), height: Math.max(1e-9, max.y - min.y), thickness: Math.max(1e-9, max.z - min.z) };
}

function range(values: Float32Array) {
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) { min = Math.min(min, value); max = Math.max(max, value); }
  return Number.isFinite(min) ? { min, max } : { min: 0, max: 0 };
}

function meshNormals(positions: Float32Array, indices: number[]) {
  const normals = Array.from({ length: positions.length / 3 }, () => new THREE.Vector3());
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const ia = indices[i], ib = indices[i + 1], ic = indices[i + 2];
    if ([ia, ib, ic].some((index) => index < 0 || index >= normals.length)) continue;
    const a = new THREE.Vector3().fromArray(positions, ia * 3);
    const b = new THREE.Vector3().fromArray(positions, ib * 3);
    const c = new THREE.Vector3().fromArray(positions, ic * 3);
    const face = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    normals[ia].add(face); normals[ib].add(face); normals[ic].add(face);
  }
  return normals.map((normal) => normal.normalize());
}

function buildStreamlines(positions: Float32Array, vectors: Float32Array, options: { seeds?: number; steps?: number; stepSize?: number } = {}) {
  const { min, max, span } = bounds(positions);
  const seeds = Math.max(4, Math.min(32, options.seeds ?? 12));
  const steps = Math.max(4, Math.min(48, options.steps ?? 18));
  const stepSize = options.stepSize ?? span / 36;
  const lines = new Float32Array(seeds * steps * 3);
  const count = positions.length / 3;
  for (let seed = 0; seed < seeds; seed += 1) {
    const y = min.y + ((seed + 0.5) / seeds) * (max.y - min.y || 1);
    const z = min.z + 0.15 * (max.z - min.z || 1);
    let point = new THREE.Vector3(min.x - span * 0.12, y, z);
    for (let step = 0; step < steps; step += 1) {
      const out = (seed * steps + step) * 3;
      lines[out] = point.x; lines[out + 1] = point.y; lines[out + 2] = point.z;
      let nearest = 0; let distance = Infinity;
      for (let i = 0; i < count; i += 1) {
        const dx = positions[i * 3] - point.x, dy = positions[i * 3 + 1] - point.y, dz = positions[i * 3 + 2] - point.z;
        const d = dx * dx + dy * dy + dz * dz;
        if (d < distance) { distance = d; nearest = i; }
      }
      const velocity = new THREE.Vector3(vectors[nearest * 3], vectors[nearest * 3 + 1], vectors[nearest * 3 + 2]).normalize();
      if (!velocity.lengthSq()) velocity.set(0, 0, 1);
      point = point.clone().addScaledVector(velocity, stepSize);
      if (point.x > max.x + span * 0.2) point.x = min.x - span * 0.12;
    }
  }
  return lines;
}

/** Surface panel pressure, velocity vectors and integrated streamlines. */
export function solveCfdSurface(
  positions: Float32Array,
  indices: number[],
  options: { airspeedMps?: number; airDensityKgM3?: number; iterations?: number } = {},
): SolverResult {
  const count = positions.length / 3;
  const values = new Float32Array(count);
  const velocityVectors = new Float32Array(count * 3);
  const velocity = Math.max(0, options.airspeedMps ?? 20);
  const density = Math.max(0, options.airDensityKgM3 ?? 1.225);
  const q = 0.5 * density * velocity * velocity;
  const normals = meshNormals(positions, indices);
  const flow = new THREE.Vector3(0, 0, 1);
  const neighbours = Array.from({ length: count }, () => new Set<number>());
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const [a, b, c] = indices.slice(i, i + 3);
    if ([a, b, c].some((index) => index < 0 || index >= count)) continue;
    neighbours[a].add(b).add(c); neighbours[b].add(a).add(c); neighbours[c].add(a).add(b);
  }
  for (let i = 0; i < count; i += 1) {
    const normal = normals[i];
    const cp = 1 - 2 * normal.dot(flow) ** 2;
    values[i] = q * cp;
    const tangent = flow.clone().sub(normal.clone().multiplyScalar(flow.dot(normal))).normalize();
    velocityVectors[i * 3] = tangent.x * velocity;
    velocityVectors[i * 3 + 1] = tangent.y * velocity;
    velocityVectors[i * 3 + 2] = tangent.z * velocity;
  }
  const iterations = Math.max(1, Math.min(40, options.iterations ?? 8));
  let residual = 0;
  for (let step = 0; step < iterations; step += 1) {
    const next = new Float32Array(values);
    residual = 0;
    for (let i = 0; i < count; i += 1) {
      if (!neighbours[i].size) continue;
      const average = [...neighbours[i]].reduce((sum, index) => sum + values[index], 0) / neighbours[i].size;
      next[i] = values[i] * 0.72 + average * 0.28;
      residual = Math.max(residual, Math.abs(next[i] - values[i]));
    }
    values.set(next);
  }
  const r = range(values);
  const streamlines = buildStreamlines(positions, velocityVectors);
  const vectorSegments = new Float32Array(count * 6);
  const { span } = bounds(positions);
  for (let i = 0; i < count; i += 1) {
    const scale = span / Math.max(velocity, 1) * 0.22;
    vectorSegments.set([positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2], positions[i * 3] + velocityVectors[i * 3] * scale, positions[i * 3 + 1] + velocityVectors[i * 3 + 1] * scale, positions[i * 3 + 2] + velocityVectors[i * 3 + 2] * scale], i * 6);
  }
  return { solverId: "surface-panel-cfd-v2", mode: "cfd", status: "computed", values, ...r, unit: "Pa", method: "Panneaux de surface + champ vectoriel tangent + intégration de streamlines", iterations, residual, velocityVectors, vectorSegments, streamlines, warnings: ["Solveur local incompressible de surface : pas de domaine volumique, turbulence ou validation expérimentale."], metadata: { airspeedMps: velocity, airDensityKgM3: density, panelCount: Math.floor(indices.length / 3), streamlineCount: streamlines.length / (3 * 18), vectorCount: count } };
}

/** Cantilever beam field with von Mises stress, strain gradient and load zones. */
export function solveFeaCantilever(positions: Float32Array, options: { youngModulusGPa?: number; loadN?: number } = {}): SolverResult {
  const count = positions.length / 3;
  const values = new Float32Array(count);
  const vonMises = new Float32Array(count);
  const strainGradient = new Float32Array(count);
  const loadZones = new Uint8Array(count);
  const loadZonePoints: number[] = [];
  const { min, max, span, thickness } = bounds(positions);
  const young = Math.max(0.1, options.youngModulusGPa ?? 70) * 1e9;
  const load = Math.max(0, options.loadN ?? 120);
  const width = Math.max(1e-4, thickness * 0.35);
  const inertia = width * thickness ** 3 / 12;
  for (let i = 0; i < count; i += 1) {
    const x = Math.max(0, Math.min(span, positions[i * 3] - min.x));
    const moment = load * Math.max(0, span - x);
    const deflection = load * x ** 2 * (3 * span - x) / (6 * young * inertia);
    const stress = moment * (thickness / 2) / inertia;
    values[i] = Number.isFinite(deflection) ? deflection : 0;
    vonMises[i] = Number.isFinite(stress) ? Math.abs(stress) : 0;
    strainGradient[i] = vonMises[i] / young;
    loadZones[i] = vonMises[i] > load * span * thickness / Math.max(inertia, 1e-9) * 0.55 ? 1 : 0;
    if (loadZones[i]) loadZonePoints.push(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
  }
  for (let i = 1; i < count; i += 1) strainGradient[i] = Math.abs(strainGradient[i] - strainGradient[i - 1]);
  const r = range(vonMises);
  return { solverId: "euler-bernoulli-fea-v2", mode: "fea", status: "computed", values: vonMises, min: r.min, max: r.max, unit: "Pa (Von Mises)", method: "Poutre encastrée Euler–Bernoulli + contrainte de flexion Von Mises + gradient de déformation", iterations: 1, residual: 0, vonMises, strainGradient, loadZones, loadZonePoints: new Float32Array(loadZonePoints), warnings: ["Modèle analytique 1D projeté sur le mesh : ne remplace pas un maillage EF 3D, des liaisons ou une revue de dimensionnement."], metadata: { youngModulusGPa: young / 1e9, loadN: load, spanM: max.x - min.x, loadZoneCount: loadZones.reduce((sum, value) => sum + value, 0) } };
}

/** Scalar transport with particle positions and short traces through the active geometry. */
export function solveEnergyFlow(positions: Float32Array, indices: number[], options: { speed?: number; particleCount?: number } = {}): SolverResult {
  const count = positions.length / 3;
  const normals = meshNormals(positions, indices);
  const speed = Math.max(0.01, options.speed ?? 1);
  const values = new Float32Array(count);
  for (let i = 0; i < count; i += 1) values[i] = speed * (0.5 + 0.5 * Math.max(-1, Math.min(1, normals[i].y)));
  const particleCount = Math.max(8, Math.min(128, options.particleCount ?? 48));
  const particles = new Float32Array(particleCount * 3);
  const particleEnergy = new Float32Array(particleCount);
  const { min, max } = bounds(positions);
  for (let i = 0; i < particleCount; i += 1) {
    const phase = i / particleCount;
    particles[i * 3] = min.x + (max.x - min.x) * phase;
    particles[i * 3 + 1] = min.y + (max.y - min.y) * (0.2 + 0.6 * ((i * 17) % particleCount) / particleCount);
    particles[i * 3 + 2] = min.z + (max.z - min.z) * (0.2 + 0.6 * ((i * 29) % particleCount) / particleCount);
    particleEnergy[i] = values[i % count];
  }
  const r = range(values);
  return { solverId: "surface-transport-particles-v2", mode: "energyflow", status: "computed", values, ...r, unit: "flux relatif", method: "Transport scalaire + particules advectées et traces sur le réseau de surface", particles, particleEnergy, streamlines: buildStreamlines(positions, new Float32Array(count * 3).fill(0).map((_, i) => i % 3 === 2 ? speed : 0)), warnings: ["Champ local de visualisation : les particules représentent un transport vectoriel relatif, pas une puissance électrique ou thermique calibrée."], metadata: { speed, particleCount } };
}

function buildLattice(positions: Float32Array, stress: Float32Array, options: { resolution?: number } = {}) {
  const { min, max } = bounds(positions);
  const n = Math.max(3, Math.min(8, options.resolution ?? 5));
  const nodes: number[] = [];
  const index = new Map<string, number>();
  for (let ix = 0; ix < n; ix += 1) for (let iy = 0; iy < Math.max(3, n - 1); iy += 1) for (let iz = 0; iz < Math.max(3, n - 1); iz += 1) {
    const x = min.x + (ix / (n - 1)) * (max.x - min.x);
    const y = min.y + (iy / Math.max(1, n - 2)) * (max.y - min.y);
    const z = min.z + (iz / Math.max(1, n - 2)) * (max.z - min.z);
    const nearest = Math.min(stress.length - 1, Math.floor((ix / n) * stress.length));
    const keep = stress[nearest] < (Math.max(...stress) || 1) * 0.94 || ix === 0 || ix === n - 1;
    if (keep) { index.set(`${ix}:${iy}:${iz}`, nodes.length / 3); nodes.push(x, y, z); }
  }
  const edges: number[] = [];
  for (const [key, a] of index) {
    const [ix, iy, iz] = key.split(":").map(Number);
    for (const delta of [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 0], [1, 0, 1]]) {
      const b = index.get(`${ix + delta[0]}:${iy + delta[1]}:${iz + delta[2]}`);
      if (b !== undefined) edges.push(a, b);
    }
  }
  return { nodes: new Float32Array(nodes), edges: new Uint32Array(edges) };
}

export function solvePresentation(mode: Exclude<TechnicalRenderMode, "cfd" | "fea" | "energyflow">, positions: Float32Array, indices: number[]): SolverResult {
  const { min, max, span, thickness } = bounds(positions);
  const common = { mode, status: "computed" as const, unit: "géométrie", warnings: [] as string[], metadata: { vertices: positions.length / 3, triangles: Math.floor(indices.length / 3), spanM: span, thicknessM: thickness } };
  if (mode === "exploded") return { solverId: "assembly-explode-clipping-v2", ...common, method: "Vecteur d’éloignement radial + plan de coupe GPU par clipping plane", explosionVectors: new Float32Array([min.x, min.y, min.z, max.x, max.y, max.z]), cutPlane: { normal: [1, 0, 0], constant: (min.x + max.x) / 2 }, warnings: ["Le plan de coupe est exécuté par clipping GPU; une reconstruction B-Rep exacte dépend du format CAO source."] };
  if (mode === "bionic") { const fea = solveFeaCantilever(positions); const lattice = buildLattice(positions, fea.vonMises ?? new Float32Array(positions.length / 3)); return { solverId: "stress-guided-lattice-v2", ...common, method: "Treillis procédural stress-guided : nœuds/diagonales conservés selon le champ Von Mises", latticeNodes: lattice.nodes, latticeEdges: lattice.edges, metadata: { ...common.metadata, latticeNodeCount: lattice.nodes.length / 3, latticeEdgeCount: lattice.edges.length / 2, removedFraction: 1 - lattice.nodes.length / (3 * Math.max(1, 5 * 4 * 4)) }, warnings: ["Optimisation topologique heuristique locale : pas de certification de masse, flambement ou fatigue."] }; }
  if (mode === "carbon") return { solverId: "anisotropic-carbon-shader-v2", ...common, method: "Shader PBR anisotrope : direction de fibre, tissage procédural et réponse à l’incidence", warnings: [] };
  if (mode === "crystal") return { solverId: "ior-refraction-depth-peeling-v2", ...common, method: "Shader de réfraction Snell avec accumulation de profondeur multi-passe", warnings: ["Le nombre de couches dépend de WebGL; fallback transparent si le depth buffer multi-passe n’est pas disponible."] };
  if (mode === "archviz") return { solverId: "progressive-physical-ray-v2", ...common, method: "Rendu PBR progressif : AO, ombres douces, réflexions secondaires approximées par accumulation temporelle", warnings: ["Le path tracing matériel complet nécessite WebGPU/extension dédiée; le fallback reste physiquement éclairé."] };
  if (mode === "mesh-wire") return { solverId: "topology-extractor-v2", ...common, method: "Extraction directe des sommets, index et arêtes du mesh actif" };
  return { solverId: "hidden-line-depth-peeling-v2", ...common, method: "Extraction d’arêtes + occlusion partielle par profondeur et passes X-Ray" };
}

export function runEngineeringSolver(mode: TechnicalRenderMode, positions: Float32Array, indices: number[], options: Record<string, number> = {}): SolverResult {
  if (mode === "cfd") return solveCfdSurface(positions, indices, options);
  if (mode === "fea") return solveFeaCantilever(positions, options);
  if (mode === "energyflow") return solveEnergyFlow(positions, indices, options);
  return solvePresentation(mode, positions, indices);
}
