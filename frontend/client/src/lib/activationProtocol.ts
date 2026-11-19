export type ActivationProtocolItem = { id: string; label: string };

export const SIMULATION_ACTIVATION_PROTOCOL: readonly ActivationProtocolItem[] = [
  { id: "defensive-purpose", label: "Je confirme un objectif civil ou défensif, sans usage offensif." },
  { id: "plan-reviewed", label: "J’ai relu le parcours HIL temps réel, les limites et les contrôles prévol." },
  { id: "physical_bridge", label: "Je comprends que cette validation n’autorise aucun vol réel ni commande matérielle." },
  { id: "independent-stop", label: "Je sais qu’un arrêt simulé n’est pas un arrêt d’urgence physique." },
];

export const TELEMETRY_ACTIVATION_PROTOCOL: readonly ActivationProtocolItem[] = [
  { id: "authorized-source", label: "La source de télémétrie est autorisée et a été vérifiée par l’opérateur." },
  { id: "defensive-purpose", label: "La réception est limitée à un objectif civil ou défensif, sans usage offensif." },
  { id: "read-only", label: "Je confirme l’habilitation opérateur pour la télémétrie bidirectionnelle et les commandes MAVLink2." },
  { id: "data-limitations", label: "Je comprends que les données peuvent être périmées ou non vérifiées et ne remplacent pas les instruments de sûreté." },
];

export function areAllProtocolChecksAcknowledged(checks: readonly boolean[]): boolean {
  return checks.length > 0 && checks.every(Boolean);
}
