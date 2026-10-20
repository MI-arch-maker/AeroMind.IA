# Audit initial i18n — phase 0, cahier des charges v2.0

**Projet inspecté :** archive AeroMind reçue le 16 octobre 2026, puis correctif ciblé de la version précédente.  
**Date de l’audit :** 16 octobre 2026.  
**Statut :** rapport préliminaire remis pour revue du commanditaire ; non validé.  
**Périmètre de la présente inspection :** inventaire du code source et des points d’intégration, sans migration ni nouvelle modification fonctionnelle. Le précédent correctif de réversibilité fait partie de l’état observé.

## 1. Conclusion d’audit

L’application dispose d’un `LanguageProvider` monté à la racine et de catalogues frontend FR/EN, mais son implémentation et sa couverture ne satisfont pas les exigences v2. Les preuves du premier passage confirment des chaînes françaises et anglaises affichées ensemble dans la page d’accueil après sélection de l’une ou l’autre langue. Le mécanisme DOM tente de traduire après le rendu, il existe une fenêtre possible avant `useEffect`, et l’usage explicite du contexte est détecté dans seulement quatre fichiers TSX (contexte inclus). Les principaux composants et pages restent donc hors d’un appel explicite au système centralisé.

Le backend contient deux catalogues d’erreurs de neuf entrées, mais choisit la langue d’après `Accept-Language`, non selon un identifiant transmis explicitement à chaque requête. Les erreurs sont parfois retournées en clair; un handler reformule certains messages. Le prompt du copilote est rédigé en français fixe. Aucun service e-mail ni système de notification transactionnelle ou de file de tâches destinées aux utilisateurs n’a été identifié dans les fichiers inspectés ; cela ne vaut pas preuve d’absence dans des intégrations externes non accessibles.

**La conformité est rejetée en l’état. Aucune ligne de migration n’est entreprise selon le jalon imposé par le cahier des charges : le rapport et le registre doivent d’abord être examinés et approuvés par le commanditaire.**

## 2. Architecture actuelle observée

### Frontend

- Racine : `frontend/client/src/App.tsx` monte `LanguageProvider` autour du routeur.
- État : `frontend/client/src/contexts/LanguageContext.tsx` lit `aeromind-language` dans `localStorage`, puis essaie `navigator.languages`; défaut de repli anglais. Le changement met à jour `document.documentElement.lang`, localStorage et un événement `aeromind-language-changed` dans un `useEffect`.
- Catalogue et utilitaires : `frontend/client/src/lib/fr.json`, `en.json`, `language.ts`.
- Volume observé : **65 clés dans le catalogue FR et 65 dans EN**.
- `translateDom` parcourt les nœuds texte et certains attributs après montage/mutation. Cela n’assure ni couverture exhaustive ni application avant le premier rendu et peut retraduire du contenu métier ou des données utilisateur si ces valeurs coïncident avec une clé.
- Usage de `useLanguage()` trouvé dans `LanguageContext.tsx`, `Home.tsx`, `StudioCommandDeck.tsx`, `VirtualAssemblyWorkshop.tsx` : **4 fichiers TSX** sur le corpus client. Cela démontre que la migration explicite des chaînes n’est pas générale.
- Analyse du code ciblée et rendu visuel confirment des chaînes hardcodées dans des composants tels que `LabBench.tsx`, `FlightOperationsModules.tsx`, `FlightCommandDeck.tsx`, `DesignStudioView.tsx` et d’autres.

### Routes visibles déclarées dans `App.tsx`

- `/` → `Home`
- `/labbench` → `LabBench`
- `/admin` → `SuperAdmin`
- `/super-admin` → `SuperAdmin`
- `/404` → `NotFound`
- route de repli → `NotFound`

Le dossier contient aussi des pages `ComponentShowcase.tsx` et `StrataStudio.tsx` non routées dans ce routeur. Leur éventuelle accessibilité indirecte doit être vérifiée par le commanditaire ou pendant l’inventaire d’exécution.

### Backend / API

- Localisation serveur : `web/i18n.py`, catalogues `web/locales/fr.json` et `en.json` (9 clés chacun).
- `web/app.py` choisit la langue depuis `Accept-Language` dans le gestionnaire HTTP et l’exception générale. Cela ne respecte pas l’exigence d’une langue active transmise explicitement; le handler de l’exception HTTP tente aussi de localiser un message serveur déjà rédigé en clair.
- Plusieurs modules lèvent `HTTPException` avec des messages en texte libre (`web/command_center.py`, `web/workflow.py`, `web/hardware_api.py`, `web/engineering_document.py`, entre autres). Le registre d’erreurs complet reste à bâtir.
- De nombreuses routes sont enregistrées par des routers; l’API de projets, settings, workflow, documents d’ingénierie, commandes, télémétrie, OIDC et extensions est incluse dans le périmètre d’audit, même si ces routes ne sont pas des écrans.

### IA, données, communications et jobs

- `web/copilot.py` envoie un prompt système fixe en français et n’injecte pas de métadonnée de langue explicite; le traitement observé ne couvre pas le streaming.
- Les composants du navigateur appellent le copilote via l’API; la propagation des langues par conversation n’a pas été trouvée dans l’inspection ciblée.
- Les chaînes métier éditoriales sont stockées dans des constantes/catalogues TypeScript en français (ex. bibliothèques d’exigences et de drones); les contenus saisis par les utilisateurs sont aussi présents dans les états et le stockage local. Aucune architecture de contenu éditorial traduit par locale n’a été identifiée.
- Aucun module de courrier transactionnel, notification push, queue de jobs ou worker de messages visibles n’a été trouvé dans la recherche de code ciblée. À confirmer via inventaire des services, tâches d’exploitation et intégrations du déploiement.

