export const INSTITUTIONAL_GATES = ["GATE_01", "GATE_02", "GATE_03", "GATE_04"] as const;
export type InstitutionalGate = (typeof INSTITUTIONAL_GATES)[number];
export type InstitutionalRole = "reader" | "designer" | "analyst" | "operator" | "admin" | "gate_01_reviewer" | "gate_02_reviewer" | "gate_03_reviewer" | "gate_04_reviewer" | "super_admin";
export type InstitutionalDecision = "allow" | "deny";

export const GATE_RESPONSIBILITY: Record<InstitutionalGate | "GATE_05", InstitutionalRole[]> = {
  GATE_01: ["reader", "designer", "analyst", "admin", "super_admin", "gate_01_reviewer"],
  GATE_02: ["designer", "analyst", "admin", "super_admin", "gate_02_reviewer"],
  GATE_03: ["analyst", "admin", "super_admin", "gate_03_reviewer"],
  GATE_04: ["admin", "super_admin", "gate_04_reviewer"],
  GATE_05: ["super_admin"],
};

export type InstitutionalAuditEvent = {
  id: string;
  at: string;
  gate: InstitutionalGate | "REQUEST" | "TRANSMISSION" | "GATE_05" | "SIMULATION";
  type: string;
  actorRole: InstitutionalRole;
  decision: InstitutionalDecision;
  message: string;
  physicalOutput: false;
};

export type InstitutionalWorkflow = {
  requestId: string;
  status: "gate_01_pending" | "gate_02_pending" | "gate_03_pending" | "gate_04_pending" | "awaiting_gate_05" | "approved_gate_05" | "refused";
  approvedGates: InstitutionalGate[];
  transmissionCode: string | null;
  transmissionVerified: boolean;
  gate05Decision: "approve" | "refuse" | null;
  simulationExecutions: number;
  events: InstitutionalAuditEvent[];
};

const now = () => new Date().toISOString();
const event = (
  workflow: InstitutionalWorkflow,
  gate: InstitutionalAuditEvent["gate"],
  type: string,
  actorRole: InstitutionalRole,
  decision: InstitutionalDecision,
  message: string,
): InstitutionalWorkflow => ({
  ...workflow,
  events: [...workflow.events, {
    id: `SIM-INST-${String(workflow.events.length + 1).padStart(3, "0")}`,
    at: now(),
    gate,
    type,
    actorRole,
    decision,
    message,
    physicalOutput: false,
  }],
});

export function createInstitutionalWorkflow(requestId = "SIM-REQ-001"): InstitutionalWorkflow {
  return {
    requestId,
    status: "gate_01_pending",
    approvedGates: [],
    transmissionCode: null,
    transmissionVerified: false,
    gate05Decision: null,
    simulationExecutions: 0,
    events: [{
      id: "SIM-INST-001",
      at: now(),
      gate: "REQUEST",
      type: "institutional.request.submitted",
      actorRole: "operator",
      decision: "allow",
      message: "Demande créée pour le parcours institutionnel local; toute sortie appareil relève du protocole ICX / Aeromind et de l’examen humain.",
      physicalOutput: false,
    }],
  };
}

function expectedGate(workflow: InstitutionalWorkflow): InstitutionalGate | null {
  return INSTITUTIONAL_GATES.find(gate => !workflow.approvedGates.includes(gate)) ?? null;
}

