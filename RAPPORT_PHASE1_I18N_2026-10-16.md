# AeroMind — rapport d’avancement i18n phase 1

**Date :** 16 octobre 2026  
**Statut :** phase 1 amorcée, **non validée / non clôturée**.  
**Périmètre :** fondations partagées, premiers namespaces, gate d’analyse et essai dans l’aperçu.

## Résumé

Le socle technique de traduction par clés a été ajouté sans supprimer l’API historique : namespaces `common`, `home`, `labbench`, `admin`; résolution par `tKey`; messages FR/EN; fallback localisé avec journalisation; helpers de formatage numérique, date et tri; choix initial avant React; persistance locale; mise à jour de `document.lang`; ajout de `X-AeroMind-Language` aux appels `fetch` same-origin.

Un titre namespacé est branché dans le cockpit `/`, le LabBench `/labbench` et la console `/super-admin`. Le changement FR/EN et sa persistance ont été observés dans l’aperçu, ainsi que le titre LabBench en FR et EN. La page Super-Admin répond également, mais les données d’administration ne sont pas accessibles dans cet environnement de prévisualisation.

**Ce branchement est une démonstration de l’architecture, pas la traduction complète de trois écrans.** De nombreux libellés, boutons, états, erreurs, notifications, contenus métier et formats restent en dur ou utilisent encore la traduction DOM historique. Les erreurs backend, flux IA, courriels, jobs et contenus stockés ne sont pas migrés. Aucune validation humaine officielle des traductions n’est enregistrée.

## Modifications livrées

- `frontend/client/src/i18n/` : catalogues de démarrage, resolver, formats et locale des requêtes.
- `LanguageContext.tsx` : ajout de `tKey` en conservant le contrat legacy.
- `index.html` : sélection de la locale enregistrée/navigateur avant le chargement de React.
- Titre namespacé utilisé sur les trois routes représentatives.
- `scripts/check_i18n_catalogs.py` : JSON valide sans clés dupliquées, arbres FR/EN symétriques, limite 150 KiB par catalogue.
- `scripts/lint_i18n_hardcoded.mjs` : analyse JSX/attributs/notifications et rejet de `dangerouslySetInnerHTML`.
- `.github/workflows/i18n-gate.yml` et commandes `pnpm i18n:*`.
- Test unitaire des traductions, fallbacks et fonctions `Intl`.

Voir [la note d’architecture phase 1](docs/I18N_ARCHITECTURE_PHASE1.md) pour les contrats et la procédure de migration.

## Contrôles exécutés

| Contrôle | Résultat |
|---|---|
| Synchronisation des catalogues | Réussi — 10 clés FR/EN appariées; limite de taille respectée |
| TypeScript (`pnpm check`) | Réussi |
| Tests frontend (`pnpm test`) | Réussi — 40 fichiers, 188 tests |
| Build frontend (`pnpm build`) | Réussi — Vite; avertissements de chunks >500 KiB |
| Gate i18n complète (`pnpm i18n:gate`) | **Échoue comme attendu** : 2 775 candidats de texte en dur détectés dans le code existant; aucune allowlist legacy ajoutée |
| Vérification UI dans l’aperçu | Réussi pour les titres namespacés; ne constitue pas une recette de l’écran complet ni une validation linguistique humaine |

La gate CI est donc **active mais rouge** tant que les chaînes détectées n’ont pas été migrées. C’est un bloqueur observable, pas une preuve que les autres routes sont conformes.

## Critères non satisfaits avant clôture

1. Migrer intégralement les libellés interactifs de trois écrans représentatifs, y compris formulaires, validations, erreurs, notifications, états vides et accessibilité.
2. Remplacer la traduction DOM par des clés React explicites; vérifier qu’aucune clé brute ni contenu FR/EN mélangé n’apparaît.
3. Migrer les messages serveur/API et IA ainsi que leurs paramètres/erreurs, puis tester le même parcours en FR et EN.
4. Documenter les états emails/jobs et textes persistés, sans réécrire les données utilisateur.
5. Étendre le typage des clés et la couverture statique/CI jusqu’à réduction à zéro des violations, et réévaluer les éventuels faux positifs du scanner sans créer d’exceptions de dette.
6. Compléter les tests de bascule répétée, de persistance au rechargement, d’en-tête API, de fallback, de nombres/dates, d’écrans à largeur mobile et de premier affichage; obtenir la validation linguistique humaine et en consigner la preuve.

**Décision de sortie :** ne pas démarrer la phase 2 du cahier des charges et ne pas annoncer la conformité globale avant validation de ces critères de phase 1.
