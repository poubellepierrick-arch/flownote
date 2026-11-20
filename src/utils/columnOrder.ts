import type { DatabaseColumn } from '../types/workspace';

const PRIMARY_COL_IDS = new Set([
  'col_ex_nom',
  'col_se_nom',
  'col_gr_nom',
  'col_pa_nom',
  'col_titre',
  'col_title',
  'col_1',
]);

/**
 * Retourne la colonne titre principale d'une base, indépendamment de l'ordre visuel des colonnes.
 */
export function getPrimaryColumn(columns: DatabaseColumn[]): DatabaseColumn | undefined {
  if (columns.length === 0) return undefined;
  return (
    columns.find((c) => PRIMARY_COL_IDS.has(c.id)) ??
    columns.find((c) => c.type === 'text') ??
    columns[0]
  );
}

/**
 * Déplace un identifiant avant ou après un identifiant cible dans une liste ordonnée.
 */
export function reorderIds(
  ids: string[],
  sourceId: string,
  targetId: string,
  position: 'before' | 'after' = 'before'
): string[] {
  if (sourceId === targetId) return ids;
  if (!ids.includes(sourceId) || !ids.includes(targetId)) return ids;
  const withoutSource = ids.filter((id) => id !== sourceId);
  const newTargetIdx = withoutSource.indexOf(targetId);
  if (newTargetIdx === -1) return ids;
  const insertIdx = position === 'after' ? newTargetIdx + 1 : newTargetIdx;
  const next = [...withoutSource];
  next.splice(insertIdx, 0, sourceId);
  return next;
}

/**
 * Déplace un élément par index avant ou après un index cible.
 */
export function reorderByIndex<T>(
  items: T[],
  fromIdx: number,
  toIdx: number,
  position: 'before' | 'after' = 'before'
): T[] {
  if (
    fromIdx === toIdx ||
    fromIdx < 0 ||
    fromIdx >= items.length ||
    toIdx < 0 ||
    toIdx >= items.length
  ) {
    return items;
  }
  const item = items[fromIdx];
  const adjustedTarget = toIdx > fromIdx ? toIdx - 1 : toIdx;
  const insertIdx = position === 'after' ? adjustedTarget + 1 : adjustedTarget;
  const without = items.filter((_, i) => i !== fromIdx);
  const next = [...without];
  next.splice(insertIdx, 0, item);
  return next;
}

/**
 * Fusionne un ordre personnalisé mémorisé avec la liste actuelle des identifiants valides.
 */
export function mergeColumnOrder(defaultIds: string[], savedIds?: string[]): string[] {
  if (!savedIds || savedIds.length === 0) return defaultIds;
  const validSet = new Set(defaultIds);
  const seen = new Set<string>();
  const out: string[] = [];

  for (const id of savedIds) {
    if (validSet.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  for (const id of defaultIds) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/**
 * Conserve la position des colonnes déduites tout en réalignant les emplacements natifs
 * sur l'ordre canonique de `nativeColumns`.
 */
export function syncNativeOrderInMixedList(
  orderedIds: string[],
  nativeColumns: DatabaseColumn[]
): string[] {
  const nativeIds = nativeColumns.map((c) => c.id);
  const nativeSet = new Set(nativeIds);
  let nativeIdx = 0;
  const out: string[] = [];

  for (const id of orderedIds) {
    if (nativeSet.has(id)) {
      if (nativeIdx < nativeIds.length) {
        out.push(nativeIds[nativeIdx++]);
      }
    } else {
      out.push(id);
    }
  }
  while (nativeIdx < nativeIds.length) {
    out.push(nativeIds[nativeIdx++]);
  }
  return out;
}

/**
 * Extrait les colonnes natives dans leur nouvel ordre relatif pour persistance.
 */
export function extractReorderedNativeColumns(
  orderedIds: string[],
  nativeColumns: DatabaseColumn[]
): DatabaseColumn[] {
  const byId = new Map(nativeColumns.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const out: DatabaseColumn[] = [];

  for (const id of orderedIds) {
    const col = byId.get(id);
    if (col && !seen.has(id)) {
      seen.add(id);
      out.push(col);
    }
  }
  for (const col of nativeColumns) {
    if (!seen.has(col.id)) {
      seen.add(col.id);
      out.push(col);
    }
  }
  return out;
}