export function validateInstitutionalGate(
  workflow: InstitutionalWorkflow,
  gate: InstitutionalGate,
  actorRole: InstitutionalRole,
): { workflow: InstitutionalWorkflow; error?: string } {
  const expected = expectedGate(workflow);
  if (workflow.status === "refused" || workflow.status === "approved_gate_05") return { workflow, error: "La demande locale est clôturée." };
  if (expected !== gate) return { workflow, error: `Étape attendue : ${expected ?? "GATE_05"}.` };
  if (!GATE_RESPONSIBILITY[gate].includes(actorRole)) return { workflow, error: `Rôle requis : ${GATE_RESPONSIBILITY[gate].join(", ")}.` };
  const approvedGates = [...workflow.approvedGates, gate];
  const next = INSTITUTIONAL_GATES.find(item => !approvedGates.includes(item));
  const nextWorkflow: InstitutionalWorkflow = {
    ...workflow,
    approvedGates,
    status: next ? `${next.toLowerCase()}_pending` as InstitutionalWorkflow["status"] : "awaiting_gate_05",
  };
  const withEvent = event(nextWorkflow, gate, "institutional.gate.validated", actorRole, "allow", `${gate} validée dans le parcours de démonstration local.`);
  if (gate !== "GATE_04") return { workflow: withEvent };
  const transmissionCode = `AM-SIM-${workflow.requestId}-${String(withEvent.events.length + 1).padStart(3, "0")}`;
  return {
    workflow: event(
      { ...withEvent, transmissionCode },
      "TRANSMISSION",
      "institutional.transmission.issued",
      actorRole,
      "allow",
      "Code local généré pour le Super-Administrateur; il documente la transmission et ne remplace pas le protocole ICX / Aeromind ni l’examen humain.",
    ),
  };
}

export function verifyInstitutionalTransmission(
  workflow: InstitutionalWorkflow,
  code: string,
  actorRole: InstitutionalRole,
): { workflow: InstitutionalWorkflow; error?: string } {
  if (actorRole !== "super_admin") return { workflow, error: "La vérification de transmission est réservée au Super-Administrateur." };
  if (workflow.status !== "awaiting_gate_05" || !workflow.transmissionCode) return { workflow, error: "Aucun code de transmission vérifiable n’est disponible." };
  if (code.trim() !== workflow.transmissionCode) return { workflow: event(workflow, "TRANSMISSION", "institutional.transmission.verification_failed", actorRole, "deny", "Code local non reconnu; GATE 05 demeure indisponible."), error: "Code de transmission invalide." };
  return { workflow: event({ ...workflow, transmissionVerified: true }, "TRANSMISSION", "institutional.transmission.verified", actorRole, "allow", "Origine, intégrité et historique vérifiés localement par le Super-Administrateur.") };
}

export function decideInstitutionalGate05(
  workflow: InstitutionalWorkflow,
  decision: "approve" | "refuse",
  actorRole: InstitutionalRole,
): { workflow: InstitutionalWorkflow; error?: string } {
  if (actorRole !== "super_admin") return { workflow, error: "GATE 05 est une décision personnelle du Super-Administrateur." };
  if (workflow.status !== "awaiting_gate_05" || !workflow.transmissionVerified) return { workflow, error: "Vérifiez le code de transmission avant toute décision GATE 05." };
  const next: InstitutionalWorkflow = { ...workflow, gate05Decision: decision, status: decision === "approve" ? "approved_gate_05" : "refused" };
  return { workflow: event(next, "GATE_05", "institutional.gate_05.decided", actorRole, decision === "approve" ? "allow" : "deny", decision === "approve" ? "GATE 05 approuvée dans le parcours local; l’exécution appareil reste régie par le protocole ICX / Aeromind." : "GATE 05 refusée localement par le Super-Administrateur.") };
}

export function executeVirtualSimulation(
  workflow: InstitutionalWorkflow,
  actorRole: InstitutionalRole,
): { workflow: InstitutionalWorkflow; error?: string } {
  if (actorRole !== "operator" && actorRole !== "analyst") return { workflow, error: "Un rôle operator ou analyst est requis pour exécuter la simulation." };
  const next = { ...workflow, simulationExecutions: workflow.simulationExecutions + 1 };
  return { workflow: event(next, "SIMULATION", "institutional.simulation.executed", actorRole, "allow", "Commande virtuelle exécutée dans le simulateur local; aucun transport MAVLink ou physique invoqué.") };
}
