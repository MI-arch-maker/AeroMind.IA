import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, Check, Clock3, RotateCcw, ShieldCheck, X } from "lucide-react";
import "./human-command-center.css";

type CommandKind = "simulation-hold" | "simulation-return" | "simulation-land" | "simulation-pause";
type CommandEvent = { type: string; actor_id: string; actor_role: string; occurred_at: string; details: Record<string, unknown> };
type CommandRequest = {
  id: string;
  device: { id: string; name: string; connection: string; kind: string };
  command: CommandKind;
  command_label: string;
  expected_effect: string;
  risk: string;
  objective: string;
  parameters: Record<string, unknown>;
  preconditions: Record<string, boolean>;
  checks: Record<string, string>;
  request_sha256: string;
  status: string;
  prepared_at: string;
  expires_at: string;
  decided_by?: string | null;
  result?: { sent_to_hardware: boolean; physical_effect_verified: boolean; evidence_level: string; note: string } | null;
  events: CommandEvent[];
};

const commandOptions: Array<{ value: CommandKind; label: string }> = [
  { value: "simulation-hold", label: "Maintien simulé" },
  { value: "simulation-return", label: "Retour simulé" },
  { value: "simulation-land", label: "Atterrissage simulé" },
  { value: "simulation-pause", label: "Pause simulée" },
];
const statusLabels: Record<string, string> = {
  prepared: "Préparée — revue requise",
  pending_approval: "En attente de la première approbation humaine",
  pending_second_approval: "En attente du second réviseur vérifié",
  approved: "Autorisée — simulation non lancée",
  executing: "Simulation en cours",
  completed_simulated: "Terminée — résultat simulé",
  rejected: "Refusée",
  cancelled: "Annulée",
  expired: "Expirée",
  failed: "Échec",
};
const dateLabel = (date: string) => new Date(date).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });

