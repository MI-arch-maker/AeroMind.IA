export type MechanicalCenterTab = "overview" | "workshop" | "assembly" | "parts" | "wiring" | "connectors" | "fasteners" | "lubrication" | "maintenance";
export type MechanicalReviewState = "draft" | "review" | "verified";
export type InstallState = "planned" | "installed" | "inspected";

export type MechanicalCenterPart = {
  id: string;
  label: string;
  category: "structure" | "propulsion" | "avionics" | "energy" | "payload" | "hardware";
  massKg: number;
  interface: string;
  installState: InstallState;
  review: MechanicalReviewState;
  source: "concept" | "manufacturer" | "user";
  note?: string;
};

export type MechanicalCenterWire = {
  id: string;
  label: string;
  from: string;
  to: string;
  bus: "power" | "signal" | "data" | "ground";
  sectionMm2: number;
  lengthM: number;
  route: string;
  separation: "ok" | "review" | "conflict";
  review: MechanicalReviewState;
};

export type MechanicalCenterConnector = {
  id: string;
  label: string;
  type: string;
  sideA: string;
  sideB: string;
  pins: number;
  locked: boolean;
  compatibility: "compatible" | "review" | "incompatible";
  review: MechanicalReviewState;
};

export type MechanicalCenterMaintenance = {
  id: string;
  action: string;
  target: string;
  interval: string;
  tool: string;
  access: "direct" | "panel" | "restricted";
  status: "planned" | "review" | "ready";
};

export type MechanicalFastener = {
  id: string;
  label: string;
  kind: "bolt" | "screw" | "nut" | "washer" | "spacer" | "insert";
  size: string;
  material: string;
  quantity: number;
  torqueNm?: number;
  state: "planned" | "fitted" | "torqued" | "review";
};

export type MechanicalAssemblyConstraint = {
  id: string;
  label: string;
  kind: "coincident" | "concentric" | "parallel" | "distance" | "contact";
  partA: string;
  partB: string;
  value?: string;
  state: "draft" | "satisfied" | "conflict";
};

export type MechanicalLubricationPoint = {
  id: string;
  label: string;
  target: string;
  lubricant: string;
  quantity: string;
  interval: string;
  access: "direct" | "panel" | "démontage";
  state: "planned" | "applied" | "review";
};

export type MechanicalCenterConfig = {
  activeTab?: MechanicalCenterTab;
  selectedPartId?: string;
  parts?: MechanicalCenterPart[];
  wires?: MechanicalCenterWire[];
  connectors?: MechanicalCenterConnector[];
  maintenance?: MechanicalCenterMaintenance[];
  fasteners?: MechanicalFastener[];
  constraints?: MechanicalAssemblyConstraint[];
  lubricationPoints?: MechanicalLubricationPoint[];
  updatedAt?: string;
};

