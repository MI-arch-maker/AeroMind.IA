# AeroMind — modernisation des rendus

## Objet et périmètre

Cette intervention reprend l’application et l’arborescence fournies. Les règles d’organisation et les contrôles métier existants ne sont pas remplacés par une organisation Manus. La prévisualisation emploie le démarrage virtuel déjà prévu par le projet.

## Corrections

- Le viewport mécanique commun applique effectivement les modes solide, filaire, transparence, monochrome, blueprint et éclaté au maillage actif ; il distingue les projections orthographique et perspective et propose des styles de présentation distincts. La coupe et l’éclatement agissent sur la géométrie affichée.
- Le poste CAO et les aperçus de catalogue utilisent une projection des faces du modèle mécanique sélectionné plutôt qu’une silhouette 2D simplement tournée. Les vues de dessin et de pièce existantes sont conservées.
- L’atelier d’assemblage IDDS charge les huit OBJ de la bibliothèque lorsqu’un de ces huit profils exacts est sélectionné. Les objets nommés et leurs couleurs restent sélectionnables. La vue signale le chargement et les erreurs ; elle ne substitue pas silencieusement un autre drone.
- Le centre aérodynamique applique des caméras et styles distincts à son maillage importé. Les centres paramétrique et mécanique peuvent afficher le croquis actif sous forme de segments reconstruits. L’identité déjà enregistrée peut être affichée dans le Hub et la bibliothèque après rechargement, sans modifier l’état de session des commandes existantes.
- Le fichier `StrataStudio.tsx` a reçu un viewport, mais ce composant n’était pas relié à la navigation d’origine et reste non exposé par cette intervention.

## Limites importantes

Les huit OBJ de la bibliothèque sont des **maquettes conceptuelles reconstruites depuis des images 2D**, et non des relevés industriels ou une géométrie certifiée. Leur chargement direct est actuellement limité à l’atelier d’assemblage IDDS : les autres centres utilisent encore leur modèle paramétrique, qui peut différer de ces maquettes. Les fichiers importés dans la bibliothèque ne conservent pas tous leur maillage d’origine ; le centre aérodynamique exige encore son propre import. Il n’est donc pas établi que tous les centres reproduisent fidèlement tous les drones ou que tous les modes avancés soient équivalents à des logiciels spécialisés.

Le repli SVG projette la géométrie disponible mais ne reproduit pas tous les shaders, superpositions et animations WebGL ; les recouvrements de faces sont approximatifs. Les cartes CFD et mécaniques sont des approximations de présentation et ne constituent pas une simulation physique complète ni une validation de fabrication. Pour les OBJ, les commandes ne disposant pas de paramètres ou de pivots fiables ne sont pas présentées comme fonctionnelles. Une identité provenant uniquement du stockage IndexedDB peut rester introuvable dans certains centres après restauration.

## Vérifications effectuées

La compilation et le typage TypeScript ont été exécutés avec succès. Les tests automatisés ciblés couvrent les modes de rendu, le viewport aérodynamique, la CAO, les aperçus, les croquis et le chargement des huit OBJ IDDS. Dans le navigateur de prévisualisation, la référence « VTOL HYBRIDE · ROUGE » a été sélectionnée dans la bibliothèque et son atelier IDDS a affiché une reconstruction OBJ comportant 32 objets. Ce parcours ponctuel ne remplace pas une recette de tous les modèles, centres, navigateurs et modes.

## Exécution locale

Prérequis du projet : Python 3.11 ou supérieur, Node.js 22 et pnpm 10. Depuis la racine du projet :

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
cd frontend
corepack pnpm install --frozen-lockfile
corepack pnpm run build
cd ..
./start.sh
```

Le script de démarrage utilise la base SQLite locale et le mode virtuel prévus par le projet. Les secrets de session et données locales ne figurent pas dans l’archive. Les connexions externes et comptes existants nécessitent leur configuration habituelle ; une réponse HTTP correcte ne garantit pas que ces services soient configurés.
