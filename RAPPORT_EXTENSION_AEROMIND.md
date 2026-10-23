# Rapport d’extension AeroMind — import, carte et garde-fous

## Synthèse

Les fonctions ont été ajoutées à la copie du projet fournie, en réutilisant sa structure React/TypeScript, sa Bibliothèque de cellules, son moteur paramétrique, son menu et son composant cartographique. La structure existante n’a pas été refondue.

## Import de maquette dans la Bibliothèque

Un bouton d’import accepte les fichiers OBJ/STL jusqu’à 20 Mo, avec choix d’unité (m/cm/mm). L’analyse des sommets et de l’enveloppe s’effectue localement; la morphologie est rapprochée d’un profil catalogue compatible pour créer une variante paramétrique. Les paramètres non géométriques hérités sont à contrôler par un opérateur. Seul le profil dérivé est conservé dans le navigateur; le maillage source n’est ni conservé dans le profil ni envoyé au serveur.

**Limite :** le jumeau affiche la géométrie paramétrique AeroMind rapprochée, pas une reconstruction CAO fidèle du maillage importé. L’appariement est une estimation, non une vérification ou qualification de conception.

## Planificateur satellite

La vue dédiée propose un fond Satellite/Carte, un centrage WGS84, des points ajoutés par clic ou saisie manuelle (50 maximum), et une persistance locale par cellule. Elle réutilise la configuration cartographique existante; si la carte est indisponible, les coordonnées restent saisissables.

**Limite :** cette vue reste un plan cartographique local. Elle n’est pas reliée au pilotage, ne lit pas le GNSS d’un aéronef, ne calcule pas de trajectoire autonome et ne transmet ni n’exporte de mission.

## Contrôle humain et communications

- Le départ d’un scénario simulé requiert deux conditions distinctes : **précontrôle AeroMind sans blocage** et **approbation humaine explicite**. Le précontrôle peut refuser une simulation, mais ne constitue jamais une autorisation de vol réel ni une décision autonome.
- Le flux WSS de télémétrie reste entrant et en lecture seule. Sa connexion exige maintenant une case de consentement humain préalable, réinitialisée si l’URL change; aucun ordre sortant n’est émis.
- La frontière de commande refuse les commandes physiques, l’armement matériel, le téléversement de mission et le transport HIL non configuré. Aucune fonction de pilotage matériel, de collecte de renseignement ou de commande sortante n’est activée dans cette livraison.

## Vérification

- `pnpm check` : réussi.
- `pnpm test -- --run` : **37 fichiers, 178 tests réussis**.
- `pnpm build:static` : réussi; avertissement non bloquant sur la taille du bundle principal.
- Archive ZIP contrôlée; aperçu HTTP 200.

## Périmètre

La livraison est une copie corrigée de l’archive fournie. Aucune mise en production externe n’est effectuée ni présumée.
