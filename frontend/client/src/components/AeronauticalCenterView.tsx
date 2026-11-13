import { useMemo, useState } from "react";
import { Activity, AlertTriangle, BatteryCharging, CheckCircle2, ClipboardList, Download, Gauge, LockKeyhole, Plane, Radio, Settings2, ShieldCheck, Unlock, Wrench, Zap } from "lucide-react";
import type { ConceptConfig, DroneArchitecture } from "../lib/aeroEngine";
import { defaultFleetScenario, simulateFleet } from "../lib/fleetSimulation";
import {
  aeronauticalRoles,
  computeEquipmentLoad,
  defaultFleetUnits,
  equipmentOptions,
  evaluateReadiness,
  type AeronauticalRole,
  type FleetUnitStatus,
} from "../lib/aeronauticalCenter";

/**
 * Centre aéronautique.
 *
 * La baie équipements et l'enveloppe de masse sont recalculées en direct : le
 * même calcul alimente la jauge circulaire, la masse maximale recalculée et la
 * consommation batterie affichées dans la colonne de configuration. Ces valeurs
 * restent des estimations d'avant-projet, jamais des mesures d'aéronef.
 */

const GAUGE_RADIUS = 34;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;

export function AeronauticalCenterView({ config, setConfig }: { config: ConceptConfig; setConfig: (value: ConceptConfig) => void }) {
  const [role, setRole] = useState<AeronauticalRole>((config.aeronauticalRole as AeronauticalRole | undefined) ?? "observation");
  const [equipment, setEquipment] = useState<string[]>(config.integratedEquipmentIds?.length ? config.integratedEquipmentIds : ["eo-gimbal", "rtk", "parachute"]);
  const [units, setUnits] = useState(defaultFleetUnits);
  const [fleetScenario, setFleetScenario] = useState(defaultFleetScenario);
  const [gaugePulse, setGaugePulse] = useState(0);
  const [baselineLocked, setBaselineLocked] = useState(false);
  const [baselineNote, setBaselineNote] = useState("Revue d’avant-projet · validation humaine requise");
  const selectedEquipment = useMemo(
    () => equipmentOptions.filter(item => equipment.includes(item.id)),
    [equipment]
  );
  const readiness = useMemo(() => evaluateReadiness(config, selectedEquipment, role), [config, selectedEquipment, role]);
  const fleet = useMemo(() => simulateFleet(config, fleetScenario), [config, fleetScenario]);
  const load = useMemo(() => computeEquipmentLoad(config, selectedEquipment), [config, selectedEquipment]);
  const patchConfig = (patch: Partial<ConceptConfig>) => {
    if (baselineLocked) return;
    setConfig({ ...config, ...patch });
  };
  const toggleEquipment = (id: string) => setEquipment(current => {
    const next = current.includes(id) ? current.filter(item => item !== id) : [...current, id];
    patchConfig({ integratedEquipmentIds: next });
    setGaugePulse(value => value + 1);
    return next;
  });
  const changeRole = (nextRole: AeronauticalRole) => {
    if (baselineLocked) return;
    setRole(nextRole);
    patchConfig({ aeronauticalRole: nextRole });
  };
  const exportConfigurationPackage = () => {
    const payload = {
      document: "AEROMIND-CONFIGURATION-CONTROL",
      exportedAt: new Date().toISOString(),
      baseline: { status: baselineLocked ? "FROZEN" : "DRAFT", note: baselineNote, authority: "AeroMind · revue ingénierie humaine" },
      architecture: config,
      integratedEquipment: selectedEquipment,
      readiness,
      estimate: load,
      limitations: ["Estimation d’avant-projet", "Aucune commande physique", "Vérification indépendante obligatoire avant essai"],
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${(config.designName || "aeromind-configuration").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-baseline.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const statusLabel: Record<FleetUnitStatus, string> = { ready: "PRÊT", review: "REVUE", offline: "HORS RÉSEAU", maintenance: "MAINTENANCE" };
  const readinessPct = readiness.total ? Math.round((readiness.passed / readiness.total) * 100) : 0;
  const readinessLabel = readiness.status === "ready" ? "PRÊT POUR SIMULATION" : readiness.status === "review" ? "REVUE REQUISE" : "EN COURS DE QUALIFICATION";
  const massRatio = config.maxTakeoffKg > 0 ? load.computedMaxMassKg / config.maxTakeoffKg : 0;
  const massState = massRatio > 1 ? "over" : massRatio > 0.92 ? "tight" : "ok";
  const enduranceHours = load.enduranceMin / 60;
  return <div className="view-stack aero-center-view">
    <div className="aero-center-hero">
      <div><p className="eyebrow">AEROMIND IA / AERONAUTICAL CONTROL CENTER</p><h2>Centre aéronautique</h2><p>Concevoir, configurer, préparer et superviser des aéronefs non armés depuis un même espace de travail.</p></div>
      <div className={`aero-readiness-dial is-${readiness.status}`}>
        <svg viewBox="0 0 88 88" role="img" aria-label={`Préparation ${readiness.passed} contrôles validés sur ${readiness.total}`} key={`gauge-${gaugePulse}-${readiness.passed}`}>
          <circle className="aero-gauge-track" cx="44" cy="44" r={GAUGE_RADIUS} />
          <circle
            className="aero-gauge-ring"
            cx="44"
            cy="44"
            r={GAUGE_RADIUS}
            strokeDasharray={GAUGE_CIRCUMFERENCE}
            strokeDashoffset={GAUGE_CIRCUMFERENCE * (1 - readinessPct / 100)}
            transform="rotate(-90 44 44)"
          />
          <text className="aero-gauge-value" x="44" y="42" textAnchor="middle">{readinessPct}%</text>
          <text className="aero-gauge-caption" x="44" y="56" textAnchor="middle">{readiness.passed}/{readiness.total} CONTRÔLES</text>
        </svg>
        <div className="aero-readiness-copy">
          <ShieldCheck size={16}/>
          <strong>{readinessLabel}</strong>
          <span>{readiness.total - readiness.passed === 0 ? "Aucun contrôle ouvert" : `${readiness.total - readiness.passed} contrôle(s) ouvert(s)`} · {load.installedCount} équipement(s) installé(s)</span>
          <div className="aero-readiness-chips">
            {readiness.checks.map(check => <i key={check.id} className={check.pass ? "is-pass" : "is-open"} title={check.label}>{check.label}</i>)}
          </div>
        </div>
      </div>
    </div>
    <section className="panel aero-baseline-panel" aria-label="Contrôle de baseline de configuration">
      <div className="aero-baseline-heading"><div><p className="eyebrow">CONFIGURATION CONTROL / BASELINE</p><h3>Référentiel de configuration</h3><p>Une baseline gelée devient la référence de revue ; les modifications restent possibles après déverrouillage explicite.</p></div><span className={`aero-baseline-state ${baselineLocked ? "is-frozen" : "is-draft"}`}>{baselineLocked ? <LockKeyhole size={14} /> : <Unlock size={14} />}{baselineLocked ? "BASELINE GELÉE" : "BROUILLON DE REVUE"}</span></div>
      <div className="aero-baseline-grid"><div><span>Référence</span><strong>{config.designName || "Configuration sans nom"}</strong></div><div><span>Cycle de vie</span><strong>{baselineLocked ? "REVUE / GELÉE" : "AVANT-PROJET / EN ÉDITION"}</strong></div><div><span>Traçabilité</span><strong>{readiness.passed}/{readiness.total} contrôles · {selectedEquipment.length} équipements</strong></div><label><span>Note de revue</span><input value={baselineNote} onChange={event => setBaselineNote(event.target.value)} disabled={baselineLocked} /></label></div>
      <div className="aero-baseline-actions"><button type="button" className="secondary-button" onClick={() => setBaselineLocked(value => !value)}>{baselineLocked ? <Unlock size={14} /> : <LockKeyhole size={14} />}{baselineLocked ? "Déverrouiller pour modifier" : "Geler la baseline"}</button><button type="button" className="primary-button" onClick={exportConfigurationPackage}><Download size={14} />Exporter le dossier JSON</button><span><ClipboardList size={14} />Aucune approbation réglementaire n’est implicite.</span></div>
    </section>
    <div className="aero-center-grid">
      <section className="panel aero-config-panel"><div className="panel-header"><div><p className="eyebrow">01 / CONFIGURATION AÉRONEF</p><h3>Architecture et enveloppe</h3></div><Settings2 size={18} className="cyan-icon"/></div>
        <div className="aero-architecture-grid">{(["quadcopter", "vtol", "fixed-wing"] as DroneArchitecture[]).map(kind => <button type="button" key={kind} className={`aero-architecture-card ${config.airframe === kind ? "is-selected" : ""}`} onClick={() => patchConfig({ airframe: kind, designName: `${kind.toUpperCase()} — configuration contrôlée`, motorCount: kind === "quadcopter" ? 4 : kind === "vtol" ? 4 : 1 })}><Plane size={18}/><strong>{kind === "quadcopter" ? "Multirotor" : kind === "vtol" ? "VTOL hybride" : "Aile fixe"}</strong><span>{kind === "quadcopter" ? "Stationnaire / inspection" : kind === "vtol" ? "Transition / longue portée" : "Endurance / cartographie"}</span></button>)}</div>
        <div className="aero-form-grid"><label>Rôle opérationnel<select value={role} onChange={event => changeRole(event.target.value as AeronauticalRole)}>{aeronauticalRoles.map(item => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label><label>Nom de configuration<input value={config.designName ?? ""} onChange={event => patchConfig({ designName: event.target.value })}/></label><label>Batterie utile<strong>{config.batteryWh} Wh</strong><input type="range" min="0" max="2500" step="25" value={config.batteryWh} onChange={event => patchConfig({ batteryWh: Number(event.target.value) })}/></label><label>Charge utile<strong>{config.payloadKg.toFixed(1)} kg</strong><input type="range" min="0" max="20" step="0.1" value={config.payloadKg} onChange={event => patchConfig({ payloadKg: Number(event.target.value) })}/></label><label>Vitesse cible de conception · simulation<strong>{config.cruiseSpeedKmh} km/h</strong><input type="range" min="0" max="650" step="5" value={Math.max(0, Math.min(650, config.cruiseSpeedKmh))} onChange={event => patchConfig({ cruiseSpeedKmh: Number(event.target.value) })}/><small>Au-delà de 216 km/h, les estimations de puissance/autonomie sont hors calibration.</small></label><label>Masse maximale déclarée<strong>{config.maxTakeoffKg.toFixed(1)} kg</strong><input type="range" min="0" max="40" step="0.1" value={config.maxTakeoffKg} onChange={event => patchConfig({ maxTakeoffKg: Number(event.target.value) })}/></label></div>
        <div className="aero-live-compute" aria-live="polite">
          <div className="aero-live-compute-heading"><span><Zap size={14}/> RECALCUL EN DIRECT — BAIE ÉQUIPEMENTS</span><small>Estimation d’avant-projet</small></div>
          <div className="aero-live-readouts">
            <div className={`aero-live-readout is-${massState}`}>
              <span>Masse maximale recalculée</span>
              <strong key={`mass-${load.computedMaxMassKg}`}>{load.computedMaxMassKg.toFixed(2)} kg</strong>
              <small>cellule {load.airframeMassKg.toFixed(2)} + équipements {load.equipmentMassKg.toFixed(2)} + charge {config.payloadKg.toFixed(1)}</small>
            </div>
            <div className="aero-live-readout">
              <span>Consommation batterie</span>
              <strong key={`power-${load.computedPowerW}`}>{load.computedPowerW.toFixed(1)} W</strong>
              <small>équipements {load.equipmentPowerW.toFixed(1)} W · autonomie {enduranceHours.toFixed(1)} h</small>
            </div>
            <div className={`aero-live-readout is-${load.massMarginKg < 0 ? "over" : "ok"}`}>
              <span>Marge sur masse déclarée</span>
              <strong key={`margin-${load.massMarginKg}`}>{load.massMarginKg.toFixed(2)} kg</strong>
              <small>{load.massMarginKg < 0 ? "Enveloppe dépassée : réduire la charge" : "Enveloppe respectée"}</small>
            </div>
            <div className="aero-live-readout">
              <span>Réserve énergie modèle</span>
              <strong key={`reserve-${Math.round((config.reserveFraction ?? 0) * 100)}`}>{Math.round((config.reserveFraction ?? 0) * 100)} %</strong>
              <small>réserve conservée hors consommation estimée</small>
            </div>
          </div>
          <div className="aero-mass-bar" aria-hidden="true">
            <i className={`is-${massState}`} style={{ width: `${Math.min(100, massRatio * 100)}%` }} />
            <span style={{ left: "92%" }} className="aero-mass-bar-threshold" />
            <em>{config.maxTakeoffKg.toFixed(1)} kg déclarés</em>
          </div>
        </div>
      </section>
      <section className="panel aero-equipment-panel"><div className="panel-header"><div><p className="eyebrow">02 / OUTILS & MATÉRIELS INTÉGRÉS</p><h3>Baie équipements</h3></div><Wrench size={18} className="amber-icon"/></div><p className="section-description">Sélectionnez les équipements réellement prévus : la masse maximale et la consommation de la batterie se recalculent instantanément dans le panneau de configuration. Les éléments non vérifiés restent explicitement signalés.</p>
        <div className="aero-equipment-totals"><span><strong>{load.installedCount}</strong> installé(s)</span><span><strong>{load.equipmentMassKg.toFixed(2)}</strong> kg</span><span><strong>{load.equipmentPowerW.toFixed(1)}</strong> W</span><span><strong>{enduranceHours.toFixed(1)}</strong> h autonomie</span></div>
        <div className="aero-equipment-list">{equipmentOptions.map(item => <label className={`aero-equipment-row ${equipment.includes(item.id) ? "is-installed" : ""}`} key={item.id}><input type="checkbox" checked={equipment.includes(item.id)} onChange={() => toggleEquipment(item.id)}/><span><strong>{item.label}</strong><small>{item.category} · {item.massKg.toFixed(2)} kg · {item.powerW.toFixed(1)} W · {item.interface}</small></span><em>{item.verified ? "VÉRIFIÉ" : "À VÉRIFIER"}</em></label>)}</div>
        <div className="aero-equipment-legend"><span><i className="is-cyan"/> Capteur électro-optique et thermique : recalcule la consommation et la masse en direct</span><span><i className="is-amber"/> Référence non vérifiée : validation sur pièce requise</span></div>
      </section>
    </div>
    <section className="panel aero-readiness-panel"><div className="panel-header"><div><p className="eyebrow">03 / PRÉVOL & AUTORISATION DE SIMULATION</p><h3>Gates de préparation</h3></div><span className="calculated-badge">Aucun ordre réel envoyé</span></div><div className="aero-check-grid">{readiness.checks.map(check => <div key={check.id} className={`aero-check ${check.pass ? "is-pass" : "is-open"}`}>{check.pass ? <CheckCircle2 size={16}/> : <AlertTriangle size={16}/>}<span>{check.label}</span><strong>{check.pass ? "OK" : "OUVERT"}</strong></div>)}</div></section>
    <section className="panel aero-fleet-panel"><div className="panel-header"><div><p className="eyebrow">04 / FLEET MANAGEMENT</p><h3>État de la flotte</h3></div><span className="calculated-badge"><Activity size={13}/> {units.filter(unit => unit.status === "ready").length}/{units.length} prêts</span></div><div className="aero-fleet-table">{units.map(unit => <div className="aero-fleet-row" key={unit.id}><span className="aero-unit-id"><Radio size={14}/><strong>{unit.callsign}</strong></span><span>{unit.airframe}</span><span>{unit.role}</span><span><BatteryCharging size={13}/> {unit.batteryPct}%</span><span>{unit.hours.toFixed(1)} h</span><StatusPill status={unit.status === "ready" ? "pass" : unit.status === "review" ? "review" : "hypothesis"}>{statusLabel[unit.status]}</StatusPill><button className="icon-button" title="Changer l’état simulé" onClick={() => setUnits(current => current.map(item => item.id === unit.id ? { ...item, status: item.status === "ready" ? "review" : "ready" } : item))}><Gauge size={14}/></button></div>)}</div></section>
    <section className="panel aero-fleet-scenario"><div className="panel-header"><div><p className="eyebrow">05 / GESTION DE MISSION SIMULÉE</p><h3>Capacité de flotte</h3></div><span className={`calculated-badge fleet-status-${fleet.overallStatus}`}>{fleet.overallStatus.toUpperCase()}</span></div><div className="aero-scenario-controls"><label>Appareils<strong>{fleetScenario.aircraftCount}</strong><input type="range" min="1" max="12" value={fleetScenario.aircraftCount} onChange={event => setFleetScenario({ ...fleetScenario, aircraftCount: Number(event.target.value) })}/></label><label>Charge / appareil<strong>{fleetScenario.payloadKgPerAircraft.toFixed(1)} kg</strong><input type="range" min="0" max="10" step="0.1" value={fleetScenario.payloadKgPerAircraft} onChange={event => setFleetScenario({ ...fleetScenario, payloadKgPerAircraft: Number(event.target.value) })}/></label><label>Distance<strong>{fleetScenario.missionDistanceKm} km</strong><input type="range" min="1" max="180" value={fleetScenario.missionDistanceKm} onChange={event => setFleetScenario({ ...fleetScenario, missionDistanceKm: Number(event.target.value) })}/></label><label>Perte liaison<strong>{fleetScenario.linkLossProbabilityPct}%</strong><input type="range" min="0" max="25" value={fleetScenario.linkLossProbabilityPct} onChange={event => setFleetScenario({ ...fleetScenario, linkLossProbabilityPct: Number(event.target.value) })}/></label></div><div className="aero-fleet-kpis"><div><span>Énergie utile</span><strong>{fleet.totalUsableEnergyWh} Wh</strong></div><div><span>Charge totale</span><strong>{fleet.totalPayloadKg} kg</strong></div><div><span>Marge minimale</span><strong>{fleet.fleetEnduranceMarginH} h</strong></div><div><span>Retour liaison</span><strong>{fleetScenario.returnOnLinkLoss ? "ACTIF" : "REVUE"}</strong></div></div></section>
    <div className="limits-banner"><ShieldCheck size={16}/><div><strong>Centre non armé — garde-fous actifs</strong><span>Cette interface gère la conception, la maintenance, la simulation, la préparation et la télémétrie en lecture seule. Elle n’envoie aucune commande d’actionneur, aucun téléversement de mission et ne contient aucune fonction d’armement ou de ciblage.</span></div></div>
  </div>;
}
function StatusPill({ status, children }: { status: "pass" | "review" | "hypothesis"; children: string }) { return <span className={`status-pill status-${status}`}>{children}</span>; }
