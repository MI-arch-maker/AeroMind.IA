import { useMemo, useState } from "react";
import { Ban, Check, Clock3, ShieldAlert, UserCheck, X } from "lucide-react";
import "./physical-control-governance.css";

type Props = { projectId?: string | null; activeDroneLabel: string };
type GateState = "pending" | "validated";
type AuditEntry = { id: string; at: string; actor: string; action: string; result: "allow" | "deny" };

const gateLabels = ["GATE 01 · Exigences", "GATE 02 · Identité", "GATE 03 · Équipements", "GATE 04 · Simulation"];

export function PhysicalControlGovernancePanel({ projectId, activeDroneLabel }: Props) {
  const [gates, setGates] = useState<GateState[]>(["pending", "pending", "pending", "pending"]);
  const [requestState, setRequestState] = useState<"draft" | "submitted" | "expired" | "revoked">("draft");
  const [command, setCommand] = useState("Positionner le drone");
  const [windowMinutes, setWindowMinutes] = useState("10");
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [notice, setNotice] = useState("Aucune décision d’équipement dans cette démonstration");
  const allGates = gates.every(state => state === "validated");
  const transmissionCode = useMemo(() => allGates ? `AM-TRX-${(projectId ?? "LOCAL").slice(0, 8).toUpperCase()}-VERIFY` : "—", [allGates, projectId]);
  const addAudit = (action: string, result: AuditEntry["result"]) => setAudit(items => [{ id: `AUD-${Date.now()}`, at: new Date().toLocaleTimeString("fr-FR"), actor: "Utilisateur courant", action, result }, ...items].slice(0, 6));
  const toggleGate = (index: number) => {
    if (requestState !== "draft") return;
    const next = gates.map((state, itemIndex) => itemIndex === index ? (state === "validated" ? "pending" : "validated") : state) as GateState[];
    setGates(next);
    addAudit(`${gateLabels[index]} · validation locale de préparation`, next[index] === "validated" ? "allow" : "deny");
    setNotice(next.every(state => state === "validated") ? "GATE 01–04 terminées · transmission à vérifier par le Super-Administrateur" : "Préparations partielles · scénario logiciel");
  };
  const submit = () => { if (!allGates || !projectId) return; setRequestState("submitted"); addAudit("Demande soumise · revue d’équipement indépendante requise", "allow"); setNotice("Demande transmise · décision personnelle GATE 05 et autorisation matérielle indépendante requises"); };
  const revoke = () => { setRequestState("revoked"); addAudit("Révocation de la demande matérielle", "deny"); setNotice("Demande révoquée · aucune session matérielle active"); };
  return <section className="physical-governance-panel" aria-label="Gouvernance du contrôle physique"><header className="pg-header"><div><p className="eyebrow">COMMANDE / GOUVERNANCE PHYSIQUE</p><h3>Demande de contrôle matériel</h3><p>{activeDroneLabel} · projet {projectId ?? "local non enregistré"}</p></div><span className="pg-locked"><ShieldAlert size={14} /> DÉMONSTRATION</span></header><div className="pg-warning"><ShieldAlert size={16} /><span>Cette demande documente la chaîne hiérarchique. Elle n’ouvre ni MAVLink, ni WSS, ni actionneur et GATE 05 ne vaut pas autorisation matérielle.</span><b>MODE : VIRTUAL</b></div><div className="pg-layout"><div className="pg-chain"><div className="pg-section-title"><span>CHAÎNE AEROMIND</span><small>Utilisateur → Super-Administrateur</small></div>{gateLabels.map((label, index) => <button className={`pg-gate ${gates[index] === "validated" ? "validated" : ""}`} key={label} onClick={() => toggleGate(index)} disabled={requestState !== "draft" || (index > 0 && gates[index - 1] !== "validated")}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{label}</strong><small>{gates[index] === "validated" ? "Validation tracée" : index > 0 && gates[index - 1] !== "validated" ? "Étape précédente requise" : "Validation habilitée"}</small></div>{gates[index] === "validated" ? <Check size={15} /> : <Clock3 size={15} />}</button>)}<div className={`pg-transmission ${allGates ? "ready" : ""}`}><span>CODE DE TRANSMISSION</span><code>{transmissionCode}</code><small>Le code identifie la demande; il ne constitue jamais une autorisation automatique.</small></div></div><div className="pg-request"><div className="pg-section-title"><span>DEMANDE SCOPÉE</span><small>Expiration et révocation indépendantes</small></div><label>Commande virtuelle demandée<select value={command} onChange={event => setCommand(event.target.value)} disabled={requestState !== "draft"}><option>Positionner le drone</option><option>Modifier le cap</option><option>Changer le mode de mission</option><option>Arrêt simulé</option></select></label><label>Fenêtre documentaire<select value={windowMinutes} onChange={event => setWindowMinutes(event.target.value)} disabled={requestState !== "draft"}><option value="5">5 minutes</option><option value="10">10 minutes</option><option value="30">30 minutes</option></select></label><div className="pg-independent-lock"><Ban size={16} /><div><strong>Autorisation matérielle indépendante</strong><span>Parcours documentaire de démonstration; il ne pilote pas un appareil réel.</span></div></div><button className="primary-button pg-submit" onClick={submit} disabled={!allGates || !projectId || requestState !== "draft"}><UserCheck size={14} /> Transmettre au Super-Administrateur</button><button className="secondary-button pg-revoke" onClick={revoke} disabled={requestState === "draft" || requestState === "revoked"}><X size={14} /> Révoquer la demande</button><p className="pg-notice" role="status">{notice}</p></div></div><footer className="pg-footer"><div><strong>JOURNAL INSTITUTIONNEL</strong>{audit.length ? audit.map(entry => <span key={entry.id}><i className={entry.result} /> {entry.at} · {entry.action}</span>) : <span>Aucun événement dans cette session d’interface.</span>}</div><small>Expiration automatique : {requestState === "submitted" ? `${windowMinutes} min` : "non démarrée"} · WSS/MAVLink externes non configurés dans cette Preview</small></footer></section>;
}

export default PhysicalControlGovernancePanel;
