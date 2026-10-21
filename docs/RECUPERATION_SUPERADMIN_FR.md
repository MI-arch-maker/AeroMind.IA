# Récupération de l’accès Super-Admin AeroMind

## Diagnostic

Le code d’AeroMind conserve l’adresse Super-Admin configurée dans `AEROMIND_SUPERADMIN_EMAILS` (adresse d’expérimentation par défaut dans cette version) et peut synthétiser son enregistrement applicatif. Cela **ne crée ni ne restaure une identité Microsoft Entra**. Le callback OIDC n’accorde une session que si Microsoft valide un ID token avec une adresse autorisée. Si le compte Entra a été supprimé, ou si le fournisseur Entra ne le reconnaît plus, la connexion échoue avant que le rôle AeroMind soit appliqué.

La suppression du compte Entra et son éventuelle récupération doivent être vérifiées dans le tenant Microsoft par un administrateur autorisé. Le code de ce dépôt ne permet pas de constater l’état réel du tenant, de Render, de l’environnement de production ou de la base de données.

## Récupération recommandée

1. **Réactiver l’identité Entra** : un administrateur du tenant vérifie si l’utilisateur est supprimé et peut encore être restauré selon les règles Microsoft applicables. À défaut, provisionner une identité d’administrateur de remplacement vérifiée dans le tenant. Vérifier le tenant, les méthodes MFA et l’adresse réellement émise dans les claims Entra (`email`, `preferred_username` ou `upn`).
2. **Autoriser uniquement l’identité vérifiée** : dans l’environnement de déploiement, définir `AEROMIND_SUPERADMIN_EMAILS` avec l’adresse validée. Pour préserver temporairement le responsable actuel et ajouter son remplaçant, séparer les adresses par des virgules. Ne pas attribuer ce rôle à une adresse non vérifiée. Appliquer le redémarrage/redéploiement contrôlé et vérifier `/api/auth/oidc/status` puis une connexion réelle.
3. **Si l’identité Entra ne peut pas être rétablie rapidement**, utiliser le bootstrap local prévu, sans désactiver l’authentification :
   - Générer hors ligne un secret aléatoire d’au moins 32 caractères, par exemple `python -c 'import secrets; print(secrets.token_urlsafe(48))'`.
   - Le transmettre uniquement au gestionnaire de secrets du service, sous `AEROMIND_LOCAL_SUPERADMIN_ENROLLMENT_CODE`; ne pas le committer, l’envoyer par courriel non sécurisé ni le coller dans un ticket.
   - Ouvrir l’interface d’administration `/admin`, choisir le parcours de création d’accès local, saisir l’adresse Super-Admin configurée et le secret de bootstrap. Créer une phrase de passe unique d’au moins 14 caractères et enregistrer la clé TOTP dans une application d’authentification; valider le code à six chiffres.
   - Vérifier `/api/auth/oidc/me` avec la session ainsi obtenue : `authenticated: true` et `role: super_admin` doivent être renvoyés. Tester également une route administrative autorisée.
   - **Retirer immédiatement** `AEROMIND_LOCAL_SUPERADMIN_ENROLLMENT_CODE` du gestionnaire de secrets et redémarrer/redéployer le service. La connexion locale reste protégée par le mot de passe et le TOTP; le secret de bootstrap ne sert qu’à enrôler une fois.
4. Une fois Entra rétabli ou l’identité de remplacement provisionnée, reconnecter l’accès Entra. Révoquer les accès locaux devenus inutiles par la procédure d’administration et mettre à jour `AEROMIND_SUPERADMIN_EMAILS` pour ne laisser que les responsables désignés. Conserver une deuxième identité administrative contrôlée lors de la transmission institutionnelle, selon la politique du Gouvernement.

## Limites et contrôles

- Ne jamais créer une route d’accès sans authentification, modifier manuellement un cookie/session, ou accorder le rôle à une identité dont la maîtrise n’est pas vérifiée.
- Le bootstrap local ne restaure pas un compte Microsoft supprimé; il fournit un accès d’urgence distinct à AeroMind.
- Le code local est unique, à durée limitée dans le flux d’enrôlement (10 minutes pour le bootstrap) et consommé lors de l’activation. Retirer le secret de déploiement après usage.
- Si un compte local existait déjà avec un secret TOTP perdu, le bootstrap de premier compte ne s’applique pas automatiquement. Il faut utiliser le parcours de récupération administré qui correspond à la version déployée, ou restaurer/provisionner une identité Entra autorisée; ne pas supprimer des données de compte directement en base.
- Ce correctif documentaire et l’inspection de l’archive ne modifient pas le tenant Microsoft, la configuration Render ni la base de données de production.
