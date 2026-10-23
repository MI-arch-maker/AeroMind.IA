# AeroMind — intégration FR/EN finalisée

**Date :** 16 octobre 2026  
**Périmètre :** dictionnaires FR/EN, résolution DOM des textes intégrés, gate i18n et prévisualisation temporaire.

## Résultat

- Extraction et traduction bilingue de **2 607 textes distincts** détectés par l’analyse statique.
- Dictionnaires historiques FR/EN enrichis et synchronisés : **5 097 entrées** chacun (clés sources et variantes localisées).
- Catalogues namespacés FR/EN synchronisés : **2 617 clés feuilles** chacun, dans la limite configurée de 150 KiB par catalogue.
- Le résolveur DOM traite désormais les libellés catalogués intégrés à du texte plus long, sans réécrire les unités adjacentes; la recherche utilise un trie mis en cache.
- Le scanner i18n échoue sur tout libellé visible absent des deux dictionnaires. La gate passe sans allowlist. Le style de graphique généré est rendu comme texte React plutôt que via `dangerouslySetInnerHTML`.
- Les fichiers ont été compilés et la prévisualisation temporaire renvoie HTTP 200 en local et publiquement.

## Validations

| Contrôle | Résultat |
|---|---|
| Gate i18n (catalogues + couverture des textes) | Réussie |
| TypeScript | Réussi |
| Vitest frontend | **40 fichiers, 189 tests réussis** |
| Build Vite | Réussi; avertissement non bloquant sur certains chunks > 500 KiB |
| Aperçu HTTP local et public | **200 / 200** |

Les textes ont été générés automatiquement puis intégrés aux deux dictionnaires. Cette livraison ne constitue pas une relecture linguistique humaine officielle. Les tests backend n’ont pas été exécutés : les dépendances Python du projet (dont SQLAlchemy et httpx) ne sont pas installées dans cet environnement; aucun code backend n’a été modifié.

## Principaux fichiers modifiés

- `frontend/client/src/lib/fr.json` et `en.json`
- `frontend/client/src/i18n/locales/fr.json` et `en.json`
- `frontend/client/src/lib/language.ts` et `language.test.ts`
- `scripts/lint_i18n_hardcoded.mjs`
- `frontend/client/src/components/ui/chart.tsx`
- `frontend/vite.config.ts` (autorisation de l’hôte temporaire actuel)