export function HumanCommandCenter() {
  const [items, setItems] = useState<CommandRequest[]>([]);
  const [approvalItems, setApprovalItems] = useState<CommandRequest[]>([]);
  const [command, setCommand] = useState<CommandKind>("simulation-hold");
  const [objective, setObjective] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Chargement des demandes…");
  const [authenticated, setAuthenticated] = useState(true);

  const api = useCallback(async (path: string, method = "GET", body?: Record<string, unknown>) => {
    const response = await fetch(`/api/command-center${path}`, {
      method,
      credentials: "include",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) setAuthenticated(false);
    if (!response.ok) throw new Error(payload.detail ?? payload.message ?? `Erreur API ${response.status}`);
    return payload;
  }, []);

  const refresh = useCallback(async () => {
    try {
      const response = await api("/requests");
      setItems(response.items ?? []);
      try {
        const approvals = await api("/approvals");
        setApprovalItems(approvals.items ?? []);
      } catch {
        setApprovalItems([]);
      }
      setAuthenticated(true);
      setMessage("API authentifiée · deux identités humaines distinctes requises · simulation uniquement · aucune sortie physique.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Impossible de charger le centre de commande.");
    }
  }, [api]);

  useEffect(() => { void refresh(); }, [refresh]);

  const mutate = async (id: string, action: string, body?: Record<string, unknown>) => {
    setBusy(true);
    try {
      await api(`/requests/${encodeURIComponent(id)}/${action}`, "POST", body);
      setMessage(action === "execute-simulation" ? "Résultat simulé enregistré. Aucun équipement n’a été sollicité." : "État de la demande mis à jour côté serveur.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action refusée.");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const prepare = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await api("/requests", "POST", { command, objective, parameters: {} });
      setItems(current => [result, ...current.filter(item => item.id !== result.id)]);
      setObjective("");
      setMessage("Demande préparée par le serveur. Examine l’identité simulée, l’action et son empreinte avant de la présenter à l’approbation.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "La préparation a échoué.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="human-command-center" aria-labelledby="human-command-title">
      <header className="hcc-heading">
        <div>
          <span className="hcc-eyebrow">AEROMIND IA / CONTRÔLE HUMAIN</span>
          <h1 id="human-command-title">Centre de commande et de validation humaine</h1>
          <p>Double validation préalable par deux identités OIDC distinctes, dont un réviseur AeroMind habilité. Le résultat reste une simulation locale; aucun accès aux actionneurs ni aux équipements connectés.</p>
        </div>
        <span className="hcc-mode"><ShieldCheck size={16}/> SIMULATION UNIQUEMENT</span>
      </header>

      <section className="hcc-banner" role="note">
        <AlertTriangle size={19}/>
        <div><strong>Sortie physique impossible dans cette version.</strong><span>La cible est un simulateur local synthétique. L’approbation autorise uniquement l’exécution du scénario de démonstration ; elle n’autorise aucune commande d’aéronef.</span></div>
      </section>

      <div className="hcc-status" role="status"><span className={authenticated ? "hcc-dot" : "hcc-dot hcc-dot-error"}/>{message}</div>

      <section className="hcc-card">
        <div className="hcc-section-title"><div><span className="hcc-eyebrow">ÉTAPE 1</span><h2>Préparer une demande</h2></div><span className="hcc-tag">Sans exécution</span></div>
        <form className="hcc-form" onSubmit={event => void prepare(event)}>
          <label>Action simulée<select value={command} onChange={event => setCommand(event.target.value as CommandKind)}>{commandOptions.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label>Objectif explicite<input required minLength={8} maxLength={500} value={objective} onChange={event => setObjective(event.target.value)} placeholder="Ex. Vérifier la transition vers le maintien dans le scénario virtuel"/></label>
          <button className="hcc-button hcc-button-primary" type="submit" disabled={busy || !authenticated}>Préparer la demande</button>
        </form>
        <small className="hcc-help">Aucun paramètre d’actionneur n’est accepté. L’identifiant de cible est attribué par le serveur et désigne uniquement le simulateur.</small>
      </section>

      {approvalItems.length > 0 && <section className="hcc-requests hcc-approval-inbox">
        <div className="hcc-section-title"><div><span className="hcc-eyebrow">SECONDE SIGNATURE · RÉVISEUR VÉRIFIÉ</span><h2>Demandes à valider indépendamment</h2></div></div>
        {approvalItems.map(item => <article className="hcc-request" key={`review-${item.id}`}>
          <div className="hcc-request-top"><div><span className="hcc-eyebrow">{item.device.id} · SIMULATEUR LOCAL</span><h3>{item.command_label}</h3></div><span className="hcc-state hcc-state-pending_approval">Seconde signature requise</span></div>
          <dl className="hcc-facts"><div><dt>Objectif</dt><dd>{item.objective}</dd></div><div><dt>Effet attendu</dt><dd>{item.expected_effect}</dd></div><div><dt>Paramètres exacts</dt><dd><code>{JSON.stringify(item.parameters)}</code></dd></div><div><dt>Empreinte immuable</dt><dd><code>{item.request_sha256}</code></dd></div><div><dt>Expiration</dt><dd><Clock3 size={13}/> {dateLabel(item.expires_at)}</dd></div></dl>
          <div className="hcc-actions"><button className="hcc-button hcc-button-approve" disabled={busy} onClick={() => void mutate(item.id, "approve-second")}>J’approuve comme second réviseur</button><button className="hcc-button hcc-button-danger" disabled={busy} onClick={() => void mutate(item.id, "reject-second", { reason: "Refus du second réviseur" })}><X size={14}/> Refuser</button></div>
        </article>)}
      </section>}
      <section className="hcc-requests">
        <div className="hcc-section-title"><div><span className="hcc-eyebrow">ÉTAPES 1 À 6</span><h2>Demandes et historique</h2></div><button className="hcc-button hcc-button-quiet" type="button" onClick={() => void refresh()} disabled={busy}><RotateCcw size={15}/> Actualiser</button></div>
        {items.length === 0 ? <div className="hcc-empty">Aucune demande. Une demande préparée ne part jamais automatiquement.</div> : items.map(item => (
          <article className="hcc-request" key={item.id}>
            <div className="hcc-request-top"><div><span className="hcc-eyebrow">{item.device.id} · {item.device.connection === "not_connected" ? "NON CONNECTÉ" : item.device.connection}</span><h3>{item.command_label}</h3></div><span className={`hcc-state hcc-state-${item.status}`}>{statusLabels[item.status] ?? item.status}</span></div>
            <p className="hcc-device">{item.device.name}</p>
            <dl className="hcc-facts"><div><dt>Objectif</dt><dd>{item.objective}</dd></div><div><dt>Effet attendu</dt><dd>{item.expected_effect}</dd></div><div><dt>Paramètres exacts</dt><dd><code>{JSON.stringify(item.parameters)}</code></dd></div><div><dt>Risques / limites</dt><dd>{item.risk}</dd></div><div><dt>Expire le</dt><dd><Clock3 size={13}/> {dateLabel(item.expires_at)}</dd></div><div><dt>Empreinte de commande</dt><dd><code>{item.request_sha256}</code></dd></div></dl>
            <div className="hcc-checks"><strong>Contrôles préalables</strong>{Object.entries(item.checks).map(([key, value]) => <span key={key}><Check size={13}/><b>{key.replaceAll("_", " ")}</b> — {value}</span>)}</div>
            <div className="hcc-actions">
              {item.status === "prepared" && <button className="hcc-button hcc-button-primary" disabled={busy} onClick={() => void mutate(item.id, "present")}>Présenter ces informations pour approbation</button>}
              {item.status === "pending_approval" && <><button className="hcc-button hcc-button-approve" disabled={busy} onClick={() => void mutate(item.id, "approve")}>J’approuve cette demande exacte</button><button className="hcc-button hcc-button-danger" disabled={busy} onClick={() => void mutate(item.id, "reject", { reason: "Refus humain explicite" })}><X size={14}/> Refuser</button></>}
              {item.status === "pending_second_approval" && <span className="hcc-help">Première validation enregistrée. L’exécution reste bloquée jusqu’à l’accord d’un second réviseur authentifié.</span>}
              {item.status === "approved" && <button className="hcc-button hcc-button-primary" disabled={busy} onClick={() => void mutate(item.id, "execute-simulation")}>Exécuter en simulation</button>}
              {["prepared", "pending_approval", "approved"].includes(item.status) && <button className="hcc-button hcc-button-quiet" disabled={busy} onClick={() => void mutate(item.id, "cancel")}>Annuler</button>}
              {item.status === "completed_simulated" && <strong className="hcc-sim-result"><Check size={15}/> Simulation terminée · effet physique non vérifié</strong>}
            </div>
            {item.result && <div className="hcc-result"><strong>Résultat : démonstration synthétique</strong><span>{item.result.note}</span><code>sent_to_hardware: {String(item.result.sent_to_hardware)} · physical_effect_verified: {String(item.result.physical_effect_verified)} · {item.result.evidence_level}</code></div>}
            <details className="hcc-audit"><summary>Journal horodaté ({item.events.length} événements)</summary><ol>{item.events.map((event, index) => <li key={`${event.type}-${index}`}><time>{dateLabel(event.occurred_at)}</time><b>{event.type.replaceAll("_", " ")}</b><span>acteur {event.actor_id} · rôle {event.actor_role}</span></li>)}</ol></details>
          </article>
        ))}
      </section>
      <footer className="hcc-footer">Deux approbations humaines indépendantes sont requises : la première par le demandeur, la seconde par un réviseur OIDC habilité distinct. Les deux sont liées à l’empreinte immuable et expirent après 10 minutes. Cette porte autorise uniquement l’exécution locale simulée; toute sortie physique reste désactivée.</footer>
    </main>
  );
}
