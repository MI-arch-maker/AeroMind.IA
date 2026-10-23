import { BoxGeometry, BufferGeometry, CylinderGeometry } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { ConceptConfig, DroneSketchStroke, InstalledMaterial } from "./aeroEngine";
import type { DroneCatalogDesign } from "./droneCatalog";

/** Coordonnées en mètres, dans le repère maquette X (envergure), Y (haut), Z (longueur). */
export type Vec3 = [number, number, number];

export type MechanicalPartEdit = {
  name?: string;
  color?: string;
  hidden?: boolean;
  /** Translation additionnelle en mètres. */
  offset?: Vec3;
  /** Rotation additionnelle en degrés (XYZ). */
  rotation?: Vec3;
  /** Facteur multiplicatif par axe. */
  scale?: Vec3;
};

export type MechanicalExtraPart = {
  id: string;
  name: string;
  kind: "box" | "cylinder" | "roundedBox" | "mesh";
  size: Vec3;
  position: Vec3;
  color: string;
  radius?: number;
  vertices?: number[];
  indices?: number[];
};

export type MechanicalTwinConfig = {
  designId: string;
  fuselageWidth?: number;
  fuselageHeight?: number;
  sweepDeg?: number;
  dihedralDeg?: number;
  gearHeight?: number;
  shellColor?: string;
  finish?: "titanium" | "carbon" | "ceramic";
  edits?: Record<string, MechanicalPartEdit>;
  extraParts?: MechanicalExtraPart[];
};

export type MechanicalPart = {
  id: string;
  name: string;
  category: string;
  /** Positions locales, par triplets XYZ. */
  vertices: number[];
  /** Faces triangulées, indexées dans vertices. */
  indices: number[];
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  color: string;
  metalness: number;
  roughness: number;
  hidden: boolean;
  /** Opacité effective issue du calque Studio, 0 à 1. */
  opacity?: number;
  /** Dimensions nominales locales, avant édition d’échelle. */
  size: Vec3;
};

export type MechanicalModel = {
  designId: string;
  name: string;
  modelType: string;
  parts: MechanicalPart[];
  span: number;
  length: number;
  extent: number;
  settings: MechanicalTwinConfig;
};

type MeshData = { vertices: number[]; indices: number[]; size: Vec3 };
type PartOptions = Partial<Pick<MechanicalPart, "position" | "rotation" | "scale" | "color" | "metalness" | "roughness" | "hidden" | "opacity">>;
type Dimensions = { span: number; chord: number; length: number; prop: number; motors: number; width: number; height: number; type: string };

type TwinCarrier = ConceptConfig & {
  mechanicalTwin?: unknown;
  mechanicalTwins?: Record<string, unknown>;
};

const graphite = "#25313a";
const carbon = "#17212a";
const metal = "#a8b4b8";
const darkMetal = "#4c5a63";
const cyan = "#35d5e8";
const cyanDark = "#126f7d";
const ceramic = "#d8dedb";
const EPSILON = 0.000001;

const finite = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;
const positive = (value: unknown, fallback: number, min = 0.001) => Math.max(min, finite(value, fallback));
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const rad = (degrees: number) => (degrees * Math.PI) / 180;
const vec = (value: unknown, fallback: Vec3): Vec3 =>
  Array.isArray(value) && value.length === 3
    ? [finite(value[0], fallback[0]), finite(value[1], fallback[1]), finite(value[2], fallback[2])]
    : fallback;
const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul3 = (a: Vec3, b: Vec3): Vec3 => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
const cleanName = (value: string) => value.replace(/[^A-Za-z0-9_.-]+/g, "_").replace(/^_+|_+$/g, "") || "part";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validColor(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function bounds(vertices: number[]): Vec3 {
  if (!vertices.length) return [0, 0, 0];
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < vertices.length; i += 3) {
    minX = Math.min(minX, vertices[i]);
    minY = Math.min(minY, vertices[i + 1]);
    minZ = Math.min(minZ, vertices[i + 2]);
    maxX = Math.max(maxX, vertices[i]);
    maxY = Math.max(maxY, vertices[i + 1]);
    maxZ = Math.max(maxZ, vertices[i + 2]);
  }
  return [maxX - minX, maxY - minY, maxZ - minZ];
}

/** Conversion explicite des BufferGeometry THREE vers le format sérialisable du viewport. */
function threeMesh(geometry: BufferGeometry, size?: Vec3): MeshData {
  const attribute = geometry.getAttribute("position");
  const vertices = Array.from(attribute.array as ArrayLike<number>);
  const indexed = geometry.getIndex();
  const indices = indexed
    ? Array.from(indexed.array as ArrayLike<number>)
    : Array.from({ length: attribute.count }, (_, index) => index);
  geometry.dispose();
  return { vertices, indices, size: size ?? bounds(vertices) };
}

function box(width: number, height: number, depth: number): MeshData {
  const size: Vec3 = [positive(width, 0.01), positive(height, 0.01), positive(depth, 0.01)];
  return threeMesh(new BoxGeometry(size[0], size[1], size[2]), size);
}

/** Cylindre facetté volontairement léger : 12 côtés restent lisibles dans le fallback SVG. */
function cylinder(radiusTop: number, radiusBottom: number, height: number, segments = 12): MeshData {
  const radius = Math.max(positive(radiusTop, 0.01), positive(radiusBottom, 0.01));
  const h = positive(height, 0.01);
  return threeMesh(new CylinderGeometry(positive(radiusTop, 0.01), positive(radiusBottom, 0.01), h, clamp(Math.round(segments), 6, 16)), [radius * 2, h, radius * 2]);
}

function roundedBox(size: Vec3, radius: number): MeshData {
  const maxRadius = Math.max(0.001, Math.min(...size) / 2 - 0.0001);
  return threeMesh(new RoundedBoxGeometry(size[0], size[1], size[2], clamp(radius, 0.001, maxRadius), 3), size);
}

function merge(meshes: MeshData[]): MeshData {
  const vertices: number[] = [];
  const indices: number[] = [];
  let vertexOffset = 0;
  for (const mesh of meshes) {
    vertices.push(...mesh.vertices);
    indices.push(...mesh.indices.map(index => index + vertexOffset));
    vertexOffset += mesh.vertices.length / 3;
  }
  return { vertices, indices, size: bounds(vertices) };
}

/** Prismatique : une aile est une extrusion de planform, jamais une boîte rectangulaire dominante. */
function prismXZ(pointsInput: Array<[number, number]>, thickness: number): MeshData {
  const points = [...pointsInput];
  const signedArea = points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0);
  if (signedArea < 0) points.reverse();
  const half = positive(thickness, 0.008) / 2;
  const vertices: number[] = [];
  for (const [x, z] of points) vertices.push(x, -half, z);
  for (const [x, z] of points) vertices.push(x, half, z);
  const n = points.length;
  const indices: number[] = [];
  // La projection XZ CCW pointe vers -Y : dessous direct, dessus inversé.
  for (let i = 1; i < n - 1; i++) {
    indices.push(0, i, i + 1);
    indices.push(n, n + i + 1, n + i);
  }
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    indices.push(i, n + i, next, next, n + i, n + next);
  }
  return { vertices, indices, size: bounds(vertices) };
}

/** Prismatique vertical pour dérives et endplates. */
function prismYZ(pointsInput: Array<[number, number]>, thickness: number): MeshData {
  const points = [...pointsInput];
  const signedArea = points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0);
  if (signedArea < 0) points.reverse();
  const half = positive(thickness, 0.008) / 2;
  const vertices: number[] = [];
  for (const [y, z] of points) vertices.push(-half, y, z);
  for (const [y, z] of points) vertices.push(half, y, z);
  const n = points.length;
  const indices: number[] = [];
  for (let i = 1; i < n - 1; i++) {
    indices.push(0, i + 1, i);
    indices.push(n, n + i, n + i + 1);
  }
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    indices.push(i, next, n + i, next, n + next, n + i);
  }
  return { vertices, indices, size: bounds(vertices) };
}

/** Corps effilé à sections polygonales, sans sphère ni capsule. Axe longitudinal Z. */
function loftZ(stations: Array<[number, number, number]>, sides = 8): MeshData {
  const segmentCount = clamp(Math.round(sides), 6, 16);
  const vertices: number[] = [];
  for (const [z, radiusX, radiusY] of stations) {
    for (let side = 0; side < segmentCount; side++) {
      const angle = (side / segmentCount) * Math.PI * 2;
      vertices.push(Math.cos(angle) * Math.max(radiusX, EPSILON), Math.sin(angle) * Math.max(radiusY, EPSILON), z);
    }
  }
  const indices: number[] = [];
  for (let ring = 0; ring < stations.length - 1; ring++) {
    const start = ring * segmentCount;
    const next = (ring + 1) * segmentCount;
    for (let side = 0; side < segmentCount; side++) {
      const after = (side + 1) % segmentCount;
      indices.push(start + side, start + after, next + side);
      indices.push(start + after, next + after, next + side);
    }
  }
  const frontCenter = vertices.length / 3;
  vertices.push(0, 0, stations[0][0]);
  const lastCenter = vertices.length / 3;
  vertices.push(0, 0, stations[stations.length - 1][0]);
  const last = (stations.length - 1) * segmentCount;
  for (let side = 0; side < segmentCount; side++) {
    const after = (side + 1) % segmentCount;
    indices.push(frontCenter, after, side);
    indices.push(lastCenter, last + side, last + after);
  }
  return { vertices, indices, size: bounds(vertices) };
}

