import { useRef, useState } from "react";
import {
  SIMULATION_ADAPTER_CHECKLIST,
  SimulationOnlyAdapter,
  type SimulationAuditEvent,
  type SimulationChecklistItem,
  type SimulationOutput,
} from "../lib/simulationOnlyAdapter";

const checklistLabels: Record<SimulationChecklistItem, string> = {
  purpose: "Objectif civil ou défensif uniquement; aucun usage offensif.",
  "simulation-only": "Je confirme que toutes les commandes restent dans la simulation locale.",
  "preflight-reviewed": "J’ai relu le scénario et ses avertissements avant ce test.",
  "local-stop-reviewed": "Je comprends que l’arrêt simulé n’est pas un arrêt physique.",
};

const axisLabels = [
  ["roll", "Roulis", -1, 1],
  ["pitch", "Tangage", -1, 1],
  ["yaw", "Lacet", -1, 1],
  ["throttle", "Puissance simulée", 0, 1],
] as const;
type AuditFilter = "ALL" | "ACCEPTED" | "REJECTED" | "CONSENT" | "HEARTBEAT" | "PHYSICAL";
const formatTimestamp = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString("fr-FR", { hour12: false, fractionalSecondDigits: 3 });

function matchesFilter(event: SimulationAuditEvent, filter: AuditFilter) {
  if (filter === "ALL") return true;
  if (filter === "ACCEPTED") return event.accepted;
  if (filter === "REJECTED") return !event.accepted;
  if (filter === "CONSENT") return event.kind.startsWith("consent-");
  if (filter === "HEARTBEAT") return event.kind.includes("heartbeat");
  return event.physicalTransportRequested || event.kind.toLowerCase().includes("physical");
}

