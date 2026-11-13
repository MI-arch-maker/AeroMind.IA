import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Circle, Clock3, Factory, FileCheck2, ListChecks, Pause, Play, RefreshCw, ShieldCheck, WifiOff } from "lucide-react";
import "./production-flow-panel.css";

const stages = [
  { title: "Revue du dossier", detail: "Vérification locale de la sélection et des métadonnées du modèle.", icon: FileCheck2 },
  { title: "Préparation matière", detail: "Étape illustrative; le stock n’est pas mesuré ni réservé.", icon: ListChecks },
  { title: "Préparation du poste virtuel", detail: "Jumeau de poste de démonstration; aucun équipement n’est connecté.", icon: Factory },
  { title: "Fabrication simulée", detail: "Progression synthétique de scénario, sans G-code ni trajectoire machine.", icon: Play },
  { title: "Revue qualité documentaire", detail: "Résultat illustratif à vérifier par des personnes habilitées.", icon: ShieldCheck },
];

type LogEntry = { time: string; message: string };
export default function ProductionFlowPanel({ hasSelectedCell, onOpenWorkspace, onNotice }: { hasSelectedCell: boolean; onOpenWorkspace: () => void; onNotice: (message: string) => void }) {
  const [stage, setStage] = useState(-1);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => {
      const next = Math.min(stage + 1, stages.length - 1);
      const message = next === stages.length - 1 ? "Scénario terminé — résultat de simulation uniquement, non libéré." : `${stages[next].title} — étape simulée.`;
      setStage(next);
      setLog(items => [{ time: new Date().toLocaleTimeString("fr-FR"), message }, ...items].slice(0, 12));
      if (next === stages.length - 1) {
        setRunning(false);
        onNotice("Flux de production simulé terminé · aucune machine commandée");
      } else onNotice(`${stages[next].title} · simulation locale`);
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [running, stage, onNotice]);
  const start = () => {
    if (!hasSelectedCell) { onNotice("Sélectionnez une cellule dans l’atelier avant le flux simulé"); return; }
    if (stage < 0 || stage === stages.length - 1) {
      setStage(-1);
      setLog(items => [{ time: new Date().toLocaleTimeString("fr-FR"), message: "Nouveau scénario de fabrication simulé démarré." }, ...items].slice(0, 12));
    }
    setRunning(true);
    onNotice("Flux de fabrication simulé démarré · aucune sortie machine");
  };
  const reset = () => { setRunning(false); setStage(-1); setLog(items => [{ time: new Date().toLocaleTimeString("fr-FR"), message: "Scénario local réinitialisé." }, ...items].slice(0, 12)); onNotice("Scénario de fabrication simulé réinitialisé"); };
  const percent = stage < 0 ? 0 : Math.round(((stage + (running ? .35 : 1)) / stages.length) * 100);
  return <section className="pfs-shell" aria-labelledby="pfs-title">
    <header className="pfs-heading"><div><span>VIRTUAL FACTORY · MODE DE PRODUCTION SIMULÉE</span><h2 id="pfs-title">Flux de fabrication supervisé</h2><p>Parcours opératoire de démonstration, isolé de tout matériel et non libératoire.</p></div><span className="pfs-chip"><WifiOff size={14}/> AUCUNE MACHINE CONNECTÉE</span></header>
    <div className="pfs-safety"><AlertTriangle size={18}/><p><strong>SIMULATION UNIQUEMENT</strong> · aucune imprimante, CNC, actionneur, contrôleur ou API de machine n’est piloté. Aucun G-code n’est créé ou transmis. Ce flux ne vaut pas autorisation de fabrication.</p></div>
    {!hasSelectedCell && <div className="pfs-selection"><span>Aucune cellule n’est sélectionnée pour le scénario.</span><button type="button" onClick={onOpenWorkspace}>Ouvrir l’atelier et choisir une cellule</button></div>}
    <div className="pfs-summary"><div><span>SCÉNARIO</span><strong>{hasSelectedCell ? "FDM-01 · Démonstration virtuelle" : "En attente de sélection"}</strong></div><div><span>AVANCEMENT SYNTHÉTIQUE</span><strong>{percent}%</strong></div><div><span>ÉTAT</span><strong className={running?"is-running":""}>{running ? "EN COURS · SIMULÉ" : stage === stages.length - 1 ? "TERMINÉ · SIMULÉ" : stage >= 0 ? "EN PAUSE · SIMULÉ" : "PRÊT · SIMULÉ"}</strong></div></div>
    <div className="pfs-progress"><i style={{ width: `${percent}%` }}/></div>
    <div className="pfs-grid"><div className="pfs-steps">{stages.map((item,index)=>{ const Icon=item.icon; const active=running&&stage===index; const done=stage>index || (stage===index && !running); return <article key={item.title} className={`${done?"done":""} ${active?"active":""}`}><div className="pfs-step-icon">{done?<CheckCircle2 size={18}/>:<Icon size={18}/>}</div><div><span>ÉTAPE {String(index+1).padStart(2,"0")}</span><strong>{item.title}</strong><small>{item.detail}</small></div><div className="pfs-step-state">{done?"FAIT · SIMULÉ":active?"EN COURS":<><Circle size={13}/> À VENIR</>}</div></article>;})}
      <div className="pfs-controls"><button type="button" className="pfs-primary" disabled={!hasSelectedCell||running} onClick={start}>{running?<Pause size={16}/>:<Play size={16}/>} {stage===stages.length-1?"RELANCER LE SCÉNARIO":stage>=0?"REPRENDRE LE SCÉNARIO":"DÉMARRER LE FLUX SIMULÉ"}</button><button type="button" className="pfs-secondary" disabled={stage<0&&!running} onClick={()=>{setRunning(false);onNotice("Flux simulé mis en pause");}}><Pause size={15}/> PAUSE</button><button type="button" className="pfs-secondary" onClick={reset}><RefreshCw size={15}/> RÉINITIALISER</button></div>
    </div><aside className="pfs-log"><div className="pfs-log-head"><div><span>JOURNAL DE SESSION</span><strong>Événements locaux</strong></div><Clock3 size={16}/></div>{log.length?log.map((entry,index)=><div className="pfs-log-row" key={`${entry.time}-${index}`}><time>{entry.time}</time><span>{entry.message}</span></div>):<div className="pfs-log-empty">Le journal sera alimenté au démarrage du scénario. Il n’est pas envoyé à un serveur.</div>}<div className="pfs-qualification"><ShieldCheck size={16}/><span><strong>NON QUALIFIÉ</strong> Les étapes ne contrôlent ni matériaux réels, ni machine, ni qualité dimensionnelle.</span></div></aside></div>
  </section>;
}
