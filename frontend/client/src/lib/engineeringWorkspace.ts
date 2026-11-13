export type EngineeringFolder = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
};

export type EngineeringDocumentKind = "note" | "work-instruction" | "inspection";
export type EngineeringDocument = {
  id: string;
  folderId: string;
  name: string;
  kind: EngineeringDocumentKind;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type FactoryStage = "planned" | "preparation" | "assembly" | "inspection" | "complete";
export type FactoryStationKind = "receiving" | "materials" | "assembly" | "integration" | "inspection" | "packaging" | "custom";
export type FactoryStation = {
  id: string;
  name: string;
  kind: FactoryStationKind;
  x: number;
  y: number;
  createdAt: string;
};
export type EngineeringWorkspaceConfig = {
  schemaVersion: 1;
  folders: EngineeringFolder[];
  documents: EngineeringDocument[];
  stations: FactoryStation[];
  partStations: Record<string, string>;
  partStages: Record<string, FactoryStage>;
  partMaterials: Record<string, string>;
  updatedAt: string;
};

const id = (prefix: string) => `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`}`;
const timestamp = () => new Date().toISOString();
const cleanName = (value: string) => value.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 100);

export function createDefaultEngineeringWorkspace(): EngineeringWorkspaceConfig {
  const now = timestamp();
  return {
    schemaVersion: 1,
    folders: [
      { id: "folder-design", name: "Conception", parentId: null, createdAt: now },
      { id: "folder-assembly", name: "Assemblage & matériaux", parentId: null, createdAt: now },
      { id: "folder-manufacturing", name: "Industrialisation", parentId: null, createdAt: now },
      { id: "folder-validation", name: "Essais & validation", parentId: null, createdAt: now },
    ],
    documents: [],
    stations: [
      { id: "station-receiving", name: "Réception & contrôle documentaire", kind: "receiving", x: 14, y: 20, createdAt: now },
      { id: "station-materials", name: "Préparation des matériaux", kind: "materials", x: 38, y: 20, createdAt: now },
      { id: "station-assembly", name: "Assemblage structure", kind: "assembly", x: 62, y: 20, createdAt: now },
      { id: "station-integration", name: "Intégration des composants", kind: "integration", x: 62, y: 69, createdAt: now },
      { id: "station-inspection", name: "Inspection finale", kind: "inspection", x: 86, y: 69, createdAt: now },
    ],
    partStations: {},
    partStages: {},
    partMaterials: {},
    updatedAt: now,
  };
}

export function normalizeEngineeringWorkspace(value: unknown): EngineeringWorkspaceConfig {
  const fallback = createDefaultEngineeringWorkspace();
  if (!value || typeof value !== "object") return fallback;
  const input = value as Partial<EngineeringWorkspaceConfig>;
  const folders = Array.isArray(input.folders) ? input.folders.filter((folder): folder is EngineeringFolder => Boolean(
    folder && typeof folder.id === "string" && typeof folder.name === "string" &&
    (folder.parentId === null || typeof folder.parentId === "string"),
  )).slice(0, 500) : fallback.folders;
  const ids = new Set(folders.map(folder => folder.id));
  const safeFolders = folders.map(folder => ({
    ...folder,
    name: cleanName(folder.name) || "Nouveau dossier",
    parentId: folder.parentId && ids.has(folder.parentId) && folder.parentId !== folder.id ? folder.parentId : null,
    createdAt: typeof folder.createdAt === "string" ? folder.createdAt : timestamp(),
  }));
  const safeIds = new Set(safeFolders.map(folder => folder.id));
  const documents: EngineeringDocument[] = Array.isArray(input.documents) ? input.documents.filter((document): document is EngineeringDocument => Boolean(
    document && typeof document.id === "string" && typeof document.name === "string" &&
    typeof document.folderId === "string" && safeIds.has(document.folderId) && typeof document.body === "string",
  )).slice(0, 2000).map(document => ({
    ...document,
    name: cleanName(document.name) || "Document sans titre",
    body: document.body.slice(0, 100_000),
    kind: (document.kind === "work-instruction" || document.kind === "inspection" ? document.kind : "note") as EngineeringDocumentKind,
  })) : [];
  const stationKinds: FactoryStationKind[] = ["receiving", "materials", "assembly", "integration", "inspection", "packaging", "custom"];
  const stations = Array.isArray(input.stations) ? input.stations.filter((station): station is FactoryStation => Boolean(
    station && typeof station.id === "string" && typeof station.name === "string" &&
    stationKinds.includes(station.kind),
  )).slice(0, 100).map(station => ({
    ...station,
    name: cleanName(station.name) || "Poste sans nom",
    x: Math.max(4, Math.min(96, Number.isFinite(station.x) ? station.x : 50)),
    y: Math.max(8, Math.min(92, Number.isFinite(station.y) ? station.y : 50)),
  })) : fallback.stations;
  const stages: FactoryStage[] = ["planned", "preparation", "assembly", "inspection", "complete"];
  const partStages = Object.fromEntries(Object.entries(input.partStages ?? {}).filter((entry): entry is [string, FactoryStage] => stages.includes(entry[1] as FactoryStage)).slice(0, 1000));
  const stationIds = new Set(stations.map(station => station.id));
  const partStations = Object.fromEntries(Object.entries(input.partStations ?? {}).filter(([partId, stationId]) => typeof partId === "string" && stationIds.has(stationId)).slice(0, 1000));
  const partMaterials = Object.fromEntries(Object.entries(input.partMaterials ?? {}).filter(([partId, materialId]) => typeof partId === "string" && typeof materialId === "string").slice(0, 1000));
  return {
    schemaVersion: 1,
    folders: safeFolders,
    documents,
    stations,
    partStations,
    partStages,
    partMaterials,
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : timestamp(),
  };
}

export function createEngineeringFolder(workspace: EngineeringWorkspaceConfig, name: string, parentId: string | null): EngineeringWorkspaceConfig {
  const clean = cleanName(name);
  if (!clean) throw new Error("Le nom du dossier est requis.");
  if (workspace.folders.length >= 500) throw new Error("Limite de 500 dossiers atteinte.");
  if (parentId && !workspace.folders.some(folder => folder.id === parentId)) throw new Error("Le dossier parent n’existe pas.");
  if (workspace.folders.some(folder => folder.parentId === parentId && folder.name.toLocaleLowerCase("fr-FR") === clean.toLocaleLowerCase("fr-FR"))) throw new Error("Un dossier portant ce nom existe déjà à cet emplacement.");
  return { ...workspace, folders: [...workspace.folders, { id: id("folder"), name: clean, parentId, createdAt: timestamp() }], updatedAt: timestamp() };
}

export function renameEngineeringFolder(workspace: EngineeringWorkspaceConfig, folderId: string, name: string): EngineeringWorkspaceConfig {
  const clean = cleanName(name);
  if (!clean) throw new Error("Le nom du dossier est requis.");
  if (!workspace.folders.some(folder => folder.id === folderId)) throw new Error("Le dossier n’existe pas.");
  const folder = workspace.folders.find(item => item.id === folderId)!;
  if (workspace.folders.some(item => item.id !== folderId && item.parentId === folder.parentId && item.name.toLocaleLowerCase("fr-FR") === clean.toLocaleLowerCase("fr-FR"))) throw new Error("Un dossier portant ce nom existe déjà à cet emplacement.");
  return { ...workspace, folders: workspace.folders.map(item => item.id === folderId ? { ...item, name: clean } : item), updatedAt: timestamp() };
}

export function deleteEngineeringFolder(workspace: EngineeringWorkspaceConfig, folderId: string): EngineeringWorkspaceConfig {
  if (!workspace.folders.some(folder => folder.id === folderId)) throw new Error("Le dossier n’existe pas.");
  const removed = new Set([folderId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of workspace.folders) if (folder.parentId && removed.has(folder.parentId) && !removed.has(folder.id)) { removed.add(folder.id); changed = true; }
  }
  const documentIds = new Set(workspace.documents.filter(document => removed.has(document.folderId)).map(document => document.id));
  return { ...workspace, folders: workspace.folders.filter(folder => !removed.has(folder.id)), documents: workspace.documents.filter(document => !documentIds.has(document.id)), updatedAt: timestamp() };
}

export function createEngineeringDocument(workspace: EngineeringWorkspaceConfig, folderId: string, kind: EngineeringDocumentKind): EngineeringWorkspaceConfig {
  if (!workspace.folders.some(folder => folder.id === folderId)) throw new Error("Sélectionnez d’abord un dossier valide.");
  if (workspace.documents.length >= 2000) throw new Error("Limite de 2 000 documents atteinte.");
  const now = timestamp();
  const label = kind === "work-instruction" ? "Nouvelle instruction de travail" : kind === "inspection" ? "Nouvelle fiche d’inspection" : "Nouvelle note d’ingénierie";
  const document: EngineeringDocument = { id: id("doc"), folderId, name: label, kind, body: "", createdAt: now, updatedAt: now };
  return { ...workspace, documents: [...workspace.documents, document], updatedAt: now };
}

export function updateEngineeringDocument(workspace: EngineeringWorkspaceConfig, documentId: string, patch: Partial<Pick<EngineeringDocument, "name" | "body">>): EngineeringWorkspaceConfig {
  if (!workspace.documents.some(document => document.id === documentId)) throw new Error("Le document n’existe pas.");
  const now = timestamp();
  return { ...workspace, documents: workspace.documents.map(document => document.id === documentId ? {
    ...document,
    ...(patch.name !== undefined ? { name: cleanName(patch.name) || "Document sans titre" } : {}),
    ...(patch.body !== undefined ? { body: patch.body.slice(0, 100_000) } : {}),
    updatedAt: now,
  } : document), updatedAt: now };
}
