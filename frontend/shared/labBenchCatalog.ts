export type CatalogEvidenceStatus =
  | "reference_only"
  | "supplier_claim_unverified"
  | "document_reviewed"
  | "test_evidence_available"
  | "verified";

export type CatalogDeviceEntry = {
  id: string;
  kind: "device_catalog_entry";
  name: string;
  category: "navigation" | "sensors";
  manufacturer: {
    name: string;
    verified: false;
  };
  model: {
    value: string | null;
    provided: false;
  };
  partNumber: string | null;
  revision: string | null;
  firmware: {
    version: string | null;
    validated: false;
  };
  specifications: {
    type: string;
    biasStability?: {
      value: number;
      unit: "deg/hour";
      operator: "less_than";
      sourceStatus: "supplier_claim_unverified";
    };
    measurementRange?: {
      min: number;
      max: number;
      unit: "m";
      sourceStatus: "supplier_claim_unverified";
    };
    interfaces: Array<{
      type: string;
      protocol: string | null;
      security: "claimed_not_verified" | "unspecified";
    }>;
    standards: Array<{
      code: string;
      status: "reference_only";
      evidence: null;
    }>;
    redundancy?: "dual_redundant" | "not_specified";
    weatherResistance?: {
      label: string;
      status: "supplier_claim_unverified";
    };
  };
  criticality: {
    level: "flight_critical" | "mission_critical";
    requiresHumanApproval: true;
    physicalCommandsDefault: "disabled";
    simulationRequired: true;
    independentReviewRequired: true;
  };
  source: {
    status: "unverified";
    note: string;
  };
  operationalState: "catalog_only";
  connectionState: "not_connected";
  validationStatus: "not_validated";
  driver: {
    status: "not_registered";
    version: null;
    permissions: "none";
    allowlist: [];
  };
  claims: Array<{
    id: string;
    text: string;
    status: "unverified_claim";
  }>;
  description: string;
};

/**
 * Références importées depuis le catalogue fourni.
 * Elles restent explicitement non vérifiées, non connectées et non validées.
 * Leur présence dans AeroMind n'autorise jamais une commande physique.
 */
export const LAB_BENCH_CATALOG = [
  {
    id: "imu-fog-tactical-01",
    kind: "device_catalog_entry",
    name: "Centrale inertielle à fibres optiques (FOG tactique)",
    category: "navigation",
    manufacturer: { name: "DefenseAero Sensors Corp", verified: false },
    model: { value: null, provided: false },
    partNumber: null,
    revision: null,
    firmware: { version: null, validated: false },
    specifications: {
      type: "FOG (Fiber Optic Gyroscope)",
      biasStability: {
        value: 0.1,
        unit: "deg/hour",
        operator: "less_than",
        sourceStatus: "supplier_claim_unverified",
      },
      interfaces: [
        {
          type: "CAN",
          protocol: "non spécifié",
          security: "claimed_not_verified",
        },
        {
          type: "RS-422",
          protocol: "non spécifié",
          security: "unspecified",
        },
      ],
      standards: [
        { code: "MIL-STD-810H", status: "reference_only", evidence: null },
        { code: "MIL-STD-461G", status: "reference_only", evidence: null },
      ],
      redundancy: "dual_redundant",
    },
    criticality: {
      level: "flight_critical",
      requiresHumanApproval: true,
      physicalCommandsDefault: "disabled",
      simulationRequired: true,
      independentReviewRequired: true,
    },
    source: {
      status: "unverified",
      note: "Fabricant, modèle et preuve fournisseur non fournis dans le JSON source.",
    },
    operationalState: "catalog_only",
    connectionState: "not_connected",
    validationStatus: "not_validated",
    driver: {
      status: "not_registered",
      version: null,
      permissions: "none",
      allowlist: [],
    },
    claims: [
      {
        id: "gnss-denied",
        text: "Capacité annoncée pour des environnements privés de GNSS.",
        status: "unverified_claim",
      },
      {
        id: "interference-resistance",
        text: "Résistance annoncée aux interférences et au brouillage.",
        status: "unverified_claim",
      },
    ],
    description:
      "Référence de centrale inertielle FOG à évaluer. Aucune capacité de navigation réelle n'est démontrée par cette fiche catalogue.",
  },
  {
    id: "altimeter-hybrid-02",
    kind: "device_catalog_entry",
    name: "Altimètre hybride LiDAR et radar d'impulsion",
    category: "sensors",
    manufacturer: { name: "Tactical Terrain Systems", verified: false },
    model: { value: null, provided: false },
    partNumber: null,
    revision: null,
    firmware: { version: null, validated: false },
    specifications: {
      type: "Dual-Mode LiDAR / Pulse Radar",
      measurementRange: {
        min: 0.1,
        max: 500,
        unit: "m",
        sourceStatus: "supplier_claim_unverified",
      },
      interfaces: [
        { type: "SPI", protocol: "non spécifié", security: "unspecified" },
        {
          type: "Ethernet",
          protocol: "non spécifié",
          security: "claimed_not_verified",
        },
      ],
      standards: [
        { code: "MIL-STD-810H", status: "reference_only", evidence: null },
      ],
      redundancy: "not_specified",
      weatherResistance: {
        label: "Brouillard, pluie, fumée",
        status: "supplier_claim_unverified",
      },
    },
    criticality: {
      level: "mission_critical",
      requiresHumanApproval: true,
      physicalCommandsDefault: "disabled",
      simulationRequired: true,
      independentReviewRequired: true,
    },
    source: {
      status: "unverified",
      note: "Fabricant, modèle et preuve fournisseur non fournis dans le JSON source.",
    },
    operationalState: "catalog_only",
    connectionState: "not_connected",
    validationStatus: "not_validated",
    driver: {
      status: "not_registered",
      version: null,
      permissions: "none",
      allowlist: [],
    },
    claims: [
      {
        id: "terrain-following",
        text: "Usage annoncé pour le suivi de relief.",
        status: "unverified_claim",
      },
      {
        id: "all-weather",
        text: "Résistance annoncée au brouillard, à la pluie et à la fumée.",
        status: "unverified_claim",
      },
    ],
    description:
      "Référence d'altimètre hybride à évaluer. La plage et la résistance météo restent des revendications non vérifiées.",
  },
] as const satisfies readonly CatalogDeviceEntry[];

export function catalogInterfaceLabels(device: CatalogDeviceEntry) {
  return device.specifications.interfaces.map(
    item =>
      `${item.type} · ${item.protocol ?? "protocole non spécifié"} · sécurité ${item.security}`
  );
}

export function catalogLimitLabels(device: CatalogDeviceEntry) {
  const limits: string[] = [];
  if (device.specifications.biasStability) {
    limits.push(
      `stabilité de biais < ${device.specifications.biasStability.value} ${device.specifications.biasStability.unit}`
    );
  }
  if (device.specifications.measurementRange) {
    const range = device.specifications.measurementRange;
    limits.push(`plage ${range.min}–${range.max} ${range.unit}`);
  }
  if (device.specifications.weatherResistance) {
    limits.push(`météo : ${device.specifications.weatherResistance.label}`);
  }
  limits.push("commande physique désactivée", "validation requise avant intégration");
  return limits;
}

export function catalogDriverProtocol(device: CatalogDeviceEntry) {
  return device.specifications.interfaces.map(item => item.type).join(" / ");
}
