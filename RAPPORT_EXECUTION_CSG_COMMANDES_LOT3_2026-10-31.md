# AeroMind — Rapport d’exécution du lot 3

**Date :** 31 octobre 2026  
**Lot :** noyau CAO CSG, opérations booléennes et commandes du Centre Paramétric  
**Statut :** livré, testé et prévisualisable

## Noyau CAO intégré

Le projet frontend intègre désormais `@jscad/modeling` version 2.13.0, un noyau Constructive Solid Geometry JavaScript exécutable dans la preview navigateur.

Les pièces supplémentaires du jumeau mécanique sont converties en solides JSCAD, les opérations sont exécutées par le noyau, puis le résultat est triangulé et réinjecté dans `mechanicalTwin.extraParts` pour être reconstruit et affiché par le viewport AeroMind.

## Opérations booléennes livrées

- **Union** : fusion CSG de deux features.
- **Découpe** : soustraction CSG d’un outil sur une cible.
- **Intersection** : intersection CSG de deux features.

Chaque résultat conserve un identifiant, un nom, le type d’opération, les identifiants cible/outil, l’horodatage et le statut `applied` ou `unsupported` dans `featureHistory`.

Les opérations sont exécutées sur les deux dernières features supplémentaires lorsque la sélection ne désigne pas explicitement une cible. Une précondition empêche l’exécution sans au moins deux features.

## Commandes rendues fonctionnelles

- Nouveau : réinitialise l’historique et les pièces supplémentaires du profil actif.
- Esquisse : active/désactive le mode esquisse visible dans la barre de commandes.
- Extruder : construit et persiste un prisme triangulé.
- Révolution : construit et persiste un cylindre paramétrique.
- Union, Découpe, Intersection : exécutent le noyau JSCAD.
- Mesurer : affiche l’envergure, la longueur et le nombre de pièces.
- Masses : affiche la masse à vide et la surface alaire.
- Paramètres viewport : ouvre un panneau réel et permet d’appliquer les réglages.
- Ajouter/Dupliquer variable : incrémente l’état de variables personnalisées et affiche le résultat.
- Import, Export, Valider, Capturer, plein écran, sélection de feature, matériaux et onglets : conservés et vérifiés.

Les notifications restantes signalent uniquement une réussite, une erreur ou une précondition bloquante ; elles ne remplacent pas une opération.

## Validation

- Typecheck TypeScript : réussi.
- Tests frontend : **68 fichiers, 327 tests réussis**.
- Test CSG explicite : soustraction JSCAD réussie et reconstruite en maillage triangulé.
- Build Vite de production : réussi.
- Preview publique : HTTP 200 vérifié.

## URL de prévisualisation

https://3000-isxjadql64jdfr4nkhrpp-a32a466a.sg2.manus.computer/

## Limites techniques explicites

Le noyau CSG est intégré côté navigateur et porte sur les `extraParts` persistées du jumeau mécanique. La conversion d’un composant natif de chaque famille aéronautique en solide CSG éditable n’est pas encore réalisée. Les opérations de congé, chanfrein et loft généralistes restent à intégrer sur ce noyau avant d’être présentées comme disponibles.

Aucune commande matérielle, opération de vol ou liaison drone réelle n’a été activée.
