import { describe, expect, it } from "vitest";
import {
  areAllProtocolChecksAcknowledged,
  SIMULATION_ACTIVATION_PROTOCOL,
  TELEMETRY_ACTIVATION_PROTOCOL,
} from "./activationProtocol";

describe("activation protocols", () => {
  it("keeps both activation protocols closed until every acknowledgement is checked", () => {
    for (const protocol of [SIMULATION_ACTIVATION_PROTOCOL, TELEMETRY_ACTIVATION_PROTOCOL]) {
      const initial = protocol.map(() => false);
      expect(areAllProtocolChecksAcknowledged(initial)).toBe(false);
      initial[0] = true;
      expect(areAllProtocolChecksAcknowledged(initial)).toBe(false);
      expect(areAllProtocolChecksAcknowledged(protocol.map(() => true))).toBe(true);
    }
  });

  it("never treats an empty checklist as authorization", () => {
    expect(areAllProtocolChecksAcknowledged([])).toBe(false);
  });
});