/** Anneau caréné léger, creux, pour les ducted-fans. Axe Y. */
function annularRing(outerRadius: number, innerRadius: number, height: number, segments = 12): MeshData {
  const outer = positive(outerRadius, 0.02);
  const inner = clamp(positive(innerRadius, outer * 0.65), 0.001, outer * 0.92);
  const half = positive(height, 0.01) / 2;
  const count = clamp(Math.round(segments), 8, 16);
  const vertices: number[] = [];
  for (const y of [-half, half]) {
    for (const radius of [outer, inner]) {
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        vertices.push(Math.cos(a) * radius, y, Math.sin(a) * radius);
      }
    }
  }
  // bottom outer / bottom inner / top outer / top inner
  const bo = 0;
  const bi = count;
  const to = count * 2;
  const ti = count * 3;
  const indices: number[] = [];
  for (let i = 0; i < count; i++) {
    const next = (i + 1) % count;
    indices.push(bo + i, bo + next, to + i, bo + next, to + next, to + i);
    indices.push(bi + next, bi + i, ti + i, bi + next, ti + i, ti + next);
    indices.push(to + i, to + next, ti + i, to + next, ti + next, ti + i);
    indices.push(bo + next, bo + i, bi + i, bo + next, bi + i, bi + next);
  }
  return { vertices, indices, size: [outer * 2, height, outer * 2] };
}

function wingMesh(side: -1 | 1, semiSpan: number, rootChord: number, taper: number, sweep: number, thickness: number): MeshData {
  const span = positive(semiSpan, 0.02);
  const root = positive(rootChord, 0.03);
  const tip = Math.max(root * clamp(taper, 0.06, 1), 0.02);
  const x = side * span;
  const points: Array<[number, number]> = [
    [0, -root * 0.45],
    [x, sweep - tip * 0.45],
    [x, sweep + tip * 0.55],
    [0, root * 0.55],
  ];
  return prismXZ(points, thickness);
}

function rotorBlades(diameter: number, bladeCount = 2): MeshData {
  const radius = positive(diameter, 0.1) / 2;
  const root = radius * 0.16;
  const meshes: MeshData[] = [];
  for (let blade = 0; blade < bladeCount; blade++) {
    const angle = (blade / bladeCount) * Math.PI * 2;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const point = (x: number, z: number): [number, number] => [x * c - z * s, x * s + z * c];
    meshes.push(
      prismXZ(
        [point(root, -radius * 0.08), point(radius * 0.92, -radius * 0.13), point(radius, radius * 0.08), point(root, radius * 0.11)],
        Math.max(0.008, diameter * 0.025)
      )
    );
  }
  return merge(meshes);
}

function beamBetween(start: Vec3, end: Vec3, radius: number): { mesh: MeshData; position: Vec3; rotation: Vec3 } {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const dz = end[2] - start[2];
  const length = Math.max(Math.hypot(dx, dy, dz), 0.01);
  const horizontal = Math.hypot(dx, dy);
  const rotation: Vec3 = [Math.atan2(dz, Math.max(horizontal, EPSILON)), 0, Math.atan2(-dx, dy || EPSILON)];
  return {
    mesh: cylinder(radius, radius, length, 8),
    position: [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2, (start[2] + end[2]) / 2],
    rotation,
  };
}

function finishMaterial(finish: MechanicalTwinConfig["finish"], shellColor: string) {
  if (finish === "titanium") return { shell: shellColor || metal, metalness: 0.78, roughness: 0.24 };
  if (finish === "ceramic") return { shell: shellColor || ceramic, metalness: 0.18, roughness: 0.42 };
  return { shell: shellColor || carbon, metalness: 0.62, roughness: 0.3 };
}

/**
 * Paramètres persistables par conception. Les réglages d’une autre référence ne
 * contaminent jamais le modèle demandé : leurs éditions et pièces ajoutées sont ignorées.
 */
export function mechanicalSettings(design: DroneCatalogDesign, config: ConceptConfig): MechanicalTwinConfig {
  const source = config as TwinCarrier;
  const baseConfiguration = { ...design.configuration, ...config };
  const span = positive(baseConfiguration.wingspan, 2.8, 0.2);
  const chord = positive(baseConfiguration.chord, 0.32, 0.06);
  const defaultWidth = clamp(chord * 0.72, 0.13, Math.max(0.16, span * 0.2));
  const defaults: MechanicalTwinConfig = {
    designId: design.id,
    fuselageWidth: defaultWidth,
    fuselageHeight: clamp(defaultWidth * 0.7, 0.1, 0.75),
    sweepDeg: ["aile-volante", "stealth-wing", "blended-pusher"].includes(design.modelType ?? "") ? 24 : 9,
    dihedralDeg: design.modelType === "planeur" ? 5 : 3,
    gearHeight: clamp(chord * 0.32, 0.08, 0.42),
    shellColor: carbon,
    finish: "carbon",
  };
  const fromMap = isRecord(source.mechanicalTwins) ? source.mechanicalTwins[design.id] : undefined;
  const candidate = fromMap ?? source.mechanicalTwin;
  if (!isRecord(candidate) || candidate.designId !== design.id) return defaults;
  const finish = candidate.finish === "titanium" || candidate.finish === "ceramic" || candidate.finish === "carbon" ? candidate.finish : defaults.finish;
  return {
    ...defaults,
    fuselageWidth: positive(candidate.fuselageWidth, defaults.fuselageWidth!),
    fuselageHeight: positive(candidate.fuselageHeight, defaults.fuselageHeight!),
    sweepDeg: finite(candidate.sweepDeg, defaults.sweepDeg!),
    dihedralDeg: finite(candidate.dihedralDeg, defaults.dihedralDeg!),
    gearHeight: positive(candidate.gearHeight, defaults.gearHeight!),
    shellColor: validColor(candidate.shellColor, defaults.shellColor!),
    finish,
    edits: isRecord(candidate.edits) ? (candidate.edits as Record<string, MechanicalPartEdit>) : undefined,
    extraParts: Array.isArray(candidate.extraParts) ? (candidate.extraParts as MechanicalExtraPart[]) : undefined,
  };
}

function dimensions(design: DroneCatalogDesign, config: ConceptConfig, settings: MechanicalTwinConfig): Dimensions {
  const input = { ...design.configuration, ...config };
  const type = design.modelType ?? config.modelType ?? (design.key === "vtol" ? "tiltrotor" : design.key === "quadcopter" ? "multirotor" : "voilure-conventionnelle");
  const span = positive(input.wingspan, 2.8, 0.2);
  const chord = positive(input.chord, span * 0.12, 0.05);
  const length = positive(input.fuselageLength, Math.max(chord * 3.5, span * 0.35), 0.16);
  const prop = clamp(positive(input.propDiameter, Math.min(span * 0.2, 0.42), 0.08), 0.08, Math.max(0.1, span * 0.65));
  const motors = clamp(Math.round(finite(input.motorCount, design.key === "fixed-wing" ? 1 : 4)), 1, 12);
  return {
    span,
    chord,
    length,
    prop,
    motors,
    width: positive(settings.fuselageWidth, chord * 0.72),
    height: positive(settings.fuselageHeight, chord * 0.46),
    type,
  };
}

function correctedFamily(design: DroneCatalogDesign, type: string): "fixed" | "vtol" | "multirotor" | "aerostat" | "paraglider" | "ornithopter" | "cyclocopter" | "ground-effect" {
  if (type === "aérostat") return "aerostat";
  if (type === "parapente") return "paraglider";
  if (type === "ornithoptère") return "ornithopter";
  if (type === "cyclocoptère") return "cyclocopter";
  if (type === "effet-de-sol") return "ground-effect";
  if (["tiltrotor", "tilt-wing", "tail-sitter"].includes(type)) return "vtol";
  if (["tricoptère", "hexacoptère", "octocoptère", "coaxial-x8", "ducted-fan", "multirotor"].includes(type)) return "multirotor";
  if (design.key === "quadcopter") return "multirotor";
  return "fixed";
}

function applyEdit(part: MechanicalPart, edit?: MechanicalPartEdit): MechanicalPart {
  if (!edit) return part;
  const offset = vec(edit.offset, [0, 0, 0]);
  const rotationDegrees = vec(edit.rotation, [0, 0, 0]);
  const editScale = vec(edit.scale, [1, 1, 1]);
  const editColor = validColor(edit.color, part.color);
  return {
    ...part,
    name: typeof edit.name === "string" && edit.name.trim() ? edit.name.trim() : part.name,
    color: editColor,
    hidden: typeof edit.hidden === "boolean" ? edit.hidden : part.hidden,
    position: add3(part.position, offset),
    rotation: add3(part.rotation, [rad(rotationDegrees[0]), rad(rotationDegrees[1]), rad(rotationDegrees[2])]),
    scale: mul3(part.scale, [Math.max(0.01, editScale[0]), Math.max(0.01, editScale[1]), Math.max(0.01, editScale[2])]),
  };
}

function createPart(id: string, name: string, category: string, mesh: MeshData, palette: ReturnType<typeof finishMaterial>, options: PartOptions = {}): MechanicalPart {
  return {
    id,
    name,
    category,
    vertices: mesh.vertices,
    indices: mesh.indices,
    position: options.position ?? [0, 0, 0],
    rotation: options.rotation ?? [0, 0, 0],
    scale: options.scale ?? [1, 1, 1],
    color: options.color ?? palette.shell,
    metalness: options.metalness ?? palette.metalness,
    roughness: options.roughness ?? palette.roughness,
    hidden: options.hidden ?? false,
    size: mesh.size,
  };
}

class Assembly {
  readonly parts: MechanicalPart[] = [];
  constructor(readonly settings: MechanicalTwinConfig, readonly palette: ReturnType<typeof finishMaterial>) {}

  add(id: string, name: string, category: string, mesh: MeshData, options: PartOptions = {}) {
    this.parts.push(applyEdit(createPart(id, name, category, mesh, this.palette, options), this.settings.edits?.[id]));
  }

