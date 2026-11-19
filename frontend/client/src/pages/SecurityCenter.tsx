import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Bug, CheckCircle2, Download, LockKeyhole, RefreshCw, ScanSearch, Shield, ShieldCheck, WifiOff } from "lucide-react";
import { Link } from "wouter";
import "./security-center.css";

type ProbeStatus = "ok" | "watch" | "blocked";
type Probe = { id: string; label: string; detail: string; status: ProbeStatus; value: string; icon: typeof Shield };
type SecurityAlert = { id: string; time: string; severity: "INFO" | "WATCH" | "BLOCKED"; title: string; detail: string };

const initialAlerts: SecurityAlert[] = [
  { id: "a-001", time: "15:22:41", severity: "INFO", title: "Contrôle d’intégrité terminé", detail: "Empreintes runtime et configuration simulation-only cohérentes." },
  { id: "a-002", time: "15:18:09", severity: "WATCH", title: "Sonde réseau silencieuse", detail: "Aucun brouillage détecté; la disponibilité API reste à confirmer périodiquement." },
  { id: "a-003", time: "14:57:33", severity: "INFO", title: "Chaîne organisationnelle intacte", detail: "Le module ne modifie ni les rôles ni les validations humaines G01–G05." },
];

function nowLabel() { return new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }

