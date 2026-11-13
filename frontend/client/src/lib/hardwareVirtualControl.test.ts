import { describe, expect, it } from "vitest";
import {
  activateLocalVirtual,
  apiDetailMessage,
  applyLocalVirtualCommand,
  armLocalVirtual,
  createLocalVirtualControlState,
  emergencyStopLocalVirtual,
  validateVirtualCommand,
} from "./hardwareControl";

describe("contrôle VIRTUAL — modèle local sans matériel", () => {
  it("exige deux confirmations séparées pour activer puis armer", () => {
    const initial = createLocalVirtualControlState();
    expect(activateLocalVirtual(initial, true, false).error).toMatch(/deux confirmations/i);
    const active = activateLocalVirtual(initial, true, true);
    expect(active.state).toMatchObject({ mode: "VIRTUAL", virtual_active: true, armed: false, physical_output: false });
    expect(active.receipt).toMatchObject({ scope: "virtual-only", physical_output: false, revision: 1 });
    expect(armLocalVirtual(active.state, true, false).error).toMatch(/nouvelle paire/i);
    expect(armLocalVirtual(active.state, true, true).state).toMatchObject({ armed: true, revision: 2 });
  });

  it("borne les setpoints VIRTUAL et consomme une confirmation par commande", () => {
    const active = activateLocalVirtual(createLocalVirtualControlState(), true, true).state;
    const armed = armLocalVirtual(active, true, true).state;
    expect(validateVirtualCommand({ command: "position", x_m: 501, y_m: 0, altitude_m: 20, confirm_command: true })).toMatch(/geofence/i);
    expect(validateVirtualCommand({ command: "position", x_m: 0, y_m: 0, altitude_m: 121, confirm_command: true })).toMatch(/Altitude/i);
    expect(validateVirtualCommand({ command: "heading", heading_deg: 361, confirm_command: true })).toMatch(/Cap/i);
    expect(applyLocalVirtualCommand(armed, { command: "heading", heading_deg: 180, confirm_command: false }).error).toMatch(/Confirmez/i);
    const applied = applyLocalVirtualCommand(armed, { command: "position", x_m: 12, y_m: -7, altitude_m: 42, confirm_command: true });
    expect(applied.state.setpoint.position).toEqual({ x_m: 12, y_m: -7, altitude_m: 42 });
    expect(applied.receipt).toMatchObject({ event: "position", status: "applied_virtual", physical_output: false });
  });

  it("purge, désarme et interdit toute reprise automatique après l’arrêt", () => {
    const active = activateLocalVirtual(createLocalVirtualControlState(), true, true).state;
    const armed = armLocalVirtual(active, true, true).state;
    const stopped = emergencyStopLocalVirtual(armed);
    expect(stopped.state).toMatchObject({ mode: "SIMULATION", virtual_active: false, armed: false, stopped: true, pending_commands: 0, physical_output: false });
    expect(applyLocalVirtualCommand(stopped.state, { command: "heading", heading_deg: 90, confirm_command: true }).error).toMatch(/Arrêt d’urgence/i);
    const explicitReactivation = activateLocalVirtual(stopped.state, true, true);
    expect(explicitReactivation.state).toMatchObject({ mode: "VIRTUAL", virtual_active: true, armed: false, stopped: false });
  });

  it("convertit un tableau detail FastAPI en texte affichable sans objet React", () => {
    expect(apiDetailMessage([
      { loc: ["body", "x_m"], msg: "Input should be less than or equal to 500" },
      { loc: ["body", "altitude_m"], msg: "Field required" },
    ])).toBe("body.x_m : Input should be less than or equal to 500 — body.altitude_m : Field required");
    expect(apiDetailMessage({ error: { message: "Visitor accounts use the explicit local simulation" } })).toContain("local simulation");
  });
});
