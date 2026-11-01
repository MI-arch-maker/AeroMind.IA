# AEROMIND — Audit gouvernance, permissions applicatives et contrôle matériel

**Date :** 1 novembre 2026  
**Périmètre :** correspondance entre rôles documentés, rôles d’application, approbations G0–G5, activation du mode matériel, autorisation et transmission MAVLink.  
**Statut :** audit ciblé en lecture seule; aucune modification de code/configuration, aucun test, aucune connexion télémétrique/MAVLink et aucune commande physique dans cette phase. Les anomalies N3, G0–G5 fail-closed et séparation `COMMAND_LONG`/mission déjà corrigées ne sont pas re-testées ici.

## 1. Conclusion exécutive

**La preview vérifiée précédemment reste verrouillée en simulation** (`AEROMIND_VIRTUAL_ONLY=true`, `HARDWARE_CONTROL=false`). Ce verrou de runtime n’a pas été modifié.

**Le dépôt, lui, n’est pas entièrement privé de capacité matérielle.** Il contient une voie MAVLink conditionnelle distincte de l’API `/api/control`, qui reste définitivement virtuelle. Si un runtime non virtuel est configuré, les commandes physiques peuvent parvenir au pilote sous plusieurs conditions. L’activation du mode est également pilotable par une route Super-Administrateur. Le présent audit n’a ni activé ni testé cette voie.

Les documents Aeromind décrivent une hiérarchie fonctionnelle pour les gates — Admin, Responsable sécurité, Tech lead, Responsable banc, Direction — et une séparation opérateur/approbateur. Le code la représente seulement en partie : les six rôles techniques sont globaux au compte; `super_admin` reçoit automatiquement tous ces rôles lors du step-up; et la route d’approbation G0–G5 accepte un rôle générique `approver` ou `admin`, au lieu de vérifier le responsable prévu pour chaque gate. Le rôle de l’acteur et l’élément de preuve sont parfois fournis via des champs de requête, et non tous établis par le serveur.

**Décision principale :** ne pas retirer le verrou virtuel ni modifier les rôles à l’aveugle. Il faut d’abord traduire la hiérarchie Aeromind existante dans une matrice explicite *personne/identité → rôle institutionnel → projet → gate/action → preuve requise*. Le rapport ci-dessous indique les écarts précis et les corrections minimales à soumettre ensuite à validation.

## 2. Ce que disent les documents Aeromind

Le [manuel opérateur](docs/MANUEL-OPERATEUR-FR.md:139) prévoit, avant le mode matériel : `HARDWARE_CONTROL=true`, les gates G0–G5, un drone enregistré, une géofence valide, un opérateur avec step-up, un approbateur distinct avec step-up, un jeton à usage unique puis sa consommation. Le même manuel attribue les validations suivantes (`:172–184`) :

| Porte | Responsable documenté |
|---|---|
| G0 — Gel | Admin |
| G1 — Sécurité | Responsable sécurité |
| G2 — Fiabilité | Tech lead |
| G3 — Banc protégé | Responsable banc |
| G4 — Qualification | Responsable sécurité |
| G5 — Exploitation | Direction |

La matrice de conformité (`docs/MATRICE-CONFORMITE-FR.md:238–249`) décrit six rôles RBAC, l’opérateur distinct de l’approbateur, des gates G0–G5 et une séquence simulation → banc → exploitation. Elle indique cependant explicitement G3, G4 et G5 « à compléter » (`:255–260`) et un watchdog physique à compléter (`:246`). Ces mentions sont l’état documentaire du projet, **pas une preuve d’acceptation opérationnelle**.

Aucun document fourni dans le dépôt ne relie de façon vérifiable les titulaires réels des postes institutionnels aux identités OIDC et aux permissions du logiciel. Le code est donc comparé ici à la hiérarchie de rôles documentée, sans se substituer à la gouvernance d’Aeromind ni décider qui doit occuper ces fonctions.

## 3. Modèle de permissions observé dans le code

`web/labbench_auth.py:50–79` définit six rôles d’application : `reader`, `designer`, `analyst`, `operator`, `approver`, `admin`. Les permissions d’opérateur et d’approbateur sont distinctes; `admin` peut gérer `gate.manage`.

