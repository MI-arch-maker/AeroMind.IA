# Livraison — Correction identité AeroMind / LABBENCH 01

## Correction appliquée

- Suppression de l’identité de démonstration `demo@example.com` et de l’ancien compte de développement `dev@aeromind.local` dans la base de développement au démarrage.
- Réintégration de `mcgregoralvin14@gmail.com` comme identité unique par défaut pour AeroMind, LABBENCH 01 et la console Super-Admin.
- Le parcours `/api/auth/dev-login` utilise désormais l’identité primaire configurée et délivre le rôle `super_admin`, niveau `L4`.
- Réconciliation automatique du compte primaire : statut actif, rôle Super-Admin, accès protégé et niveau L4.
- L’affichage de l’adresse d’essai dans le cockpit principal indique maintenant l’adresse AeroMind/Super-Admin par défaut.
- `auth.me` restitue le nom du compte primaire au lieu de remplacer ce nom par l’adresse brute.
- Aucun remaniement des vues fonctionnelles d’AeroMind ou de LABBENCH 01 n’a été effectué.

## Validation

- TypeScript, catalogue i18n et build Vite : OK.
- Tests ciblés : **27 passés, 1 ignoré**.
- Smoke test connexion : `mcgregoralvin14@gmail.com` / `super_admin` / `L4` : OK.
- Smoke test console `superAdmin.accounts` : OK.
- Base de prévisualisation : compte unique `mcgregoralvin14@gmail.com`, rôle `super_admin` : OK.
- Prévisualisation publique : `/api/ready` et `/labbench` répondent HTTP 200.
