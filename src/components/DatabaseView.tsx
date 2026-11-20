import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Columns3,
  Copy,
  FileText,
  GripVertical,
  Info,
  LayoutList,
  Plus,
  Search,
  Settings2,
  Table2,
  Trash2,
  X,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import type {
  CellValue,
  ColumnType,
  DatabaseColumn,
  DatabaseRow,
  DatabaseSortRule,
  DatabaseViewType,
  RollupFunction,
  WorkspacePage,
} from '../types/workspace';
import { useColumnDrag } from '../hooks/useColumnDrag';
import {
  extractReorderedNativeColumns,
  getPrimaryColumn,
  mergeColumnOrder,
  reorderIds,
  syncNativeOrderInMixedList,
} from '../utils/columnOrder';
import { sortDatabaseRows, type SortableDeducedColumn } from '../utils/databaseSort';
import { generateId } from '../utils/id';
import { IMPRO_COL_IDS, IMPRO_DB_IDS } from '../utils/improCsvLoader';
import { isImproDatabasePage } from '../utils/improEngine';
import { formatCellText, getComputedRowCells } from '../utils/notionFormula';
import { ChoiceOrderEditor } from './ChoiceOrderEditor';

interface DatabaseViewProps {
  page: WorkspacePage;
}

const COLUMN_TYPE_LABELS: Array<{ value: ColumnType; label: string }> = [
  { value: 'text', label: 'Texte' },
  { value: 'number', label: 'Nombre' },
  { value: 'select', label: 'Sélection' },
  { value: 'multi_select', label: 'Sélection multiple' },
  { value: 'date', label: 'Date' },
  { value: 'checkbox', label: 'Case' },
  { value: 'url', label: 'Lien' },
  { value: 'relation', label: 'Relation' },
  { value: 'rollup', label: 'Agrégat' },
  { value: 'formula', label: 'Formule' },
];

const ROLLUP_FN_LABELS: Array<{ value: RollupFunction; label: string }> = [
  { value: 'count', label: 'Nombre' },
  { value: 'sum', label: 'Somme' },
  { value: 'avg', label: 'Moyenne' },
  { value: 'min', label: 'Minimum' },
  { value: 'max', label: 'Maximum' },
  { value: 'values', label: 'Valeurs' },
  { value: 'checked_count', label: 'Cases cochées' },
];

interface ColumnFormState {
  editingId: string | null;
  name: string;
  type: ColumnType;
  options: string[];
  relationTargetPageId: string;
  rollupRelationColId: string;
  rollupTargetColId: string;
  rollupFn: RollupFunction;
  formulaExpression: string;
}

function collectColumnChoices(col: DatabaseColumn | undefined, rows: DatabaseRow[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const pushOpt = (raw: string) => {
    const trimmed = raw.trim().slice(0, 120);
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      out.push(trimmed);
    }
  };
  for (const opt of col?.options ?? []) {
    pushOpt(opt);
  }
  if (col) {
    for (const r of rows) {
      const v = r.cells[col.id];
      if (Array.isArray(v)) {
        for (const item of v) pushOpt(String(item ?? ''));
      } else if (typeof v === 'string' && v.trim()) {
        if (col.type === 'multi_select') {
          for (const part of v.split(',')) pushOpt(part);
        } else {
          pushOpt(v);
        }
      }
      if (out.length >= 100) break;
    }
  }
  return out.slice(0, 100);
}

const ACTIONS_COL_WIDTH = 108;

function getDefaultColWidth(col: DatabaseColumn, isPrimary: boolean): number {
  if (col.type === 'checkbox') return 58;
  if (col.type === 'number' || col.type === 'rollup') return 96;
  if (col.type === 'date') return 126;
  if (col.type === 'select') return 132;
  if (col.type === 'multi_select') return 152;
  if (col.type === 'relation') return 196;
  if (isPrimary) return 216;
  if (col.name.toLowerCase().includes('description')) return 236;
  return 152;
}

function getDefaultDeducedColWidth(dcol: { name: string; numeric?: boolean }): number {
  if (dcol.numeric) return 114;
  if (dcol.name.toLowerCase().includes('dernière')) return 124;
  return 172;
}

function formatSortDirLabel(
  colInfo: { numeric?: boolean; type?: ColumnType } | undefined,
  dir: 'asc' | 'desc',
  compact = false
): string {
  if (colInfo?.type === 'checkbox') {
    return dir === 'asc' ? '☑ → ☐' : '☐ → ☑';
  }
  if (colInfo?.type === 'select' || colInfo?.type === 'multi_select') {
    return dir === 'asc' ? 'Ordre ↑' : 'Ordre ↓';
  }
  if (colInfo?.numeric) {
    if (compact) return dir === 'asc' ? '0→9' : '9→0';
    return dir === 'asc' ? '0 → 9' : '9 → 0';
  }
  if (compact) return dir === 'asc' ? 'A→Z' : 'Z→A';
  return dir === 'asc' ? 'A → Z' : 'Z → A';
}

