import * as THREE from "three";
import { apiFetch } from "./apiFetch";
import { bearerHeaders } from "./sessionToken";

export type CadPoint = [number, number, number];
export type CadProperties = {
  volume_mm3: number;
  mass_kg: number | null;
  center_of_gravity_mm: CadPoint | null;
  center_of_volume_mm?: CadPoint | null;
  integration_relative_error_estimate?: number | null;
  max_topology_tolerance_mm?: number;
};
export type CadFace = {
  id: string;
  positions: number[];
  normals: number[];
  indices: number[];
  anchor_mm: CadPoint;
  surface_type: string;
  is_section_cap: boolean;
};
export type CadPart = {
  id: string;
  name: string;
  material_id: string | null;
  properties: CadProperties;
  faces: CadFace[];
};
export type CadAssemblyNode = {
  id: string;
  name: string;
  parent_id: string | null;
  part_id?: string;
  transform?: number[];
};
export type CadPmi = {
  id: string;
  part_id: string;
  face_id: string;
  anchor_mm: CadPoint;
  kind: string;
  text: string;
  nominal_mm?: number | null;
  tolerance_um?: number | null;
  datum?: string | null;
  upper_tolerance_um?: number;
  lower_tolerance_um?: number;
  lower_bound_mm?: number;
  upper_bound_mm?: number;
  semantic_type?: string;
  semantic_modifiers?: string[];
  unsupported_gdt_symbol?: boolean;
  source: "xde" | "user" | "demo";
};
export type CadSectionPlane = { normal: CadPoint; offset_mm: number };
export type CadDocument = {
  model_id: string;
  name: string;
  source: { format: string; schema: string | null; sha256: string };
  units: "mm";
  kernel: string | Record<string, unknown>;
  parts: CadPart[];
  assembly: CadAssemblyNode[];
  properties: CadProperties;
  pmi: CadPmi[];
  warnings: string[];
  section?: CadSectionPlane & { elapsed_ms: number };
};
export type CadMaterial = {
  id: string;
  name: string;
  density_kg_m3: number;
  pbr: { color: string; metalness: number; roughness: number; anisotropy?: number };
  source: string;
  calibration_status: string;
};
// Capability fields may be extended by the server; unknown flags are never inferred true.
export type CadCapabilities = {
  available?: boolean;
  kernel_available?: boolean;
  kernel?: string | Record<string, unknown>;
  reason?: string;
  message?: string;
  import_formats?: string[];
  formats?: string[];
  features?: string[] | Record<string, boolean>;
  solid_brep?: boolean;
  step_export?: { schema?: string; pmi?: boolean; limitation?: string };
  pmi?: { xde_semantic_import?: string; unsupported?: string[] };
  [key: string]: unknown;
};
export type CadPmiInput = {
  part_id: string;
  face_id: string;
  kind: string;
  nominal_mm: number | null;
  tolerance_um: number | null;
  datum: string;
  text: string;
};
export type CadSelection = { partId: string; faceId: string };

export class CadApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "CadApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(bearerHeaders());
  new Headers(init.headers).forEach((value, name) => headers.set(name, value));
  const response = await apiFetch(`/api/cad${path}`, { ...init, headers, credentials: "include" });
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("json") ? await response.json() : null;
  if (!response.ok) {
    const detail = typeof payload?.detail === "string" ? payload.detail
      : typeof payload?.detail?.message === "string" ? payload.detail.message
      : typeof payload?.message === "string" ? payload.message : null;
    const fallback = response.status === 401 ? "Authentification requise pour accéder à vos imports."
      : response.status === 403 ? "Accès refusé : vérifier votre session et la protection CSRF."
      : response.status === 503 ? "Noyau CAO indisponible. Aucune géométrie de substitution."
      : `Le service CAO a répondu HTTP ${response.status}.`;
    throw new CadApiError(detail ?? fallback, response.status);
  }
  if (payload === null) throw new CadApiError("Réponse CAO non JSON : vérifier le routage de /api/cad.", response.status);
  return payload as T;
}

