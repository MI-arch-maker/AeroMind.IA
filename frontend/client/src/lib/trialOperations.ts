export type TrialOperation = {
  id: string;
  name: string;
  objective: string;
  safetyGate: string;
};

/** Scénarios d’écran non offensifs : observation, liaison, secours et retour sûr. */
export const trialOperations: TrialOperation[] = [
  { id: "aube-claire", name: "Aube Claire", objective: "Inspection visuelle et retour sûr", safetyGate: "Aucun ciblage ; capteurs uniquement" },
  { id: "sentinelle-verte", name: "Sentinelle Verte", objective: "Observation environnementale", safetyGate: "Zone locale fictive et opérateur validé" },
  { id: "relais-horizon", name: "Relais Horizon", objective: "Maintien d’une liaison de communication", safetyGate: "Aucune commande matérielle" },
  { id: "secours-altitude", name: "Secours Altitude", objective: "Recherche-secours supervisée", safetyGate: "Retour automatique activé" },
  { id: "vent-boreal", name: "Vent Boréal", objective: "Évaluation sous vent simulé", safetyGate: "Essai numérique uniquement" },
  { id: "retour-serein", name: "Retour Serein", objective: "Perte de liaison et procédure de retour", safetyGate: "Atterrissage ou retour configuré" },
  { id: "balise-montagne", name: "Balise Montagne", objective: "Relais et cartographie en terrain complexe", safetyGate: "Géorepérage local obligatoire" },
  { id: "ciel-ouvert", name: "Ciel Ouvert", objective: "Comparaison des architectures", safetyGate: "Aucune charge d’effet" },
  { id: "eclaireur-civil", name: "Éclaireur Civil", objective: "Inspection d’infrastructure sans ciblage", safetyGate: "Revue humaine avant chaque run" },
  { id: "pont-de-secours", name: "Pont de Secours", objective: "Transport simulé de matériel médical", safetyGate: "Charge logistique inerte uniquement" },
];

export const defaultTrialOperation = trialOperations[0];

export function findTrialOperation(id?: string) {
  return trialOperations.find(operation => operation.id === id) ?? defaultTrialOperation;
}
