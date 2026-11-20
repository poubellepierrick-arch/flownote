import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import type {
  BlockItem,
  CellValue,
  DatabaseColumn,
  DatabaseRow,
  DatabaseSortRule,
  ThemeMode,
  WorkspacePage,
} from '../types/workspace';
import { generateId } from '../utils/id';
import type { ImportedPageDraft } from '../utils/notionImporter';
import { materializeImportedDrafts } from '../utils/notionImportMaterializer';
import { createSeedWorkspace } from '../utils/seedWorkspace';
import { fetchAndBuildImproEcosystem, type ImproEcosystemDataset } from '../utils/improCsvLoader';
import { db, handleFirestoreError, OperationType } from './firebase';

function sanitizeId(raw: string, fallbackPrefix = 'id'): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return cleaned || generateId(fallbackPrefix);
}

function sanitizeBlocks(blocks: BlockItem[]): BlockItem[] {
  return blocks.slice(0, 400).map((b, idx) => {
    const clean: BlockItem = {
      id: sanitizeId(b.id || `blk_${idx}`, 'blk'),
      type: b.type,
      content: String(b.content ?? '').slice(0, 20000),
    };
    if (typeof b.checked === 'boolean') clean.checked = b.checked;
    if (typeof b.language === 'string' && b.language) {
      clean.language = b.language.slice(0, 40);
    }
    if (typeof b.icon === 'string' && b.icon) {
      clean.icon = b.icon.slice(0, 16);
    }
    if (typeof b.isOpen === 'boolean') clean.isOpen = b.isOpen;
    if (typeof b.details === 'string') {
      clean.details = b.details.slice(0, 10000);
    }
    if (typeof b.url === 'string' && b.url) {
      clean.url = b.url.slice(0, 2000);
    }
    if (Array.isArray(b.tableRows)) {
      clean.tableRows = b.tableRows.slice(0, 100).map((r) => ({
        cells: Array.isArray(r.cells)
          ? r.cells.slice(0, 20).map((c) => String(c ?? '').slice(0, 1000))
          : [],
      }));
    }
    return clean;
  });
}

const VALID_ROLLUP_FNS = new Set([
  'count',
  'sum',
  'avg',
  'min',
  'max',
  'values',
  'checked_count',
]);

function sanitizeColumns(columns?: DatabaseColumn[]): DatabaseColumn[] | undefined {
  if (!columns) return undefined;
  return columns.slice(0, 100).map((c, idx) => {
    const clean: DatabaseColumn = {
      id: sanitizeId(c.id || `col_${idx}`, 'col').slice(0, 64),
      name: String(c.name || `Colonne ${idx + 1}`).slice(0, 80) || `Colonne ${idx + 1}`,
      type: c.type,
    };
    if (Array.isArray(c.options)) {
      const seen = new Set<string>();
      const opts: string[] = [];
      for (const rawOpt of c.options) {
        const opt = String(rawOpt ?? '').trim().slice(0, 120);
        if (opt && !seen.has(opt)) {
          seen.add(opt);
          opts.push(opt);
          if (opts.length >= 100) break;
        }
      }
      clean.options = opts;
    }
    if (c.relationTargetPageId === null) {
      clean.relationTargetPageId = undefined;
    } else if (typeof c.relationTargetPageId === 'string' && c.relationTargetPageId.trim()) {
      clean.relationTargetPageId = sanitizeId(c.relationTargetPageId, 'page').slice(0, 128);
    }
    if (typeof c.rollupRelationColId === 'string' && c.rollupRelationColId.trim()) {
      clean.rollupRelationColId = sanitizeId(c.rollupRelationColId, 'col').slice(0, 64);
    }
    if (typeof c.rollupTargetColId === 'string' && c.rollupTargetColId.trim()) {
      clean.rollupTargetColId = sanitizeId(c.rollupTargetColId, 'col').slice(0, 64);
    }
    if (c.rollupFn && VALID_ROLLUP_FNS.has(c.rollupFn)) {
      clean.rollupFn = c.rollupFn;
    }
    if (typeof c.formulaExpression === 'string') {
      clean.formulaExpression = c.formulaExpression.slice(0, 2000);
    }
    return clean;
  });
}

