# Résumé des corrections i18n

## État initial audité

L’audit initial `AUDIT_I18N_INITIAL_BRUT.txt` a été exécuté avant toute correction applicative. Il a parcouru 213 fichiers et identifié 8 231 candidats de chaînes lisibles en dur. Le dictionnaire frontend historique contenait 64 clés françaises et 64 clés anglaises, symétriques mais insuffisantes pour couvrir toute l’architecture.

## Corrections réalisées

Le frontend dispose maintenant de deux catalogues centralisés `client/src/lib/fr.json` et `client/src/lib/en.json`. Le chargeur TypeScript les utilise comme source unique, sans recopier le dictionnaire dans le composant de contexte. Le sélecteur conserve la préférence dans `localStorage`, puis utilise les langues du navigateur et retombe sur l’anglais si aucune langue supportée n’est détectée. Le changement reste à chaud et ne remonte aucun état applicatif.

Le backend dispose de catalogues `web/locales/fr.json` et `web/locales/en.json`, d’un module `web/i18n.py` et d’une négociation `Accept-Language`. Le gestionnaire d’erreurs localise le champ `message` mais conserve le `code` technique et les valeurs MAVLink stables. Des tests couvrent la symétrie des catalogues, la négociation et la non-traduction des codes techniques.

Le script `scripts/i18n_audit.py` est livré et produit une sortie texte brute ainsi qu’une sortie JSON.

## Écart restant explicite

Le seuil binaire « 0 chaîne en dur dans toute l’architecture » n’est pas encore atteint dans cette itération : l’application contient encore des composants legacy comportant des textes d’interface directement écrits dans les composants, ainsi que des chaînes techniques que l’audit conservateur signale pour revue. Les PDF et toutes les routes API ne sont pas encore couverts par des catalogues complets. La livraison ne doit donc pas être présentée comme une conformité finale au cahier des charges ; elle constitue la fondation i18n et la preuve d’audit nécessaires pour poursuivre la migration sans masquer l’état réel.

## Validation exécutée

- `pnpm check` : réussi.
- `pnpm test` : 39 fichiers, 184 tests réussis.
- Smoke tests backend i18n : réussis.
- `pytest` complet : non exécutable dans le sandbox courant car le module `pytest` n’est pas installé.
