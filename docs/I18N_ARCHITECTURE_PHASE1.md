# Architecture i18n AeroMind — fondations phase 1

**Statut : socle technique mis en place; phase 1 non acceptée tant que sa démonstration et ses gates ne sont pas verts.**

## Source de vérité et namespaces

Les messages structurés de la nouvelle architecture se trouvent dans `frontend/client/src/i18n/locales/{fr,en}.json`. Les namespaces initiaux sont `common`, `home`, `labbench` et `admin`. Ils sont résolus par `resolveMessage(language, "namespace.key")` et exposés dans les composants par `useLanguage().tKey(...)`. Les catalogues plats historiques restent présents pendant la migration afin d’éviter un big-bang non validé; ils sont encore utilisés par l’ancienne API `t(text)` et la traduction DOM transitoire. Ils ne constituent pas le modèle cible.

Le provider global demeure monté à la racine (`App.tsx`). La locale bootstrap est choisie avant le bundle React à partir de la valeur persistée, puis des langues navigateur, avec anglais comme fallback final. `document.documentElement.lang` est initialisé avant le premier rendu React; le provider le maintient ensuite au changement de langue. La préférence est persistée.

## Messages manquants, insertion et formats

`resolveMessage` renvoie un texte fallback traduit pour la locale courante, jamais la clé brute, et journalise/émet un événement de fallback. Les variables sont interpolées comme texte. Les composants doivent rendre le résultat React normalement (jamais via `dangerouslySetInnerHTML`) : React échappe les chaînes insérées. Les helpers `formatNumber`, `formatDate` et `compareLocale` utilisent `Intl` selon FR (`fr-FR`) ou EN (`en-GB`). Leur adoption écran par écran est à réaliser pendant la migration.

## Langue des requêtes

`installLocaleFetch()` ajoute `X-AeroMind-Language: fr|en` à chaque requête fetch same-origin, dont les appels API/TanStack/Turbo liés au frontend. Les serveurs doivent explicitement lire/valider cet en-tête dans une évolution ET-B coordonnée; l’API actuelle infère encore certaines erreurs depuis `Accept-Language`. Les communications sortantes, jobs et conversations IA restent hors du périmètre implémenté à cette étape.

## Contrôles disponibles

- `pnpm i18n:catalogs` : vérifie JSON, doublons, symétrie des arbres de clés et plafond de 150 KiB par catalogue initial.
- `pnpm i18n:lint` : analyse les TS/TSX pour les chaînes candidates visibles et échoue si elle en détecte.
- `pnpm i18n:gate` : exécute les deux contrôles; le workflow GitHub `i18n-gate.yml` l’exécute sur pull requests et sur `main`/`master`.
- `pnpm check` vérifie les catalogues et TypeScript; `pnpm test` exécute Vitest.

La gate source est volontairement stricte et **devrait échouer sur le code legacy non migré** jusqu’à la phase 2. Aucun allowlist/disable de dette legacy n’est ajouté. Le scanner est statique et constitue un contrôle automatisé, pas une preuve sémantique absolue : les références utilisateur doivent tout de même être auditées.

## Portée de la phase 1

Une clé namespacée est branchée sur le titre de chacune des trois routes représentatives `/`, `/labbench` et `/admin`/`/super-admin`, afin d’exercer le même provider et le même sélecteur. **Seul le titre représentatif de chaque surface est migré, pas l’intégralité de ces écrans.** La recette v2 requiert toute la surface sur trois écrans; la migration intégrale de ces surfaces reste un prérequis de sortie et ne peut pas être réputée satisfaite par ces marqueurs.

Les catalogues complets par namespace, l’application d’erreurs côté client, le backend/API et IA, les e-mails/jobs, les contenus stockés, les formats par écran, snapshots visuels, validation humaine FR/EN et preuves du premier paint restent des travaux requis avant acceptation.

## Procédure d’ajout

1. Ajouter la clé dans le même namespace de `fr.json` et `en.json`.
2. Lancer `pnpm i18n:catalogs` puis `pnpm i18n:lint`.
3. Utiliser `tKey("namespace.key")` dans le composant; pour contenu saisi, garder la donnée utilisateur sans la retraduire.
4. Ajouter un test de changement FR↔EN, fallback et rendu sans HTML non assaini.
5. Vérifier le formatage et les vues FR/EN aux tailles supportées; exécuter les tests et captures visuelles.
6. Faire valider les traductions par les personnes désignées, tracer leur date et leur identité dans le dépôt.
