export const SIMULATION_ADAPTER_CHECKLIST = [
  "purpose",
  "simulation-only",
  "preflight-reviewed",
  "local-stop-reviewed",
] as const;

export type SimulationChecklistItem = (typeof SIMULATION_ADAPTER_CHECKLIST)[number];
export type SimulationIntentSource = "virtual-joystick" | "test-input" | "heartbeat" | "hardware-transport";
export type SimulationAxis = "roll" | "pitch" | "yaw" | "throttle";
export type SimulationIntent = {
  kind: string;
  source: string;
  createdAt: number;
  payload?: unknown;
};

export type SimulationAuditEvent = {
  id: string;
  timestamp: number;
  kind: string;
  source: string;
  accepted: boolean;
  mode: "simulation-only";
  reason: string;
  physicalTransportRequested: boolean;
  physicalTransportInvoked: false;
};

export type SimulationOutput = {
  kind: "axis-input" | "simulation-arm" | "simulation-disarm";
  source: "virtual-joystick" | "test-input";
  createdAt: number;
  payload?: Partial<Record<SimulationAxis, number>>;
};

export type HeartbeatObservation = {
  receivedAt: number;
  fresh: boolean;
};

const LOCAL_SOURCES = new Set<SimulationIntentSource>(["virtual-joystick", "test-input"]);
const PHYSICAL_COMMAND_NAMES = new Set([
  "arm",
  "takeoff",
  "manual-control",
  "MANUAL_CONTROL",
  "actuator-write",
  "mission-upload",
  "parameter-write",
]);
const AXES = new Set<SimulationAxis>(["roll", "pitch", "yaw", "throttle"]);

/**
 * Local test adapter for abstract joystick/test intents.
 *
 * It deliberately has no socket, HTTP client, MAVLink dependency, callback
 * transport, or hardware API import. Accepted records are kept in an in-memory
 * simulation queue only. It is a test harness, not a flight-control system.
 */
export class SimulationOnlyAdapter {
  private checklist = new Map<SimulationChecklistItem, boolean>(
    SIMULATION_ADAPTER_CHECKLIST.map(item => [item, false])
  );
  private consentGranted = false;
  private heartbeat: HeartbeatObservation | null = null;
  private audit: SimulationAuditEvent[] = [];
  private outputQueue: SimulationOutput[] = [];
  private nextEventId = 1;

  constructor(
    private readonly options: {
      maxIntentAgeMs?: number;
      maxFutureSkewMs?: number;
      maxAuditEntries?: number;
      maxQueuedOutputs?: number;
    } = {}
  ) {}

  get isConsentGranted(): boolean {
    return this.consentGranted;
  }

  get currentHeartbeat(): HeartbeatObservation | null {
    return this.heartbeat ? { ...this.heartbeat } : null;
  }

  setChecklist(checks: Partial<Record<SimulationChecklistItem, boolean>>, now = Date.now()): void {
    const changed = SIMULATION_ADAPTER_CHECKLIST.some(item =>
      Object.hasOwn(checks, item) && this.checklist.get(item) !== checks[item]
    );
    for (const item of SIMULATION_ADAPTER_CHECKLIST) {
      if (Object.hasOwn(checks, item)) this.checklist.set(item, checks[item] === true);
    }
    if (changed && this.consentGranted) {
      this.consentGranted = false;
      this.outputQueue = [];
      this.record({
        now,
        kind: "consent-revoked",
        source: "test-input",
        accepted: false,
        reason: "Checklist modifiée : consentement révoqué et file de simulation purgée.",
      });
    }
  }

  approveHumanConsent(humanConfirmed: boolean, now = Date.now()): boolean {
    const allChecked = SIMULATION_ADAPTER_CHECKLIST.every(item => this.checklist.get(item) === true);
    if (!humanConfirmed || !allChecked) {
      this.consentGranted = false;
      this.outputQueue = [];
      this.record({
        now,
        kind: "consent-grant",
        source: "test-input",
        accepted: false,
        reason: !allChecked
          ? "Consentement refusé : la checklist locale doit être entièrement cochée."
          : "Consentement refusé : confirmation humaine explicite requise.",
      });
      return false;
    }
    this.consentGranted = true;
    this.record({
      now,
      kind: "consent-grant",
      source: "test-input",
      accepted: true,
      reason: "Consentement humain valide pour cette session de simulation locale uniquement.",
    });
    return true;
  }

  revokeConsent(reason = "Consentement retiré par l’opérateur.", now = Date.now()): void {
    this.consentGranted = false;
    this.outputQueue = [];
    this.record({
      now,
      kind: "consent-revoked",
      source: "test-input",
      accepted: false,
      reason,
    });
  }

  /** Heartbeats are observational metadata; this method cannot grant consent. */
  observeHeartbeat(receivedAt: number, now = Date.now()): HeartbeatObservation {
    const valid = Number.isFinite(receivedAt) && receivedAt <= now;
    const maxAge = this.options.maxIntentAgeMs ?? 1_000;
    this.heartbeat = {
      receivedAt: Number.isFinite(receivedAt) ? receivedAt : now,
      fresh: valid && now - receivedAt <= maxAge,
    };
    this.record({
      now,
      kind: "heartbeat-observed",
      source: "heartbeat",
      accepted: valid,
      reason: valid
        ? "Heartbeat enregistré comme observation seulement; aucun droit d’activation accordé."
        : "Heartbeat rejeté comme observation invalide ou datée dans le futur; aucun droit d’activation accordé.",
    });
    return { ...this.heartbeat };
  }

