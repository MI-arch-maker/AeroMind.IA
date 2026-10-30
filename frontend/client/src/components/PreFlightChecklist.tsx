import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, ClipboardCheck, Plus, Trash2 } from "lucide-react";

// ===========================================================================
// PreFlightChecklist — per-drone checklist with validation (v8)
//
// Fetches the default template (10 items) or an existing checklist, lets the
// operator tick each item, then "execute" → audit log + pass/fail status.
// ===========================================================================

type ChecklistItem = {
  id: string;
  label: string;
  required: boolean;
  category: string;
  checked?: boolean;
};

type Checklist = {
  id: string;
  projectId: string | null;
  droneId: string | null;
  name: string;
  items: ChecklistItem[];
  executedAt: string | null;
  passed: boolean | null;
  createdAt: string;
};

type Props = {
  projectId: string | null;
};

export function PreFlightChecklist({ projectId }: Props) {
  const [template, setTemplate] = useState<ChecklistItem[]>([]);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [name, setName] = useState("");
  const [existing, setExisting] = useState<Checklist[]>([]);
  const [lastResult, setLastResult] = useState<{ passed: boolean; failedItems: string[] } | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Load default template
  useEffect(() => {
    fetch("/api/preflight/default-template", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.items) {
          setTemplate(data.items);
          setItems(data.items.map((i: ChecklistItem) => ({ ...i, checked: false })));
        }
      })
      .catch(() => {});
  }, []);

  // Load existing checklists
  const refreshExisting = async () => {
    const url = new URL("/api/preflight", window.location.origin);
    if (projectId) url.searchParams.set("projectId", projectId);
    const r = await fetch(url.toString(), { credentials: "include" });
    if (r.ok) {
      const body = await r.json();
      setExisting(Array.isArray(body?.checklists) ? body.checklists : []);
    }
  };

  useEffect(() => { void refreshExisting(); }, [projectId]);

  const toggle = (id: string) => {
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, checked: !i.checked } : i));
  };

  const execute = async () => {
    if (!name.trim()) {
      alert("Donnez un nom à la checklist avant exécution");
      return;
    }
    setLoading(true);
    setLastResult(null);
    setExecutionError(null);
    try {
      // Create checklist first
      const createResp = await fetch("/api/preflight", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), projectId, items }),
      });
      if (!createResp.ok) {
        setExecutionError("Échec de création de la checklist. Vérifiez la connexion puis réessayez.");
        return;
      }
      const created = await createResp.json();
      // Execute it
      const execResp = await fetch(`/api/preflight/${created.id}/execute`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!execResp.ok) {
        setExecutionError("La checklist a été créée, mais son exécution a échoué. Le statut reste inconnu; actualisez la liste et réessayez.");
        void refreshExisting();
        return;
      }
      const result = await execResp.json();
      if (typeof result?.passed !== "boolean") {
        throw new Error("Réponse d’exécution invalide");
      }
      setLastResult({ passed: result.passed, failedItems: Array.isArray(result.failedItems) ? result.failedItems : [] });
      void refreshExisting();
    } catch {
      setExecutionError("Erreur réseau pendant la création ou l’exécution de la checklist. Le résultat précédent a été effacé.");
    } finally {
      setLoading(false);
    }
  };

  const deleteChecklist = async (id: string) => {
    if (!confirm("Supprimer cette checklist ?")) return;
    await fetch(`/api/preflight/${id}`, { method: "DELETE", credentials: "include" });
    void refreshExisting();
  };

  const allRequiredChecked = items.filter((i) => i.required).every((i) => i.checked);
  const requiredCount = items.filter((i) => i.required).length;
  const checkedCount = items.filter((i) => i.checked).length;

  return (
    <div className="lb-preflight">
      <div className="lb-preflight-toolbar">
        <span className="lb-radar-title">
          <ClipboardCheck size={14} /> Pré-vol checklist ({checkedCount}/{items.length} cochés)
        </span>
        <button className="lb-primary" onClick={execute} disabled={loading || !name.trim()}>
          <ClipboardCheck size={14} /> {loading ? "…" : "Exécuter la checklist"}
        </button>
      </div>

      <input
        type="text"
        className="lb-preflight-name"
        placeholder="Nom de la checklist (ex: Vol pré-prod 24/10)"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      {executionError && <p className="lb-preflight-error" role="alert">{executionError}</p>}

      {lastResult && (
        <div className={`lb-preflight-result ${lastResult.passed ? "is-pass" : "is-fail"}`}>
          {lastResult.passed ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
          <div>
            <strong>{lastResult.passed ? "Pré-vol PASS" : "Pré-vol FAIL"}</strong>
            {lastResult.failedItems.length > 0 && (
              <small>Items échoués: {lastResult.failedItems.join(", ")}</small>
            )}
          </div>
        </div>
      )}

      <div className="lb-preflight-items">
        {items.map((item) => (
          <label key={item.id} className={`lb-preflight-item ${item.checked ? "is-checked" : ""}`}>
            <input
              type="checkbox"
              checked={item.checked || false}
              onChange={() => toggle(item.id)}
            />
            <div>
              <strong>{item.label}</strong>
              <small>{item.category}{item.required ? " · requis" : " · optionnel"}</small>
            </div>
            <span className="lb-preflight-check">
              {item.checked ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
            </span>
          </label>
        ))}
      </div>

      {/* Existing checklists */}
      <section className="lb-panel">
        <div className="lb-panel-title">
          <ClipboardCheck size={17} />
          <span>Checklists enregistrées</span>
          <small>{existing.length}</small>
        </div>
        {existing.length === 0 ? (
          <p className="lb-empty-state">Aucune checklist enregistrée pour ce projet.</p>
        ) : (
          <div className="lb-preflight-list">
            {existing.map((c) => (
              <div key={c.id} className="lb-preflight-row">
                <div>
                  <strong>{c.name}</strong>
                  <small>
                    {c.items?.length || 0} items · {c.executedAt ? `exécutée ${c.executedAt.slice(0, 19).replace("T", " ")}` : "brouillon"}
                    {c.passed === true && " · PASS"}
                    {c.passed === false && " · FAIL"}
                  </small>
                </div>
                <button className="lb-secondary" onClick={() => deleteChecklist(c.id)} title="Supprimer">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