  beam(id: string, name: string, category: string, start: Vec3, end: Vec3, radius: number, options: PartOptions = {}) {
    const beam = beamBetween(start, end, radius);
    this.add(id, name, category, beam.mesh, { ...options, position: beam.position, rotation: beam.rotation });
  }
}

function addFuselage(a: Assembly, d: Dimensions, widthFactor = 1, lengthFactor = 1, id = "fuselage-shell") {
  const width = d.width * widthFactor;
  const height = d.height * widthFactor;
  const length = d.length * lengthFactor;
  a.add(
    id,
    "Coque fuselage facettée",
    "airframe",
    loftZ([
      [-length * 0.5, width * 0.08, height * 0.12],
      [-length * 0.38, width * 0.62, height * 0.63],
      [-length * 0.04, width * 0.5, height * 0.72],
      [length * 0.29, width * 0.4, height * 0.51],
      [length * 0.5, width * 0.1, height * 0.14],
    ]),
    { color: a.palette.shell }
  );
  return { width, height, length };
}

function addWing(a: Assembly, id: string, name: string, d: Dimensions, options: { span?: number; chord?: number; taper?: number; sweep?: number; z?: number; y?: number; dihedral?: number; thickness?: number; rotation?: Vec3 } = {}) {
  const span = options.span ?? d.span;
  const chord = options.chord ?? d.chord;
  const sweep = options.sweep ?? Math.tan(rad(finite(options.sweep, finite(d.type === "stealth-wing" ? 32 : undefined, 0)))) * (span / 2);
  const dihedral = rad(options.dihedral ?? 0);
  const thickness = options.thickness ?? Math.max(0.018, chord * 0.075);
  const z = options.z ?? -chord * 0.06;
  const y = options.y ?? 0;
  const taper = options.taper ?? 0.48;
  const baseRotation = options.rotation ?? [0, 0, 0];
  for (const side of [-1, 1] as const) {
    const localDihedral = side * dihedral;
    a.add(
      `${id}-${side < 0 ? "port" : "starboard"}`,
      `${name} ${side < 0 ? "gauche" : "droite"}`,
      "airframe",
      wingMesh(side, span / 2, chord, taper, sweep, thickness),
      { position: [0, y, z], rotation: [baseRotation[0], baseRotation[1], baseRotation[2] + localDihedral] }
    );
  }
}

function addVerticalFin(a: Assembly, id: string, name: string, x: number, y: number, z: number, height: number, chord: number, cant = 0) {
  a.add(
    id,
    name,
    "airframe",
    prismYZ([[0, -chord * 0.42], [height * 0.1, -chord * 0.34], [height, chord * 0.18], [height * 0.72, chord * 0.5], [0, chord * 0.42]], Math.max(0.014, chord * 0.05)),
    { position: [x, y, z], rotation: [0, cant, 0], color: graphite }
  );
}

function addConventionalTail(a: Assembly, d: Dimensions, body: { width: number; height: number; length: number }, prefix = "tail") {
  addWing(a, `${prefix}-plane`, "Plan horizontal", d, {
    span: Math.max(d.span * 0.31, body.width * 3),
    chord: d.chord
 * 0.48,
    taper: 0.56,
    z: body.length * 0.34,
    y: body.height * 0.15,
    thickness: Math.max(0.014, d.chord * 0.05),
  });
  addVerticalFin(a, `${prefix}-fin`, "Dérive verticale", 0, body.height * 0.2, body.length * 0.37, body.height * 1.12, d.chord * 0.58);
}

function rotorStations(d: Dimensions, family: ReturnType<typeof correctedFamily>): Vec3[] {
  const ringRadius = clamp(Math.max(d.prop * 0.78, d.span * 0.26), d.prop * 0.72, Math.max(d.prop * 0.85, d.span * 0.43));
  if (d.type === "coaxial-x8") {
    const stations = Math.ceil(d.motors / 2);
    return Array.from({ length: d.motors }, (_, index) => {
      const station = Math.floor(index / 2);
      const angle = (station / stations) * Math.PI * 2 + Math.PI / 4;
      return [Math.cos(angle) * ringRadius, (index % 2) * d.prop * 0.16 + d.height * 0.38, Math.sin(angle) * ringRadius];
    });
  }
  if (family === "multirotor") {
    return Array.from({ length: d.motors }, (_, index) => {
      const angle = (index / d.motors) * Math.PI * 2 - Math.PI / 2;
      return [Math.cos(angle) * ringRadius, d.height * 0.38, Math.sin(angle) * ringRadius * 0.82];
    });
  }
  if (d.motors === 1) return [[0, d.height * 0.2, d.length * 0.43]];
  return Array.from({ length: d.motors }, (_, index) => [
    d.motors === 1 ? 0 : ((index / (d.motors - 1)) * 2 - 1) * d.span * 0.37,
    d.height * 0.14,
    index % 2 === 0 ? d.chord * 0.08 : d.chord * 0.2,
  ]);
}

function addRotorAssembly(
  a: Assembly,
  id: string,
  position: Vec3,
  prop: number,
  options: { forward?: boolean; duct?: boolean; nacelle?: boolean; bladeCount?: number } = {}
) {
  const rotation: Vec3 = options.forward ? [Math.PI / 2, 0, 0] : [0, 0, 0];
  const motorRadius = Math.max(prop * 0.085, 0.024);
  if (options.nacelle) {
    a.add(`nacelle-${id}`, `Nacelle orientable ${id}`, "propulsion", cylinder(prop * 0.13, prop * 0.105, prop * 0.3), {
      position,
      rotation,
      color: darkMetal,
      metalness: 0.82,
      roughness: 0.22,
    });
  }
  a.add(`motor-${id}`, `Moteur ${id}`, "propulsion", cylinder(motorRadius, motorRadius * 0.9, prop * 0.16), {
    position,
    rotation,
    color: metal,
    metalness: 0.88,
    roughness: 0.18,
  });
  a.add(`propeller-${id}`, `Hélice ${id}`, "propulsion", rotorBlades(prop, options.bladeCount ?? 2), {
    position,
    rotation,
    color: graphite,
    metalness: 0.48,
    roughness: 0.3,
  });
  if (options.duct) {
    a.add(`duct-${id}`, `Anneau caréné ${id}`, "propulsion", annularRing(prop * 0.56, prop * 0.45, Math.max(0.018, prop * 0.08)), {
      position,
      rotation,
      color: darkMetal,
      metalness: 0.72,
      roughness: 0.23,
    });
  }
}

function addFixedPropulsion(a: Assembly, d: Dimensions, family: ReturnType<typeof correctedFamily>, forward = false, duct = false, nacelles = false) {
  const stations = rotorStations(d, family);
  stations.forEach((position, index) => addRotorAssembly(a, String(index + 1).padStart(2, "0"), position, d.prop, { forward, duct, nacelle: nacelles }));
}

function addLandingGear(a: Assembly, d: Dimensions, settings: MechanicalTwinConfig, bodyHeight = d.height, mode: "aircraft" | "skid" = "aircraft") {
  const h = positive(settings.gearHeight, d.chord * 0.28);
  if (mode === "skid") {
    const half = Math.max(d.width * 0.9, d.span * 0.19);
    for (const side of [-1, 1] as const) {
      const x = side * half;
      a.beam(`gear-leg-${side < 0 ? "port" : "starboard"}`, `Jambe train ${side < 0 ? "gauche" : "droite"}`, "landing-gear", [x * 0.68, -bodyHeight * 0.25, -d.length * 0.12], [x, -h, -d.length * 0.12], Math.max(0.009, d.prop * 0.027), { color: metal, metalness: 0.84 });
      a.add(`skid-${side < 0 ? "port" : "starboard"}`, `Patin ${side < 0 ? "gauche" : "droit"}`, "landing-gear", box(d.prop * 0.11, d.prop * 0.06, d.length * 0.72), {
        position: [x, -h, 0],
        color: darkMetal,
        metalness: 0.72,
      });
    }
    return;
  }
  const points: Array<[string, Vec3]> = [
    ["nose", [0, -bodyHeight * 0.4, -d.length * 0.32]],
    ["port", [-Math.max(d.width * 0.72, d.span * 0.12), -bodyHeight * 0.36, d.length * 0.12]],
    ["starboard", [Math.max(d.width * 0.72, d.span * 0.12), -bodyHeight * 0.36, d.length * 0.12]],
  ];
  for (const [id, start] of points) {
    const end: Vec3 = [start[0], start[1] - h, start[2] + (id === "nose" ? -h * 0.16 : h * 0.12)];
    a.beam(`gear-strut-${id}`, `Jambe train ${id}`, "landing-gear", start, end, Math.max(0.008, d.chord * 0.025), { color: metal, metalness: 0.86, roughness: 0.19 });
    a.add(`gear-foot-${id}`, `Sabot train ${id}`, "landing-gear", box(Math.max(0.05, d.chord * 0.18), Math.max(0.025, d.chord * 0.06), Math.max(0.07, d.chord * 0.22)), {
      position: end,
      color: darkMetal,
      metalness: 0.75,
    });
  }
}

