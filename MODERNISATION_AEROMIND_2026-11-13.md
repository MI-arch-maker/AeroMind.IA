# Modernisation AeroMind — 13 novembre 2026

## Corrections intégrées

- **Persistance simulation :** le calcul et son identifiant de run sont conservés lorsqu’un enregistrement serveur échoue. L’action « Réessayer » renvoie les mêmes entrées et résultats pour archivage, au lieu de relancer un calcul et de produire un nouveau run.
- **LabBench / N2 :** le libellé de synchronisation présente N2 comme une étape de simulation dans le parcours N1→N4, et non comme un statut de blocage permanent. Les gates métier et contrôles internes restent ceux de l’architecture AeroMind.
- **Simulation et analyses :** les vues du centre de simulation, les paramètres et le moteur de calcul existants sont conservés. Les calculs restent présentés comme synthétiques/indicatifs selon leurs limites déjà documentées.
- **Projections :** les modes de rendu déjà présents dans Mechanical Twin demeurent à la disposition du profil via le sélecteur de rendu (projections, vues techniques et analyses indicatives). Les approximations de secours restent explicitement signalées.
- **Déconnexion :** les commandes de déconnexion déjà présentes côté Cockpit, Admin, Super-Admin et LabBench sont conservées; les handlers concernés invalident l’état de session côté interface après appel du service existant.

## Frontière de responsabilité

L’arborescence indépendante ICX/AeroMind, les rôles, la gouvernance et les doubles contrôles ne sont ni remplacés ni redéfinis. Aucun changement n’active une sortie matérielle. La Preview demeure en simulation-only (`AEROMIND_VIRTUAL_ONLY=true`, `HARDWARE_CONTROL=false`) ; un déploiement externe relève des procédures de l’entreprise.
