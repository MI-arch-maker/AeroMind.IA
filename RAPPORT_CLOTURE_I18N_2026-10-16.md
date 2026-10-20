# Rapport de clôture — Internationalisation AeroMind

**Date :** 16 octobre 2026  
**Verdict : NON CONFORME — corrections ciblées intégrées, audit exhaustif restant nécessaire.**

## Synthèse

Le correctif apporté traite une cause réelle du défaut de basculement des libellés traduits : la traduction DOM modifiait le texte rendu sans conserver sa source française. Une traduction anglaise déjà injectée ne pouvait donc pas être ramenée en français au changement de langue.

La vérification manuelle de l’aperçu a cependant confirmé un problème plus large : de nombreuses chaînes des interfaces restent codées en dur ou hors du catalogue. Plusieurs sections principales s’affichent en anglais alors que l’interface est en français, et des textes français restent présents lorsque l’anglais est sélectionné. **L’objectif d’intégralité linguistique n’est donc pas atteint et la correction ne doit pas être présentée comme terminée.**

## 1. Causes racines confirmées

1. **Traduction DOM non réversible (corrigée).** `translateDom` remplaçait un nœud ou attribut par son équivalent traduit, sans garder une référence au libellé d’origine. Le catalogue est indexé par la chaîne française ; après traduction anglaise, le retour vers le français ne retrouvait pas la clé.
2. **Couverture insuffisante des catalogues et des composants (non corrigée intégralement).** Les catalogues réellement présents comptent **65 clés françaises et 65 clés anglaises**, et non les 144 paires mentionnées dans le cahier des charges. Les tests existants vérifient la symétrie et la complétude de ces 65 entrées, mais ne garantissent pas que tout le texte visible de l’application est répertorié.
3. **Textes d’interface écrits en dur ou non recensés (confirmé par l’aperçu).** Sur la page `/`, en langue anglaise, des textes français tels que « Aucun projet utilisateur », « Créer manuellement » et « Aucune exigence » restent visibles. En français, des textes anglais tels que « Overview », « Mission & requirements », « Airframe library » et « NO BASELINE » restent visibles. Le catalogue exact ne peut pas traduire les chaînes qui n’y figurent pas, notamment les phrases composées et les libellés du contenu initial.

Aucune cause n’est attribuée à des composants tiers sans vérification ; ils ne sont pas inclus dans le périmètre manuel parcouru ci-dessous.

## 2. Fichiers modifiés

- `frontend/client/src/lib/language.ts` — index inverse EN→FR ; mémorisation des sources des nœuds texte et attributs DOM (WeakMap) pour rendre les changements de langue répétables ; prise en charge des attributs visibles et de la valeur des contrôles bouton.
- `frontend/client/src/lib/language.test.ts` — test de régression vérifiant la séquence FR→EN→FR→EN pour une entrée du catalogue.
- `frontend/vite.config.ts` — autorisation de l’hôte de prévisualisation sandbox temporaire.

Aucune fonctionnalité métier n’a été modifiée et aucun test existant n’a été supprimé ou contourné. Les catalogues n’ont pas été artificiellement augmentés.

## 3. Anomalie corrigée et test associé

| Page/composant | Observation | Langue sélectionnée | Comportement attendu | Cause confirmée | Correctif | Test |
|---|---|---|---|---|---|---|
| Toutes les zones traitées par `translateDom` | Après traduction anglaise, un libellé issu d’une clé FR ne retrouvait plus sa traduction française au prochain basculement | EN puis FR | Le libellé doit revenir à sa forme FR sans rechargement | Le DOM ne conservait que le texte anglais traduit | Conservation du texte source par nœud/attribut et index EN→FR | Test unitaire aller-retour ajouté ; contrôles manuels du sélecteur sur l’aperçu |

## 4. Couverture des catalogues

- **FR : 65 clés**
- **EN : 65 clés**
- Les tests de complétude/symétrie sur ces catalogues passent.
- Cette symétrie ne constitue pas une preuve de couverture de l’interface entière. La divergence avec les 144 clés annoncées et les chaînes résiduelles observées bloquent l’acceptation.

## 5. Résultats des tests automatiques

