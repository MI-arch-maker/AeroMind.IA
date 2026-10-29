# CHANGELOG — Modernisation MFA + Console SuperAdmin + Activation Outils

**Date** : 30 octobre 2026
**Archive source** : `AeroMind_OPERATIONAL_2026-10-30.zip` (livraison précédente)
**Cette livraison** : `AeroMind_OPERATIONAL_2026-10-30_v2.zip`

Ce document récapitule la deuxième vague de modernisation d'AeroMind, répondant
au cahier des charges en trois phases :

1. **Phase 1** — Mécanisme moderne de création de mots de passe MFA avec
   auto-inscription et approbation super-admin
2. **Phase 2** — Modernisation de la console super-admin en centre opérationnel
3. **Phase 3** — Activation de tous les outils matériels, techniques et
   opérationnels

## Validation

- **Backend pytest** : 239 passed, 13 skipped (pg_only), 0 failed
- **Frontend vitest** : 281 passed (56 fichiers), 0 failed
- **TypeScript check** (`tsc --noEmit`) : OK (exit 0)
- **Vite build** : OK (55.1 s)
- **Compilation Python** : 0 erreur
- **Import runtime** : `from web.app import app` → 172 routes enregistrées
  (8 endpoints `/api/auth/local/*`, 5 endpoints `/api/ops/*`)

---

## Phase 1 — Mécanisme moderne de création de mots de passe MFA

### Constat

Le système MFA existant (`web/local_auth.py`) nécessitait qu'un super-admin
émette d'abord un code d'invitation via `/api/auth/local/admin/enrollment-invite`
pour qu'un utilisateur puisse s'inscrire. Ce flux中央isé était un frein à
l'onboarding et ne permettait pas l'auto-service.

### Solution implémentée : auto-inscription avec approbation

Le nouveau flux (option B du cahier des charges) permet à l'utilisateur de
créer son propre mot de passe, avec approbation obligatoire du super-admin :

1. **Auto-inscription** : l'utilisateur soumet email + nom + mot de passe +
   rôle demandé via `POST /api/auth/local/register-request`. Le compte est
   créé avec statut `pending_approval`.
2. **Approbation super-admin** : le super-admin voit les demandes en attente
   dans la console et approuve ou rejette. Sur approbation, un code
   d'inscription à usage unique est généré.
3. **Complétion TOTP** : l'utilisateur saisit le code d'inscription, obtient
   un QR code TOTP à scanner avec son application d'authentification
   (Google Authenticator, Authy, 1Password), puis confirme avec un code à
   6 chiffres.
4. **Connexion** : l'utilisateur se connecte avec email + mot de passe + code
   TOTP de son application.

### Nouveaux endpoints backend

| Méthode | Path | Rôle | Description |
|---------|------|------|-------------|
| POST | `/api/auth/local/register-request` | Public | Auto-inscription (email, name, password, requested_role) |
| GET | `/api/auth/local/admin/pending-registrations` | super_admin | Liste des demandes en attente |
| POST | `/api/auth/local/admin/approve-registration` | super_admin | Approuver/rejeter une demande |
| POST | `/api/auth/local/complete-enrollment` | Public | Compléter l'inscription TOTP après approbation |

### Fichiers créés/modifiés

- **NOUVEAU** `web/registration_api.py` (260 lignes) — router complet avec
  4 endpoints, gestion des statuts `pending_approval` /
  `approved_pending_enrollment` / `rejected` / `active`
- `web/app.py` — enregistrement du router `registration_router`
- `web/labbench_canonical_api.py:226-251` — le step-up LABBENCH accepte
  maintenant **soit** le TOTP par utilisateur (RFC-6238, moderne, préféré)
  **soit** le code quotidien super-admin (fallback). Les deux chemins
  coexistent sans régression.

### Nouveaux composants frontend

- **NOUVEAU** `frontend/client/src/components/SelfRegistration.tsx` (133 lignes) —
  formulaire d'auto-inscription avec :
  - Validation mot de passe (min 14 caractères)
  - Indicateur de force visuel (4 segments)
  - Affichage/masquage du mot de passe
  - Sélecteur de rôle demandé
  - État de succès avec message d'attente d'approbation
