import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, Crosshair, Download, PackageCheck, Play, ScanLine, ShieldCheck } from "lucide-react";
import type { InstalledMaterial } from "../lib/aeroEngine";
import { runPayloadCalibration, type CalibrationStatus, type PayloadCalibrationProfile, type PayloadCalibrationReport } from "../lib/payloadCalibration";
import "./payload-workbench.css";

type Props = {
  installed: InstalledMaterial[];
  profiles?: Record<string, PayloadCalibrationProfile>;
  onInstall: (id: string) => void;
  onProfileChange: (id: string, profile: PayloadCalibrationProfile) => void;
};
const modules = [
  { id: "camera-rgb", label: "Caméra optronique RGB", type: "Imagerie visible", mass: "0,12 kg", icon: Camera, nominalFov: 62 },
  { id: "thermal-camera", label: "Capteur thermique IR", type: "Thermographie synthétique", mass: "0,16 kg", icon: ScanLine, nominalFov: 45 },
  { id: "lidar-unit", label: "Capteur LiDAR", type: "Nuage de points simulé", mass: "0,28 kg", icon: Crosshair, nominalFov: 30 },
  { id: "rescue-package", label: "Module colis de secours", type: "Séquence de mission au sol", mass: "0,24 kg", icon: PackageCheck, nominalFov: 50 },
];
const phases = [
  "Vérification de présence dans la nomenclature",
  "Calcul du résidu d’alignement",
  "Évaluation de la plage et du champ",
  "Génération du rapport de test",
];
const statusLabel: Record<CalibrationStatus, string> = { pass: "CONFORME SIM", review: "À REVÉRIFIER", fail: "NON CONFORME SIM" };
const statusClass: Record<CalibrationStatus, string> = { pass: "is-pass", review: "is-review", fail: "is-fail" };

