import { describe, expect, it } from "vitest";
import { defaultConcept, type ConceptConfig } from "./aeroEngine";
import {
  applyConceptProposal,
  buildConceptProposal,
  clampConceptField,
  extractBriefSignals,
  proposalSignature,
} from "./conceptGenerator";

const vtolBrief =
  "Concept VTOL de secours côtier : charge utile 2,4 kg, croisière 62 km/h, altitude de 120 m, vent 35 km/h, réserve 20 %, autonomie 55 min.";

describe("extractBriefSignals", () => {
  it("lit les nombres avec unités et convertit les unités usuelles", () => {
    const signals = extractBriefSignals(vtolBrief);
    expect(signals.payloadKg?.value).toBeCloseTo(2.4, 3);
    expect(signals.cruiseSpeedKmh?.value).toBeCloseTo(62, 3);
    expect(signals.altitudeM?.value).toBeCloseTo(120, 3);
    expect(signals.windKmh?.value).toBeCloseTo(35, 3);
    expect(signals.reserveFraction?.value).toBeCloseTo(0.2, 3);
    expect(signals.enduranceMin?.value).toBeCloseTo(55, 3);
  });

  it("convertit les pieds et les nœuds", () => {
    const signals = extractBriefSignals(
      "Mission à 400 ft avec vent 12 kts et autonomie de 1.5 h."
    );
    expect(signals.altitudeM?.value).toBeCloseTo(121.92, 1);
    expect(signals.windKmh?.value).toBeCloseTo(22.224, 1);
    expect(signals.enduranceMin?.value).toBeCloseTo(90, 3);
  });

  it("ne confond pas une distance avec une vitesse", () => {
    const signals = extractBriefSignals("Inspection d’une ligne sur 18 km à 54 km/h.");
    expect(signals.distanceKm?.value).toBeCloseTo(18, 3);
    expect(signals.cruiseSpeedKmh?.value).toBeCloseTo(54, 3);
  });
});

describe("buildConceptProposal", () => {
  it("ne modifie jamais le modèle courant", () => {
    const before = JSON.stringify(defaultConcept);
    const proposal = buildConceptProposal(vtolBrief, defaultConcept);
    expect(JSON.stringify(defaultConcept)).toBe(before);
    expect(proposal.fields.length).toBeGreaterThan(0);
    expect(proposal.notice).toContain("Rien n’est appliqué");
  });

  it("détecte l’architecture VTOL et un nombre de moteurs cohérent", () => {
    const proposal = buildConceptProposal(vtolBrief, defaultConcept);
    expect(proposal.architecture).toBe("vtol");
    const motors = proposal.fields.find(field => field.key === "motorCount");
    expect(motors?.proposed).toBe(5);
  });

  it("distingue voilure fixe et multirotor", () => {
    expect(
      buildConceptProposal("Avion d’aile fixe pour cartographie linéaire.", defaultConcept)
        .architecture
    ).toBe("fixed-wing");
    expect(
      buildConceptProposal(
        "Multirotor pour inspection stationnaire d’une façade.",
        defaultConcept
      ).architecture
    ).toBe("quadcopter");
  });

  it("reprend les valeurs explicites du brief avec leur traçabilité", () => {
    const proposal = buildConceptProposal(vtolBrief, defaultConcept);
    const payload = proposal.fields.find(field => field.key === "payloadKg");
    expect(payload?.proposed).toBeCloseTo(2.4, 2);
    expect(payload?.source).toBe("brief");
    expect(payload?.rationale).toContain("charge utile 2.4 kg");
    const reserve = proposal.fields.find(field => field.key === "reserveFraction");
    expect(reserve?.proposed).toBeCloseTo(0.2, 2);
  });

  it("ajuste la batterie par extrapolation du modèle local pour une autonomie visée", () => {
    const base = { ...defaultConcept, airframe: "quadcopter" as const, motorCount: 4 };
    const proposal = buildConceptProposal(
      "Multirotor d’inspection avec autonomie 240 min et charge utile 1 kg.",
      base
    );
    const battery = proposal.fields.find(field => field.key === "batteryWh");
    expect(battery).toBeDefined();
    expect(battery!.source).toBe("modèle");
    expect(battery!.estimate).toBe(true);
    expect(battery!.proposed).toBeGreaterThan(base.batteryWh);
    expect(battery!.rationale).toContain("puissance estimée du modèle local");
    expect(battery!.rationale).toContain("Extrapolation locale");

    const reduced = buildConceptProposal(
      "Multirotor d’inspection avec autonomie 30 min.",
      base
    ).fields.find(field => field.key === "batteryWh");
    expect(reduced!.proposed).toBeLessThan(base.batteryWh);
  });

  it("est reproductible pour un même brief", () => {
    const a = buildConceptProposal(vtolBrief, defaultConcept);
    const b = buildConceptProposal(vtolBrief, defaultConcept);
    expect(proposalSignature(a)).toBe(proposalSignature(b));
  });

  it("n’oppose pas une valeur de catalogue à un signal explicite déjà respecté", () => {
    const current = { ...defaultConcept, cruiseSpeedKmh: 62, altitudeM: 120 };
    const proposal = buildConceptProposal(
      "Multirotor de secours, croisière 62 km/h, altitude 120 m.",
      current
    );
    expect(proposal.fields.find(field => field.key === "cruiseSpeedKmh")).toBeUndefined();
    expect(proposal.fields.find(field => field.key === "altitudeM")).toBeUndefined();
  });

  it("signale un brief inexploitable sans proposer de modification", () => {
    const proposal = buildConceptProposal("bonjour", defaultConcept);
    expect(proposal.fields).toHaveLength(0);
    expect(proposal.warnings.join(" ")).toContain("Aucune valeur exploitable");
  });

  it("borne les valeurs dans le domaine du modèle", () => {
    const proposal = buildConceptProposal(
      "Multirotor avec charge utile 40 kg et croisière 400 km/h.",
      defaultConcept
    );
    const payload = proposal.fields.find(field => field.key === "payloadKg");
    expect(payload?.proposed).toBe(12);
    const speed = proposal.fields.find(field => field.key === "cruiseSpeedKmh");
    expect(speed?.proposed).toBe(140);
  });

  it("prévient quand la masse projetée dépasse la masse maximale déclarée", () => {
    const proposal = buildConceptProposal(
      "Multirotor de secours, charge utile 4 kg, masse maximale 5 kg.",
      defaultConcept
    );
    expect(proposal.warnings.join(" ")).toContain("Incohérence de masse");
  });
});