- **NOUVEAU** `frontend/client/src/components/TotpEnrollment.tsx` (142 lignes) —
  assistant de complétion TOTP en 3 étapes :
  1. Saisie du code d'inscription (format `AER-xxxxx`)
  2. Affichage du QR code + secret manuel
  3. Confirmation avec code TOTP à 6 chiffres
- `frontend/client/src/components/LocalMfaLogin.tsx` (34 → 98 lignes) —
  ajout de 2 boutons sous le formulaire de connexion :
  - "Compléter mon inscription TOTP" (ouvre `TotpEnrollment`)
  - "Créer un compte" (ouvre `SelfRegistration`)

### Sécurité

- Le mot de passe est hashé en PBKDF2-HMAC-SHA256 (600 000 itérations)
- Le secret TOTP est chiffré en AES-GCM avant stockage en base
- Le code d'inscription est à usage unique, valable 24h
- Les comptes rejetés voient leur hash de mot de passe effacé
- Toutes les actions sont auditées (`account.registration_requested`,
  `account.registration_approved`, `account.registration_rejected`,
  `account.enrollment_started`)

---

## Phase 2 — Modernisation de la console super-admin

### Constat

La console `SuperAdmin.tsx` (159 lignes) offrait une gestion basique des
comptes mais n'était pas un véritable centre opérationnel.

### Solution implémentée

La console passe à 311 lignes avec :

- **Section "Vue d'ensemble"** enrichie avec 4 cartes KPI :
  - Comptes totaux
  - Demandes en attente (mise en évidence ambre)
  - Événements récents d'audit
  - Rapports
- **Nouvelle section "Approbations"** avec :
  - Badge de compteur en temps réel dans la navigation latérale
  - Tableau des demandes en attente (nom, email, rôle demandé, date, statut)
  - Boutons "Approuver" / "Rejeter" par ligne
  - Dialogue modal affichant le code d'inscription généré sur approbation
  - État vide avec icône `ClipboardCheck`
- **Carte "Mode opérationnel"** (nouveau composant `OperationModeCard`) :
  - Affichage du mode courant (DEMO/SIMULATION/SITL/HIL/HARDWARE/OFFLINE)
  - Sélecteur de mode avec contraintes de sécurité (HARDWARE requiert G0-G5)
  - Indicateur HARDWARE_CONTROL actif/inactif
- **Carte "Santé système"** :
  - 8 indicateurs (statut, environnement, DB, OIDC, Sentry, mode, hardware)
  - Statistiques base de données (projets, drones, missions, gates, tokens)
  - Alertes (event outbox non drainé, OIDC non configuré, etc.)
- **Carte "Capacités opérationnelles"** :
  - Bouton "Voir les capacités" qui appelle `/api/ops/capabilities`
  - Liste de tous les endpoints disponibles par catégorie

### Fichiers créés/modifiés

- **NOUVEAU** `frontend/client/src/components/OperationModeCard.tsx` (283 lignes) —
  composant autonome avec mode selector + health dashboard + capabilities
- `frontend/client/src/pages/SuperAdmin.tsx` (159 → 311 lignes) —
  ajout section "approvals", KPI cards, intégration `OperationModeCard`

---

## Phase 3 — Activation de tous les outils opérationnels

### Constat

Les endpoints opérationnels existaient mais n'étaient pas tous atteignables
depuis la console super-admin. Le mode opération était contrôlé par des
variables d'environnement sans interface de changement à chaud.

### Solution implémentée

**Nouveau router `web/ops_control_api.py`** (240 lignes) avec 4 endpoints :

| Méthode | Path | Rôle | Description |
|---------|------|------|-------------|
| GET | `/api/ops/mode` | Authentifié | Mode courant + transitions disponibles |
| POST | `/api/ops/mode` | super_admin | Changer le mode (avec safety gates) |
| GET | `/api/ops/health` | Authentifié | Santé système complète + statistiques DB |
| GET | `/api/ops/capabilities` | Authentifié | Liste de tous les endpoints par catégorie |

### Safety gates préservées

