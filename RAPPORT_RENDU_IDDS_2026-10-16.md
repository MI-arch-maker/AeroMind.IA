# Rapport — barre de rendus Studio IDDS

## Modifications

- Remplacement de l’indicateur « Aperçu 2D » par une barre de cinq rendus : assemblage mécanique complet, détails mécaniques internes, cinématique et mouvements, simulation paramétrique, générateur de variantes paramétriques.
- Les modes réutilisent le même modèle IDDS éditable : sélection des pièces, inspector, visibilité des calques et nomenclature demeurent reliés à la configuration du drone actif.
- La vue interne expose une coupe et des repères issus des pièces visibles. La cinématique inclut lecture/pause. Les curseurs de simulation modifient en direct l’envergure, la longueur du fuselage et le nombre de moteurs. Le générateur crée des alternatives paramétriques réapplicables au document actif.
- Les variantes créées sont conservées durant la session de l’interface ; leurs paramètres appliqués suivent la configuration active.

## Validation exécutée

- `pnpm check` : réussi (catalogues synchronisés et TypeScript sans erreur).
- `pnpm test` : réussi — 41 fichiers, 195 tests.
- `pnpm build:static` : réussi ; avertissement Vite conservé sur un chunk JavaScript de grande taille et une balise script existante non-bundleable.
- `pnpm i18n:lint` : échoue encore sur 98 textes hérités d’autres écrans/composants ; les nouveaux libellés et textes de ce sélecteur ont été ajoutés aux catalogues français/anglais et ne sont plus signalés.

## Portée et limites

Le rendu IDDS reste une représentation paramétrique vectorielle de conception, avec coupes et animations conceptuelles ; cette modification ne transforme pas les pièces en solides B-Rep, ne produit pas un solveur de simulation certifié, ni un export STEP/IGES, une certification, une commande matérielle ou un contrôle de vol. Les masses et paramètres restent indicatifs. Aucun déploiement dans le service AeroMind.ai n’a été effectué : l’environnement de session ne possède pas de connecteur de déploiement activé, et seule l’archive jointe a été modifiée ici.
