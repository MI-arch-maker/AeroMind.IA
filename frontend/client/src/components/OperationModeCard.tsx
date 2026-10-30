import { useEffect, useState } from "react";
import { Activity, Cpu, Gauge, Power, RefreshCw, Zap } from "lucide-react";
import { toast } from "sonner";
import { bearerHeaders } from "@/lib/sessionToken";

type ModeInfo = {
  current_mode: string;
  hardware_control: boolean;
  available_transitions: string[];
  all_gates_approved: boolean;
  gate_project_id?: string | null;
  timestamp: string;
};

type HealthInfo = {
  status: string;
  mode: string;
  environment: string;
  hardware_control: boolean;
  database_url_configured: boolean;
  oidc_configured: boolean;
  sentry_configured: boolean;
  stats: Record<string, number | string>;
  warnings?: string[];
  timestamp: string;
};

const modeColors: Record<string, string> = {
  DEMO: "bg-slate-100 text-slate-700 border-slate-300",
  SIMULATION: "bg-blue-50 text-blue-700 border-blue-300",
  SITL: "bg-violet-50 text-violet-700 border-violet-300",
  HIL: "bg-amber-50 text-amber-700 border-amber-300",
  HARDWARE: "bg-red-50 text-red-700 border-red-300",
  OFFLINE: "bg-slate-200 text-slate-500 border-slate-400",
};

const modeLabels: Record<string, string> = {
  DEMO: "Démo",
  SIMULATION: "Simulation",
  SITL: "SITL (Software In The Loop)",
  HIL: "HIL (Hardware In The Loop)",
  HARDWARE: "Matériel (HARDWARE_CONTROL)",
  OFFLINE: "Hors ligne",
};

const modeDescriptions: Record<string, string> = {
  DEMO: "Mode démonstration — aucune commande MAVLink, données synthétiques.",
  SIMULATION: "Mode simulation par défaut — calculs et essais virtuels uniquement.",
  SITL: "ArduPilot SITL actif — autopilote logiciel simulé, télémétrie en lecture seule.",
  HIL: "Hardware In The Loop — autopilote physique connecté, pas de vol réel.",
  HARDWARE: "Commandes MAVLink matérielles autorisées — G0-G5 requises.",
  OFFLINE: "Système hors ligne — aucune opération possible.",
};

