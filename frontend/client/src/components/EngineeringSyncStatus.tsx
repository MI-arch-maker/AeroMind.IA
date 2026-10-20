import { AlertTriangle, CheckCircle2, CircleDashed, ShieldCheck } from "lucide-react";
import type { EngineeringSyncHealth } from "../lib/engineeringSyncHealth";
import "./engineering-sync-status.css";

export function EngineeringSyncStatus({ health }: { health: EngineeringSyncHealth }) {
  const blocking = health.issues.filter(issue => issue.severity === "error");
  const warnings = health.issues.filter(issue => issue.severity === "warning");
  return <section className={`engineering-sync-status sync-${health.status.toLowerCase()}`} aria-label="État de synchronisation d’ingénierie">
    <div className="sync-status-head"><div className="sync-status-title">{health.status === "READY" ? <CheckCircle2 size={16} /> : health.status === "BLOCKED" ? <AlertTriangle size={16} /> : <CircleDashed size={16} />}<div><strong>SYNCHRONISATION INGÉNIERIE · {health.status}</strong><small>Révision {health.revision}</small></div></div><span className="sync-security"><ShieldCheck size={13} /> N2 · sortie matérielle verrouillée</span></div>
    <div className="sync-module-strip">{Object.entries(health.modules).map(([module, state]) => <span key={module} className={`sync-module sync-${state}`} title={`${module} : ${state}`}><i />{module}</span>)}</div>
    {health.issues.length > 0 && <div className="sync-alerts" role="status">{health.issues.slice(0, 3).map(issue => <div key={issue.code} className={`sync-alert sync-alert-${issue.severity}`}><AlertTriangle size={13} /><span><strong>{issue.module} · {issue.code}</strong> {issue.message} <em>Solution : {issue.solution}</em></span></div>)}</div>}
    {(blocking.length > 0 || warnings.length > 0) && <small className="sync-count">{blocking.length} blocage(s) · {warnings.length} avertissement(s) · aucune donnée non vérifiée ne peut être présentée comme validée.</small>}
  </section>;
}
