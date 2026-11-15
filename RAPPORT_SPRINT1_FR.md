# AEROMIND — Sprint 1 : noyau mécanique, PBR et MBD

**ICX POWER SOLUTIONS SRL — livraison technique du 15 novembre 2026**  
**Référentiel disponible :** directive Sprint 1 transmise avec l’archive `Aeromind.IA-inspection-2026-11-14.zip`. Le fichier CCM-AEROMIND-V1.0 complet n’est pas présent dans cette archive.

## Décision de réception

Le code de calcul volumique, son API et l’atelier 3D sont intégrés dans une copie de la plateforme. L’assemblage de démonstration et les coupes sont issus de solides Open CASCADE, et non d’une géométrie décorative ou d’un simple clipping de coques. Les contrôles analytiques, tests et preuves réseau sont livrés avec les sources.

**La conformité intégrale demandée n’est pas attestée.** La calibration optique mesurée des matériaux, une cadence de coupe temps réel garantie et la fidélité complète des profils AP242/PMI restent ouvertes. La réception globale de l’application reste également ouverte : 37 tests backend échouent dans le périmètre exécuté. Ces limites ne sont pas masquées par des boutons, des rendus de substitution ou une déclaration de certification.

Aucune publication ni mise à jour de la plateforme de production n’a été effectuée. Aucun matériel aéronautique n’a été piloté. Les tests et la démonstration utilisent des données et stockages isolés.

## Architecture effectivement intégrée

| Couche | Code livré | Fonction réelle |
|---|---|---|
| Noyau géométrique | `web/cad_kernel.py` | CadQuery 2.8.0 / OCP 7.9.3.1 ; STEPCAF/XDE ; solides B-Rep ; validation topologique ; unités mm ; hiérarchie et placements monde |
| Propriétés physiques | `integral()` / `render_model()` | Intégration BRepGProp sur surfaces natives ; volume, masse nominale et COG pondéré par matériaux ; aucune mesure tirée du maillage |
| Coupe | `section_model()` | Intersection booléenne avec un demi-espace ; nouveaux solides fermés, faces de fermeture et cavités conservées ; provenance des faces et suppression de visibilité des ancrages ambigus |
| API privée | `web/cad_api.py` | Import, lecture, coupe, attribution matériaux et annotations ; authentification et isolation propriétaire ; mutations cookie protégées par l’origine |
| Limites HTTP | `web/cad_body_limit.py` | Limitation avant parsing multipart, y compris flux sans Content-Length ; refus 413 avant livraison d’un chunk excédant la borne |
| Rendu et interactions | `SolidCadWorkbench.tsx`, `lib/solidCad.ts` | Buffers par face native en coordonnées monde ; PBR, carbone procédural métrique, inspecteur, coupe asynchrone et PMI ancrées |
| Intégration | `MechanicalCenter.tsx`, `App.tsx` | Onglet CAO volumique / MBD et route `/cad-validation` ; identifiant d’import conservé dans la configuration du projet ; modules documentaires distingués des calculs physiques |

Les sources STEP et BREP canoniques sont persistées avec empreintes SHA-256 ; la lecture vérifie l’intégrité. Les chemins de modèles sont construits à partir de l’identité propriétaire et d’UUID validés. Les symlinks et traversées de chemins sont refusés. Les références STEP externes sont refusées avant le transfert natif : elles ne peuvent pas incorporer silencieusement un STEP du serveur hors de l’empreinte source.

## Démonstration et résultats

La fixture `fixtures/cad/aeromind_support_ap242.step` est un vrai export STEP AP242 généré par STEPCAFControl_Writer. Elle contient **15 solides** : support percé, paliers et semelles, arbre creux, colliers, boulons, plaque composite et entretoises creuses. L’API charge ce fichier fixe ; son SHA-256 est identique à celui du téléchargement, contrôlé dans `evidence/sprint1/http-demo.json`.

| Résultat nominal | Assemblage entier | Coupe X ≤ 0 mm |
|---|---:|---:|
| Volume B-Rep | 177 733,333913 mm³ | 88 866,666956 mm³ |
| Masse selon matériaux attribués | 0,519549687 kg | 0,259774844 kg |
| COG X / Y / Z | ≈0 / 1,118631 / 12,284191 mm | −31,970495 / 1,118631 / 12,284191 mm |

Les derniers chiffres sont fournis comme résultats logiciels reproductibles, **pas comme une incertitude métrologique garantie**. Les densités nominales sont 4 430 kg/m³ pour Ti-6Al-4V, 2 810 kg/m³ pour aluminium 7075 et 1 600 kg/m³ pour le CFRP de référence. Les références et conditions sont consignées dans `docs/SPRINT1_SOURCES.md`. Un matériau non attribué laisse la masse et le COG massique inconnus ; aucune valeur fictive n’est substituée.

Les contrôles du cube, de la sphère et du tube annulaire donnent des écarts relatifs de volume inférieurs à 2,3 × 10⁻¹⁶ sur ces cas analytiques. Le test annulaire vérifie explicitement qu’un trou n’est pas rempli par la fermeture de coupe. Les placements imbriqués, les rotations et la conversion pouces → mm sont contrôlés par des fixtures distinctes.

