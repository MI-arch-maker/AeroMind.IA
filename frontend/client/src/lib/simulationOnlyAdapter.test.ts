import { beforeEach, describe, expect, it } from "vitest";
import {
  SIMULATION_ADAPTER_CHECKLIST,
  SimulationOnlyAdapter,
  type SimulationChecklistItem,
} from "./simulationOnlyAdapter";

const now = 1_000_000;
const allChecked = Object.fromEntries(
  SIMULATION_ADAPTER_CHECKLIST.map(item => [item, true])
) as Record<SimulationChecklistItem, boolean>;

function approvedAdapter() {
  const adapter = new SimulationOnlyAdapter();
  adapter.setChecklist(allChecked, now - 20);
  expect(adapter.approveHumanConsent(true, now - 10)).toBe(true);
  return adapter;
}

describe("SimulationOnlyAdapter", () => {
  let adapter: SimulationOnlyAdapter;

  beforeEach(() => {
    adapter = new SimulationOnlyAdapter();
  });

  it("rejects by default until the full checklist and explicit human consent", () => {
    const result = adapter.submit({
      kind: "axis-input",
      source: "virtual-joystick",
      createdAt: now,
      payload: { roll: 0.3, throttle: 0.2 },
    }, now);

    expect(adapter.isConsentGranted).toBe(false);
    expect(result.accepted).toBe(false);
    expect(result.reason).toMatch(/consentement humain requis/i);
    expect(adapter.consumeSimulationQueue(now)).toEqual([]);
    expect(result.event.physicalTransportInvoked).toBe(false);
  });

  it("requires every checklist item and a distinct explicit human confirmation", () => {
    adapter.setChecklist({ purpose: true, "simulation-only": true }, now);
    expect(adapter.approveHumanConsent(true, now)).toBe(false);

    adapter.setChecklist(allChecked, now + 1);
    expect(adapter.approveHumanConsent(false, now + 2)).toBe(false);
    expect(adapter.isConsentGranted).toBe(false);
    expect(adapter.approveHumanConsent(true, now + 3)).toBe(true);
    expect(adapter.isConsentGranted).toBe(true);
  });

  it.each(["virtual-joystick", "test-input"] as const)(
    "accepts validated %s axis intents only into the in-memory simulation queue",
    source => {
      adapter = approvedAdapter();
      const result = adapter.submit({
        kind: "axis-input",
        source,
        createdAt: now,
        payload: { roll: -0.5, pitch: 0.25, yaw: 0, throttle: 0.6 },
      }, now);

      expect(result.accepted).toBe(true);
      expect(result.event).toMatchObject({
        mode: "simulation-only",
        physicalTransportRequested: false,
        physicalTransportInvoked: false,
      });
      expect(adapter.consumeSimulationQueue(now)).toEqual([
        {
          kind: "axis-input",
          source,
          createdAt: now,
          payload: { roll: -0.5, pitch: 0.25, yaw: 0, throttle: 0.6 },
        },
      ]);
    }
  );

  it("revokes consent and purges queued outputs when a checklist item changes", () => {
    adapter = approvedAdapter();
    expect(adapter.submit({
      kind: "axis-input",
      source: "test-input",
      createdAt: now,
      payload: { roll: 0.1 },
    }, now).accepted).toBe(true);

    adapter.setChecklist({ purpose: false }, now + 1);
    expect(adapter.isConsentGranted).toBe(false);
    expect(adapter.consumeSimulationQueue(now)).toEqual([]);
    expect(adapter.submit({
      kind: "simulation-arm",
      source: "test-input",
      createdAt: now + 1,
    }, now + 1).accepted).toBe(false);
    expect(adapter.readAuditLog().some(event => event.kind === "consent-revoked")).toBe(true);
  });

  it("revokes consent explicitly and rejects subsequent intents", () => {
    adapter = approvedAdapter();
    adapter.revokeConsent("Test de retrait opérateur.", now + 1);
    expect(adapter.isConsentGranted).toBe(false);

    const result = adapter.submit({
      kind: "simulation-disarm",
      source: "virtual-joystick",
      createdAt: now + 1,
    }, now + 1);
    expect(result.accepted).toBe(false);
    expect(adapter.readAuditLog().at(-1)?.reason).toMatch(/consentement humain requis/i);
  });

  it("rejects stale or future-dated local input", () => {
    adapter = approvedAdapter();
    const stale = adapter.submit({
      kind: "axis-input",
      source: "test-input",
      createdAt: now - 1_001,
      payload: { roll: 0.1 },
    }, now);
    const future = adapter.submit({
      kind: "axis-input",
      source: "test-input",
      createdAt: now + 101,
      payload: { roll: 0.1 },
    }, now);

    expect(stale.accepted).toBe(false);
    expect(stale.reason).toMatch(/données périmées/i);
    expect(future.accepted).toBe(false);
    expect(future.reason).toMatch(/futur/i);
    expect(adapter.consumeSimulationQueue(now)).toEqual([]);
  });

  it("discards an accepted command if it expires while waiting in the local queue", () => {
    adapter = approvedAdapter();
    expect(adapter.submit({
      kind: "axis-input",
      source: "test-input",
      createdAt: now,
      payload: { roll: 0.1 },
    }, now).accepted).toBe(true);

    expect(adapter.consumeSimulationQueue(now + 1_001)).toEqual([]);
    expect(adapter.readAuditLog().at(-1)).toMatchObject({
      kind: "queued-intent-expired",
      accepted: false,
      physicalTransportInvoked: false,
    });
  });

  it("records a fresh heartbeat as observation only; it never grants consent or unlocks commands", () => {
    adapter.setChecklist(allChecked, now - 1);
    const heartbeat = adapter.observeHeartbeat(now, now);
    expect(heartbeat).toEqual({ receivedAt: now, fresh: true });
    expect(adapter.isConsentGranted).toBe(false);

    const result = adapter.submit({
      kind: "axis-input",
      source: "virtual-joystick",
      createdAt: now,
      payload: { yaw: 0.1 },
    }, now);
    expect(result.accepted).toBe(false);
    expect(adapter.consumeSimulationQueue(now)).toEqual([]);
    expect(adapter.readAuditLog().find(event => event.kind === "heartbeat-observed")?.accepted).toBe(true);
    expect(adapter.readAuditLog().find(event => event.kind === "heartbeat-observed")?.reason).toMatch(/aucun droit d’activation/i);
  });

  it("does not accept heartbeat as an intent source, even after the human simulation checklist is approved", () => {
    adapter = approvedAdapter();
    adapter.observeHeartbeat(now, now);
    const result = adapter.submit({
      kind: "simulation-arm",
      source: "heartbeat",
      createdAt: now,
    }, now);

    expect(result.accepted).toBe(false);
    expect(result.reason).toMatch(/joystick virtuel et test local/i);
    expect(result.event.physicalTransportInvoked).toBe(false);
  });

  it("marks stale heartbeat as stale observation without granting consent", () => {
    const heartbeat = adapter.observeHeartbeat(now - 1_001, now);
    expect(heartbeat.fresh).toBe(false);
    expect(adapter.isConsentGranted).toBe(false);
  });

  it.each([
    ["manual-control", "test-input"],
    ["MANUAL_CONTROL", "test-input"],
    ["arm", "test-input"],
    ["actuator-write", "test-input"],
    ["mission-upload", "test-input"],
    ["axis-input", "hardware-transport"],
  ])("logs and rejects physical intent %s from %s without invoking a transport", (kind, source) => {
    adapter = approvedAdapter();
    const result = adapter.submit({ kind, source, createdAt: now, payload: { roll: 0.2 } }, now);

    expect(result.accepted).toBe(false);
    expect(result.event.mode).toBe("simulation-only");
    expect(result.event.physicalTransportRequested).toBe(true);
    expect(result.event.physicalTransportInvoked).toBe(false);
    expect(adapter.consumeSimulationQueue(now)).toEqual([]);
    expect(adapter.readAuditLog().at(-1)).toMatchObject({
      kind,
      source,
      accepted: false,
      physicalTransportInvoked: false,
    });
  });

  it("rejects out-of-range axes and unknown command kinds", () => {
    adapter = approvedAdapter();
    expect(adapter.submit({ kind: "axis-input", source: "test-input", createdAt: now, payload: { roll: 2 } }, now).accepted).toBe(false);
    expect(adapter.submit({ kind: "axis-input", source: "test-input", createdAt: now, payload: { throttle: -0.1 } }, now).accepted).toBe(false);
    expect(adapter.submit({ kind: "mystery", source: "test-input", createdAt: now }, now).accepted).toBe(false);
    expect(adapter.consumeSimulationQueue(now)).toEqual([]);
  });

  it("bounds a rapid joystick burst and keeps only the newest outputs", () => {
    adapter = new SimulationOnlyAdapter({ maxQueuedOutputs: 32 });
    adapter.setChecklist(allChecked, now - 20);
    adapter.approveHumanConsent(true, now - 10);

    for (let i = 0; i < 10_000; i++) {
      const roll = (i % 200) / 100 - 1;
      expect(adapter.submit({
        kind: "axis-input",
        source: "virtual-joystick",
        createdAt: now,
        payload: { roll },
      }, now).accepted).toBe(true);
    }

    const outputs = adapter.consumeSimulationQueue(now);
    expect(outputs).toHaveLength(32);
    expect(outputs[0].payload?.roll).toBeCloseTo((9_968 % 200) / 100 - 1);
    expect(outputs.at(-1)?.payload?.roll).toBeCloseTo((9_999 % 200) / 100 - 1);
    expect(adapter.readAuditLog().every(event => event.physicalTransportInvoked === false)).toBe(true);
  });

  it("purges a queued burst and remains locked after consent revocation", () => {
    adapter = new SimulationOnlyAdapter({ maxQueuedOutputs: 64 });
    adapter.setChecklist(allChecked, now - 20);
    adapter.approveHumanConsent(true, now - 10);
    for (let i = 0; i < 50; i++) {
      expect(adapter.submit({
        kind: "axis-input",
        source: "test-input",
        createdAt: now,
        payload: { yaw: 0.2 },
      }, now).accepted).toBe(true);
    }

    // Simulates the action a connection watchdog must take on link loss.
    adapter.revokeConsent("Liaison de test interrompue.", now + 1);
    expect(adapter.isConsentGranted).toBe(false);
    expect(adapter.consumeSimulationQueue(now + 1)).toEqual([]);
    expect(adapter.submit({
      kind: "axis-input",
      source: "virtual-joystick",
      createdAt: now + 2,
      payload: { yaw: 0.2 },
    }, now + 2).accepted).toBe(false);
    expect(adapter.readAuditLog().at(-1)).toMatchObject({
      kind: "axis-input",
      accepted: false,
      physicalTransportInvoked: false,
    });
  });

  it("does not allow heartbeat or checklist changes to bypass explicit consent", () => {
    adapter.setChecklist(allChecked, now);
    adapter.observeHeartbeat(now, now);
    expect(adapter.isConsentGranted).toBe(false);
    expect(adapter.submit({ kind: "simulation-arm", source: "heartbeat", createdAt: now }, now).accepted).toBe(false);

    adapter.approveHumanConsent(true, now + 1);
    adapter.setChecklist({ "simulation-only": false }, now + 2);
    expect(adapter.isConsentGranted).toBe(false);
    expect(adapter.consumeSimulationQueue(now + 2)).toEqual([]);
  });

});
