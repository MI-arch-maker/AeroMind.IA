# AeroMind — démonstration commerciale

## Promesse
AeroMind réunit conception paramétrique, jumeau numérique, simulation et gouvernance de validation dans un cockpit unique, avec un mode simulation sécurisé par défaut.

## Parcours de 7 minutes
1. Ouvrir l’accueil et présenter le cockpit d’ingénierie.
2. Montrer le Centre Parametric et le jumeau numérique.
3. Charger une mission d’inspection solaire locale.
4. Exécuter une simulation et afficher les mesures, limites et preuves.
5. Ouvrir le journal d’audit pour montrer la traçabilité.
6. Montrer les portes G0–G5 et expliquer que le matériel reste bloqué en mode virtuel.
7. Conclure sur l’activation OIDC et les secrets administrés par environnement.

## Message de confiance
Aucune identité administrateur n’est incluse dans le code source. Les mutations sensibles exigent une session, un rôle et un jeton CSRF double-submit. Le déploiement de production utilise des migrations explicites et des secrets gérés par la plateforme.
