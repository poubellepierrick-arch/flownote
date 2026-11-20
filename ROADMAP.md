# Roadmap — Espace de travail (style Notion / AppFlowy)

## Objectif
Application de prise de notes, bases de données et importation Notion inspirée d'AppFlowy, en français, ultra-minimaliste, synchronisée avec Firebase Firestore et Auth.

## Contraintes respectées
- Interface et messages entièrement en français, vocabulaire sobre et minimaliste.
- `localStorage` réservé uniquement aux données d'identification/connexion (aucune donnée applicative).
- Aucune fenêtre popup dans l'application (confirmations, import, recherche et menus en ligne).
- `src/App.tsx` maintenu minimal (12 lignes), logique et composants externalisés.

## Étapes

### Phase 1 — Infrastructure & Sécurité Firebase
- [x] Provisionnement Firebase (Auth Google + Firestore)
- [x] Modèle de données (`firebase-blueprint.json`)
- [x] Spécification de sécurité et règles durcies (`security_spec.md`, `firestore.rules`, audit ESLint, déploiement)
- [x] Connexion SDK Firebase (`src/services/firebase.ts`) et gestion d'erreurs structurée

### Phase 2 — Cœur métier & Importateur Notion (inspiré d'AppFlowy)
- [x] Modèles TypeScript (`src/types/workspace.ts`)
- [x] Données initiales déterministes en français (`src/utils/seedWorkspace.ts`)
- [x] Parseur Notion complet `.zip` / `.md` / `.csv` / texte brut (`src/utils/notionImporter.ts`)
- [x] Utilitaires arborescence, fil d'Ariane et recherche (`src/utils/treeUtils.ts`)
- [x] Tests unitaires `node:test` sur l'importateur Notion et l'arborescence

### Phase 3 — Interface Ultra-Minimaliste & Éditeur
- [x] Typographie (`Plus Jakarta Sans`, `DM Sans`, `JetBrains Mono`) et thème clair/sombre (`src/index.css`)
- [x] Barre latérale arborescente : Favoris, Pages imbriquées, Recherche en ligne, Corbeille (`src/components/Sidebar.tsx`)
- [x] Éditeur de blocs AppFlowy : titres, texte, tâches, listes, citation, encadré, code, dépliant, menu `/`, raccourcis Markdown (`src/components/BlockEditor.tsx`)
- [x] Base de données multi-vues : Tableau, Kanban, Liste (`src/components/DatabaseView.tsx`)
- [x] Panneau d'importation Notion en ligne avec aperçu (`src/components/NotionImportView.tsx`)
- [x] Synchronisation temps réel Firestore (`src/services/workspaceService.ts`, `src/context/WorkspaceContext.tsx`)

### Phase 4 — Vérification complète
- [x] Compilation TypeScript & Vite (`compile_applet`, `lint_applet`)
- [x] Inspection navigateur réelle (`playwright-cli`) desktop & mobile + corrections

### Phase 5 — Compatibilité Notion avancée
- [x] Parseur Notion étendu : `<aside>`, `<details>` mono/multi-ligne, tableaux Markdown (`|...|`), signets/liens, exports `.html`, archives `.zip` imbriquées, déduplication `_all.csv` et normalisation des dates/devises/pourcentages/relations CSV
- [x] Éditeur : collage intelligent multi-blocs depuis Notion (`onPaste` Markdown/HTML), bloc Tableau éditable en ligne, bloc Signet (lien)
- [x] Bases de données : tri par colonne (`A→Z` / `Z→A`) et duplication de lignes
- [x] Synchronisation schéma `firebase-blueprint.json`, `firestore.rules` (audit ESLint + déploiement) et tests unitaires (13/13)

### Phase 6 — Importation complète de dossiers Notion
- [x] Lecteur de dossier local (`webkitdirectory`) et glisser-déposer récursif de répertoires (`src/utils/notionFolderReader.ts`)
- [x] Parseur hiérarchique unifié (`parseNotionEntries`) : normalisation Unicode NFC, résolution d'ancêtres sans pages virtuelles, tri topologique et décompte média
- [x] Sélecteur de destination (`Racine de l'espace` ou page existante) et aperçu arborescent indenté (`NotionImportView`, `workspaceService`, `WorkspaceContext`)
- [x] Tests unitaires (14/14), compilation, typage et vérification navigateur réelle d'un dossier complet multi-niveaux

