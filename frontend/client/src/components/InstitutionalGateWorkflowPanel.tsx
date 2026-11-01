import { useMemo, useState } from "react";
import {
  GATE_RESPONSIBILITY,
  INSTITUTIONAL_GATES,
  createInstitutionalWorkflow,
  decideInstitutionalGate05,
  executeVirtualSimulation,
  validateInstitutionalGate,
  verifyInstitutionalTransmission,
  type InstitutionalRole,
  type InstitutionalWorkflow,
} from "../lib/institutionalWorkflow";

const roleLabels: Record<InstitutionalRole, string> = {
  operator: "Utilisateur habilité · Operator",
  analyst: "Utilisateur habilité · Analyst",
  gate_01_reviewer: "Responsable GATE 01",
  gate_02_reviewer: "Responsable GATE 02",
  gate_03_reviewer: "Responsable GATE 03",
  gate_04_reviewer: "Responsable GATE 04",
  super_admin: "Super-Administrateur · GATE 05",
};

function nextGate(workflow: InstitutionalWorkflow) {
  return INSTITUTIONAL_GATES.find(gate => !workflow.approvedGates.includes(gate)) ?? null;
}

export function InstitutionalGateWorkflowPanel() {
  const [workflow, setWorkflow] = useState(() => createInstitutionalWorkflow());
  const [activeRole, setActiveRole] = useState<InstitutionalRole>("operator");
  const [transmissionInput, setTransmissionInput] = useState("");
  const [message, setMessage] = useState("Prêt : les commandes virtuelles restent disponibles dans le simulateur.");
  const expectedGate = useMemo(() => nextGate(workflow), [workflow]);

  const apply = (result: { workflow: InstitutionalWorkflow; error?: string }, success: string) => {
    setWorkflow(result.workflow);
    setMessage(result.error ?? success);
  };

  return (
    <section className="fom-institutional" aria-labelledby="institutional-gates-title">
      <header className="fom-institutional-head">
        <div>
          <span>CHAÎNE INSTITUTIONNELLE · DÉMONSTRATION LOCALE</span>
          <h4 id="institutional-gates-title">GATE 01 → GATE 04 → transmission → Super-Administrateur → GATE 05</h4>
        </div>
        <b>SIMULATION UNIQUEMENT</b>
      </header>
      <p className="fom-institutional-note">
        Ce panneau teste le parcours dans le navigateur. Le service serveur Aeromind applique la même séparation de rôles et journalise les décisions authentifiées. Aucun code ici n’ouvre de transport MAVLink, n’active une sortie physique, ne constitue une certification de sécurité ou une autorisation réglementaire.
      </p>

      <div className="fom-institutional-controls">
        <label>Rôle actif de la démonstration
          <select value={activeRole} onChange={event => setActiveRole(event.target.value as InstitutionalRole)}>
            {(Object.keys(roleLabels) as InstitutionalRole[]).map(role => <option key={role} value={role}>{roleLabels[role]}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => apply(executeVirtualSimulation(workflow, activeRole), "Commande exécutée dans le simulateur local.")}>Exécuter une commande virtuelle</button>
        <span className="fom-institutional-status" role="status">{message}</span>
      </div>

      <div className="fom-institutional-track" aria-label="Étapes institutionnelles GATE 01 à GATE 04">
        {INSTITUTIONAL_GATES.map((gate, index) => {
          const isApproved = workflow.approvedGates.includes(gate);
          const isCurrent = expectedGate === gate;
          const role = GATE_RESPONSIBILITY[gate];
          return <article className={`fom-institutional-gate ${isApproved ? "is-approved" : isCurrent ? "is-current" : ""}`} key={gate}>
            <div><b>0{index + 1}</b><span>{gate.replace("_", " ")}</span></div>
            <strong>{roleLabels[role]}</strong>
            <small>{isApproved ? "Validation locale tracée" : isCurrent ? `Responsable requis : ${role}` : "Étape séquentielle en attente"}</small>
            <button type="button" disabled={!isCurrent || activeRole !== role} onClick={() => apply(validateInstitutionalGate(workflow, gate, activeRole), `${gate} validée localement.`)}>
              {isApproved ? "Validée" : `Valider ${gate}`}
            </button>
          </article>;
        })}
      </div>

      <section className={`fom-transmission ${workflow.transmissionCode ? "is-issued" : ""}`}>
        <div>
          <span>TRANSMISSION SÉCURISÉE</span>
          <strong>{workflow.transmissionCode ?? "Disponible après GATE 04"}</strong>
          <small>Le code identifie une demande pour vérification; il ne vaut jamais autorisation automatique.</small>
        </div>
        <label>Code présenté au Super-Administrateur
          <input value={transmissionInput} onChange={event => setTransmissionInput(event.target.value)} placeholder="Saisir ou coller le code reçu" />
        </label>
        <button type="button" disabled={!workflow.transmissionCode || activeRole !== "super_admin"} onClick={() => apply(verifyInstitutionalTransmission(workflow, transmissionInput, activeRole), "Transmission vérifiée localement.")}>Vérifier l’origine et l’intégrité</button>
      </section>

      <section className="fom-gate05">
        <div>
          <span>GATE 05 · DÉCISION PERSONNELLE</span>
          <strong>Super-Administrateur uniquement</strong>
          <small>{workflow.transmissionVerified ? "Transmission locale vérifiée — décision humaine attendue." : "La vérification de la transmission est obligatoire avant décision."}</small>
        </div>
        <div>
          <button type="button" disabled={!workflow.transmissionVerified || activeRole !== "super_admin"} onClick={() => apply(decideInstitutionalGate05(workflow, "approve", activeRole), "GATE 05 approuvée localement; aucune sortie physique." )}>Approuver GATE 05</button>
          <button type="button" className="is-refuse" disabled={!workflow.transmissionVerified || activeRole !== "super_admin"} onClick={() => apply(decideInstitutionalGate05(workflow, "refuse", activeRole), "GATE 05 refusée localement.")}>Refuser GATE 05</button>
        </div>
      </section>

      <div className="fom-institutional-audit" aria-label="Journal institutionnel local">
        <div><strong>Journal institutionnel de démonstration</strong><span>Demande {workflow.requestId} · {workflow.events.length} événement(s) · exécution virtuelle {workflow.simulationExecutions}</span></div>
        {workflow.events.slice().reverse().slice(0, 8).map(item => <p key={item.id} className={item.decision === "allow" ? "is-allow" : "is-deny"}>
          <time>{new Date(item.at).toLocaleTimeString("fr-FR", { hour12: false })}</time>
          <code>{item.gate}</code><b>{item.actorRole}</b><span>{item.message}</span><small>sortie physique : non</small>
        </p>)}
      </div>
    </section>
  );
}
