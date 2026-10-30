# AeroMind — Inspection globale et corrections consolidées

**Date :** 30 octobre 2026

## Résultat

Une inspection étendue a couvert les routes et pages, les composants d’interface, les styles globaux, les chemins de synchronisation front-end/API, ainsi que les garde-fous de création de projets. Les défauts reproductibles découverts pendant les deux passes ont été corrigés. Les validations automatiques finales sont vertes et le build de production a été régénéré.

## Changements effectués

- Le Centre paramétrique, Simulation & Analyses, les fenêtres et les dispositions mobiles ont reçu des ajustements de hauteur, défilement, plein écran et recalage responsive; `dvh` est utilisé avec fallback `vh`. Un contour global `:focus-visible` rend le focus clavier apparent.
- Le plan partagé est hydraté sans être remplacé par la mission de démonstration. La création de projet reste dans une boîte de dialogue et n’appelle l’API qu’après confirmation explicite par l’utilisateur; aucune création n’est déclenchée au montage ou au rendu.
- Les outils du planificateur ont des actions visibles pour Geofence/Rally, mesure et effacement Survey. Les erreurs HTTP et réseau des mutations mission sont rapportées de façon accessible; une réponse d’upload sans bilan ne prétend pas confirmer le résultat.
- L’activation HARDWARE exige un identifiant de projet explicite et des gates approuvées pour ce seul projet; les erreurs de base ferment l’accès. Le drapeau hardware se désactive lors des transitions vers les autres modes. Les compteurs et la télémétrie stale/offline ont été corrigés.
- Les variantes, l’assemblage, les calques et la checklist de conception sont protégés contre les écritures prématurées pendant leur hydratation/changement d’identité. La comparaison A/B utilise les champs réellement enregistrés. Les éléments de revue de coupe et de tolérance décrivent leur effet réel sans simuler une modification géométrique.
- Le catalogue matériaux unifie le chargement initial, annule les requêtes précédentes, ignore les réponses obsolètes, temporise la recherche et affiche les erreurs en conservant les résultats précédents comme données périmées.
- Maintenance distingue chargement, historique vide et erreur. Création, cycle batterie et suppression gèrent les exceptions HTTP/réseau; les doubles soumissions sont bloquées et la suppression demande confirmation.
- DashboardLayout n’affiche plus de destination `/some-path`; le stockage de largeur est validé et tolérant aux erreurs. Les marqueurs CAO acceptent Entrée et Espace au clavier. L’API workspace renvoie désormais un 503 si l’écriture canonique échoue, au lieu d’annoncer une persistance qui n’a eu lieu qu’en mémoire.

## Validation finale

`pnpm check` a réussi : les 2 617 clés de catalogues sont synchronisées et TypeScript ne signale aucune erreur. `pnpm test` a réussi : **62 fichiers et 296 tests**. `pnpm build` a réussi après les derniers correctifs. Les tests backend regroupés ont réussi : **21 réussis, 1 ignoré**; `py_compile` a validé `web/app.py`, `web/ops_control_api.py` et `web/mavlink_telemetry_api.py`.

Le build conserve un avertissement non bloquant de taille de bundles et signale que `/api/platform/config.js` est un script runtime non-bundlé. La suite backend conserve un avertissement de dépréciation Starlette/anyio. Les commandes de validation se sont achevées avec succès.

## Cohérence d’exploitation

Les interactions d’édition d’un projet restent explicites. Les contrôles d’administration vérifient le projet choisi avant l’activation du mode hardware. Les états enregistrés uniquement dans le navigateur (ex. checklist/variantes locales) sont identifiés comme locaux; les réponses d’API ne sont présentées comme persistées qu’après confirmation du stockage canonique. Aucun équipement réel ni mouvement de drone n’a été activé pendant les tests.
