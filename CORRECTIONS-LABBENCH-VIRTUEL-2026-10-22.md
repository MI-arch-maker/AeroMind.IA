# AeroMind — LABBENCH 01 et commandes strictement virtuelles

## Périmètre de livraison

Cette version corrige le code de l’archive `AeroMind-AeroLab-itineraire-style.zip`. L’archive originale est conservée intacte. Aucun déploiement distant, compte externe, matériel réel ou base de production n’a été modifié.

## Corrections réalisées

Le pont FastAPI/tRPC de LABBENCH est complété : statut détaillé, exigences, registre, simulation thermique, initialisation du registre et archivage des calculs. Les écritures de preuve sont rattachées au propriétaire du projet et utilisent les tables existantes ; aucune migration supplémentaire n’est nécessaire pour cette correction.

Le laboratoire reste utilisable en mode local lorsque l’API ou l’authentification est indisponible. Les calculs et rapports locaux sont explicitement synthétiques et ne constituent pas des preuves archivées sur le serveur. Les entrées du calcul sont validées, les réponses incomplètes ne provoquent plus de panne du composant et les résultats restent liés aux paramètres réellement exécutés. Les rapports exportent ces entrées, la formule et les limites du modèle. Un changement de projet invalide les résultats et autorisations de session.

Le profil du banc est éditable avec un profil d’émulateur par défaut. Les anciennes listes blanches stockées en tableau sont converties en texte éditable au rechargement. L’indisponibilité du stockage navigateur ne fait plus tomber le formulaire : les données restent en mémoire et peuvent être exportées.

## Utilisation

Ouvrir **LABBENCH 01**, puis **Simulation**, régler les paramètres et lancer le calcul. Le résultat thermique nominal par défaut est **26,12 °C**, avec 12 échantillons synthétiques. Un changement de paramètre invalide le rapport courant jusqu’à un nouveau calcul.

Dans **Banc d’essai**, le diagnostic de l’émulateur est disponible sans matériel. Sélectionner **Commande virtuelle supervisée**, confirmer la consigne exacte puis le périmètre exclusivement virtuel, et appliquer la consigne. Les deux confirmations sont consommées après l’action. **Arrêter l’essai virtuel — un clic** annule la consigne et les confirmations, sans reprise automatique.

Dans **Matériel & pilotes**, le panneau **Contrôle VIRTUAL** distingue la simulation locale du service authentifié. L’activation et l’armement sont deux étapes séparées, chacune exigeant une nouvelle paire de confirmations. Une commande de position ou de cap demande ensuite une confirmation de ses paramètres courants. Le repère est local et synthétique : X/Y entre −500 et 500 m, altitude entre 0 et 120 m et cap entre 0 et 360°. Les coordonnées géographiques ne sont jamais réinterprétées comme coordonnées virtuelles.

Le journal du contrôleur virtuel authentifié est borné et conservé en mémoire serveur ; il n’est pas un journal durable de preuve et peut être perdu au redémarrage ou lors de l’éviction d’une session. Les preuves LABBENCH archivées dans le projet sont distinctes de ces reçus de contrôle. Les reçus du mode local restent dans la session du navigateur.

## Barrière de sécurité préservée

`hardware_control` demeure **false**. Le mode `HARDWARE` est refusé, même si une variable d’environnement liée au matériel est activée. Aucun adaptateur, port série/CAN, actionneur ou transport de commande réel n’est chargé par le contrôle virtuel. L’arrêt ne peut jamais réarmer automatiquement le modèle.

Les deux confirmations de ces panneaux sont des attestations distinctes du même opérateur, et non une validation indépendante par deux personnes. Le workflow existant du centre de commande, avec deux comptes distincts et rôles de supervision, n’est pas modifié.

## Préservation de l’existant

Les fichiers du cockpit principal, du moteur aéronautique, du Mechanical Twin, de l’atelier IDDS, de l’authentification OIDC/locale et du centre de commande restent inchangés. Les catalogues de traduction existants sont conservés et complétés pour les nouvelles commandes virtuelles.

## Exécution du projet

Conserver la configuration et les secrets habituels du déploiement. Installer les dépendances Python de `requirements.txt`, puis lancer depuis la racine :

```bash
cd frontend
pnpm install --frozen-lockfile
pnpm build
cd ..
python -m uvicorn web.app:app --host 0.0.0.0 --port 10000
```

Le gestionnaire est épinglé à `pnpm@10.18.0` dans le projet. Le mode de test utilise une base SQLite temporaire et non les données du déploiement. Le dossier `frontend/dist` est un résultat de compilation ; l’archive source exclut les dépendances installées, les caches et les bases de test.
