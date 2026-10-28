import { useEffect, useMemo, useRef, useState } from "react";
import {
  activateLocalVirtual,
  apiDetailMessage,
  applyLocalVirtualCommand,
  armLocalVirtual,
  createLocalVirtualControlState,
  emergencyStopLocalVirtual,
  hasVirtualControlCapability,
  isEmergencyStop,
  isVirtualControlResponse,
  selectLocalSimulation,
  type LocalVirtualControlState,
  type VirtualCommandInput,
  type VirtualControlMode,
  type VirtualControlResponse,
  type VirtualReceipt,
} from "@/lib/hardwareControl";

type ControlSource = "server" | "local";
type ApiResult = { ok: boolean; status: number; body: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isVirtualReceipt(value: unknown): value is VirtualReceipt {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.revision === "number"
    && typeof value.event === "string"
    && typeof value.status === "string"
    && value.scope === "virtual-only"
    && value.physical_output === false
    && isRecord(value.payload);
}

function failureMessage(body: unknown, fallback: string): string {
  const message = isRecord(body) && "detail" in body ? apiDetailMessage(body.detail, fallback) : apiDetailMessage(body, fallback);
  return /visitor accounts use the explicit local simulation/i.test(message)
    ? `${message} Utilisez « Simulation locale (non enregistrée) » pour continuer.`
    : message;
}

async function controlRequest(path: string, body?: unknown): Promise<ApiResult> {
  try {
    const response = await fetch(path, {
      method: "POST",
      credentials: "include",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let responseBody: unknown = null;
    try { responseBody = await response.json(); } catch { /* réponse non JSON : message générique */ }
    return { ok: response.ok, status: response.status, body: responseBody };
  } catch {
    return { ok: false, status: 0, body: null };
  }
}

function finiteNumber(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function newVirtualActionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Repli seulement pour les navigateurs anciens : le serveur vérifie aussi la révision atomique.
  return `vctrl-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const initialSetpoint = { x_m: "0", y_m: "0", altitude_m: "20", heading_deg: "0" };

export function HardwareControlPanel() {
  const [serverAvailable, setServerAvailable] = useState(false);
  const [source, setSource] = useState<ControlSource>("server");
  const [first, setFirst] = useState(false);
  const [second, setSecond] = useState(false);
  const [commandConfirmed, setCommandConfirmed] = useState(false);
  const [serverState, setServerState] = useState<LocalVirtualControlState>(createLocalVirtualControlState);
  const [localState, setLocalState] = useState<LocalVirtualControlState>(createLocalVirtualControlState);
  const [receipts, setReceipts] = useState<VirtualReceipt[]>([]);
  const [setpoint, setSetpoint] = useState(initialSetpoint);
  const [message, setMessage] = useState("Le contrôle VIRTUAL ne concerne qu’un modèle logiciel; HARDWARE est définitivement refusé.");
  const [busy, setBusy] = useState(false);
  const [serverStateLoaded, setServerStateLoaded] = useState(false);
  const requestEpoch = useRef(0);
  const inFlightEpoch = useRef<number | null>(null);
  const sourceRef = useRef<ControlSource>(source);

  const activeState = source === "local" ? localState : serverState;
  const confirmationsReady = first && second;
  const isVirtualActive = activeState.mode === "VIRTUAL" && activeState.virtual_active;
  const mode: VirtualControlMode = activeState.mode;

  useEffect(() => { sourceRef.current = source; }, [source]);

  useEffect(() => {
    let active = true;
    fetch("/api/capabilities", { credentials: "include" })
      .then(async response => ({ ok: response.ok, body: await response.json() as unknown }))
      .then(result => {
        if (!active || sourceRef.current === "local") return;
        const available = result.ok && hasVirtualControlCapability(result.body);
        setServerAvailable(available);
        if (available) {
          setMessage("Service VIRTUAL disponible après authentification. Aucun matériel ne sera contrôlé.");
        } else {
          useLocalSimulation();
        }
      })
      .catch(() => {
        if (active && sourceRef.current !== "local") useLocalSimulation();
      });
    return () => { active = false; };
  }, []);

  const addReceipt = (receipt?: VirtualReceipt) => {
    if (!receipt) return;
    setReceipts(current => [receipt, ...current.filter(item => item.id !== receipt.id)].slice(0, 100));
  };

  const applyServerResponse = (result: VirtualControlResponse) => {
    setServerState(current => ({
      ...current,
      mode: result.mode,
      revision: result.revision,
      virtual_active: result.virtual_active,
      armed: result.armed,
      stopped: result.stopped,
      physical_output: false,
      pending_commands: result.pending_commands,
      virtual_geofence: result.virtual_geofence,
      setpoint: result.setpoint,
    }));
    addReceipt(result.receipt);
  };

  /** Commence une requête exclusive; seul l'arrêt peut remplacer une requête en vol. */
  const beginServerRequest = (replaceInFlight = false): number | null => {
    if (inFlightEpoch.current !== null && !replaceInFlight) return null;
    const epoch = requestEpoch.current + 1;
    requestEpoch.current = epoch;
    inFlightEpoch.current = epoch;
    setBusy(true);
    return epoch;
  };

  /** Invalide le rendu d'une réponse tardive sans prétendre annuler le serveur. */
  const invalidatePendingResponse = () => { requestEpoch.current += 1; };

  const finishServerRequest = (epoch: number): boolean => {
    const current = requestEpoch.current === epoch;
    if (inFlightEpoch.current === epoch) {
      inFlightEpoch.current = null;
      setBusy(false);
    }
    return current;
  };

  const loadServerState = async () => {
    if (sourceRef.current !== "server") return;
    const epoch = requestEpoch.current + 1;
    requestEpoch.current = epoch;
    setServerStateLoaded(false);
    try {
      const response = await fetch("/api/control/state", { credentials: "include" });
      let body: unknown = null;
      try { body = await response.json(); } catch { /* message générique ci-dessous */ }
      if (requestEpoch.current !== epoch || sourceRef.current !== "server") return;
      if (!response.ok || !isVirtualControlResponse(body)) {
        if (response.status === 401 || response.status === 403) {
          useLocalSimulation();
        } else {
          setMessage(failureMessage(body, "État VIRTUAL indisponible."));
        }
        return;
      }
      applyServerResponse(body);
      setServerStateLoaded(true);
    } catch {
      if (requestEpoch.current === epoch && sourceRef.current === "server") {
        setMessage("État VIRTUAL indisponible : utilisez la simulation locale, non enregistrée.");
      }
    }
  };

  useEffect(() => {
    if (source === "server" && serverAvailable) void loadServerState();
  }, [source, serverAvailable]);

  const useLocalSimulation = () => {
    invalidatePendingResponse();
    setServerStateLoaded(false);
    setSource("local");
    setFirst(false);
    setSecond(false);
    setCommandConfirmed(false);
    setMessage("Simulation locale activée dans ce navigateur : elle n’est pas enregistrée sur le serveur et n’émet aucune commande externe.");
  };

  const updateSetpoint = (key: keyof typeof initialSetpoint, value: string) => {
    // La confirmation par commande est d'usage unique et est invalidée par tout changement de paramètre.
    invalidatePendingResponse();
    setSetpoint(current => ({ ...current, [key]: value }));
    setCommandConfirmed(false);
  };

  const activate = async () => {
    if (!confirmationsReady) {
      setMessage("Cochez les deux confirmations d’activation avant de lancer VIRTUAL.");
      return;
    }
    if (source === "local") {
      const transition = activateLocalVirtual(localState, first, second);
      setLocalState(transition.state);
      addReceipt(transition.receipt);
      setFirst(false); setSecond(false);
      setMessage(transition.error ?? "VIRTUAL local activé; confirmez à nouveau les deux attestations avant l’armement.");
      return;
    }
    if (!serverAvailable) {
      setMessage("Le service VIRTUAL n’est pas annoncé par ce serveur. Choisissez la simulation locale, qui n’est pas enregistrée.");
      return;
    }
    const epoch = beginServerRequest();
    if (epoch === null) {
      setMessage("Une demande VIRTUAL est déjà en cours; seul l’arrêt d’urgence peut l’interrompre.");
      return;
    }
    const confirmation = { confirm_operator: first, confirm_safety: second };
    setFirst(false); setSecond(false);
    const result = await controlRequest("/api/control/mode", {
      mode: "VIRTUAL",
      ...confirmation,
      action_id: newVirtualActionId(),
      expected_revision: serverState.revision,
    });
    if (!finishServerRequest(epoch)) return;
    if (!result.ok || !isVirtualControlResponse(result.body)) {
      setMessage(result.status === 401
        ? "Session non authentifiée : le serveur ne peut rien enregistrer. Choisissez la simulation locale pour continuer hors ligne."
        : failureMessage(result.body, "Activation VIRTUAL non confirmée."));
      return;
    }
    applyServerResponse(result.body);
    setMessage("VIRTUAL activé et journalisé pour votre session; confirmez à nouveau les deux attestations avant l’armement.");
  };

  const selectSimulation = async () => {
    setFirst(false); setSecond(false); setCommandConfirmed(false);
    if (source === "local") {
      const transition = selectLocalSimulation(localState);
      setLocalState(transition.state);
      addReceipt(transition.receipt);
      setMessage("Retour à SIMULATION locale : modèle virtuel désarmé.");
      return;
    }
    const result = await controlRequest("/api/control/mode", { mode: "SIMULATION", confirm_operator: false, confirm_safety: false });
    if (!result.ok || !isVirtualControlResponse(result.body)) {
      setMessage(result.status === 401
        ? "Session non authentifiée : choisissez la simulation locale, non enregistrée, pour continuer."
        : failureMessage(result.body, "Retour en SIMULATION non confirmé."));
      return;
    }
    applyServerResponse(result.body);
    setMessage("Retour à SIMULATION : modèle virtuel désarmé.");
  };

  const arm = async () => {
    if (!confirmationsReady) {
      setMessage("L’armement VIRTUAL exige une nouvelle paire de confirmations explicites.");
      return;
    }
    if (source === "local") {
      const transition = armLocalVirtual(localState, first, second);
      setLocalState(transition.state);
      addReceipt(transition.receipt);
      setFirst(false); setSecond(false);
      setMessage(transition.error ?? "Modèle VIRTUAL local armé. Chaque setpoint doit être confirmé séparément.");
      return;
    }
    const result = await controlRequest("/api/control/arm", { mode: "VIRTUAL", confirm_operator: first, confirm_safety: second });
    if (!result.ok || !isVirtualControlResponse(result.body)) {
      setMessage(result.status === 401
        ? "Session non authentifiée : aucun armement serveur n’est possible. La simulation locale reste disponible."
        : failureMessage(result.body, "Armement VIRTUAL non confirmé."));
      return;
    }
    applyServerResponse(result.body);
    setFirst(false); setSecond(false);
    setMessage("Modèle VIRTUAL armé. Chaque setpoint doit être confirmé séparément.");
  };

  const sendCommand = async (command: "position" | "heading") => {
    const x_m = finiteNumber(setpoint.x_m);
    const y_m = finiteNumber(setpoint.y_m);
    const altitude_m = finiteNumber(setpoint.altitude_m);
    const heading_deg = finiteNumber(setpoint.heading_deg);
    const input: VirtualCommandInput | null = command === "position"
      ? x_m === null || y_m === null || altitude_m === null ? null : { command, x_m, y_m, altitude_m, confirm_command: commandConfirmed }
      : heading_deg === null ? null : { command, heading_deg, confirm_command: commandConfirmed };
    if (!input) {
      setMessage("Saisissez des valeurs numériques finies avant de confirmer le setpoint VIRTUAL.");
      return;
    }
    if (source === "local") {
      const transition = applyLocalVirtualCommand(localState, input);
      setLocalState(transition.state);
      addReceipt(transition.receipt);
      setCommandConfirmed(false);
      setMessage(transition.error ?? `Setpoint ${command} appliqué au modèle local uniquement; confirmation consommée.`);
      return;
    }
    const result = await controlRequest("/api/control/command", input);
    setCommandConfirmed(false);
    if (!result.ok || !isVirtualControlResponse(result.body)) {
      setMessage(result.status === 401
        ? "Session non authentifiée : aucun setpoint ne peut être enregistré. La simulation locale reste disponible."
        : failureMessage(result.body, "Setpoint VIRTUAL non confirmé."));
      return;
    }
    applyServerResponse(result.body);
    setMessage(`Setpoint ${command} appliqué au jumeau VIRTUAL; confirmation consommée.`);
  };

  const emergency = async () => {
    setFirst(false); setSecond(false); setCommandConfirmed(false);
    if (source === "local") {
      const transition = emergencyStopLocalVirtual(localState);
      setLocalState(transition.state);
      addReceipt(transition.receipt);
      setMessage("Arrêt d’urgence local : file purgée et modèle désarmé. Aucune reprise automatique n’est possible.");
      return;
    }
    const result = await controlRequest("/api/control/emergency-stop");
    if (!result.ok || !isVirtualControlResponse(result.body) || !isEmergencyStop(result.body)) {
      setMessage(result.status === 401
        ? "Session non authentifiée : le serveur ne peut pas confirmer l’arrêt. Utilisez la simulation locale seulement si aucun enregistrement serveur n’est requis."
        : failureMessage(result.body, "Arrêt VIRTUAL non confirmé."));
      return;
    }
    applyServerResponse(result.body);
    setMessage(`Arrêt d’urgence VIRTUAL confirmé : file purgée (${result.body.queue_purged ?? 0}), modèle désarmé, aucune reprise automatique.`);
  };

  const visibleReceipts = useMemo(
    () => source === "local" ? [...localState.journal] : receipts,
    [localState.journal, receipts, source],
  );

  return (
    <section className="lb-panel lb-vctrl-panel" aria-label="Contrôle VIRTUAL encadré">
      <div className="lb-panel-title">
        <strong>Contrôle VIRTUAL — supervision humaine</strong>
        <small>{source === "server" ? (serverAvailable ? `SERVICE AUTHENTIFIÉ · ${mode}` : "SERVICE NON DISPONIBLE") : `LOCAL NON ENREGISTRÉ · ${mode}`}</small>
      </div>
      <p role="status">{message}</p>
      <p><strong>Frontière de sûreté :</strong> HARDWARE est définitivement refusé. Ce panneau ne pilote qu’un jumeau logiciel, sans liaison, port ni position géographique réels.</p>

      <div className="lb-config-actions lb-vctrl-source-actions">
        <button className="lb-secondary" onClick={useLocalSimulation}>Utiliser la simulation locale (non enregistrée)</button>
        {source === "local" && <button className="lb-secondary" onClick={() => { setSource("server"); setMessage("Retour au service VIRTUAL : une authentification est requise pour journaliser les actions."); }}>Utiliser le service authentifié</button>}
      </div>

      <div className="lb-config-section lb-vctrl-section lb-vctrl-activation">
        <h3>Activation puis armement séparés</h3>
        <div className="lb-vctrl-confirmations">
          <label><input type="checkbox" checked={first} onChange={event => setFirst(event.target.checked)} disabled={activeState.armed} /><span>Intention d’activer ou d’armer VIRTUAL</span></label>
          <label><input type="checkbox" checked={second} onChange={event => setSecond(event.target.checked)} disabled={activeState.armed} /><span>Setpoint vérifié · modèle virtuel uniquement</span></label>
        </div>
        <div className="lb-config-actions lb-vctrl-actions">
          <button className="lb-primary" disabled={!confirmationsReady || isVirtualActive} onClick={() => void activate()}>Activer VIRTUAL (2 confirmations)</button>
          <button className="lb-secondary" disabled={!confirmationsReady || !isVirtualActive || activeState.armed} onClick={() => void arm()}>Armer VIRTUAL (nouvelles confirmations)</button>
          <button className="lb-secondary" disabled={!isVirtualActive && mode === "SIMULATION"} onClick={() => void selectSimulation()}>Revenir en SIMULATION</button>
          <button className="lb-secondary" onClick={() => void emergency()}>Arrêt d’urgence — un clic</button>
        </div>
      </div>

      <div className="lb-config-section lb-vctrl-section lb-vctrl-setpoints">
        <h3>Setpoints VIRTUAL locaux</h3>
        <div className="lb-vctrl-range">X/Y −500…500 m · altitude 0…120 m · origine locale 0,0</div>
        <div className="lb-config-grid lb-vctrl-setpoint-grid">
          <label>X local (m)<input type="number" min={-500} max={500} value={setpoint.x_m} onChange={event => updateSetpoint("x_m", event.target.value)} /></label>
          <label>Y local (m)<input type="number" min={-500} max={500} value={setpoint.y_m} onChange={event => updateSetpoint("y_m", event.target.value)} /></label>
          <label>Altitude VIRTUAL (m)<input type="number" min={0} max={120} value={setpoint.altitude_m} onChange={event => updateSetpoint("altitude_m", event.target.value)} /></label>
          <label>Cap VIRTUAL (°)<input type="number" min={0} max={360} value={setpoint.heading_deg} onChange={event => updateSetpoint("heading_deg", event.target.value)} /></label>
        </div>
        <label className="lb-vctrl-command-confirm"><input type="checkbox" checked={commandConfirmed} onChange={event => setCommandConfirmed(event.target.checked)} disabled={!activeState.armed} /><span>Setpoint courant confirmé</span></label>
        <div className="lb-config-actions lb-vctrl-actions">
          <button className="lb-primary" disabled={!activeState.armed || !commandConfirmed} onClick={() => void sendCommand("position")}>Appliquer position VIRTUAL</button>
          <button className="lb-secondary" disabled={!activeState.armed || !commandConfirmed} onClick={() => void sendCommand("heading")}>Appliquer cap VIRTUAL</button>
        </div>
      </div>

      <div className="lb-config-section lb-vctrl-section lb-vctrl-receipts">
        <h3>État et reçus {source === "local" ? "locaux non enregistrés" : "de votre session authentifiée"}</h3>
        <p>Mode : <strong>{mode}</strong> · activation : <strong>{isVirtualActive ? "oui" : "non"}</strong> · armement : <strong>{activeState.armed ? "oui" : "non"}</strong> · sorties physiques : <strong>non</strong>.</p>
        {visibleReceipts.length === 0
          ? <small>Aucun reçu VIRTUAL pour cette session.</small>
          : <ul>{visibleReceipts.slice(0, 8).map(receipt => <li key={receipt.id}><strong>{receipt.id}</strong> — {receipt.event} : {receipt.status} · virtuel uniquement</li>)}</ul>}
      </div>
      <small>Les confirmations sont consommées après activation, armement ou commande; une modification de setpoint et l’arrêt d’urgence les invalident. Après arrêt, seule une nouvelle activation explicite peut reprendre le scénario.</small>
    </section>
  );
}