function addMechanicalDetails(a: Assembly, d: Dimensions, body: { width: number; height: number; length: number }, settings: MechanicalTwinConfig, gearMode: "aircraft" | "skid" = "aircraft") {
  // Modifications structurelles réelles : ces pièces font partie du maillage,
  // suivent les dimensions de la cellule et sont incluses dans l’export OBJ.
  a.add("belly-plate", "Plaque ventrale structurelle", "airframe", box(body.width * 0.74, Math.max(0.018, body.height * 0.075), body.length * 0.52), {
    position: [0, -body.height * 0.54, body.length * 0.02],
    color: graphite,
    metalness: 0.78,
    roughness: 0.25,
  });
  a.beam("structural-keel", "Quille longitudinale renforcée", "airframe", [0, -body.height * 0.44, -body.length * 0.42], [0, -body.height * 0.44, body.length * 0.42], Math.max(0.012, body.width * 0.065), {
    color: metal,
    metalness: 0.86,
    roughness: 0.2,
  });
  for (const side of [-1, 1] as const) {
    a.beam(`belly-rail-${side < 0 ? "port" : "starboard"}`, `Rail ventral ${side < 0 ? "gauche" : "droit"}`, "airframe", [side * body.width * 0.28, -body.height * 0.5, -body.length * 0.3], [side * body.width * 0.28, -body.height * 0.5, body.length * 0.3], Math.max(0.009, body.width * 0.04), { color: graphite, metalness: 0.74, roughness: 0.28 });
  }
  a.add("panel-service", "Panneau de service", "hardware", box(body.width * 0.8, Math.max(0.01, body.height * 0.045), body.length * 0.28), {
    position: [0, body.height * 0.7, -body.length * 0.05],
    color: graphite,
    metalness: 0.72,
    roughness: 0.26,
  });
  for (const side of [-1, 1] as const) {
    for (let index = 0; index < 2; index++) {
      const z = (index === 0 ? -0.12 : 0.1) * body.length;
      a.add(`wing-rib-${side < 0 ? "port" : "starboard"}-${index + 1}`, `Nervure aile ${side < 0 ? "gauche" : "droite"} ${index + 1}`, "hardware", box(d.span * 0.012, Math.max(0.01, d.chord * 0.04), Math.max(0.018, d.chord * 0.08)), {
        position: [side * d.span * (index === 0 ? 0.19 : 0.34), d.height * 0.04, z],
        rotation: [0, 0, side * rad(settings.dihedralDeg ?? 0)],
        color: darkMetal,
        metalness: 0.8,
        roughness: 0.22,
      });
    }
  }
  const screwPositions: Vec3[] = [
    [-body.width * 0.29, body.height * 0.75, -body.length * 0.12],
    [body.width * 0.29, body.height * 0.75, -body.length * 0.12],
    [-body.width * 0.29, body.height * 0.75, body.length * 0.12],
    [body.width * 0.29, body.height * 0.75, body.length * 0.12],
  ];
  screwPositions.forEach((position, index) => a.add(`fastener-${String(index + 1).padStart(2, "0")}`, `Vis panneau ${index + 1}`, "hardware", cylinder(Math.max(0.008, body.width * 0.035), Math.max(0.008, body.width * 0.035), Math.max(0.008, body.height * 0.05), 8), {
    position,
    color: metal,
    metalness: 0.9,
    roughness: 0.16,
  }));
  a.add("sensor-cube", "Capteur cubique", "payload", box(Math.max(0.09, body.width * 0.34), Math.max(0.07, body.height * 0.3), Math.max(0.09, body.width * 0.34)), {
    position: [0, -body.height * 0.72, -body.length * 0.08],
    color: cyanDark,
    metalness: 0.58,
    roughness: 0.2,
  });
  a.add("sensor-lens", "Fenêtre capteur cyan", "payload", cylinder(Math.max(0.025, body.width * 0.12), Math.max(0.025, body.width * 0.12), Math.max(0.01, body.height * 0.1), 10), {
    position: [0, -body.height * 0.9, -body.length * 0.08],
    color: cyan,
    metalness: 0.65,
    roughness: 0.14,
  });
  addLandingGear(a, d, settings, body.height, gearMode);
}

function addConventional(a: Assembly, d: Dimensions, settings: MechanicalTwinConfig) {
  const body = addFuselage(a, d);
  addWing(a, "wing-main", "Aile principale", d, { sweep: Math.tan(rad(settings.sweepDeg ?? 9)) * d.span * 0.5, dihedral: settings.dihedralDeg, taper: 0.48 });
  addConventionalTail(a, d, body);
  addFixedPropulsion(a, d, "fixed");
  addMechanicalDetails(a, d, body, settings);
}

function addFlyingWing(a: Assembly, d: Dimensions, settings: MechanicalTwinConfig, stealth = false, blended = false) {
  const body = addFuselage(a, d, blended ? 1.25 : 0.72, blended ? 0.58 : 0.44, stealth ? "integrated-stealth-core" : "wing-center-fairing");
  const taper = stealth ? 0.08 : blended ? 0.34 : 0.22;
  const sweep = Math.tan(rad(stealth ? Math.max(settings.sweepDeg ?? 32, 29) : settings.sweepDeg ?? 24)) * d.span * 0.5;
  addWing(a, stealth ? "stealth-wing" : "wing-main", stealth ? "Aile furtive intégrée" : "Aile volante", d, {
    chord: d.chord * (stealth ? 1.18 : 1.05),
    taper,
    sweep,
    dihedral: blended ? settings.dihedralDeg : 0,
    thickness: d.chord * (stealth ? 0.1 : 0.085),
  });
  if (blended) {
    addVerticalFin(a, "vee-fin-port", "Dérive V gauche", -d.span * 0.2, d.height * 0.16, d.length * 0.3, d.height * 0.9, d.chord * 0.54, -rad(24));
    addVerticalFin(a, "vee-fin-starboard", "Dérive V droite", d.span * 0.2, d.height * 0.16, d.length * 0.3, d.height * 0.9, d.chord * 0.54, rad(24));
  }
  if (stealth) {
    a.add("stealth-keel", "Quille basse signature réduite", "airframe", prismXZ([[-d.width * 0.6, -d.length * 0.2], [d.width * 0.6, -d.length * 0.2], [d.width * 0.32, d.length * 0.28], [-d.width * 0.32, d.length * 0.28]], d.height * 0.22), { color: graphite });
  }
  addFixedPropulsion(a, d, "fixed");
  addMechanicalDetails(a, d, body, settings);
}

function addGlider(a: Assembly, d: Dimensions, settings: MechanicalTwinConfig, hale = false, male = false) {
  const body = addFuselage(a, d, hale ? 0.56 : male ? 0.78 : 0.62, hale ? 1.15 : 1, hale ? "hale-fuselage" : male ? "male-fuselage" : "glider-fuselage");
  addWing(a, hale ? "hale-wing" : "glider-wing", hale ? "Voilure HALE" : "Aile de planeur", d, {
    chord: d.chord * (hale ? 0.84 : 0.9),
    taper: hale ? 0.55 : 0.3,
    sweep: Math.tan(rad(hale ? 4 : 7)) * d.span * 0.5,
    dihedral: hale ? 2 : settings.dihedralDeg,
    thickness: d.chord * 0.06,
  });
  addConventionalTail(a, d, body, hale ? "hale-tail" : male ? "male-tail" : "glider-tail");
  if (hale) {
    for (const side of [-1, 1] as const) {
      a.add(`solar-panel-${side < 0 ? "port" : "starboard"}`, `Panneau solaire ${side < 0 ? "gauche" : "droit"}`, "energy", box(d.span * 0.34, 0.009, d.chord * 0.42), {
        position: [side * d.span * 0.3, d.chord * 0.055, 0],
        color: "#234952",
        metalness: 0.52,
        roughness: 0.18,
      });
    }
  }
  if (male) {
    a.add("male-sensor-bay", "Baie optronique MALE", "payload", box(body.width * 0.82, body.height * 0.24, body.width * 0.78), { position: [0, -body.height * 0.67, -body.length * 0.16], color: cyanDark });
  }
  addFixedPropulsion(a, d, "fixed");
  addMechanicalDetails(a, d, body, settings);
}

function addTandem(a: Assembly, d: Dimensions, settings: MechanicalTwinConfig) {
  const body = addFuselage(a, d, 0.82);
  addWing(a, "tandem-front-wing", "Aile avant tandem", d, { span: d.span * 0.88, chord: d.chord * 0.82, taper: 0.56, z: -d.length * 0.25, sweep: d.span * 0.035, dihedral: settings.dihedralDeg });
  addWing(a, "tandem-rear-wing", "Aile arrière tandem", d, { span: d.span, chord: d.chord * 0.76, taper: 0.44, z: d.length * 0.22, sweep: d.span * 0.045, dihedral: settings.dihedralDeg });
  addVerticalFin(a, "tandem-fin", "Dérive tandem", 0, body.height * 0.15, d.length * 0.38, body.height * 1.05, d.chord * 0.5);
  addFixedPropulsion(a, d, "fixed");
  addMechanicalDetails(a, d, body, settings);
}

function addCanard(a: Assembly, d: Dimensions, settings: MechanicalTwinConfig) {
  const body = addFuselage(a, d, 0.84);
  addWing(a, "wing-main", "Aile principale arrière", d, { taper: 0.46, sweep: d.span * 0.055, z: d.length * 0.08, dihedral: settings.dihedralDeg });
  addWing(a, "canard-plane", "Plan canard", d, { span: d.span * 0.52, chord: d.chord * 0.54, taper: 0.65, sweep: d.span * 0.018, z: -d.length * 0.34, y: body.height * 0.12, thickness: d.chord * 0.052 });
  addVerticalFin(a, "canard-fin", "Dérive centrale", 0, body.height * 0.1, d.length * 0.36, body.height * 1.08, d.chord * 0.54);
  addFixedPropulsion(a, d, "fixed");
  addMechanicalDetails(a, d, body, settings);
}

