# Parcours de vérification i18n — AeroMind.ai

| Écran / parcours | Français | English | Contrôle attendu |
|---|---|---|---|
| Vue générale | Sélectionner Français | Select English | Titres, navigation et états changent sans rechargement ; état de la page conservé. |
| Sélecteur de langue | Vérifier `Français` | Verify `English` | La sélection survit à un rechargement grâce à `localStorage`. |
| Jumeau mécanique | Ouvrir le mode X-ray | Open X-ray mode | Avertissement numérique, contrôles de coupe, couches, opacités et préréglages sont localisés. |
| Vue X-ray tactile | Déplacer le curseur sur tablette | Move the slider on a tablet | Le plan de coupe et l’opacité répondent au pointeur tactile. |
| Télémétrie MAVLink | Contrôler libellés et unités | Check labels and units | Les codes techniques `DISCONNECTED`, `OBSERVING`, `HEARTBEAT_STALE` restent inchangés ; seuls les libellés sont traduits. |
| Parcours d’assemblage | Ouvrir la checklist | Open the checklist | Les statuts et consignes système sont dans la langue choisie ; les saisies opérateur restent inchangées. |
| Erreur API | Provoquer une erreur avec `Accept-Language: fr` | Repeat with `Accept-Language: en` | Le champ `code` reste stable ; `message` est localisé selon l’en-tête. |
| Export PDF | Générer une fiche en français | Generate an English sheet | En-têtes, statuts, dates et libellés correspondent à la langue demandée. |
| États vides / chargement | Parcourir les écrans sans données | Browse empty states | Aucun écran vide ou message de chargement ne reste dans l’autre langue. |

## Résultat de l’itération

La matrice est fournie pour la vérification humaine indépendante. Le noyau de catalogues JSON et la négociation de langue sont en place. L’audit brut post-correction doit être consulté conjointement avec ce tableau ; il reste des candidats hardcodés dans l’architecture legacy, principalement dans les composants historiques et les chaînes techniques non destinées à l’affichage.