| Validation | Résultat |
|---|---|
| Tests frontend Vitest | **39 fichiers, 185 tests réussis** |
| Contrôle TypeScript (`pnpm check`) | Réussi |
| Build frontend (`pnpm build`) | Réussi ; avertissement non bloquant sur des chunks supérieurs à 500 kB (bundle principal ~3,3 MB) |
| Tests backend (`pytest -q`) | **18 réussis** |

## 6. Vérifications manuelles FR et EN

Effectuées dans le navigateur sur l’aperçu temporaire de l’application, page d’accueil `/` uniquement.

### Français
- Sélection du français sans rechargement : **réussie** pour la sélection et les libellés du catalogue.
- Vérification visuelle de la navigation et du haut de la page : **échec de conformité**, textes anglais résiduels (ex. « Digital Twin Explorer », « SIMULATION », « NO BASELINE »).

### Anglais
- Sélection de l’anglais sans rechargement : **réussie** pour la sélection et les libellés du catalogue.
- Vérification visuelle de la navigation et du haut de la page : **échec de conformité**, textes français résiduels (ex. « Aucun projet utilisateur », « Créer manuellement », « Aucune exigence »).

### Basculement et persistance
- Le sélecteur a été basculé FR→EN et EN→FR sans rechargement sur la page contrôlée ; la navigation traduite par catalogue change de langue.
- Après sélection de l’anglais et rechargement, `document.documentElement.lang`, le sélecteur et `localStorage['aeromind-language']` indiquent tous `en` : **persistance confirmée**.
- Les chaînes hors catalogue restent toutefois dans leur langue source ; les basculements répétés ne satisfont donc pas la cohérence intégrale demandée.

## 7. Parcours réellement vérifiés

- Chargement de `/` dans l’aperçu sandbox.
- Contrôle visuel de la navigation principale, du sélecteur de langue, des états vides et de plusieurs panneaux visibles sur la page d’accueil.
- Basculement de langue sans rechargement et constat des textes résiduels.
- Rechargement avec anglais sélectionné et vérification de la persistance dans le stockage local.
- Vérification HTTP locale et publique de l’aperçu (réponse **200**).

**Non parcourus :** sous-routes `/labbench`, `/admin`, `/super-admin`, onglets secondaires, modales, formulaires complets, états d’erreur/notification déclenchés, vues chargées après interactions métier, et parcours exhaustif de chaque composant legacy. Il n’est donc pas affirmé que ces interfaces ont été vérifiées.

## 8. Exceptions restantes

- Codes techniques (ex. `NO_PROJECT`, `SIM-000`), acronymes, identifiants et numéros de version peuvent rester invariants lorsqu’ils sont effectivement des codes.
- Les libellés et phrases visibles non traduits décrits dans le présent rapport **ne sont pas des exceptions acceptées** : ils constituent des anomalies bloquantes à corriger et à retester individuellement.

## 9. État de déploiement

- Code modifié et compilé dans le projet reçu.
- **Aucun déploiement sur l’environnement de production de l’utilisateur n’a été effectué ni vérifié.**
- Une prévisualisation temporaire du build est démarrée dans le sandbox. Son URL peut expirer avec la session et ne constitue pas un déploiement permanent.

## 10. Preuves reproductibles

1. Ouvrir la prévisualisation : `https://4173-i5evebq43iaqwsg5zey9e-4f7060bc.us4.manus.computer/`.
2. Dans le sélecteur « Interface language », choisir successivement « Français » puis « English » sans recharger. Constater les libellés résiduels listés dans les sections 6.
3. Sélectionner l’anglais, recharger la page, puis vérifier `document.documentElement.lang` et `localStorage.getItem('aeromind-language')` dans la console : les deux valent `en`.
4. Relancer les commandes depuis `frontend/` : `pnpm test`, `pnpm check`, `pnpm build` ; depuis la racine : `python3 -m pytest -q`.

## Suite obligatoire avant conformité

Recenser les chaînes destinées à l’utilisateur sur toutes les pages, états, formulaires et composants accessibles ; convertir les libellés identifiés en appels au mécanisme centralisé et compléter les catalogues FR/EN avec revue ; ajouter des tests de couverture des chaînes utilisées et des tests DOM de basculement ; répéter le parcours manuel complet dans les deux langues, puis valider la version réellement déployée. Jusqu’à ces étapes, le statut reste **NON CONFORME**.
