import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  Dices,
  GripVertical,
  Info,
  Plus,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import type {
  CellValue,
  ColumnType,
  DatabaseColumn,
  DatabaseRow,
  DatabaseSortRule,
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
import { IMPRO_COL_IDS, IMPRO_DB_IDS } from '../utils/improCsvLoader';
import type { ImproExerciseSuggestion, NoveltyBucket } from '../utils/improEngine';
import { formatCellText, getComputedRowCells } from '../utils/notionFormula';
import { ChoiceOrderEditor } from './ChoiceOrderEditor';

export type SuggestionNoveltyTab = 'all_new' | 'majority' | 'done' | 'all';

interface ImproPrepareTableProps {
  suggestions: ImproExerciseSuggestion[];
  selectedExIds: Set<string>;
  groupeId: string;
  presentCount: number;
  sortRules: DatabaseSortRule[];
  onSortRulesChange: (next: DatabaseSortRule[]) => void;
  onToggleExercise: (exerciceId: string) => void;
  onPickRandom: (candidates: ImproExerciseSuggestion[]) => void;
}

const PREP_ACTION_COL_WIDTH = 96;
const PREP_FICHE_COL_WIDTH = 78;
const NOVELTY_COL_ID = 'ded_prep_novelty';

function collectChoices(col: DatabaseColumn | undefined, rows: DatabaseRow[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const pushOpt = (raw: string) => {
    const trimmed = raw.trim().slice(0, 120);
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      out.push(trimmed);
    }
  };
  for (const opt of col?.options ?? []) pushOpt(opt);
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

function getPrepareColWidth(col: DatabaseColumn, isPrimary: boolean): number {
  if (col.type === 'checkbox') return 54;
  if (col.type === 'number' || col.type === 'rollup') return 98;
  if (col.type === 'date') return 124;
  if (col.type === 'select') return 132;
  if (col.type === 'multi_select') return 156;
  if (col.type === 'relation') return 188;
  if (isPrimary) return 220;
  if (
    col.id === IMPRO_COL_IDS.exercices.description ||
    col.name.toLowerCase().includes('description')
  ) {
    return 290;
  }
  return 156;
}

function getPrepareDeducedWidth(dcol: { id: string; name: string; numeric?: boolean }): number {
  if (dcol.id === NOVELTY_COL_ID) return 140;
  if (dcol.numeric) return 130;
  if (dcol.name.toLowerCase().includes('dernière')) return 120;
  return 164;
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

interface DeducedPrepareColumn extends SortableDeducedColumn {
  mono?: boolean;
}

export function ImproPrepareTable({
  suggestions,
  selectedExIds,
  groupeId,
  presentCount,
  sortRules,
  onSortRulesChange,
  onToggleExercise,
  onPickRandom,
}: ImproPrepareTableProps) {
  const {
    pages,
    rowsByPage,
    improModel,
    openImproDetail,
    updateDatabaseRow,
    updateDatabaseColumns,
    columnWidths,
    setColumnWidth,
    resetColumnWidth,
    tableColumnOrders,
    setTableColumnOrder,
    selectPage,
  } = useWorkspace();

  const [noveltyTab, setNoveltyTab] = useState<SuggestionNoveltyTab>('all_new');
  const [searchQuery, setSearchQuery] = useState('');
  const [etapeFilter, setEtapeFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [onlyCheck1, setOnlyCheck1] = useState(false);
  const [onlyCheck2, setOnlyCheck2] = useState(false);
  const [onlyCheckV, setOnlyCheckV] = useState(false);
  const [showSortPanel, setShowSortPanel] = useState(false);
  const [editingChoicesColId, setEditingChoicesColId] = useState<string | null>(null);
  const [showAllRows, setShowAllRows] = useState(false);
  const [resizingCol, setResizingCol] = useState<{
    colId: string;
    startX: number;
    startWidth: number;
    minWidth: number;
  } | null>(null);

  const exPage = useMemo(
    () => pages.find((p) => p.id === IMPRO_DB_IDS.exercices && !p.isTrashed) ?? null,
    [pages]
  );

  const exRows = rowsByPage[IMPRO_DB_IDS.exercices] ?? [];

  const columns: DatabaseColumn[] = useMemo(
    () =>
      exPage?.columns && exPage.columns.length > 0
        ? exPage.columns
        : [{ id: IMPRO_COL_IDS.exercices.nom, name: 'Nom', type: 'text' }],
    [exPage]
  );

  const primaryCol = getPrimaryColumn(columns) ?? columns[0];

  const suggestionByExId = useMemo(() => {
    const map = new Map<string, ImproExerciseSuggestion>();
    for (const s of suggestions) {
      map.set(s.exercise.id, s);
    }
    return map;
  }, [suggestions]);

  useEffect(() => {
    if (!resizingCol) return;
    const onPointerMove = (ev: PointerEvent) => {
      const delta = ev.clientX - resizingCol.startX;
      const nextWidth = Math.max(
        resizingCol.minWidth,
        Math.min(640, resizingCol.startWidth + delta)
      );
      setColumnWidth(IMPRO_DB_IDS.exercices, resizingCol.colId, nextWidth);
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
  }, [resizingCol, setColumnWidth]);

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

  const computedByRowId = useMemo(() => {
    const map = new Map<string, { cells: Record<string, CellValue>; errors: Record<string, string> }>();
    if (!exPage) return map;
    for (const row of exRows) {
      map.set(row.id, getComputedRowCells(exPage, row, pages, rowsByPage));
    }
    return map;
  }, [exRows, exPage, pages, rowsByPage]);

  const computedCellsMap = useMemo(() => {
    const map = new Map<string, Record<string, CellValue>>();
    for (const [id, entry] of computedByRowId.entries()) {
      map.set(id, entry.cells);
    }
    return map;
  }, [computedByRowId]);

  const formatNoveltyLabel = (s: ImproExerciseSuggestion | undefined): string => {
    if (!s) return '—';
    if (s.totalPresent > 0) {
      return `${s.unseenCount}/${s.totalPresent} inédits`;
    }
    if (groupeId) {
      return s.groupDoneCount === 0 ? 'Inédit groupe' : `${s.groupDoneCount}× groupe`;
    }
    return s.exercise.usageCount === 0 ? 'Jamais fait' : `${s.exercise.usageCount}×`;
  };

  const deducedColumns: DeducedPrepareColumn[] = useMemo(
    () => [
      {
        id: NOVELTY_COL_ID,
        name: presentCount > 0 ? 'Nouveauté (présents)' : 'Nouveauté',
        numeric: true,
        mono: true,
        sortValue: (r) => {
          const s = suggestionByExId.get(r.id);
          if (!s) return 999999;
          const unseenPenalty = Math.round((1 - s.unseenRatio) * 1000) * 1000;
          const countTie = groupeId ? s.groupDoneCount : s.exercise.usageCount;
          return unseenPenalty + Math.min(999, countTie);
        },
        render: (r) => formatNoveltyLabel(suggestionByExId.get(r.id)),
      },
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
    ],
    [presentCount, suggestionByExId, improModel.exerciseById, groupeId]
  );

  const noveltyCol = deducedColumns[0];
  const trailingDeducedColumns = deducedColumns.slice(1);

  const sortableColumns = useMemo(
    () => [
      {
        id: noveltyCol.id,
        name: noveltyCol.name,
        numeric: true,
        type: undefined as ColumnType | undefined,
      },
      ...columns.map((c) => ({
        id: c.id,
        name: c.name,
        numeric: c.type === 'number' || c.type === 'rollup',
        type: c.type as ColumnType | undefined,
      })),
      ...trailingDeducedColumns.map((d) => ({
        id: d.id,
        name: d.name,
        numeric: Boolean(d.numeric),
        type: undefined as ColumnType | undefined,
      })),
    ],
    [noveltyCol, columns, trailingDeducedColumns]
  );

  // Filtrage de base (hors onglet de nouveauté) pour compter chaque seau
  const baseMatchedRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return exRows.filter((row) => {
      const ex = improModel.exerciseById.get(row.id);
      if (!ex) return false;
      if (etapeFilter && !ex.etapes.includes(etapeFilter)) return false;
      if (tagFilter && !ex.tags.includes(tagFilter)) return false;
      if (onlyCheck1 && !ex.check1) return false;
      if (onlyCheck2 && !ex.check2) return false;
      if (onlyCheckV && !ex.checkV) return false;
      if (q) {
        const hay = [
          ex.nom,
          ex.etapes.join(' '),
          ex.tags.join(' '),
          ex.description,
          ex.groupNames.join(' '),
          ex.participantNames.join(' '),
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    exRows,
    improModel.exerciseById,
    etapeFilter,
    tagFilter,
    onlyCheck1,
    onlyCheck2,
    onlyCheckV,
    searchQuery,
  ]);

  const bucketCounts = useMemo(() => {
    let allNew = 0;
    let majority = 0;
    let done = 0;
    for (const r of baseMatchedRows) {
      const b = suggestionByExId.get(r.id)?.noveltyBucket ?? 'all_done';
      if (b === 'all_new') allNew++;
      else if (b === 'majority_new' || b === 'mixed') majority++;
      else done++;
    }
    return { allNew, majority, done, all: baseMatchedRows.length };
  }, [baseMatchedRows, suggestionByExId]);

  const filteredAndSortedRows = useMemo(() => {
    const matchesBucket = (b: NoveltyBucket) => {
      if (noveltyTab === 'all') return true;
      if (noveltyTab === 'all_new') return b === 'all_new';
      if (noveltyTab === 'majority') return b === 'all_new' || b === 'majority_new' || b === 'mixed';
      return b === 'all_done';
    };

    const bucketed = baseMatchedRows.filter((row) =>
      matchesBucket(suggestionByExId.get(row.id)?.noveltyBucket ?? 'all_done')
    );

    if (sortRules.length === 0) {
      const orderMap = new Map(suggestions.map((s, idx) => [s.exercise.id, idx]));
      return [...bucketed].sort(
        (a, b) => (orderMap.get(a.id) ?? 99999) - (orderMap.get(b.id) ?? 99999)
      );
    }

    return sortDatabaseRows(
      bucketed,
      sortRules,
      columns,
      deducedColumns,
      computedCellsMap,
      pages,
      rowsByPage
    );
  }, [
    baseMatchedRows,
    noveltyTab,
    suggestionByExId,
    sortRules,
    suggestions,
    columns,
    deducedColumns,
    computedCellsMap,
    pages,
    rowsByPage,
  ]);

  const visibleRows = useMemo(() => {
    if (
      showAllRows ||
      searchQuery.trim().length > 0 ||
      filteredAndSortedRows.length <= 120
    ) {
      return filteredAndSortedRows;
    }
    return filteredAndSortedRows.slice(0, 120);
  }, [filteredAndSortedRows, showAllRows, searchQuery]);

  const randomCandidates = useMemo(
    () =>
      filteredAndSortedRows
        .map((r) => suggestionByExId.get(r.id))
        .filter((s): s is ImproExerciseSuggestion => Boolean(s))
        .filter((s) => !selectedExIds.has(s.exercise.id)),
    [filteredAndSortedRows, suggestionByExId, selectedExIds]
  );

  const pageCustomWidths = columnWidths[IMPRO_DB_IDS.exercices] ?? {};
  const hasCustomWidths = Object.keys(pageCustomWidths).length > 0;
  const getColWidth = (col: DatabaseColumn, isPrimary: boolean) =>
    pageCustomWidths[col.id] ?? getPrepareColWidth(col, isPrimary);
  const getDeducedWidth = (dcol: DeducedPrepareColumn) =>
    pageCustomWidths[dcol.id] ?? getPrepareDeducedWidth(dcol);

  const PREPARE_ORDER_KEY = 'prepare_exercices';

  const orderedDisplayIds = useMemo(() => {
    const nativeIds = columns.map((c) => c.id);
    const defaultIds =
      nativeIds.length > 0
        ? [
            nativeIds[0],
            noveltyCol.id,
            ...nativeIds.slice(1),
            ...trailingDeducedColumns.map((d) => d.id),
          ]
        : [noveltyCol.id, ...trailingDeducedColumns.map((d) => d.id)];
    const saved = tableColumnOrders[PREPARE_ORDER_KEY];
    if (!saved || saved.length === 0) return defaultIds;
    const merged = mergeColumnOrder(defaultIds, saved);
    return syncNativeOrderInMixedList(merged, columns);
  }, [columns, noveltyCol.id, trailingDeducedColumns, tableColumnOrders]);

  const displayColumns = useMemo(() => {
    const nativeMap = new Map(columns.map((c) => [c.id, c]));
    const dedMap = new Map(deducedColumns.map((d) => [d.id, d]));
    const items: Array<
      | { kind: 'native'; id: string; col: DatabaseColumn }
      | { kind: 'deduced'; id: string; dcol: DeducedPrepareColumn }
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
      setTableColumnOrder(PREPARE_ORDER_KEY, nextIds);
      const nextNative = extractReorderedNativeColumns(nextIds, columns);
      const nativeChanged = nextNative.some((c, i) => c.id !== columns[i]?.id);
      if (nativeChanged) {
        updateDatabaseColumns(IMPRO_DB_IDS.exercices, nextNative);
      }
    }
  );

  const totalTableWidth = useMemo(() => {
    const colsSum = columns.reduce((acc, c) => acc + getColWidth(c, c.id === primaryCol.id), 0);
    const dedSum = deducedColumns.reduce((acc, d) => acc + getDeducedWidth(d), 0);
    return PREP_ACTION_COL_WIDTH + colsSum + dedSum + PREP_FICHE_COL_WIDTH;
  }, [columns, deducedColumns, pageCustomWidths, primaryCol.id]);

  const toggleHeaderSort = (colId: string) => {
    const idx = sortRules.findIndex((r) => r.colId === colId);
    if (idx === -1) {
      onSortRulesChange([...sortRules, { colId, dir: 'asc' }]);
      return;
    }
    const cur = sortRules[idx];
    if (cur.dir === 'asc') {
      onSortRulesChange(sortRules.map((r, i) => (i === idx ? { ...r, dir: 'desc' } : r)));
    } else {
      onSortRulesChange(sortRules.filter((_, i) => i !== idx));
    }
  };

  const addSortRule = () => {
    const used = new Set(sortRules.map((r) => r.colId));
    const targetId = sortableColumns.find((c) => !used.has(c.id))?.id ?? sortableColumns[0]?.id;
    if (!targetId) return;
    onSortRulesChange([...sortRules, { colId: targetId, dir: 'asc' }]);
    setShowSortPanel(true);
  };

  const moveSortRule = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= sortRules.length) return;
    const next = [...sortRules];
    [next[index], next[target]] = [next[target], next[index]];
    onSortRulesChange(next);
  };

  const hasFilters = Boolean(
    searchQuery || etapeFilter || tagFilter || onlyCheck1 || onlyCheck2 || onlyCheckV
  );

  const resetFilters = () => {
    setSearchQuery('');
    setEtapeFilter('');
    setTagFilter('');
    setOnlyCheck1(false);
    setOnlyCheck2(false);
    setOnlyCheckV(false);
  };

  const seanceRowById = useMemo(
    () => new Map((rowsByPage[IMPRO_DB_IDS.seances] ?? []).map((r) => [r.id, r])),
    [rowsByPage]
  );

  const renderDataCell = (row: DatabaseRow, col: DatabaseColumn, isPrimary: boolean) => {
    const computed = computedByRowId.get(row.id);
    const val = (computed?.cells ?? row.cells)[col.id];
    const suggestion = suggestionByExId.get(row.id);

    if (isPrimary) {
      return (
        <div className="space-y-0.5 min-w-0">
          <button
            type="button"
            onClick={() => openImproDetail(IMPRO_DB_IDS.exercices, row.id)}
            className="text-left text-sm font-medium text-slate-950 dark:text-slate-100 hover:underline break-words block"
          >
            {String(val ?? '') || 'Exercice'}
          </button>
          {suggestion?.isPlannedInGroup && (
            <div className="text-[11px] text-amber-600 dark:text-amber-400">Déjà prévu</div>
          )}
        </div>
      );
    }

    if (col.type === 'checkbox') {
      return (
        <input
          type="checkbox"
          checked={Boolean(val)}
          onChange={(e) =>
            updateDatabaseRow(IMPRO_DB_IDS.exercices, row.id, {
              ...row.cells,
              [col.id]: e.target.checked,
            })
          }
          aria-label={`${col.name} pour ${String(row.cells[primaryCol.id] ?? 'exercice')}`}
          className="w-4 h-4 accent-slate-900 dark:accent-slate-100 cursor-pointer"
        />
      );
    }

    if (col.type === 'formula' || col.type === 'rollup') {
      const formatted = formatCellText(col, val, pages, rowsByPage);
      const isNum = typeof val === 'number' || typeof val === 'boolean';
      return (
        <span
          className={`text-xs block truncate ${
            isNum ? 'font-mono tabular-nums' : ''
          } text-slate-700 dark:text-slate-300`}
        >
          {formatted || '—'}
        </span>
      );
    }

    if (col.type === 'multi_select') {
      const rawTags = Array.isArray(val)
        ? val.map(String).filter(Boolean)
        : typeof val === 'string' && val.trim()
          ? val
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : [];
      const optionIndex = new Map((col.options ?? []).map((opt, idx) => [opt, idx]));
      const sortedTags = [...rawTags].sort((a, b) => {
        const ra = optionIndex.get(a) ?? Number.MAX_SAFE_INTEGER;
        const rb = optionIndex.get(b) ?? Number.MAX_SAFE_INTEGER;
        return ra - rb;
      });
      if (sortedTags.length === 0) {
        return <span className="text-xs text-slate-300 dark:text-slate-700">—</span>;
      }
      return (
        <div className="flex flex-wrap gap-1">
          {sortedTags.map((tag) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300"
            >
              {tag}
            </span>
          ))}
        </div>
      );
    }

    if (col.type === 'relation') {
      const ids = Array.isArray(val) ? val.map(String).filter(Boolean) : [];
      if (ids.length === 0) {
        return <span className="text-xs text-slate-300 dark:text-slate-700">—</span>;
      }
      const targetPageId = col.relationTargetPageId ?? IMPRO_DB_IDS.seances;
      const targetRows = targetPageId === IMPRO_DB_IDS.seances ? null : rowsByPage[targetPageId] ?? [];
      return (
        <div className="flex flex-wrap items-center gap-1">
          {ids.slice(0, 4).map((rid) => {
            let label = rid;
            if (targetPageId === IMPRO_DB_IDS.seances) {
              const sRow = seanceRowById.get(rid);
              label = sRow
                ? String(sRow.cells[IMPRO_COL_IDS.seances.nom] ?? rid)
                : improModel.seanceById.get(rid)?.nom ?? rid;
            } else if (targetRows) {
              const tRow = targetRows.find((tr) => tr.id === rid);
              if (tRow) {
                const firstText = Object.values(tRow.cells).find((v) => typeof v === 'string' && v.trim());
                if (typeof firstText === 'string') label = firstText;
              }
            }
            return (
              <button
                key={rid}
                type="button"
                onClick={() => openImproDetail(targetPageId, rid)}
                className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 hover:border-slate-400 truncate max-w-[140px]"
              >
                {label}
              </button>
            );
          })}
          {ids.length > 4 && (
            <button
              type="button"
              onClick={() => openImproDetail(IMPRO_DB_IDS.exercices, row.id)}
              className="text-xs font-mono tabular-nums text-slate-500 hover:text-slate-900 dark:hover:text-white"
            >
              +{ids.length - 4}
            </button>
          )}
        </div>
      );
    }

    const isDesc =
      col.id === IMPRO_COL_IDS.exercices.description ||
      col.name.toLowerCase().includes('description');
    const textVal = formatCellText(col, val, pages, rowsByPage).trim();

    if (isDesc) {
      return textVal ? (
        <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-normal break-words leading-snug line-clamp-3">
          {textVal}
        </p>
      ) : (
        <span className="text-xs text-slate-300 dark:text-slate-700">—</span>
      );
    }

    return (
      <span className="text-xs text-slate-700 dark:text-slate-300 block truncate">
        {textVal || '—'}
      </span>
    );
  };

  const renderSortIndicator = (colId: string) => {
    const sortIdx = sortRules.findIndex((r) => r.colId === colId);
    const sortRule = sortIdx !== -1 ? sortRules[sortIdx] : null;
    if (sortRule) {
      return (
        <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded font-mono text-[10px] bg-slate-200/90 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold shrink-0">
          <span>{sortIdx + 1}</span>
          <span>{sortRule.dir === 'asc' ? '↑' : '↓'}</span>
        </span>
      );
    }
    return (
      <ArrowUpDown className="w-3 h-3 shrink-0 opacity-0 group-hover/th:opacity-70 transition-opacity" />
    );
  };

  return (
    <div className="space-y-3">
      {/* Barre d'outils complète identique à l'onglet Exercices + Nouveauté en direct */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[260px]">
          <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-md bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            {(
              [
                { id: 'all_new', label: `Inédits (${bucketCounts.allNew})` },
                { id: 'majority', label: `Majorité (${bucketCounts.majority})` },
                { id: 'done', label: `Faits (${bucketCounts.done})` },
                { id: 'all', label: `Tous (${bucketCounts.all})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setNoveltyTab(tab.id)}
                className={`py-1 px-2 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                  noveltyTab === tab.id
                    ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher..."
              aria-label="Rechercher un exercice"
              className="w-full h-8 pl-8 pr-2.5 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs focus:outline-none focus:border-slate-400"
            />
          </div>

          <select
            value={etapeFilter}
            onChange={(e) => setEtapeFilter(e.target.value)}
            aria-label="Filtrer par étape"
            className="h-8 px-2 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs max-w-[150px]"
          >
            <option value="">Toutes étapes</option>
            {improModel.allEtapes.map((et) => (
              <option key={et} value={et}>
                {et}
              </option>
            ))}
          </select>

          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            aria-label="Filtrer par tag"
            className="h-8 px-2 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs max-w-[140px]"
          >
            <option value="">Tous tags</option>
            {improModel.allTags.map((tg) => (
              <option key={tg} value={tg}>
                {tg}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 shrink-0">
            {(
              [
                { label: '1', active: onlyCheck1, toggle: () => setOnlyCheck1((v) => !v) },
                { label: '2', active: onlyCheck2, toggle: () => setOnlyCheck2((v) => !v) },
                { label: 'V', active: onlyCheckV, toggle: () => setOnlyCheckV((v) => !v) },
              ] as const
            ).map((m) => (
              <button
                key={m.label}
                type="button"
                onClick={m.toggle}
                className={`w-7 h-8 rounded-md border font-mono text-xs font-semibold transition-colors ${
                  m.active
                    ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100'
                    : 'bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {hasFilters && (
            <button
              type="button"
              onClick={resetFilters}
              aria-label="Réinitialiser les filtres"
              className="w-8 h-8 flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => onPickRandom(randomCandidates)}
            disabled={randomCandidates.length === 0}
            className="h-8 px-2.5 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900 disabled:opacity-40 flex items-center gap-1.5 whitespace-nowrap"
          >
            <Dices className="w-3.5 h-3.5" />
            <span>Tirer au sort</span>
          </button>

          <button
            type="button"
            onClick={() => setShowSortPanel((v) => !v)}
            className={`h-8 px-2.5 rounded-md border text-xs flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              showSortPanel || sortRules.length > 0
                ? 'border-slate-900 dark:border-slate-100 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-medium'
                : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            <span>Trier</span>
            {sortRules.length > 0 && (
              <span className="font-mono text-[11px] tabular-nums">({sortRules.length})</span>
            )}
          </button>

          {hasCustomWidths && (
            <button
              type="button"
              onClick={() => resetColumnWidth(IMPRO_DB_IDS.exercices)}
              className="h-8 px-2.5 rounded-md border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              Réinit. largeurs
            </button>
          )}

          {exPage && (
            <button
              type="button"
              onClick={() => selectPage(exPage.id)}
              className="h-8 px-2.5 rounded-md border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              Base Exercices
            </button>
          )}
        </div>
      </div>

      {/* Résumé compact du tri actif */}
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
                    onSortRulesChange(
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
            onClick={() => onSortRulesChange([])}
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
                  onClick={addSortRule}
                  className="h-7 px-2.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>Critère</span>
                </button>
              )}
              {sortRules.length > 0 && (
                <button
                  type="button"
                  onClick={() => onSortRulesChange([])}
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
              Aucun critère actif. Ajoutez un critère ou cliquez sur les en-têtes du tableau.
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
                        {idx + 1}.
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
                            onSortRulesChange(next);
                          } else {
                            onSortRulesChange(
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
                          onSortRulesChange(
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
                            if (editingChoicesColId === rule.colId) setEditingChoicesColId(null);
                            onSortRulesChange(sortRules.filter((_, i) => i !== idx));
                          }}
                          aria-label={`Retirer critère ${idx + 1}`}
                          className="w-7 h-8 inline-flex items-center justify-center rounded text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-200/70 dark:hover:bg-slate-800"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {isEditingChoices && targetCol && exPage && (
                      <div className="pl-8 max-w-md">
                        <ChoiceOrderEditor
                          options={collectChoices(targetCol, exRows)}
                          onChange={(nextOptions) =>
                            updateDatabaseColumns(
                              exPage.id,
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

      {/* Tableau pleine largeur identique à l'onglet Exercices */}
      <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-950">
        <table
          className="table-fixed border-collapse text-left"
          style={{ width: `max(100%, ${totalTableWidth}px)` }}
        >
          <colgroup>
            <col style={{ width: `${PREP_ACTION_COL_WIDTH}px` }} />
            {displayColumns.map((item) =>
              item.kind === 'native' ? (
                <col
                  key={item.id}
                  style={{ width: `${getColWidth(item.col, item.col.id === primaryCol.id)}px` }}
                />
              ) : (
                <col key={item.id} style={{ width: `${getDeducedWidth(item.dcol)}px` }} />
              )
            )}
            <col style={{ width: `${PREP_FICHE_COL_WIDTH}px` }} />
          </colgroup>

          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70">
              <th className="px-2 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-800 text-center whitespace-nowrap">
                Séance
              </th>

              {displayColumns.map((item) => {
                const isDragging = dragColId === item.id;
                const dropSide =
                  dropIndicator?.colId === item.id ? dropIndicator.position : null;

                if (item.kind === 'native') {
                  const col = item.col;
                  const isPrimary = col.id === primaryCol.id;
                  const isCheckbox = col.type === 'checkbox';
                  const minW = isCheckbox ? 46 : isPrimary ? 120 : 84;
                  return (
                    <th
                      key={col.id}
                      {...getThDropProps(col.id)}
                      className={`group/th relative select-none py-2 text-xs font-medium text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap transition-opacity ${
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
                        className="flex items-center gap-1 min-w-0 cursor-grab active:cursor-grabbing"
                      >
                        {!isCheckbox && (
                          <GripVertical className="w-3 h-3 shrink-0 text-slate-300 dark:text-slate-600 opacity-0 group-hover/th:opacity-100 transition-opacity" />
                        )}
                        <button
                          type="button"
                          onClick={() => toggleHeaderSort(col.id)}
                          className={`flex-1 min-w-0 inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer ${
                            isCheckbox ? 'justify-center' : 'justify-between text-left'
                          }`}
                        >
                          <span className="truncate">{col.name}</span>
                          {renderSortIndicator(col.id)}
                        </button>
                      </div>
                      <div
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={`Redimensionner ${col.name}`}
                        title="Glisser pour redimensionner (double-clic pour réinitialiser)"
                        onPointerDown={(e) =>
                          startColumnResize(e, col.id, getColWidth(col, isPrimary), minW)
                        }
                        onDoubleClick={() => resetColumnWidth(IMPRO_DB_IDS.exercices, col.id)}
                        className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-slate-400/60 dark:hover:bg-slate-500/60 active:bg-slate-600 touch-none z-10"
                      />
                    </th>
                  );
                }

                const dcol = item.dcol;
                const minW = dcol.id === NOVELTY_COL_ID ? 96 : 84;
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
                        className="flex-1 min-w-0 inline-flex items-center justify-between gap-1 text-left hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                      >
                        <span className="truncate">{dcol.name}</span>
                        {renderSortIndicator(dcol.id)}
                      </button>
                    </div>
                    <div
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`Redimensionner ${dcol.name}`}
                      title="Glisser pour redimensionner (double-clic pour réinitialiser)"
                      onPointerDown={(e) =>
                        startColumnResize(e, dcol.id, getDeducedWidth(dcol), minW)
                      }
                      onDoubleClick={() => resetColumnWidth(IMPRO_DB_IDS.exercices, dcol.id)}
                      className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-slate-400/60 dark:hover:bg-slate-500/60 active:bg-slate-600 touch-none z-10"
                    />
                  </th>
                );
              })}

              <th className="px-2 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 text-center">
                Fiche
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {visibleRows.length === 0 ? (
              <tr>
                <td
                  colSpan={2 + displayColumns.length}
                  className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400"
                >
                  Aucun exercice pour ces filtres
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => {
                const isAdded = selectedExIds.has(row.id);
                const sug = suggestionByExId.get(row.id);
                const rowLabel = String(row.cells[primaryCol.id] || 'exercice');

                return (
                  <tr
                    key={row.id}
                    className={`transition-colors ${
                      isAdded
                        ? 'bg-emerald-50/40 dark:bg-emerald-950/20 hover:bg-emerald-50/70 dark:hover:bg-emerald-950/30'
                        : 'hover:bg-slate-50/70 dark:hover:bg-slate-900/40'
                    }`}
                  >
                    <td className="px-2 py-2 border-r border-slate-200 dark:border-slate-800 text-center align-middle">
                      <button
                        type="button"
                        onClick={() => onToggleExercise(row.id)}
                        className={`h-7 px-2.5 rounded text-xs font-medium inline-flex items-center gap-1 whitespace-nowrap transition-colors ${
                          isAdded
                            ? 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950'
                            : 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:opacity-90'
                        }`}
                      >
                        {isAdded ? (
                          <>
                            <Check className="w-3 h-3" />
                            <span>Ajouté</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-3 h-3" />
                            <span>Ajouter</span>
                          </>
                        )}
                      </button>
                    </td>

                    {displayColumns.map((item) => {
                      if (item.kind === 'native') {
                        const col = item.col;
                        const isPrimary = col.id === primaryCol.id;
                        return (
                          <td
                            key={col.id}
                            className={`py-2 border-r border-slate-200 dark:border-slate-800 align-middle overflow-hidden ${
                              col.type === 'checkbox' ? 'px-1.5 text-center' : 'px-3'
                            }`}
                          >
                            {renderDataCell(row, col, isPrimary)}
                          </td>
                        );
                      }

                      const dcol = item.dcol;
                      if (dcol.id === NOVELTY_COL_ID) {
                        return (
                          <td
                            key={dcol.id}
                            className={`px-3 py-2 border-r border-slate-200 dark:border-slate-800 align-middle font-mono tabular-nums text-xs whitespace-nowrap overflow-hidden ${
                              sug?.noveltyBucket === 'all_new'
                                ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                                : sug?.noveltyBucket === 'majority_new' ||
                                    sug?.noveltyBucket === 'mixed'
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {dcol.render(row)}
                          </td>
                        );
                      }

                      return (
                        <td
                          key={dcol.id}
                          className={`px-3 py-2 border-r border-slate-200 dark:border-slate-800 align-middle text-xs text-slate-600 dark:text-slate-400 truncate overflow-hidden ${
                            dcol.numeric || dcol.mono ? 'font-mono tabular-nums' : ''
                          }`}
                        >
                          {dcol.render(row)}
                        </td>
                      );
                    })}

                    <td className="px-2 py-2 text-center align-middle">
                      <button
                        type="button"
                        onClick={() => openImproDetail(IMPRO_DB_IDS.exercices, row.id)}
                        aria-label={`Fiche ${rowLabel}`}
                        className="h-7 px-2 inline-flex items-center gap-1 rounded text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
                      >
                        <Info className="w-3.5 h-3.5" />
                        <span>Fiche</span>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {filteredAndSortedRows.length > visibleRows.length && (
          <div className="px-4 py-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 flex items-center justify-between text-xs text-slate-500">
            <span className="font-mono tabular-nums">
              {visibleRows.length} / {filteredAndSortedRows.length} lignes
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
    </div>
  );
}
