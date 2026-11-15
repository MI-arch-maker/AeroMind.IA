# Revue indépendante et résolution

La revue a suivi le chemin STEP/B-Rep → XDE → noyau intégral → coupe booléenne → API → buffers de faces → sélection et PMI. Elle n’a pas confondu les contrôles logiciels avec une réception métrologique.

| Constat confirmé | Correctif intégré | Preuve |
|---|---|---|
| STEPCAF pouvait suivre une référence vers un STEP local accessible, hors SHA du fichier importé | Refus lexical des profils externes puis inspection native STEPConstruct_ExternRefs avant Transfer | test_cad_external_references.py et test_cad_review_fixes.py ; aucune résolution externe autorisée |
| Une face divisée pouvait conserver son ID sur un fragment ne contenant pas l’ancrage PMI | Comptage des correspondances avant affectation : tous les fragments ambigus reçoivent des IDs dérivés ; PMI non réancrée silencieusement | Reproduction plaque en U, ancrage source conservé et visibilité false |
| Changement de projet durant chargement pouvait laisser busy actif ou une source vide | Le raccourci d’ID exige une source effectivement présente ; invalidation du cache d’ID | cadModelTransition.test.ts et garde cadModelIsInstalled |
| La limite de fichier s’appliquait après écriture du multipart temporaire | Middleware ASGI limite Content-Length et octets du flux avant le parseur ; borne import 25 MiB + 64 KiB de transport, autres mutations 256 KiB | test_cad_body_limit.py : 413 pré-handler et flux sans Content-Length |
| Noms d’assemblage UTF-8 exportés incorrectement | TCollection_ExtendedString(..., True) pour racine, définition et occurrence | Round-trip exact « usinée — perçages » et noms vérifiés via l’API intégrée |
| Tolérance +8/−5 µm affichée comme ±8 µm et GD&T comme une déviation ± | Métadonnées de bornes conservées, formateur sémantique et cadres GD&T sans fausse symétrisation | cadPmiPresentation.test.ts |

La protection des références externes est une restriction volontaire : les assemblages multi-fichiers de ce profil sont refusés plutôt qu’interprétés de manière non traçable. Les tests natifs de détection incluent une vraie session STEP avec un détecteur positif injecté ; ils ne constituent pas un corpus exhaustif de tous les profils externes.

Le middleware borne chaque requête, pas le stockage total d’un compte ni la durée d’une opération OCCT. Un déploiement industriel doit aussi disposer de quotas, limitation de débit, isolation de processus, temps d’exécution dur et stockage privé persistant. Ces protections de production supplémentaires ne sont pas revendiquées comme livrées.
