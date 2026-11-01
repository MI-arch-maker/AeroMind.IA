# Suivi d’exécution — Centre Parametric V2 révisé

Référence : backlog CPV2-001 à CPV2-041 et audits transmis par l’utilisateur. Le `TODO.md` historique du projet source est conservé intact; les clauses de cette livraison sont ajoutées à sa suite. Cette feuille reflète l’état livré dans la copie modernisée.

## 1. Contrats Mechanical Twin, snapshots et migrations — TERMINÉ

**Tickets : CPV2-001, 004–007.** Le workspace utilise un schéma Zod versionné couvrant les propriétés mécaniques/paramétriques consommées par l’atelier, avec contrôles de nombres finis, tailles, indices de maillage, définitions de variable, esquisses, débattements et modifications de pièces. Les migrations lisent les versions historiques prises en charge; une entrée incorrecte est rejetée au lieu d’être remplacée silencieusement par un workspace vide. La sortie physique reste désactivée.

**Preuve :** `projectSyncStore.test.ts` — 14 tests; suite frontend complète réussie.

## 2. Sauvegarde explicite et vérité des accusés — TERMINÉ

**Tickets : CPV2-008, 009, 037, 041.** « Valider » appelle le stockage/synchronisation workspace réellement disponible, et non une simulation. L’interface sépare le brouillon/prévisualisation locale de l’accusé serveur; un statut positif n’est affiché qu’après acquittement. Les erreurs sont visibles et un projet absent n’est pas créé implicitement. Pas de fusion multi-utilisateur ni de révision atomique compare-and-swap revendiquée.

**Preuve :** tests TypeScript, Vitest, `pnpm run check` et build; API Preview SQLite prête.

## 3. Isolation des designs/pièces et réinitialisation — TERMINÉ

**Tickets : CPV2-010, 011, 012, 019, 038.** Les actions utilisent l’ID stable de la pièce sélectionnée, isolent matériau et modifications du design actif et persistent les valeurs de débattement. La réinitialisation des features restaure les pièces sources/leur visibilité préalable; une confirmation annonce sa portée et l’action reste annulable. Les snapshots conservent `physicalOutputEnabled=false`.

**Preuve :** tests ciblés du store et du modèle mécanique; sélection/arbre/inspecteur raccordés au même ID.

## 4. Variables, dépendances et réversibilité — TERMINÉ AVEC LIMITES

**Tickets : CPV2-014–018.** Le Centre crée, duplique, modifie et supprime des définitions sauvegardées sous le Mechanical Twin du design actif; plages, types, unités, valeurs non finies, cycles et expressions sont contrôlés. L’évaluateur accepte seulement l’arithmétique sûre et des références de variable explicites, sans `eval`. L’historique permet de revenir sur les modifications paramétriques supportées.

**Limite :** pas de sketcher contraint ni de solveur général de contraintes dimensionnelles.

**Preuve :** `parametricStudioModel.test.ts` — 7 tests.

## 5. Esquisses, opérations de maillage et CSG — PARTIEL, LIMITES EXPLICITES

**Tickets : CPV2-003, 023–027, 032, 033, 039, 040.** Les profils pris en charge génèrent des opérations simplifiées annoncées comme telles; les booléens et transformations réutilisent le moteur de géométrie en place. Les traitements d’arête sans calcul exact restent indisponibles et n’altèrent pas le maillage source. Les opérations refusées ne sont pas présentées comme des succès.

**Limite :** géométrie triangulée/procédurale, pas de noyau B-Rep industriel; pas de garantie de topologie STEP, tolérances, rayons de congé ni validation physique. Résultats de CSG limités aux capacités et tests du moteur fourni.

**Preuve :** `parametricFeatureOperations.test.ts` — 8 tests; `mechanicalTwinGeometry.test.ts` — 12 tests.

## 6. Part Studio, Variable Studio, Assemblage et inspection — TERMINÉ

**Tickets : CPV2-020, 031.** Les trois vues sont distinctes : géométrie/pièces, édition des variables, puis composants/transforms connus. Arbre, sélection, inspecteur et viewport utilisent le design courant; les limites d’un assemblage sans solveur sont annoncées. Les libellés et descriptions nouveaux ont leurs entrées FR/EN et utilisent `t()`.

## 7. Import/export — TERMINÉ POUR LES FORMATS EFFECTIVEMENT SUPPORTÉS

**Tickets : CPV2-021, 022, 035, 036.** Variables exportables en CSV et snapshot JSON versionné, avec validation d’import; géométries OBJ/STL existantes conservées. Les unités et limites du contenu exporté sont indiquées.

**Limite :** STEP, IGES, DXF et plans ne sont pas revendiqués/proposés sans encodeur géométrique vérifié.

## 8. Métriques et confiance des résultats — TERMINÉ

**Tickets : CPV2-028–030, 034.** Les densités affichées sont des références. Les surfaces, allongements et masses empiriques sont étiquetés « proxy »; centre de gravité, inertie et coefficients non calculés sont explicitement indiqués comme tels. Aucun CFD/FEA, essai réel, masse certifiée ou qualification industrielle n’est revendiqué.

## 9. Intégration, tests et livraison — LIVRÉ, LIMITES DOCUMENTÉES

**Tickets : CPV2-002, 013, 037.** La coque AeroMind et les autres modules sont préservés; accès direct `/?view=parametric-center` vérifié. Vite écoute le port Preview 3000 et relaye `/api` à FastAPI sur le port interne 8000, avec une base SQLite locale isolée. `/api/health`, `/api/ready`, `/api/hardware/status` et `/manus-routes.json` répondent en HTTP 200; le manifeste contient 28 routes. Le statut observé est `virtualOnly=true`, `hardwareControlEnabled=false`, `physicalOutputEnabled=false`, `physicalCommandsEmitted=false`.

**Validation frontend :** `pnpm run check` réussi; Vitest `75` fichiers et `363` tests réussis; build Vite réussi. Le build conserve des avertissements de taille de bundles historiques (entrée principale environ 3,66 Mo et vendor-markdown environ 3,84 Mo minifiés); le découpage de code reste une amélioration de performance distincte.

**Validation backend :** `.venv/bin/python -m pytest -q` réussi : `293 passed, 14 skipped, 3 warnings`; aucun échec. Les tests PostgreSQL réels ne sont pas exécutés ici parce que le paquet `pgserver>=0.5.0` n’était pas disponible sur l’index de cet environnement.

**Smoke test visuel :** captures Preview prises pour la racine, le Centre Parametric, `mission-center`, LabBench et les alias `/labbench` et `/engineering-hub`; le navigateur confirme la coque AeroMind, l’état de workspace vide sans données inventées et l’indication `N1 VIRTUAL ONLY — aucune liaison matérielle`.

**Livraison :** archive source à créer; pas de `.env`, `.venv`, `node_modules`, base SQLite, `dist` ou `.git`; Preview active; aucun déploiement en production ni migration de base externe.
