import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import type {
  BlockItem,
  CellValue,
  DatabaseColumn,
  DatabaseRow,
  DatabaseSortRule,
  DatabaseViewType,
  ImproPrepareDraftConfig,
  ImproTimelineFilterPreset,
  MainViewMode,
  PageType,
  SyncStatus,
  ThemeMode,
  WorkspacePage,
} from '../types/workspace';
import { generateId } from '../utils/id';
import {
  fetchAndBuildImproEcosystem,
  IMPRO_COL_IDS,
  IMPRO_DB_IDS,
  type ImproEcosystemDataset,
} from '../utils/improCsvLoader';
import {
  computeBidirectionalRowPatches,
  computeDeleteRowMirrorCleanup,
  computeImproEcosystem,
  getGroupMemberIds,
  normalizeSessionStatus,
  type ImproEcosystemModel,
} from '../utils/improEngine';
import type { ImportedPageDraft } from '../utils/notionImporter';
import { materializeImportedDrafts } from '../utils/notionImportMaterializer';
import { createSeedWorkspace } from '../utils/seedWorkspace';
import { getPrimaryColumn } from '../utils/columnOrder';
import { getDescendantIds } from '../utils/treeUtils';
import { auth, googleProvider } from '../services/firebase';
import {
  batchUpsertRowsInFirestore,
  createPageInFirestore,
  deletePagePermanentlyInFirestore,
  deleteRowInFirestore,
  ensureUserAndWorkspace,
  importNotionPagesToFirestore,
  seedImproDatabasesToFirestore,
  subscribeDatabaseRows,
  subscribeWorkspacePages,
  updatePageContentInFirestore,
  updatePageFlagsInFirestore,
  updateUserThemeInFirestore,
  upsertRowInFirestore,
} from '../services/workspaceService';

export interface ImproDetailTarget {
  pageId: string;
  rowId: string;
}