export const defaultMechanicalCenter: MechanicalCenterConfig = {
  activeTab: "overview",
  selectedPartId: "frame",
  parts: [
    { id: "frame", label: "Cellule centrale", category: "structure", massKg: 1.85, interface: "4 points de fixation", installState: "installed", review: "review", source: "concept" },
    { id: "powertrain", label: "Support propulsion", category: "propulsion", massKg: 0.42, interface: "M4 · entraxe 16 mm", installState: "planned", review: "draft", source: "concept" },
    { id: "avionics-bay", label: "Baie avionique", category: "avionics", massKg: 0.28, interface: "plateau isolé", installState: "installed", review: "review", source: "user" },
    { id: "battery-tray", label: "Plateau énergie", category: "energy", massKg: 0.31, interface: "sangle + anti-glisse", installState: "inspected", review: "verified", source: "manufacturer" },
  ],
  wires: [
    { id: "wire-power-01", label: "Alimentation principale", from: "Batterie", to: "Distribution", bus: "power", sectionMm2: 2.5, lengthM: 0.42, route: "baie centrale / canal A", separation: "ok", review: "review" },
    { id: "wire-data-01", label: "Bus données avionique", from: "Contrôleur", to: "Capteur mission", bus: "data", sectionMm2: 0.22, lengthM: 0.58, route: "canal B / traversée cloison", separation: "review", review: "draft" },
    { id: "wire-ground-01", label: "Retour masse", from: "Distribution", to: "Baie avionique", bus: "ground", sectionMm2: 1.5, lengthM: 0.36, route: "baie centrale / canal A", separation: "ok", review: "review" },
  ],
  connectors: [
    { id: "conn-main", label: "Entrée énergie", type: "XT60 documenté", sideA: "Batterie", sideB: "Distribution", pins: 2, locked: true, compatibility: "compatible", review: "review" },
    { id: "conn-data", label: "Interface données", type: "Micro-fit", sideA: "Contrôleur", sideB: "Capteur mission", pins: 6, locked: false, compatibility: "review", review: "draft" },
  ],
  maintenance: [
    { id: "maint-01", action: "Inspection fixation moteur", target: "Support propulsion", interval: "avant chaque série", tool: "clé dynamométrique", access: "panel", status: "review" },
    { id: "maint-02", action: "Contrôle cheminement câbles", target: "Canaux A/B", interval: "chaque révision", tool: "inspection visuelle", access: "direct", status: "ready" },
    { id: "maint-03", action: "Remplacement sangle énergie", target: "Plateau énergie", interval: "selon usure", tool: "outil manuel", access: "direct", status: "planned" },
  ],
  fasteners: [
    { id: "fast-01", label: "Fixation support propulsion", kind: "bolt", size: "M4 × 16", material: "Inox A2 · indicatif", quantity: 4, torqueNm: 2.2, state: "review" },
    { id: "fast-02", label: "Entretoise baie avionique", kind: "spacer", size: "M3 × 8", material: "Aluminium", quantity: 4, state: "fitted" },
    { id: "fast-03", label: "Rondelles anti-desserrage", kind: "washer", size: "M4", material: "Acier", quantity: 4, state: "planned" },
  ],
  constraints: [
    { id: "constraint-01", label: "Axe propulsion / support", kind: "concentric", partA: "Support propulsion", partB: "Cellule centrale", state: "satisfied" },
    { id: "constraint-02", label: "Plan baie / plateau", kind: "parallel", partA: "Baie avionique", partB: "Cellule centrale", value: "0.5° max indicatif", state: "draft" },
    { id: "constraint-03", label: "Contact plateau énergie", kind: "contact", partA: "Plateau énergie", partB: "Cellule centrale", state: "satisfied" },
  ],
  lubricationPoints: [
    { id: "lube-01", label: "Palier arbre moteur", target: "Sous-ensemble propulsion", lubricant: "Graisse compatible à préciser", quantity: "film léger", interval: "avant série / selon constructeur", access: "panel", state: "review" },
    { id: "lube-02", label: "Axe articulation", target: "Mécanisme de fixation", lubricant: "Lubrifiant sec à préciser", quantity: "1 application", interval: "chaque révision", access: "direct", state: "planned" },
  ],
};

export const mergeMechanicalCenter = (value?: MechanicalCenterConfig): MechanicalCenterConfig => ({
  ...defaultMechanicalCenter,
  ...value,
  parts: value?.parts ?? defaultMechanicalCenter.parts,
  wires: value?.wires ?? defaultMechanicalCenter.wires,
  connectors: value?.connectors ?? defaultMechanicalCenter.connectors,
  maintenance: value?.maintenance ?? defaultMechanicalCenter.maintenance,
  fasteners: value?.fasteners ?? defaultMechanicalCenter.fasteners,
  constraints: value?.constraints ?? defaultMechanicalCenter.constraints,
  lubricationPoints: value?.lubricationPoints ?? defaultMechanicalCenter.lubricationPoints,
});
