import { describe, expect, it } from "vitest";
import {
  readValidationAuditOutbox,
  writeValidationAuditOutbox,
  type AuditStorage,
  type ValidationAuditEntry,
} from "./validationAuditOutbox";

function memoryStorage(): AuditStorage {
  const values = new Map<string, string>();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
  };
}

const entry = (projectId: string, id: string): ValidationAuditEntry => ({
  id,
  projectId,
  eventType: "validation.checkpoint",
  message: "Revue enregistrée",
  details: { simulationOnly: true },
  occurredAt: "2026-10-21T10:00:00.000Z",
});

describe("validation audit outbox", () => {
  it("persists and reloads entries only for their project", () => {
    const storage = memoryStorage();
    const first = entry("project-a", "event-a");
    const second = entry("project-b", "event-b");

    expect(writeValidationAuditOutbox("project-a", [first], storage)).toBe(true);
    expect(writeValidationAuditOutbox("project-b", [second], storage)).toBe(true);
    expect(readValidationAuditOutbox("project-a", storage)).toEqual([first]);
    expect(readValidationAuditOutbox("project-b", storage)).toEqual([second]);
  });

  it("ignores malformed, cross-project and invalid entries", () => {
    const storage = memoryStorage();
    const valid = entry("project-a", "event-a");
    expect(writeValidationAuditOutbox("project-a", [valid, entry("project-b", "foreign")], storage)).toBe(true);
    expect(readValidationAuditOutbox("project-a", storage)).toEqual([valid]);
    storage.setItem("aeromind:validation-audit-outbox:v1:bad", "{");
    expect(readValidationAuditOutbox("bad", storage)).toEqual([]);
  });
});