Le pipeline Boolean+tessellation des quatre plans de démonstration a pris environ **0,8 à 1,6 seconde** sur ce serveur. Le curseur temporise les requêtes et l’interface affiche le dernier vrai solide avec un état de calcul visible, jusqu’à réception du résultat demandé. Il n’y a pas de revendication de temps réel garanti.

## PBR et MBD : périmètre démontré

Le viewport utilise MeshPhysicalMaterial, lumière linéaire, tone mapping ACES et sortie sRGB. Le titane et l’aluminium disposent de paramètres de métal et rugosité ; la texture carbone possède une répétition métrique de 4 mm et un relief nominal de 25 µm. Il s’agit de paramètres PBR nominaux, non de BRDF mesurées. La projection planaire du carbone ne décrit ni drapage ni stratification réelle.

Les annotations utilisateur sont liées aux identifiants de faces B-Rep et à la source SHA-256 ; leur ancrage est évalué sur la surface native. Le registre conserve les annotations d’origine lorsqu’une coupe retire un ancrage. Si une face source est divisée en fragments ambigus, tous les fragments reçoivent des IDs dérivés : la PMI n’est pas transférée silencieusement à l’un d’eux.

La fixture `semantic_pmi_ap242.step` contrôle réellement une dimension **10 mm +8/−5 µm**, un **parallélisme de 8 µm** et un **datum A** importés via attributs XDE natifs. Les bornes asymétriques sont conservées et affichées séparément. Une valeur GD&T n’est pas affichée comme une déviation dimensionnelle ±. Les spécifications matériaux peuvent être ancrées à une face sans inventer de nominal ou de tolérance.

L’import des PMI sémantiques reste partiel. Les modificateurs complexes et PMI de présentation ne sont pas pleinement interprétés. Le STEP téléchargeable de démonstration exporte géométrie et noms, **pas les annotations utilisateur/démo**. Cette limitation figure dans l’API, l’interface et les en-têtes de téléchargement.

La déflexion du maillage de visualisation est de 0,18 mm, avec déflexion angulaire de 0,22 rad. Cette tessellation ne démontre aucune précision au micron. Les tolérances topologiques et l’estimateur d’intégration sont exposés séparément ; l’objectif relatif d’intégration est 10⁻⁹.

## Validation et non-régression

| Contrôle exécuté | Résultat |
|---|---|
| Frontend complet | **552 tests réussis**, 101 fichiers |
| TypeScript et build Vite | Commandes de contrôle et compilation réussies ; avertissements de taille de bundles conservés dans le journal |
| Noyau, API, sécurité et correctifs CAO | **44 tests réussis**, aucun échec ni test ignoré |
| Backend de référence, environnement isolé | 299 réussis, 37 échecs, 11 ignorés |
| Backend intégré, même protocole | 343 réussis, 37 échecs, 11 ignorés |
| Comparaison des identifiants de tests | Aucun test réussi dans la référence n’est devenu défaillant dans le périmètre exécuté |

La comparaison ne vaut pas validation de l’ensemble de la plateforme. Les tests `test_v6_real_postgresql.py`, `test_v8_features.py` et `test_migrations.py` sont exclus du lanceur utilisé ; leurs résultats ne sont pas revendiqués. La liste des 37 échecs persistants, la comparaison et les journaux complets se trouvent sous `evidence/sprint1/`. Le lanceur conserve la sortie non nulle de cette suite générale.

La revue indépendante et les corrections sont documentées dans `docs/SPRINT1_REVIEW.md`. Les captures de la démonstration réelle figurent sous `evidence/sprint1/` ; elles complètent les preuves numériques, mais ne les remplacent pas.

## Exigences restant ouvertes avant réception industrielle

La calibration optique exige des mesures sur éprouvettes, états de surface et stratifiés réels. Les densités doivent être qualifiées pour les lots et compositions utilisés. La fidélité complète des profils AP242/PMI et l’export sémantique doivent être confrontés à un corpus de réception industriel. Une cadence temps réel doit être spécifiée et mesurée sur les assemblages cibles. La réception globale nécessite de résoudre les échecs de tests et d’exécuter les périmètres exclus.

La persistance sur disque est opérationnelle, mais un conteneur éphémère n’est pas un archivage durable. Avant déploiement, `AEROMIND_CAD_STORAGE_DIR` doit pointer vers un volume privé persistant avec politique de sauvegarde. Les limites de taille et de complexité ne constituent pas une isolation de processus OCCT, un délai d’exécution natif dur ou des quotas de stockage et de débit. Ces durcissements de production ne sont pas revendiqués.

**Statut final : code intégré et démonstration calculée livrés ; conformité complète au CCM et réception industrielle non acquises.** Les commandes de démarrage et reproduction figurent dans `README_SPRINT1_FR.md`. Aucun Sprint suivant n’a été lancé.
