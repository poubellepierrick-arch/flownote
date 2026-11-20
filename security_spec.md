# Spécification de sécurité Firestore (Phase 0 — Payload-First TDD)

## 1. Invariants de données
1. Un profil `/users/{userId}` ne peut être lu, créé ou modifié que par le propriétaire authentifié (`request.auth.uid == userId`) avec email vérifié. Aucune lecture globale `list` n'est autorisée (isolation PII).
2. Un espace `/workspaces/{workspaceId}` appartient à un seul `ownerId == request.auth.uid`. `ownerId` et `createdAt` sont immuables après création.
3. Une page `/workspaces/{workspaceId}/pages/{pageId}` ne peut exister que si le workspace parent existe et appartient à `request.auth.uid` (Master Gate `get()`). `workspaceId`, `ownerId` et `createdAt` sont immuables.
4. Une ligne `/workspaces/{workspaceId}/pages/{pageId}/rows/{rowId}` ne peut exister que si la page parente existe et appartient à `request.auth.uid`. `pageId`, `workspaceId`, `ownerId` et `createdAt` sont immuables.
5. Tous les horodatages (`createdAt`, `updatedAt`) doivent correspondre exactement à `request.time`.
6. Toutes les listes (`blocks`, `columns`) sont strictement bornées en taille et validées en type.
7. Toute requête `list` valide directement `resource.data.ownerId == request.auth.uid` sans appel `get()`.

## 2. Les 12 charges malveillantes ("Dirty Dozen")
1. **Usurpation d'identité (Create User)** : `uid: "other-uid"` sous `/users/attacker` -> `PERMISSION_DENIED`.
2. **Fuite PII (Read User)** : Lecture de `/users/victim` par `attacker` -> `PERMISSION_DENIED`.
3. **Listage global utilisateurs** : `list /users` par un utilisateur connecté -> `PERMISSION_DENIED`.
4. **Champ fantôme (Shadow Field)** : Création de page avec `{ ..., isAdmin: true }` -> `PERMISSION_DENIED`.
5. **Poisoning d'ID** : ID de page contenant 500 caractères ou des caractères invalides (`../hack`) -> `PERMISSION_DENIED`.
6. **Horodatage falsifié** : Création avec `createdAt: "2020-01-01"` au lieu de `request.time` -> `PERMISSION_DENIED`.
7. **Orphelinat de page** : Création de page sous `/workspaces/nonexistent/pages/p1` -> `PERMISSION_DENIED`.
8. **Transfert de propriété (Update)** : Mise à jour de `ownerId` sur une page existante -> `PERMISSION_DENIED`.
9. **Explosion de tableau** : Création d'une page avec `blocks` de taille 401 -> `PERMISSION_DENIED`.
10. **Type invalide** : Mise à jour de `title` avec un nombre `12345` ou une chaîne > 200 caractères -> `PERMISSION_DENIED`.
11. **Requête non filtrée (List Pages)** : `list` sur `/workspaces/w1/pages` sans contrainte `ownerId == auth.uid` -> `PERMISSION_DENIED`.
12. **Email non vérifié** : Écriture authentifiée avec `email_verified: false` -> `PERMISSION_DENIED`.
