import { AlertTriangle, ChevronDown, ExternalLink, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useLanguage } from "../contexts/LanguageContext";

type ChecklistItem = {
  title: string;
  detail: string;
};

type ChecklistGroup = {
  title: string;
  items: ChecklistItem[];
};

export function LabPreparationChecklist() {
  const { t } = useLanguage();
  const [reviewedItems, setReviewedItems] = useState<Record<string, boolean>>({});
  const sources = [
    {
      label: t("[1] EASA — Easy Access Rules for Unmanned Aircraft Systems"),
      href: "https://www.easa.europa.eu/en/document-library/easy-access-rules/easy-access-rules-unmanned-aircraft-systems",
    },
    {
      label: t("[2] EASA — Specific Operations Risk Assessment (SORA)"),
      href: "https://www.easa.europa.eu/en/domains/drones-air-mobility/operating-drone/specific-category-civil-drones/specific-operations-risk-assessment-sora",
    },
    {
      label: t("[3] MAVLink — Message Signing"),
      href: "https://mavlink.io/en/guide/message_signing.html",
    },
    {
      label: t("[4] PX4 — MAVLink Security Hardening"),
      href: "https://docs.px4.io/main/en/mavlink/security_hardening",
    },
    {
      label: t("[5] PX4 — Safety Failsafe Configuration"),
      href: "https://docs.px4.io/main/en/config/safety",
    },
    {
      label: t("[6] MAVLink — Mission Protocol"),
      href: "https://mavlink.io/en/services/mission.html",
    },
  ];

  const groups: ChecklistGroup[] = [
    {
      title: t("Operation and regulatory scope"),
      items: [
        {
          title: t("Confirm the country and competent authority"),
          detail: t("Identify the applicable jurisdiction and authority before assessing any operation. [1]"),
        },
        {
          title: t("Confirm the operation category"),
          detail: t("Determine whether the intended operation is Open or Specific; do not infer a category from the aircraft alone. [1]"),
        },
        {
          title: t("Assess SORA applicability"),
          detail: t("For a Specific-category operation not covered by an applicable STS or PDRA, assess whether SORA and the required competent-authority authorization apply. [1] [2]"),
        },
        {
          title: t("Document SAIL, OSOs, mitigations, and adjacent area"),
          detail: t("Where applicable, record the risk assessment, SAIL, operational safety objectives, mitigations, and adjacent-area considerations for review. [2]"),
        },
      ],
    },
    {
      title: t("Aircraft, limits, and people"),
      items: [
        {
          title: t("Identify the exact aircraft, controller, and firmware"),
          detail: t("Record the aircraft model/type, flight controller, firmware version, MAVLink version/dialect, link, and relevant configured sensors and functions."),
        },
        {
          title: t("Confirm operating limits, manual, and remote-pilot competence"),
          detail: t("Review applicable limits, the aircraft and operation documentation, operating procedures, and the competence required of the remote pilot."),
        },
      ],
    },
    {
      title: t("Software-first, hardware-disabled test boundary"),
      items: [
        {
          title: t("Keep output silent and hardware disabled"),
          detail: t("Do not activate hardware control, actuators, serial/network vehicle transports, or MAVLink output during this preparation checklist."),
        },
        {
          title: t("Use deterministic simulation and SITL before any bench proposal"),
          detail: t("Exercise software tests and the agreed firmware/version in simulation or SITL first. Any later hardware bench test is a separate proposal requiring appropriate control, written procedure, and responsible approval."),
        },
        {
          title: t("No hardware test or flight is authorized here"),
          detail: t("This software-only preparation view launches no test and grants no permission to energize equipment, conduct a bench test, or fly."),
        },
      ],
    },
    {
      title: t("Mission, telemetry, acknowledgements, and failsafes"),
      items: [
        {
          title: t("Validate geofence and every mission parameter"),
          detail: t("Require a valid, current, correctly assigned geofence; check every mission point, altitude, units, reference frame, and applicable limits before any separately authorized upload. [6]"),
        },
        {
          title: t("Require fresh position and telemetry, correlated ACKs, and explicit failure states"),
          detail: t("Define freshness limits and expected vehicle identity. Distinguish authorization, transmission, protocol ACK, observed state, and unknown outcome; missing or negative ACKs and timeouts are not success. [6]"),
        },
        {
          title: t("Review link-loss behavior for the exact firmware and aircraft"),
          detail: t("Document and validate link-loss and other failsafe behavior for the selected firmware/vehicle; Hold, Return, Land, Disarm, and termination are distinct and must not be generalized across stacks. [5]"),
        },
      ],
    },
    {
      title: t("Access, secrets, and evidence"),
      items: [
        {
          title: t("Isolate access and protect tokens, signing keys, and logs"),
          detail: t("Check owner/project/aircraft isolation, least-privilege access, token expiry/revocation, secret handling, audit logs, and protected MAVLink/network links. Signing authenticates but does not encrypt traffic. [3] [4]"),
        },
        {
          title: t("Collect traceable evidence and anomalies for independent review"),
          detail: t("Record software/SITL versions, procedures, expected and observed results, ACKs, logs, failures, and anomalies; preserve evidence for the responsible reviewers. A visual checklist mark is not evidence."),
        },
      ],
    },
  ];
  const totalItems = groups.reduce((total, group) => total + group.items.length, 0);
  const reviewedCount = Object.values(reviewedItems).filter(Boolean).length;

  return (
    <section className="lab-preparation-checklist" aria-label={t("Laboratory preparation checklist")}>
      <div className="lab-checklist-safety-banner" role="note">
        <AlertTriangle size={18} aria-hidden="true" />
        <div>
          <strong>{t("Preparation aid only — not EASA approval or certification")}</strong>
          <p>{t("This checklist is software-only; it is not regulatory approval, EASA certification, a conformity finding, or authorization for a bench test or flight. A displayed item is not proof, approval, or a favorable decision.")}</p>
        </div>
      </div>

      <details className="lab-checklist-details">
        <summary>
          <span className="lab-checklist-summary-icon"><ShieldCheck size={17} aria-hidden="true" /></span>
          <span className="lab-checklist-summary-copy">
            <strong>{t("Laboratory preparation checklist")}</strong>
            <small>{t("Review prompts only · no status or approval is inferred")} · {reviewedCount}/{totalItems} {t("repérés dans cette session")}</small>
          </span>
          <ChevronDown className="lab-checklist-chevron" size={17} aria-hidden="true" />
        </summary>

        <p className="lab-checklist-intro">{t("Use these prompts to organize a human review. The checkboxes only mark that you reviewed an item; they do not establish evidence, compliance, or an operational decision.")} {t("Les cases servent uniquement à repérer votre lecture dans cette session; elles ne sont pas enregistrées et ne valent ni preuve, ni approbation, ni autorisation.")}</p>

        <div className="lab-checklist-groups">
          {groups.map((group) => (
            <section className="lab-checklist-group" key={group.title}>
              <h4>{group.title}</h4>
              <ul>
                {group.items.map((item) => (
                  <li key={item.title} className={reviewedItems[item.title] ? "is-reviewed" : undefined}>
                    <input
                      className="lab-checklist-checkbox"
                      type="checkbox"
                      checked={Boolean(reviewedItems[item.title])}
                      aria-label={`${t("Repérer comme lu (session uniquement)")}: ${item.title}`}
                      onChange={(event) => setReviewedItems(current => ({ ...current, [item.title]: event.target.checked }))}
                    />
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="lab-checklist-sources">
          <h4>{t("Official references cited in the integration plan")}</h4>
          <ul>
            {sources.map((source) => (
              <li key={source.href}>
                <a href={source.href} target="_blank" rel="noreferrer">
                  {source.label} <ExternalLink size={12} aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </details>
    </section>
  );
}