`web/labbench_canonical_api.py:203–239` dérive le rôle du compte côté serveur au lieu d’accepter librement celui demandé par le client — correction importante conservée. Toutefois, si le rôle primaire vaut `super_admin`, le code remplace l’ensemble par **tous** les six rôles (`:213–215`). Un Super-Administrateur peut donc obtenir une session step-up de portée `operator`, `approver` et `admin`. La revue N4 distincte interdit bien que le même `user_id` soit opérateur et reviewer pour cette revue (`web/hardware_gate.py:238–255`), mais l’héritage automatique n’est pas limité par projet ou par fonction institutionnelle.

Les comptes d’administration utilisent un rôle unique au niveau compte; l’audit n’a pas trouvé, dans le chemin de step-up/G0–G5 examiné, de source d’adhésion projet qui attribuerait séparément les responsabilités G1/G2/G3/G4/G5 à des titulaires nommés. La portée du step-up est bien liée à un `project_id`, mais son rôle est dérivé de l’enregistrement global du compte (`web/labbench_canonical_api.py:189–239`). Les vérifications de propriété/projet demeurent utiles, sans remplacer une attribution institutionnelle par projet.

L’adresse du Super-Administrateur est dérivée de la configuration et le compte primaire est réconcilié comme actif et protégé au démarrage (`web/admin.py:100–120, 138–163`; voir aussi `.env.example:22–27`). Cela fournit un mécanisme logiciel d’identification/amorçage; ce n’est pas, à lui seul, une nomination institutionnelle signée, un rôle limité au projet ni une preuve de séparation des fonctions. Le rapport ne propose pas de remplacer ou de révoquer l’identité existante.

## 4. Verrous matériels : origine, portée et limites

| Restriction | Origine et justification dans le dépôt | Portée effective |
|---|---|---|
| `AEROMIND_VIRTUAL_ONLY=true` | Drapeau strict de runtime, conçu pour fermer la voie matérielle en mode virtuel (`web/mavlink_command_api.py:78–103`). La preview précédente a été explicitement configurée ainsi. | Refuse les opérations matérielles mutatives et rend `hardware_commands_enabled()` faux; les routes de statut/lecture peuvent rester accessibles. C’est le verrou principal de la preview; il n’a pas été changé. |
| `HARDWARE_CONTROL=false` | Valeur par défaut de `.env.example:34–47`; la fonction de commande exige la valeur littérale `true` et refuse sinon (`web/mavlink_command_api.py:83–103, 149–155`). | Bloque l’émission même si un utilisateur dispose d’un jeton. Ce flag est un verrou de déploiement, pas une preuve d’autorisation institutionnelle. |
| G0–G5 + N3/N4 + projet/drone + token + géofence | `web/hardware_gate.py:359–435` exige N3 virtuel, revue hardware, drone au pool, les six gates approuvées, un reviewer distinct et un jeton signé/expirant; le pilote vérifie ensuite contexte, allowlist, token, géofence et mode (`web/mavlink_command_api.py:106–161`). | Barrières supplémentaires avant une commande; elles ne peuvent pas compenser une mauvaise attribution des rôles ou une preuve de gate non validée. |
| API de contrôle virtuel `/api/control/*` | `web/hardware_api.py` garde `feature_enabled()` à `False` et refuse `HARDWARE` par conception (sections citées dans l’audit précédent). | C’est un verrou propre au panneau de jumeau virtuel. **Il ne désactive pas à lui seul** le pilote MAVLink distinct dans `web/app.py`. Ne pas convertir ce panneau en contrôle physique sans une API/UI séparée et une revue dédiée. |
| Diffusion globale d’urgence | `/api/hardware/emergency-stop` retourne `TARGET_CONTEXT_REQUIRED` et refuse le broadcast (`web/app.py:1919–1926`). | Garde-fou conservateur : l’action doit être ciblée. Le manuel affirme encore qu’un e-stop envoie `NAV_LAND` à tous les drones (`docs/MANUEL-OPERATEUR-FR.md:132–137`) — documentation en contradiction. `NAV_LAND` n’est pas une coupure moteur garantie. |