- Le mode HARDWARE nécessite que les 6 gates G0-G5 soient approuvées
  (`G0_gel`, `G1_securite`, `G2_fiabilite`, `G3_banc`, `G4_qualification`,
  `G5_exploitation`)
- Le changement de mode est réservé au super_admin
- Le mode HARDWARE requiert `HARDWARE_CONTROL=true` + gates approuvées
- Si la table `gate_validations` n'existe pas (migration non appliquée),
  le système fail-open avec log warning
- En multi-worker, un avertissement est émis car le changement d'env var
  n'affecte que le worker courant

### Activation des capacités

La console super-admin affiche maintenant :
- Le mode opérationnel courant et les transitions disponibles
- L'état de santé du système (DB, OIDC, Sentry, hardware)
- Les statistiques de la base de données (projets, drones, missions, gates,
  tokens matériels, événements d'audit, outbox en attente)
- La liste complète des capacités opérationnelles par catégorie

---

## Compatibilité et non-régression

### Préservation des fonctionnalités existantes

- ✅ Le flux d'invitation super-admin (`/api/auth/local/admin/enrollment-invite`)
  reste fonctionnel — les deux flux coexistent
- ✅ Le code TOTP quotidien super-admin reste accepté pour le step-up LABBENCH
  (en fallback du TOTP par utilisateur)
- ✅ Tous les tests existants passent (239 backend + 281 frontend)
- ✅ L'adresse `mcgregoralvin14@gmail.com` reste super-admin par défaut
  (décision utilisateur préservée)
- ✅ Tous les correctifs P0/P1/P2 de la livraison précédente sont conservés

### Décision utilisateur explicite

L'adresse `mcgregoralvin14@gmail.com` reste conservée comme adresse
super-admin par défaut, conformément à la décision explicite de
l'utilisateur du 30 octobre 2026, jusqu'à révocation personnelle.

---

## Structure des fichiers de cette livraison

```
AeroMind_OPERATIONAL_2026-10-30/
├── CHANGELOG-MODERNISATION-MFA.md    ← ce fichier
├── CHANGELOG-OPERATIONALISATION.md   ← changelog précédent (P0/P1/P2)
├── AeroMind_Inspection_Generale_2026-10-30.pdf  ← rapport d'inspection
├── web/
│   ├── registration_api.py           ← NOUVEAU (Phase 1)
│   ├── ops_control_api.py            ← NOUVEAU (Phase 3)
│   ├── app.py                        ← modifié (enregistrement routers)
│   ├── labbench_canonical_api.py     ← modifié (step-up TOTP hybride)
│   └── ... (autres modules inchangés)
├── frontend/client/src/
│   ├── components/
│   │   ├── SelfRegistration.tsx      ← NOUVEAU (Phase 1)
│   │   ├── TotpEnrollment.tsx        ← NOUVEAU (Phase 1)
│   │   ├── OperationModeCard.tsx     ← NOUVEAU (Phase 2/3)
│   │   └── LocalMfaLogin.tsx         ← modifié (Phase 1)
│   └── pages/
│       └── SuperAdmin.tsx            ← modifié (Phase 2)
└── ... (reste inchangé de la livraison précédente)
```

---

## Prochaines étapes recommandées

1. **Tester le flux d'auto-inscription** en pré-production :
   - Ouvrir la page de connexion MFA → "Créer un compte"
   - Soumettre une demande → vérifier qu'elle apparaît dans la console
     super-admin → "Approbations"
   - Approuver → transmettre le code à l'utilisateur
   - L'utilisateur complète l'inscription TOTP → se connecte
2. **Tester le changeur de mode** dans la console super-admin → "Vue d'ensemble"
   → carte "Mode opérationnel" → basculer entre SIMULATION/SITL/HIL
3. **Configurer OIDC Microsoft Entra** pour activer l'authentification Entra
   (actuellement marquée "Manquant" dans la carte santé)
4. **Installer `qrcode.react`** pour remplacer le placeholder QR externe
   (`api.qrserver.com`) par une génération locale (CSP-friendly)
5. **Surveiller Sentry** après configuration du `SENTRY_DSN`