function addBiplane(a: Assembly, d: Dimensions, settings: MechanicalTwinConfig) {
  const body = addFuselage(a, d, 0.78);
  addWing(a, "biplane-lower", "Plan inférieur", d, { chord: d.chord * 0.92, taper: 0.66, sweep: d.span * 0.022, y: -d.height * 0.2, dihedral: 0 });
  addWing(a, "biplane-upper", "Plan supérieur", d, { chord: d.chord, taper: 0.62, sweep: d.span * 0.035, y: d.height * 1.12, dihedral: (settings.dihedralDeg ?? 0) * 0.45 });
  for (const side of [-1, 1] as const) {
    for (const station of [-0.22, 0.22]) {
      a.beam(`biplane-strut-${side < 0 ? "port" : "starboard"}-${station < 0 ? "front" : "rear"}`, `Entretoise ${side < 0 ? "gauche" : "droite"}`, "hardware", [side * d.span * 0.29, -d.height * 0.14, station * d.chord], [side * d.span * 0.29, d.height * 1.05, station * d.chord + d.span * 0.018], Math.max(0.008, d.chord * 0.026), { color: metal, metalness: 0.86 });
    }
  }
  addConventionalTail(a, d, body, "biplane-tail");
  addFixedPropulsion(a, d, "fixed", true);
  addMechanicalDetails(a, d, body, settings);
}

function addDoubleBoom(a: Assembly, d: Dimensions, settings: MechanicalTwinConfig) {
  const body = addFuselage(a, d, 0.62, 0.68, "central-pod");
  addWing(a, "wing-main", "Aile porteuse", d, { taper: 0.52, sweep: d.span * 0.05, dihedral: settings.dihedralDeg });
  for (const side of [-1, 1] as const) {
    const x = side * d.span * 0.27;
    a.beam(`boom-${side < 0 ? "port" : "starboard"}`, `Poutre ${side < 0 ? "gauche" : "droite"}`, "airframe", [x, 0, -d.chord * 0.05], [x, d.height * 0.05, d.length * 0.48], Math.max(0.016, d.width * 0.17), { color: graphite, metalness: 0.7 });
    addVerticalFin(a, `boom-fin-${side < 0 ? "port" : "starboard"}`, `Dérive poutre ${side < 0 ? "gauche" : "droite"}`, x, d.height * 0.12, d.length * 0.43, d.height * 1.25, d.chord * 0.56, side * rad(3));
  }
  a.beam("boom-tail-link", "Traverse empennage", "airframe", [-d.span * 0.28, d.height * 0.15, d.length * 0.43], [d.span * 0.28, d.height * 0.15, d.length * 0.43], Math.max(0.012, d.width * 0.11), { color: graphite });
  addFixedPropulsion(a, d, "fixed", true);
  addMechanicalDetails(a, d, body, settings);
}

function addGroundEffect(a: Assembly, d: Dimensions, settings: MechanicalTwinConfig) {
  const body = addFuselage(a, d, 1.35, 0.9, "ground-effect-hull");
  addWing(a, "ground-wing", "Aile à faible allongement", d, { chord: d.chord * 1.25, taper: 0.72, sweep: d.span * 0.018, y: -d.height * 0.14, dihedral: 0, thickness: d.chord * 0.105 });
  for (const side of [-1, 1] as const) {
    a.add(`sponson-${side < 0 ? "port" : "starboard"}`, `Flotteur latéral ${side < 0 ? "gauche" : "droit"}`, "airframe", loftZ([[-d.length * 0.37, d.width * 0.14, d.height * 0.15], [-d.length * 0.13, d.width * 0.18, d.height * 0.22], [d.length * 0.35, d.width * 0.09, d.height * 0.12]]), { position: [side * d.span * 0.34, -d.height * 0.5, 0], color: graphite });
    addVerticalFin(a, `endplate-${side < 0 ? "port" : "starboard"}`, `Endplate ${side < 0 ? "gauche" : "droite"}`, side * d.span * 0.48, -d.height * 0.1, d.chord * 0.18, d.height * 0.7, d.chord * 0.55);
  }
  addConventionalTail(a, d, body, "ground-tail");
  addFixedPropulsion(a, d, "fixed");
  addMechanicalDetails(a, d, body, settings);
}

function addTiltrotor(a: Assembly, d: Dimensions, settings: MechanicalTwinConfig, tiltWing = false) {
  const body = addFuselage(a, d, 0.88);
  const tilt = tiltWing ? rad(28) : 0;
  addWing(a, tiltWing ? "tilt-wing" : "wing-main", tiltWing ? "Aile basculante" : "Aile tiltrotor", d, {
    taper: 0.5,
    sweep: d.span * 0.04,
    dihedral: settings.dihedralDeg,
    rotation: [tilt, 0, 0],
  });
  if (tiltWing) {
    a.add("tilt-wing-hinge", "Axe de basculement aile", "hardware", cylinder(Math.max(0.018, d.width * 0.15), Math.max(0.018, d.width * 0.15), d.width * 1.45, 10), {
      position: [0, d.height * 0.08, 0],
      rotation: [0, 0, Math.PI / 2],
      color: metal,
      metalness: 0.88,
    });
  }
  addConventionalTail(a, d, body, tiltWing ? "tiltwing-tail" : "tiltrotor-tail");
  const positions = rotorStations(d, "vtol");
  positions.forEach((position, index) => addRotorAssembly(a, String(index + 1).padStart(2, "0"), [position[0], position[1] + (tiltWing ? d.chord * 0.08 : 0), position[2]], d.prop, { forward: true, nacelle: true }));
  addMechanicalDetails(a, d, body, settings);
}

function addTailSitter(a: Assembly, d: Dimensions, settings: MechanicalTwinConfig) {
  const body = addFuselage(a, d, 0.72, 0.76, "tailsitter-pod");
  addWing(a, "tailsitter-wing", "Aile tail-sitter", d, { taper: 0.38, sweep: d.span * 0.08, dihedral: 0, z: d.length * 0.08 });
  for (const side of [-1, 1] as const) {
    addVerticalFin(a, `tailsitter-fin-${side < 0 ? "port" : "starboard"}`, `Dérive stabilisatrice ${side < 0 ? "gauche" : "droite"}`, side * d.span * 0.3, -d.height * 0.15, d.length * 0.26, d.height * 1.4, d.chord * 0.62, side * rad(8));
  }
  const positions = rotorStations(d, "vtol");
  positions.forEach((position, index) => addRotorAssembly(a, String(index + 1).padStart(2, "0"), [position[0], position[1], position[2] + d.chord * 0.12], d.prop, { nacelle: true }));
  addMechanicalDetails(a, d, body, settings);
}

function addMultirotor(a: Assembly, d: Dimensions, settings: MechanicalTwinConfig, ducted = false) {
  const coreHeight = Math.max(d.height, d.prop * 0.28);
  const body = { width: Math.max(d.width, d.prop * 0.85), height: coreHeight, length: Math.max(d.length * 0.64, d.prop * 1.25) };
  a.add("central-frame", "Châssis central facetté", "airframe", loftZ([[-body.length * 0.45, body.width * 0.26, body.height * 0.32], [-body.length * 0.14, body.width * 0.55, body.height * 0.56], [body.length * 0.28, body.width * 0.44, body.height * 0.46], [body.length * 0.45, body.width * 0.18, body.height * 0.2]]), { color: a.palette.shell });
  if (d.type === "multirotor") {
    a.add("universal-power-distribution", "Plaque de distribution multirotor", "energy", box(body.width * 0.42, Math.max(0.012, coreHeight * 0.12), body.length * 0.38), {
      position: [0, -coreHeight * 0.18, 0],
      color: darkMetal,
      metalness: 0.72,
      roughness: 0.26,
    });
  }
  const positions = rotorStations(d, "multirotor");
  positions.forEach((position, index) => {
    const id = String(index + 1).padStart(2, "0");
    a.beam(`arm-${id}`, `Bras structurel ${id}`, "airframe", [0, coreHeight * 0.1, 0], [position[0] * 0.93, position[1] * 0.82, position[2] * 0.93], Math.max(0.014, d.prop * 0.055), { color: graphite, metalness: 0.72 });
    addRotorAssembly(a, id, position, d.prop, { duct: ducted });
  });
  if (d.type === "tricoptère") {
    a.add("tricopter-yaw-servo", "Servo de lacet arrière", "hardware", box(d.prop * 0.17, d.prop * 0.1, d.prop * 0.14), { position: [0, coreHeight * 0.12, -Math.max(d.prop * 0.8, d.span * 0.25)], color: metal, metalness: 0.84 });
  }
  if (d.type === "coaxial-x8") a.add("coaxial-distribution", "Plaque de distribution coaxiale", "energy", box(body.width * 0.9, body.height * 0.12, body.length * 0.72), { position: [0, -coreHeight * 0.16, 0], color: darkMetal });
  addMechanicalDetails(a, d, body, settings, "skid");
}

