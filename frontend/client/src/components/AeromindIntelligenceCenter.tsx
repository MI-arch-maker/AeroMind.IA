import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  Activity,
  AlertTriangle,
  Archive,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  ClipboardCheck,
  Clock3,
  Cpu,
  Database,
  FileCheck2,
  FileText,
  Factory,
  Gauge,
  History,
  Layers3,
  LockKeyhole,
  MessageSquareText,
  Network,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  UserCheck,
  Users,
  Wind,
  Wrench,
  X,
} from "lucide-react";
import "./aeromind-intelligence-center.css";

type IntelligenceSection =
  | "dashboard"
  | "conversation"
  | "agents"
  | "tasks"
  | "knowledge"
  | "decisions"
  | "improvement"
  | "models"
  | "history"
  | "governance"
  | "settings";
type AgentStatus = "online" | "working" | "waiting";
type EvidenceKind = "verified" | "hypothesis" | "recommendation";
type TaskStatus = "queued" | "running" | "blocked" | "done";
type AgentRecord = {
  id: string;
  name: string;
  role: string;
  scope: string;
  status: AgentStatus;
  coverage: string;
  color: string;
  Icon: typeof BrainCircuit;
};
type ChatMessage = { id: string; role: "user" | "assistant"; content: string; time: string };
type TaskRecord = { id: string; label: string; agent: string; status: TaskStatus; detail: string };
type KnowledgeRecord = { id: string; title: string; type: string; source: string; version: string; evidence: EvidenceKind; updated: string };
type ActivityRecord = { id: string; label: string; detail: string; time: string; tone: "cyan" | "green" | "amber" };

type Props = { projectName: string; projectId?: string; onNavigate?: (view: string) => void };

const STORAGE_KEY = "aeromind-intelligence-center-v1";
const nowLabel = () => new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const todayLabel = () => new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });

const agents: AgentRecord[] = [
  { id: "master", name: "Master Intelligence", role: "Orchestration centrale", scope: "Comprend les demandes, décompose les missions et consolide les résultats.", status: "online", coverage: "100 %", color: "cyan", Icon: BrainCircuit },
  { id: "parametric", name: "Parametric Intelligence", role: "Modèles & géométrie", scope: "Paramètres, versions, variantes et optimisation des conceptions.", status: "online", coverage: "92 %", color: "blue", Icon: Layers3 },
  { id: "mechanic", name: "Mecanic Intelligence", role: "Structure & matériaux", scope: "Contraintes structurelles, compatibilité et documentation mécanique.", status: "working", coverage: "84 %", color: "amber", Icon: Wrench },
  { id: "electronics", name: "Electronics Intelligence", role: "Systèmes électriques", scope: "Composants, compatibilité, énergie et configurations électroniques.", status: "online", coverage: "78 %", color: "violet", Icon: Cpu },
  { id: "aerodynamic", name: "Aerodynamic Intelligence", role: "Résultats aérodynamiques", scope: "Comparaison des simulations, anomalies et recommandations CFD.", status: "waiting", coverage: "64 %", color: "teal", Icon: Wind },
  { id: "manufacturing", name: "Manufacturing Intelligence", role: "Fabrication & production", scope: "Préparation de fabrication, machines, matériaux et planning.", status: "online", coverage: "71 %", color: "orange", Icon: Factory },
  { id: "fleet", name: "Fleet Intelligence", role: "Flotte & fiabilité", scope: "Historique, maintenance prédictive et gestion des incidents.", status: "online", coverage: "68 %", color: "green", Icon: Gauge },
  { id: "quality", name: "Quality Intelligence", role: "Qualité & conformité", scope: "Exigences, cohérence, non-conformités et preuves.", status: "working", coverage: "89 %", color: "rose", Icon: BadgeCheck },
];

