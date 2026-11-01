import { describe, expect, it } from "vitest";
import {
  authorizeControlCommand,
  CONTROL_BOUNDARY,
  createControlAuditEvent,
  ingestReadOnlyTelemetry,
} from "./aircraftControlBoundary";

describe("aircraft control boundary", () => {
  const command = (kind: Parameters<typeof authorizeControlCommand>[0]["kind"]) => ({
    kind,
    operator: "test-operator",
    requestedAt: new Date(0).toISOString(),
  });

  it("keeps real hardware capabilities disabled", () => {
    expect(CONTROL_BOUNDARY.hardwareControlEnabled).toBe(false);
    expect(CONTROL_BOUNDARY.physicalFlightControlEnabled).toBe(false);
    expect(CONTROL_BOUNDARY.outboundCommandLinkEnabled).toBe(false);
    expect(CONTROL_BOUNDARY.telemetryWriteEnabled).toBe(false);
    expect(CONTROL_BOUNDARY.missionUploadEnabled).toBe(false);
    expect(CONTROL_BOUNDARY.intelligenceCollectionEnabled).toBe(false);
    expect(CONTROL_BOUNDARY.autonomousAuthorizationEnabled).toBe(false);
    expect(CONTROL_BOUNDARY.humanApprovalRequiredForSimulationStart).toBe(true);
    expect(CONTROL_BOUNDARY.deniedTransports).toContain("hil");
    expect(CONTROL_BOUNDARY.virtualArmingScope).toBe("simulation-only");
  });

  it.each(["actuator-write", "arm", "mission-upload"] as const)(
    "rejects %s in every transport",
    kind => {
      expect(authorizeControlCommand(command(kind), "simulation").accepted).toBe(false);
      expect(authorizeControlCommand(command(kind), "hil").accepted).toBe(false);
      expect(authorizeControlCommand(command(kind), "hardware-readonly").accepted).toBe(false);
    }
  );

  it("accepts a simulation command without creating a hardware path", () => {
    const decision = authorizeControlCommand(command("simulation-return"));
    expect(decision).toMatchObject({ accepted: true, mode: "simulation" });
    expect(createControlAuditEvent(decision, "CTRL-TEST")).toMatchObject({ id: "CTRL-TEST", command: "simulation-return" });
  });

  it("requires both a human approval and a clear AeroMind preflight to start simulation", () => {
    const start = command("simulation-start");
    expect(authorizeControlCommand(start).reason).toMatch(/accord humain préalable/i);
    expect(authorizeControlCommand({ ...start, payload: { humanApproved: true } }).reason).toMatch(/précontrôle AeroMind/i);
    expect(authorizeControlCommand({ ...start, payload: { humanApproved: true, preflightPassed: true } })).toMatchObject({ accepted: true, mode: "simulation" });
    expect(authorizeControlCommand({ ...start, payload: { humanApproved: true, preflightPassed: false } }).accepted).toBe(false);
  });

  it("rejects every command on the unconfigured HIL transport", () => {
    expect(authorizeControlCommand(command("observe"), "hil").accepted).toBe(false);
    expect(authorizeControlCommand(command("simulation-return"), "hil").reason).toMatch(/HIL non configuré/i);
  });

  it("allows observation only in hardware-readonly mode", () => {
    expect(authorizeControlCommand(command("observe"), "hardware-readonly").accepted).toBe(true);
    expect(authorizeControlCommand(command("simulation-hold"), "hardware-readonly").accepted).toBe(false);
  });

  it("accepts virtual arming inside the local simulation only", () => {
    const armed = authorizeControlCommand(command("simulation-arm"), "simulation");
    expect(armed.accepted).toBe(true);
    const disarmed = authorizeControlCommand(command("simulation-disarm"), "simulation");
    expect(disarmed.accepted).toBe(true);
    expect(authorizeControlCommand(command("simulation-arm"), "hil").accepted).toBe(false);
    expect(authorizeControlCommand(command("simulation-arm"), "hardware-readonly").accepted).toBe(false);
    expect(authorizeControlCommand(command("simulation-disarm"), "hardware-readonly").accepted).toBe(false);
    expect(authorizeControlCommand(command("simulation-arm"), "hil").reason).toMatch(/HIL non configuré/i);
  });

  it("never turns virtual arming into a hardware arming path", () => {
    expect(CONTROL_BOUNDARY.deniedCommands).toContain("arm");
    const hardware = authorizeControlCommand(command("arm"), "hil");
    expect(hardware.accepted).toBe(false);
    expect(hardware.reason).toMatch(/pilotage réel n’est disponible/i);
    const audit = createControlAuditEvent(
      authorizeControlCommand(command("simulation-arm"), "simulation"),
      "CTRL-ARM-SIM"
    );
    expect(audit).toMatchObject({
      id: "CTRL-ARM-SIM",
      command: "simulation-arm",
      mode: "simulation",
      accepted: true,
    });
  });

  it("validates telemetry as read-only input", () => {
    expect(ingestReadOnlyTelemetry(JSON.stringify({ telemetry: { altitudeM: 42, batteryPct: 80 } }))).toMatchObject({ accepted: true, frame: { altitudeM: 42, batteryPct: 80 } });
    expect(ingestReadOnlyTelemetry("bad-json")).toMatchObject({ accepted: false, frame: null });
  });
});