interface WorkspaceContextValue {
  user: User | null;
  authReady: boolean;
  authError: string | null;
  syncStatus: SyncStatus;
  theme: ThemeMode;
  toggleTheme: () => void;
  signInGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  pages: WorkspacePage[];
  rowsByPage: Record<string, DatabaseRow[]>;
  activePageId: string | null;
  activePage: WorkspacePage | null;
  mainView: MainViewMode;
  setMainView: (view: MainViewMode) => void;
  selectPage: (pageId: string) => void;
  createPage: (type: PageType, parentId?: string | null) => Promise<string>;
  updatePageTitle: (pageId: string, title: string) => void;
  updatePageIcon: (pageId: string, icon: string) => void;
  updatePageBlocks: (pageId: string, blocks: BlockItem[]) => void;
  updateDatabaseColumns: (pageId: string, columns: DatabaseColumn[]) => void;
  updateDatabaseView: (pageId: string, view: DatabaseViewType) => void;
  databaseSorts: Record<string, DatabaseSortRule[]>;
  setDatabaseSorts: (pageId: string, rules: DatabaseSortRule[]) => void;
  columnWidths: Record<string, Record<string, number>>;
  setColumnWidth: (pageId: string, colId: string, width: number) => void;
  resetColumnWidth: (pageId: string, colId?: string) => void;
  tableColumnOrders: Record<string, string[]>;
  setTableColumnOrder: (tableKey: string, order: string[]) => void;
  toggleFavorite: (pageId: string) => Promise<void>;
  moveToTrash: (pageId: string) => Promise<void>;
  restoreFromTrash: (pageId: string) => Promise<void>;
  deletePermanently: (pageId: string) => Promise<void>;
  addDatabaseRow: (
    pageId: string,
    initialCells?: Record<string, CellValue>
  ) => Promise<string | undefined>;
  updateDatabaseRow: (
    pageId: string,
    rowId: string,
    cells: Record<string, CellValue>,
    linkedPageId?: string | null
  ) => void;
  deleteDatabaseRow: (pageId: string, rowId: string) => Promise<void>;
  openOrCreateRowPage: (dbPageId: string, rowId: string) => Promise<string | null>;
  importNotionDrafts: (drafts: ImportedPageDraft[], targetParentId?: string | null) => Promise<string[]>;
  pendingLocalDraftsCount: number;
  migrateLocalPagesToCloud: () => Promise<void>;
  dismissLocalMigration: () => void;
  // Écosystème Impro
  improModel: ImproEcosystemModel;
  improLoading: boolean;
  improError: string | null;
  improDetailTarget: ImproDetailTarget | null;
  openImproDetail: (pageId: string, rowId: string) => void;
  closeImproDetail: () => void;
  prefillSeanceFromGroup: (seanceRowId: string, mode?: 'merge' | 'replace') => void;
  toggleSeanceStatus: (seanceRowId: string) => void;
  toggleSeanceParticipant: (seanceRowId: string, participantId: string) => void;
  timelinePreset: ImproTimelineFilterPreset | null;
  navigateToTimeline: (preset?: ImproTimelineFilterPreset) => void;
  clearTimelinePreset: () => void;
  prepareDraft: ImproPrepareDraftConfig | null;
  navigateToPrepare: (config?: ImproPrepareDraftConfig) => void;
  clearPrepareDraft: () => void;
  loadImproDatabases: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function asIdList(val: CellValue | undefined): string[] {
  if (Array.isArray(val)) return val.map(String).filter(Boolean);
  if (typeof val === 'string' && val.trim()) return [val.trim()];
  return [];
}

function sameStringArray(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const initialSeed = useMemo(() => createSeedWorkspace('local', 'local'), []);

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string>('local');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('local');
  const [theme, setTheme] = useState<ThemeMode>('light');

  const [pages, setPages] = useState<WorkspacePage[]>(initialSeed.pages);
  const [rowsByPage, setRowsByPage] = useState<Record<string, DatabaseRow[]>>(initialSeed.rowsByPage);
  const [activePageId, setActivePageId] = useState<string | null>(initialSeed.pages[0]?.id ?? null);
  const [mainView, setMainView] = useState<MainViewMode>('chronology');
  const [localDirtyPages, setLocalDirtyPages] = useState<WorkspacePage[]>([]);
  const [hasLocalEdits, setHasLocalEdits] = useState(false);

  const [improLoading, setImproLoading] = useState(true);
  const [improError, setImproError] = useState<string | null>(null);
  const [improDetailTarget, setImproDetailTarget] = useState<ImproDetailTarget | null>(null);
  const [timelinePreset, setTimelinePreset] = useState<ImproTimelineFilterPreset | null>(null);
  const [prepareDraft, setPrepareDraft] = useState<ImproPrepareDraftConfig | null>(null);
  const [tableColumnOrders, setTableColumnOrders] = useState<Record<string, string[]>>({});

  const pagesRef = useRef(pages);
  pagesRef.current = pages;

  const rowsRef = useRef(rowsByPage);
  rowsRef.current = rowsByPage;

  const userRef = useRef(user);
  userRef.current = user;

  const hasLocalEditsRef = useRef(hasLocalEdits);
  hasLocalEditsRef.current = hasLocalEdits;

  const improCsvCacheRef = useRef<ImproEcosystemDataset | null>(null);
  const backfilledCheckboxesKeyRef = useRef<string | null>(null);
  const backfilledSeanceMetaKeyRef = useRef<string | null>(null);

  const saveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pendingPagePatchesRef = useRef<
    Map<string, Parameters<typeof updatePageContentInFirestore>[2]>
  >(new Map());
  const pendingRowBatchRef = useRef<Map<string, DatabaseRow>>(new Map());
  const rowBatchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Synchroniser la classe CSS .dark sur <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  // Charger les 4 CSV Impro en mémoire locale au démarrage (hors connexion)
  useEffect(() => {
    let cancelled = false;
    setImproLoading(true);
    setImproError(null);
    fetchAndBuildImproEcosystem('local', 'local', 0)
      .then((dataset) => {
        if (cancelled) return;
        improCsvCacheRef.current = dataset;
        if (!userRef.current && !hasLocalEditsRef.current) {
          setPages(dataset.pages);
          setRowsByPage(dataset.rowsByPage);
          setActivePageId(dataset.pages[0]?.id ?? null);
        }
        setImproLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setImproLoading(false);
        setImproError(err instanceof Error ? err.message : 'Erreur chargement CSV');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Suivi Firebase Auth
  useEffect(() => {
    let unsubPages: (() => void) | null = null;
    const unsubAuth = onAuthStateChanged(auth, async (nextUser) => {
      if (unsubPages) {
        unsubPages();
        unsubPages = null;
      }

      if (!nextUser) {
        setUser(null);
        setWorkspaceId('local');
        setSyncStatus('local');
        setAuthReady(true);
        return;
      }

      setUser(nextUser);
      setAuthError(null);
      setSyncStatus('syncing');

      if (hasLocalEditsRef.current) {
        setLocalDirtyPages(pagesRef.current.filter((p) => !p.isTrashed));
      }

      try {
        const res = await ensureUserAndWorkspace(nextUser, theme);
        setWorkspaceId(res.workspaceId);
        setTheme(res.theme);

        unsubPages = subscribeWorkspacePages(res.workspaceId, nextUser.uid, (cloudPages) => {
          const mergedPages = cloudPages.map((cp) => {
            const pending = pendingPagePatchesRef.current.get(cp.id);
            return pending ? { ...cp, ...pending } : cp;
          });
          setPages(mergedPages);
          setSyncStatus('synced');
          setActivePageId((prev) => {
            if (prev && mergedPages.some((p) => p.id === prev && !p.isTrashed)) {
              return prev;
            }
            const firstActive = mergedPages.find((p) => !p.isTrashed);
            return firstActive?.id ?? null;
          });
        });
      } catch (err) {
        setSyncStatus('error');
        setAuthError(err instanceof Error ? err.message : 'Erreur de synchronisation');
      } finally {
        setAuthReady(true);
      }
    });

    return () => {
      unsubAuth();
      if (unsubPages) unsubPages();
    };
  }, []);

  const activeDbIdsKey = useMemo(
    () =>
      pages
        .filter((p) => p.type === 'database' && !p.isTrashed)
        .map((p) => p.id)
        .sort()
        .join(','),
    [pages]
  );

  // Abonnement temps réel aux lignes des bases de données lorsque connecté
  useEffect(() => {
    if (!user || workspaceId === 'local' || !activeDbIdsKey) return;
    const dbIds = activeDbIdsKey.split(',').filter(Boolean);
    const unsubs = dbIds.map((dbPageId) =>
      subscribeDatabaseRows(workspaceId, dbPageId, user.uid, (rows) => {
        setRowsByPage((prev) => ({ ...prev, [dbPageId]: rows }));
      })
    );
    return () => {
      unsubs.forEach((u) => u());
    };
  }, [user, workspaceId, activeDbIdsKey]);

  // Rattrapage non destructif des 3 colonnes à cocher (1, 2, V) si une base Exercices déjà synchronisée ne les a pas encore
  useEffect(() => {
    const exPage = pages.find((p) => p.id === IMPRO_DB_IDS.exercices && !p.isTrashed);
    const exRows = rowsByPage[IMPRO_DB_IDS.exercices];
    if (!exPage || !exRows || exRows.length === 0) return;

    const requiredIds = [
      IMPRO_COL_IDS.exercices.check1,
      IMPRO_COL_IDS.exercices.check2,
      IMPRO_COL_IDS.exercices.checkV,
    ];
    const existingColIds = new Set((exPage.columns ?? []).map((c) => c.id));
    const missingColIds = requiredIds.filter((id) => !existingColIds.has(id));
    if (missingColIds.length === 0) return;

    const backfillKey = `${workspaceId}:${user?.uid ?? 'local'}`;
    if (backfilledCheckboxesKeyRef.current === backfillKey) return;
    backfilledCheckboxesKeyRef.current = backfillKey;

    let cancelled = false;
    (async () => {
      try {
        const csvDataset =
          improCsvCacheRef.current ??
          (await fetchAndBuildImproEcosystem(workspaceId, user?.uid ?? 'local', 0));
        if (cancelled) return;
        improCsvCacheRef.current = csvDataset;

        const csvExPage = csvDataset.pages.find((p) => p.id === IMPRO_DB_IDS.exercices);
        const csvCheckCols = (csvExPage?.columns ?? []).filter((c) =>
          missingColIds.includes(c.id as (typeof requiredIds)[number])
        );
        if (csvCheckCols.length === 0) return;

        const currentCols = exPage.columns ?? [];
        const insertAfterIdx = currentCols.findIndex((c) => c.id === IMPRO_COL_IDS.exercices.nom);
        const pivot = insertAfterIdx >= 0 ? insertAfterIdx + 1 : 1;
        const mergedCols = [
          ...currentCols.slice(0, pivot),
          ...csvCheckCols,
          ...currentCols.slice(pivot),
        ];

        const csvExRows = csvDataset.rowsByPage[IMPRO_DB_IDS.exercices] ?? [];
        const csvById = new Map(csvExRows.map((r) => [r.id, r]));
        const csvByName = new Map(
          csvExRows.map((r) => [
            String(r.cells[IMPRO_COL_IDS.exercices.nom] ?? '').trim().toLowerCase(),
            r,
          ])
        );

        const patchedRows: DatabaseRow[] = [];
        const nextExRows = exRows.map((row) => {
          const rowName = String(row.cells[IMPRO_COL_IDS.exercices.nom] ?? '').trim().toLowerCase();
          const sourceRow = csvById.get(row.id) ?? csvByName.get(rowName);
          let changed = false;
          const nextCells = { ...row.cells };
          for (const cid of requiredIds) {
            if (!(cid in nextCells)) {
              nextCells[cid] = Boolean(sourceRow?.cells[cid]);
              changed = true;
            }
          }
          if (!changed) return row;
          const updatedRow: DatabaseRow = { ...row, cells: nextCells };
          patchedRows.push(updatedRow);
          return updatedRow;
        });

        setPages((prev) =>
          prev.map((p) => (p.id === IMPRO_DB_IDS.exercices ? { ...p, columns: mergedCols } : p))
        );
        if (patchedRows.length > 0) {
          setRowsByPage((prev) => ({ ...prev, [IMPRO_DB_IDS.exercices]: nextExRows }));
        }

        if (user && workspaceId !== 'local') {
          await updatePageContentInFirestore(workspaceId, IMPRO_DB_IDS.exercices, {
            columns: mergedCols,
          });
          if (patchedRows.length > 0) {
            await batchUpsertRowsInFirestore(patchedRows);
          }
        }
      } catch {
        // Rattrapage silencieux : l'utilisateur conserve ses données actuelles
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pages, rowsByPage, user, workspaceId]);

  // Rattrapage non destructif des colonnes Statut et Notes sur la base Séances
  useEffect(() => {
    const seaPage = pages.find((p) => p.id === IMPRO_DB_IDS.seances && !p.isTrashed);
    const seaRows = rowsByPage[IMPRO_DB_IDS.seances];
    if (!seaPage || !seaRows) return;

    const existingColIds = new Set((seaPage.columns ?? []).map((c) => c.id));
    const missingStatut = !existingColIds.has(IMPRO_COL_IDS.seances.statut);
    const missingNotes = !existingColIds.has(IMPRO_COL_IDS.seances.notes);
    if (!missingStatut && !missingNotes) return;

    const backfillKey = `${workspaceId}:${user?.uid ?? 'local'}`;
    if (backfilledSeanceMetaKeyRef.current === backfillKey) return;
    backfilledSeanceMetaKeyRef.current = backfillKey;

    const nextCols = [...(seaPage.columns ?? [])];
    if (missingStatut) {
      const dateIdx = nextCols.findIndex((c) => c.id === IMPRO_COL_IDS.seances.date);
      const statutCol: DatabaseColumn = {
        id: IMPRO_COL_IDS.seances.statut,
        name: 'Statut',
        type: 'select',
        options: ['Réalisée', 'Préparée'],
      };
      if (dateIdx >= 0) nextCols.splice(dateIdx + 1, 0, statutCol);
      else nextCols.push(statutCol);
    }
    if (missingNotes) {
      nextCols.push({ id: IMPRO_COL_IDS.seances.notes, name: 'Notes', type: 'text' });
    }

    const patchedRows: DatabaseRow[] = [];
    const nextSeaRows = seaRows.map((row) => {
      if (IMPRO_COL_IDS.seances.statut in row.cells) return row;
      const updatedRow: DatabaseRow = {
        ...row,
        cells: {
          ...row.cells,
          [IMPRO_COL_IDS.seances.statut]: 'Réalisée',
          ...(IMPRO_COL_IDS.seances.notes in row.cells ? {} : { [IMPRO_COL_IDS.seances.notes]: '' }),
        },
      };
      patchedRows.push(updatedRow);
      return updatedRow;
    });

    setPages((prev) =>
      prev.map((p) => (p.id === IMPRO_DB_IDS.seances ? { ...p, columns: nextCols } : p))
    );
    if (patchedRows.length > 0) {
      setRowsByPage((prev) => ({ ...prev, [IMPRO_DB_IDS.seances]: nextSeaRows }));
    }

    if (user && workspaceId !== 'local') {
      void (async () => {
        try {
          await updatePageContentInFirestore(workspaceId, IMPRO_DB_IDS.seances, {
            columns: nextCols,
          });
          if (patchedRows.length > 0) {
            await batchUpsertRowsInFirestore(patchedRows);
          }
        } catch {
          // Rattrapage silencieux
        }
      })();
    }
  }, [pages, rowsByPage, user, workspaceId]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: ThemeMode = prev === 'light' ? 'dark' : 'light';
      if (user) {
        void updateUserThemeInFirestore(user.uid, next);
      }
      return next;
    });
  }, [user]);

  const signInGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connexion annulée';
      setAuthError(msg);
    }
  }, []);

  const signOutUser = useCallback(async () => {
    for (const timer of saveTimersRef.current.values()) {
      clearTimeout(timer);
    }
    saveTimersRef.current.clear();
    pendingPagePatchesRef.current.clear();
    await signOut(auth);
    setHasLocalEdits(false);
    setLocalDirtyPages([]);
    setImproDetailTarget(null);
    setMainView('chronology');
    try {
      const dataset = await fetchAndBuildImproEcosystem('local', 'local', 0);
      setPages(dataset.pages);
      setRowsByPage(dataset.rowsByPage);
      setActivePageId(dataset.pages[0]?.id ?? null);
    } catch {
      const freshSeed = createSeedWorkspace('local', 'local');
      setPages(freshSeed.pages);
      setRowsByPage(freshSeed.rowsByPage);
      setActivePageId(freshSeed.pages[0]?.id ?? null);
    }
  }, []);

  const selectPage = useCallback((pageId: string) => {
    setActivePageId(pageId);
    setMainView('page');
  }, []);

  const openImproDetail = useCallback((pageId: string, rowId: string) => {
    setImproDetailTarget({ pageId, rowId });
  }, []);

  const closeImproDetail = useCallback(() => {
    setImproDetailTarget(null);
  }, []);

  const navigateToTimeline = useCallback((preset?: ImproTimelineFilterPreset) => {
    setTimelinePreset(preset ?? null);
    setMainView('chronology');
  }, []);

  const clearTimelinePreset = useCallback(() => {
    setTimelinePreset(null);
  }, []);

  const navigateToPrepare = useCallback((config?: ImproPrepareDraftConfig) => {
    setPrepareDraft((prev) => {
      if (!config) return null;
      if (config.addExerciseIds && !config.seanceId && !config.duplicateFromId && !config.groupId) {
        const merged = Array.from(new Set([...(prev?.addExerciseIds ?? []), ...config.addExerciseIds]));
        return { ...(prev ?? {}), addExerciseIds: merged };
      }
      return config;
    });
    setMainView('prepare');
  }, []);

  const clearPrepareDraft = useCallback(() => {
    setPrepareDraft(null);
  }, []);

  const schedulePageSave = useCallback(
    (pageId: string, patch: Parameters<typeof updatePageContentInFirestore>[2]) => {
      if (!user || workspaceId === 'local') {
        setHasLocalEdits(true);
        return;
      }

      setSyncStatus('syncing');
      const prevPatch = pendingPagePatchesRef.current.get(pageId) ?? {};
      pendingPagePatchesRef.current.set(pageId, { ...prevPatch, ...patch });

      const existingTimer = saveTimersRef.current.get(pageId);
      if (existingTimer) clearTimeout(existingTimer);

      const timer = setTimeout(async () => {
        saveTimersRef.current.delete(pageId);
        const mergedPatch = pendingPagePatchesRef.current.get(pageId);
        pendingPagePatchesRef.current.delete(pageId);
        if (!mergedPatch) return;
        try {
          await updatePageContentInFirestore(workspaceId, pageId, mergedPatch);
          setSyncStatus('synced');
        } catch {
          setSyncStatus('error');
        }
      }, 280);

      saveTimersRef.current.set(pageId, timer);
    },
    [user, workspaceId]
  );

  const queueRowsBatchSave = useCallback(
    (rowsToSave: DatabaseRow[]) => {
      if (!user || workspaceId === 'local') {
        setHasLocalEdits(true);
        return;
      }

      setSyncStatus('syncing');
      for (const r of rowsToSave) {
        pendingRowBatchRef.current.set(`${r.pageId}::${r.id}`, r);
      }

      if (rowBatchTimerRef.current) clearTimeout(rowBatchTimerRef.current);
      rowBatchTimerRef.current = setTimeout(async () => {
        const batchList = Array.from(pendingRowBatchRef.current.values());
        pendingRowBatchRef.current.clear();
        rowBatchTimerRef.current = null;
        if (batchList.length === 0) return;
        try {
          await batchUpsertRowsInFirestore(batchList);
          setSyncStatus('synced');
        } catch {
          setSyncStatus('error');
        }
      }, 350);
    },
    [user, workspaceId]
  );

  const applyMirrorPatchesToRowsMap = (
    prev: Record<string, DatabaseRow[]>,
    patches: DatabaseRow[]
  ): Record<string, DatabaseRow[]> => {
    if (patches.length === 0) return prev;
    const next = { ...prev };
    const byPage = new Map<string, Map<string, DatabaseRow>>();
    for (const p of patches) {
      const m = byPage.get(p.pageId) ?? new Map<string, DatabaseRow>();
      m.set(p.id, p);
      byPage.set(p.pageId, m);
    }
    for (const [pid, patchMap] of byPage.entries()) {
      next[pid] = (next[pid] ?? []).map((r) => patchMap.get(r.id) ?? r);
    }
    return next;
  };

  const createPage = useCallback(
    async (type: PageType, parentId: string | null = null): Promise<string> => {
      const ownerId = user?.uid ?? 'local';
      const id = generateId('page');
      const order = pagesRef.current.length;

      const defaultColumns: DatabaseColumn[] = [
        { id: 'col_titre', name: 'Nom', type: 'text' },
        { id: 'col_statut', name: 'Statut', type: 'select', options: ['À faire', 'En cours', 'Terminé'] },
        { id: 'col_date', name: 'Date', type: 'date' },
        { id: 'col_ok', name: 'Fait', type: 'checkbox' },
      ];

      const newPage: WorkspacePage = {
        id,
        workspaceId,
        ownerId,
        parentId,
        title: type === 'database' ? 'Nouvelle base' : 'Sans titre',
        icon: type === 'database' ? '⊞' : '📄',
        type,
        isFavorite: false,
        isTrashed: false,
        order,
        source: 'native',
        blocks: type === 'document' ? [{ id: generateId('blk'), type: 'paragraph', content: '' }] : [],
        ...(type === 'database' ? { columns: defaultColumns, activeView: 'table' as const } : {}),
      };

      const initialRows: DatabaseRow[] =
        type === 'database'
          ? [
              {
                id: generateId('row'),
                pageId: id,
                workspaceId,
                ownerId,
                order: 0,
                cells: {
                  col_titre: 'Premier élément',
                  col_statut: 'À faire',
                  col_date: '',
                  col_ok: false,
                },
              },
            ]
          : [];

      setPages((prev) => [...prev, newPage]);
      if (type === 'database') {
        setRowsByPage((prev) => ({ ...prev, [id]: initialRows }));
      }
      setActivePageId(id);
      setMainView('page');

      if (!user || workspaceId === 'local') {
        setHasLocalEdits(true);
      } else {
        setSyncStatus('syncing');
        await createPageInFirestore(newPage, initialRows);
        setSyncStatus('synced');
      }

      return id;
    },
    [user, workspaceId]
  );

  const updatePageTitle = useCallback(
    (pageId: string, title: string) => {
      const clamped = title.slice(0, 200);
      setPages((prev) => prev.map((p) => (p.id === pageId ? { ...p, title: clamped } : p)));
      schedulePageSave(pageId, { title: clamped });
    },
    [schedulePageSave]
  );

  const updatePageIcon = useCallback(
    (pageId: string, icon: string) => {
      const clamped = icon.slice(0, 32);
      setPages((prev) => prev.map((p) => (p.id === pageId ? { ...p, icon: clamped } : p)));
      schedulePageSave(pageId, { icon: clamped });
    },
    [schedulePageSave]
  );

  const updatePageBlocks = useCallback(
    (pageId: string, blocks: BlockItem[]) => {
      const clamped = blocks.slice(0, 400);
      setPages((prev) => prev.map((p) => (p.id === pageId ? { ...p, blocks: clamped } : p)));
      schedulePageSave(pageId, { blocks: clamped });
    },
    [schedulePageSave]
  );

  const updateDatabaseColumns = useCallback(
    (pageId: string, columns: DatabaseColumn[]) => {
      const clamped = columns.slice(0, 100);
      setPages((prev) => prev.map((p) => (p.id === pageId ? { ...p, columns: clamped } : p)));
      schedulePageSave(pageId, { columns: clamped });
    },
    [schedulePageSave]
  );

  const updateDatabaseView = useCallback(
    (pageId: string, activeView: DatabaseViewType) => {
      setPages((prev) => prev.map((p) => (p.id === pageId ? { ...p, activeView } : p)));
      schedulePageSave(pageId, { activeView });
    },
    [schedulePageSave]
  );

  const setDatabaseSorts = useCallback(
    (pageId: string, rules: DatabaseSortRule[]) => {
      const clamped = rules.slice(0, 30);
      setPages((prev) => prev.map((p) => (p.id === pageId ? { ...p, sortRules: clamped } : p)));
      schedulePageSave(pageId, { sortRules: clamped });
    },
    [schedulePageSave]
  );

  const setColumnWidth = useCallback(
    (pageId: string, colId: string, width: number) => {
      const clamped = Math.max(46, Math.min(640, Math.round(width)));
      const target = pagesRef.current.find((p) => p.id === pageId);
      const nextWidths = {
        ...(target?.columnWidths ?? {}),
        [colId]: clamped,
      };
      setPages((prev) =>
        prev.map((p) =>
          p.id === pageId
            ? {
                ...p,
                columnWidths: {
                  ...(p.columnWidths ?? {}),
                  [colId]: clamped,
                },
              }
            : p
        )
      );
      schedulePageSave(pageId, { columnWidths: nextWidths });
    },
    [schedulePageSave]
  );

  const resetColumnWidth = useCallback(
    (pageId: string, colId?: string) => {
      const target = pagesRef.current.find((p) => p.id === pageId);
      const current = target?.columnWidths;
      if (!current) return;
      const nextWidths: Record<string, number> = colId ? { ...current } : {};
      if (colId) delete nextWidths[colId];
      setPages((prev) =>
        prev.map((p) => (p.id === pageId ? { ...p, columnWidths: nextWidths } : p))
      );
      schedulePageSave(pageId, { columnWidths: nextWidths });
    },
    [schedulePageSave]
  );

  const setTableColumnOrder = useCallback((tableKey: string, order: string[]) => {
    setTableColumnOrders((prev) => ({ ...prev, [tableKey]: order }));
  }, []);

  const toggleFavorite = useCallback(
    async (pageId: string) => {
      const target = pagesRef.current.find((p) => p.id === pageId);
      if (!target) return;
      const nextFav = !target.isFavorite;
      setPages((prev) => prev.map((p) => (p.id === pageId ? { ...p, isFavorite: nextFav } : p)));
      if (user && workspaceId !== 'local') {
        setSyncStatus('syncing');
        await updatePageFlagsInFirestore(workspaceId, pageId, { isFavorite: nextFav });
        setSyncStatus('synced');
      } else {
        setHasLocalEdits(true);
      }
    },
    [user, workspaceId]
  );

  const moveToTrash = useCallback(
    async (pageId: string) => {
      const ids = getDescendantIds(pagesRef.current, pageId);
      const idSet = new Set(ids);
      setPages((prev) =>
        prev.map((p) => (idSet.has(p.id) ? { ...p, isTrashed: true, isFavorite: false } : p))
      );

      setActivePageId((prevActive) => {
        if (!prevActive || idSet.has(prevActive)) {
          const remaining = pagesRef.current.find((p) => !idSet.has(p.id) && !p.isTrashed);
          return remaining?.id ?? null;
        }
        return prevActive;
      });

      if (user && workspaceId !== 'local') {
        setSyncStatus('syncing');
        for (const id of ids) {
          await updatePageFlagsInFirestore(workspaceId, id, { isTrashed: true, isFavorite: false });
        }
        setSyncStatus('synced');
      } else {
        setHasLocalEdits(true);
      }
    },
    [user, workspaceId]
  );

  const restoreFromTrash = useCallback(
    async (pageId: string) => {
      setPages((prev) => prev.map((p) => (p.id === pageId ? { ...p, isTrashed: false } : p)));
      if (user && workspaceId !== 'local') {
        setSyncStatus('syncing');
        await updatePageFlagsInFirestore(workspaceId, pageId, { isTrashed: false });
        setSyncStatus('synced');
      } else {
        setHasLocalEdits(true);
      }
    },
    [user, workspaceId]
  );

  const deletePermanently = useCallback(
    async (pageId: string) => {
      setPages((prev) => prev.filter((p) => p.id !== pageId));
      setRowsByPage((prev) => {
        const next = { ...prev };
        delete next[pageId];
        return next;
      });
      if (user && workspaceId !== 'local') {
        setSyncStatus('syncing');
        await deletePagePermanentlyInFirestore(workspaceId, pageId, user.uid);
        setSyncStatus('synced');
      }
    },
    [user, workspaceId]
  );

  const addDatabaseRow = useCallback(
    async (
      pageId: string,
      initialCells: Record<string, CellValue> = {}
    ): Promise<string | undefined> => {
      const page = pagesRef.current.find((p) => p.id === pageId);
      if (!page) return undefined;
      const currentRows = rowsRef.current[pageId] ?? [];
      const rowId = generateId('row');
      const ownerId = user?.uid ?? 'local';

      const cells: Record<string, CellValue> = {};
      for (const col of page.columns ?? []) {
        if (col.id in initialCells) {
          cells[col.id] = initialCells[col.id];
        } else if (col.type === 'checkbox') {
          cells[col.id] = false;
        } else if (col.type === 'multi_select' || col.type === 'relation') {
          cells[col.id] = [];
        } else if (col.type === 'select' && col.options && col.options.length > 0) {
          cells[col.id] = col.options[0];
        } else {
          cells[col.id] = '';
        }
      }
      for (const [key, val] of Object.entries(initialCells)) {
        if (!(key in cells)) {
          cells[key] = val;
        }
      }

      // Pré-remplissage automatique des participants selon le groupe si une séance est créée avec un groupe sans participants explicites
      if (pageId === IMPRO_DB_IDS.seances) {
        const groupeIds = asIdList(cells[IMPRO_COL_IDS.seances.groupe]);
        const participantIds = asIdList(cells[IMPRO_COL_IDS.seances.participants]);
        if (groupeIds.length > 0 && participantIds.length === 0) {
          cells[IMPRO_COL_IDS.seances.participants] = getGroupMemberIds(groupeIds, rowsRef.current);
        }
      }

      const newRow: DatabaseRow = {
        id: rowId,
        pageId,
        workspaceId,
        ownerId,
        order: currentRows.length,
        cells,
        linkedPageId: null,
      };

      const mirrorPatches = computeBidirectionalRowPatches(pageId, rowId, {}, cells, rowsRef.current);

      setRowsByPage((prev) => {
        const updated = {
          ...prev,
          [pageId]: [...(prev[pageId] ?? []), newRow],
        };
        return applyMirrorPatchesToRowsMap(updated, mirrorPatches);
      });

      if (user && workspaceId !== 'local') {
        setSyncStatus('syncing');
        const newKeys = new Set([`${pageId}::${rowId}`]);
        await batchUpsertRowsInFirestore([newRow, ...mirrorPatches], newKeys);
        setSyncStatus('synced');
      } else {
        setHasLocalEdits(true);
      }

      return rowId;
    },
    [user, workspaceId]
  );

  const updateDatabaseRow = useCallback(
    (
      pageId: string,
      rowId: string,
      cells: Record<string, CellValue>,
      linkedPageId?: string | null
    ) => {
      const currentRows = rowsRef.current[pageId] ?? [];
      const existing = currentRows.find((r) => r.id === rowId);
      if (!existing) return;

      let nextCells = { ...cells };

      // Pré-remplir automatiquement les participants lorsqu'un groupe est sélectionné sur une séance encore sans participants
      if (pageId === IMPRO_DB_IDS.seances) {
        const prevGrps = asIdList(existing.cells[IMPRO_COL_IDS.seances.groupe]);
        const nextGrps = asIdList(nextCells[IMPRO_COL_IDS.seances.groupe]);
        const prevPars = asIdList(existing.cells[IMPRO_COL_IDS.seances.participants]);
        const nextPars = asIdList(nextCells[IMPRO_COL_IDS.seances.participants]);
        if (
          !sameStringArray(prevGrps, nextGrps) &&
          nextGrps.length > 0 &&
          prevPars.length === 0 &&
          nextPars.length === 0
        ) {
          nextCells = {
            ...nextCells,
            [IMPRO_COL_IDS.seances.participants]: getGroupMemberIds(nextGrps, rowsRef.current),
          };
        }
      }

      const updatedRow: DatabaseRow = {
        ...existing,
        cells: nextCells,
        ...(linkedPageId !== undefined ? { linkedPageId } : {}),
      };

      const mirrorPatches = computeBidirectionalRowPatches(
        pageId,
        rowId,
        existing.cells,
        nextCells,
        rowsRef.current
      );

      setRowsByPage((prev) => {
        const updated = {
          ...prev,
          [pageId]: (prev[pageId] ?? []).map((r) => (r.id === rowId ? updatedRow : r)),
        };
        return applyMirrorPatchesToRowsMap(updated, mirrorPatches);
      });

      queueRowsBatchSave([updatedRow, ...mirrorPatches]);
    },
    [queueRowsBatchSave]
  );

  const prefillSeanceFromGroup = useCallback(
    (seanceRowId: string, mode: 'merge' | 'replace' = 'merge') => {
      const seanceRow = (rowsRef.current[IMPRO_DB_IDS.seances] ?? []).find(
        (r) => r.id === seanceRowId
      );
      if (!seanceRow) return;
      const groupeIds = asIdList(seanceRow.cells[IMPRO_COL_IDS.seances.groupe]);
      if (groupeIds.length === 0) return;

      const memberIds = getGroupMemberIds(groupeIds, rowsRef.current);
      const currentPars = asIdList(seanceRow.cells[IMPRO_COL_IDS.seances.participants]);
      const nextPars =
        mode === 'replace' ? memberIds : Array.from(new Set([...currentPars, ...memberIds]));

      updateDatabaseRow(IMPRO_DB_IDS.seances, seanceRowId, {
        ...seanceRow.cells,
        [IMPRO_COL_IDS.seances.participants]: nextPars,
      });
    },
    [updateDatabaseRow]
  );

  const toggleSeanceStatus = useCallback(
    (seanceRowId: string) => {
      const seanceRow = (rowsRef.current[IMPRO_DB_IDS.seances] ?? []).find(
        (r) => r.id === seanceRowId
      );
      if (!seanceRow) return;
      const currentStatus = normalizeSessionStatus(seanceRow.cells[IMPRO_COL_IDS.seances.statut]);
      const nextStatus = currentStatus === 'Préparée' ? 'Réalisée' : 'Préparée';
      updateDatabaseRow(IMPRO_DB_IDS.seances, seanceRowId, {
        ...seanceRow.cells,
        [IMPRO_COL_IDS.seances.statut]: nextStatus,
      });
    },
    [updateDatabaseRow]
  );

  const toggleSeanceParticipant = useCallback(
    (seanceRowId: string, participantId: string) => {
      const seanceRow = (rowsRef.current[IMPRO_DB_IDS.seances] ?? []).find(
        (r) => r.id === seanceRowId
      );
      if (!seanceRow) return;
      const currentPars = asIdList(seanceRow.cells[IMPRO_COL_IDS.seances.participants]);
      const nextPars = currentPars.includes(participantId)
        ? currentPars.filter((id) => id !== participantId)
        : [...currentPars, participantId];
      updateDatabaseRow(IMPRO_DB_IDS.seances, seanceRowId, {
        ...seanceRow.cells,
        [IMPRO_COL_IDS.seances.participants]: nextPars,
      });
    },
    [updateDatabaseRow]
  );

  const deleteDatabaseRow = useCallback(
    async (pageId: string, rowId: string) => {
      const existing = (rowsRef.current[pageId] ?? []).find((r) => r.id === rowId);
      const mirrorCleanup = existing
        ? computeDeleteRowMirrorCleanup(pageId, rowId, existing.cells, rowsRef.current)
        : [];

      setRowsByPage((prev) => {
        const updated = {
          ...prev,
          [pageId]: (prev[pageId] ?? []).filter((r) => r.id !== rowId),
        };
        return applyMirrorPatchesToRowsMap(updated, mirrorCleanup);
      });

      setImproDetailTarget((prev) =>
        prev && prev.pageId === pageId && prev.rowId === rowId ? null : prev
      );

      if (user && workspaceId !== 'local') {
        setSyncStatus('syncing');
        await deleteRowInFirestore(workspaceId, pageId, rowId);
        if (mirrorCleanup.length > 0) {
          await batchUpsertRowsInFirestore(mirrorCleanup);
        }
        setSyncStatus('synced');
      } else {
        setHasLocalEdits(true);
      }
    },
    [user, workspaceId]
  );

  const loadImproDatabases = useCallback(async () => {
    const ownerId = user?.uid ?? 'local';
    setImproLoading(true);
    setImproError(null);
    try {
      const dataset = await fetchAndBuildImproEcosystem(
        workspaceId,
        ownerId,
        pagesRef.current.length
      );
      const improIdSet = new Set<string>(Object.values(IMPRO_DB_IDS));
      setPages((prev) => [...prev.filter((p) => !improIdSet.has(p.id)), ...dataset.pages]);
      setRowsByPage((prev) => ({ ...prev, ...dataset.rowsByPage }));

      if (user && workspaceId !== 'local') {
        setSyncStatus('syncing');
        await seedImproDatabasesToFirestore(workspaceId, user.uid, dataset);
        setSyncStatus('synced');
      }
      setMainView('chronology');
    } catch (err) {
      setImproError(err instanceof Error ? err.message : 'Erreur de chargement');
      if (user && workspaceId !== 'local') setSyncStatus('error');
    } finally {
      setImproLoading(false);
    }
  }, [user, workspaceId]);

  const openOrCreateRowPage = useCallback(
    async (dbPageId: string, rowId: string): Promise<string | null> => {
      const dbPage = pagesRef.current.find((p) => p.id === dbPageId && !p.isTrashed);
      const row = (rowsRef.current[dbPageId] ?? []).find((r) => r.id === rowId);
      if (!dbPage || !row) return null;

      if (row.linkedPageId) {
        const existingLinked = pagesRef.current.find(
          (p) => p.id === row.linkedPageId && !p.isTrashed
        );
        if (existingLinked) {
          setActivePageId(existingLinked.id);
          setMainView('page');
          return existingLinked.id;
        }
      }

      const ownerId = user?.uid ?? 'local';
      const primaryColId = getPrimaryColumn(dbPage.columns ?? [])?.id;
      const rowTitle = primaryColId ? String(row.cells[primaryColId] ?? '').trim() : '';
      const newPageId = generateId('page');

      const newPage: WorkspacePage = {
        id: newPageId,
        workspaceId,
        ownerId,
        parentId: dbPageId,
        title: (rowTitle || 'Fiche sans titre').slice(0, 200),
        icon: '📄',
        type: 'document',
        isFavorite: false,
        isTrashed: false,
        order: pagesRef.current.length,
        source: 'native',
        blocks: [{ id: generateId('blk'), type: 'paragraph', content: '' }],
      };

      const updatedRow: DatabaseRow = { ...row, linkedPageId: newPageId };

      setPages((prev) => [...prev, newPage]);
      setRowsByPage((prev) => ({
        ...prev,
        [dbPageId]: (prev[dbPageId] ?? []).map((r) => (r.id === rowId ? updatedRow : r)),
      }));
      setActivePageId(newPageId);
      setMainView('page');

      if (!user || workspaceId === 'local') {
        setHasLocalEdits(true);
      } else {
        setSyncStatus('syncing');
        await createPageInFirestore(newPage);
        await upsertRowInFirestore(updatedRow, false);
        setSyncStatus('synced');
      }

      return newPageId;
    },
    [user, workspaceId]
  );

  const importNotionDrafts = useCallback(
    async (
      drafts: ImportedPageDraft[],
      targetParentId: string | null = null
    ): Promise<string[]> => {
      if (drafts.length === 0) return [];
      const ownerId = user?.uid ?? 'local';
      const startOrder = pagesRef.current.length;

      if (user && workspaceId !== 'local') {
        setSyncStatus('syncing');
        const createdIds = await importNotionPagesToFirestore(
          workspaceId,
          user.uid,
          drafts,
          startOrder,
          targetParentId
        );
        setSyncStatus('synced');
        if (createdIds[0]) {
          setActivePageId(createdIds[0]);
          setMainView('page');
        }
        return createdIds;
      }

      const { pages: newPages, rowsByPage: newRows } = materializeImportedDrafts(
        drafts,
        workspaceId,
        ownerId,
        startOrder,
        targetParentId
      );

      setPages((prev) => [...prev, ...newPages]);
      setRowsByPage((prev) => ({ ...prev, ...newRows }));
      setHasLocalEdits(true);

      if (newPages[0]) {
        setActivePageId(newPages[0].id);
        setMainView('page');
      }

      return newPages.map((p) => p.id);
    },
    [user, workspaceId]
  );

  const migrateLocalPagesToCloud = useCallback(async () => {
    if (!user || workspaceId === 'local' || localDirtyPages.length === 0) return;
    const drafts: ImportedPageDraft[] = localDirtyPages.map((p) => {
      const pageRows = rowsRef.current[p.id] ?? [];
      return {
        tempId: p.id,
        parentTempId: p.parentId,
        title: p.title,
        icon: p.icon,
        type: p.type,
        blocks: p.blocks,
        columns: p.columns,
        rows: pageRows.map((r) => r.cells),
        rowMeta: pageRows.map((r) => ({
          tempId: r.id,
          linkedPageTempId: r.linkedPageId ?? null,
        })),
      };
    });
    await importNotionPagesToFirestore(workspaceId, user.uid, drafts, pagesRef.current.length);
    setLocalDirtyPages([]);
    setHasLocalEdits(false);
  }, [user, workspaceId, localDirtyPages]);

  const dismissLocalMigration = useCallback(() => {
    setLocalDirtyPages([]);
    setHasLocalEdits(false);
  }, []);

  const databaseSorts = useMemo(() => {
    const out: Record<string, DatabaseSortRule[]> = {};
    for (const p of pages) {
      if (p.sortRules && p.sortRules.length > 0) {
        out[p.id] = p.sortRules;
      }
    }
    return out;
  }, [pages]);

  const columnWidths = useMemo(() => {
    const out: Record<string, Record<string, number>> = {};
    for (const p of pages) {
      if (p.columnWidths && Object.keys(p.columnWidths).length > 0) {
        out[p.id] = p.columnWidths;
      }
    }
    return out;
  }, [pages]);

  const activePage = useMemo(
    () => pages.find((p) => p.id === activePageId && !p.isTrashed) ?? null,
    [pages, activePageId]
  );

  const improModel = useMemo(
    () => computeImproEcosystem(pages, rowsByPage),
    [pages, rowsByPage]
  );

  const value: WorkspaceContextValue = {
    user,
    authReady,
    authError,
    syncStatus,
    theme,
    toggleTheme,
    signInGoogle,
    signOutUser,
    pages,
    rowsByPage,
    activePageId,
    activePage,
    mainView,
    setMainView,
    selectPage,
    createPage,
    updatePageTitle,
    updatePageIcon,
    updatePageBlocks,
    updateDatabaseColumns,
    updateDatabaseView,
    databaseSorts,
    setDatabaseSorts,
    columnWidths,
    setColumnWidth,
    resetColumnWidth,
    tableColumnOrders,
    setTableColumnOrder,
    toggleFavorite,
    moveToTrash,
    restoreFromTrash,
    deletePermanently,
    addDatabaseRow,
    updateDatabaseRow,
    deleteDatabaseRow,
    openOrCreateRowPage,
    importNotionDrafts,
    pendingLocalDraftsCount: localDirtyPages.length,
    migrateLocalPagesToCloud,
    dismissLocalMigration,
    improModel,
    improLoading,
    improError,
    improDetailTarget,
    openImproDetail,
    closeImproDetail,
    prefillSeanceFromGroup,
    toggleSeanceStatus,
    toggleSeanceParticipant,
    timelinePreset,
    navigateToTimeline,
    clearTimelinePreset,
    prepareDraft,
    navigateToPrepare,
    clearPrepareDraft,
    loadImproDatabases,
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspace doit être utilisé dans WorkspaceProvider');
  }
  return ctx;
}
