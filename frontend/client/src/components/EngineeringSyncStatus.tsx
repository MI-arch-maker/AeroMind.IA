import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  ShieldCheck,
} from "lucide-react";
import type { CSSProperties } from "react";
import type {
  EngineeringSyncHealth,
  EngineeringTreeNode,
} from "../lib/engineeringSyncHealth";
import "./engineering-sync-status.css";

function TreeBranch({
  node,
  depth = 0,
}: {
  node: EngineeringTreeNode;
  depth?: number;
}) {
  return (
    <li className={`engineering-tree-node sync-${node.state}`}>
      <span
        className="engineering-tree-entry"
        style={{ "--tree-depth": depth } as CSSProperties}
      >
        <i aria-hidden="true" /> <span>{node.label}</span>
        <small>
          {node.state === "linked"
            ? "LIÉ"
            : node.state === "partial"
              ? "PARTIEL"
              : "EN ATTENTE"}
        </small>
      </span>
      {node.children && (
        <ul>
          {node.children.map((child) => (
            <TreeBranch key={child.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function EngineeringSyncStatus({
  health,
}: {
  health: EngineeringSyncHealth;
}) {
  const blocking = health.issues.filter((issue) => issue.severity === "error");
  const warnings = health.issues.filter(
    (issue) => issue.severity === "warning",
  );
  return (
    <section
      className={`engineering-sync-status sync-${health.status.toLowerCase()}`}
      aria-label="État de synchronisation d’ingénierie"
    >
      <div className="sync-status-head">
        <div className="sync-status-title">
          {health.status === "READY" ? (
            <CheckCircle2 size={16} />
          ) : health.status === "BLOCKED" ? (
            <AlertTriangle size={16} />
          ) : (
            <CircleDashed size={16} />
          )}
          <div>
            <strong>SYNCHRONISATION INGÉNIERIE · {health.status}</strong>
            <small>Révision {health.revision}</small>
          </div>
        </div>
        <span className="sync-security">
          <ShieldCheck size={13} /> N2 · sortie matérielle verrouillée
        </span>
      </div>
      <div className="engineering-tree-wrap">
        <strong className="engineering-tree-title">
          ARBORESCENCE ATELIER · PROJET → CELLULE → CONCEPTION → VÉRIFICATION →
          PREUVES
        </strong>
        <ul
          className="engineering-tree"
          aria-label="Arborescence logique de l’atelier d’ingénierie"
        >
          {health.tree.map((node) => (
            <TreeBranch key={node.id} node={node} />
          ))}
        </ul>
      </div>
      <div className="sync-module-strip">
        {Object.entries(health.modules).map(([module, state]) => (
          <span
            key={module}
            className={`sync-module sync-${state}`}
            title={`${module} : ${state}`}
          >
            <i />
            {module}
          </span>
        ))}
      </div>
      {health.issues.length > 0 && (
        <div className="sync-alerts" role="status">
          {health.issues.slice(0, 3).map((issue) => (
            <div
              key={issue.code}
              className={`sync-alert sync-alert-${issue.severity}`}
            >
              <AlertTriangle size={13} />
              <span>
                <strong>
                  {issue.module} · {issue.code}
                </strong>{" "}
                {issue.message} <em>Solution : {issue.solution}</em>
              </span>
            </div>
          ))}
        </div>
      )}
      {(blocking.length > 0 || warnings.length > 0) && (
        <small className="sync-count">
          {blocking.length} blocage(s) · {warnings.length} avertissement(s) ·
          aucune donnée non vérifiée ne peut être présentée comme validée.
        </small>
      )}
    </section>
  );
}