const jsonPost = (body: unknown, signal?: AbortSignal): RequestInit => ({
  method: "POST", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const modelPath = (id: string) => `/models/${encodeURIComponent(id)}`;
const documentRequest = async (path: string, init?: RequestInit) => validateCadDocument(await request<CadDocument>(path, init));

export const solidCadApi = {
  capabilities: (signal?: AbortSignal) => request<CadCapabilities>("/capabilities", { signal }),
  materials: async (signal?: AbortSignal) => (await request<{ materials: CadMaterial[] }>("/materials", { signal })).materials,
  demo: (signal?: AbortSignal) => documentRequest("/demo", { signal }),
  model: (id: string, signal?: AbortSignal) => documentRequest(modelPath(id), { signal }),
  import: async (file: File, signal?: AbortSignal) => {
    if (!/\.(step|stp|brep)$/i.test(file.name)) throw new Error("Choisissez un fichier STEP (.step/.stp) ou BREP (.brep).");
    const body = new FormData();
    body.append("file", file);
    return documentRequest("/imports", { method: "POST", body, signal });
  },
  section: async (id: string, demo: boolean, plane: CadSectionPlane, signal?: AbortSignal) => {
    const requested = validateSectionPlane(plane);
    const result = await documentRequest(demo ? "/demo/section" : `${modelPath(id)}/section`, jsonPost(requested, signal));
    if (!result.section || Math.abs(result.section.offset_mm - requested.offset_mm) > 1e-6
      || requested.normal.some((value, axis) => Math.abs(value - result.section!.normal[axis]) > 1e-6)) {
      throw new Error("Résultat de coupe invalide : le plan calculé ne correspond pas au plan demandé.");
    }
    return result;
  },
  assignMaterials: (id: string, assignments: Record<string, string>, signal?: AbortSignal) =>
    documentRequest(`${modelPath(id)}/materials`, jsonPost({ assignments }, signal)),
  addPmi: (id: string, input: CadPmiInput, signal?: AbortSignal) =>
    documentRequest(`${modelPath(id)}/pmi`, jsonPost(validatePmiInput(input), signal)),
  demoStepUrl: "/api/cad/demo/step",
};

const finitePoint = (value: unknown): value is CadPoint => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
const finiteArray = (value: unknown): value is number[] => Array.isArray(value) && value.every(Number.isFinite);
function validateProperties(value: CadProperties) {
  if (!value || !Number.isFinite(value.volume_mm3) || value.volume_mm3 < 0
    || (value.mass_kg !== null && (!Number.isFinite(value.mass_kg) || value.mass_kg < 0))
    || (value.center_of_gravity_mm !== null && !finitePoint(value.center_of_gravity_mm))
    || (value.center_of_volume_mm != null && !finitePoint(value.center_of_volume_mm))) {
    throw new Error("Propriétés physiques CAO invalides : les valeurs inconnues doivent être null.");
  }
}

/** Reject corrupt/native-incompatible buffers instead of manufacturing a fallback mesh. */
export function validateCadDocument(doc: CadDocument): CadDocument {
  if (!doc || doc.units !== "mm" || typeof doc.model_id !== "string" || !doc.source
    || !Array.isArray(doc.parts) || !Array.isArray(doc.assembly) || !Array.isArray(doc.pmi)) {
    throw new Error("Document CAO incompatible avec le contrat B-Rep en millimètres.");
  }
  validateProperties(doc.properties);
  const partIds = new Set<string>();
  for (const part of doc.parts) {
    if (!part.id || partIds.has(part.id) || !Array.isArray(part.faces)) throw new Error("Identifiants de pièces CAO invalides.");
    partIds.add(part.id);
    validateProperties(part.properties);
    const faceIds = new Set<string>();
    for (const face of part.faces) {
      if (!face.id || faceIds.has(face.id) || !finiteArray(face.positions) || face.positions.length < 9 || face.positions.length % 3
        || !finiteArray(face.normals) || face.normals.length !== face.positions.length
        || !Array.isArray(face.indices) || face.indices.length < 3 || face.indices.length % 3
        || face.indices.some(index => !Number.isInteger(index) || index < 0 || index >= face.positions.length / 3)
        || !finitePoint(face.anchor_mm)) throw new Error(`Tessellation native invalide pour la face ${face.id ?? "inconnue"}.`);
      faceIds.add(face.id);
    }
  }
  for (const pmi of doc.pmi) {
    if (!finitePoint(pmi.anchor_mm) || !pmi.part_id || !pmi.face_id) throw new Error("Ancrage PMI natif invalide.");
    for (const value of [pmi.nominal_mm, pmi.tolerance_um, pmi.upper_tolerance_um, pmi.lower_tolerance_um, pmi.lower_bound_mm, pmi.upper_bound_mm]) {
      if (value != null && !Number.isFinite(value)) throw new Error("Valeur sémantique PMI non finie.");
    }
  }
  if (doc.section) {
    validateSectionPlane(doc.section);
    if (!Number.isFinite(doc.section.elapsed_ms) || doc.section.elapsed_ms < 0) throw new Error("Durée de calcul serveur invalide.");
  }
  return doc;
}

export function validateSectionPlane(plane: CadSectionPlane): CadSectionPlane {
  if (!finitePoint(plane.normal) || !Number.isFinite(plane.offset_mm)) throw new Error("Plan de coupe invalide.");
  const length = Math.hypot(...plane.normal);
  if (length < 1e-9) throw new Error("La normale du plan doit être non nulle.");
  // offset_mm is a signed distance along the normalized normal, as in the kernel API.
  return { normal: plane.normal.map(value => value / length) as CadPoint, offset_mm: plane.offset_mm };
}

export function validatePmiInput(input: CadPmiInput): CadPmiInput {
  if (!input.part_id || !input.face_id || !input.kind.trim() || !input.text.trim()) throw new Error("Sélectionnez une face et renseignez le type et le texte PMI.");
  if (input.nominal_mm !== null && (!Number.isFinite(input.nominal_mm) || input.nominal_mm < 0 || input.nominal_mm > 1e9)) throw new Error("La dimension nominale doit être un nombre fini entre 0 et 10⁹ mm.");
  const toleranceRequired = !["material", "note", "datum"].includes(input.kind.trim());
  if ((input.tolerance_um === null && toleranceRequired) || (input.tolerance_um !== null && (!Number.isFinite(input.tolerance_um) || input.tolerance_um < 0 || input.tolerance_um > 1e9))) throw new Error("La tolérance doit être un nombre fini entre 0 et 10⁹ µm.");
  if (input.datum.trim().length > 32) throw new Error("Le référentiel / datum est limité à 32 caractères.");
  return { ...input, kind: input.kind.trim(), datum: input.datum.trim(), text: input.text.trim() };
}

export function parsePmiNumbers(nominal: string, tolerance: string) {
  const number = (value: string) => {
    const decimal = value.trim().replace(",", ".");
    return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(decimal) ? Number(decimal) : NaN;
  };
  const nominal_mm = nominal.trim() === "" ? null : number(nominal);
  const tolerance_um = tolerance.trim() === "" ? NaN : number(tolerance);
  if (nominal_mm !== null && (!Number.isFinite(nominal_mm) || nominal_mm < 0 || nominal_mm > 1e9)) throw new Error("Dimension nominale invalide : de 0 à 10⁹ mm.");
  if (!Number.isFinite(tolerance_um) || tolerance_um < 0 || tolerance_um > 1e9) throw new Error("Tolérance invalide : saisir une valeur de 0 à 10⁹ µm.");
  return { nominal_mm, tolerance_um };
}

/** A section changes the actual solids/properties, not source provenance or PMI anchors. */
export function preserveCadSource(source: CadDocument, section: CadDocument): CadDocument {
  if (source.model_id !== section.model_id || source.source.sha256 !== section.source.sha256) throw new Error("La coupe reçue appartient à une autre source CAO.");
  return { ...section, source: source.source, assembly: source.assembly, pmi: source.pmi,
    warnings: [...new Set([...(source.warnings ?? []), ...(section.warnings ?? [])])] };
}

/** A retained face may have a removed original anchor; never move its PMI to the trimmed face. */
export function cadPmiIsVisible(doc: CadDocument, pmi: CadPmi) {
  const facePresent = doc.parts.some(part => part.id === pmi.part_id && part.faces.some(face => face.id === pmi.face_id && !face.is_section_cap));
  if (!facePresent) return false;
  if (!doc.section) return true;
  const dot = pmi.anchor_mm.reduce((sum, value, axis) => sum + value * doc.section!.normal[axis], 0);
  return dot <= doc.section.offset_mm + 1e-7;
}

export function cadBounds(doc: CadDocument) {
  const min: CadPoint = [Infinity, Infinity, Infinity];
  const max: CadPoint = [-Infinity, -Infinity, -Infinity];
  for (const part of doc.parts) for (const face of part.faces) {
    for (let i = 0; i < face.positions.length; i += 3) for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], face.positions[i + axis]);
      max[axis] = Math.max(max[axis], face.positions[i + axis]);
    }
  }
  if (!min.every(Number.isFinite)) return null;
  const center = min.map((value, axis) => (value + max[axis]) / 2) as CadPoint;
  return { min, max, center, span: Math.max(1, ...max.map((value, axis) => value - min[axis])) };
}

