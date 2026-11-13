# Rapport de validation — Module 1 X-ray numérique

**Projet :** AeroMind.ai  
**Module livré :** Contrôle manuel par couches X-ray  
**Date :** 2026-10-16  
**Priorité :** noyau prioritaire du cahier des charges

## Périmètre livré

Le Module 1 est intégré dans `MechanicalTwinEditor` et `MechanicalTwinViewport` sans modifier les garde-fous existants : la vue reste une transparence numérique du jumeau mécanique et ne commande aucun équipement d’imagerie ou de rayonnement.

### Fonctionnalités

- **Curseur de profondeur interactif** : plan de coupe réglable de 0 à 100 %, appliqué au maillage mécanique réel dans les rendus WebGL et vectoriel.
- **Opacité individuelle par couche** : réglage 0–100 % pour chaque catégorie de pièces (`airframe`, `propulsion`, `hardware`, `payload`, etc.).
- **Isolation d’une couche** : clic sur le nom d’une couche pour masquer temporairement les autres ; second clic pour revenir à la vue complète.
- **Souris et tactile** : contrôles HTML `range` avec zone tactile et interaction native tablette.
- **Préréglages nommés** : enregistrement et chargement de combinaisons coupe/opacités/isolation.
- **Persistance locale** : réglages et préréglages conservés par cellule dans `localStorage`, avec reprise entre sessions.
- **Réinitialisation** : bouton de remise à la coupe complète, opacités par défaut et absence d’isolation.

## Garde-fous conservés

- Le bandeau X-ray rappelle que le rendu ne constitue pas une radiographie réelle.
- Aucun flux vers un appareil physique n’a été ajouté.
- Aucune émission ni commande matérielle n’a été ajoutée.
- Les flux MAVLink restent non concernés et en lecture seule.

## Tests

### Frontend

- `pnpm check` : **OK**
- `pnpm test` : **OK — 39 fichiers, 184 tests**
- Nouveau test : `src/lib/xrayLayerControls.test.ts`
  - bornage du plan de coupe ;
  - bornage des opacités ;
  - révélation progressive ;
  - isolation par couche ;
  - état de réinitialisation des préréglages.
- `pnpm build:static` : **OK**

### Backend

La suite backend existante n’a pas pu être exécutée dans l’environnement de livraison : le module Python `pytest` n’est pas installé (`No module named pytest`). Aucun fichier backend n’a été modifié pour le Module 1.

## Modules suivants

Les Modules 2, 3 et 4 restent volontairement non engagés dans cette livraison, conformément à la contrainte de priorisation du cahier des charges. Le noyau Module 1 est livré, compilé et testé avant leur implémentation.
