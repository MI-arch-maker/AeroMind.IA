export type ValidationAuditEventType = "validation.action" | "validation.checkpoint";

export interface ValidationAuditEntry {
  id: string;
  projectId: string;
  eventType: ValidationAuditEventType;
  message: string;
  details: Record<string, unknown>;
  occurredAt: string;
}

export interface AuditStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const keyFor = (projectId: string) =>
  `aeromind:validation-audit-outbox:v1:${encodeURIComponent(projectId || "local")}`;

function isEntry(value: unknown, projectId: string): value is ValidationAuditEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<ValidationAuditEntry>;
  return entry.projectId === projectId
    && typeof entry.id === "string"
    && (entry.eventType === "validation.action" || entry.eventType === "validation.checkpoint")
    && typeof entry.message === "string"
    && entry.message.length > 0
    && entry.message.length <= 500
    && Boolean(entry.details && typeof entry.details === "object" && !Array.isArray(entry.details))
    && typeof entry.occurredAt === "string";
}

export function createValidationAuditEntry(
  projectId: string,
  eventType: ValidationAuditEventType,
  message: string,
  details: Record<string, unknown>,
  occurredAt = new Date().toISOString(),
): ValidationAuditEntry {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.randomUUID) throw new Error("Un identifiant sécurisé est requis pour journaliser l’événement.");
  return {
    id: cryptoApi.randomUUID(),
    projectId,
    eventType,
    message: message.trim().slice(0, 500),
    details,
    occurredAt,
  };
}

export function readValidationAuditOutbox(
  projectId: string,
  storage?: AuditStorage,
): ValidationAuditEntry[] {
  try {
    const resolvedStorage = storage ?? globalThis.localStorage;
    const raw = resolvedStorage?.getItem(keyFor(projectId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(value => isEntry(value, projectId)) : [];
  } catch {
    return [];
  }
}

export function writeValidationAuditOutbox(
  projectId: string,
  entries: ValidationAuditEntry[],
  storage?: AuditStorage,
): boolean {
  try {
    const resolvedStorage = storage ?? globalThis.localStorage;
    if (!resolvedStorage) return false;
    const scoped = entries.filter(entry => isEntry(entry, projectId)).slice(-500);
    resolvedStorage.setItem(keyFor(projectId), JSON.stringify(scoped));
    return true;
  } catch {
    return false;
  }
}