/** XYZ buffers remain in CAD world mm; assembly transforms are deliberately not reapplied. */
export function createCadFaceGeometry(face: CadFace): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(face.positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(face.normals, 3));
  geometry.setIndex(face.indices);
  // Planar metric projection: one UV unit is 1 mm, independent of tessellation density.
  const sums = [0, 0, 0];
  for (let i = 0; i < face.normals.length; i++) sums[i % 3] += Math.abs(face.normals[i]);
  const dominant = sums.indexOf(Math.max(...sums));
  const u = (dominant + 1) % 3, v = (dominant + 2) % 3;
  const uv: number[] = [];
  for (let i = 0; i < face.positions.length; i += 3) uv.push(face.positions[i + u], face.positions[i + v]);
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeTangents();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Nominal 2×2 twill, 4 mm repeat; a technical display texture, not measured BRDF data. */
export function createCarbonTextures(size = 128) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const over = (Math.floor(x / (size / 4)) + Math.floor(y / (size / 4))) % 4 < 2;
    const across = over ? y : x;
    const fiber = 0.5 + 0.5 * Math.cos(across * Math.PI / 2);
    const value = Math.round((over ? 106 : 73) + fiber * 24);
    const offset = (y * size + x) * 4;
    data.set([value, value, value, 255], offset);
  }
  const texture = (colorSpace: typeof THREE.SRGBColorSpace | typeof THREE.NoColorSpace) => {
    const result = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    result.colorSpace = colorSpace;
    result.wrapS = result.wrapT = THREE.RepeatWrapping;
    result.repeat.set(1 / 4, 1 / 4);
    result.generateMipmaps = true;
    result.minFilter = THREE.LinearMipmapLinearFilter;
    result.magFilter = THREE.LinearFilter;
    result.needsUpdate = true;
    return result;
  };
  return { map: texture(THREE.SRGBColorSpace), bump: texture(THREE.NoColorSpace) };
}