function downloadReport(report: PayloadCalibrationReport) {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${report.id.toLowerCase()}-${report.equipmentId}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function PayloadMissionWorkbench({ installed, profiles = {}, onInstall, onProfileChange }: Props) {
  const [selectedId, setSelectedId] = useState("camera-rgb");
  const [phase, setPhase] = useState(-1);
  const [running, setRunning] = useState(false);
  const timer = useRef<number | null>(null);
  const selected = modules.find(item => item.id === selectedId) ?? modules[0];
  const currentProfile = profiles[selectedId] ?? { gimbalPitchDeg: 0, fieldOfViewDeg: selected.nominalFov };
  const isInstalled = installed.some(item => item.id.startsWith(selectedId));
  const report = profiles[selectedId]?.lastReport;
  const reportStale = profiles[selectedId]?.reportStale === true;

  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);

  const updateProfile = (patch: Partial<PayloadCalibrationProfile>) => {
    setPhase(-1);
    onProfileChange(selectedId, {
      ...currentProfile,
      ...patch,
      reportStale: currentProfile.lastReport ? true : false,
    });
  };

  const runCalibration = () => {
    if (running || !isInstalled) return;
    const result = runPayloadCalibration({
      module: { id: selected.id, label: selected.label, nominalFieldOfViewDeg: selected.nominalFov },
      installed: isInstalled,
      gimbalPitchDeg: currentProfile.gimbalPitchDeg,
      fieldOfViewDeg: currentProfile.fieldOfViewDeg,
    });
    setRunning(true);
    let currentPhase = 0;
    const advance = () => {
      setPhase(currentPhase);
      currentPhase += 1;
      if (currentPhase < phases.length) {
        timer.current = window.setTimeout(advance, 450);
      } else {
        timer.current = window.setTimeout(() => {
          onProfileChange(selectedId, { ...currentProfile, lastReport: result, reportStale: false });
          setRunning(false);
          timer.current = null;
        }, 450);
      }
    };
    advance();
  };

  const reticleSize = 22 + (currentProfile.fieldOfViewDeg - 20) / 100 * 40;
  return (
    <section className="payload-workbench panel" aria-label="Atelier virtuel des modules de mission">
      <div className="payload-workbench-heading">
        <div>
          <p className="eyebrow">PAYLOAD INTEGRATION / SOL SIMULATOR</p>
          <h3>Atelier équipements &amp; calibration</h3>
          <small>Essais logiciels reproductibles; aucun capteur physique n’est interrogé.</small>
        </div>
        <span><ShieldCheck size={13} /> SIMULATION LOCALE · SANS SORTIE MATÉRIELLE</span>
      </div>
      <div className="payload-workbench-grid">
        <div className="payload-module-picker" aria-label="Choisir un équipement">
          {modules.map(item => {
            const Icon = item.icon;
            const itemInstalled = installed.some(part => part.id.startsWith(item.id));
            return (
              <button key={item.id} type="button" className={selectedId === item.id ? "is-active" : ""} onClick={() => { if (!running) { setSelectedId(item.id); setPhase(-1); } }} disabled={running} aria-pressed={selectedId === item.id}>
                <Icon size={16} />
                <span><strong>{item.label}</strong><small>{item.type} · {item.mass} · nominal {item.nominalFov}°</small></span>
                {itemInstalled && <CheckCircle2 size={14} className="payload-installed" />}
              </button>
            );
          })}
        </div>
        <div className="payload-calibration">
          <div className="payload-calibration-top"><strong>{selected.label}</strong><small>{isInstalled ? "INSTALLÉ AU MODÈLE" : "RÉFÉRENCE NON INSTALLÉE"}</small></div>
          <label>Inclinaison nacelle <b>{currentProfile.gimbalPitchDeg}°</b><input type="range" min="-45" max="45" step="1" value={currentProfile.gimbalPitchDeg} disabled={running} onChange={event => updateProfile({ gimbalPitchDeg: Number(event.target.value) })} /></label>
          <label>Champ de vision simulé <b>{currentProfile.fieldOfViewDeg}°</b><input type="range" min="20" max="120" step="1" value={currentProfile.fieldOfViewDeg} disabled={running} onChange={event => updateProfile({ fieldOfViewDeg: Number(event.target.value) })} /></label>
          <div className="payload-preview" role="img" aria-label={`Aperçu simulé, inclinaison ${currentProfile.gimbalPitchDeg} degrés, champ de vision ${currentProfile.fieldOfViewDeg} degrés`}>
            <svg viewBox="0 0 400 100" aria-hidden="true">
              <path d={`M200 48 L${200-reticleSize} 94 L${200+reticleSize} 94 Z`} className="payload-view-cone" />
              <g transform={`translate(200 43) rotate(${currentProfile.gimbalPitchDeg})`} className="payload-sim-reticle">
                <circle r={reticleSize / 2} /><path d={`M-${reticleSize} 0H${reticleSize} M0 -${reticleSize}V${reticleSize}`} />
                <circle r="2" className="payload-center-dot" />
              </g>
            </svg>
            <small>APERÇU LOGICIEL · FOV {currentProfile.fieldOfViewDeg}° · INCLINAISON {currentProfile.gimbalPitchDeg}°</small>
          </div>
          <div className="payload-actions">
            <button type="button" onClick={() => onInstall(selected.id)} disabled={isInstalled || running}>+ {isInstalled ? "Déjà installé" : "Installer dans le modèle"}</button>
            <button type="button" className="payload-test-button" onClick={runCalibration} disabled={running || !isInstalled}><Play size={13} />{running ? "Test en cours…" : "Lancer le test de calibration"}</button>
          </div>
          {!isInstalled && <small className="payload-install-hint">Installez la référence dans le modèle avant de lancer le test.</small>}
          <div className="payload-sequence" aria-live="polite">
            <span>PROGRESSION DU TEST</span>
            {phase < 0 ? <small>{report ? `${reportStale ? "RAPPORT OBSOLÈTE · " : "Dernier test "}${new Date(report.generatedAt).toLocaleString("fr-FR")} · ${statusLabel[report.overall]}` : "Prêt · les résultats seront calculés depuis les réglages ci-dessus."}</small> : <small className={running ? "is-running" : "is-complete"}>{String(phase + 1).padStart(2, "0")} / {phases.length} · {phases[phase]}</small>}
          </div>
        </div>
      </div>
      {report && <section className="payload-report" aria-label="Rapport de calibration simulée">
        <div className="payload-report-heading"><div><span>RAPPORT DE TEST · {report.id}{reportStale ? " · HISTORIQUE / OBSOLÈTE" : ""}</span><strong>{report.equipmentLabel}</strong><small>{new Date(report.generatedAt).toLocaleString("fr-FR")} · modèle {report.modelVersion}</small></div><b className={statusClass[report.overall]}>{statusLabel[report.overall]}</b></div>
        {reportStale && <p className="payload-report-stale">Les réglages ont changé depuis ce test. Le rapport reste consultable comme historique, mais relancez le test pour obtenir un rapport à jour.</p>}
        <div className="payload-report-parameters"><span>Inclinaison<strong>{report.parameters.gimbalPitchDeg}°</strong></span><span>Champ réglé<strong>{report.parameters.fieldOfViewDeg}°</strong></span><span>Champ nominal<strong>{report.parameters.nominalFieldOfViewDeg}°</strong></span><span>Source<strong>Simulation locale</strong></span></div>
        <div className="payload-check-list">{report.checks.map(check => <div key={check.id} className={`payload-check ${statusClass[check.status]}`}><span>{check.label}<small>{check.detail}</small></span><strong>{check.measured}<small>Cible : {check.target}</small></strong><b>{statusLabel[check.status]}</b></div>)}</div>
        <ul className="payload-limitations">{report.limitations.map(item => <li key={item}>{item}</li>)}</ul>
        <button type="button" className="payload-export" onClick={() => downloadReport(report)}><Download size={13}/> Exporter le rapport JSON</button>
      </section>}
      <p className="payload-boundary"><ShieldCheck size={13} /> Rapport issu d’un calcul local déterministe et des paramètres affichés; ce n’est pas une mesure métrologique, une certification ni un essai d’équipement physique.</p>
    </section>
  );
}