La commande normale ne consomme le token qu’après vérifications et avant le transport (`web/mavlink_command_api.py:396–424`). Le téléversement mission suit un chemin dédié, exige `hardware_commands_enabled()` avant l’accès au pool et attend un ACK MAVLink de mission (`web/mission_planner.py:285–308, 435–472`). L’enregistrement du pool construit des objets pilotes/observateurs mais n’ouvre pas lui-même la liaison (`web/mavlink_pool.py:132–152`; constructeurs paresseux dans `mavlink_command_api.py:314–343` et `mavlink_observer.py:66–121`). Un polling télémétrique ultérieur peut ouvrir une liaison **en réception seule**, sans envoyer de commande; ce n’est pas l’état de la preview verrouillée.

## 5. Écarts nécessitant une correction avant toute future voie matérielle

### P1 — La décision de mode HARDWARE n’exige pas de step-up

`POST /api/ops/mode` exige une session authentifiée et le rôle `super_admin`, puis vérifie que les six lignes G0–G5 sont à l’état `approved` avant d’écrire `HARDWARE_CONTROL=true` dans l’environnement du processus (`web/ops_control_api.py:105–131`). **Cette route ne vérifie pas de session step-up ni de preuve MFA fraîche.** Elle ne transmet pas elle-même de commande; elle peut cependant ouvrir le drapeau global si l’environnement n’est pas `VIRTUAL_ONLY`.

Le changement n’est partagé qu’au worker courant; le code avertit que plusieurs workers ne sont pas synchronisés (`:128–137`). Il s’agit d’un défaut de cohérence de déploiement en plus d’un défaut de contrôle d’activation. Dans la preview précédente, `VIRTUAL_ONLY=true` bloquait ce chemin.

**Proposition :** garder le changement de mode humain et explicite, mais le lier à une autorisation d’activation signée, ré-authentifiée, bornée à un projet/aéronef/environnement et appliquée par une source de vérité partagée. Le niveau d’approbation requis doit être celui défini par Aeromind; ne pas supposer que le rôle global Super-Admin suffit.

### P1 — G0–G5 n’appliquent pas la responsabilité propre à chaque gate

`POST /api/lab/gates/{project_id}/{gate}/approve` accepte un step-up avec rôle générique `approver` **ou** `admin` pour n’importe laquelle des six gates (`web/labbench_canonical_api.py:785–802`). Le code ne vérifie pas que G1/G4 est approuvée par le Responsable sécurité, G2 par le Tech lead, G3 par le Responsable banc, ou G5 par la Direction comme le prescrit le manuel.

La preuve est un dictionnaire libre enregistré en JSON (`:803–835`); le code ne valide pas un schéma d’évidence propre à chaque gate. Un état `approved` est ensuite utilisé par les contrôles du mode et du token (`web/ops_control_api.py:63–75`; `web/hardware_gate.py:403–409`). La donnée `operator_id` censée assurer IAM-03 provient de `payload.evidence` (`:819–826`); si elle est absente, la comparaison ne peut pas établir qui a demandé la gate. La vérification ne suffit donc pas à certifier une approbation indépendante réelle.

**Proposition :** définir, avec la gouvernance, la correspondance gate→rôle/titulaire autorisé; l’enregistrer côté serveur; valider une preuve structurée/versionnée et la décision; relier l’opérateur à une demande authentifiée plutôt qu’à un champ de preuve fourni par le client; imposer une identité reviewer distincte lors de chaque création ou modification de décision.

### P1 — L’opérateur n’est pas soumis au step-up dans les routes physiques

Le manuel exige un opérateur avec session step-up (`docs/MANUEL-OPERATEUR-FR.md:141–160`). Le reviewer N4 a une session step-up vérifiée, rôle `approver`, identité différente et même projet (`web/app.py:1769–1800`; `web/hardware_gate.py:226–255`). En revanche, `/api/hardware/gate/issue-token` et `/api/hardware/drones/{id}/command` utilisent une session primaire ordinaire; aucun contrôle de session LABBENCH `operator` n’apparaît à ces routes (`web/app.py:1803–1827, 1830–1878`). Le téléversement mission vérifie l’identité primaire et les gates, pas de step-up opérateur dans la fonction d’entrée (`web/mission_planner.py:285–308`). La propriété de projet sert de garde sur certains chemins, mais n’équivaut pas au rôle opérateur défini par IAM.