function addAerostat(a: Assembly, d: Dimensions, settings: MechanicalTwinConfig) {
  const envelopeLength = Math.max(d.length * 1.55, d.span * 0.76);
  const envelopeWidth = Math.max(d.width * 3.1, d.span * 0.28);
  const envelopeHeight = envelopeWidth * 0.78;
  a.add("aerostat-envelope", "Enveloppe facettée allongée", "airframe", loftZ([
    [-envelopeLength * 0.5, envelopeWidth * 0.04, envelopeHeight * 0.06],
    [-envelopeLength * 0.39, envelopeWidth * 0.58, envelopeHeight * 0.6],
    [-envelopeLength * 0.12, envelopeWidth, envelopeHeight],
    [envelopeLength * 0.22, envelopeWidth * 0.9, envelopeHeight * 0.92],
    [envelopeLength * 0.43, envelopeWidth * 0.36, envelopeHeight * 0.42],
    [envelopeLength * 0.5, envelopeWidth * 0.04, envelopeHeight * 0.06],
  ], 12), { position: [0, envelopeHeight * 0.76, 0], color: a.palette.shell, metalness: 0.34, roughness: 0.38 });
  const gondola: Vec3 = [envelopeWidth * 0.84, envelopeHeight * 0.28, envelopeLength * 0.36];
  a.add("aerostat-gondola", "Nacelle instrumentée", "airframe", box(gondola[0], gondola[1], gondola[2]), { position: [0, -envelopeHeight * 0.18, 0], color: graphite });
  for (const side of [-1, 1] as const) {
    a.beam(`aerostat-tether-${side < 0 ? "port" : "starboard"}-front`, "Suspente gondole avant", "hardware", [side * envelopeWidth * 0.56, envelopeHeight * 0.38, -envelopeLength * 0.2], [side * gondola[0] * 0.38, -envelopeHeight * 0.02, -gondola[2] * 0.25], Math.max(0.007, d.chord * 0.018), { color: metal, metalness: 0.87 });
    a.beam(`aerostat-tether-${side < 0 ? "port" : "starboard"}-rear`, "Suspente gondole arrière", "hardware", [side * envelopeWidth * 0.46, envelopeHeight * 0.36, envelopeLength * 0.22], [side * gondola[0] * 0.38, -envelopeHeight * 0.02, gondola[2] * 0.25], Math.max(0.007, d.chord * 0.018), { color: metal, metalness: 0.87 });
  }
  addVerticalFin(a, "aerostat-fin-top", "Empennage supérieur", 0, envelopeHeight * 0.73, envelopeLength * 0.38, envelopeHeight * 0.72, d.chord * 1.1);
  addVerticalFin(a, "aerostat-fin-bottom", "Empennage inférieur", 0, envelopeHeight * 0.08, envelopeLength * 0.38, envelopeHeight * 0.48, d.chord * 0.84, Math.PI);
  const stations = rotorStations(d, "fixed");
  stations.forEach((position, index) => addRotorAssembly(a, String(index + 1).padStart(2, "0"), [position[0] * 0.62, -envelopeHeight * 0.1, position[2]], d.prop, { forward: true, nacelle: true }));
  addMechanicalDetails(a, d, { width: gondola[0], height: gondola[1], length: gondola[2] }, settings);
}

function addParaglider(a: Assembly, d: Dimensions, settings: MechanicalTwinConfig) {
  const body = { width: Math.max(d.width * 0.75, d.chord * 0.42), height: Math.max(d.height * 0.82, d.chord * 0.26), length: d.length * 0.62 };
  a.add("paraglider-harness", "Nacelle harnais", "airframe", loftZ([[-body.length * 0.45, body.width * 0.25, body.height * 0.26], [-body.length * 0.08, body.width * 0.55, body.height * 0.56], [body.length * 0.35, body.width * 0.33, body.height * 0.38], [body.length * 0.45, body.width * 0.12, body.height * 0.15]]), { color: graphite });
  addWing(a, "canopy", "Voile souple", d, { span: d.span, chord: d.chord * 0.94, taper: 0.48, sweep: d.span * 0.07, y: d.chord * 1.08, z: -d.chord * 0.18, dihedral: 14, thickness: d.chord * 0.045 });
  const attach: Vec3[] = [[-body.width * 0.5, body.height * 0.15, -body.length * 0.18], [body.width * 0.5, body.height * 0.15, -body.length * 0.18], [-body.width * 0.5, body.height * 0.15, body.length * 0.18], [body.width * 0.5, body.height * 0.15, body.length * 0.18]];
  const canopy: Vec3[] = [[-d.span * 0.34, d.chord * 1.05, -d.chord * 0.18], [d.span * 0.34, d.chord * 1.05, -d.chord * 0.18], [-d.span * 0.25, d.chord * 1.0, d.chord * 0.35], [d.span * 0.25, d.chord * 1.0, d.chord * 0.35]];
  attach.forEach((point, index) => a.beam(`suspension-${String(index + 1).padStart(2, "0")}`, `Suspente voile ${index + 1}`, "hardware", point, canopy[index], Math.max(0.005, d.chord * 0.012), { color: metal, metalness: 0.84 }));
  addFixedPropulsion(a, d, "fixed");
  addMechanicalDetails(a, d, body, settings);
}

function addOrnithopter(a: Assembly, d: Dimensions, settings: MechanicalTwinConfig) {
  const body = addFuselage(a, d, 0.58, 0.7, "ornithopter-body");
  for (const side of [-1, 1] as const) {
    const tag = side < 0 ? "port" : "starboard";
    a.add(`ornitho-inner-${tag}`, `Aile articulée interne ${side < 0 ? "gauche" : "droite"}`, "airframe", wingMesh(side, d.span * 0.23, d.chord * 0.76, 0.58, d.span * 0.02, d.chord * 0.05), { position: [0, 0, 0], rotation: [0, 0, side * rad(11)], color: a.palette.shell });
    a.add(`ornitho-outer-${tag}`, `Aile articulée externe ${side < 0 ? "gauche" : "droite"}`, "airframe", wingMesh(side, d.span * 0.28, d.chord * 0.56, 0.3, d.span * 0.035, d.chord * 0.04), { position: [side * d.span * 0.22, d.height * 0.12, d.chord * 0.03], rotation: [0, 0, side * rad(-19)], color: graphite });
    a.add(`ornitho-joint-${tag}`, `Articulation aile ${side < 0 ? "gauche" : "droite"}`, "hardware", cylinder(Math.max(0.016, d.chord * 0.07), Math.max(0.016, d.chord * 0.07), d.chord * 0.2, 10), { position: [side * d.span * 0.21, d.height * 0.08, 0], rotation: [0, 0, Math.PI / 2], color: metal, metalness: 0.9 });
    a.beam(`ornitho-link-${tag}`, `Biellette aile ${side < 0 ? "gauche" : "droite"}`, "hardware", [side * d.width * 0.42, 0, d.chord * 0.08], [side * d.span * 0.28, d.height * 0.13, d.chord * 0.18], Math.max(0.008, d.chord * 0.025), { color: metal, metalness: 0.88 });
  }
  addConventionalTail(a, d, body, "ornitho-tail");
  // Les ailes demeurent biomimétiques ; les unités ci-dessous sont les motoréducteurs
  // qui les actionnent réellement, avec une sortie vers chaque articulation.
  const drivePairs = Math.ceil(d.motors / 2);
  const driveColumns = Math.min(3, drivePairs);
  const driveRows = Math.ceil(drivePairs / driveColumns);
  for (let index = 0; index < d.motors; index++) {
    const id = String(index + 1).padStart(2, "0");
    const side: -1 | 1 = index % 2 === 0 ? -1 : 1;
    const station = Math.floor(index / 2);
    const column = station % driveColumns;
    const row = Math.floor(station / driveColumns);
    const stationZ = (column - (driveColumns - 1) / 2) * Math.max(d.chord * 0.19, d.prop * 0.22);
    const stationY = (row - (driveRows - 1) / 2) * Math.max(d.chord * 0.15, body.height * 0.2);
    const joint: Vec3 = [side * d.span * 0.21, d.height * 0.08, 0];
    const motorLength = Math.max(0.045, d.chord * 0.23);
    const motorRadius = Math.max(0.014, d.chord * 0.052);
    const motorPosition: Vec3 = [joint[0] - side * Math.max(d.chord * 0.22, d.width * 0.26), joint[1] + stationY, stationZ];
    const reducerPosition: Vec3 = [motorPosition[0] + side * motorLength * 0.38, motorPosition[1], motorPosition[2]];
    const output: Vec3 = [joint[0], joint[1] + stationY * 0.2, stationZ * 0.22];
    a.add(`ornitho-motor-${id}`, `Moteur de battement ${id}`, "propulsion", cylinder(motorRadius, motorRadius * 0.92, motorLength, 8), {
      position: motorPosition,
      rotation: [0, 0, Math.PI / 2],
      color: darkMetal,
      metalness: 0.86,
      roughness: 0.2,
    });
    a.add(`ornitho-reducer-${id}`, `Réducteur de battement ${id}`, "propulsion", cylinder(motorRadius * 1.28, motorRadius * 1.1, Math.max(0.035, motorLength * 0.58), 8), {
      position: reducerPosition,
      rotation: [0, 0, Math.PI / 2],
      color: metal,
      metalness: 0.9,
      roughness: 0.17,
    });
    a.beam(`ornitho-drive-link-${id}`, `Biellette d'entraînement ${id}`, "hardware", reducerPosition, output, Math.max(0.006, d.chord * 0.018), { color: metal, metalness: 0.9, roughness: 0.18 });
    a.beam(`ornitho-drive-mount-${id}`, `Support moteur battement ${id}`, "hardware", [side * d.width * 0.32, body.height * 0.04, stationZ * 0.35], motorPosition, Math.max(0.008, d.chord * 0.022), { color: graphite, metalness: 0.76 });
  }
  a.add("ornitho-actuator", "Arbre de synchronisation de battement", "hardware", cylinder(Math.max(0.025, d.chord * 0.1), Math.max(0.022, d.chord * 0.08), d.chord * 0.5, 10), { position: [0, body.height * 0.1, 0], rotation: [0, 0, Math.PI / 2], color: metal, metalness: 0.86 });
  addMechanicalDetails(a, d, body, settings);
}