export function SimulationOnlyAdapterPanel() {
  const adapterRef = useRef<SimulationOnlyAdapter | null>(null);
  if (!adapterRef.current) adapterRef.current = new SimulationOnlyAdapter();
  const adapter = adapterRef.current;
  const [checks, setChecks] = useState<Record<SimulationChecklistItem, boolean>>({
    purpose: false,
    "simulation-only": false,
    "preflight-reviewed": false,
    "local-stop-reviewed": false,
  });
  const [consent, setConsent] = useState(false);
  const [axes, setAxes] = useState({ roll: 0, pitch: 0, yaw: 0, throttle: 0 });
  const [audit, setAudit] = useState<SimulationAuditEvent[]>([]);
  const [filter, setFilter] = useState<AuditFilter>("ALL");
  const [lastOutput, setLastOutput] = useState<SimulationOutput | null>(null);

  const refreshAudit = () => setAudit(adapter.readAuditLog().slice(-50).reverse());
  const allChecked = SIMULATION_ADAPTER_CHECKLIST.every(item => checks[item]);
  const changeCheck = (item: SimulationChecklistItem, checked: boolean) => {
    const next = { ...checks, [item]: checked };
    setChecks(next);
    adapter.setChecklist({ [item]: checked }, Date.now());
    setConsent(adapter.isConsentGranted);
    if (!adapter.isConsentGranted) setLastOutput(null);
    refreshAudit();
  };
  const toggleConsent = () => {
    if (consent) {
      adapter.revokeConsent("Consentement retiré depuis le banc de test local.");
      setConsent(false);
      setLastOutput(null);
    } else {
      setConsent(adapter.approveHumanConsent(true));
    }
    refreshAudit();
  };
  const submitAxes = () => {
    const now = Date.now();
    const result = adapter.submit({ kind: "axis-input", source: "virtual-joystick", createdAt: now, payload: axes }, now);
    setLastOutput(result.accepted ? adapter.consumeSimulationQueue(now)[0] ?? null : null);
    refreshAudit();
  };
  const testPhysicalRejection = () => {
    const now = Date.now();
    adapter.submit({
      kind: "MANUAL_CONTROL",
      source: "test-input",
      createdAt: now,
      payload: { roll: axes.roll, pitch: axes.pitch, yaw: axes.yaw, throttle: axes.throttle },
    }, now);
    setLastOutput(null);
    refreshAudit();
  };

  const filteredAudit = audit.filter(event => matchesFilter(event, filter));
  const filterOptions: [AuditFilter, string][] = [
    ["ALL", "Tous"], ["ACCEPTED", "Acceptées"], ["REJECTED", "Rejetées"],
    ["CONSENT", "Consentement"], ["HEARTBEAT", "Heartbeat"], ["PHYSICAL", "Commandes physiques"],
  ];

  return (
    <section className="fom-sim-adapter" aria-label="Banc local de commandes simulation-only">
      <div className="fom-panel-title">
        <strong>Adaptateur local · simulation uniquement</strong>
        <span className="fom-sim-adapter-badge">AUCUN TRANSPORT EXTERNE</span>
      </div>
      <p className="fom-sim-adapter-note">
        Joystick virtuel vers file mémoire locale. Aucun appel HTTP, MAVLink ou matériel n’est effectué.
      </p>
      <fieldset className="fom-sim-checklist">
        <legend>Checklist humaine avant le test</legend>
        {SIMULATION_ADAPTER_CHECKLIST.map(item => (
          <label key={item}>
            <input type="checkbox" checked={checks[item]} onChange={event => changeCheck(item, event.target.checked)} />
            <span>{checklistLabels[item]}</span>
          </label>
        ))}
      </fieldset>
      <div className="fom-sim-adapter-actions">
        <button type="button" onClick={toggleConsent}>
          {consent ? "Retirer le consentement" : "Confirmer le consentement humain"}
        </button>
        <span className={consent ? "is-unlocked" : "is-locked"}>{consent ? "CONSENTI · SESSION LOCALE" : "VERROUILLÉ PAR DÉFAUT"}</span>
      </div>
      <div className="fom-sim-axes">
        {axisLabels.map(([key, label, min, max]) => {
          const normalized = (axes[key] - min) / (max - min);
          return (
            <label key={key}>
              <span>{label}<strong>{axes[key].toFixed(2)}</strong></span>
              <input type="range" min={min} max={max} step="0.01" value={axes[key]}
                onChange={event => setAxes(current => ({ ...current, [key]: Number(event.target.value) }))}
                aria-label={`Axe simulé ${label}`} />
              <span className={`fom-sim-meter ${key === "throttle" ? "is-unipolar" : "is-centered"}`} aria-hidden="true">
                <i style={{ left: `${normalized * 100}%` }} />
              </span>
            </label>
          );
        })}
      </div>
      <small className="fom-sim-adapter-note">Indicateurs statiques de valeurs locales simulées; aucune donnée matérielle.</small>
      <div className="fom-sim-adapter-actions">
        <button type="button" onClick={submitAxes} disabled={!consent}>Tester les axes en simulation</button>
        <button type="button" className="is-warning" onClick={testPhysicalRejection}>Tester le refus MANUAL_CONTROL</button>
      </div>
      {lastOutput && <pre className="fom-sim-output" aria-live="polite">File locale consommée · {JSON.stringify(lastOutput)}</pre>}
      <div className="fom-sim-audit" aria-label="Journal local de l’adaptateur">
        <div className="fom-sim-audit-heading">
          <strong>Journal de vérification</strong>
          <label>Filtrer
            <select value={filter} onChange={event => setFilter(event.target.value as AuditFilter)} aria-label="Filtrer le journal SIM">
              {filterOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
        {filteredAudit.length ? filteredAudit.map(event => (
          <div key={event.id} className={event.accepted ? "is-accepted" : "is-rejected"}>
            <time dateTime={new Date(event.timestamp).toISOString()}>{formatTimestamp(event.timestamp)}</time>
            <code>{event.id}</code>
            <span>{event.accepted ? "ACCEPTÉE · SIM" : "REJETÉE"} · {event.kind}</span>
            <small>{event.source} · {event.reason} · transport physique invoqué : non</small>
          </div>
        )) : <small>{audit.length ? "Aucun événement pour ce filtre." : "Aucun événement; aucune entrée ne sera acceptée avant le consentement humain."}</small>}
      </div>
      {!allChecked && <small className="fom-sim-adapter-note">Le consentement ne pourra être accordé qu’après validation de chaque case.</small>}
    </section>
  );
}