function sanitizeSortRules(rules?: DatabaseSortRule[]): DatabaseSortRule[] {
  if (!Array.isArray(rules)) return [];
  const seen = new Set<string>();
  const out: DatabaseSortRule[] = [];
  for (const r of rules) {
    if (!r || typeof r.colId !== 'string') continue;
    const colId = sanitizeId(r.colId, 'col').slice(0, 64);
    if (!colId || seen.has(colId)) continue;
    seen.add(colId);
    out.push({
      colId,
      dir: r.dir === 'desc' ? 'desc' : 'asc',
    });
    if (out.length >= 30) break;
  }
  return out;
}

function sanitizeColumnWidths(widths?: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  if (!widths || typeof widths !== 'object') return out;
  for (const [rawKey, rawVal] of Object.entries(widths).slice(0, 100)) {
    const colId = sanitizeId(rawKey, 'col').slice(0, 64);
    if (!colId) continue;
    const num = Number(rawVal);
    if (Number.isFinite(num)) {
      out[colId] = Math.max(46, Math.min(640, Math.round(num)));
    }
  }
  return out;
}

function sanitizeCells(cells: Record<string, CellValue>): Record<string, CellValue> {
  const out: Record<string, CellValue> = {};
  const entries = Object.entries(cells ?? {}).slice(0, 100);
  for (const [k, v] of entries) {
    const cleanKey = sanitizeId(k, 'col').slice(0, 64);
    if (typeof v === 'boolean') {
      out[cleanKey] = v;
    } else if (typeof v === 'number') {
      out[cleanKey] = Number.isFinite(v) ? v : 0;
    } else if (Array.isArray(v)) {
      out[cleanKey] = v.slice(0, 500).map((item) => String(item ?? '').slice(0, 200));
    } else {
      out[cleanKey] = String(v ?? '').slice(0, 5000);
    }
  }
  return out;
}