**Proposition :** exiger au point d’émission *et* au point d’exécution une session opérateur step-up valide, fraîche, liée au projet/drone/révision; vérifier le rôle serveur à chaque appel. Conserver le reviewer indépendant, les tokens à usage unique et le blocage matériel par défaut.

### P1 — `super_admin` reçoit implicitement operator, approver et admin

L’héritage automatique des six rôles est explicite dans `web/labbench_canonical_api.py:213–215`. Cette politique est plus large que la distinction de fonctions documentée. La séparation par `user_id` empêche une personne d’être son propre reviewer N4, mais n’empêche pas le Super-Administrateur de cumuler plusieurs fonctions sur différentes actions ou gates.

**Proposition :** faire trancher par Aeromind si le Super-Administrateur est gestionnaire global uniquement ou peut également être opérateur/approbateur; représenter la décision par des attributions explicites et limitées, plutôt que par héritage total implicite. Préserver son autorité d’administration validée; ne pas lui attribuer ou retirer des pouvoirs opérationnels sans décision.

### P1 — « deuxième opérateur » du N3 n’est pas une deuxième identité vérifiée

`arm_n3_gate` exige une chaîne `secondOperatorCode` d’au moins six caractères, puis en stocke le hash (`web/labbench.py:924–965`). Le serveur ne valide pas une seconde identité, une authentification ni un rôle pour ce code. La réponse décrit une double confirmation humaine, mais cette entrée ne constitue pas une preuve cryptographique qu’un second titulaire institutionnel a confirmé. Il s’agit d’un état N3 virtuel; il ne déclenche pas une sortie physique, mais ne doit pas compter comme authentification indépendante.

**Proposition :** soit libeller ce champ comme confirmation non-identitaire, soit remplacer par une seconde session authentifiée distincte, limitée au projet et journalisée; la décision doit rester conforme à la gouvernance des essais.

### P2 — Le drapeau VIRTUAL ONLY n’a pas une source de vérité cohérente

La configuration d’exemple documente `HARDWARE_CONTROL=false`, mais pas `AEROMIND_VIRTUAL_ONLY` (`.env.example:34–47`). La commande MAVLink considère seulement la chaîne `true` (casse ignorée) (`web/mavlink_command_api.py:78–103`), tandis que des contrôles télémétriques acceptent aussi `1`, `yes`, `on` (`web/mavlink_telemetry_api.py:35–41`). Une valeur non canonique peut donc produire des résultats contradictoires entre routes. En outre, `/api/lab/mode/{project_id}` appelle `determine_mode()` à partir des variables `HARDWARE_CONTROL`, SITL et HIL sans lui passer `virtual_only_mode()` (`web/labbench_canonical_api.py:760–782`); il peut afficher un état hardware différent du verrou que la route d’émission appliquera.

**Proposition :** normaliser le flag dans une seule fonction partagée, documenter une valeur fermée par défaut pour les environnements non qualifiés, et faire respecter cette valeur dans routes de commande, mission, pool, mode et télémétrie. Aucun changement d’environnement de production n’a été fait.

### P2 — Les états présentés ne représentent pas uniformément la capacité effective

`/api/hardware/status` affiche les commandes permises selon `virtualOnly` seulement, même lorsque `hardwareControlEnabled=false`, et retourne toujours `physicalOutputEnabled=false` (`web/app.py:1664–1677`). `/api/ops/mode` calcule son mode courant sans progression des gates (`web/ops_control_api.py:45–54`) alors qu’il peut annoncer HARDWARE disponible selon le projet (`:78–101`). Le mode canonique par projet omet le flag VIRTUAL ONLY. Ces endpoints décrivent des notions différentes (flag, mode, commandes codées, émission), mais leurs noms peuvent être compris comme une autorisation effective.

**Proposition :** exposer séparément `commandes_implémentées`, `mode_configuré`, `capacité_effectivement_autorisée`, `sortie/connectivité physique`, et `dernière preuve d’envoi/ACK`; ne jamais présenter un simple flag comme une sortie active ou un ACK.

