# Livraison — Modernisation des interfaces AeroMind.IA

## Portée

Modernisation ciblée des interfaces Super-Admin, Console Administrateur et Virtual Parametric Factory. Le projet existant, ses routes, ses règles d’accès et ses opérations métier sont conservés; aucune réécriture du système n’a été effectuée.

## Modifications

- **Console Super-Admin :** habillage AeroMind institutionnel (palette navy/teal, statut de gouvernance, cartes et panneaux restructurés, navigation responsive). Les opérations d’administration et appels existants restent inchangés. Les états précédemment présentés comme « backend en ligne », type de base vérifié et SITL disponible ont été remplacés par des informations réellement observables, ou explicitement indiqués comme non vérifiés. Le tri de la table des comptes fonctionne au clavier et expose l’ordre de tri aux technologies d’assistance.
- **Console Administrateur :** hiérarchie plus claire, mise en page responsive, synthèse du périmètre du compte, panneaux de contrôle et présentation dédiée du test du gateway IA. Les flux de connexion Entra/MFA, le cookie de console distinct, la déconnexion et les endpoints existants sont préservés.
- **Virtual Parametric Factory :** poste de travail institutionnel, canvas de fabrication plus spacieux et nouveau visualiseur de drone paramétrique réutilisant `PhysicalDroneModel` et le catalogue existant. Le modèle est sélectionné explicitement et les changements d’envergure, zoom, grille/axes et vue éclatée restent des réglages d’aperçu, sans création persistante de projet ou de cellule.
- La simulation locale progresse et peut être démarrée, mise en pause, réinitialisée ou ralentie. Les notes de revue, contrôles d’équipement et lots de matériaux ajoutés à cette vue sont signalés comme locaux/non validés. La sortie physique demeure désactivée.
- Les affirmations de synchronisation, télémétrie ou calibration matérielle non vérifiées ont été supprimées ou clarifiées.

## Validation

- `pnpm check` — réussi (catalogues i18n et TypeScript).
- `pnpm test -- --reporter=dot` — réussi : **79 fichiers, 378 tests**.
- `pnpm build` — réussi.
- JSON des catalogues français et anglais validé.

Le build affiche toujours l’avertissement existant sur la taille de certains bundles JavaScript (> 1,5 Mo après minification); il ne bloque pas le build. La production matérielle, la calibration réelle, la télémétrie et la persistance des brouillons de la Factory restent hors de cette interface de démonstration.
