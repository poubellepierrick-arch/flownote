import assert from 'node:assert/strict';
import test from 'node:test';
import type { DatabaseColumn } from '../types/workspace';
import {
  extractReorderedNativeColumns,
  getPrimaryColumn,
  mergeColumnOrder,
  reorderByIndex,
  reorderIds,
  syncNativeOrderInMixedList,
} from './columnOrder';

test('reorderIds déplace une colonne avant ou après une cible', () => {
  const base = ['a', 'b', 'c', 'd'];
  assert.deepEqual(reorderIds(base, 'a', 'c', 'before'), ['b', 'a', 'c', 'd']);
  assert.deepEqual(reorderIds(base, 'a', 'c', 'after'), ['b', 'c', 'a', 'd']);
  assert.deepEqual(reorderIds(base, 'c', 'a', 'before'), ['c', 'a', 'b', 'd']);
  assert.deepEqual(reorderIds(base, 'c', 'a', 'after'), ['a', 'c', 'b', 'd']);
  assert.deepEqual(reorderIds(base, 'b', 'b', 'before'), base);
});

test('reorderByIndex déplace un index dans un tableau simple', () => {
  const cols = ['C0', 'C1', 'C2', 'C3'];
  assert.deepEqual(reorderByIndex(cols, 0, 2, 'before'), ['C1', 'C0', 'C2', 'C3']);
  assert.deepEqual(reorderByIndex(cols, 3, 1, 'before'), ['C0', 'C3', 'C1', 'C2']);
  assert.deepEqual(reorderByIndex(cols, 1, 3, 'after'), ['C0', 'C2', 'C3', 'C1']);
});

test('mergeColumnOrder filtre les obsolètes et ajoute les nouvelles colonnes en fin', () => {
  assert.deepEqual(mergeColumnOrder(['a', 'b', 'c', 'd'], ['c', 'old', 'a']), ['c', 'a', 'b', 'd']);
  assert.deepEqual(mergeColumnOrder(['a', 'b'], undefined), ['a', 'b']);
});

test('getPrimaryColumn retrouve la colonne titre même après déplacement', () => {
  const cols: DatabaseColumn[] = [
    { id: 'col_ex_check_1', name: '1', type: 'checkbox' },
    { id: 'col_ex_etape', name: 'Étape', type: 'select' },
    { id: 'col_ex_nom', name: 'Nom', type: 'text' },
  ];
  assert.equal(getPrimaryColumn(cols)?.id, 'col_ex_nom');

  const customCols: DatabaseColumn[] = [
    { id: 'col_statut', name: 'Statut', type: 'select' },
    { id: 'col_titre', name: 'Tâche', type: 'text' },
  ];
  assert.equal(getPrimaryColumn(customCols)?.id, 'col_titre');
});

test('syncNativeOrderInMixedList et extractReorderedNativeColumns synchronisent natif et déduit', () => {
  const nativeCols: DatabaseColumn[] = [
    { id: 'n1', name: 'Nom', type: 'text' },
    { id: 'n3', name: 'Tags', type: 'multi_select' },
    { id: 'n2', name: 'Étape', type: 'select' },
  ];
  const mixed = ['n1', 'ded_novelty', 'n2', 'n3', 'ded_last'];
  const synced = syncNativeOrderInMixedList(mixed, nativeCols);
  assert.deepEqual(synced, ['n1', 'ded_novelty', 'n3', 'n2', 'ded_last']);

  const extracted = extractReorderedNativeColumns(['ded_last', 'n2', 'n1', 'n3'], nativeCols);
  assert.deepEqual(
    extracted.map((c) => c.id),
    ['n2', 'n1', 'n3']
  );
});
