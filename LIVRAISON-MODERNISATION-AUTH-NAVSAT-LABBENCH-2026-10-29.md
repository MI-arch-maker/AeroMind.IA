# Livraison — modernisation Aeromind.IA

**Date :** 29 octobre 2026  
**Périmètre :** archive fournie `AeroMind_modernisation_auth_espace_2026-10-29.tar.gz`.

## Réalisations

1. **Navigation satellite en HTTPS** — les URLs de fonds cartographiques standards sont HTTPS; les modèles de tuiles personnalisés HTTP ne sont plus activés sur une page HTTPS afin d’éviter le blocage de contenu mixte. Les échecs de chargement d’une même tuile ne sont comptabilisés qu’une fois, pour éviter de déclencher prématurément les fonds de repli ou un faux état d’erreur.
2. **Connexion MFA dans l’application** — l’accueil propose maintenant deux modes visibles, « Microsoft Entra » et « Connexion MFA ». Le mode MFA accepte e-mail, mot de passe et code TOTP à six chiffres via le endpoint local sécurisé existant (`/api/auth/local/login`), avec erreurs accessibles et rafraîchissement de session après réussite. Le flux d’activation MFA administré reste inchangé.
3. **LABBENCH 01** — l’identité AeroMind / LABBENCH, l’action Entra et le champ Step-up TOTP bénéficient d’une hiérarchie visuelle renforcée, d’états lisibles et d’une mise en page responsive. La logique d’autorisation et les gates LABBENCH ne sont pas modifiés.

## Vérifications

- `pnpm check` : réussi (catalogues i18n synchronisés, 2 617 clés; TypeScript sans erreur).
- `pnpm test` : réussi (56 fichiers, 281 tests).
- `pnpm build` : réussi. Vite signale des bundles volumineux, avertissement préexistant lié à la taille; la compilation aboutit.
- Tests Python ciblés : non exécutés, car `pytest` n’est pas installé dans l’environnement de livraison. Aucune modification backend n’a été nécessaire.

## Limite de déploiement

Cette livraison modifie et vérifie le code contenu dans l’archive source fournie. Aucun accès de déploiement à un hébergeur ni identifiant de publication n’a été fourni dans cette session; le code n’a donc pas été poussé vers Render ou un autre environnement hébergé. Il faut publier cette version dans le dépôt/environnement de déploiement du projet pour qu’elle devienne visible sur son URL HTTPS de production.
