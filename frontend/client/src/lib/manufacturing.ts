import type { ConceptConfig } from "./aeroEngine";

export type ManufacturingPackage = {
  packageVersion: string;
  generatedAt: string;
  parts: Array<{ partNumber: string; name: string; quantity: number; material: string; critical: boolean }>;
  assemblySteps: string[];
  qualityChecks: string[];
  safetyNote: string;
  materialMassKg: number;
  readiness: "draft" | "review";
};

export function buildManufacturingPackage(
  config: ConceptConfig,
  installedMaterials: Array<{ label: string; mass: number; use: string }> = []
): ManufacturingPackage {
  const motors = config.motorCount ?? (config.airframe === "fixed-wing" ? 1 : 4);
  return {
    packageVersion: "FAB-PRELIM-0.1",
    generatedAt: new Date().toISOString(),
    parts: [
      { partNumber: "AM-FRM-001", name: config.airframe === "fixed-wing" ? "Cellule voilure fixe" : "Châssis multirotor / VTOL", quantity: 1, material: "Composite carbone à confirmer", critical: true },
      { partNumber: "AM-WNG-001", name: "Aile / bras porteurs", quantity: config.airframe === "fixed-wing" ? 2 : motors, material: "Composite ou aluminium à confirmer", critical: true },
      { partNumber: "AM-PRP-001", name: "Groupe hélice / rotor", quantity: motors, material: "Composant catalogue à qualifier", critical: true },
      { partNumber: "AM-BAT-001", name: `Batterie ${config.batteryWh} Wh`, quantity: 1, material: "Cellules certifiées à sélectionner", critical: true },
      { partNumber: "AM-PAY-001", name: `Baie charge utile ${config.payloadKg} kg`, quantity: 1, material: "Interface mécanique paramétrique", critical: false },
      { partNumber: "AM-AVN-001", name: "Avionique et télémétrie", quantity: 1, material: "Électronique qualifiée à intégrer", critical: true },
    ],
    assemblySteps: ["Contrôler la version de conception et les cotes.", "Assembler la cellule et vérifier les couples de serrage.", "Installer propulsion, batterie et avionique hors tension.", "Mesurer la masse et le centre de gravité.", "Exécuter les tests de continuité et de sécurité.", "Valider le dossier par un ingénieur avant essai contrôlé."],
    qualityChecks: ["Masse réelle comparée à la simulation", "Centre de gravité dans l’enveloppe", "Fixations et hélices inspectées", "Failsafe perte de liaison testé au sol", "Réserve batterie et coupure d’urgence vérifiées"],
    safetyNote: "Dossier de préparation préliminaire : il ne remplace ni un plan certifié, ni une revue de fabrication, ni les exigences réglementaires applicables.",
    materialMassKg: installedMaterials.reduce((sum, material) => sum + material.mass, 0),
    readiness: installedMaterials.length > 0 ? "review" : "draft",
  };
}
