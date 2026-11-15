# Aérodynamique — suppression des données synthétiques

## Périmètre

Modifications limitées à `AerodynamicSimulationCenter.tsx` hors viewport, ses tests, `aerodynamicWorkspace.ts`, ses tests et au nouveau module ciblé `aerodynamicUserData.ts`. Le viewport et `PhysicalDroneModel.tsx` relèvent du travail parallèle : aucune modification de leur logique par cette intervention. Les 14 rubriques, liens de navigation, formulaires et parseurs STL/OBJ/3MF sont conservés. Aucun install ni commit Git lancé.

## Données et actions

Le centre démarre avec une architecture non renseignée, tous les champs numériques vides (`NaN` en mémoire), options physiques et conditions aux limites non renseignées. Même un cockpit entièrement rempli n’est jamais repris automatiquement : son origine n’est pas vérifiable dans ce module. L’action de reprise du cockpit est remplacée par une action explicite pour vider le formulaire, sans effacer les scénarios sauvegardés.

Aucun calcul analytique de portance, traînée, puissance rotor, pression dynamique ou densité n’est effectué ou présenté. Les estimations de cellules, RAM et domaine hypothétique, les créations de runs analytiques, les recommandations dérivées et leurs exports JSON/Markdown/CSV/PDF sont retirés. Les champs ISA sont documentaires : aucune pression de remplacement n’est calculée automatiquement. Les helpers analytiques partagés demeurent disponibles, avec des fixtures exclusivement réservées aux tests.

Les espaces de résultats affichent des états vides explicites. Le lancement CFD et la génération de maillage sont désactivés. Les actions utiles permettent de saisir/enregistrer des conditions, inspecter un fichier, naviguer vers les centres et exporter une préparation documentaire. Ces exports ne contiennent aucun résultat, maillage, convergence ou densité dérivée ; les valeurs numériques manquantes sont `null`. Aucun solveur CFD réel n’est raccordé, ni connexion ou détection réseau inventée. Un manifeste n’est pas un cas OpenFOAM exécutable.

## Persistance et protection des données utilisateur

Les nouveaux scénarios sont créés uniquement depuis le formulaire utilisateur vierge, avec `schemaVersion: 2` et `provenance: aeromind-aerodynamics-explicit-user-input`. Le nom et au moins une entrée ou sélection explicite sont obligatoires. La lecture valide la structure complète, les types, enums, date et identifiants ; elle ne convertit pas les chaînes numériques. Les `null` JSON des champs vides sont restaurés en `NaN`, jamais en zéro. Les zéros réellement saisis restent des zéros. Aucun plafond de 30 scénarios ne supprime silencieusement des entrées utilisateur.

Les anciens scénarios `local-user-scenario` ne prouvent pas si les champs viennent d’une saisie réelle ou des anciens defaults du cockpit. Ils ne sont donc **pas classés synthétiques automatiquement** et ne sont **pas détruits** : avant le remplacement de la liste active, leurs payloads originaux sont conservés sous `aeromind-legacy-user-scenarios-review-v1`. Cette quarantaine est locale, dédupliquée, exclue des vues et exports, mentionnée par un message et dans Settings. Aucun contenu ambigu n’est réintroduit dans le formulaire. L’effacement des scénarios actifs ne supprime pas la quarantaine. Si sa sauvegarde échoue ou son stockage est illisible, la liste active originale n’est pas écrasée.

Seuls les scénarios portant des marqueurs explicites de démonstration/synthèse sont supprimés plutôt que mis en quarantaine. Les noms et valeurs familières ne constituent jamais une preuve de synthèse. Les doublons contradictoires et métadonnées invalides sont aussi conservés pour revue.

L’historique ne purge que les runs legacy explicitement analytiques (`ANALYTIC ESTIMATE`, solveur analytique, identifiant `AERO-EST-` ou classification analytique). Les autres enregistrements sont conservés dans le stockage, sans modification ni export ou présentation comme résultats CFD vérifiés. Ce module ne dispose pas d’un contrat d’ingestion/validation de résultats externes.

## Contrôles

Commande ciblée : `PATH=/home/ubuntu/aeromind-toolchain:$PATH pnpm exec vitest run client/src/lib/aerodynamicWorkspace.test.ts client/src/components/AerodynamicSimulationCenter.test.ts` depuis `frontend`.

**29 tests passent**, dont les tests du viewport existants et les régressions sur le rendu initial sans chiffres du cockpit, les 14 rubriques et parseurs conservés, l’absence de chemins analytiques, les champs vides, la provenance v2, les exports documentaires, la purge limitée d’historique et la quarantaine sans perte de données (y compris panne de stockage).

Le dernier contrôle TypeScript terminé avant les dernières modifications du travail parallèle signalait uniquement deux incompatibilités `number`/`Timeout` dans les temporisations du viewport parallèle (anciennes lignes 510 et 520). Aucun diagnostic dans les nouvelles fonctions de données. La validation finale globale TypeScript/build et les interactions navigateur restent à consolider par l’agent principal après intégration des deux interventions. Aucun navigateur de recette ni build global n’est revendiqué ici.

Contrôle TypeScript final de cette intervention terminé : deux erreurs `TS2322` subsistent dans `AerodynamicSimulationCenter.tsx` aux lignes courantes **512 et 522**, zone viewport gérée en parallèle (`window.setTimeout` renvoie `number`, variable typée `Timeout`). Le contrôle de l’ordre « quarantaine sauvegardée avant écrasement de la clé active » et de la conservation des imports WebGL parallèles passe.

## Résolution après intégration parallèle

Les deux diagnostics transitoires des temporisations WebGL ont été corrigés dans le viewport. La vérification globale `pnpm check` et les **508 tests frontend** ont réussi après intégration ; aucune erreur TypeScript restante. Les résultats définitifs de compilation et de recette navigateur sont consolidés dans le rapport de livraison de cette modernisation.
