import { Activity, CheckCircle2, Database, GitBranch, LockKeyhole, Radio, ShieldCheck, Users } from "lucide-react";
import type { LiveFlightState } from "../lib/liveSimulation";
import { TelemetryStripChart } from "./TelemetryStripChart";

type Props = {
  configured: boolean;
  flight: LiveFlightState;
  altitude: number[];
  energy: number[];
  power: number[];
  mass: string;
  endurance: string;
  wind: string;
  phase: string;
};

const layers = [
  { code: "L0", label: "ACQUISITION", detail: "Sources capteurs / modèle local", icon: Radio, tone: "cyan" },
  { code: "L1", label: "FUSION", detail: "Normalisation · horodatage · identité", icon: GitBranch, tone: "blue" },
  { code: "L2", label: "ASSURANCE", detail: "Qualité · limites · safety case", icon: ShieldCheck, tone: "amber" },
  { code: "L3", label: "AUTORITÉ", detail: "Revue humaine · décision tracée", icon: Users, tone: "green" },
] as const;

export function EngineeringStreamArchitecture({ configured, flight, altitude, energy, power, mass, endurance, wind, phase }: Props) {
  const state = configured ? "NOMINAL / SIMULATION LOCALE" : "STANDBY / AUCUNE SOURCE";
  return (
    <div className="orc-live-architecture">
      <div className="orc-architecture-banner">
        <div><span className="orc-architecture-kicker">ARCHITECTURE DE FLUX · PROFIL OTAN / INDUSTRIE EUROPÉENNE</span><strong>ISR-ENG / DATA &amp; ASSURANCE PLANE</strong></div>
        <span className={`orc-architecture-state ${configured ? "is-nominal" : "is-standby"}`}><i /> {state}</span>
      </div>
      <div className="orc-architecture-layers" aria-label="Couches du flux d’ingénierie">
        {layers.map(({ code, label, detail, icon: Icon, tone }, index) => <div className={`orc-architecture-layer tone-${tone}`} key={code}>
          <div className="orc-layer-index">{code}</div><Icon size={15} /><div><strong>{label}</strong><span>{detail}</span></div><em>{configured && index < 3 ? "PASS" : configured && index === 3 ? "HUMAN" : "WAIT"}</em>
          {index < layers.length - 1 && <span className="orc-layer-link" aria-hidden="true" />}
        </div>)}
      </div>
      <div className="orc-architecture-status">
        <div><Database size={14} /><span>IDENTITÉ DE FLUX</span><b>{configured ? "PROFILE-BOUND" : "NOT-BOUND"}</b></div>
        <div><Activity size={14} /><span>ÉCHANTILLONNAGE</span><b>4 Hz · {flight.samples.length} TRAMES</b></div>
        <div><LockKeyhole size={14} /><span>CONTRÔLE</span><b>READ ONLY · NO ACTUATOR</b></div>
        <div><CheckCircle2 size={14} /><span>PHASE</span><b>{phase}</b></div>
      </div>
      <div className="orc-engineering-stream-status"><span className="system-pulse" /> <strong>{configured ? phase : "EN ATTENTE D’UNE CELLULE"}</strong><small>{flight.samples.length} trames · t+{flight.elapsedS.toFixed(1)} s · source {configured ? "simulation locale" : "aucune"}</small></div>
      <div className="orc-stream-charts"><TelemetryStripChart label="ALTITUDE" unit="m" values={altitude} tone="cyan" decimals={0} height={62} /><TelemetryStripChart label="ÉNERGIE" unit="%" values={energy} tone="amber" decimals={1} height={62} /><TelemetryStripChart label="PUISSANCE" unit="W" values={power} tone="violet" decimals={0} height={62} /></div>
      <div className="orc-chart-legend"><span><i className="orc-key-cyan" /> altitude</span><span><i className="orc-key-amber" /> énergie restante</span><span><i className="orc-key-violet" /> puissance estimée</span><b>{configured ? "CALCULATION PRELIMINARY" : "NO DATA INJECTED"}</b></div>
      <div className="orc-metric-row"><div><small>MASSE</small><b>{configured ? mass : "—"}</b></div><div><small>AUTONOMIE</small><b>{configured ? endurance : "—"}</b></div><div><small>VENT / MARGE</small><b>{configured ? wind : "—"}</b></div></div>
    </div>
  );
}