### Phase 7 — Bases complètes, relations inter-bases, agrégats, formules & liens internes
- [x] Suppression des plafonds artificiels CSV (import intégral des lignes et jusqu'à 100 colonnes conforme Firestore) et inférence `multi_select`
- [x] Moteur de formules Notion complet sans `eval` (`src/utils/notionFormula.ts`) : `prop()`, arithmétique, logique, texte, dates, listes, agrégats (`count`, `sum`, `avg`, `min`, `max`, `values`, `checked_count`) et résolution en chaîne
- [x] Reconstruction automatique à l'import des relations inter-bases, liaison des lignes vers leur fiche sous-page (`linkedPageId`) et liens internes cliquables entre pages (`flownote://page/...`) via `src/utils/notionImportMaterializer.ts`
- [x] Éditeur de base étendu (`DatabaseView.tsx`) : configuration en ligne des 10 types de colonnes, sélecteur de relation cliquable, éditeur de formules avec aperçu et bouton `Ouvrir` par ligne
- [x] Synchronisation schéma `firebase-blueprint.json` et `firestore.rules` déployés (`DeployRules`), 17/17 tests unitaires et vérification navigateur complète

### Phase 8 — Écosystème relationnel Impro (Exercices, Séances, Groupes, Participants)
- [x] Importateur & parseur CSV Notion dédié (`src/utils/improCsvLoader.ts`) pour `Biblimpro`, `Séances`, `Groupe` et `Participants` : nettoyage des colonnes parasites et lignes de pause, conversion des dates françaises en ISO, désambiguïsation par UUID (homonymes `Julie` / `Thibaud`) et réconciliation bidirectionnelle initiale
- [x] Moteur logique et bidirectionnel (`src/utils/improEngine.ts`) : déduction multi-sauts par exercice (`Séances` → `Groupes` et `Participants`, dernière utilisation), déduction par participant et par groupe des exercices faits vs jamais faits, synchronisation bidirectionnelle automatique entre les 4 bases et pré-remplissage des participants par groupe
- [x] Vue dédiée `Chronologie` Qui / Quoi / Quand (`src/components/ImproTimelineView.tsx`) avec filtres (Participant, Groupe, Exercice, Étape, Période), mode `Par participant` (`Faits` / `Jamais faits`) et création rapide de séance en ligne avec pré-remplissage par groupe
- [x] Panneau fiche en ligne (`src/components/ImproDetailPanel.tsx`), colonnes déduites dans `DatabaseView.tsx`, navigation dédiée dans `Sidebar.tsx` (autres outils repliables conservés) et écritures Firestore par lots dans `workspaceService.ts`
- [x] Tests unitaires sur les CSV réels et le moteur bidirectionnel (`improCsvLoader.test.ts`, `improEngine.test.ts`)
- [x] Tri automatique multi-colonnes par ordre de priorité (`src/utils/databaseSort.ts`, `DatabaseView.tsx`, `WorkspaceContext.tsx`) avec réordonnancement de priorité, tri sur colonnes déduites et tests unitaires (`databaseSort.test.ts`)

### Phase 9 — Ergonomie des tableaux, colonnes à cocher (1, 2, V) et tri direct par en-tête
- [x] Importation des 3 colonnes à cocher (`1`, `2`, `V`) depuis `Biblimpro` CSV dans `Exercices` (`src/utils/improCsvLoader.ts`, `src/utils/improEngine.ts`, `ImproDetailPanel.tsx`) avec rattrapage non destructif des bases existantes (`WorkspaceContext.tsx`)
- [x] Tri direct par clic sur l'en-tête de colonne (`1↑`, `2↓`...) avec libellés explicites pour cases à cocher (`☑ → ☐` / `☐ → ☑`) et nombres/agrégats (`0 → 9` / `9 → 0`)
- [x] Pleine largeur utile sur les vues bases & chronologie (`DatabaseView.tsx`, `ImproTimelineView.tsx`), largeurs compactes par défaut et redimensionnement interactif des colonnes par glisser/double-clic (`<colgroup>`)

### Phase 10 — Ordre personnalisé des choix & sauvegarde Firebase intégrale
- [x] Réorganisation en ligne des choix (`select`, `multi_select`) par glisser-déposer ou flèches `↑`/`↓` (`src/components/ChoiceOrderEditor.tsx`) accessible depuis la configuration de colonne et directement dans le panneau `Tri par priorité`
- [x] Moteur de tri selon l'ordre personnalisé des choix (`src/utils/databaseSort.ts`, `Ordre ↑` / `Ordre ↓`, étiquettes triées) et tests unitaires dédiés (`src/utils/databaseSort.test.ts`)
- [x] Persistance Firestore complète de `sortRules`, `columnWidths` et `columns.options` sur `WorkspacePage` (`firebase-blueprint.json`, `firestore.rules` déployées, `workspaceService.ts`, `WorkspaceContext.tsx`) avec fusion des écritures en attente et stabilité des abonnements temps réel
