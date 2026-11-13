# Accès local MFA AeroMind (console administrative)

## Parcours disponible

L’accès Entra reste proposé. En complément, le Super-Admin déjà authentifié peut préparer son propre accès local depuis la console. Pour un premier démarrage totalement indépendant d’Entra, le déploiement peut injecter `AEROMIND_LOCAL_SUPERADMIN_ENROLLMENT_CODE` (secret aléatoire d’au moins 32 caractères) dans son gestionnaire de secrets et le remettre au Super-Admin par canal sûr; le code sert une seule fois et l’enregistrement actif empêche sa réutilisation. Retirer ce secret de l’environnement après le bootstrap. Il peut aussi créer une invitation locale lors de la provision d’un compte. Les comptes préexistants peuvent recevoir une nouvelle invitation via **Réinit. MFA**. L’invitation est aléatoire, affichée une seule fois dans la console, à transmettre par un canal approuvé, expire après 24 heures et ne fonctionne qu’une fois.

L’inscription définit une phrase de passe d’au moins 14 caractères, puis configure une application d’authentification TOTP. Aucun login local ne réussit sans mot de passe et code TOTP valides. L’activation ne se termine qu’après validation d’un code TOTP. Les mots de passe sont stockés par PBKDF2-HMAC-SHA256 (600 000 itérations, sel aléatoire), les secrets TOTP sont chiffrés avec AES-GCM à partir de `AEROMIND_SESSION_SECRET`. Les connexions échouées sont limitées par compte (5 échecs sur 15 minutes) et les événements d’activation, de connexion et de réinitialisation sont journalisés.

Une réinitialisation par un Super-Admin révoque le mot de passe et TOTP précédents; l’accès Entra reste disponible. Le Super-Admin ne peut réinitialiser son accès local qu’après s’être réauthentifié via Entra.

## Déploiement et limites de sécurité

Les champs d’authentification sont conservés dans le JSON du registre SQL existant, donc aucun changement de schéma n’est requis. Le secret de session doit être long, aléatoire, stable et protégé par le gestionnaire de secrets du déploiement. Une rotation de ce secret rend les secrets TOTP actuellement chiffrés illisibles; prévoir une procédure de ré-enrôlement avant rotation. N’exposer les endpoints qu’en HTTPS et transmettre les invitations uniquement par un canal approuvé.

Ce mécanisme est une alternative applicative mot de passe + TOTP; il ne prétend pas être certifié pour un usage gouvernemental et n’offre pas la résistance au phishing d’une clé FIDO2/passkey matérielle, d’une carte à puce ou d’un fournisseur d’identité qualifié. Avant une mise en production gouvernementale, faire réaliser une revue de sécurité indépendante, valider l’atomicité du verrouillage par compte (persisté en base) sous concurrence et ajouter, selon l’architecture, une limitation de débit au niveau du reverse proxy ou d’un service partagé, définir les politiques de récupération et de conservation, et privilégier le MFA résistant au phishing lorsque le cadre l’exige.
