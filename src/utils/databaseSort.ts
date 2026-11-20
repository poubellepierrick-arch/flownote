import type {
  CellValue,
  DatabaseColumn,
  DatabaseRow,
  DatabaseSortRule,
  WorkspacePage,
} from '../types/workspace';
import { formatCellText } from './notionFormula';

export interface SortableDeducedColumn {
  id: string;
  name: string;
  numeric?: boolean;
  sortValue?: (row: DatabaseRow) => CellValue;
  render: (row: DatabaseRow) => string;
}

function isEmptySortValue(raw: CellValue | undefined, colType?: DatabaseColumn['type']): boolean {
  if (colType === 'checkbox') return false;
  if (raw === undefined || raw === null) return true;
  if (typeof raw === 'number') return !Number.isFinite(raw);
  if (Array.isArray(raw)) return raw.length === 0;
  const s = String(raw).trim();
  return s === '' || s === '—';
}

function buildOptionRankMap(options?: string[]): Map<string, number> | null {
  if (!options || options.length === 0) return null;
  const map = new Map<string, number>();
  options.forEach((opt, idx) => {
    const trimmed = opt.trim();
    if (!trimmed) return;
    if (!map.has(trimmed)) map.set(trimmed, idx);
    const lowerKey = `__ci__:${trimmed.toLowerCase()}`;
    if (!map.has(lowerKey)) map.set(lowerKey, idx);
  });
  return map.size > 0 ? map : null;
}

function getOptionRank(rankMap: Map<string, number>, val: string): number | undefined {
  const trimmed = val.trim();
  if (!trimmed) return undefined;
  return rankMap.get(trimmed) ?? rankMap.get(`__ci__:${trimmed.toLowerCase()}`);
}

function extractMultiValues(raw: CellValue | undefined): string[] {
  if (Array.isArray(raw)) {
    return raw.map((v) => String(v ?? '').trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function compareSingleColumn(
  rawA: CellValue | undefined,
  rawB: CellValue | undefined,
  col: DatabaseColumn | undefined,
  deduced: SortableDeducedColumn | undefined,
  pages: WorkspacePage[],
  rowsByPage: Record<string, DatabaseRow[]>
): number {
  const colType = col?.type;
  const emptyA = isEmptySortValue(rawA, colType);
  const emptyB = isEmptySortValue(rawB, colType);
  if (emptyA && emptyB) return 0;
  if (emptyA) return 1;
  if (emptyB) return -1;

  if (colType === 'checkbox') {
    return Number(Boolean(rawB)) - Number(Boolean(rawA));
  }

  if (
    colType === 'number' ||
    deduced?.numeric ||
    (typeof rawA === 'number' && typeof rawB === 'number')
  ) {
    const na = typeof rawA === 'number' ? rawA : Number(String(rawA).replace(',', '.'));
    const nb = typeof rawB === 'number' ? rawB : Number(String(rawB).replace(',', '.'));
    if (Number.isFinite(na) && Number.isFinite(nb)) {
      if (na !== nb) return na - nb;
      return 0;
    }
  }

  if (col && colType === 'select') {
    const rankMap = buildOptionRankMap(col.options);
    if (rankMap) {
      const strA = Array.isArray(rawA) ? String(rawA[0] ?? '').trim() : String(rawA ?? '').trim();
      const strB = Array.isArray(rawB) ? String(rawB[0] ?? '').trim() : String(rawB ?? '').trim();
      const rA = getOptionRank(rankMap, strA);
      const rB = getOptionRank(rankMap, strB);
      if (rA !== undefined && rB !== undefined) {
        if (rA !== rB) return rA - rB;
        return 0;
      }
      if (rA !== undefined) return -1;
      if (rB !== undefined) return 1;
    }
  }

  if (col && colType === 'multi_select') {
    const rankMap = buildOptionRankMap(col.options);
    if (rankMap) {
      const ranksA = extractMultiValues(rawA)
        .map((v) => getOptionRank(rankMap, v) ?? Number.MAX_SAFE_INTEGER)
        .sort((x, y) => x - y);
      const ranksB = extractMultiValues(rawB)
        .map((v) => getOptionRank(rankMap, v) ?? Number.MAX_SAFE_INTEGER)
        .sort((x, y) => x - y);

      const minLen = Math.min(ranksA.length, ranksB.length);
      for (let i = 0; i < minLen; i++) {
        if (ranksA[i] !== ranksB[i]) {
          return ranksA[i] - ranksB[i];
        }
      }
      if (ranksA.length !== ranksB.length) {
        return ranksA.length - ranksB.length;
      }
      const allListedA = ranksA.every((r) => r !== Number.MAX_SAFE_INTEGER);
      const allListedB = ranksB.every((r) => r !== Number.MAX_SAFE_INTEGER);
      if (allListedA && allListedB) return 0;
    }
  }

  const textA = col
    ? formatCellText(col, rawA, pages, rowsByPage).trim()
    : String(rawA ?? '').trim();
  const textB = col
    ? formatCellText(col, rawB, pages, rowsByPage).trim()
    : String(rawB ?? '').trim();

  if (textA === textB) return 0;
  return textA.localeCompare(textB, 'fr', { numeric: true, sensitivity: 'base' });
}

export function sortDatabaseRows(
  rows: DatabaseRow[],
  rules: DatabaseSortRule[],
  columns: DatabaseColumn[],
  deducedColumns: SortableDeducedColumn[],
  computedCellsByRowId: Map<string, Record<string, CellValue>>,
  pages: WorkspacePage[],
  rowsByPage: Record<string, DatabaseRow[]>
): DatabaseRow[] {
  if (rules.length === 0 || rows.length <= 1) return rows;

  const colMap = new Map(columns.map((c) => [c.id, c]));
  const deducedMap = new Map(deducedColumns.map((d) => [d.id, d]));

  const validRules = rules.filter((r) => colMap.has(r.colId) || deducedMap.has(r.colId));
  if (validRules.length === 0) return rows;

  return [...rows].sort((a, b) => {
    const cellsA = computedCellsByRowId.get(a.id) ?? a.cells;
    const cellsB = computedCellsByRowId.get(b.id) ?? b.cells;

    for (const rule of validRules) {
      const col = colMap.get(rule.colId);
      const ded = deducedMap.get(rule.colId);

      const rawA: CellValue | undefined = ded
        ? ded.sortValue
          ? ded.sortValue(a)
          : ded.render(a)
        : cellsA[rule.colId];

      const rawB: CellValue | undefined = ded
        ? ded.sortValue
          ? ded.sortValue(b)
          : ded.render(b)
        : cellsB[rule.colId];

      const cmp = compareSingleColumn(rawA, rawB, col, ded, pages, rowsByPage);
      if (cmp !== 0) {
        // Les valeurs vides restent en fin de liste même en tri décroissant
        const emptyA = isEmptySortValue(rawA, col?.type);
        const emptyB = isEmptySortValue(rawB, col?.type);
        if (emptyA || emptyB) return cmp;
        return rule.dir === 'asc' ? cmp : -cmp;
      }
    }

    return a.order - b.order;
  });
}
