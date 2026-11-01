import { describe, expect, it } from "vitest";
import {
  createInstitutionalWorkflow,
  decideInstitutionalGate05,
  executeVirtualSimulation,
  validateInstitutionalGate,
  verifyInstitutionalTransmission,
} from "./institutionalWorkflow";

describe("institutional simulation workflow", () => {
  it("keeps virtual simulation available before GATE 05", () => {
    const initial = createInstitutionalWorkflow();
    const result = executeVirtualSimulation(initial, "operator");
    expect(result.error).toBeUndefined();
    expect(result.workflow.simulationExecutions).toBe(1);
    expect(result.workflow.events.at(-1)?.physicalOutput).toBe(false);
  });

  it("requires each explicit GATE role in order and a verified code for GATE 05", () => {
    let workflow = createInstitutionalWorkflow("SIM-REQ-42");
    expect(validateInstitutionalGate(workflow, "GATE_02", "gate_02_reviewer").error).toMatch(/attendue/i);
    expect(validateInstitutionalGate(workflow, "GATE_01", "analyst").error).toMatch(/requis/i);
    workflow = validateInstitutionalGate(workflow, "GATE_01", "gate_01_reviewer").workflow;
    workflow = validateInstitutionalGate(workflow, "GATE_02", "gate_02_reviewer").workflow;
    workflow = validateInstitutionalGate(workflow, "GATE_03", "gate_03_reviewer").workflow;
    workflow = validateInstitutionalGate(workflow, "GATE_04", "gate_04_reviewer").workflow;
    expect(workflow.transmissionCode).toMatch(/^AM-SIM-/);
    expect(decideInstitutionalGate05(workflow, "approve", "super_admin").error).toMatch(/Vérifiez/i);
    expect(verifyInstitutionalTransmission(workflow, "bad-code", "super_admin").error).toMatch(/invalide/i);
    workflow = verifyInstitutionalTransmission(workflow, workflow.transmissionCode!, "super_admin").workflow;
    workflow = decideInstitutionalGate05(workflow, "approve", "super_admin").workflow;
    expect(workflow.status).toBe("approved_gate_05");
    expect(workflow.events.at(-1)?.physicalOutput).toBe(false);
  });
});