/** Abort plus sequence guard: also rejects late replies from transports ignoring abort. */
export class LatestCadRequest {
  private sequence = 0;
  private controller: AbortController | null = null;
  start() {
    this.cancel();
    const sequence = this.sequence;
    const controller = new AbortController();
    this.controller = controller;
    return { signal: controller.signal, isCurrent: () => this.sequence === sequence && !controller.signal.aborted };
  }
  cancel() {
    this.sequence++;
    this.controller?.abort();
    this.controller = null;
  }
}
export const isCadAbort = (error: unknown) => error instanceof Error && error.name === "AbortError";
export const cadNumber = (value: number | null | undefined, digits = 3) => value == null ? "Inconnue" : new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits }).format(value);
export const cadPointText = (point: CadPoint | null | undefined) => point ? point.map(value => cadNumber(value)).join(" / ") : "Non défini";

/** Preserve XDE dimensional limits; GD&T values are zone widths, not ± deviations. */
export function cadPmiTolerance(pmi: CadPmi): string {
  if (pmi.lower_bound_mm != null && pmi.upper_bound_mm != null) return `${cadNumber(pmi.lower_bound_mm, 6)} … ${cadNumber(pmi.upper_bound_mm, 6)} mm`;
  if (pmi.upper_tolerance_um != null && pmi.lower_tolerance_um != null) return `+${cadNumber(pmi.upper_tolerance_um, 6)} / −${cadNumber(pmi.lower_tolerance_um, 6)} µm`;
  if (pmi.tolerance_um == null) return "—";
  return `${pmi.kind === "dimension" ? "± " : ""}${cadNumber(pmi.tolerance_um, 6)} µm`;
}

export function cadGdtSymbol(pmi: CadPmi): string {
  if (pmi.unsupported_gdt_symbol) return "GD&T non interprété";
  const symbols: Record<string, string> = { flatness: "⏥", parallelism: "∥", perpendicularity: "⊥", position: "⌖", circularity: "○", cylindricity: "⌭", profile: "⌓", runout: "↗" };
  return symbols[pmi.kind] ?? pmi.kind;
}

/** A remembered ID alone cannot suppress a reload after its source was cleared. */
export function cadModelIsInstalled(source: CadDocument | null, installedId: string | null, requestedId: string | null): boolean {
  return !!source && installedId === requestedId && (requestedId === null || source.model_id === requestedId);
}