function addCyclocopter(a: Assembly, d: Dimensions, settings: MechanicalTwinConfig) {
  const body = { width: Math.max(d.width * 0.78, d.prop * 0.55), height: Math.max(d.height, d.prop * 0.35), length: Math.max(d.length * 0.78, d.prop * 1.1) };
  a.add("cyclo-core", "Fuselage central", "airframe", box(body.width, body.height, body.length), { color: a.palette.shell });
  // Grille de stations latérales : chaque cage est une unité de propulsion complète,
  // portée par son berceau et deux jambes, plutôt qu'un moteur ajouté sans liaison.
  const cagePairs = Math.ceil(d.motors / 2);
  const cageColumns = Math.min(3, cagePairs);
  const cageRows = Math.ceil(cagePairs / cageColumns);
  const cageRadius = d.prop * 0.48;
  for (let index = 0; index < d.motors; index++) {
    const id = String(index + 1).padStart(2, "0");
    const side: -1 | 1 = index % 2 === 0 ? -1 : 1;
    const station = Math.floor(index / 2);
    const column = station % cageColumns;
    const row = Math.floor(station / cageColumns);
    const y = (row - (cageRows - 1) / 2) * d.prop * 1.08;
    const z = (column - (cageColumns - 1) / 2) * Math.max(d.prop * 1.08, body.length * 0.48);
    const x = side * Math.max(d.span * 0.29, body.width * 0.56 + cageRadius * 0.78);
    const bodyEdge = side * body.width * 0.38;
    const innerCageEdge = x - side * d.prop * 0.29;
    const stationLength = Math.max(0.06, Math.abs(innerCageEdge - bodyEdge) + d.prop * 0.08);
    const stationCenter: Vec3 = [(bodyEdge + innerCageEdge) / 2, y, z];
    a.add(`cyclo-station-${id}`, `Berceau rotor cyclique ${id}`, "hardware", box(stationLength, Math.max(0.025, d.prop * 0.13), Math.max(0.045, d.prop * 0.28)), {
      position: stationCenter,
      color: graphite,
      metalness: 0.76,
      roughness: 0.24,
    });
    a.beam(`cyclo-support-${id}-upper`, `Jambe supérieure rotor cyclique ${id}`, "hardware", [bodyEdge, y + d.prop * 0.1, z], [innerCageEdge, y + cageRadius * 0.55, z], Math.max(0.007, d.prop * 0.023), { color: metal, metalness: 0.86, roughness: 0.19 });
    a.beam(`cyclo-support-${id}-lower`, `Jambe inférieure rotor cyclique ${id}`, "hardware", [bodyEdge, y - d.prop * 0.1, z], [innerCageEdge, y - cageRadius * 0.55, z], Math.max(0.007, d.prop * 0.023), { color: metal, metalness: 0.86, roughness: 0.19 });
    a.add(`cyclo-cage-${id}`, `Cage cyclique ${id}`, "propulsion", annularRing(cageRadius, cageRadius * 0.84, d.prop * 0.62, 10), { position: [x, y, z], rotation: [0, 0, Math.PI / 2], color: darkMetal, metalness: 0.82, roughness: 0.22 });
    for (let blade = 0; blade < 3; blade++) {
      const bladeId = String(blade + 1).padStart(2, "0");
      a.add(`cyclo-blade-${id}-${bladeId}`, `Pale cyclique ${id}.${blade + 1}`, "propulsion", box(d.prop * 0.06, d.prop * 0.78, d.prop * 0.05), {
        position: [x, y, z],
        rotation: [(blade / 3) * Math.PI * 2, 0, 0],
        color: graphite,
        metalness: 0.58,
        roughness: 0.3,
      });
    }
    a.add(`cyclo-hub-${id}`, `Moyeu cyclique ${id}`, "propulsion", cylinder(d.prop * 0.11, d.prop * 0.11, d.prop * 0.7, 8), { position: [x, y, z], rotation: [0, 0, Math.PI / 2], color: metal, metalness: 0.9, roughness: 0.16 });
  }
  addMechanicalDetails(a, d, body, settings, "skid");
}

function materialDimensions(material: InstalledMaterial, d: Dimensions): Vec3 {
  const parsed = typeof material.dimensions === "string" ? material.dimensions.match(/[0-9]+(?:[.,][0-9]+)?/g)?.map(value => Number(value.replace(",", "."))) : undefined;
  const width = positive(material.iddsWidth, parsed?.[0] && parsed[0] > 10 ? parsed[0] / 1000 : parsed?.[0] ?? Math.max(0.07, d.width * 0.45));
  const height = positive(material.iddsHeight, parsed?.[1] && parsed[1] > 10 ? parsed[1] / 1000 : parsed?.[1] ?? Math.max(0.04, d.height * 0.32));
  const volumeDepth = material.iddsVolumeM3 && material.iddsVolumeM3 > 0 ? material.iddsVolumeM3 / Math.max(width * height, EPSILON) : undefined;
  const depth = positive(volumeDepth, parsed?.[2] && parsed[2] > 10 ? parsed[2] / 1000 : parsed?.[2] ?? Math.max(0.06, Math.min(width, height) * 1.15));
  return [width, height, depth];
}

function addInstalledModules(a: Assembly, d: Dimensions, config: ConceptConfig) {
  for (const material of config.installedMaterials ?? []) {
    if (!material?.id) continue;
    const size = materialDimensions(material, d);
    const scale = clamp(finite(material.scale, 1), 0.05, 10);
    const position: Vec3 = [clamp(finite(material.offsetX, 0), -100, 100) * d.span / 100, -d.height * 0.7, clamp(finite(material.offsetY, 0), -100, 100) * d.length / 100];
    const accent = material.category === "payload" || material.category === "avionics" ? cyanDark : material.category === "energy" ? "#394d58" : darkMetal;
    a.add(`installed:${material.id}`, material.label || material.id, "installed-module", box(size[0], size[1], size[2]), {
      position,
      rotation: [0, rad(finite(material.iddsRotation, 0)), 0],
      scale: [scale, scale, scale],
      color: accent,
      metalness: 0.55,
      roughness: 0.32,
      hidden: material.iddsVisible === false,
    });
  }
}

function addExtraParts(a: Assembly, settings: MechanicalTwinConfig) {
  for (const extra of settings.extraParts ?? []) {
    if (!extra || typeof extra.id !== "string" || !extra.id) continue;
    const size = vec(extra.size, [0.1, 0.1, 0.1]).map(value => positive(value, 0.01)) as Vec3;
    const position = vec(extra.position, [0, 0, 0]);
    const customVertices = extra.vertices;
    const customIndices = extra.indices;
    const validCustomMesh = extra.kind === "mesh"
      && Array.isArray(customVertices)
      && Array.isArray(customIndices)
      && customVertices.length >= 9
      && customVertices.length <= 120_000
      && customVertices.length % 3 === 0
      && customIndices.length >= 3
      && customIndices.length <= 360_000
      && customIndices.length % 3 === 0
      && customVertices.every(Number.isFinite)
      && customIndices.every(index => Number.isInteger(index) && index >= 0 && index < customVertices.length / 3);
    if (extra.kind === "mesh" && !validCustomMesh) continue;
    const mesh = validCustomMesh
      ? { vertices: [...customVertices], indices: [...customIndices], size: bounds(customVertices) }
      : extra.kind === "cylinder"
        ? cylinder(Math.max(size[0], size[2]) / 2, Math.max(size[0], size[2]) / 2, size[1])
        : extra.kind === "roundedBox"
          ? roundedBox(size, finite(extra.radius, Math.min(...size) * 0.08))
          : box(size[0], size[1], size[2]);
    // L’ID est fourni par l’inspecteur (par ex. user-...) et doit rester inchangé.
    a.add(extra.id, extra.name || extra.id, "custom", mesh, { position, color: validColor(extra.color, cyan), metalness: 0.65, roughness: 0.25 });
  }
}