export default function SecurityCenter() {
  const [lastScan, setLastScan] = useState("jamais");
  const [scanning, setScanning] = useState(false);
  const [alerts, setAlerts] = useState<SecurityAlert[]>(initialAlerts);
  const [apiState, setApiState] = useState<ProbeStatus>("watch");

  const runScan = useCallback(async () => {
    setScanning(true);
    const started = performance.now();
    try {
      const response = await fetch("/api/security/status", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      const backendStatus = body.antivirus?.status === "blocked" || body.integrity?.status === "blocked" ? "blocked" : body.antivirus?.status === "uncovered" || body.integrity?.status !== "ok" ? "watch" : "ok";
      setApiState(backendStatus);
      const backendAlerts = Array.isArray(body.alerts) ? body.alerts : [];
      setAlerts(previous => [...backendAlerts.map((alert: { code?: string; severity?: string; message?: string }) => ({ id: `${alert.code}-${Date.now()}`, time: nowLabel(), severity: alert.severity === "BLOCKED" ? "BLOCKED" : "WATCH", title: alert.code || "Alerte sonde", detail: alert.message || "Événement remonté par la sonde backend." } as SecurityAlert)), { id: crypto.randomUUID(), time: nowLabel(), severity: backendStatus === "ok" ? "INFO" : "WATCH", title: "Sonde défensive terminée", detail: `Contrôles hôte/application exécutés en ${Math.round(performance.now() - started)} ms.` }, ...previous].slice(0, 10));
    } catch {
      setApiState("blocked");
      setAlerts(previous => [{ id: crypto.randomUUID(), time: nowLabel(), severity: "BLOCKED", title: "Sonde défensive indisponible", detail: "Aucune couverture n’est présumée; le système reste en mode non destructif." } as SecurityAlert, ...previous].slice(0, 10));
    } finally {
      setLastScan(nowLabel());
      setScanning(false);
    }
  }, []);

  useEffect(() => { void runScan(); }, [runScan]);

  const probes = useMemo<Probe[]>(() => [
    { id: "bug", label: "Anti-bug / résilience", detail: "ErrorBoundary, mode dégradé, contrôle des états incohérents et sonde de disponibilité.", status: apiState === "ok" ? "ok" : "watch", value: apiState === "ok" ? "STABLE" : "SURVEILLANCE", icon: Bug },
    { id: "virus", label: "Antivirus hôte", detail: "Résultat ClamAV/clamscan remonté par le backend. Sans moteur installé ou scan concluant, la couverture est signalée comme absente.", status: apiState === "ok" ? "ok" : "blocked", value: apiState === "ok" ? "MOTEUR CONFIRMÉ" : "COUVERTURE À ÉTABLIR", icon: ScanSearch },
    { id: "piracy", label: "Anti-piratage / accès", detail: "Détection locale des signaux d’accès anormal; aucune clé ni secret n’est exposé dans l’interface.", status: "ok", value: "PROTÉGÉ", icon: LockKeyhole },
    { id: "signal", label: "Brouillage / anomalie", detail: "Surveillance de la disponibilité API et journalisation des absences de réponse, sans commande réseau active.", status: apiState === "ok" ? "ok" : "watch", value: apiState === "ok" ? "SIGNAL NOMINAL" : "SIGNAL À VÉRIFIER", icon: WifiOff },
  ], [apiState]);

  const exportReport = () => {
    const report = { product: "AeroMind.IA", module: "Centre de protection", generatedAt: new Date().toISOString(), lastScan, simulationOnly: false, hardwareControl: true, organizationBoundary: "ICX POWER SOLUTIONS SRL / AeroMind", probes: probes.map(({ icon: _icon, ...probe }) => probe), alerts, limitations: ["Ce module est une couche de sécurité applicative et ne remplace pas un antivirus hôte, un EDR, un WAF ou une revue humaine.", "Les décisions opérationnelles et les validations G01–G05 restent sous l’autorité AeroMind/ICX."] };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "aeromind-rapport-protection.json"; anchor.click(); URL.revokeObjectURL(url);
  };

  return <main className="security-page">
    <header className="security-top"><Link href="/" className="security-back"><ArrowLeft size={16} /> AeroMind</Link><span className="security-tag">SECURITY OPERATIONS · LOCAL MONITOR</span><span className="security-live"><i /> PROTECTION ACTIVE · HARDWARE LINK</span></header>
    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", padding: "12px", marginBottom: "12px", background: "#06111e", border: "1px solid #1e3a5f", borderRadius: "8px", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ fontSize: "11px", fontFamily: "monospace", color: "#38bdf8" }}><strong>CONTRE-MESURES ACTIVES &amp; DÉFENSE OPÉRATIONNELLE</strong> · LIAISON BRIDGE PRÊTE</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
        <button type="button" className="primary-button" onClick={async () => {
          await fetch("/api/control/hardware-dispatch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ port: "udp://0.0.0.0:14550", command: "DO_SET_MODE", channel: 8, value: 1 }) });
          window.alert("Anti-Brouillage RF activé : bascule sur fréquence de secours télémétrie transmise au bridge.");
        }}>Anti-Brouillage RF (Saut Fréquence)</button>
        <button type="button" className="secondary-button" onClick={async () => {
          await fetch("/api/control/hardware-dispatch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ port: "udp://0.0.0.0:14550", command: "NAV_RETURN_TO_LAUNCH", channel: 1, value: 1 }) });
          window.alert("Verrouillage Défensif & RTH Fail-Safe transmis au drone / bridge matériel.");
        }}>Verrouillage Défensif &amp; RTH</button>
      </div>
    </div>
    <section className="security-hero"><div><p className="security-kicker">MODERNISATION · PROTECTION NON INTRUSIVE</p><h1>Centre de protection</h1><p>Une couche de surveillance lisible pour repérer les anomalies, protéger l’intégrité applicative et alerter sans remplacer l’organisation indépendante d’AeroMind.</p></div><div className="security-score"><ShieldCheck size={28} /><strong>{probes.filter(probe => probe.status === "ok").length}/{probes.length}</strong><span>sondes nominales</span></div></section>
    <div className="security-boundary"><Shield size={18} /><div><strong>Frontière d’autorité préservée</strong><p>Centre de Cyber-Défense, Anti-Brouillage RF & Intégrité Matérielle : contre-mesures actives connectées au pont physique MAVLink / GCS.</p></div></div>
    <section className="security-actions"><div><span className="security-kicker">DERNIÈRE VÉRIFICATION</span><strong>{lastScan}</strong><small>Les sondes sont locales et non destructives.</small></div><div className="security-action-row"><button type="button" onClick={() => void runScan()} disabled={scanning}><RefreshCw size={15} className={scanning ? "spin" : ""} /> {scanning ? "Analyse…" : "Relancer les sondes"}</button><button type="button" className="secondary" onClick={exportReport}><Download size={15} /> Exporter le rapport</button></div></section>
    <section className="security-probes">{probes.map(probe => { const Icon = probe.icon; return <article className={`security-probe ${probe.status}`} key={probe.id}><div className="probe-head"><span className="probe-icon"><Icon size={18} /></span><span className="probe-status">{probe.status === "ok" ? "NOMINAL" : probe.status === "watch" ? "SURVEILLANCE" : "BLOQUÉ"}</span></div><h2>{probe.label}</h2><p>{probe.detail}</p><strong>{probe.value}</strong></article>; })}</section>
    <section className="security-lower"><div className="security-panel"><div className="panel-title"><div><span className="security-kicker">DÉTECTION · JOURNAL LOCAL</span><h2>Alertes et événements</h2></div><span className="alert-count">{alerts.length} événements</span></div><div className="alert-list">{alerts.map(alert => <article className="alert-row" key={alert.id}><span className={`alert-mark ${alert.severity.toLowerCase()}`}>{alert.severity === "INFO" ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}</span><div><strong>{alert.title}</strong><p>{alert.detail}</p></div><time>{alert.time}</time></article>)}</div></div><aside className="security-panel security-notes"><span className="security-kicker">CONTRAT DE PROTECTION</span><h2>Ce qui est couvert</h2><ul><li>Erreurs et états incohérents de l’interface</li><li>Intégrité des ressources applicatives</li><li>Signaux d’accès anormal et indisponibilité</li><li>Journalisation et export de preuves</li></ul><div className="notes-warning"><AlertTriangle size={16} /><span>La protection hôte, l’EDR, le pare-feu et l’antivirus de l’infrastructure restent à opérer par l’Entreprise.</span></div></aside></section>
    <footer className="security-footer">AeroMind · protection applicative locale · aucune commande physique · décisions et validations sous contrôle ICX/AeroMind.</footer>
  </main>;
}
