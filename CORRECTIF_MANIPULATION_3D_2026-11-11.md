# Correctif — Manipulation 3D du Centre Mécanique

Date : 11 novembre 2026

## Fonctionnalités intégrées

Le Centre Mécanique permet désormais de sélectionner une pièce du jumeau et d’activer **Déplacer**. Avec WebGL disponible, les axes du manipulateur déplacent la pièce en 3D; quand le navigateur utilise le rendu vectoriel de secours, un glisser direct de la pièce la déplace dans le plan caméra. Les translations sont converties en XYZ et conservées dans `MechanicalPartEdit.offset` du design actif. Les coordonnées X, Y et Z peuvent aussi être saisies dans l’inspecteur pour un positionnement précis.

Les commandes de vue comprennent **Isométrique**, **Dessus**, **Face** et **Côté**, le retour à la vue initiale et les modes de rendu technique existants. La vue éclatée disperse les sous-ensembles radialement à l’aide d’un curseur continu; le châssis reste le repère fixe et un bouton réassemble le drone. Le déplacement est bloqué en vue éclatée et en lecture seule.

Les pièces manuelles du dossier qui n’ont pas de maillage 3D restent documentaires et ne sont pas présentées comme manipulables. Aucun matériel de vol ou équipement réel n’est commandé par ces opérations.

## Utilisation

1. Choisir un drone dans **Airframe library**, puis ouvrir **Centre Mécanique**.
2. Sélectionner une pièce dans l’arbre ou le viewport; activer **Déplacer**.
3. Glisser les axes (WebGL) ou la pièce (fallback vectoriel). Pour un déplacement exact, modifier X/Y/Z dans l’inspecteur.
4. Choisir une vue caméra ou utiliser **Vue éclatée** et **Dispersion**, puis **Réinitialiser** pour réassembler.

La géométrie du concept reste indicative et soumise à une revue d’ingénierie humaine.

## Vérifications

- `pnpm exec tsc --noEmit` : réussi.
- Vitest ciblé : 2 fichiers, 16 tests réussis (géométrie Mechanical Twin et dock d’intégration).
- `pnpm run build` : réussi. Vite signale les gros chunks JS existants ainsi qu’un script de config non-bundleable, sans faire échouer la compilation.
- Chromium en mode sans WebGL : glisser réel de `wing-main-port` testé; coordonnées inspecteur passées de `[0, 0, 0]` à `[0.156, -0.147, 0.05]`, aucune erreur JavaScript de page.
- Capture : `CAPTURE_MANIPULATION_3D_CORRIGE.png`.

## Aperçu et authentification

La preview locale de développement sert le build actualisé. L’authentification Microsoft Entra/OIDC n’étant pas configurée dans cet environnement, l’ouverture de session distante et la sauvegarde liée à un compte ne sont pas démontrées ici; le test a vérifié l’état local du concept.
