# Registre des écrans i18n AeroMind — v2.0 (brouillon soumis à validation)

**Statut : BROUILLON — validation du commanditaire requise avant la phase 1.**  
Règle : toute route, vue secondaire, modal, message, état et panneau non listé mais présent dans l’application reste dans le périmètre contractuel.

## A. Routes et écrans déclarés par le routeur

| ID | Route | Page/racine | Vues et contenus recensés / à inclure dans la recette | États et interactions à couvrir | Statut inventaire |
|---|---|---|---|---|---|
| R-01 | `/` | `Home.tsx` | Cockpit / vue générale; navigation latérale; espaces projet; exigences; poste de construction; inspecteur; bibliothèque de drones; Digital Twin; Studio IDDS; équipements; observation/instrumentation; simulation/analyses; LabBench; essais/scénarios; poste de commande; navigation satellite; rapports/revue; commandes sûres; bibliothèques matérielles; centre aéronautique; studio de conception; panneaux d’ingénierie, workflow de prototype, données synchronisées | session fermée/ouverte; aucun projet; données présentes; sélection; validations; succès/erreur; onglets et panneaux secondaires; dialogue de création; toasts; états de simulation; prompts/copilote; chargement et erreur | Partiel — vue intégrée complexe; inventaire interactif complet requis |
| R-02 | `/labbench` | `LabBench.tsx` | Projets; vue preuve; exigences; simulation thermique; matériel/pilotes; banc d’essai; rapports; journal d’audit | données locales/synchronisées; configuration par défaut/chargée/illisible; run; valeurs limites; erreurs; confirmation; toasts | Partiel — sections identifiées dans code |
| R-03 | `/admin` | `SuperAdmin.tsx` | Back-office d’administration | non connecté/autorisé/non autorisé; comptes; états de chargement et erreurs; confirmations et retours d’opérations | À parcourir; accès/session requis |
| R-04 | `/super-admin` | `SuperAdmin.tsx` | Alias du back-office d’administration | mêmes états que R-03; vérifier si contenu et permissions diffèrent | À parcourir |
| R-05 | `/404` | `NotFound.tsx` | Page introuvable | lien de retour/navigation; titre de document; libellés d’accessibilité | À parcourir |
| R-06 | route inconnue | `NotFound.tsx` | Fallback du routeur | chemin inconnu, page et titre de document | À parcourir |

## B. Pages et surfaces non déclarées comme route directe

| ID | Surface | Présence dans le code | Décision à confirmer |
|---|---|---|---|
| U-01 | `ComponentShowcase.tsx` | Page TSX non déclarée dans `App.tsx` | Confirmer si URL/test/dev-only ou incluse dans le produit accessible |
| U-02 | `StrataStudio.tsx` | Page TSX non déclarée dans `App.tsx`; projet contient des assets Strata | Confirmer accès indirect, feature flag ou exclusion justifiée |
| U-03 | `ErrorBoundary.tsx`, skeletons et composants UI partagés | Composants transverses et bibliothèque locale | Inclure erreurs de rendu, chargement, dialogues, menus, calendrier, tooltips, notifications, libellés aria/title/placeholder/alt |
| U-04 | `Toaster` / `sonner` | Infrastructure globale | Inclure tous les messages de toast, descriptions, actions et durée/annonces accessibles |
| U-05 | Titre d’onglet, favicon, méta/description | Document chargé par `index.html` | Lister titre, description, métadonnées et mises à jour dynamiques éventuelles |

## C. Registre des couches non-écran

| ID | Couche | Surfaces identifiées | Recette à ajouter |
|---|---|---|---|
| C-01 | API métier | projets, paramètres, configuration drone, documents, workflow, runs, rapports, simulation CFD/propulsion, commandes | Pour chaque endpoint : code machine, langue transmise, erreurs de validation, champs éditoriaux et tests de contrat |
| C-02 | Authentification/administration | OIDC, session, comptes, rôles, administration | redirections, callbacks, erreurs, messages et attributs accessibles dans les deux langues |
| C-03 | Copilote IA | `/api/copilot/chat` et widget client | langue injectée au prompt et métadonnées; première réponse/stream; messages de service; conversations ouvertes/reprises; contenu utilisateur préservé |
| C-04 | Données métier/éditoriales | catalogues de drones, exigences, scénarios, pièces, matériaux, explications, résultats et rapports | classifier chaque champ comme langue-agnostique, contenu localisé, code ou contenu utilisateur; vérifier stockage et affichage |
| C-05 | Communications | Aucun service email/push retrouvé dans les fichiers inspectés | commanditaire doit déclarer les fournisseurs/intégrations et les modèles; vérifier sujet/corps/boutons/liens/mentions par locale destinataire |
| C-06 | Jobs / webhooks | Aucun worker/message utilisateur retrouvé dans les fichiers inspectés | inventorier tâches d’exploitation, intégrations, webhooks et planificateurs hors dépôt; transmettre la locale du destinataire |
| C-07 | Formats | heures/jours, dates, nombres, devises le cas échéant, unités, recherche et tri | pour chaque écran concerné : exemples reproductibles FR/EN, locale/fuseau, règles métier et snapshots |
| C-08 | Journaux visibles | journal d’audit, télémetrie, événements, rapports, erreurs système | séparer codes internes (stables) et descriptions UI; traduire selon locale active sans modifier historiques ni données utilisateur |

## D. Grille minimale de recette par écran et par langue

À dupliquer pour **chaque ID de A et B** et pour les couches de C :

1. Ouvrir directement la route en français puis en anglais; vérifier avant premier rendu (aucun flash), `document.documentElement.lang`, titre et zéro chaîne brute/mauvaise langue.
2. Parcourir navigation, sous-vues, onglets, menus, modales, formulaires, aide, tooltips, placeholders, toasts et accessibilité.
3. Déclencher états vides, chargement, erreurs de validation, erreurs API, succès, confirmations et données métier lorsque possible.
4. Depuis chaque écran, basculer FR→EN puis EN→FR, sans recharger; mesurer la propagation ≤ 200 ms et contrôler les composants ouverts et les vues récemment visitées.
5. Vérifier les formats de date/heure/nombre/unité et le tri/casse si applicables.
6. Répéter après session fermée/réouverte et rechargement pour contrôler persistance et langue initiale.
7. Pour interfaces IA/API/communication/jobs, vérifier langue transmise et réponse dans la langue du destinataire/utilisateur; préserver les contenus utilisateur.
8. Capturer le rendu FR et EN et comparer débordements, troncatures et mise en page.

**Enregistrement de chaque exécution :** ID écran, URL/état, version/build, langue, étapes, résultats, temps de basculement, chaînes résiduelles, captures, date et validateur. Un seul défaut rejette la recette complète.

## E. Approbation du commanditaire

- ☐ Je valide le rapport d’audit initial phase 0.
- ☐ Je valide le registre ci-dessus comme référence exhaustive, sous réserve des ajouts listés ci-dessous.
- ☐ Les surfaces/services hors dépôt à ajouter sont : ________________________________
- ☐ Les routes, intégrations ou contenus exclus (avec justification) sont : ________________
- ☐ Validateur compétent FR : __________________ ; EN : __________________
- ☐ Règles de format métier (fuseau, unités, nombre, devise, tri) : _____________________
- Date / approbation : __________________________

La migration de code demeure suspendue jusqu’à validation explicite du jalon, conformément au cahier des charges v2.
