import type { ConceptConfig, InstalledMaterial } from "./aeroEngine";
import { runSimulation } from "./aeroEngine";

const mm = (meters: number) => Math.round(meters * 1000);
const safeName = (value: string) =>
  value
    .replace(/[^a-z0-9_-]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase() || "aeromind_design";
const csv = (value: string | number) =>
  `"${String(value).replaceAll('"', '""')}"`;

export function buildOpenScadModel(config: ConceptConfig): string {
  const span = mm(config.wingspan);
  const chord = mm(config.chord);
  const fuselage = mm(config.fuselageLength);
  const prop = mm(config.propDiameter);
  const motors = Math.max(
    1,
    Math.round(config.motorCount ?? (config.airframe === "fixed-wing" ? 1 : 4))
  );
  const payload = Math.round(config.payloadKg * 1000);
  const model = config.airframe ?? "fixed-wing";
  return `// AeroMind preliminary parametric concept — not flight-certified\n// Open with OpenSCAD; render (F6) before exporting STL. Verify every part independently.\n$fn = 48;\narchitecture = "${model}";\nwingspan_mm = ${span};\nchord_mm = ${chord};\nfuselage_length_mm = ${fuselage};\npropeller_diameter_mm = ${prop};\nmotor_count = ${motors};\npayload_mass_g = ${payload};\n\nmodule wing(){\n  linear_extrude(height=5) polygon(points=[[-fuselage_length_mm*0.12,-wingspan_mm/2],[fuselage_length_mm*0.08,-wingspan_mm/2],[fuselage_length_mm*0.2,-chord_mm*0.18],[fuselage_length_mm*0.2,chord_mm*0.18],[fuselage_length_mm*0.08,wingspan_mm/2],[-fuselage_length_mm*0.12,wingspan_mm/2]]);\n}\nmodule fuselage(){\n  rotate([0,90,0]) cylinder(h=fuselage_length_mm, d=max(chord_mm*0.16,35), center=true);\n}\nmodule payload_bay(){\n  translate([0,0,-chord_mm*0.12]) cube([max(payload_mass_g*0.08,50),max(chord_mm*0.3,50),max(chord_mm*0.16,25)],center=true);\n}\nmodule arm(angle){\n  rotate([0,0,angle]) translate([0,wingspan_mm*0.25,0]) cube([max(chord_mm*0.07,18),wingspan_mm*0.5,12],center=true);\n}\nmodule motor_mount(angle){\n  rotate([0,0,angle]) translate([0,wingspan_mm*0.5,8]) cylinder(h=16,d=max(propeller_diameter_mm*0.12,24),center=true);\n}\nmodule concept(){\n  color([0.25,0.7,0.75]) wing();\n  color([0.55,0.82,0.84]) fuselage();\n  color([0.12,0.3,0.38]) payload_bay();\n  for(i=[0:motor_count-1]) {\n    angle=360*i/motor_count;\n    if(architecture != "fixed-wing") arm(angle);\n    motor_mount(angle);\n  }\n}\nconcept();\n`;
}

export function buildBillOfMaterialsCsv(
  config: ConceptConfig,
  installed: InstalledMaterial[] = []
): string {
  const motorCount = Math.max(
    1,
    Math.round(config.motorCount ?? (config.airframe === "fixed-wing" ? 1 : 4))
  );
  const baselinePropulsionMass =
    config.airframe === "quadcopter"
      ? 0.65 + (config.motorCount ?? 4) * 0.18
      : config.airframe === "vtol"
        ? 1.15 + (config.motorCount ?? 4) * 0.12
        : 0.85 + config.propDiameter * 0.22;
  const baselineRows: Array<Array<string | number>> = [
    [
      "Corrélation simulateur",
      "AM-FRM-001",
      "Structure conceptuelle",
      "",
      "",
      1,
      "",
      (1.6 + config.wingspan * 0.48 + config.fuselageLength * 0.12).toFixed(3),
      "Géométrie paramétrique",
      "",
      "",
      "Estimation préliminaire — à remplacer par une BOM détaillée",
    ],
    [
      "Corrélation simulateur",
      "AM-MTR-001",
      `Groupe propulsion conceptuel · ${motorCount} moteurs`,
      "",
      "",
      1,
      "",
      baselinePropulsionMass.toFixed(3),
      `Hélice Ø ${config.propDiameter} m · masse estimée du groupe`,
      "",
      "",
      "Estimation préliminaire — pièces réelles additionnées séparément",
    ],
    [
      "Corrélation simulateur",
      "AM-BAT-001",
      `Batterie conceptuelle ${config.batteryWh} Wh`,
      "",
      "",
      1,
      "",
      (config.batteryWh / 300).toFixed(3),
      "Pack à qualifier",
      "",
      "",
      "Estimation préliminaire — masse corrélée",
    ],
    [
      "Corrélation simulateur",
      "AM-AVN-001",
      "Avionique conceptuelle",
      "",
      "",
      1,
      "",
      "0.640",
      "À qualifier",
      "",
      "",
      "Estimation préliminaire — pièces réelles additionnées séparément",
    ],
    [
      "Corrélation simulateur",
      "AM-PAY-001",
      "Charge utile / baie conceptuelle",
      "",
      "",
      1,
      "",
      config.payloadKg.toFixed(3),
      "Interface paramétrique",
      "",
      "",
      "Masse utilisateur — à réconcilier avec les capteurs installés",
    ],
  ];
  const installedRows: Array<Array<string | number>> = installed.map(item => {
    const quantity = Math.max(1, Math.round(item.quantity ?? 1));
    const dataStatus =
      item.manufacturerDataStatus === "verified"
        ? "Fiche fabricant — masse documentée"
        : item.manufacturerDataStatus === "partial"
          ? "Fiche fabricant partielle — vérifier champs"
          : item.catalogSource === "manufacturer"
            ? "Produit fabricant — masse à confirmer"
            : "Masse estimée / utilisateur";
    return [
      "Pièce installée",
      item.id,
      item.label,
      item.manufacturer ?? "",
      item.partNumber ?? "",
      quantity,
      item.massKg.toFixed(3),
      (item.massKg * quantity).toFixed(3),
      item.use,
      item.massSourceUrl ?? item.productUrl ?? "",
      item.productUrl ?? "",
      dataStatus,
    ];
  });
  const rows: Array<Array<string | number>> = [
    [
      "Type de ligne",
      "Référence",
      "Désignation",
      "Fabricant",
      "P/N",
      "Quantité",
      "Masse unitaire kg",
      "Masse de ligne kg",
      "Matière / spécification",
      "Source de masse",
      "Fiche produit",
      "Statut de donnée",
    ],
    ...baselineRows,
    ...installedRows,
  ];
  return rows.map(row => row.map(value => csv(value)).join(",")).join("\r\n");
}

export function buildEngineeringJson(config: ConceptConfig): string {
  return JSON.stringify(
    {
      schema: "aeromind-engineering-project-v2",
      design: safeName(config.designName ?? "aeromind_design"),
      units: "SI",
      status: "preliminary",
      configuration: config,
      calculated: runSimulation(config),
      exports: { cad: "OpenSCAD parametric concept", manufacturing: "BOM CSV" },
      limitations: [
        "Concept géométrique préliminaire; ne constitue pas un dossier de fabrication certifié.",
        "Les performances et réponses de vol sont indicatives et requièrent une validation indépendante.",
      ],
    },
    null,
    2
  );
}

export function safeEngineeringFilename(name: string): string {
  return safeName(name);
}