const initialMessages: ChatMessage[] = [
  { id: "welcome", role: "assistant", time: "maintenant", content: "Centre Intelligence prêt. Décrivez un objectif d’ingénierie : je peux identifier les centres concernés, préparer une mission, signaler les données manquantes et conserver une recommandation soumise à validation humaine." },
];
const initialTasks: TaskRecord[] = [
  { id: "TASK-041", label: "Revue de la baseline active", agent: "Parametric Intelligence", status: "done", detail: "Version locale détectée · aucune modification écrite" },
  { id: "TASK-042", label: "Vérification des exigences ouvertes", agent: "Quality Intelligence", status: "running", detail: "3 exigences à confirmer par un responsable" },
  { id: "TASK-043", label: "Disponibilité des entrées CFD", agent: "Aerodynamic Intelligence", status: "blocked", detail: "Solveur non connecté · résultat CFD non disponible" },
];
const initialKnowledge: KnowledgeRecord[] = [
  { id: "KB-001", title: "Contrat de conception paramétrique", type: "Procédure", source: "AeroMind / Engineering Hub", version: "v3.2", evidence: "verified", updated: "03 nov. 2026" },
  { id: "KB-002", title: "Baseline drone actif", type: "Modèle", source: "Projet local", version: "rev. locale", evidence: "hypothesis", updated: "Aujourd’hui" },
  { id: "KB-003", title: "Rapport de simulation synthétique", type: "Simulation", source: "LabBench virtuel", version: "SIM-000", evidence: "recommendation", updated: "02 nov. 2026" },
];
const initialActivity: ActivityRecord[] = [
  { id: "ACT-01", label: "Contrôle de provenance", detail: "Master Intelligence a vérifié le contexte du projet actif.", time: "09:42", tone: "green" },
  { id: "ACT-02", label: "Limite signalée", detail: "Aucune validation CFD réelle revendiquée sans solveur raccordé.", time: "09:38", tone: "amber" },
  { id: "ACT-03", label: "Version de référence", detail: "Baseline locale conservée sans écriture silencieuse.", time: "09:31", tone: "cyan" },
];

const sectionItems: Array<{ id: IntelligenceSection; label: string; meta: string; Icon: typeof BrainCircuit }> = [
  { id: "dashboard", label: "Master AI Dashboard", meta: "01", Icon: BrainCircuit },
  { id: "conversation", label: "AI Conversation Workspace", meta: "02", Icon: MessageSquareText },
  { id: "agents", label: "Agent Management", meta: "08", Icon: Users },
  { id: "tasks", label: "Task Orchestration", meta: "03", Icon: Network },
  { id: "knowledge", label: "Knowledge Base", meta: "KB", Icon: Database },
  { id: "decisions", label: "Decision Support", meta: "N2", Icon: Target },
  { id: "improvement", label: "Continuous Improvement", meta: "CI", Icon: RefreshCw },
  { id: "models", label: "AI Model Management", meta: "AI", Icon: Cpu },
  { id: "history", label: "Activity History", meta: "LOG", Icon: History },
  { id: "governance", label: "Permissions & Governance", meta: "HUMAN", Icon: ShieldCheck },
  { id: "settings", label: "Settings", meta: "CFG", Icon: Settings2 },
];

function toneClass(value: string) { return `aic-tone-${value}`; }
function statusLabel(status: AgentStatus) { return status === "online" ? "OPÉRATIONNEL" : status === "working" ? "EN ANALYSE" : "EN ATTENTE"; }
function taskLabel(status: TaskStatus) { return status === "queued" ? "EN FILE" : status === "running" ? "EN COURS" : status === "blocked" ? "BLOQUÉ" : "TERMINÉ"; }