  submit(intent: SimulationIntent, now = Date.now()): { accepted: boolean; reason: string; event: SimulationAuditEvent } {
    const sourceIsLocal = LOCAL_SOURCES.has(intent.source as SimulationIntentSource);
    const physicalTransportRequested =
      intent.source === "hardware-transport" || PHYSICAL_COMMAND_NAMES.has(intent.kind);

    if (!sourceIsLocal) {
      return this.reject(intent, now, "Source refusée : seules les entrées joystick virtuel et test local sont admises.", physicalTransportRequested);
    }
    if (PHYSICAL_COMMAND_NAMES.has(intent.kind)) {
      return this.reject(intent, now, "Commande refusée par défaut : le simulateur n’accepte aucun ordre matériel.", true);
    }
    if (!Number.isFinite(intent.createdAt)) {
      return this.reject(intent, now, "Entrée refusée : horodatage absent ou invalide.", physicalTransportRequested);
    }
    const ageMs = now - intent.createdAt;
    if (ageMs < -(this.options.maxFutureSkewMs ?? 100) || ageMs > (this.options.maxIntentAgeMs ?? 1_000)) {
      return this.reject(intent, now, "Entrée refusée : horodatage futur ou données périmées.", physicalTransportRequested);
    }
    if (!this.consentGranted) {
      return this.reject(intent, now, "Entrée refusée : checklist et consentement humain requis pour la session locale.", physicalTransportRequested);
    }

    let output: SimulationOutput;
    if (intent.kind === "axis-input") {
      const parsed = this.validateAxes(intent.payload);
      if (!parsed) {
        return this.reject(intent, now, "Entrée refusée : axes invalides; roll, pitch et yaw doivent être dans [-1, 1], throttle dans [0, 1].", physicalTransportRequested);
      }
      output = {
        kind: "axis-input",
        source: intent.source as "virtual-joystick" | "test-input",
        createdAt: intent.createdAt,
        payload: parsed,
      };
    } else if (intent.kind === "simulation-arm" || intent.kind === "simulation-disarm") {
      output = {
        kind: intent.kind,
        source: intent.source as "virtual-joystick" | "test-input",
        createdAt: intent.createdAt,
      };
    } else {
      return this.reject(intent, now, "Entrée refusée : type abstrait inconnu ou non autorisé par le contrat simulation-only.", physicalTransportRequested);
    }

    const maxQueued = this.options.maxQueuedOutputs ?? 100;
    if (this.outputQueue.length >= maxQueued) this.outputQueue.shift();
    this.outputQueue.push(output);
    const event = this.record({
      now,
      kind: intent.kind,
      source: intent.source,
      accepted: true,
      reason: "Entrée acceptée dans la file mémoire de simulation locale; aucun transport externe invoqué.",
      physicalTransportRequested: false,
    });
    return { accepted: true, reason: event.reason, event };
  }

  readAuditLog(): SimulationAuditEvent[] {
    return this.audit.map(event => ({ ...event }));
  }

  /** Drain accepted simulation records; this is not a transport or hardware API. */
  consumeSimulationQueue(now = Date.now()): SimulationOutput[] {
    const maxAge = this.options.maxIntentAgeMs ?? 1_000;
    const fresh: SimulationOutput[] = [];
    for (const item of this.outputQueue) {
      const ageMs = now - item.createdAt;
      if (ageMs >= -(this.options.maxFutureSkewMs ?? 100) && ageMs <= maxAge) {
        fresh.push({ ...item, payload: item.payload ? { ...item.payload } : undefined });
      } else {
        this.record({
          now,
          kind: "queued-intent-expired",
          source: item.source,
          accepted: false,
          reason: "Entrée retirée de la file : elle est périmée ou son horodatage est invalide.",
        });
      }
    }
    this.outputQueue = [];
    return fresh;
  }

  private validateAxes(value: unknown): Partial<Record<SimulationAxis, number>> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const axes = value as Record<string, unknown>;
    const keys = Object.keys(axes);
    if (keys.length === 0 || keys.some(key => !AXES.has(key as SimulationAxis))) return null;
    for (const [key, axisValue] of Object.entries(axes)) {
      if (typeof axisValue !== "number" || !Number.isFinite(axisValue)) return null;
      const max = key === "throttle" ? 1 : 1;
      const min = key === "throttle" ? 0 : -1;
      if (axisValue < min || axisValue > max) return null;
    }
    return axes as Partial<Record<SimulationAxis, number>>;
  }

  private reject(
    intent: SimulationIntent,
    now: number,
    reason: string,
    physicalTransportRequested = false
  ): { accepted: false; reason: string; event: SimulationAuditEvent } {
    const event = this.record({
      now,
      kind: intent.kind,
      source: intent.source,
      accepted: false,
      reason,
      physicalTransportRequested,
    });
    return { accepted: false, reason, event };
  }

  private record(input: {
    now: number;
    kind: string;
    source: string;
    accepted: boolean;
    reason: string;
    physicalTransportRequested?: boolean;
  }): SimulationAuditEvent {
    const event: SimulationAuditEvent = {
      id: `SIM-ADAPTER-${this.nextEventId++}`,
      timestamp: input.now,
      kind: input.kind,
      source: input.source,
      accepted: input.accepted,
      mode: "simulation-only",
      reason: input.reason,
      physicalTransportRequested: input.physicalTransportRequested ?? false,
      physicalTransportInvoked: false,
    };
    this.audit.push(event);
    const maxEntries = this.options.maxAuditEntries ?? 250;
    if (this.audit.length > maxEntries) this.audit.splice(0, this.audit.length - maxEntries);
    return { ...event };
  }
}