describe("applyConceptProposal", () => {
  it("n’applique que les champs acceptés", () => {
    const proposal = buildConceptProposal(vtolBrief, defaultConcept);
    const payloadField = proposal.fields.find(field => field.key === "payloadKg")!;
    const applied = applyConceptProposal(defaultConcept, proposal, ["payloadKg"]);
    expect(applied.payloadKg).toBeCloseTo(payloadField.proposed, 3);
    expect(applied.cruiseSpeedKmh).toBe(defaultConcept.cruiseSpeedKmh);
    expect(applied.airframe).toBe(defaultConcept.airframe);
    expect(applied.missionBrief).toBe(vtolBrief);
  });

  it("applique l’architecture uniquement si le champ moteurs est validé", () => {
    const proposal = buildConceptProposal(vtolBrief, defaultConcept);
    const withoutMotors = applyConceptProposal(defaultConcept, proposal, ["payloadKg"]);
    expect(withoutMotors.airframe).toBe(defaultConcept.airframe);
    const withMotors = applyConceptProposal(defaultConcept, proposal, ["motorCount"]);
    expect(withMotors.airframe).toBe("vtol");
    expect(withMotors.designName?.startsWith("VTOL")).toBe(true);
  });

  it("conserve la nomenclature et le plan de mission existants", () => {
    const current: ConceptConfig = {
      ...defaultConcept,
      installedMaterials: [
        { id: "p1", label: "Servo", use: "Liaison", massKg: 0.06, geometry: "mount" },
      ],
    };
    const proposal = buildConceptProposal(vtolBrief, current);
    const applied = applyConceptProposal(current, proposal, ["payloadKg", "cruiseSpeedKmh"]);
    expect(applied.installedMaterials).toHaveLength(1);
    expect(applied.installedMaterials?.[0].massKg).toBe(0.06);
  });

  it("borne les valeurs hors domaine", () => {
    expect(clampConceptField("payloadKg", 99)).toBe(12);
    expect(clampConceptField("windSpeedKmh", -5)).toBe(0);
    expect(clampConceptField("motorCount", 3.7)).toBe(4);
  });
});