async function commitPagesAndRowsChunked(
  workspaceId: string,
  ownerId: string,
  pages: WorkspacePage[],
  rowsByPage: Record<string, DatabaseRow[]>,
  createWorkspaceDoc = false
): Promise<void> {
  let batch = writeBatch(db);
  let opCount = 0;

  const flushIfNeeded = async (force = false) => {
    if (opCount >= 350 || (force && opCount > 0)) {
      await batch.commit();
      batch = writeBatch(db);
      opCount = 0;
    }
  };

  if (createWorkspaceDoc) {
    const wsRef = doc(db, 'workspaces', workspaceId);
    batch.set(wsRef, {
      id: workspaceId,
      ownerId,
      name: 'Mon espace',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    opCount++;
    await flushIfNeeded();
  }

  for (const page of pages) {
    const pageRef = doc(db, 'workspaces', workspaceId, 'pages', page.id);
    const payload: Record<string, unknown> = {
      id: sanitizeId(page.id, 'page'),
      workspaceId,
      ownerId,
      parentId: page.parentId,
      title: page.title.slice(0, 200),
      icon: page.icon.slice(0, 32),
      type: page.type,
      isFavorite: page.isFavorite,
      isTrashed: page.isTrashed,
      order: page.order,
      source: page.source,
      blocks: sanitizeBlocks(page.blocks),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (page.columns) payload.columns = sanitizeColumns(page.columns);
    if (page.activeView) payload.activeView = page.activeView;
    if (page.sortRules && page.sortRules.length > 0) {
      payload.sortRules = sanitizeSortRules(page.sortRules);
    }
    if (page.columnWidths && Object.keys(page.columnWidths).length > 0) {
      payload.columnWidths = sanitizeColumnWidths(page.columnWidths);
    }
    batch.set(pageRef, payload);
    opCount++;
    await flushIfNeeded();

    const rows = rowsByPage[page.id] ?? [];
    for (const row of rows) {
      const rowRef = doc(db, 'workspaces', workspaceId, 'pages', page.id, 'rows', row.id);
      batch.set(rowRef, {
        id: sanitizeId(row.id, 'row'),
        pageId: page.id,
        workspaceId,
        ownerId,
        order: row.order,
        cells: sanitizeCells(row.cells),
        linkedPageId: row.linkedPageId ? sanitizeId(row.linkedPageId, 'page') : null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      opCount++;
      await flushIfNeeded();
    }
  }

  await flushIfNeeded(true);
}

export function getWorkspaceIdForUser(uid: string): string {
  return sanitizeId(`ws_${uid}`, 'ws');
}

export async function ensureUserAndWorkspace(
  user: User,
  preferredTheme: ThemeMode = 'light'
): Promise<{ workspaceId: string; theme: ThemeMode }> {
  const uid = sanitizeId(user.uid, 'usr');
  const workspaceId = getWorkspaceIdForUser(uid);
  const userPath = `users/${uid}`;
  const wsPath = `workspaces/${workspaceId}`;

  let resolvedTheme: ThemeMode = preferredTheme;

  try {
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      await setDoc(userRef, {
        uid,
        displayName: (user.displayName ?? 'Utilisateur').slice(0, 120),
        email: (user.email ?? '').slice(0, 200),
        photoURL: (user.photoURL ?? '').slice(0, 500),
        theme: preferredTheme,
        updatedAt: serverTimestamp(),
      });
    } else {
      const data = userSnap.data();
      if (data.theme === 'dark' || data.theme === 'light') {
        resolvedTheme = data.theme;
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, userPath);
  }

  try {
    const wsRef = doc(db, 'workspaces', workspaceId);
    const wsSnap = await getDoc(wsRef);
    if (!wsSnap.exists()) {
      let seed: { pages: WorkspacePage[]; rowsByPage: Record<string, DatabaseRow[]> };
      try {
        seed = await fetchAndBuildImproEcosystem(workspaceId, uid, 0);
      } catch {
        seed = createSeedWorkspace(workspaceId, uid);
      }
      await commitPagesAndRowsChunked(workspaceId, uid, seed.pages, seed.rowsByPage, true);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, wsPath);
  }

  return { workspaceId, theme: resolvedTheme };
}

export async function updateUserThemeInFirestore(uid: string, theme: ThemeMode): Promise<void> {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      theme,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export function subscribeWorkspacePages(
  workspaceId: string,
  ownerId: string,
  onData: (pages: WorkspacePage[]) => void
): Unsubscribe {
  const path = `workspaces/${workspaceId}/pages`;
  const q = query(collection(db, 'workspaces', workspaceId, 'pages'), where('ownerId', '==', ownerId));
  return onSnapshot(
    q,
    (snapshot) => {
      const pages: WorkspacePage[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          workspaceId: data.workspaceId,
          ownerId: data.ownerId,
          parentId: data.parentId ?? null,
          title: data.title ?? 'Sans titre',
          icon: data.icon ?? '📄',
          type: data.type === 'database' ? 'database' : 'document',
          isFavorite: Boolean(data.isFavorite),
          isTrashed: Boolean(data.isTrashed),
          order: typeof data.order === 'number' ? data.order : 0,
          source: data.source === 'notion_import' ? 'notion_import' : 'native',
          blocks: Array.isArray(data.blocks) ? data.blocks : [],
          columns: Array.isArray(data.columns) ? data.columns : undefined,
          activeView: data.activeView ?? 'table',
          sortRules: Array.isArray(data.sortRules) ? sanitizeSortRules(data.sortRules) : undefined,
          columnWidths:
            data.columnWidths && typeof data.columnWidths === 'object'
              ? sanitizeColumnWidths(data.columnWidths)
              : undefined,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        };
      });
      onData(pages);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeDatabaseRows(
  workspaceId: string,
  pageId: string,
  ownerId: string,
  onData: (rows: DatabaseRow[]) => void
): Unsubscribe {
  const path = `workspaces/${workspaceId}/pages/${pageId}/rows`;
  const q = query(
    collection(db, 'workspaces', workspaceId, 'pages', pageId, 'rows'),
    where('ownerId', '==', ownerId)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const rows: DatabaseRow[] = snapshot.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            pageId: data.pageId,
            workspaceId: data.workspaceId,
            ownerId: data.ownerId,
            order: typeof data.order === 'number' ? data.order : 0,
            cells: (data.cells as DatabaseRow['cells']) ?? {},
            linkedPageId: typeof data.linkedPageId === 'string' ? data.linkedPageId : null,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          };
        })
        .sort((a, b) => a.order - b.order);
      onData(rows);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function createPageInFirestore(
  page: WorkspacePage,
  initialRows: DatabaseRow[] = []
): Promise<void> {
  const path = `workspaces/${page.workspaceId}/pages/${page.id}`;
  try {
    const batch = writeBatch(db);
    const pageRef = doc(db, 'workspaces', page.workspaceId, 'pages', page.id);
    const payload: Record<string, unknown> = {
      id: sanitizeId(page.id, 'page'),
      workspaceId: page.workspaceId,
      ownerId: page.ownerId,
      parentId: page.parentId,
      title: page.title.slice(0, 200),
      icon: page.icon.slice(0, 32),
      type: page.type,
      isFavorite: page.isFavorite,
      isTrashed: page.isTrashed,
      order: page.order,
      source: page.source,
      blocks: sanitizeBlocks(page.blocks),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (page.columns) payload.columns = sanitizeColumns(page.columns);
    if (page.activeView) payload.activeView = page.activeView;
    if (page.sortRules && page.sortRules.length > 0) {
      payload.sortRules = sanitizeSortRules(page.sortRules);
    }
    if (page.columnWidths && Object.keys(page.columnWidths).length > 0) {
      payload.columnWidths = sanitizeColumnWidths(page.columnWidths);
    }
    batch.set(pageRef, payload);

    for (const row of initialRows) {
      const rowRef = doc(db, 'workspaces', page.workspaceId, 'pages', page.id, 'rows', row.id);
      batch.set(rowRef, {
        id: sanitizeId(row.id, 'row'),
        pageId: page.id,
        workspaceId: page.workspaceId,
        ownerId: page.ownerId,
        order: row.order,
        cells: sanitizeCells(row.cells),
        linkedPageId: row.linkedPageId ? sanitizeId(row.linkedPageId, 'page') : null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updatePageContentInFirestore(
  workspaceId: string,
  pageId: string,
  patch: {
    title?: string;
    icon?: string;
    parentId?: string | null;
    blocks?: BlockItem[];
    columns?: DatabaseColumn[];
    activeView?: WorkspacePage['activeView'];
    sortRules?: DatabaseSortRule[];
    columnWidths?: Record<string, number>;
    order?: number;
  }
): Promise<void> {
  const path = `workspaces/${workspaceId}/pages/${pageId}`;
  try {
    const payload: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };
    if (patch.title !== undefined) payload.title = patch.title.slice(0, 200);
    if (patch.icon !== undefined) payload.icon = patch.icon.slice(0, 32);
    if (patch.parentId !== undefined) payload.parentId = patch.parentId;
    if (patch.blocks !== undefined) payload.blocks = sanitizeBlocks(patch.blocks);
    if (patch.columns !== undefined) payload.columns = sanitizeColumns(patch.columns);
    if (patch.activeView !== undefined) payload.activeView = patch.activeView;
    if (patch.sortRules !== undefined) payload.sortRules = sanitizeSortRules(patch.sortRules);
    if (patch.columnWidths !== undefined) {
      payload.columnWidths = sanitizeColumnWidths(patch.columnWidths);
    }
    if (patch.order !== undefined) payload.order = patch.order;

    await updateDoc(doc(db, 'workspaces', workspaceId, 'pages', pageId), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function updatePageFlagsInFirestore(
  workspaceId: string,
  pageId: string,
  flags: { isFavorite?: boolean; isTrashed?: boolean }
): Promise<void> {
  const path = `workspaces/${workspaceId}/pages/${pageId}`;
  try {
    const payload: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };
    if (flags.isFavorite !== undefined) payload.isFavorite = flags.isFavorite;
    if (flags.isTrashed !== undefined) payload.isTrashed = flags.isTrashed;
    await updateDoc(doc(db, 'workspaces', workspaceId, 'pages', pageId), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deletePagePermanentlyInFirestore(
  workspaceId: string,
  pageId: string,
  ownerId: string
): Promise<void> {
  const path = `workspaces/${workspaceId}/pages/${pageId}`;
  try {
    const rowsQ = query(
      collection(db, 'workspaces', workspaceId, 'pages', pageId, 'rows'),
      where('ownerId', '==', ownerId)
    );
    const rowsSnap = await getDocs(rowsQ);
    const batch = writeBatch(db);
    rowsSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, 'workspaces', workspaceId, 'pages', pageId));
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function upsertRowInFirestore(row: DatabaseRow, isNew: boolean): Promise<void> {
  const path = `workspaces/${row.workspaceId}/pages/${row.pageId}/rows/${row.id}`;
  try {
    const ref = doc(db, 'workspaces', row.workspaceId, 'pages', row.pageId, 'rows', row.id);
    const cleanCells = sanitizeCells(row.cells);
    const cleanLinkedPageId = row.linkedPageId ? sanitizeId(row.linkedPageId, 'page') : null;
    if (isNew) {
      await setDoc(ref, {
        id: sanitizeId(row.id, 'row'),
        pageId: row.pageId,
        workspaceId: row.workspaceId,
        ownerId: row.ownerId,
        order: row.order,
        cells: cleanCells,
        linkedPageId: cleanLinkedPageId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        order: row.order,
        cells: cleanCells,
        linkedPageId: cleanLinkedPageId,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export async function seedImproDatabasesToFirestore(
  workspaceId: string,
  ownerId: string,
  dataset: ImproEcosystemDataset
): Promise<void> {
  const path = `workspaces/${workspaceId}/pages`;
  try {
    await commitPagesAndRowsChunked(workspaceId, ownerId, dataset.pages, dataset.rowsByPage, false);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function batchUpsertRowsInFirestore(
  rows: DatabaseRow[],
  newRowKeys: Set<string> = new Set()
): Promise<void> {
  if (rows.length === 0) return;
  const first = rows[0];
  const path = `workspaces/${first.workspaceId}/pages/${first.pageId}/rows/${first.id}`;
  try {
    let batch = writeBatch(db);
    let opCount = 0;

    const flush = async (force = false) => {
      if (opCount >= 350 || (force && opCount > 0)) {
        await batch.commit();
        batch = writeBatch(db);
        opCount = 0;
      }
    };

    for (const row of rows) {
      const ref = doc(db, 'workspaces', row.workspaceId, 'pages', row.pageId, 'rows', row.id);
      const cleanCells = sanitizeCells(row.cells);
      const cleanLinkedPageId = row.linkedPageId ? sanitizeId(row.linkedPageId, 'page') : null;
      const key = `${row.pageId}::${row.id}`;
      if (newRowKeys.has(key)) {
        batch.set(ref, {
          id: sanitizeId(row.id, 'row'),
          pageId: row.pageId,
          workspaceId: row.workspaceId,
          ownerId: row.ownerId,
          order: row.order,
          cells: cleanCells,
          linkedPageId: cleanLinkedPageId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.update(ref, {
          order: row.order,
          cells: cleanCells,
          linkedPageId: cleanLinkedPageId,
          updatedAt: serverTimestamp(),
        });
      }
      opCount++;
      await flush();
    }

    await flush(true);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteRowInFirestore(
  workspaceId: string,
  pageId: string,
  rowId: string
): Promise<void> {
  const path = `workspaces/${workspaceId}/pages/${pageId}/rows/${rowId}`;
  try {
    await deleteDoc(doc(db, 'workspaces', workspaceId, 'pages', pageId, 'rows', rowId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function importNotionPagesToFirestore(
  workspaceId: string,
  ownerId: string,
  drafts: ImportedPageDraft[],
  startOrder: number,
  targetParentId: string | null = null
): Promise<string[]> {
  const { pages, rowsByPage } = materializeImportedDrafts(
    drafts,
    workspaceId,
    ownerId,
    startOrder,
    targetParentId
  );

  const createdIds: string[] = [];
  // Découpage en lots de max 350 opérations pour respecter la limite Firestore de 500
  let batch = writeBatch(db);
  let opCount = 0;

  const flushIfNeeded = async (force = false) => {
    if (opCount >= 350 || (force && opCount > 0)) {
      await batch.commit();
      batch = writeBatch(db);
      opCount = 0;
    }
  };

  try {
    for (const page of pages) {
      createdIds.push(page.id);

      const pageRef = doc(db, 'workspaces', workspaceId, 'pages', page.id);
      const payload: Record<string, unknown> = {
        id: page.id,
        workspaceId,
        ownerId,
        parentId: page.parentId,
        title: page.title.slice(0, 200),
        icon: page.icon.slice(0, 32),
        type: page.type,
        isFavorite: false,
        isTrashed: false,
        order: page.order,
        source: 'notion_import',
        blocks: sanitizeBlocks(page.blocks),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (page.columns) {
        payload.columns = sanitizeColumns(page.columns);
        payload.activeView = 'table';
      }
      batch.set(pageRef, payload);
      opCount++;
      await flushIfNeeded();

      const rows = rowsByPage[page.id] ?? [];
      for (const row of rows) {
        const rowRef = doc(db, 'workspaces', workspaceId, 'pages', page.id, 'rows', row.id);
        batch.set(rowRef, {
          id: sanitizeId(row.id, 'row'),
          pageId: page.id,
          workspaceId,
          ownerId,
          order: row.order,
          cells: sanitizeCells(row.cells),
          linkedPageId: row.linkedPageId ? sanitizeId(row.linkedPageId, 'page') : null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        opCount++;
        await flushIfNeeded();
      }
    }

    await flushIfNeeded(true);
    return createdIds;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `workspaces/${workspaceId}/pages`);
  }
}
