# Livraison — LABBENCH 01 / Fonctionnalités, sous-vues et Step-up

## Corrections majeures

### Mise en page des sous-vues

- Ajout d’une couche de sécurité de layout sur l’ensemble des vues LABBENCH.
- Protection contre les débordements et superpositions de textes dans les panneaux, tableaux, grilles, formulaires, télémétrie, audit et contrôles hardware.
- Reflow responsive des grilles : 2 colonnes sur écran large, 1 colonne sur largeur réduite ; les gates et tableaux conservent leur lisibilité.
- Champs de formulaire, descriptions, états et boutons agrandis et réalignés.

### Onglets et sous-vues

- Les 22 onglets du type `ViewId` ont été contrôlés statiquement.
- Les 22 onglets possèdent une branche de rendu effective.
- Contrôle virtuel confirmé opérationnel : vérification émulateur, télémétrie, confirmations humaines, armement N3, commande virtuelle et arrêt immédiat.
- Les vues Simulation, Flotte, Radar, Carte, Matériaux, Dashboard, Mission, Pré-vol, Graphiques, Historique, Replay, Voix, Collaboration, Maintenance, Hardware, Rapports et Audit disposent de leur rendu dédié.

### Step-up LABBENCH

- Le formulaire indique désormais clairement « Code TOTP à 6 chiffres ».
- Saisie numérique limitée à 6 caractères avec prise en charge des applications d’authentification.
- Ajout d’un panneau d’aide expliquant la double identification : session AeroMind principale puis session LABBENCH temporaire.
- Procédure expliquée : application TOTP, enrôlement depuis la console Super-Admin via « Préparer mon accès local MFA », puis retour dans LABBENCH.
- Contrat API aligné : les assurances `step-up` et `mfa` refusent maintenant les valeurs qui ne sont pas un code numérique de 6 chiffres.

## Validation

- `pnpm run check` : OK.
- `pnpm run build` : OK.
- `py_compile web/labbench_canonical_api.py` : OK.
- Tests ciblés LABBENCH et régressions : OK.
- 22 vues déclarées / 22 vues rendues : OK.
- `/api/ready` : HTTP 200.
- `/labbench` : HTTP 200.
