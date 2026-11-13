import type { DroneCatalogDesign } from "./droneCatalog";
export type MeshBounds = { min: [number, number, number]; max: [number, number, number]; vertexCount: number };
export type ImportArchitecture = "fixed-wing" | "quadcopter" | "vtol" | "other";
export type Axis = "x" | "y" | "z";
export type AxisMapping = { span: Axis; length: Axis; height: Axis };
export type ImportedDroneMatch = { design: DroneCatalogDesign; sourceName: string; sourceDimensions: [number, number, number]; architecture: ImportArchitecture; selectedProfile: string };
export type ImportedDroneReviewStatus = "evaluation" | "accepted";
export type ImportedDroneWorkflowEvent = { action: "imported-for-evaluation" | "accepted" | "returned-to-evaluation" | "legacy-import-requires-review"; at: string };
export type ImportedDroneWorkflow = { status: ImportedDroneReviewStatus; updatedAt: string; acceptedAt?: string; history: ImportedDroneWorkflowEvent[] };
export type ImportedDroneProfile = DroneCatalogDesign & { libraryWorkflow: ImportedDroneWorkflow };
export const IMPORTED_DRONE_PROFILES_KEY = "aeromind-imported-cell-profiles-v1";
const DELETED_PROFILE_IDS_KEY = `${IMPORTED_DRONE_PROFILES_KEY}-deleted-v1`;
const DB_NAME = "aeromind-local-library";
const DB_STORE = "imported-cell-profiles";
const MAX_VERTICES = 1_000_000;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
function boundsAccumulator() {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let vertexCount = 0;
  return {
    add(x: number, y: number, z: number) {
      if (![x, y, z].every(Number.isFinite)) return;
      if (++vertexCount > MAX_VERTICES) throw new Error("La maquette contient trop de sommets (limite : 1 000 000).");
      [x, y, z].forEach((value, axis) => { min[axis] = Math.min(min[axis], value); max[axis] = Math.max(max[axis], value); });
    },
    finish(): MeshBounds {
      if (vertexCount < 3) throw new Error("Aucune géométrie exploitable : fichier OBJ/STL sans sommets valides.");
      return { min, max, vertexCount };
    },
  };
}
function parseObj(text: string): MeshBounds {
  const bounds = boundsAccumulator();
  for (const line of text.split(/\r?\n/)) {
    const match = line.trim().match(/^v\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/);
    if (match) bounds.add(Number(match[1]), Number(match[2]), Number(match[3]));
  }
  return bounds.finish();
}
function parseAsciiStl(text: string): MeshBounds {
  const bounds = boundsAccumulator();
  for (const match of text.matchAll(/\bvertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/gi)) bounds.add(Number(match[1]), Number(match[2]), Number(match[3]));
  return bounds.finish();
}
function parseBinaryStl(buffer: ArrayBuffer): MeshBounds | null {
  if (buffer.byteLength < 84) return null;
  const view = new DataView(buffer), triangles = view.getUint32(80, true);
  if (triangles < 1 || triangles > MAX_VERTICES / 3 || 84 + triangles * 50 !== buffer.byteLength) return null;
  const bounds = boundsAccumulator();
  for (let triangle = 0; triangle < triangles; triangle++) for (let point = 0; point < 3; point++) {
    const offset = 84 + triangle * 50 + 12 + point * 12;
    bounds.add(view.getFloat32(offset, true), view.getFloat32(offset + 4, true), view.getFloat32(offset + 8, true));
  }
  return bounds.finish();
}
export function parseExternalDroneMesh(fileName: string, contents: ArrayBuffer | string): MeshBounds {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "obj") return parseObj(typeof contents === "string" ? contents : new TextDecoder().decode(contents));
  if (ext === "stl") {
    if (typeof contents === "string") return parseAsciiStl(contents);
    return parseBinaryStl(contents) ?? parseAsciiStl(new TextDecoder().decode(contents));
  }
  throw new Error("Format non pris en charge. Choisissez un fichier .OBJ ou .STL.");
}
export function getMeshDimensions(bounds: MeshBounds, unitToMeters: number, axes: AxisMapping): [number, number, number] {
  if (!Number.isFinite(unitToMeters) || unitToMeters <= 0) throw new Error("Unité de maquette invalide.");
  if (new Set([axes.span, axes.length, axes.height]).size !== 3) throw new Error("Choisissez un axe différent pour l’envergure, la longueur et la hauteur.");
  const indexes = { x: 0, y: 1, z: 2 } as const;
  const dim = (axis: Axis) => Math.abs(bounds.max[indexes[axis]] - bounds.min[indexes[axis]]) * unitToMeters;
  const dimensions: [number, number, number] = [dim(axes.span), dim(axes.length), dim(axes.height)];
  if (dimensions.some(value => !Number.isFinite(value) || value <= 0 || value > 30)) throw new Error("Dimensions nulles ou supérieures à 30 m après conversion. Vérifiez l’unité et le mappage des axes.");
  return dimensions;
}
function safeStem(fileName: string) {
  const leaf = fileName.split(/[\\/]/).pop() ?? "Maquette importée";
  return leaf.replace(/\.[^.]+$/, "").replace(/[<>\u0000-\u001f]/g, " ").trim().slice(0, 48) || "Maquette importée";
}
export function adaptExternalDroneToCatalog(fileName: string, bounds: MeshBounds, unitToMeters: number, catalog: DroneCatalogDesign[], architecture: ImportArchitecture = "other", axes: AxisMapping = { span: "x", length: "y", height: "z" }): ImportedDroneMatch {
  if (!catalog.length) throw new Error("La bibliothèque de cellules est vide.");
  const [span, length, height] = getMeshDimensions(bounds, unitToMeters, axes);
  const candidatesByArchitecture = architecture === "other" ? catalog : catalog.filter(item => item.key === architecture);
  const candidates = candidatesByArchitecture.length ? candidatesByArchitecture : catalog;
  const ratio = span / length;
  const selected = candidates.reduce((best, item) => {
    const candidateRatio = (item.configuration.wingspan ?? 1) / Math.max(item.configuration.fuselageLength ?? 1, .01);
    const bestRatio = (best.configuration.wingspan ?? 1) / Math.max(best.configuration.fuselageLength ?? 1, .01);
    return Math.abs(Math.log(ratio / candidateRatio)) < Math.abs(Math.log(ratio / bestRatio)) ? item : best;
  });
  const scale = span / Math.max(selected.configuration.wingspan ?? 1, .05), stem = safeStem(fileName);
  const id = `import-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const design: DroneCatalogDesign = {
    ...selected, id, label: stem,
    family: `Maquette importée · architecture ${architecture === "other" ? "à confirmer" : architecture}`,
    mission: `Profil dimensionnel de « ${stem} ». Architecture choisie par l’utilisateur : ${architecture}. Rapprochement de paramètres uniquement; géométrie source non intégrée. Vérification humaine requise.`,
    specs: `${span.toFixed(3)} m d’envergure déclarée · ${length.toFixed(3)} m de longueur · ${height.toFixed(3)} m de hauteur`,
    disciplines: `Source ${fileName.split(/[\\/]/).pop()} · profil de référence ${selected.label} · axes ${axes.span.toUpperCase()}/${axes.length.toUpperCase()}/${axes.height.toUpperCase()}`,
    origin: "prototype-reference", referenceLabel: "Profil dimensionnel indicatif — maillage source non conservé; architecture à vérifier",
    configuration: { ...selected.configuration, airframe: selected.key, wingspan: span, fuselageLength: length,
      chord: clamp((selected.configuration.chord ?? length * .22) * scale, .06, Math.max(.08, span * .45)),
      propDiameter: clamp((selected.configuration.propDiameter ?? .3) * Math.min(scale, 3), .08, Math.max(.1, span * .45)),
      motorCount: selected.configuration.motorCount ?? 1 },
  };
  return { design, sourceName: fileName.split(/[\\/]/).pop() ?? fileName, sourceDimensions: [span, length, height], architecture, selectedProfile: selected.label };
}
export function initializeImportedDroneProfile(design: DroneCatalogDesign, at = new Date().toISOString()): ImportedDroneProfile {
  return { ...design, libraryWorkflow: { status: "evaluation", updatedAt: at, history: [{ action: "imported-for-evaluation", at }] } };
}

export function normalizeImportedDroneProfile(value: unknown, at = new Date().toISOString()): ImportedDroneProfile | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as DroneCatalogDesign & { libraryWorkflow?: Partial<ImportedDroneWorkflow> };
  if (typeof candidate.id !== "string" || !candidate.id.startsWith("import-") || typeof candidate.label !== "string" || typeof candidate.key !== "string" || !candidate.configuration || typeof candidate.configuration !== "object") return null;
  const raw = candidate.libraryWorkflow;
  if (raw?.status !== "evaluation" && raw?.status !== "accepted") {
    return { ...candidate, libraryWorkflow: { status: "evaluation", updatedAt: at, history: [{ action: "legacy-import-requires-review", at }] } };
  }
  const history = Array.isArray(raw.history) ? raw.history.filter((event): event is ImportedDroneWorkflowEvent => Boolean(event && typeof event === "object" && ["imported-for-evaluation", "accepted", "returned-to-evaluation", "legacy-import-requires-review"].includes((event as ImportedDroneWorkflowEvent).action) && typeof (event as ImportedDroneWorkflowEvent).at === "string")).slice(-30) : [];
  return { ...candidate, libraryWorkflow: { status: raw.status, updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : at, acceptedAt: typeof raw.acceptedAt === "string" ? raw.acceptedAt : undefined, history } };
}

export function transitionImportedDroneProfile(profile: ImportedDroneProfile, status: ImportedDroneReviewStatus, at = new Date().toISOString()): ImportedDroneProfile {
  const action: ImportedDroneWorkflowEvent["action"] = status === "accepted" ? "accepted" : "returned-to-evaluation";
  return { ...profile, libraryWorkflow: { status, updatedAt: at, acceptedAt: status === "accepted" ? at : undefined, history: [...profile.libraryWorkflow.history, { action, at }].slice(-30) } };
}

function validProfiles(value: unknown): ImportedDroneProfile[] {
  if (!Array.isArray(value)) return [];
  return value.map(item => normalizeImportedDroneProfile(item)).filter((item): item is ImportedDroneProfile => Boolean(item)).slice(-40);
}
function loadDeletedProfileIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(DELETED_PROFILE_IDS_KEY) ?? "[]");
    return new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === "string" && id.startsWith("import-")) : []);
  } catch { return new Set(); }
}
function persistDeletedProfileIds(ids: Set<string>): boolean {
  if (typeof window === "undefined") return false;
  try { window.localStorage.setItem(DELETED_PROFILE_IDS_KEY, JSON.stringify([...ids].slice(-200))); return true; } catch { return false; }
}
export function loadImportedDroneProfiles(): ImportedDroneProfile[] {
  if (typeof window === "undefined") return [];
  try {
    const deleted = loadDeletedProfileIds();
    return validProfiles(JSON.parse(window.localStorage.getItem(IMPORTED_DRONE_PROFILES_KEY) ?? "[]")).filter(profile => !deleted.has(profile.id));
  } catch { return []; }
}
function openProfileDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise(resolve => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(DB_STORE)) request.result.createObjectStore(DB_STORE, { keyPath: "id" }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}
export async function loadImportedDroneProfilesDurable(): Promise<ImportedDroneProfile[]> {
  const legacy = loadImportedDroneProfiles(), db = await openProfileDb();
  if (!db) return legacy;
  return new Promise(resolve => {
    const request = db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).getAll();
    request.onsuccess = () => {
      const records = Array.isArray(request.result) ? request.result as Array<Record<string, unknown>> : [];
      const deleted = loadDeletedProfileIds();
      records.forEach(record => { if (typeof record.deletedProfileId === "string") deleted.add(record.deletedProfileId); });
      const profiles = validProfiles(records).filter(profile => !deleted.has(profile.id));
      resolve([...legacy, ...profiles].reduce<ImportedDroneProfile[]>((all, item) => [...all.filter(entry => entry.id !== item.id), item], []).slice(-40));
      db.close();
    };
    request.onerror = () => { resolve(legacy); db.close(); };
  });
}
export async function saveImportedDroneProfile(profile: ImportedDroneProfile | DroneCatalogDesign): Promise<void> {
  const normalized = normalizeImportedDroneProfile(profile);
  if (!normalized) throw new Error("Profil importé invalide.");
  let savedLocally = false;
  if (typeof window !== "undefined") try {
    const deleted = loadDeletedProfileIds(); deleted.delete(normalized.id);
    persistDeletedProfileIds(deleted);
    window.localStorage.setItem(IMPORTED_DRONE_PROFILES_KEY, JSON.stringify([...loadImportedDroneProfiles().filter(item => item.id !== normalized.id), normalized].slice(-40)));
    savedLocally = true;
  } catch { /* try IndexedDB below */ }
  const db = await openProfileDb();
  let savedInDb = false;
  if (db) {
    savedInDb = await new Promise<boolean>(resolve => {
      const transaction = db.transaction(DB_STORE, "readwrite"), store = transaction.objectStore(DB_STORE);
      store.put(normalized); store.delete(`deleted:${normalized.id}`);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = transaction.onabort = () => resolve(false);
    }).finally(() => db.close());
  }
  if (!savedLocally && !savedInDb) throw new Error("Le navigateur n’a pas permis d’enregistrer ce profil localement.");
}
export async function deleteImportedDroneProfile(profileId: string): Promise<void> {
  if (!profileId.startsWith("import-")) throw new Error("Seuls les profils importés peuvent être supprimés de cette bibliothèque.");
  let savedLocally = false;
  if (typeof window !== "undefined") try {
    const deleted = loadDeletedProfileIds(); deleted.add(profileId);
    persistDeletedProfileIds(deleted);
    window.localStorage.setItem(IMPORTED_DRONE_PROFILES_KEY, JSON.stringify(loadImportedDroneProfiles().filter(profile => profile.id !== profileId)));
    savedLocally = true;
  } catch { /* try IndexedDB below */ }
  const db = await openProfileDb();
  let savedInDb = false;
  if (db) {
    savedInDb = await new Promise<boolean>(resolve => {
      const transaction = db.transaction(DB_STORE, "readwrite"), store = transaction.objectStore(DB_STORE);
      store.delete(profileId); store.put({ id: `deleted:${profileId}`, deletedProfileId: profileId });
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = transaction.onabort = () => resolve(false);
    }).finally(() => db.close());
  }
  if (!savedLocally && !savedInDb) throw new Error("Le profil n’a pas pu être supprimé localement; il est conservé dans la bibliothèque.");
}