export function AeromindIntelligenceCenter({ projectName, projectId, onNavigate }: Props) {
  const [section, setSection] = useState<IntelligenceSection>("dashboard");
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [tasks, setTasks] = useState<TaskRecord[]>(initialTasks);
  const [knowledge, setKnowledge] = useState<KnowledgeRecord[]>(initialKnowledge);
  const [activity, setActivity] = useState<ActivityRecord[]>(initialActivity);
  const [missionState, setMissionState] = useState<"idle" | "running" | "done">("idle");
  const [approvalState, setApprovalState] = useState<"pending" | "approved" | "rejected">("pending");
  const [improvementState, setImprovementState] = useState<"pending" | "validated" | "dismissed">("pending");
  const [knowledgeFilter, setKnowledgeFilter] = useState("");
  const [showAllActivity, setShowAllActivity] = useState(false);
  const [modelFallback, setModelFallback] = useState(true);
  const [humanReview, setHumanReview] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved?.messages?.length) setMessages(saved.messages);
      if (saved?.tasks?.length) setTasks(saved.tasks);
      if (saved?.knowledge?.length) setKnowledge(saved.knowledge);
      if (saved?.activity?.length) setActivity(saved.activity);
      if (saved?.approvalState) setApprovalState(saved.approvalState);
      if (saved?.improvementState) setImprovementState(saved.improvementState);
    } catch { /* Le workspace reste utilisable si le stockage local est indisponible. */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ messages, tasks, knowledge, activity, approvalState, improvementState })); } catch { /* mode mémoire local */ }
  }, [messages, tasks, knowledge, activity, approvalState, improvementState]);

  const activeAgents = useMemo(() => agents.filter(agent => agent.status !== "waiting").length, []);
  const filteredKnowledge = knowledge.filter(item => `${item.title} ${item.type} ${item.source}`.toLowerCase().includes(knowledgeFilter.toLowerCase()));
  const visibleActivity = showAllActivity ? activity : activity.slice(0, 4);

  const appendActivity = (label: string, detail: string, tone: ActivityRecord["tone"] = "cyan") => {
    setActivity(current => [{ id: `ACT-${Date.now()}`, label, detail, time: nowLabel(), tone }, ...current]);
  };
  const routeRequest = (content: string) => {
    const lower = content.toLowerCase();
    const matched = agents.filter(agent => lower.includes(agent.id) || lower.includes(agent.name.toLowerCase().split(" ")[0])).map(agent => agent.name);
    if (matched.length) return matched;
    if (lower.includes("fabric") || lower.includes("production")) return ["Manufacturing Intelligence", "Mecanic Intelligence", "Quality Intelligence"];
    if (lower.includes("drone") || lower.includes("conception") || lower.includes("modèle")) return ["Parametric Intelligence", "Mecanic Intelligence", "Aerodynamic Intelligence", "Quality Intelligence"];
    if (lower.includes("maintenance") || lower.includes("flotte")) return ["Fleet Intelligence", "Quality Intelligence"];
    return ["Master Intelligence", "Quality Intelligence"];
  };
  const sendMessage = (content = draft) => {
    const clean = content.trim();
    if (!clean) return;
    const routed = routeRequest(clean);
    const taskId = `TASK-${String(44 + tasks.length).padStart(3, "0")}`;
    const response = `Demande comprise. Centres sollicités : ${routed.join(", ")}.\n\nFaits vérifiés : le projet « ${projectName} » est en mode ${projectId ? "projet actif" : "exploration locale"}, et les sorties matérielles restent désactivées.\n\nDonnées manquantes : préciser la version de référence, les fichiers sources et le niveau de validation attendu.\n\nRecommandation : préparer une mission multi-agents ${taskId}, puis soumettre le rapport à une revue humaine avant toute écriture dans une conception approuvée.`;
    setMessages(current => [...current, { id: `msg-${Date.now()}`, role: "user", content: clean, time: nowLabel() }, { id: `msg-${Date.now()}-a`, role: "assistant", content: response, time: nowLabel() }]);
    setTasks(current => [{ id: taskId, label: clean.length > 58 ? `${clean.slice(0, 58)}…` : clean, agent: routed[0], status: "queued", detail: `${routed.length} agent(s) identifiés · revue humaine requise` }, ...current]);
    appendActivity("Nouvelle demande routée", `${taskId} · ${routed.length} centre(s) concerné(s).`, "cyan");
    setDraft("");
    setSection("conversation");
  };
  const launchMission = () => {
    setMissionState("running");
    setTasks(current => current.map(task => task.status === "queued" ? { ...task, status: "running", detail: "Sous-tâche distribuée · résultats attendus" } : task));
    appendActivity("Mission distribuée", "Le Master Agent a distribué les sous-tâches aux centres compétents.", "cyan");
    window.setTimeout(() => {
      setMissionState("done");
      setTasks(current => current.map(task => task.status === "running" ? { ...task, status: "done", detail: "Résultat consolidé · aucune écriture de conception" } : task));
      appendActivity("Rapport consolidé", "Les résultats sont prêts pour revue humaine; aucune validation technique automatique.", "green");
    }, 650);
  };
  const resetWorkspace = () => {
    setMessages(initialMessages);
    setTasks(initialTasks);
    setApprovalState("pending");
    setImprovementState("pending");
    appendActivity("Workspace réinitialisé", "Les données de mission locales ont été remises à leur état de démonstration.", "amber");
  };
  const handleKnowledgeFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const entry: KnowledgeRecord = { id: `KB-${String(knowledge.length + 4).padStart(3, "0")}`, title: file.name, type: "Import local", source: "Fichier utilisateur · à vérifier", version: "non versionné", evidence: "hypothesis", updated: "À l’instant" };
    setKnowledge(current => [entry, ...current]);
    appendActivity("Document placé en quarantaine", `${file.name} · aucune preuve de validation déduite de l’import.`, "amber");
    event.target.value = "";
  };
  const approveRecommendation = () => {
    setApprovalState("approved");
    appendActivity("Approbation humaine enregistrée", "La recommandation est approuvée comme piste de travail, sans modification silencieuse de conception.", "green");
  };

  const renderDashboard = () => <>
    <section className="aic-command-hero">
      <div><span className="aic-kicker">AEROMIND / CENTRAL INTELLIGENCE</span><h1>Master AI Dashboard</h1><p>Le cerveau analytique et organisationnel du projet. Une demande globale devient une mission traçable, distribuée et soumise au contrôle humain.</p></div>
      <div className="aic-hero-actions"><span className="aic-mode-badge"><span className="aic-live-dot" /> VIRTUAL · HUMAN CONTROL</span><button type="button" className="aic-primary-button" onClick={() => setSection("conversation")}><MessageSquareText size={15} /> Nouvelle demande</button></div>
    </section>
    <section className="aic-metric-grid" aria-label="Indicateurs du centre intelligence">
      {[{ label: "AGENTS ACTIFS", value: `${activeAgents}/8`, detail: "Routage disponible", Icon: Network, tone: "cyan" }, { label: "MISSIONS EN COURS", value: String(tasks.filter(task => task.status === "running" || task.status === "queued").length).padStart(2, "0"), detail: "Distribution locale", Icon: Activity, tone: "blue" }, { label: "SOURCES INDEXÉES", value: String(knowledge.length).padStart(2, "0"), detail: "Provenance visible", Icon: Database, tone: "green" }, { label: "À APPROUVER", value: approvalState === "pending" ? "01" : "00", detail: humanReview ? "Revue humaine active" : "Revue désactivée", Icon: UserCheck, tone: "amber" }].map(item => <article className={`aic-metric-card ${toneClass(item.tone)}`} key={item.label}><item.Icon size={17} /><div><span>{item.label}</span><strong>{item.value}</strong><small>{item.detail}</small></div></article>)}
    </section>
    <div className="aic-dashboard-grid">
      <section className="aic-panel aic-request-panel"><div className="aic-panel-heading"><div><span className="aic-kicker">01 / ORCHESTRATION</span><h2>Que faut-il analyser ?</h2></div><Sparkles size={18} /></div><p>Écrivez comme à un responsable d’ingénierie. Le Master Agent identifie les centres, crée les tâches et expose les informations manquantes.</p><div className="aic-quick-prompts">{["Analyse cette conception de drone et prépare un dossier de fabrication.", "Compare les options de propulsion et signale les compromis.", "Prépare une revue qualité des exigences ouvertes."].map(prompt => <button type="button" key={prompt} onClick={() => sendMessage(prompt)}>{prompt}<ArrowRight size={14} /></button>)}</div><button type="button" className="aic-secondary-button" onClick={() => setSection("conversation")}><MessageSquareText size={14} /> Ouvrir l’espace de conversation</button></section>
      <section className="aic-panel"><div className="aic-panel-heading"><div><span className="aic-kicker">02 / TASK GRAPH</span><h2>Mission active</h2></div><span className={`aic-state-pill ${missionState}`}>{missionState === "idle" ? "PRÊTE" : missionState === "running" ? "DISTRIBUTION" : "RAPPORT PRÊT"}</span></div><div className="aic-mission-title"><strong>Revue d’ingénierie multi-centres</strong><small>{projectName} · version de référence à confirmer</small></div><div className="aic-task-list">{tasks.slice(0, 4).map(task => <div className="aic-task-row" key={task.id}><span className={`aic-task-dot ${task.status}`} /><div><strong>{task.label}</strong><small>{task.agent} · {task.detail}</small></div><span className={`aic-status-text ${task.status}`}>{taskLabel(task.status)}</span></div>)}</div><button type="button" className="aic-primary-button aic-full-button" onClick={launchMission} disabled={missionState === "running"}><Play size={14} /> {missionState === "running" ? "Mission en cours…" : missionState === "done" ? "Relancer la mission" : "Distribuer les tâches"}</button></section>
    </div>
    <section className="aic-panel aic-activity-strip"><div className="aic-panel-heading"><div><span className="aic-kicker">03 / TRACE</span><h2>Activité récente</h2></div><button type="button" className="aic-link-button" onClick={() => setSection("history")}>Tout voir <ChevronRight size={14} /></button></div><div className="aic-activity-grid">{activity.slice(0, 3).map(item => <div className="aic-activity-item" key={item.id}><span className={`aic-activity-mark ${item.tone}`} /><div><strong>{item.label}</strong><small>{item.detail}</small></div><time>{item.time}</time></div>)}</div></section>
  </>;

  const renderConversation = () => <div className="aic-workspace-grid"><section className="aic-panel aic-conversation-panel"><div className="aic-panel-heading"><div><span className="aic-kicker">AI CONVERSATION WORKSPACE</span><h2>Brief d’ingénierie</h2></div><span className="aic-context-chip">{projectName}</span></div><div className="aic-chat-stream">{messages.map(message => <article className={`aic-chat-message ${message.role}`} key={message.id}><div className="aic-chat-avatar">{message.role === "assistant" ? <BrainCircuit size={15} /> : <span>OP</span>}</div><div><div className="aic-chat-meta"><strong>{message.role === "assistant" ? "Master Intelligence" : "Opérateur"}</strong><time>{message.time}</time></div><p>{message.content}</p></div></article>)}</div><div className="aic-chat-composer"><textarea value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(); } }} placeholder="Ex. Analyse cette nouvelle conception de drone et prépare un dossier de fabrication…" rows={3} /><div><small>Entrée pour envoyer · Maj + Entrée pour un retour à la ligne</small><button type="button" className="aic-primary-button" onClick={() => sendMessage()} disabled={!draft.trim()}><Send size={14} /> Envoyer</button></div></div></section><aside className="aic-side-stack"><section className="aic-panel"><div className="aic-panel-heading"><div><span className="aic-kicker">ROUTAGE</span><h2>Centres pressentis</h2></div><Network size={16} /></div>{agents.slice(0, 5).map(agent => <div className="aic-agent-mini" key={agent.id}><span className={`aic-agent-mini-icon ${toneClass(agent.color)}`}><agent.Icon size={14} /></span><div><strong>{agent.name}</strong><small>{agent.status === "waiting" ? "Données attendues" : "Prêt à être sollicité"}</small></div><CircleDot size={12} className={`aic-agent-status ${agent.status}`} /></div>)}</section><section className="aic-panel aic-safety-panel"><LockKeyhole size={17} /><div><strong>Contrôle humain obligatoire</strong><p>Les recommandations ne modifient jamais silencieusement une conception approuvée. Les actions sensibles restent en attente d’approbation.</p></div></section></aside></div>;

  const renderAgents = () => <section className="aic-panel"><div className="aic-panel-heading"><div><span className="aic-kicker">AGENT MANAGEMENT / 08 SPECIALISTS</span><h2>Réseau d’agents spécialisés</h2></div><button type="button" className="aic-secondary-button" onClick={() => appendActivity("État des agents actualisé", "Les statuts affichés sont ceux du workspace local.", "cyan")}><RefreshCw size={14} /> Actualiser</button></div><div className="aic-agent-grid">{agents.map(agent => <article className="aic-agent-card" key={agent.id}><div className="aic-agent-card-head"><span className={`aic-agent-icon ${toneClass(agent.color)}`}><agent.Icon size={19} /></span><span className={`aic-agent-status-pill ${agent.status}`}>{statusLabel(agent.status)}</span></div><h3>{agent.name}</h3><strong>{agent.role}</strong><p>{agent.scope}</p><div className="aic-progress-label"><span>Couverture de contrat</span><b>{agent.coverage}</b></div><div className="aic-progress"><span style={{ width: agent.coverage }} /></div><button type="button" className="aic-link-button" onClick={() => { setSection("conversation"); setDraft(`Sollicite ${agent.name} pour le projet ${projectName}.`); }}>{agent.status === "waiting" ? "Préparer une demande" : "Solliciter l’agent"} <ArrowRight size={13} /></button></article>)}</div></section>;

  const renderTasks = () => <div className="aic-dashboard-grid"><section className="aic-panel"><div className="aic-panel-heading"><div><span className="aic-kicker">TASK ORCHESTRATION ENGINE</span><h2>Graphe de mission</h2></div><span className="aic-context-chip">Projet partagé · version cohérente</span></div><div className="aic-orchestration-line">{["Comprendre", "Décomposer", "Distribuer", "Vérifier", "Consolider"].map((step, index) => <div className={index < (missionState === "done" ? 5 : missionState === "running" ? 3 : 1) ? "is-done" : ""} key={step}><span>0{index + 1}</span><strong>{step}</strong>{index < 4 && <ArrowRight size={13} />}</div>)}</div><div className="aic-task-list aic-task-list-large">{tasks.map(task => <div className="aic-task-row" key={task.id}><span className={`aic-task-dot ${task.status}`} /><div><strong>{task.id} · {task.label}</strong><small>{task.agent} · {task.detail}</small></div><span className={`aic-status-text ${task.status}`}>{taskLabel(task.status)}</span></div>)}</div><button type="button" className="aic-primary-button" onClick={launchMission} disabled={missionState === "running"}><Play size={14} /> Exécuter la mission</button></section><section className="aic-panel"><div className="aic-panel-heading"><div><span className="aic-kicker">DEPENDENCIES</span><h2>Blocages détectés</h2></div><AlertTriangle size={17} className="aic-icon-amber" /></div><div className="aic-blocker"><span>CFD</span><div><strong>Solveur aérodynamique non connecté</strong><small>Le cas peut être préparé/exporté; aucun résultat CFD ne doit être inventé.</small></div></div><div className="aic-blocker"><span>AUTH</span><div><strong>Validation humaine attendue</strong><small>La recommandation de conception reste en état de proposition.</small></div></div><button type="button" className="aic-secondary-button" onClick={() => setSection("decisions")}><ClipboardCheck size={14} /> Ouvrir les approbations</button></section></div>;

  const renderKnowledge = () => <section className="aic-panel"><div className="aic-panel-heading"><div><span className="aic-kicker">KNOWLEDGE BASE & TECHNICAL MEMORY</span><h2>Mémoire technique centralisée</h2></div><button type="button" className="aic-primary-button" onClick={() => fileInputRef.current?.click()}><Plus size={14} /> Analyser un document</button><input ref={fileInputRef} className="aic-hidden-input" type="file" accept=".pdf,.csv,.json,.md,.txt,.step,.stl,.obj" onChange={handleKnowledgeFile} /></div><div className="aic-kb-toolbar"><label><Search size={14} /><input value={knowledgeFilter} onChange={event => setKnowledgeFilter(event.target.value)} placeholder="Rechercher dans les sources…" /></label><span>{filteredKnowledge.length} source(s) · provenance conservée</span></div><div className="aic-knowledge-table"><div className="aic-kb-row aic-kb-head"><span>DOCUMENT</span><span>TYPE / SOURCE</span><span>VERSION</span><span>STATUT</span></div>{filteredKnowledge.map(item => <div className="aic-kb-row" key={item.id}><div><FileText size={15} /><strong>{item.title}</strong></div><div><b>{item.type}</b><small>{item.source}</small></div><span>{item.version}</span><span className={`aic-evidence ${item.evidence}`}>{item.evidence === "verified" ? "VÉRIFIÉ" : item.evidence === "hypothesis" ? "HYPOTHÈSE" : "RECOMMANDATION"}</span></div>)}</div><div className="aic-source-note"><Database size={14} /> Un import ne vaut pas validation. Chaque agent doit distinguer les informations vérifiées, les hypothèses et les recommandations.</div></section>;

  const renderDecisions = () => <div className="aic-dashboard-grid"><section className="aic-panel"><div className="aic-panel-heading"><div><span className="aic-kicker">ENGINEERING DECISION SUPPORT</span><h2>Comparer avant de décider</h2></div><BarChart3 size={17} /></div><div className="aic-comparison-table"><div><span>CRITÈRE</span><b>OPTION A · actuelle</b><b>OPTION B · optimisée</b></div>{[["Masse estimée", "2,84 kg", "2,71 kg"], ["Risque documentaire", "Faible", "À revoir"], ["Données vérifiées", "7 / 9", "5 / 9"], ["Niveau de confiance", "Élevé", "Moyen"]].map(row => <div key={row[0]}><span>{row[0]}</span><strong>{row[1]}</strong><strong className="aic-option-b">{row[2]}</strong></div>)}</div><div className="aic-recommendation"><Sparkles size={15} /><div><strong>Recommandation préparée</strong><p>Conserver l’Option A comme baseline et ouvrir une variante B pour analyse paramétrique. Aucun remplacement silencieux de la conception active.</p></div></div></section><section className="aic-panel"><div className="aic-panel-heading"><div><span className="aic-kicker">HUMAN APPROVAL QUEUE</span><h2>Décision à valider</h2></div><span className={`aic-state-pill ${approvalState}`}>{approvalState === "pending" ? "EN ATTENTE" : approvalState === "approved" ? "APPROUVÉE" : "REFUSÉE"}</span></div><div className="aic-approval-card"><div className="aic-approval-icon"><UserCheck size={19} /></div><div><strong>Préparer la variante paramétrique B</strong><small>Demande IA-DEC-007 · soumise par Master Intelligence</small><p>La validation confirme une piste de travail, pas une certification mécanique, CFD ou de fabrication.</p></div></div><div className="aic-action-row"><button type="button" className="aic-primary-button" onClick={approveRecommendation} disabled={approvalState !== "pending"}><Check size={14} /> Approuver la piste</button><button type="button" className="aic-danger-button" onClick={() => { setApprovalState("rejected"); appendActivity("Recommandation refusée", "Aucune action de conception n’a été exécutée.", "amber"); }} disabled={approvalState !== "pending"}><X size={14} /> Refuser</button></div></section></div>;

  const renderImprovement = () => <div className="aic-dashboard-grid"><section className="aic-panel"><div className="aic-panel-heading"><div><span className="aic-kicker">CONTINUOUS IMPROVEMENT ENGINE</span><h2>Signaux historiques</h2></div><RefreshCw size={17} /></div><div className="aic-improvement-list">{[["Retards de fabrication", "3 occurrences", "Comparer les causes documentaires"], ["Données CFD manquantes", "2 projets", "Raccorder un solveur ou marquer indisponible"], ["Révisions non alignées", "1 occurrence", "Renforcer le contrôle de version"]].map(item => <div className="aic-improvement-item" key={item[0]}><span className="aic-improvement-number">01</span><div><strong>{item[0]}</strong><small>{item[1]} · {item[2]}</small></div><ArrowRight size={14} /></div>)}</div></section><section className="aic-panel"><div className="aic-panel-heading"><div><span className="aic-kicker">PROPOSAL / HUMAN GATE</span><h2>Proposition d’amélioration</h2></div><span className={`aic-state-pill ${improvementState}`}>{improvementState === "pending" ? "À ÉTUDIER" : improvementState === "validated" ? "VALIDÉE" : "ÉCARTÉE"}</span></div><p className="aic-panel-copy">Réutiliser un contrôle de cohérence avant chaque rapport de fabrication. Cette proposition ne modifie aucune procédure approuvée tant qu’un responsable ne l’a pas validée.</p><div className="aic-action-row"><button type="button" className="aic-primary-button" onClick={() => { setImprovementState("validated"); appendActivity("Amélioration validée", "Proposition conservée pour implémentation contrôlée.", "green"); }} disabled={improvementState !== "pending"}><Check size={14} /> Valider la proposition</button><button type="button" className="aic-secondary-button" onClick={() => { setImprovementState("dismissed"); appendActivity("Amélioration écartée", "Aucune modification appliquée.", "amber"); }} disabled={improvementState !== "pending"}>Écarter</button></div></section></div>;

  const renderModels = () => <section className="aic-panel"><div className="aic-panel-heading"><div><span className="aic-kicker">AI CONNECTIVITY & MODEL MANAGEMENT</span><h2>Routage des modèles</h2></div><SlidersHorizontal size={17} /></div><div className="aic-model-list"><div className="aic-model-row"><span className="aic-model-icon aic-tone-cyan"><Sparkles size={16} /></span><div><strong>Manus AI · modèle intégré</strong><small>Routage principal · secrets côté serveur · journalisation active</small></div><span className="aic-model-state online">ACTIF</span></div><div className="aic-model-row"><span className="aic-model-icon aic-tone-amber"><RefreshCw size={16} /></span><div><strong>Rules Engine · solution de repli</strong><small>Réponses déterministes pour continuer l’analyse sans fournisseur externe</small></div><button type="button" className={`aic-switch ${modelFallback ? "is-on" : ""}`} onClick={() => setModelFallback(value => !value)} aria-pressed={modelFallback}><span /></button></div><div className="aic-model-row"><span className="aic-model-icon aic-tone-blue"><BarChart3 size={16} /></span><div><strong>Évaluation des performances</strong><small>Latence, coût, limites et erreurs visibles dans les journaux projet</small></div><span className="aic-model-state waiting">CONFIGURABLE</span></div></div><div className="aic-secret-note"><LockKeyhole size={14} /><span>Aucune clé API n’est embarquée dans le client. Les fournisseurs indépendants doivent être déclarés côté serveur avant utilisation.</span></div></section>;

  const renderHistory = () => <section className="aic-panel"><div className="aic-panel-heading"><div><span className="aic-kicker">ACTIVITY HISTORY / AUDIT TRAIL</span><h2>Trace des décisions et tâches</h2></div><History size={17} /></div><div className="aic-history-list">{visibleActivity.map(item => <div className="aic-history-row" key={item.id}><span className={`aic-activity-mark ${item.tone}`} /><div><strong>{item.label}</strong><small>{item.detail}</small></div><time>{item.time}</time></div>)}</div><button type="button" className="aic-secondary-button" onClick={() => setShowAllActivity(value => !value)}>{showAllActivity ? "Réduire l’historique" : "Afficher toute l’activité"}</button></section>;

  const renderGovernance = () => <div className="aic-dashboard-grid"><section className="aic-panel"><div className="aic-panel-heading"><div><span className="aic-kicker">AI PERMISSIONS & SAFETY</span><h2>Niveaux d’autorisation</h2></div><ShieldCheck size={17} /></div>{[["NIVEAU 1", "Lecture & analyse", "Autorisé"], ["NIVEAU 2", "Recommandations", "Autorisé"], ["NIVEAU 3", "Documents & tâches", "Autorisé"], ["NIVEAU 4", "Modifications non sensibles", "Sous validation"], ["NIVEAU 5", "Opérations physiques", "Hors périmètre"]].map((item, index) => <div className="aic-permission-row" key={item[0]}><span>{item[0]}</span><div><strong>{item[1]}</strong><small>{index === 4 ? "Cette interface ne pilote aucun aéronef réel" : "Contrôle et traçabilité requis"}</small></div><b className={index === 4 ? "locked" : index === 3 ? "review" : "allowed"}>{item[2]}</b></div>)}</section><section className="aic-panel"><div className="aic-panel-heading"><div><span className="aic-kicker">GOVERNANCE SETTINGS</span><h2>Garde-fous actifs</h2></div><LockKeyhole size={17} /></div><label className="aic-setting-row"><span><strong>Validation humaine</strong><small>Requise pour toute décision technique finale</small></span><button type="button" className={`aic-switch ${humanReview ? "is-on" : ""}`} onClick={() => setHumanReview(value => !value)} aria-pressed={humanReview}><span /></button></label><label className="aic-setting-row"><span><strong>Notifications de mission</strong><small>Signaler les blocages et approbations en attente</small></span><button type="button" className={`aic-switch ${notifications ? "is-on" : ""}`} onClick={() => setNotifications(value => !value)} aria-pressed={notifications}><span /></button></label><div className="aic-human-gate"><UserCheck size={16} /><div><strong>{approvalState === "pending" ? "1 décision attend une approbation" : "File d’approbation à jour"}</strong><small>Les agents proposent; un humain dispose.</small></div><button type="button" className="aic-link-button" onClick={() => setSection("decisions")}>Revoir <ChevronRight size={14} /></button></div></section></div>;

  const renderSettings = () => <section className="aic-panel"><div className="aic-panel-heading"><div><span className="aic-kicker">SETTINGS / PROJECT CONTEXT</span><h2>Paramètres du centre</h2></div><Settings2 size={17} /></div><div className="aic-settings-grid"><div><span>PROJET</span><strong>{projectName}</strong><small>{projectId || "Identifiant local non confirmé"}</small></div><div><span>VERSION DE RÉFÉRENCE</span><strong>Révision locale</strong><small>Les agents utilisent le même contexte de projet.</small></div><div><span>SÉCURITÉ</span><strong>VIRTUAL ONLY</strong><small>Aucun transport ou actionneur matériel.</small></div><div><span>RÉTENTION</span><strong>Workspace local</strong><small>Effaçable depuis cette interface.</small></div></div><div className="aic-settings-actions"><button type="button" className="aic-secondary-button" onClick={resetWorkspace}><Archive size={14} /> Réinitialiser le workspace</button>{onNavigate && <button type="button" className="aic-secondary-button" onClick={() => onNavigate("engineering-hub")}><ArrowRight size={14} /> Ouvrir l’Engineering Hub</button>}</div><div className="aic-warning-note"><AlertTriangle size={14} /> La configuration IA présentée ici orchestre des analyses et recommandations. Elle ne constitue ni certification, ni validation industrielle, ni autorisation d’opération physique.</div></section>;

  const sectionTitle = sectionItems.find(item => item.id === section)?.label ?? "Master AI Dashboard";
  return <div className="aic-shell">
    <aside className="aic-sidebar"><div className="aic-brand"><span className="aic-brand-mark"><BrainCircuit size={18} /></span><div><strong>AEROMIND <b>IA</b></strong><small>INTELLIGENCE CENTER</small></div></div><div className="aic-sidebar-context"><span>PROJET ACTIF</span><strong>{projectName}</strong><small>{projectId ? "Contexte partagé" : "Brouillon local"}</small></div><nav className="aic-section-nav" aria-label="Navigation du Centre Intelligence">{sectionItems.map(item => <button type="button" key={item.id} className={section === item.id ? "is-active" : ""} onClick={() => setSection(item.id)}><item.Icon size={15} /><span>{item.label}</span><small>{item.meta}</small></button>)}</nav><div className="aic-sidebar-footer"><div><span className="aic-live-dot" /><strong>RUNTIME SÉCURISÉ</strong></div><small>Agents analytiques · sortie physique verrouillée</small></div></aside>
    <main className="aic-main"><header className="aic-topbar"><div><span className="aic-kicker">MASTER INTELLIGENCE / {section === "dashboard" ? "CONTROL ROOM" : "WORKSPACE"}</span><h2>{sectionTitle}</h2></div><div className="aic-topbar-actions"><span className="aic-project-pill"><CircleDot size={12} /> {projectName}</span><span className="aic-confidence"><CheckCircle2 size={13} /> Trace active</span></div></header><div className="aic-content">{section === "dashboard" && renderDashboard()}{section === "conversation" && renderConversation()}{section === "agents" && renderAgents()}{section === "tasks" && renderTasks()}{section === "knowledge" && renderKnowledge()}{section === "decisions" && renderDecisions()}{section === "improvement" && renderImprovement()}{section === "models" && renderModels()}{section === "history" && renderHistory()}{section === "governance" && renderGovernance()}{section === "settings" && renderSettings()}</div></main>
  </div>;
}

export default AeromindIntelligenceCenter;
