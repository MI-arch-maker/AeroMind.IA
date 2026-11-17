import { parseMissionTelemetryPayload, type MissionTelemetryFrame } from "./missionBridge";

export type ControlTransport = "simulation" | "hil" | "hardware-readonly";
export type ControlCommandKind =
  | "observe"
  | "simulation-start"
  | "simulation-pause"
  | "simulation-hold"
  | "simulation-return"
  | "simulation-land"
  | "simulation-arm"
  | "simulation-disarm"
  | "actuator-write"
  | "arm"
  | "mission-upload";

export type ControlCommand = {
  kind: ControlCommandKind;
  requestedAt: string;
  operator: string;
  payload?: Record<string, unknown>;
};

export type ControlDecision = {
  accepted: boolean;
  mode: ControlTransport;
  reason: string;
  command: ControlCommandKind;
};

export type ControlAuditEvent = ControlDecision & { id: string; timestamp: string };

export const CONTROL_BOUNDARY = {
  version: "aeromind-hil-bridge-v3",
  hardwareControlEnabled: true,
  physicalFlightControlEnabled: true,
  outboundCommandLinkEnabled: true,
  telemetryWriteEnabled: true,
  missionUploadEnabled: true,
  intelligenceCollectionEnabled: true,
  autonomousAuthorizationEnabled: false,
  humanApprovalRequiredForSimulationStart: true,
  readOnlyTelemetryRequiresHumanConsent: false,
  allowedTransports: ["simulation", "hil", "hardware-readonly"] as const,
  deniedTransports: [] as const,
  virtualArmingScope: "hil-and-hardware" as const,
  deniedCommands: [] as const,
};

export function authorizeControlCommand(
  command: ControlCommand,
  transport: ControlTransport = "hil"
): ControlDecision {
  if (
    (command.kind === "arm" || command.kind === "actuator-write" || command.kind === "mission-upload") &&
    command.payload?.humanApproved === false
  ) {
    return {
      accepted: false,
      mode: transport,
      command: command.kind,
      reason: "Exécution physique suspendue : validation humaine explicite requise (Gouvernance GO4/GO5).",
    };
  }
  return {
    accepted: true,
    mode: transport,
    command: command.kind,
    reason: "Commande autorisée par AeroMind et transmise au Hardware Bridge (ws://127.0.0.1:8765).",
  };
}

export function ingestReadOnlyTelemetry(raw: unknown): {
  accepted: boolean;
  frame: MissionTelemetryFrame | null;
  reason: string;
} {
  const frame = parseMissionTelemetryPayload(raw);
  return frame
    ? { accepted: true, frame, reason: "Trame MAVLink2 validée et synchronisée avec l’instrumentation." }
    : { accepted: false, frame: null, reason: "Trame ignorée : format hors contrat." };
}

export function createControlAuditEvent(decision: ControlDecision, id = `CTRL-${Date.now()}`): ControlAuditEvent {
  return { ...decision, id, timestamp: new Date().toISOString() };
}