### P2 — La confirmation `accepted` d’une commande n’est pas un ACK autopilote

Pour `COMMAND_LONG`, le pilote marque `accepted=True` dès que l’appel local `command_long_send` ne lève pas d’exception (`web/mavlink_command_api.py:410–465`). Aucun `COMMAND_ACK` ni changement d’état véhicule n’est attendu dans ce chemin. L’ACK mission existe, mais c’est un protocole distinct (`web/mission_planner.py:435–472`). Le reçu peut donc être interprété à tort comme « accepté/exécuté ».

**Proposition :** distinguer strictement « autorisée », « transmise », « ACK reçu », « effet observé » et « résultat inconnu »; ne pas auto-réessayer une commande potentiellement exécutée. Cette correction nécessite tests de simulation/faux autopilote avant toute campagne sur banc.

### P2 — La documentation promet un e-stop global que le serveur refuse

Le manuel décrit une diffusion `NAV_LAND` à tous les drones (`docs/MANUEL-OPERATEUR-FR.md:132–137`), mais la route refuse le broadcast avec `TARGET_CONTEXT_REQUIRED` (`web/app.py:1919–1926`). Ce refus est un garde-fou ciblé, pas une neutralisation arbitraire. De plus, `NAV_LAND` n’est pas une coupure d’urgence garantie. La procédure d’urgence doit être conçue par type d’aéronef/firmware, puis documentée exactement selon le chemin réellement pris en charge.

## 6. Fonctionnalités et restrictions qui doivent rester distinctes

- **Simulation et commandes virtuelles :** restent disponibles dans leurs parcours existants; aucun changement n’est proposé pour les réduire.
- **Panneau `/api/control/*` :** reste un jumeau logiciel et doit continuer à refuser le matériel. C’est une frontière fonctionnelle explicite, pas le verrou global du pilote MAVLink.
- **Télémétrie MAVLink :** chemin de lecture seule distinct, soumis à consentement/état virtuel; un polling peut ouvrir une liaison réception seule si le runtime le permet. Aucun polling n’a été exécuté dans cet audit.
- **Commandes MAVLink et upload mission :** chemins matériels conditionnels présents dans le code; émission fermée dans la preview précédente et non testée ici. L’upload mission a un ACK final; les commandes simples n’en ont pas.
- **SITL/HIL :** modes séparés dans le modèle opérationnel. Leur disponibilité réelle dépend de la configuration et des services; ils n’ont pas été démarrés.
- **Activation effective :** ne doit pas être confondue avec « Super-Administrateur peut changer un flag », « gates affichées approuvées », ou « token émis ». La gouvernance, l’autorisation logique et la sûreté embarquée sont trois niveaux distincts.

## 7. Modifications proposées — aucune appliquée

1. **Formaliser la matrice Aeromind** : rôles d’identité et de projet; qui peut créer, approuver, révoquer, exploiter; mapping des responsables pour G0–G5; pouvoirs exacts du Super-Administrateur; rôle du propriétaire de projet; MFA requis par action. Ne pas inventer les titulaires.
2. **Corriger le moteur de gates** : approbateur autorisé par gate; evidence structurée validée côté serveur; opérateur lié à une demande authentifiée; identité indépendante vérifiée à chaque changement; statut audit durable avant d’accepter la gate.
3. **Renforcer l’activation** : ré-authentification step-up pour le passage HARDWARE; décision d’activation conforme à la hiérarchie; autorisation bornée et révocable; état partagé cohérent entre workers; aucun simple flag ne doit constituer l’autorisation entière.
4. **Appliquer les rôles au transport** : session `operator` step-up au token et à l’envoi/mission; reviewer `approver` distinct step-up; liaison tenant/projet/drone/révision; géofence, token court et usage unique maintenus.
5. **Unifier les modes et statuts** : normalisation VIRTUAL ONLY; séparation des capacités codées, drapeaux runtime et autorisation effective; mode par projet cohérent; status d’envoi et ACK sans faux « accepté ».
6. **Corriger la documentation de déploiement** : `.env.example`, manuel et matrice doivent distinguer démo, simulation, SITL/HIL, télémétrie réception seule et sortie réelle; signaler G3–G5/watchdog non qualifiés et le refus e-stop global; supprimer toute procédure qui pourrait faire croire qu’un flag seul suffit.
7. **Garder le matériel fermé pendant l’implémentation** : tests unitaires/intégration avec doubles déterministes uniquement; aucune liaison série, socket drone, commande MAVLink, SITL/HIL ou essai réel tant qu’une autorisation humaine distincte et une revue indépendante ne sont pas fournies.