export function OperationModeCard() {
  const [mode, setMode] = useState<ModeInfo | null>(null);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [changing, setChanging] = useState(false);
  const [gateProjectId, setGateProjectId] = useState("");

  const fetchMode = async (projectId = gateProjectId) => {
    setLoading(true);
    try {
      const query = projectId.trim() ? `?project_id=${encodeURIComponent(projectId.trim())}` : "";
      const response = await fetch(`/api/ops/mode${query}`, {
        credentials: "include",
        headers: bearerHeaders(),
      });
      if (!response.ok) throw new Error("État du mode indisponible.");
      setMode(await response.json());
    } catch (error) {
      setMode(null);
      toast.error("Vérification impossible", { description: error instanceof Error ? error.message : "Connexion à l’API indisponible." });
    } finally {
      setLoading(false);
    }
  };

  const fetchHealth = async () => {
    try {
      const response = await fetch("/api/ops/health", {
        credentials: "include",
        headers: bearerHeaders(),
      });
      if (!response.ok) throw new Error("Santé système indisponible.");
      setHealth(await response.json());
    } catch {
      setHealth(null);
    }
  };

  useEffect(() => {
    void fetchMode();
    void fetchHealth();
  }, []);

  const changeMode = async (newMode: string) => {
    if (newMode === mode?.current_mode) return;
    if (newMode === "HARDWARE" && !gateProjectId.trim()) {
      toast.error("Projet requis", { description: "Saisissez l’identifiant du projet puis vérifiez ses gates avant de demander HARDWARE." });
      return;
    }
    const reason = window.prompt(`Changer le mode vers ${modeLabels[newMode]} ?\nMotif (optionnel) :`);
    if (reason === null) return;
    setChanging(true);
    try {
      const response = await fetch("/api/ops/mode", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...bearerHeaders() },
        body: JSON.stringify({ mode: newMode, reason, ...(newMode === "HARDWARE" ? { project_id: gateProjectId.trim() } : {}) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Changement refusé.");
      toast.success(`Mode changé : ${modeLabels[newMode]}`, {
        description: result.warning || "Le changement est effectif immédiatement.",
      });
      await fetchMode(gateProjectId);
      await fetchHealth();
    } catch (error: any) {
      toast.error("Changement impossible", { description: error.message });
    } finally {
      setChanging(false);
    }
  };

  const currentMode = mode?.current_mode?.toUpperCase() ?? "—";

  return (
    <div className="space-y-4">
      {/* Mode card */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu size={18} className="text-blue-600" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">Mode opérationnel</h3>
          </div>
          <button
            onClick={() => void fetchMode()}
            disabled={loading}
            className="text-xs font-semibold text-blue-600 hover:underline disabled:opacity-50"
          >
            <RefreshCw size={12} className="inline mr-1" />
            {loading ? "..." : "Actualiser"}
          </button>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <div className={`rounded-lg border-2 px-4 py-2 ${modeColors[currentMode] || modeColors.OFFLINE}`}>
            <div className="text-xs font-semibold uppercase tracking-wider opacity-70">Mode courant</div>
            <div className="text-lg font-bold">{modeLabels[currentMode] || currentMode}</div>
          </div>
          <div className="flex-1">
            <p className="text-xs text-slate-500">{modeDescriptions[currentMode] || ""}</p>
            {mode?.hardware_control && (
              <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
                <Zap size={10} /> HARDWARE_CONTROL actif
              </div>
            )}
          </div>
        </div>

        {/* Gate verification is scoped to one explicit project; approvals are never pooled. */}
        <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            Projet à vérifier pour HARDWARE
            <input value={gateProjectId} onChange={event => setGateProjectId(event.target.value)} placeholder="Identifiant exact du projet" className="rounded-lg border border-slate-300 px-3 py-2 font-normal" aria-label="Identifiant du projet pour vérification des gates" />
          </label>
          <button onClick={() => void fetchMode(gateProjectId)} disabled={loading || !gateProjectId.trim()} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 disabled:opacity-50">Vérifier les gates</button>
        </div>

        {/* Mode selector */}
        <div className="mt-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Changer de mode</div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {["DEMO", "SIMULATION", "SITL", "HIL"].map((m) => (
              <button
                key={m}
                onClick={() => void changeMode(m)}
                disabled={changing || m === currentMode}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                  m === currentMode
                    ? "border-blue-300 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50"
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {modeLabels[m] || m}
              </button>
            ))}
            <button
              onClick={() => void changeMode("HARDWARE")}
              disabled={changing || currentMode === "HARDWARE" || !gateProjectId.trim() || mode?.gate_project_id !== gateProjectId.trim() || !mode?.all_gates_approved}
              className="rounded-lg border-2 border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
              title={!gateProjectId.trim() ? "Saisissez un identifiant de projet" : mode?.gate_project_id !== gateProjectId.trim() ? "Vérifiez les gates pour le projet sélectionné" : !mode?.all_gates_approved ? "G0-G5 requises pour ce projet" : ""}
            >
              <Power size={11} className="inline mr-1" />
              HARDWARE
            </button>
          </div>
          {!mode?.all_gates_approved && (
            <p className="mt-2 text-xs text-amber-600">
              ⚠ Saisissez un identifiant de projet et vérifiez ses 6 gates G0-G5; les validations d’autres projets ne sont pas prises en compte.
            </p>
          )}
        </div>
      </div>

      {/* System health card */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <Gauge size={18} className="text-emerald-600" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">Santé système</h3>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <HealthIndicator label="Statut" value={health?.status ?? "—"} ok={health?.status === "healthy"} />
          <HealthIndicator label="Environnement" value={health?.environment ?? "—"} ok={true} />
          <HealthIndicator label="Base de données" value={health?.database_url_configured ? "Configurée" : "Manquante"} ok={!!health?.database_url_configured} />
          <HealthIndicator label="OIDC Entra" value={health?.oidc_configured ? "Configuré" : "Manquant"} ok={!!health?.oidc_configured} />
          <HealthIndicator label="Sentry" value={health?.sentry_configured ? "Actif" : "Inactif"} ok={!!health?.sentry_configured} />
          <HealthIndicator label="Mode" value={health?.mode ?? "—"} ok={true} />
          <HealthIndicator label="Hardware" value={health?.hardware_control ? "Activé" : "Désactivé"} ok={!health?.hardware_control} />
          <HealthIndicator label="OIDC" value={health?.oidc_configured ? "OK" : "—"} ok={!!health?.oidc_configured} />
        </div>

        {health?.warnings && health.warnings.length > 0 && (
          <div className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-700">
            {health.warnings.map((w, i) => (
              <div key={i}>⚠ {w}</div>
            ))}
          </div>
        )}

        {/* Stats */}
        {health?.stats && Object.keys(health.stats).length > 0 && (
          <div className="mt-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Statistiques base de données</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(health.stats).map(([key, value]) => (
                <div key={key} className="rounded-lg bg-slate-50 px-3 py-1.5 text-xs">
                  <span className="font-semibold text-slate-600">{key}:</span>{" "}
                  <span className="font-bold text-slate-800">{value}</span>
                </div>
              ))}
            </div>
            {Number(health.stats.pending_outbox_events) > 0 && (
              <p className="mt-2 text-xs text-amber-600">
                ⚠ {health.stats.pending_outbox_events} événement(s) en attente dans l'event outbox — un worker de drainage est nécessaire.
              </p>
            )}
          </div>
        )}

        <button
          onClick={() => void fetchHealth()}
          className="mt-4 text-xs font-semibold text-blue-600 hover:underline"
        >
          <RefreshCw size={12} className="inline mr-1" />
          Actualiser la santé
        </button>
      </div>

      {/* Capabilities link */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <Activity size={18} className="text-blue-600" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">Capacités opérationnelles</h3>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          La liste complète des endpoints opérationnels et leur disponibilité est accessible via{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">GET /api/ops/capabilities</code>.
        </p>
        <button
          onClick={async () => {
            try {
              const r = await fetch("/api/ops/capabilities", { credentials: "include", headers: bearerHeaders() });
              const data = await r.json();
              console.log("Capabilities:", data);
              toast.success(`${data.capabilities?.length || 0} catégories d'endpoints disponibles`);
            } catch {
              toast.error("Impossible de récupérer les capacités");
            }
          }}
          className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          Voir les capacités (console)
        </button>
      </div>
    </div>
  );
}

function HealthIndicator({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className={`rounded-lg border p-2.5 ${ok ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`text-sm font-bold ${ok ? "text-emerald-700" : "text-amber-700"}`}>{value}</div>
    </div>
  );
}
