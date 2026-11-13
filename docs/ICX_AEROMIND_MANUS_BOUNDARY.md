# Frontière organisationnelle ICX / AeroMind / Manus

## Autorité de l’arborescence

L’arborescence, les noms de centres, les rôles, les exigences internes, les contrôles humains et la chaîne G01–G05 appartiennent à **ICX POWER SOLUTIONS SRL** et à AeroMind. Ils constituent la structure organisationnelle de référence du produit.

Manus.ai intervient uniquement comme **agent de codage** mandaté par l’Entreprise. Manus ne remplace pas l’organisation AeroMind, ne redéfinit pas ses centres et ne déplace pas son autorité dans une arborescence Manus.

## Profil matériel séparé

Le profil `profiles/enterprise-hardware-development.json` formalise les valeurs demandées :

- `HARDWARE_CONTROL=true` ;
- `AEROMIND_VIRTUAL_ONLY=development` ;
- `physicalOutputEnabled=true`.

Ce profil est une déclaration opt-in pour un déploiement externe contrôlé. Il n’est pas chargé par la Preview Webdev, par `start.sh` ni par le Dockerfile par défaut. La Preview reste en simulation-only.

## Contrôles non substitués

Le profil ne supprime pas les contrôles propres à AeroMind. Une exécution matérielle éventuelle reste subordonnée à la revue humaine, au double contrôle, aux validations séquentielles G01–G05, à l’audit indépendant et à l’arrêt d’urgence. Le flag `HARDWARE_CONTROL=true` ne constitue jamais, à lui seul, une autorisation d’exécution.

Toute activation opérationnelle de ce profil, son raccordement à un équipement et sa mise en production relèvent exclusivement de l’Entreprise et de ses procédures internes.