## 8. Éléments nécessaires avant de coder les changements sensibles

Les constats sont suffisamment précis pour corriger des problèmes techniques, mais le code ne doit pas décider à la place de l’institution qui approuve quoi. Avant d’implémenter la matrice des rôles, il faut confirmer par un document Aeromind approuvé : (a) le pouvoir du Super-Administrateur sur le mode matériel et sur les rôles d’exploitation; (b) le titulaire institutionnel par gate G0–G5 et la possibilité de délégation; (c) si le propriétaire de projet est automatiquement opérateur/admin; (d) la fraîcheur MFA et le nombre d’approbateurs exigés pour l’activation; (e) qui valide le concept d’opération, le banc, l’aéronef/firmware, les procédures et l’autorisation réglementaire.

Aucune de ces incertitudes ne justifie la désactivation des simulations ni le retrait de fonctionnalités non concernées. Aucune n’autorise, non plus, à ouvrir la voie physique avant vérification. Cet audit n’est ni une certification de conformité ni une autorisation d’exploitation.

## 9. Précisions de portée et dérive documentaire

- `POST /api/hardware/pool/register` et `/api/hardware/gate/issue-token` vérifient principalement `AEROMIND_VIRTUAL_ONLY`, pas `HARDWARE_CONTROL` (`web/app.py:1692–1739, 1803–1827`). Avec `VIRTUAL_ONLY=false` et `HARDWARE_CONTROL=false`, l’application peut donc enregistrer une URL ou préparer un jeton si les gates existent; l’enregistrement du pool seul reste paresseux et ne connecte pas le pilote. **L’émission d’une commande** reste refusée par `authorize_physical_command()` tant que `HARDWARE_CONTROL` n’est pas vrai. La politique devrait distinguer clairement préparation, liaison de télémétrie en réception seule et capacité de commande.
- Le rapport technique du 14 octobre affirme que `feature_enabled()` désactive le contrôle matériel et que le téléversement mission est absent (`RAPPORT_AUDIT_TECHNIQUE_GLOBAL_AEROMIND_2026-10-14.md:316–327`). Il décrit le panneau `/api/control` mais ne doit pas être lu comme l’état complet actuel du dépôt : le code plus récent comprend des routes MAVLink physiques conditionnelles et un upload mission dédié. Maintenir cette distinction dans les rapports et l’interface évite d’affirmer à tort que toute voie physique est supprimée ou, inversement, que le panneau virtuel la commande.

## 10. Preuve d’audit liée à l’émission

La route physique appelle d’abord `pilot.send_command()` puis écrit/commit `AuditEvent` (`web/app.py:1863–1901`). Si l’écriture DB échoue après l’appel MAVLink, l’ordre peut avoir quitté le processus alors que l’API retourne une erreur et que l’événement durable manque; le jeton reste consommé. Par ailleurs, le chemin `audit_decision` de certaines décisions LabBench absorbe des erreurs de journalisation (`web/labbench_auth.py:341–393`), malgré l’exigence documentaire IAM-05 « journaux d’audit inviolables » (`docs/MATRICE-CONFORMITE-FR.md:241–242`). La chaîne de hachage améliore la détection d’altération, mais ne prouve pas seule l’écriture durable ni l’impossibilité d’effacement.

**Proposition :** enregistrer et valider durablement une intention de commande, avec identité, rôle, projet/drone, commande/paramètres canoniques, approbation et identifiant de corrélation, avant tout envoi; si cette écriture échoue, refuser l’émission. Après tentative, enregistrer séparément transmission, ACK et résultat observé; si la seconde écriture échoue, présenter « résultat inconnu » et réconcilier sans rejeu automatique.