/** Construit une maquette déterministe, en mètres réels, à partir du drone explicitement sélectionné. */
export function buildMechanicalModel(design: DroneCatalogDesign, config: ConceptConfig): MechanicalModel {
  const settings = mechanicalSettings(design, config);
  const d = dimensions(design, config, settings);
  const palette = finishMaterial(settings.finish, settings.shellColor ?? carbon);
  const a = new Assembly(settings, palette);
  const family = correctedFamily(design, d.type);

  // A user drawing is its own geometry source: project its actual strokes into
  // the mechanical scene instead of substituting a fixed-wing/multirotor proxy.
  const drawingSource = design.id.startsWith("custom-sketch-")
    ? (config.customSketch?.strokes ?? []).filter(stroke =>
        stroke.points.length > 1 && stroke.tool !== "annotation" && stroke.tool !== "measure",
      )
    : [];
  if (drawingSource.length) {
    const paths = drawingSource.map(stroke => ({ stroke, points: sketchPathPoints(stroke) })).filter(path => path.points.length > 1);
    const allPoints = paths.flatMap(path => path.points);
    const minX = Math.min(...allPoints.map(point => point.x));
    const maxX = Math.max(...allPoints.map(point => point.x));
    const minY = Math.min(...allPoints.map(point => point.y));
    const maxY = Math.max(...allPoints.map(point => point.y));
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const mapPoint = (point: { x: number; y: number }): Vec3 => [
      ((point.x - (minX + maxX) / 2) / width) * d.span,
      0.015,
      (((minY + maxY) / 2 - point.y) / height) * d.length,
    ];
    for (const { stroke, points } of paths) {
      const mapped = points.map(mapPoint);
      const closed = stroke.tool === "rectangle" || stroke.tool === "ellipse" || Boolean(stroke.fill && stroke.fill !== "none");
      if (closed && mapped.length > 2) mapped.push(mapped[0]);
      const category = stroke.tool === "payload" ? "payload" : ["wing", "fuselage", "tail"].includes(stroke.tool) ? "airframe" : "custom";
      const radius = clamp(positive(stroke.width, 2) * Math.max(d.span / width, d.length / height) * 0.0015, 0.003, 0.035);
      for (let index = 0; index < mapped.length - 1; index++) {
        a.beam(
          `sketch-${cleanName(stroke.id)}-${index + 1}`,
          stroke.label?.trim() || `${stroke.tool} · segment ${index + 1}`,
          category,
          mapped[index],
          mapped[index + 1],
          radius,
          { color: validColor(stroke.color, cyan), metalness: 0.12, roughness: 0.48 },
        );
      }
    }
    addInstalledModules(a, d, config);
    addExtraParts(a, settings);
    const extent = mechanicalExtent(a.parts, Math.max(d.span, d.length, d.width, d.height, d.prop));
    return { designId: design.id, name: design.label, modelType: "dessin-utilisateur · géométrie issue des traits", parts: a.parts, span: d.span, length: d.length, extent, settings };
  }

  switch (d.type) {
    case "aile-volante":
      addFlyingWing(a, d, settings);
      break;
    case "stealth-wing":
      addFlyingWing(a, d, settings, true);
      break;
    case "blended-pusher":
      addFlyingWing(a, d, settings, false, true);
      break;
    case "planeur":
      addGlider(a, d, settings);
      break;
    case "hale-voilure":
      addGlider(a, d, settings, true);
      break;
    case "male-voilure":
      addGlider(a, d, settings, false, true);
      break;
    case "double-poutre":
      addDoubleBoom(a, d, settings);
      break;
    case "biplan":
      addBiplane(a, d, settings);
      break;
    case "tandem-wing":
      addTandem(a, d, settings);
      break;
    case "canard":
      addCanard(a, d, settings);
      break;
    case "effet-de-sol":
      addGroundEffect(a, d, settings);
      break;
    case "tiltrotor":
      addTiltrotor(a, d, settings);
      break;
    case "tilt-wing":
      addTiltrotor(a, d, settings, true);
      break;
    case "tail-sitter":
      addTailSitter(a, d, settings);
      break;
    case "tricoptère":
    case "hexacoptère":
    case "octocoptère":
    case "coaxial-x8":
    case "multirotor":
      addMultirotor(a, d, settings);
      break;
    case "ducted-fan":
      addMultirotor(a, d, settings, true);
      break;
    case "aérostat":
      addAerostat(a, d, settings);
      break;
    case "parapente":
      addParaglider(a, d, settings);
      break;
    case "ornithoptère":
      addOrnithopter(a, d, settings);
      break;
    case "cyclocoptère":
      addCyclocopter(a, d, settings);
      break;
    default:
      // La correction de famille reste ici (plutôt que dans droneModelProfile) pour
      // couvrir les entrées externes dont modelType est incomplet ou ancien.
      if (family === "multirotor") addMultirotor(a, d, settings, d.type === "ducted-fan");
      else if (family === "aerostat") addAerostat(a, d, settings);
      else if (family === "paraglider") addParaglider(a, d, settings);
      else if (family === "ornithopter") addOrnithopter(a, d, settings);
      else if (family === "cyclocopter") addCyclocopter(a, d, settings);
      else if (family === "ground-effect") addGroundEffect(a, d, settings);
      else if (family === "vtol") addTiltrotor(a, d, settings);
      else addConventional(a, d, settings);
  }

  addInstalledModules(a, d, config);
  addExtraParts(a, settings);
  const extent = mechanicalExtent(a.parts, Math.max(d.span, d.length, d.width, d.height, d.prop));
  return {
    designId: design.id,
    name: design.label,
    modelType: d.type,
    parts: a.parts,
    span: d.span,
    length: d.length,
    extent,
    settings,
  };
}

function sketchPathPoints(stroke: DroneSketchStroke): Array<{ x: number; y: number }> {
  const [first, second] = [stroke.points[0], stroke.points[1]];
  if ((stroke.tool === "ellipse" || stroke.tool === "rectangle") && first && second) {
    const left = Math.min(first.x, second.x), right = Math.max(first.x, second.x);
    const top = Math.min(first.y, second.y), bottom = Math.max(first.y, second.y);
    if (stroke.tool === "rectangle") return [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }];
    return Array.from({ length: 25 }, (_, index) => {
      const angle = (index / 24) * Math.PI * 2;
      return { x: (left + right) / 2 + Math.cos(angle) * (right - left) / 2, y: (top + bottom) / 2 + Math.sin(angle) * (bottom - top) / 2 };
    });
  }
  return stroke.points;
}

/** Dimension maximale du volume monde : utile à un cadrage caméra indépendant de l’axe. */
function mechanicalExtent(parts: MechanicalPart[], fallback: number) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const part of parts) {
    const vertices = transformedPartVertices(part);
    for (let index = 0; index < vertices.length; index += 3) {
      minX = Math.min(minX, vertices[index]);
      minY = Math.min(minY, vertices[index + 1]);
      minZ = Math.min(minZ, vertices[index + 2]);
      maxX = Math.max(maxX, vertices[index]);
      maxY = Math.max(maxY, vertices[index + 1]);
      maxZ = Math.max(maxZ, vertices[index + 2]);
    }
  }
  if (!Number.isFinite(minX)) return fallback;
  return Math.max(fallback, maxX - minX, maxY - minY, maxZ - minZ);
}

function rotateXYZ(point: Vec3, rotation: Vec3): Vec3 {
  const [rx, ry, rz] = rotation;
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);
  const y1 = point[1] * cx - point[2] * sx;
  const z1 = point[1] * sx + point[2] * cx;
  const x2 = point[0] * cy + z1 * sy;
  const z2 = -point[0] * sy + z1 * cy;
  return [x2 * cz - y1 * sz, x2 * sz + y1 * cz, z2];
}

function explosionOffset(part: MechanicalPart, explosion: number): Vec3 {
  if (!explosion) return [0, 0, 0];
  const amount = Math.max(0, finite(explosion, 0));
  const radialLength = Math.hypot(part.position[0], part.position[1], part.position[2]) || 1;
  const radial: Vec3 = [part.position[0] / radialLength, part.position[1] / radialLength, part.position[2] / radialLength];
  const category: Record<string, Vec3> = {
    airframe: [0, 0, 0],
    propulsion: [radial[0] * 0.16, radial[1] * 0.08, radial[2] * 0.16],
    energy: [0, 0.1, 0.05],
    avionics: [0, 0.12, -0.08],
    payload: [0, -0.18, -0.05],
    "landing-gear": [0, -0.16, 0.02],
    hardware: [radial[0] * 0.04, radial[1] * 0.04, radial[2] * 0.04],
    "installed-module": [0, -0.1, 0.1],
    custom: [0, 0.08, 0.08],
  };
  const shift = category[part.category] ?? [0, 0, 0];
  return [shift[0] * amount, shift[1] * amount, shift[2] * amount];
}

/**
 * Applique l’échelle, la rotation puis la position à un tableau de vertices local.
 * L’éclatement est une vue temporaire : il ne modifie jamais la configuration ni la pièce.
 */
export function transformedPartVertices(part: MechanicalPart, explosion = 0): number[] {
  const result: number[] = [];
  const shift = explosionOffset(part, explosion);
  for (let index = 0; index < part.vertices.length; index += 3) {
    const scaled: Vec3 = [part.vertices[index] * part.scale[0], part.vertices[index + 1] * part.scale[1], part.vertices[index + 2] * part.scale[2]];
    const rotated = rotateXYZ(scaled, part.rotation);
    result.push(rotated[0] + part.position[0] + shift[0], rotated[1] + part.position[1] + shift[1], rotated[2] + part.position[2] + shift[2]);
  }
  return result;
}

const objNumber = (value: number) => (Number.isFinite(value) ? value.toFixed(6).replace(/\.?(?:0+)$/, "") || "0" : "0");

/** Exporte les pièces visibles et éditées au format OBJ triangulé, sans éclatement de présentation. */
export function exportMechanicalOBJ(model: MechanicalModel): string {
  const lines = [`# AeroMind Mechanical Twin`, `# ${model.name} (${model.designId})`, `# metres; X=span Y=up Z=length`];
  let offset = 1;
  for (const part of model.parts) {
    if (part.hidden || !part.vertices.length || !part.indices.length) continue;
    const vertices = transformedPartVertices(part);
    lines.push(`o ${cleanName(part.id)}`, `g ${cleanName(part.name)}`);
    for (let index = 0; index < vertices.length; index += 3) lines.push(`v ${objNumber(vertices[index])} ${objNumber(vertices[index + 1])} ${objNumber(vertices[index + 2])}`);
    for (let index = 0; index + 2 < part.indices.length; index += 3) {
      const a = part.indices[index] + offset;
      const b = part.indices[index + 1] + offset;
      const c = part.indices[index + 2] + offset;
      lines.push(`f ${a} ${b} ${c}`);
    }
    offset += vertices.length / 3;
  }
  return `${lines.join("\n")}\n`;
}

/** Exporte les pièces visibles en STL ASCII triangulé (coordonnées en mètres). */
export function exportMechanicalSTL(model: MechanicalModel): string {
  const lines = [`solid ${cleanName(model.designId)}`, `  // ${model.name} · unités : mètres · géométrie conceptuelle`];
  for (const part of model.parts) {
    if (part.hidden || !part.vertices.length || !part.indices.length) continue;
    const vertices = transformedPartVertices(part);
    for (let index = 0; index + 2 < part.indices.length; index += 3) {
      const ids = [part.indices[index], part.indices[index + 1], part.indices[index + 2]];
      const a: Vec3 = [vertices[ids[0] * 3], vertices[ids[0] * 3 + 1], vertices[ids[0] * 3 + 2]];
      const b: Vec3 = [vertices[ids[1] * 3], vertices[ids[1] * 3 + 1], vertices[ids[1] * 3 + 2]];
      const c: Vec3 = [vertices[ids[2] * 3], vertices[ids[2] * 3 + 1], vertices[ids[2] * 3 + 2]];
      const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const ac: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const normal: Vec3 = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
      const length = Math.hypot(...normal) || 1;
      lines.push(`  facet normal ${normal.map(value => objNumber(value / length)).join(" ")}`, "    outer loop", `      vertex ${a.map(objNumber).join(" ")}`, `      vertex ${b.map(objNumber).join(" ")}`, `      vertex ${c.map(objNumber).join(" ")}`, "    endloop", "  endfacet");
    }
  }
  lines.push("endsolid");
  return `${lines.join("\n")}\n`;
}
