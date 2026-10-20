import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleDot,
  Gauge,
  Navigation,
  Pause,
  Play,
  Radio,
  ShieldCheck,
  Sparkles,
  Target,
  Wrench,
} from "lucide-react";
import type { DroneCatalogDesign } from "../lib/droneCatalog";
import type { LocalMissionPlan, MissionEnvironment } from "../lib/aeroEngine";
import type { MissionTelemetryFrame } from "../lib/missionBridge";
import { ParametricDronePreview } from "./ParametricDronePreview";
import { FlightOperationsModules } from "./FlightOperationsModules";

type DeckCommand =
  | "start"
  | "pause"
  | "resume"
  | "waypoint"
  | "hold"
  | "return"
  | "land"
  | "stop";
type MissionCheck = { severity: "pass" | "review" | "block"; message: string };

export function FlightCommandDeck({
  design,
  demoState,
  videoState,
  telemetryState,
  telemetry,
  telemetrySource,
  activeWaypoint,
  waypoints,
  missionPlan,
  environment,
  missionChecks,
  missionDistanceKm,
  enduranceH,
  batteryWh,
  operatorApproved,
  onCommand,
  onLoadDemoPlan,
  onOpenBuilder,
  onMissionPlanChange,
  onEnvironmentChange,
}: {
  design?: DroneCatalogDesign;
  demoState: string;
  videoState: string;
  telemetryState: string;
  telemetry?: (MissionTelemetryFrame & { receivedAt?: number }) | null;
  telemetrySource: "none" | "synthetic" | "wss" | "mavlink";
  activeWaypoint: number;
  waypoints: LocalMissionPlan["waypoints"];
  missionPlan: LocalMissionPlan;
  environment: MissionEnvironment;
  missionChecks: MissionCheck[];
  missionDistanceKm: number;
  enduranceH: number;
  batteryWh: number;
  operatorApproved: boolean;
  onCommand: (command: DeckCommand) => void;
  onLoadDemoPlan: () => void;
  onOpenBuilder: () => void;
  onMissionPlanChange: (plan: LocalMissionPlan) => void;
  onEnvironmentChange: (environment: MissionEnvironment) => void;
}) {
  const blocking = missionChecks.filter(check => check.severity === "block").length;
  const review = missionChecks.filter(check => check.severity === "review").length;
  const currentWaypoint = waypoints[activeWaypoint];
  const stateLabel: Record<string, string> = {
    ready: "PRÊT", running: "EN MISSION", paused: "PAUSÉ", hold: "MAINTIEN",
    returning: "RETOUR DOMICILE", "emergency-land": "ATTERRISSAGE", stopped: "CLOS",
  };
  const aiBrief = blocking
    ? "Précontrôle AeroMind bloquant : corrigez les contrôles avant toute simulation locale."
    : review
      ? "Précontrôle AeroMind : points à revoir. Simulation locale seulement, après accord humain."
      : "Précontrôle AeroMind favorable à la simulation locale; l’accord humain reste séparé et obligatoire.";

  return (
    <section className="panel flight-command-deck" aria-label="Pont de commande AeroMind">
      <div className="flight-deck-header">
        <div>
          <p className="eyebrow">06 / MISSION CONTROL FABRIC</p>
          <h3>Pont de commande de simulation</h3>
          <p className="flight-deck-subtitle">L’analyse AeroMind peut bloquer la simulation, jamais autoriser un vol réel. Accord humain préalable; télémétrie entrante en lecture seule; aucune sortie de commande.</p>
        </div>
        <div className="flight-deck-mode"><span className="flight-deck-live-dot" /><strong>SIMULATION LOCALE</strong><small>Contrat {demoState === "running" ? "en exécution" : "en attente"}</small></div>
      </div>

      <div className="flight-deck-kpis">
        <div><span>État scénario</span><strong>{stateLabel[demoState] ?? demoState.toUpperCase()}</strong><small>aucune sortie matérielle</small></div>
        <div><span>Route active</span><strong>{waypoints.length ? `${activeWaypoint + 1}/${waypoints.length}` : "—"}</strong><small>{currentWaypoint?.name ?? "aucun waypoint"}</small></div>
        <div><span>Distance calculée</span><strong>{missionDistanceKm.toFixed(2)} km</strong><small>canevas local, sans GPS</small></div>
        <div><span>Réserve énergie</span><strong>{batteryWh} Wh</strong><small>{enduranceH.toFixed(2)} h modèle</small></div>
      </div>

      <div className="flight-deck-grid">
        <div className="flight-drone-preview">
          <div className="flight-deck-section-title"><span><Navigation size={15} /> Aéronef suivi</span><small>visuel canonique de la bibliothèque</small></div>
          {design ? <ParametricDronePreview design={design} /> : <div className="drone-selection-required" role="status"><span>NO ACTIVE AIRFRAME</span><b>Sélection humaine requise</b><small>Aucun profil de bibliothèque n’est chargé.</small></div>}
          <div className="flight-drone-readout"><span>CONFIGURATION ACTIVE</span><strong>{design?.label ?? "Profil local non sélectionné"}</strong><small>La visualisation reste bornée au scénario virtuel et ne commande aucun appareil.</small></div>
        </div>
        <div className="flight-deck-command-surface">
          <div className="flight-deck-section-title"><span><Gauge size={15} /> Console de manipulation</span><small>actions locales auditées</small></div>
          <div className="flight-deck-command-matrix">
            <button className="flight-command-primary" onClick={() => onCommand("start")} disabled={!waypoints.length || !operatorApproved || blocking > 0 || !["ready", "stopped"].includes(demoState)} title={!operatorApproved ? "Cochez d’abord l’approbation de démonstration locale" : blocking ? "Corrigez les contrôles prévol bloquants" : !waypoints.length ? "Chargez un parcours local" : "Démarrer uniquement le scénario de simulation"}><Play size={15} /> {operatorApproved ? "Lancer la simulation" : "Approbation requise"}</button>
            <button title={demoState === "running" ? "Mettre en pause le scénario local" : "Reprendre le scénario local"} onClick={() => onCommand(demoState === "running" ? "pause" : "resume")} disabled={!( ["running", "paused", "hold"].includes(demoState))}><Pause size={15} /> {demoState === "running" ? "Pause" : "Reprendre"}</button>
            <button title="Avancer d’un point dans la route simulée" onClick={() => onCommand("waypoint")} disabled={!waypoints.length || ["ready", "stopped", "returning"].includes(demoState) || activeWaypoint >= waypoints.length - 1}><ArrowRight size={15} /> Point suivant</button>
            <button title="Figer la progression de la démonstration locale au waypoint courant." onClick={() => onCommand("hold")} disabled={demoState !== "running"}><CircleDot size={15} /> Maintien simulé</button>
            <button title="Faire converger le scénario local vers son point de départ; n’envoie aucun ordre réel." onClick={() => onCommand("return")} disabled={!waypoints.length || ["ready", "stopped", "returning"].includes(demoState)}><Navigation size={15} /> Retour sûr</button>
            <button title="Passer le scénario local à l’état d’atterrissage simulé, sans actionneur réel." onClick={() => onCommand("land")} disabled={!waypoints.length || ["ready", "stopped", "returning"].includes(demoState)}><Target size={15} /> Atterrissage simulé</button>
          </div>
          <div className="flight-deck-command-footer">
            <button className="secondary-button" title="Charge un parcours local ajusté aux limites du profil; l’approbation opérateur reste une action séparée." onClick={onLoadDemoPlan}><Activity size={14} /> Charger un parcours de référence</button>
            <button className="secondary-button" onClick={onOpenBuilder}><Wrench size={14} /> Ouvrir le constructeur</button>
            <button className="flight-deck-stop" title="Clore la démonstration locale et remettre le scénario à l’arrêt." onClick={() => onCommand("stop")} disabled={["ready", "stopped"].includes(demoState)}>Clore la démonstration</button>
          </div>
        </div>
        <div className="flight-deck-ai-card">
          <div className="flight-deck-section-title"><span><Sparkles size={15} /> AEROMIND AI / PRÉCONTRÔLE</span><small>règles d’éligibilité à la simulation</small></div>
          <div className="flight-ai-status"><Bot size={18} /><div><strong>Analyse contextuelle active</strong><span>Vidéo {videoState === "live" ? "active" : "en attente"} · télémétrie {telemetryState === "connected" ? "reçue (lecture seule)" : "simulation locale"}</span></div></div>
          <p>{aiBrief}</p>
          <div className="flight-ai-actions"><span><CheckCircle2 size={13} /> {missionChecks.length - blocking} contrôles exploitables</span><span><ShieldCheck size={13} /> garde-fous fermés</span></div>
        </div>
      </div>

      <div className="flight-deck-lower-grid">
        <div className="flight-deck-timeline">
          <div className="flight-deck-section-title"><span><Radio size={15} /> Séquence d’exécution</span><small>journal de décision</small></div>
          <div className="flight-timeline-track">
            <div className="flight-timeline-step is-done"><span>01</span><strong>Préparer</strong><small>contrôles prévol</small></div>
            <div className={`flight-timeline-step ${demoState !== "ready" ? "is-done" : ""}`}><span>02</span><strong>Autoriser</strong><small>approbation humaine</small></div>
            <div className={`flight-timeline-step ${["running", "paused", "hold"].includes(demoState) ? "is-current" : ""}`}><span>03</span><strong>Exécuter</strong><small>simulation supervisée</small></div>
            <div className={`flight-timeline-step ${["returning", "stopped", "emergency-land"].includes(demoState) ? "is-done" : ""}`}><span>04</span><strong>Clôturer</strong><small>trace et revue</small></div>
          </div>
        </div>
        <div className="flight-deck-checks">
          <div className="flight-deck-section-title"><span><ShieldCheck size={15} /> Gates de contrôle</span><small>avant lancement</small></div>
          {missionChecks.slice(0, 4).map((check, index) => <div className={`flight-deck-check is-${check.severity}`} key={`${check.message}-${index}`}><span>{check.severity === "pass" ? "OK" : check.severity === "review" ? "REVUE" : "BLOC"}</span><p>{check.message}</p></div>)}
        </div>
      </div>

      <FlightOperationsModules demoState={demoState} activeWaypoint={activeWaypoint} waypoints={waypoints} missionPlan={missionPlan} environment={environment} enduranceH={enduranceH} batteryWh={batteryWh} telemetryState={telemetryState} telemetry={telemetry} telemetrySource={telemetrySource} onMissionPlanChange={onMissionPlanChange} onEnvironmentChange={onEnvironmentChange} />
      <div className="flight-deck-disclaimer"><AlertTriangle size={14} /> Toute action et toute donnée générée ci-dessus restent bornées à la simulation locale ou à l’observation lecture seule. L’armement, les actionneurs, le téléversement de mission et les commandes réelles sont structurellement rejetés.</div>
    </section>
  );
}