export function DatabaseView({ page }: DatabaseViewProps) {
  const {
    pages,
    rowsByPage,
    selectPage,
    updatePageTitle,
    updateDatabaseColumns,
    updateDatabaseView,
    addDatabaseRow,
    updateDatabaseRow,
    deleteDatabaseRow,
    openOrCreateRowPage,
    improModel,
    openImproDetail,
    prefillSeanceFromGroup,
    databaseSorts,
    setDatabaseSorts,
    columnWidths,
    setColumnWidth,
    resetColumnWidth,
    tableColumnOrders,
    setTableColumnOrder,
  } = useWorkspace();

  const [filterQuery, setFilterQuery] = useState('');
  const [showSortPanel, setShowSortPanel] = useState(false);
  const [editingChoicesColId, setEditingChoicesColId] = useState<string | null>(null);
  const [colPanel, setColPanel] = useState<ColumnFormState | null>(null);
  const [confirmRemoveCol, setConfirmRemoveCol] = useState(false);
  const [activeCellEditor, setActiveCellEditor] = useState<{ rowId: string; colId: string } | null>(
    null
  );
  const [relationQuery, setRelationQuery] = useState('');
  const [newTagInput, setNewTagInput] = useState('');
  const [showAllRows, setShowAllRows] = useState(false);
  const [resizingCol, setResizingCol] = useState<{
    colId: string;
    startX: number;
    startWidth: number;
    minWidth: number;
  } | null>(null);

  const isImproPage = isImproDatabasePage(page.id) && improModel.ready;
  const sortRules: DatabaseSortRule[] = databaseSorts[page.id] ?? [];

  useEffect(() => {
    setShowAllRows(false);
    setFilterQuery('');
    setActiveCellEditor(null);
    setShowSortPanel(false);
    setEditingChoicesColId(null);
    setResizingCol(null);
  }, [page.id]);

  useEffect(() => {
    if (!resizingCol) return;
    const onPointerMove = (ev: PointerEvent) => {
      const delta = ev.clientX - resizingCol.startX;
      const nextWidth = Math.max(resizingCol.minWidth, Math.min(640, resizingCol.startWidth + delta));
      setColumnWidth(page.id, resizingCol.colId, nextWidth);
    };
    const onPointerUp = () => setResizingCol(null);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [resizingCol, page.id, setColumnWidth]);

  const startColumnResize = (
    e: ReactPointerEvent<HTMLDivElement>,
    colId: string,
    fallbackWidth: number,
    minWidth: number
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const thWidth = e.currentTarget.closest('th')?.getBoundingClientRect().width;
    const startWidth = thWidth && thWidth > 0 ? Math.round(thWidth) : fallbackWidth;
    setResizingCol({ colId, startX: e.clientX, startWidth, minWidth });
  };

  const columns: DatabaseColumn[] = useMemo(
    () =>
      page.columns && page.columns.length > 0
        ? page.columns
        : [{ id: 'col_titre', name: 'Nom', type: 'text' }],
    [page.columns]
  );

  const rows: DatabaseRow[] = rowsByPage[page.id] ?? [];
  const activeView: DatabaseViewType = page.activeView ?? 'table';

  const databasePages = useMemo(
    () => pages.filter((p) => p.type === 'database' && !p.isTrashed),
    [pages]
  );

  const computedByRowId = useMemo(() => {
    const map = new Map<string, { cells: Record<string, CellValue>; errors: Record<string, string> }>();
    for (const row of rows) {
      map.set(row.id, getComputedRowCells(page, row, pages, rowsByPage));
    }
    return map;
  }, [rows, page, pages, rowsByPage]);

  const computedCellsMap = useMemo(() => {
    const map = new Map<string, Record<string, CellValue>>();
    for (const [id, entry] of computedByRowId.entries()) {
      map.set(id, entry.cells);
    }
    return map;
  }, [computedByRowId]);

  interface DeducedColumn extends SortableDeducedColumn {
    mono?: boolean;
  }

  const deducedColumns: DeducedColumn[] = useMemo(() => {
    if (!isImproPage) return [];
    if (page.id === IMPRO_DB_IDS.exercices) {
      return [
        {
          id: 'ded_ex_grps',
          name: 'Groupes (déduits)',
          render: (r) => improModel.exerciseById.get(r.id)?.groupNames.join(', ') || '—',
        },
        {
          id: 'ded_ex_pars',
          name: 'Participants (déduits)',
          numeric: true,
          mono: true,
          sortValue: (r) => {
            const count = improModel.exerciseById.get(r.id)?.participantNames.length ?? 0;
            return count > 0 ? count : '';
          },
          render: (r) => {
            const ex = improModel.exerciseById.get(r.id);
            if (!ex || ex.participantNames.length === 0) return '—';
            const preview = ex.participantNames.slice(0, 3).join(', ');
            return ex.participantNames.length > 3
              ? `${ex.participantNames.length} (${preview}…)`
              : `${ex.participantNames.length} (${preview})`;
          },
        },
        {
          id: 'ded_ex_last',
          name: 'Dernière fois',
          mono: true,
          sortValue: (r) => improModel.exerciseById.get(r.id)?.lastDate || '',
          render: (r) => improModel.exerciseById.get(r.id)?.lastDate || '—',
        },
      ];
    }
    if (page.id === IMPRO_DB_IDS.participants) {
      return [
        {
          id: 'ded_pa_done',
          name: 'Faits',
          numeric: true,
          mono: true,
          sortValue: (r) => improModel.participantById.get(r.id)?.doneExercises.length ?? 0,
          render: (r) => String(improModel.participantById.get(r.id)?.doneExercises.length ?? 0),
        },
        {
          id: 'ded_pa_never',
          name: 'Jamais faits',
          numeric: true,
          mono: true,
          sortValue: (r) => improModel.participantById.get(r.id)?.neverDoneExercises.length ?? 0,
          render: (r) =>
            String(improModel.participantById.get(r.id)?.neverDoneExercises.length ?? 0),
        },
      ];
    }
    if (page.id === IMPRO_DB_IDS.groupes) {
      return [
        {
          id: 'ded_gr_exos',
          name: 'Exercices pratiqués',
          numeric: true,
          mono: true,
          sortValue: (r) => improModel.groupById.get(r.id)?.practicedExercises.length ?? 0,
          render: (r) => String(improModel.groupById.get(r.id)?.practicedExercises.length ?? 0),
        },
        {
          id: 'ded_gr_last',
          name: 'Dernière séance',
          mono: true,
          sortValue: (r) => improModel.groupById.get(r.id)?.lastDate || '',
          render: (r) => improModel.groupById.get(r.id)?.lastDate || '—',
        },
      ];
    }
    return [];
  }, [isImproPage, page.id, improModel]);

  const sortableColumns = useMemo(
    () => [
      ...columns.map((c) => ({
        id: c.id,
        name: c.name,
        numeric: c.type === 'number' || c.type === 'rollup',
        type: c.type as ColumnType | undefined,
      })),
      ...deducedColumns.map((d) => ({
        id: d.id,
        name: d.name,
        numeric: Boolean(d.numeric),
        type: undefined as ColumnType | undefined,
      })),
    ],
    [columns, deducedColumns]
  );

  const primaryCol = getPrimaryColumn(columns) ?? columns[0];
  const groupCol = columns.find((c) => c.type === 'select') ?? null;

  const pageCustomWidths = columnWidths[page.id] ?? {};
  const getColWidth = (col: DatabaseColumn) =>
    pageCustomWidths[col.id] ?? getDefaultColWidth(col, col.id === primaryCol?.id);
  const getDeducedWidth = (dcol: DeducedColumn) =>
    pageCustomWidths[dcol.id] ?? getDefaultDeducedColWidth(dcol);

  const orderedDisplayIds = useMemo(() => {
    const defaultIds = [...columns.map((c) => c.id), ...deducedColumns.map((d) => d.id)];
    const saved = tableColumnOrders[page.id];
    if (!saved || saved.length === 0) return defaultIds;
    const merged = mergeColumnOrder(defaultIds, saved);
    return syncNativeOrderInMixedList(merged, columns);
  }, [columns, deducedColumns, tableColumnOrders, page.id]);

  const displayColumns = useMemo(() => {
    const nativeMap = new Map(columns.map((c) => [c.id, c]));
    const dedMap = new Map(deducedColumns.map((d) => [d.id, d]));
    const items: Array<
      | { kind: 'native'; id: string; col: DatabaseColumn }
      | { kind: 'deduced'; id: string; dcol: DeducedColumn }
    > = [];
    for (const id of orderedDisplayIds) {
      const nc = nativeMap.get(id);
      if (nc) {
        items.push({ kind: 'native', id, col: nc });
        continue;
      }
      const dc = dedMap.get(id);
      if (dc) {
        items.push({ kind: 'deduced', id, dcol: dc });
      }
    }
    return items;
  }, [orderedDisplayIds, columns, deducedColumns]);

  const { dragColId, dropIndicator, getThDropProps, getDragHandleProps } = useColumnDrag(
    (sourceId, targetId, position) => {
      const nextIds = reorderIds(orderedDisplayIds, sourceId, targetId, position);
      if (nextIds === orderedDisplayIds) return;
      setTableColumnOrder(page.id, nextIds);
      const nextNative = extractReorderedNativeColumns(nextIds, columns);
      const nativeChanged = nextNative.some((c, i) => c.id !== columns[i]?.id);
      if (nativeChanged) {
        updateDatabaseColumns(page.id, nextNative);
      }
    }
  );

  const filteredRows = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    const base = !q
      ? rows
      : rows.filter((row) => {
          const computed = computedByRowId.get(row.id)?.cells ?? row.cells;
          return columns.some((col) =>
            formatCellText(col, computed[col.id], pages, rowsByPage).toLowerCase().includes(q)
          );
        });

    return sortDatabaseRows(
      base,
      sortRules,
      columns,
      deducedColumns,
      computedCellsMap,
      pages,
      rowsByPage
    );
  }, [
    rows,
    filterQuery,
    sortRules,
    columns,
    deducedColumns,
    computedByRowId,
    computedCellsMap,
    pages,
    rowsByPage,
  ]);

  const visibleRows = useMemo(() => {
    if (showAllRows || filterQuery.trim().length > 0 || filteredRows.length <= 120) {
      return filteredRows;
    }
    return filteredRows.slice(0, 120);
  }, [filteredRows, showAllRows, filterQuery]);

  const updateSortRules = (next: DatabaseSortRule[]) => {
    setDatabaseSorts(page.id, next);
  };

  const addSortRule = (preferredColId?: string) => {
    const used = new Set(sortRules.map((r) => r.colId));
    const targetId =
      preferredColId && !used.has(preferredColId)
        ? preferredColId
        : (sortableColumns.find((c) => !used.has(c.id))?.id ?? sortableColumns[0]?.id);
    if (!targetId) return;
    updateSortRules([...sortRules, { colId: targetId, dir: 'asc' }]);
    setShowSortPanel(true);
  };

  const toggleHeaderSort = (colId: string) => {
    const idx = sortRules.findIndex((r) => r.colId === colId);
    if (idx === -1) {
      updateSortRules([...sortRules, { colId, dir: 'asc' }]);
      return;
    }
    const cur = sortRules[idx];
    if (cur.dir === 'asc') {
      updateSortRules(sortRules.map((r, i) => (i === idx ? { ...r, dir: 'desc' } : r)));
    } else {
      updateSortRules(sortRules.filter((_, i) => i !== idx));
    }
  };

  const moveSortRule = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= sortRules.length) return;
    const next = [...sortRules];
    [next[index], next[target]] = [next[target], next[index]];
    updateSortRules(next);
  };

  const getRelationRowLabel = (
    targetDbId: string | undefined,
    targetRow: DatabaseRow | undefined,
    targetPrimaryColId: string | undefined,
    fallbackId: string
  ): string => {
    if (targetDbId === IMPRO_DB_IDS.participants && improModel.ready) {
      return improModel.participantById.get(fallbackId)?.displayLabel ?? fallbackId;
    }
    if (targetRow && targetPrimaryColId) {
      return String(targetRow.cells[targetPrimaryColId] ?? fallbackId);
    }
    return fallbackId;
  };

  const openNewColPanel = () => {
    const firstRel = columns.find((c) => c.type === 'relation');
    const firstOtherDb = databasePages.find((d) => d.id !== page.id) ?? databasePages[0];
    setConfirmRemoveCol(false);
    setColPanel({
      editingId: null,
      name: '',
      type: 'text',
      options: ['À faire', 'En cours', 'Terminé'],
      relationTargetPageId: firstOtherDb?.id ?? '',
      rollupRelationColId: firstRel?.id ?? '',
      rollupTargetColId: '',
      rollupFn: 'count',
      formulaExpression: '',
    });
  };

  const openEditColPanel = (col: DatabaseColumn) => {
    const firstRel = columns.find((c) => c.type === 'relation');
    const firstOtherDb = databasePages.find((d) => d.id !== page.id) ?? databasePages[0];
    setConfirmRemoveCol(false);
    setColPanel({
      editingId: col.id,
      name: col.name,
      type: col.type,
      options: collectColumnChoices(col, rows),
      relationTargetPageId: col.relationTargetPageId ?? firstOtherDb?.id ?? '',
      rollupRelationColId: col.rollupRelationColId ?? firstRel?.id ?? '',
      rollupTargetColId: col.rollupTargetColId ?? '',
      rollupFn: col.rollupFn ?? 'count',
      formulaExpression: col.formulaExpression ?? '',
    });
  };

  const saveColPanel = () => {
    if (!colPanel) return;
    const trimmedName = colPanel.name.trim().slice(0, 80);
    if (!trimmedName) return;

    const colId = colPanel.editingId ?? generateId('col').slice(0, 32);
    const nextCol: DatabaseColumn = {
      id: colId,
      name: trimmedName,
      type: colPanel.type,
    };

    if (colPanel.type === 'select' || colPanel.type === 'multi_select') {
      const opts = Array.from(
        new Set(colPanel.options.map((s) => s.trim()).filter(Boolean))
      ).slice(0, 100);
      nextCol.options =
        opts.length > 0 ? opts : colPanel.type === 'select' ? ['À faire', 'En cours', 'Terminé'] : [];
    } else if (colPanel.type === 'relation') {
      if (colPanel.relationTargetPageId) {
        nextCol.relationTargetPageId = colPanel.relationTargetPageId;
      }
    } else if (colPanel.type === 'rollup') {
      if (colPanel.rollupRelationColId) {
        nextCol.rollupRelationColId = colPanel.rollupRelationColId;
      }
      if (colPanel.rollupTargetColId) {
        nextCol.rollupTargetColId = colPanel.rollupTargetColId;
      }
      nextCol.rollupFn = colPanel.rollupFn;
    } else if (colPanel.type === 'formula') {
      nextCol.formulaExpression = colPanel.formulaExpression.slice(0, 2000);
    }

    if (colPanel.editingId) {
      updateDatabaseColumns(
        page.id,
        columns.map((c) => (c.id === colPanel.editingId ? nextCol : c))
      );
    } else {
      updateDatabaseColumns(page.id, [...columns, nextCol]);
    }
    setColPanel(null);
  };

  const removeColumn = (colId: string) => {
    if (columns.length <= 1 || colId === primaryCol.id) return;
    updateDatabaseColumns(
      page.id,
      columns.filter((c) => c.id !== colId)
    );
    setColPanel(null);
    setConfirmRemoveCol(false);
  };

  const formulaPreview = useMemo(() => {
    if (!colPanel || colPanel.type !== 'formula' || !colPanel.formulaExpression.trim()) return null;
    const sampleRow = rows[0];
    if (!sampleRow) return null;
    const previewCol: DatabaseColumn = {
      id: colPanel.editingId ?? '__preview_formula__',
      name: colPanel.name || 'Formule',
      type: 'formula',
      formulaExpression: colPanel.formulaExpression,
    };
    const tempCols = colPanel.editingId
      ? columns.map((c) => (c.id === colPanel.editingId ? previewCol : c))
      : [...columns, previewCol];
    const tempPage: WorkspacePage = { ...page, columns: tempCols };
    const res = getComputedRowCells(tempPage, sampleRow, pages, rowsByPage);
    return {
      text: formatCellText(previewCol, res.cells[previewCol.id], pages, rowsByPage),
      error: res.errors[previewCol.id],
    };
  }, [colPanel, rows, columns, page, pages, rowsByPage]);

  const updateCell = (row: DatabaseRow, colId: string, value: CellValue) => {
    updateDatabaseRow(page.id, row.id, { ...row.cells, [colId]: value });
  };

  const navigateRelationRow = (targetPageId: string, targetRow: DatabaseRow | undefined) => {
    if (isImproDatabasePage(targetPageId) && improModel.ready && targetRow) {
      openImproDetail(targetPageId, targetRow.id);
      return;
    }
    if (targetRow?.linkedPageId) {
      const linked = pages.find((p) => p.id === targetRow.linkedPageId && !p.isTrashed);
      if (linked) {
        selectPage(linked.id);
        return;
      }
    }
    selectPage(targetPageId);
  };

  const renderCellInput = (row: DatabaseRow, col: DatabaseColumn) => {
    const computed = computedByRowId.get(row.id);
    const val = (computed?.cells ?? row.cells)[col.id];
    const cellError = computed?.errors[col.id];
    const isEditorOpen =
      activeCellEditor?.rowId === row.id && activeCellEditor?.colId === col.id;

    if (col.type === 'formula' || col.type === 'rollup') {
      if (cellError) {
        return (
          <span
            title={cellError}
            className="text-xs font-mono text-red-600 dark:text-red-400 cursor-help"
          >
            #Erreur
          </span>
        );
      }
      const formatted = formatCellText(col, val, pages, rowsByPage);
      const isNumOrBool = typeof val === 'number' || typeof val === 'boolean';
      return (
        <span
          className={`text-sm block truncate ${
            isNumOrBool ? 'font-mono tabular-nums' : ''
          } text-slate-700 dark:text-slate-300`}
        >
          {formatted || '—'}
        </span>
      );
    }

    if (col.type === 'relation') {
      const targetDbId = col.relationTargetPageId;
      const targetDb = targetDbId ? pages.find((p) => p.id === targetDbId && !p.isTrashed) : null;
      const targetRows = targetDbId ? rowsByPage[targetDbId] ?? [] : [];
      const targetPrimaryColId = targetDb?.columns?.[0]?.id;
      const targetRowMap = new Map(targetRows.map((r) => [r.id, r]));
      const selectedIds = Array.isArray(val)
        ? val
        : typeof val === 'string' && val
          ? [val]
          : [];
      const isSeanceParticipantCol =
        page.id === IMPRO_DB_IDS.seances && col.id === IMPRO_COL_IDS.seances.participants;
      const rawSeanceGroupe = row.cells[IMPRO_COL_IDS.seances.groupe];
      const seanceGroupeIds = Array.isArray(rawSeanceGroupe) ? rawSeanceGroupe : [];
      const rq = isEditorOpen ? relationQuery.trim().toLowerCase() : '';
      const filteredTargetRows = isEditorOpen
        ? targetRows.filter((tr) => {
            if (!rq) return true;
            const lbl = getRelationRowLabel(targetDbId, tr, targetPrimaryColId, tr.id);
            return lbl.toLowerCase().includes(rq);
          })
        : [];

      return (
        <div className="space-y-1.5 min-w-0">
          <div className="flex flex-wrap items-center gap-1">
            {selectedIds.slice(0, 6).map((tid) => {
              const targetRow = targetRowMap.get(tid);
              const label = getRelationRowLabel(targetDbId, targetRow, targetPrimaryColId, tid);
              return targetDb ? (
                <button
                  key={tid}
                  type="button"
                  onClick={() => navigateRelationRow(targetDb.id, targetRow)}
                  className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 hover:border-slate-400 dark:hover:border-slate-500 underline decoration-slate-300 dark:decoration-slate-600 truncate max-w-[160px]"
                >
                  {label}
                </button>
              ) : (
                <span
                  key={tid}
                  className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400"
                >
                  {label}
                </span>
              );
            })}
            {selectedIds.length > 6 && (
              <button
                type="button"
                onClick={() => isImproPage && openImproDetail(page.id, row.id)}
                className="text-xs font-mono tabular-nums text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                +{selectedIds.length - 6}
              </button>
            )}
            {targetDb && (
              <button
                type="button"
                onClick={() => {
                  setRelationQuery('');
                  setActiveCellEditor(isEditorOpen ? null : { rowId: row.id, colId: col.id });
                }}
                aria-label={`Lier ${col.name}`}
                className="px-1.5 py-0.5 rounded text-xs text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {isEditorOpen ? 'OK' : '+'}
              </button>
            )}
            {isSeanceParticipantCol && seanceGroupeIds.length > 0 && (
              <button
                type="button"
                onClick={() => prefillSeanceFromGroup(row.id, 'merge')}
                className="px-1.5 py-0.5 rounded text-[11px] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                Pré-remplir
              </button>
            )}
          </div>

          {isEditorOpen && targetDb && (
            <div className="p-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 space-y-1.5 min-w-[210px]">
              {targetRows.length > 8 && (
                <input
                  type="text"
                  value={relationQuery}
                  onChange={(e) => setRelationQuery(e.target.value)}
                  placeholder="Filtrer..."
                  className="w-full h-7 px-2 rounded border border-slate-200 dark:border-slate-700 bg-transparent text-xs focus:outline-none"
                />
              )}
              <div className="max-h-40 overflow-y-auto space-y-1">
                {filteredTargetRows.length === 0 ? (
                  <div className="text-xs text-slate-400">Aucune ligne cible</div>
                ) : (
                  filteredTargetRows.slice(0, 100).map((tr) => {
                    const checked = selectedIds.includes(tr.id);
                    const tLabel = getRelationRowLabel(targetDbId, tr, targetPrimaryColId, tr.id);
                    return (
                      <label
                        key={tr.id}
                        className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer py-0.5"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const nextIds = checked
                              ? selectedIds.filter((id) => id !== tr.id)
                              : [...selectedIds, tr.id];
                            updateCell(row, col.id, nextIds);
                          }}
                          className="w-3.5 h-3.5 rounded accent-slate-900 dark:accent-slate-100"
                        />
                        <span className="truncate">{tLabel || 'Sans titre'}</span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (col.type === 'multi_select') {
      const rawTags = Array.isArray(val)
        ? val
        : typeof val === 'string' && val
          ? val
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : [];
      const optionIndex = new Map((col.options ?? []).map((opt, idx) => [opt, idx]));
      const selectedTags = [...rawTags].sort((a, b) => {
        const ra = optionIndex.get(a) ?? Number.MAX_SAFE_INTEGER;
        const rb = optionIndex.get(b) ?? Number.MAX_SAFE_INTEGER;
        return ra - rb;
      });
      const availableOptions = Array.from(new Set([...(col.options ?? []), ...selectedTags]));

      return (
        <div className="space-y-1.5 min-w-0">
          <div className="flex flex-wrap items-center gap-1">
            {selectedTags.map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300"
              >
                {tag}
              </span>
            ))}
            <button
              type="button"
              onClick={() => {
                setNewTagInput('');
                setActiveCellEditor(isEditorOpen ? null : { rowId: row.id, colId: col.id });
              }}
              aria-label={`Modifier ${col.name}`}
              className="px-1.5 py-0.5 rounded text-xs text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {isEditorOpen ? 'OK' : '+'}
            </button>
          </div>

          {isEditorOpen && (
            <div className="p-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 space-y-1.5">
              {availableOptions.map((opt) => {
                const checked = selectedTags.includes(opt);
                return (
                  <label
                    key={opt}
                    className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const nextTags = checked
                          ? selectedTags.filter((t) => t !== opt)
                          : [...selectedTags, opt];
                        updateCell(row, col.id, nextTags);
                      }}
                      className="w-3.5 h-3.5 rounded accent-slate-900 dark:accent-slate-100"
                    />
                    <span className="truncate">{opt}</span>
                  </label>
                );
              })}
              <div className="flex items-center gap-1 pt-1 border-t border-slate-100 dark:border-slate-800">
                <input
                  type="text"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newTagInput.trim()) {
                      e.preventDefault();
                      const added = newTagInput.trim().slice(0, 60);
                      const nextTags = Array.from(new Set([...selectedTags, added]));
                      updateCell(row, col.id, nextTags);
                      if (!(col.options ?? []).includes(added)) {
                        updateDatabaseColumns(
                          page.id,
                          columns.map((c) =>
                            c.id === col.id
                              ? { ...c, options: [...(c.options ?? []), added].slice(0, 100) }
                              : c
                          )
                        );
                      }
                      setNewTagInput('');
                    }
                  }}
                  placeholder="Nouvelle option..."
                  className="flex-1 min-w-0 px-1.5 py-0.5 text-xs bg-transparent border border-slate-200 dark:border-slate-700 rounded focus:outline-none"
                />
              </div>
            </div>
          )}
        </div>
      );
    }

    if (col.type === 'checkbox') {
      return (
        <input
          type="checkbox"
          checked={Boolean(val)}
          onChange={(e) => updateCell(row, col.id, e.target.checked)}
          aria-label={`${col.name} pour ${String(row.cells[primaryCol.id] || 'ligne')}`}
          className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 accent-slate-900 dark:accent-slate-100 cursor-pointer"
        />
      );
    }

    if (col.type === 'select') {
      const currentVal = String(val ?? '');
      const options =
        col.options && col.options.length > 0 ? col.options : ['À faire', 'En cours', 'Terminé'];
      return (
        <select
          value={currentVal}
          onChange={(e) => updateCell(row, col.id, e.target.value)}
          aria-label={col.name}
          className="w-full bg-transparent text-sm text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
        >
          {!options.includes(currentVal) && (
            <option value={currentVal} className="bg-white dark:bg-slate-900">
              {currentVal || '—'}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt} value={opt} className="bg-white dark:bg-slate-900">
              {opt}
            </option>
          ))}
        </select>
      );
    }

    if (col.type === 'number') {
      return (
        <input
          type="number"
          value={val === undefined || val === '' ? '' : Number(val)}
          onChange={(e) =>
            updateCell(row, col.id, e.target.value === '' ? '' : Number(e.target.value))
          }
          aria-label={col.name}
          className="w-full bg-transparent text-sm font-mono tabular-nums text-slate-800 dark:text-slate-200 focus:outline-none"
        />
      );
    }

    if (col.type === 'date') {
      return (
        <input
          type="date"
          value={String(val ?? '')}
          onChange={(e) => updateCell(row, col.id, e.target.value)}
          aria-label={col.name}
          className="w-full bg-transparent text-sm font-mono tabular-nums text-slate-700 dark:text-slate-300 focus:outline-none"
        />
      );
    }

    return (
      <input
        type={col.type === 'url' ? 'url' : 'text'}
        value={String(val ?? '')}
        onChange={(e) => updateCell(row, col.id, e.target.value)}
        placeholder="—"
        aria-label={col.name}
        className="w-full truncate bg-transparent text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-300 dark:placeholder:text-slate-700 focus:outline-none"
      />
    );
  };

  const selectedRollupRelCol = colPanel
    ? columns.find((c) => c.id === colPanel.rollupRelationColId && c.type === 'relation')
    : undefined;
  const rollupTargetDb = selectedRollupRelCol?.relationTargetPageId
    ? pages.find((p) => p.id === selectedRollupRelCol.relationTargetPageId)
    : undefined;

  const totalTableWidth =
    columns.reduce((sum, col) => sum + getColWidth(col), 0) +
    deducedColumns.reduce((sum, dc) => sum + getDeducedWidth(dc), 0) +
    ACTIONS_COL_WIDTH;
  const hasCustomPrimaryWidth = primaryCol ? pageCustomWidths[primaryCol.id] !== undefined : false;

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-5">
      {/* En-tête Base */}
      <div className="space-y-2">
        <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 tabular-nums">
          <span>{page.source === 'notion_import' ? 'Importé de Notion' : 'Base de données'}</span>
          <span aria-hidden="true">·</span>
          <span>
            {rows.length} {rows.length > 1 ? 'lignes' : 'ligne'}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {columns.length} {columns.length > 1 ? 'colonnes' : 'colonne'}
          </span>
        </div>

        <input
          type="text"
          value={page.title}
          onChange={(e) => updatePageTitle(page.id, e.target.value)}
          placeholder="Sans titre"
          aria-label="Titre de la base"
          className="w-full bg-transparent font-display text-3xl font-bold tracking-tight text-slate-950 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-700 focus:outline-none"
        />
      </div>

      {/* Barre d'outils vues & actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          {(
            [
              { id: 'table', label: 'Tableau', icon: Table2 },
              { id: 'kanban', label: 'Kanban', icon: Columns3 },
              { id: 'list', label: 'Liste', icon: LayoutList },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => updateDatabaseView(page.id, item.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Filtrer..."
              aria-label="Filtrer les lignes"
              className="h-8 pl-8 pr-3 rounded-md text-xs border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-slate-400"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              if (sortRules.length === 0 && !showSortPanel) {
                addSortRule();
              } else {
                setShowSortPanel((v) => !v);
              }
            }}
            aria-label="Configurer le tri"
            className={`h-8 px-2.5 rounded-md text-xs border flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
              sortRules.length > 0 || showSortPanel
                ? 'border-slate-900 dark:border-slate-100 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-medium'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            <span>{sortRules.length > 0 ? `Tri · ${sortRules.length}` : 'Tri'}</span>
          </button>

          <button
            type="button"
            onClick={() => (colPanel && !colPanel.editingId ? setColPanel(null) : openNewColPanel())}
            className="h-8 px-3 rounded-md text-xs font-medium border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 flex items-center gap-1 whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Colonne</span>
          </button>

          <button
            type="button"
            onClick={() => void addDatabaseRow(page.id)}
            className="h-8 px-3 rounded-md text-xs font-medium bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:opacity-90 flex items-center gap-1 whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Ligne</span>
          </button>
        </div>
      </div>

      {/* Résumé compact du tri automatique actif */}
      {sortRules.length > 0 && !showSortPanel && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
          <span className="text-slate-400">Tri auto :</span>
          {sortRules.map((rule, idx) => {
            const colInfo = sortableColumns.find((c) => c.id === rule.colId);
            const dirLabel = formatSortDirLabel(colInfo, rule.dir, true);
            return (
              <span key={`${rule.colId}-${idx}`} className="inline-flex items-center gap-1">
                {idx > 0 && <span className="text-slate-300 dark:text-slate-700">›</span>}
                <button
                  type="button"
                  onClick={() =>
                    updateSortRules(
                      sortRules.map((r, i) =>
                        i === idx ? { ...r, dir: r.dir === 'asc' ? 'desc' : 'asc' } : r
                      )
                    )
                  }
                  className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:border-slate-400 inline-flex items-center gap-1"
                >
                  <span className="font-mono text-[11px] text-slate-400">{idx + 1}.</span>
                  <span>{colInfo?.name ?? rule.colId}</span>
                  <span className="font-mono text-[11px]">{dirLabel}</span>
                </button>
              </span>
            );
          })}
          <button
            type="button"
            onClick={() => setShowSortPanel(true)}
            className="px-2 py-0.5 rounded text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Modifier
          </button>
          <button
            type="button"
            onClick={() => updateSortRules([])}
            aria-label="Effacer le tri"
            className="w-6 h-6 inline-flex items-center justify-center rounded text-slate-400 hover:text-red-600 dark:hover:text-red-400"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Configurateur en ligne du tri multi-colonnes par priorité */}
      {showSortPanel && (
        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Tri par priorité
            </span>
            <div className="flex items-center gap-2">
              {sortRules.length < sortableColumns.length && (
                <button
                  type="button"
                  onClick={() => addSortRule()}
                  className="h-7 px-2.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>Critère</span>
                </button>
              )}
              {sortRules.length > 0 && (
                <button
                  type="button"
                  onClick={() => updateSortRules([])}
                  className="h-7 px-2.5 rounded text-xs text-slate-500 hover:text-red-600 dark:hover:text-red-400"
                >
                  Effacer
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setShowSortPanel(false);
                  setEditingChoicesColId(null);
                }}
                className="h-7 px-2.5 rounded text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800"
              >
                Fermer
              </button>
            </div>
          </div>

          {sortRules.length === 0 ? (
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Aucun critère actif. Ajoutez une colonne ou cliquez sur les flèches d'en-tête.
            </div>
          ) : (
            <div className="space-y-2">
              {sortRules.map((rule, idx) => {
                const colInfo = sortableColumns.find((c) => c.id === rule.colId);
                const dirLabel = formatSortDirLabel(colInfo, rule.dir, false);
                const targetCol = columns.find((c) => c.id === rule.colId);
                const hasCustomChoices =
                  targetCol?.type === 'select' || targetCol?.type === 'multi_select';
                const isEditingChoices = hasCustomChoices && editingChoicesColId === rule.colId;

                return (
                  <div key={`${rule.colId}-${idx}`} className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="w-6 text-xs font-mono tabular-nums text-slate-500 text-right shrink-0">
                        {idx === 0 ? '1.' : `${idx + 1}.`}
                      </span>

                      <select
                        value={rule.colId}
                        onChange={(e) => {
                          const nextColId = e.target.value;
                          const existingIdx = sortRules.findIndex(
                            (other, oi) => oi !== idx && other.colId === nextColId
                          );
                          if (existingIdx !== -1) {
                            const next = [...sortRules];
                            next[existingIdx] = { ...next[existingIdx], colId: rule.colId };
                            next[idx] = { ...next[idx], colId: nextColId };
                            updateSortRules(next);
                          } else {
                            updateSortRules(
                              sortRules.map((r, i) => (i === idx ? { ...r, colId: nextColId } : r))
                            );
                          }
                        }}
                        aria-label={`Colonne de tri ${idx + 1}`}
                        className="h-8 flex-1 min-w-[160px] max-w-xs px-2.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 focus:outline-none"
                      >
                        {sortableColumns.map((sc) => (
                          <option key={sc.id} value={sc.id}>
                            {sc.name}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() =>
                          updateSortRules(
                            sortRules.map((r, i) =>
                              i === idx ? { ...r, dir: r.dir === 'asc' ? 'desc' : 'asc' } : r
                            )
                          )
                        }
                        aria-label={`Ordre du critère ${idx + 1}`}
                        className="h-8 px-2.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
                      >
                        {dirLabel}
                      </button>

                      {hasCustomChoices && (
                        <button
                          type="button"
                          onClick={() =>
                            setEditingChoicesColId((prev) =>
                              prev === rule.colId ? null : rule.colId
                            )
                          }
                          aria-label={`Ordre des choix pour ${colInfo?.name ?? rule.colId}`}
                          className={`h-8 px-2.5 rounded border text-xs whitespace-nowrap transition-colors ${
                            isEditingChoices
                              ? 'border-slate-900 dark:border-slate-100 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-medium'
                              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          Ordre des choix
                        </button>
                      )}

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveSortRule(idx, -1)}
                          disabled={idx === 0}
                          aria-label={`Monter critère ${idx + 1}`}
                          className="w-7 h-8 inline-flex items-center justify-center rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSortRule(idx, 1)}
                          disabled={idx === sortRules.length - 1}
                          aria-label={`Descendre critère ${idx + 1}`}
                          className="w-7 h-8 inline-flex items-center justify-center rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (editingChoicesColId === rule.colId) {
                              setEditingChoicesColId(null);
                            }
                            updateSortRules(sortRules.filter((_, i) => i !== idx));
                          }}
                          aria-label={`Retirer critère ${idx + 1}`}
                          className="w-7 h-8 inline-flex items-center justify-center rounded text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-200/70 dark:hover:bg-slate-800"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {isEditingChoices && targetCol && (
                      <div className="pl-8 max-w-md">
                        <ChoiceOrderEditor
                          options={collectColumnChoices(targetCol, rows)}
                          onChange={(nextOptions) =>
                            updateDatabaseColumns(
                              page.id,
                              columns.map((c) =>
                                c.id === targetCol.id ? { ...c, options: nextOptions } : c
                              )
                            )
                          }
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Configurateur en ligne de colonne (ajout ou modification) */}
      {colPanel && (
        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={colPanel.name}
              onChange={(e) => setColPanel({ ...colPanel, name: e.target.value })}
              placeholder="Nom de colonne"
              aria-label="Nom de la colonne"
              className="h-8 px-2.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 focus:outline-none"
            />
            <select
              value={colPanel.type}
              onChange={(e) => {
                const nextType = e.target.value as ColumnType;
                let nextOptions = colPanel.options;
                if (
                  (nextType === 'select' || nextType === 'multi_select') &&
                  nextOptions.length === 0
                ) {
                  const sourceCol = colPanel.editingId
                    ? columns.find((c) => c.id === colPanel.editingId)
                    : undefined;
                  const collected = collectColumnChoices(
                    sourceCol ? { ...sourceCol, type: nextType } : undefined,
                    rows
                  );
                  nextOptions =
                    collected.length > 0
                      ? collected
                      : nextType === 'select'
                        ? ['À faire', 'En cours', 'Terminé']
                        : [];
                }
                setColPanel({ ...colPanel, type: nextType, options: nextOptions });
              }}
              aria-label="Type de colonne"
              className="h-8 px-2.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 focus:outline-none"
            >
              {COLUMN_TYPE_LABELS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {colPanel.type === 'relation' && (
              <select
                value={colPanel.relationTargetPageId}
                onChange={(e) =>
                  setColPanel({ ...colPanel, relationTargetPageId: e.target.value })
                }
                aria-label="Base cible de la relation"
                className="h-8 px-2.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 focus:outline-none"
              >
                <option value="">Choisir une base...</option>
                {databasePages.map((db) => (
                  <option key={db.id} value={db.id}>
                    {db.title || 'Sans titre'}
                  </option>
                ))}
              </select>
            )}

            {colPanel.type === 'rollup' && (
              <>
                <select
                  value={colPanel.rollupRelationColId}
                  onChange={(e) =>
                    setColPanel({
                      ...colPanel,
                      rollupRelationColId: e.target.value,
                      rollupTargetColId: '',
                    })
                  }
                  aria-label="Colonne relation source"
                  className="h-8 px-2.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 focus:outline-none"
                >
                  <option value="">Relation...</option>
                  {columns
                    .filter((c) => c.type === 'relation')
                    .map((rc) => (
                      <option key={rc.id} value={rc.id}>
                        {rc.name}
                      </option>
                    ))}
                </select>

                <select
                  value={colPanel.rollupTargetColId}
                  onChange={(e) =>
                    setColPanel({ ...colPanel, rollupTargetColId: e.target.value })
                  }
                  aria-label="Propriété cible"
                  className="h-8 px-2.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 focus:outline-none"
                >
                  <option value="">Propriété cible...</option>
                  {(rollupTargetDb?.columns ?? []).map((tc) => (
                    <option key={tc.id} value={tc.id}>
                      {tc.name}
                    </option>
                  ))}
                </select>

                <select
                  value={colPanel.rollupFn}
                  onChange={(e) =>
                    setColPanel({ ...colPanel, rollupFn: e.target.value as RollupFunction })
                  }
                  aria-label="Fonction d'agrégat"
                  className="h-8 px-2.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 focus:outline-none"
                >
                  {ROLLUP_FN_LABELS.map((fnOpt) => (
                    <option key={fnOpt.value} value={fnOpt.value}>
                      {fnOpt.label}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>

          {(colPanel.type === 'select' || colPanel.type === 'multi_select') && (
            <div className="max-w-md">
              <ChoiceOrderEditor
                options={colPanel.options}
                onChange={(nextOptions) => setColPanel({ ...colPanel, options: nextOptions })}
              />
            </div>
          )}

          {colPanel.type === 'formula' && (
            <div className="space-y-2">
              <input
                type="text"
                value={colPanel.formulaExpression}
                onChange={(e) => setColPanel({ ...colPanel, formulaExpression: e.target.value })}
                placeholder='Ex: prop("Budget") * 1.2 ou if(prop("Fait"), "OK", "À faire")'
                aria-label="Expression de la formule"
                className="w-full h-9 px-3 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-xs text-slate-900 dark:text-slate-100 focus:outline-none"
              />
              <div className="flex flex-wrap items-center gap-1.5">
                {columns
                  .filter((c) => c.id !== colPanel.editingId)
                  .map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() =>
                        setColPanel({
                          ...colPanel,
                          formulaExpression: `${colPanel.formulaExpression}prop("${c.name}")`,
                        })
                      }
                      className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-[11px] text-slate-600 dark:text-slate-300 hover:border-slate-400"
                    >
                      {c.name}
                    </button>
                  ))}
              </div>
              {formulaPreview && (
                <div className="text-xs">
                  {formulaPreview.error ? (
                    <span className="text-red-600 dark:text-red-400">{formulaPreview.error}</span>
                  ) : (
                    <span className="text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      Aperçu ligne 1 : {formulaPreview.text || '—'}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={saveColPanel}
                className="h-8 px-3 rounded bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-xs font-medium whitespace-nowrap"
              >
                {colPanel.editingId ? 'Enregistrer' : 'Ajouter'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setColPanel(null);
                  setConfirmRemoveCol(false);
                }}
                className="h-8 px-2.5 rounded text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                Annuler
              </button>
            </div>

            {colPanel.editingId && colPanel.editingId !== primaryCol.id && (
              <div className="flex items-center gap-2">
                {confirmRemoveCol ? (
                  <>
                    <button
                      type="button"
                      onClick={() => removeColumn(colPanel.editingId!)}
                      className="h-8 px-2.5 rounded bg-red-600 text-white text-xs font-medium whitespace-nowrap"
                    >
                      Confirmer suppression
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRemoveCol(false)}
                      className="h-8 px-2 rounded text-xs text-slate-500"
                    >
                      Non
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmRemoveCol(true)}
                    className="h-8 px-2.5 rounded text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 whitespace-nowrap"
                  >
                    Supprimer la colonne
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* VUE TABLEAU */}
      {activeView === 'table' && (
        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
          <table
            className="table-fixed border-collapse text-left"
            style={{
              width: hasCustomPrimaryWidth
                ? `${totalTableWidth}px`
                : `max(100%, ${totalTableWidth}px)`,
            }}
          >
            <colgroup>
              {displayColumns.map((item) => {
                if (item.kind === 'native') {
                  const isPrimary = item.col.id === primaryCol?.id;
                  const width = getColWidth(item.col);
                  return (
                    <col
                      key={item.id}
                      style={
                        isPrimary && !hasCustomPrimaryWidth ? undefined : { width: `${width}px` }
                      }
                    />
                  );
                }
                return <col key={item.id} style={{ width: `${getDeducedWidth(item.dcol)}px` }} />;
              })}
              <col style={{ width: `${ACTIONS_COL_WIDTH}px` }} />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70">
                {displayColumns.map((item) => {
                  const sortIdx = sortRules.findIndex((r) => r.colId === item.id);
                  const sortRule = sortIdx !== -1 ? sortRules[sortIdx] : null;
                  const isDragging = dragColId === item.id;
                  const dropSide =
                    dropIndicator?.colId === item.id ? dropIndicator.position : null;

                  if (item.kind === 'native') {
                    const col = item.col;
                    const colWidth = getColWidth(col);
                    const minWidth = col.type === 'checkbox' ? 46 : 84;
                    const isCheckbox = col.type === 'checkbox';

                    return (
                      <th
                        key={col.id}
                        {...getThDropProps(col.id)}
                        className={`group/th relative select-none py-2 text-xs font-medium text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-800 last:border-r-0 whitespace-nowrap transition-opacity ${
                          isCheckbox ? 'px-1.5 text-center' : 'px-3'
                        } ${isDragging ? 'opacity-45' : ''}`}
                      >
                        {dropSide && (
                          <div
                            aria-hidden="true"
                            className={`pointer-events-none absolute top-0 bottom-0 w-0.5 bg-slate-900 dark:bg-slate-100 z-20 ${
                              dropSide === 'before' ? 'left-0' : 'right-0'
                            }`}
                          />
                        )}
                        <div
                          {...getDragHandleProps(col.id)}
                          title="Glisser pour réordonner"
                          className="flex items-center justify-between gap-1 min-w-0 cursor-grab active:cursor-grabbing"
                        >
                          {!isCheckbox && (
                            <GripVertical className="w-3 h-3 shrink-0 text-slate-300 dark:text-slate-600 opacity-0 group-hover/th:opacity-100 transition-opacity" />
                          )}
                          <button
                            type="button"
                            onClick={() => toggleHeaderSort(col.id)}
                            aria-label={`Trier par ${col.name}`}
                            title={`Trier par ${col.name}`}
                            className={`flex-1 min-w-0 inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer ${
                              isCheckbox ? 'justify-center' : 'text-left'
                            }`}
                          >
                            <span className="truncate">{col.name}</span>
                            {sortRule ? (
                              <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded font-mono text-[10px] bg-slate-200/90 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold shrink-0">
                                <span>{sortIdx + 1}</span>
                                <span>{sortRule.dir === 'asc' ? '↑' : '↓'}</span>
                              </span>
                            ) : (
                              <ArrowUpDown className="w-3 h-3 shrink-0 opacity-0 group-hover/th:opacity-70 transition-opacity" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditColPanel(col);
                            }}
                            aria-label={`Configurer colonne ${col.name}`}
                            title={`Configurer ${col.name}`}
                            className={
                              isCheckbox
                                ? 'absolute right-1.5 top-1/2 -translate-y-1/2 w-4 h-4 inline-flex items-center justify-center rounded bg-slate-50/90 dark:bg-slate-900/90 text-slate-400 hover:text-slate-900 dark:hover:text-white opacity-0 group-hover/th:opacity-100 focus:opacity-100 transition-opacity'
                                : 'w-5 h-5 shrink-0 inline-flex items-center justify-center rounded text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800 opacity-35 group-hover/th:opacity-100 focus:opacity-100 transition-opacity'
                            }
                          >
                            <Settings2 className="w-3 h-3" />
                          </button>
                        </div>

                        <div
                          role="separator"
                          aria-orientation="vertical"
                          aria-label={`Redimensionner ${col.name}`}
                          title="Glisser pour redimensionner (double-clic pour réinitialiser)"
                          onPointerDown={(e) => startColumnResize(e, col.id, colWidth, minWidth)}
                          onDoubleClick={() => resetColumnWidth(page.id, col.id)}
                          className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-slate-400/60 dark:hover:bg-slate-500/60 active:bg-slate-600 touch-none z-10"
                        />
                      </th>
                    );
                  }

                  const dcol = item.dcol;
                  const dWidth = getDeducedWidth(dcol);
                  return (
                    <th
                      key={dcol.id}
                      {...getThDropProps(dcol.id)}
                      className={`group/th relative select-none px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap transition-opacity ${
                        isDragging ? 'opacity-45' : ''
                      }`}
                    >
                      {dropSide && (
                        <div
                          aria-hidden="true"
                          className={`pointer-events-none absolute top-0 bottom-0 w-0.5 bg-slate-900 dark:bg-slate-100 z-20 ${
                            dropSide === 'before' ? 'left-0' : 'right-0'
                          }`}
                        />
                      )}
                      <div
                        {...getDragHandleProps(dcol.id)}
                        title="Glisser pour réordonner"
                        className="flex items-center gap-1 min-w-0 cursor-grab active:cursor-grabbing"
                      >
                        <GripVertical className="w-3 h-3 shrink-0 text-slate-300 dark:text-slate-600 opacity-0 group-hover/th:opacity-100 transition-opacity" />
                        <button
                          type="button"
                          onClick={() => toggleHeaderSort(dcol.id)}
                          aria-label={`Trier par ${dcol.name}`}
                          title={`Trier par ${dcol.name}`}
                          className="flex-1 min-w-0 inline-flex items-center justify-between gap-1 text-left hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                        >
                          <span className="truncate">{dcol.name}</span>
                          {sortRule ? (
                            <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded font-mono text-[10px] bg-slate-200/90 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold shrink-0">
                              <span>{sortIdx + 1}</span>
                              <span>{sortRule.dir === 'asc' ? '↑' : '↓'}</span>
                            </span>
                          ) : (
                            <ArrowUpDown className="w-3 h-3 shrink-0 opacity-0 group-hover/th:opacity-70 transition-opacity" />
                          )}
                        </button>
                      </div>

                      <div
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={`Redimensionner ${dcol.name}`}
                        title="Glisser pour redimensionner (double-clic pour réinitialiser)"
                        onPointerDown={(e) => startColumnResize(e, dcol.id, dWidth, 84)}
                        onDoubleClick={() => resetColumnWidth(page.id, dcol.id)}
                        className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-slate-400/60 dark:hover:bg-slate-500/60 active:bg-slate-600 touch-none z-10"
                      />
                    </th>
                  );
                })}
                <th className="px-2 py-2" aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {visibleRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={displayColumns.length + 1}
                    className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400"
                  >
                    Aucune ligne
                  </td>
                </tr>
              ) : (
                visibleRows.map((row) => {
                  const rowLabel = String((primaryCol ? row.cells[primaryCol.id] : '') || 'ligne');
                  return (
                    <tr
                      key={row.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-900/40 transition-colors"
                    >
                      {displayColumns.map((item) =>
                        item.kind === 'native' ? (
                          <td
                            key={item.id}
                            className={`py-2 border-r border-slate-200 dark:border-slate-800 last:border-r-0 align-middle overflow-hidden ${
                              item.col.type === 'checkbox' ? 'px-1.5 text-center' : 'px-3'
                            }`}
                          >
                            {renderCellInput(row, item.col)}
                          </td>
                        ) : (
                          <td
                            key={item.id}
                            className={`px-3 py-2 border-r border-slate-200 dark:border-slate-800 align-middle text-xs text-slate-600 dark:text-slate-400 truncate overflow-hidden ${
                              item.dcol.numeric || item.dcol.mono ? 'font-mono tabular-nums' : ''
                            }`}
                          >
                            {item.dcol.render(row)}
                          </td>
                        )
                      )}
                      <td className="px-2 py-2 text-center">
                        <div className="inline-flex items-center gap-0.5">
                          {isImproPage ? (
                            <button
                              type="button"
                              onClick={() => openImproDetail(page.id, row.id)}
                              aria-label={`Fiche ${rowLabel}`}
                              className="h-7 px-2 inline-flex items-center gap-1 rounded text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <Info className="w-3.5 h-3.5" />
                              <span>Fiche</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void openOrCreateRowPage(page.id, row.id)}
                              aria-label={`Ouvrir ${rowLabel}`}
                              title={row.linkedPageId ? 'Ouvrir la fiche liée' : 'Ouvrir en page'}
                              className={`h-7 px-1.5 inline-flex items-center gap-1 rounded text-xs hover:bg-slate-100 dark:hover:bg-slate-800 ${
                                row.linkedPageId
                                  ? 'text-slate-900 dark:text-slate-100 font-medium'
                                  : 'text-slate-400 hover:text-slate-900 dark:hover:text-white'
                              }`}
                            >
                              <FileText className="w-3.5 h-3.5" />
                              <span>Ouvrir</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void addDatabaseRow(page.id, { ...row.cells })}
                            aria-label={`Dupliquer ${rowLabel}`}
                            className="w-7 h-7 inline-flex items-center justify-center rounded text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteDatabaseRow(page.id, row.id)}
                            aria-label={`Supprimer ${rowLabel}`}
                            className="w-7 h-7 inline-flex items-center justify-center rounded text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          {filteredRows.length > visibleRows.length && (
            <div className="px-4 py-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 flex items-center justify-between text-xs text-slate-500">
              <span className="font-mono tabular-nums">
                {visibleRows.length} / {filteredRows.length} lignes
              </span>
              <button
                type="button"
                onClick={() => setShowAllRows(true)}
                className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Tout afficher
              </button>
            </div>
          )}
        </div>
      )}

      {/* VUE KANBAN */}
      {activeView === 'kanban' && (
        <div>
          {!groupCol ? (
            <div className="p-6 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-600 dark:text-slate-400">
              Ajoutez une colonne de type Sélection pour afficher le tableau Kanban.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
              {(groupCol.options ?? ['À faire', 'En cours', 'Terminé']).map((groupName) => {
                const groupRows = filteredRows.filter(
                  (r) => String(r.cells[groupCol.id] ?? '') === groupName
                );
                return (
                  <div
                    key={groupName}
                    className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-3 space-y-2.5"
                  >
                    <div className="flex items-center justify-between px-1">
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {groupName}
                      </span>
                      <span className="text-xs font-mono tabular-nums text-slate-400">
                        {groupRows.length}
                      </span>
                    </div>

                    <div className="space-y-2">
                      {groupRows.map((row) => {
                        const computed = computedByRowId.get(row.id)?.cells ?? row.cells;
                        const titleText = String(row.cells[primaryCol.id] || 'Sans titre');
                        const metaParts = columns
                          .filter((c) => c.id !== primaryCol.id && c.id !== groupCol.id)
                          .map((c) => formatCellText(c, computed[c.id], pages, rowsByPage))
                          .filter(Boolean)
                          .slice(0, 2);

                        return (
                          <div
                            key={row.id}
                            className="rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-3 space-y-2"
                          >
                            <input
                              type="text"
                              value={titleText}
                              onChange={(e) => updateCell(row, primaryCol.id, e.target.value)}
                              aria-label="Titre de la carte"
                              className="w-full bg-transparent text-sm font-medium text-slate-900 dark:text-slate-100 focus:outline-none"
                            />
                            {metaParts.length > 0 && (
                              <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums truncate">
                                {metaParts.join(' · ')}
                              </div>
                            )}
                            <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
                              <select
                                value={groupName}
                                onChange={(e) => updateCell(row, groupCol.id, e.target.value)}
                                aria-label={`Déplacer ${titleText}`}
                                className="bg-transparent text-xs text-slate-600 dark:text-slate-400 focus:outline-none cursor-pointer"
                              >
                                {(groupCol.options ?? []).map((opt) => (
                                  <option key={opt} value={opt} className="bg-white dark:bg-slate-900">
                                    {opt}
                                  </option>
                                ))}
                              </select>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => void openOrCreateRowPage(page.id, row.id)}
                                  aria-label={`Ouvrir ${titleText}`}
                                  className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white"
                                >
                                  Ouvrir
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void deleteDatabaseRow(page.id, row.id)}
                                  aria-label={`Supprimer ${titleText}`}
                                  className="text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        void addDatabaseRow(page.id, {
                          [primaryCol.id]: 'Nouvel élément',
                          [groupCol.id]: groupName,
                        })
                      }
                      className="w-full py-1.5 rounded-md text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 flex items-center justify-center gap-1 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Ajouter</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VUE LISTE */}
      {activeView === 'list' && (
        <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
          {visibleRows.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">Aucune ligne</div>
          ) : (
            visibleRows.map((row) => {
              const computed = computedByRowId.get(row.id)?.cells ?? row.cells;
              const checkCol = columns.find((c) => c.type === 'checkbox');
              const meta = [
                ...columns
                  .filter((c) => c.id !== primaryCol.id && c.id !== checkCol?.id)
                  .map((c) => formatCellText(c, computed[c.id], pages, rowsByPage)),
                ...deducedColumns.map((dc) => dc.render(row)),
              ].filter((v) => v && v !== '—');

              return (
                <div
                  key={row.id}
                  className="px-4 py-2.5 flex items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-900/50"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {checkCol && (
                      <input
                        type="checkbox"
                        checked={Boolean(row.cells[checkCol.id])}
                        onChange={(e) => updateCell(row, checkCol.id, e.target.checked)}
                        aria-label={`Valider ${String(row.cells[primaryCol.id] || 'ligne')}`}
                        className="w-4 h-4 rounded accent-slate-900 dark:accent-slate-100 shrink-0"
                      />
                    )}
                    <input
                      type="text"
                      value={String(row.cells[primaryCol.id] ?? '')}
                      onChange={(e) => updateCell(row, primaryCol.id, e.target.value)}
                      aria-label="Nom"
                      className="flex-1 min-w-0 bg-transparent text-sm font-medium text-slate-900 dark:text-slate-100 focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {meta.length > 0 && (
                      <span className="hidden sm:inline text-xs text-slate-500 dark:text-slate-400 tabular-nums max-w-md truncate">
                        {meta.join(' · ')}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        isImproPage
                          ? openImproDetail(page.id, row.id)
                          : void openOrCreateRowPage(page.id, row.id)
                      }
                      aria-label={`Ouvrir ${String(row.cells[primaryCol.id] || 'ligne')}`}
                      className="px-2 py-1 rounded text-xs text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      {isImproPage ? 'Fiche' : 'Ouvrir'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteDatabaseRow(page.id, row.id)}
                      aria-label={`Supprimer ${String(row.cells[primaryCol.id] || 'ligne')}`}
                      className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
