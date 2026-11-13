# AeroMind — livraison de modernisation du cahier des charges

## 1. Cellule/drone automatique

La connexion et le démarrage ne créent pas de projet métier, et la création explicite d’un nouveau projet ne crée désormais aucune entité `Drone`, aucune cellule active et aucune architecture quadrirotor implicite. La cellule n’existe qu’à la suite d’une action explicite de conception/sélection. La configuration conserve les seules valeurs transmises par l’utilisateur.

## 2. Espaces de travail isolés

Les projets métier restent attribués à l’identité stable du compte et les lectures/écritures de projet sont filtrées par propriétaire dans les API. Les brouillons anonymes utilisent une clé opaque distincte par navigateur, persistée avec expiration. Le cockpit authentifié ne réhydrate pas un brouillon anonyme comme projet métier. La nouvelle console admin ne révèle que les agrégats de l’espace de l’administrateur connecté.

Le test d’isolation multi-utilisateur préexistant demeure ignoré parce que son harness TestClient ne résout pas le jeton du deuxième utilisateur; l’isolation applicative demeure testée par les filtres d’ownership et les autres tests fonctionnels, mais ce test end-to-end particulier demande un harness adapté.

## 3. Console administrateur réservée

La navigation n’affiche l’entrée de console qu’aux rôles `admin` et `super_admin`. Les administrateurs disposent d’une nouvelle console restreinte `/admin-console`, dont l’API vérifie le rôle et ne donne aucun accès à la gestion globale des comptes. Le super-admin conserve sa console existante `/super-admin`; ses endpoints privilégiés n’ont pas été ouverts aux rôles admin.

## 4. Connexion depuis la console sans connexion automatique au cockpit

La connexion Entra lancée explicitement depuis `/admin-console` suit un état OIDC signé spécifique, revient à la console, n’inscrit aucun jeton dans l’URL et émet `aeromind_admin_session` limité au chemin `/api/admin-console`. La connexion MFA locale accepte aussi le mode console explicite et émet le même cookie dédié pour les rôles admin/super-admin. L’API console ignore les cookies et en-têtes de session du cockpit. Une déconnexion dédiée révoque la session console. Le parcours OIDC normal et les connexions locales existantes restent inchangés.

## 5. SaaS privé sans abonnement ni prélèvement

Aucun flux de paiement, prélèvement, abonnement ou facturation n’est présent dans les services de production du paquet. Le registre de comptes préexistants, l’allowlist d’accès, les demandes d’inscription soumises à approbation et le tenant Entra contrôlé fournissent déjà un socle de gouvernance privée. La console affiche explicitement le mode privé sans facturation. Cette livraison modifie le code applicatif; elle ne provisionne pas un domaine, un tenant Entra, une base gérée, des secrets de production ou une infrastructure d’hébergement privée.

## 6. LLM, SSO et gouvernance

Le handler `ai.chat` consommé par le cockpit était absent du bridge tRPC. Il est maintenant raccordé au service LLM OpenAI-compatible configuré; le statut renvoie aussi `providerConfigured`, attendu par le front. Le service borne l’historique, la taille des messages/contexte et la réponse, ne prend pas de message système fourni par le client, traite le contexte projet comme données non fiables, gère les erreurs fournisseur et rappelle l’absence d’autorité de commande matérielle ou de décision G01–G05. Aucun chat n’est archivé automatiquement. Les flux Entra imposent déjà une configuration tenant unique, une validation de claims/nonce/audience, un compte préautorisé et une liaison identité/tenant; le MFA local et les révocations restent supportés.

## Vérifications

- Suite complète backend avec l’environnement super-admin de test requis: **315 réussis, 14 ignorés**, 3 avertissements de dépréciation/collecte.
- `pnpm check` : réussi.
- `pnpm build` : réussi; avertissement non bloquant sur les gros chunks et le script runtime non-module préexistant.
- `python -m compileall` sur les modules modifiés : réussi.
- Aucun schéma de base n’a été migré et aucun déploiement en production n’a été effectué. Les identifiants et secrets de production ne sont pas disponibles dans cette copie; une validation de démarrage/déploiement avec les valeurs réelles reste nécessaire.
