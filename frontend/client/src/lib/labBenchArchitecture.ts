import {
  Activity,
  CheckCircle2,
  CircleDot,
  ClipboardCheck,
  Cpu,
  Crosshair,
  Database,
  FileCheck2,
  FolderKanban,
  Gauge,
  History,
  Map,
  Mic,
  Plane,
  Radio,
  ShieldCheck,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";

export type ViewId =
  | "projects" | "overview" | "dashboard" | "requirements" | "simulation"
  | "hardware" | "materials" | "bench" | "fleet" | "radar" | "map"
  | "mission" | "preflight" | "charts" | "flights" | "replay-adv" | "voice"
  | "collaboration" | "maintenance" | "hardware-control" | "reports" | "audit";
export type ModeId = "simulation" | "connected" | "authorized";
export type ZoneId = "governance" | "simulation" | "hardware" | "bench" | "audit";
export type GateState = "passed" | "open" | "pending";
export type GateDefinition = {
  code: string; label: string; description: string; level: string; zone: ZoneId;
  requiredConditions: string[]; conditions: Record<string, boolean>; state: GateState;
};
export type ZoneProgress = {
  zone: ZoneId; label: string; passed: boolean; openCount: number;
  gates: Array<{ code: string; state: GateState }>;
};
export type GateStateResponse = {
  projectId: string; gateStateId: string; updatedAt: string; conditions: Record<string, boolean>;
  gates: GateDefinition[]; currentGate: string; armEvents: Array<Record<string, unknown>>; reviewEvents: Array<Record<string, unknown>>;
  hardwareChecklist: LocalGateState["hardwareChecklist"]; physicalOutputEnabled: false; physicalCommandsEmitted: false; physicalExecutionPermitted: false; zoneProgress: ZoneProgress[];
};

export type LocalGateState = {
  gates: GateDefinition[]; zoneProgress: ZoneProgress[]; currentGate: string;
  conditions: Record<string, boolean>;
  hardwareChecklist: { deviceIdentified: boolean; driverValidated: boolean; calibrationSimulated: boolean; complete: boolean };
  armEvents: Array<Record<string, unknown>>; reviewEvents: Array<Record<string, unknown>>;
  updatedAt: string | null;
};

type GateSpec = Omit<GateDefinition, "conditions" | "state">;
export const GATE_DEFS: GateSpec[] = [
  { code: "N1", label: "Conception", description: "Registre exigences + identité appareil/émulateur créés.", level: "N1", zone: "governance", requiredConditions: ["registry_initialized"] },
  { code: "N2", label: "Simulation", description: "Au moins un run N2 archivé côté serveur (empreinte SHA-256).", level: "N2", zone: "simulation", requiredConditions: ["registry_initialized", "n2_run_archived"] },
  { code: "N3-READY", label: "Conformité matérielle", description: "Pilote + identité appareil vérifiés ; calibration simulée exécutée.", level: "N3", zone: "hardware", requiredConditions: ["registry_initialized", "n2_run_archived", "hardware_checklist_complete"] },
  { code: "N3-ARMED", label: "Armement N3 supervisé", description: "Armement explicite après double confirmation humaine.", level: "N3", zone: "bench", requiredConditions: ["n3_ready", "arm_double_confirmed"] },
  { code: "N4", label: "Mise en service (revue indépendante)", description: "Revue indépendante signée après démonstration N3 supervisée.", level: "N4", zone: "audit", requiredConditions: ["n3_armed", "independent_review_signed"] },
];

export function resolveGates(conditions: Record<string, boolean>): GateDefinition[] {
  let passedSoFar = true;
  return GATE_DEFS.map((def) => {
    const allMet = def.requiredConditions.every((condition) => conditions[condition] === true);
    const state: GateState = passedSoFar && allMet ? "passed" : !passedSoFar ? "pending" : "open";
    if (state === "open") passedSoFar = false;
    return { ...def, conditions: Object.fromEntries(def.requiredConditions.map((condition) => [condition, conditions[condition] === true])), state };
  });
}

export function resolveZoneProgress(gates: GateDefinition[]): ZoneProgress[] {
  const zones: Array<[ZoneId, string]> = [
    ["governance", "Gouvernance & Exigences"], ["simulation", "Simulation & HIL"],
    ["hardware", "Hardware & Drivers"], ["bench", "Banc de test & Commandes"], ["audit", "Preuves & Audit"],
  ];
  return zones.map(([zone, label]) => {
    const zoneGates = gates.filter((gate) => gate.zone === zone);
    return { zone, label, passed: zoneGates.length > 0 && zoneGates.every((gate) => gate.state === "passed"), openCount: zoneGates.filter((gate) => gate.state === "open").length, gates: zoneGates.map((gate) => ({ code: gate.code, state: gate.state })) };
  });
}

export const ZONE_GROUPS: Array<{ id: ZoneId; label: string; description: string; views: Array<{ id: ViewId; label: string; caption: string; icon: LucideIcon }> }> = [
  { id: "governance", label: "01 · Gouvernance & Exigences", description: "N1 · registre, exigences et projets", views: [
    { id: "projects", label: "Projets", caption: "Rattachement officiel", icon: FolderKanban }, { id: "dashboard", label: "Dashboard", caption: "Vue multi-projets", icon: Activity }, { id: "overview", label: "Vue preuves", caption: "Chaîne N1→N4", icon: ClipboardCheck }, { id: "requirements", label: "Exigences", caption: "Référentiel", icon: ShieldCheck },
  ] },
  { id: "simulation", label: "02 · Simulation & HIL", description: "N2 · moteur thermique synthétique", views: [{ id: "simulation", label: "Simulation", caption: "Moteur N2", icon: Activity }] },
  { id: "hardware", label: "03 · Hardware & Drivers", description: "N3 · registre appareil + pilote", views: [{ id: "hardware", label: "Hardware", caption: "Checklist + pilote", icon: Cpu }, { id: "materials", label: "Matériels", caption: "Catalogue étendu", icon: Database }, { id: "maintenance", label: "Maintenance", caption: "Records + batteries", icon: ShieldCheck }] },
  { id: "bench", label: "04 · Banc de test & Commandes", description: "N3 → N4 · armement supervisé", views: [
    { id: "bench", label: "Banc", caption: "Commandes supervisées", icon: Radio }, { id: "fleet", label: "Flotte", caption: "Multi-drones", icon: Gauge }, { id: "radar", label: "Radar", caption: "Temps réel + replay", icon: Crosshair }, { id: "map", label: "Carte", caption: "Vue géographique", icon: Map }, { id: "mission", label: "Mission", caption: "Waypoints + upload", icon: Plane }, { id: "preflight", label: "Pré-vol", caption: "Checklist", icon: ClipboardCheck }, { id: "charts", label: "Charts", caption: "Télémétrie", icon: Activity }, { id: "replay-adv", label: "Replay 3D", caption: "Timeline + 3D trail", icon: Crosshair }, { id: "voice", label: "Voix", caption: "Commandes vocales", icon: Mic }, { id: "collaboration", label: "Multi-op", caption: "Opérateurs live", icon: Users }, { id: "flights", label: "Vols", caption: "Historique + CSV", icon: History }, { id: "hardware-control", label: "Hardware", caption: "Pilote matériel v5", icon: Zap }, { id: "reports", label: "Rapports", caption: "Dossier de preuve", icon: FileCheck2 },
  ] },
  { id: "audit", label: "05 · Preuves & Audit", description: "tous niveaux · traçabilité", views: [{ id: "audit", label: "Journal d’audit", caption: "Événements & reçus", icon: History }] },
];

export const MODE_ITEMS: Array<{ id: ModeId; label: string; eyebrow: string; detail: string }> = [
  { id: "simulation", label: "Simulation", eyebrow: "N2", detail: "Données synthétiques. Aucun appareil réel n’est commandé." },
  { id: "connected", label: "Diagnostic virtuel", eyebrow: "N2", detail: "Identité de l’émulateur et télémétrie synthétique ; aucun appareil réel." },
  { id: "authorized", label: "Commande virtuelle supervisée par protocole", eyebrow: "N3", detail: "Consigne virtuelle après deux confirmations humaines ; sortie appareil régie par G01–G05 et le protocole ICX / Aeromind." },
];

export const initialLocalGateState: LocalGateState = {
  gates: resolveGates({}), zoneProgress: resolveZoneProgress(resolveGates({})), currentGate: "N1",
  conditions: { registry_initialized: false, n2_run_archived: false, hardware_checklist_complete: false, n3_ready: false, arm_double_confirmed: false, n3_armed: false, independent_review_signed: false },
  hardwareChecklist: { deviceIdentified: false, driverValidated: false, calibrationSimulated: false, complete: false }, armEvents: [], reviewEvents: [], updatedAt: null,
};

export function nextItem<T>(predicate: (item: T) => boolean, items: T[], fallback: T): T { return items.find(predicate) ?? fallback; }