### Formats, collation, qualité et observabilité

- Les chaînes inspectées montrent des formats numériques `toFixed`, suffixes SI et valeurs locales sans service de formatage central identifié; les formats de date/heure doivent être inventoriés écran par écran.
- Aucun lint i18n dédié ni gate repérant les textes JSX hardcodés n’a été repéré dans le manifeste du dépôt inspecté.
- Le test frontend `language.test.ts` vérifie la symétrie des catalogues et certaines clés; il ne balaie pas toutes les chaînes des composants ni les écrans.
- Le test backend `tests/test_i18n.py` vérifie la symétrie des 9 clés serveur, quelques choix `Accept-Language` et deux messages.
- Le passage de tests précédent était vert (39 fichiers/185 tests frontend, typage, build, 18 tests backend), mais ces succès ne prouvent pas l’acceptation i18n.
- Aucune journalisation/alerte de fallback de traduction, aucun registre contractuel des écrans et aucune suite visuelle bilingue automatisée n’ont été observés.

## 3. Défauts i18n constatés

| ID | Couche | Constat reproductible/observé | Gravité v2 |
|---|---|---|---|
| A-01 | Interface | Après sélection de l’anglais, des phrases visibles restent en français, notamment « Aucun projet utilisateur », « Créer manuellement » et « Aucune exigence ». | Bloquant : couverture 100 % non respectée |
| A-02 | Interface | En français, plusieurs chaînes anglaises restent visibles, notamment « Mission & requirements », « Airframe library » et « NO BASELINE ». | Bloquant |
| A-03 | Architecture | Seuls 65 couples de clés frontend existent, et seulement 4 fichiers TSX utilisent explicitement `useLanguage`. | Bloquant : couverture et architecture de migration |
| A-04 | Première peinture | L’état global est initialisé par fonction synchrone, mais les effets DOM/lang/localStorage sont exécutés dans `useEffect`; le premier DOM rendu contient des chaînes mixtes. Aucun test anti-FOUT n’existe. | À mesurer, seuil 0 requis |
| A-05 | Reversibilité DOM | Le défaut identifié auparavant : traduction DOM qui remplaçait une source par son rendu. Le correctif précédent ajoute un index inverse et conserve les sources DOM; test aller-retour ajouté. | Correctif présent, portée à éprouver |
| A-06 | Contenu | Une traduction DOM générique peut toucher des chaînes issues du contenu utilisateur ou métier lorsque leur texte recoupe un libellé; séparation UI/contenu non formalisée. | Risque d’intégrité données |
| A-07 | Backend/API | `Accept-Language` décide de la locale serveur; les requêtes frontend n’envoient pas de langue active normalisée vérifiée de bout en bout. | Bloquant |
| A-08 | Erreurs API | Plusieurs réponses exposent du texte libre; codes machine + résolution frontale systématique non établis. | Bloquant |
| A-09 | IA | Prompt système français fixe, sans métadonnée de langue active ni persistance par conversation constatée. | Bloquant |
| A-10 | Email/jobs | Services non retrouvés; couverture non démontrable et inventaire de déploiement manquant. | À déterminer avant toute déclaration de conformité |
| A-11 | Formats | Formatage localisé de dates, nombres, unités et collation non centralisé/démontré. | Bloquant pour les écrans concernés |
| A-12 | Assurance qualité | Pas de lint anti-chaînes, de contrôle arbres de clés en CI, de registre de 100 % des écrans, ni de snapshots bilingues couvrants repérés. | Bloquant |

## 4. Résultats de tests disponibles (état précédent)

- Vitest : 39 fichiers, 185 tests réussis.
- TypeScript : réussi.
- Build frontend : réussi avec avertissement de gros bundles.
- Pytest backend : 18 réussis.

Ces résultats datent de la validation du livrable précédent et ne constituent pas l’exécution d’une recette v2 exhaustive.

## 5. Zones d’incertitude à résoudre pendant la validation du registre

1. Existe-t-il des routes, applications admin, micro-frontends ou pages web externes en dehors du routeur `wouter` inspecté ?
2. Existe-t-il des e-mails transactionnels, push, jobs, webhooks ou automatisations côté fournisseur qui ne se trouvent pas dans ce dépôt ?
3. Quelles API consomment des clients externes et quel en-tête versionné est accepté pour la locale ?
4. Quelles valeurs de données métier sont des données éditoriales à traduire et lesquelles sont saisies par l’utilisateur, à préserver telles quelles ?
5. Qui validera les traductions en français et en anglais et pourra-t-il être identifié dans le dépôt ?
6. Quels formats (unités SI, devise, dates, fuseau, formats réglementaires) sont attendus par métier et par écran ?

## 6. Recommandation de jalon

**Phase 0 : audit préliminaire remis. Phase 1 non commencée.** Le registre des écrans joint est un brouillon contractuel. Le commanditaire doit le compléter/valider, préciser les intégrations hors dépôt et approuver l’audit. La phase suivante ne commence qu’après validation explicite, conformément au processus v2.
