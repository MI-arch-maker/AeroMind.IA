import type { ValidationAuditEntry } from "../lib/validationAuditOutbox";
import "./validation-audit.css";

export interface PersistedValidationAuditEvent {
  id: string;
  projectId: string;
  eventType: string;
  message: string;
  payload: Record<string, unknown>;
  actorRole: string;
  occurredAt: string;
  createdAt: string;
}

export type AuditSyncState = "idle" | "local" | "queued" | "syncing" | "synced" | "error";

interface Props {
  projectId: string;
  projectName: string;
  canSync: boolean;
  syncState: AuditSyncState;
  pending: ValidationAuditEntry[];
  persisted: PersistedValidationAuditEvent[];
  loading: boolean;
  failed: boolean;
  onRefresh: () => void;
  onRetry: () => void;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Horodatage inconnu" : date.toLocaleString("fr-FR");
}

export function ValidationAuditJournal({
  projectId,
  projectName,
  canSync,
  syncState,
  pending,
  persisted,
  loading,
  failed,
  onRefresh,
  onRetry,
}: Props) {
  const status = !canSync
    ? "LOCAL · serveur non connecté"
    : syncState === "error" || failed
      ? "ERREUR · éléments conservés en attente"
      : pending.length
        ? syncState === "syncing" ? "SYNCHRONISATION…" : "EN ATTENTE DE SYNCHRONISATION"
        : loading
          ? "LECTURE DU SERVEUR…"
          : "PROJET SERVEUR LIÉ";

  return (
    <section className="panel reference-panel validation-audit-journal" aria-labelledby="validation-audit-title">
      <div className="panel-header">
        <div>
          <p className="eyebrow">JOURNAL PERSISTANT · REVUE HUMAINE · SIMULATION UNIQUEMENT</p>
          <h3 id="validation-audit-title">Journal de validation détaillé</h3>
        </div>
        <span className="calculated-badge" aria-live="polite">
          {persisted.length} confirmé{persisted.length === 1 ? "" : "s"}
          {pending.length ? ` · ${pending.length} en attente` : ""}
        </span>
      </div>

      <div className={`validation-audit-status ${syncState === "error" || failed ? "is-error" : syncState === "syncing" || pending.length ? "is-pending" : "is-ready"}`} role="status" aria-live="polite">
        <strong>{status}</strong>
        <span>{projectName || "Projet sans nom"} · {projectId || "aucun projet sélectionné"}</span>
      </div>

      <p className="section-description">Les actions et revues sont liées au projet actif. Une entrée n’est affichée comme confirmée qu’après réponse positive de l’API; les entrées hors ligne restent dans la file locale. Aucun événement ne commande un aéronef ni n’atteste un essai physique.</p>

      <div className="validation-audit-actions">
        <button type="button" className="secondary-button" onClick={onRefresh} disabled={!canSync || loading}>
          {loading ? "Actualisation…" : "Actualiser depuis le serveur"}
        </button>
        {pending.length > 0 && canSync && (
          <button type="button" className="secondary-button" onClick={onRetry} disabled={syncState === "syncing"}>
            <span>Réessayer l’envoi</span> ({pending.length})
          </button>
        )}
      </div>

      {failed && canSync && (
        <p className="validation-audit-error" role="alert">
          Le journal distant n’a pas pu être chargé. Les entrées locales ne sont pas supprimées; vérifiez la connexion puis réessayez.
        </p>
      )}

      {pending.length > 0 && (
        <section className="validation-audit-group" aria-labelledby="validation-audit-pending">
          <h4 id="validation-audit-pending">À synchroniser · non confirmé par le serveur</h4>
          <div className="operation-timeline">
            {pending.slice().reverse().map(event => (
              <div key={event.id} className="validation-audit-entry is-pending">
                <span className="timeline-dot" />
                <div>
                  <strong>{event.message}</strong>
                  <small> · {formatDate(event.occurredAt)} · {event.eventType} · <span>simulation locale</span></small>
                  <details className="validation-audit-details">
                    <summary>Afficher les détails locaux</summary>
                    <pre>{JSON.stringify(event.details, null, 2)}</pre>
                  </details>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="validation-audit-group" aria-labelledby="validation-audit-confirmed">
        <h4 id="validation-audit-confirmed">Confirmé par le serveur</h4>
        {!persisted.length ? (
          <p className="section-description">
            {loading ? "Chargement des événements du projet…" : canSync ? "Aucun événement confirmé pour ce projet." : "Connectez un projet serveur pour activer la synchronisation; les entrées locales restent identifiées comme non persistées."}
          </p>
        ) : (
          <div className="operation-timeline">
            {persisted.map(event => (
              <div key={event.id} className="validation-audit-entry">
                <span className="timeline-dot" />
                <div>
                  <strong>{event.message}</strong>
                  <small> · {formatDate(event.occurredAt || event.createdAt)} · {event.eventType} · rôle {event.actorRole}</small>
                  <details className="validation-audit-details">
                    <summary>Afficher les détails confirmés</summary>
                    <pre>{JSON.stringify(event.payload, null, 2)}</pre>
                  </details>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
