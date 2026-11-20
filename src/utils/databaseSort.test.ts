import assert from 'node:assert/strict';
import test from 'node:test';
import type { DatabaseColumn, DatabaseRow } from '../types/workspace';
import { sortDatabaseRows, type SortableDeducedColumn } from './databaseSort';

function makeRow(id: string, order: number, cells: DatabaseRow['cells']): DatabaseRow {
  return {
    id,
    pageId: 'db_test',
    workspaceId: 'local',
    ownerId: 'local',
    order,
    cells,
  };
}

test('sortDatabaseRows trie selon la priorité des colonnes (B puis D puis A) en cas d’égalité', () => {
  const columns: DatabaseColumn[] = [
    { id: 'colA', name: 'A', type: 'text' },
    { id: 'colB', name: 'B', type: 'text' },
    { id: 'colD', name: 'D', type: 'number' },
  ];

  const rows: DatabaseRow[] = [
    makeRow('r1', 0, { colA: 'Zèbre', colB: 'Scène', colD: 2 }),
    makeRow('r2', 1, { colA: 'Alpha', colB: 'Scène', colD: 2 }),
    makeRow('r3', 2, { colA: 'Bêta', colB: 'Échauffement', colD: 1 }),
    makeRow('r4', 3, { colA: 'Gamma', colB: 'Scène', colD: 5 }),
    makeRow('r5', 4, { colA: 'Delta', colB: 'Échauffement', colD: 3 }),
  ];

  const computed = new Map(rows.map((r) => [r.id, r.cells]));

  // Tri 1: B A→Z, Tri 2: D décroissant (9→0), Tri 3: A A→Z
  const sorted = sortDatabaseRows(
    rows,
    [
      { colId: 'colB', dir: 'asc' },
      { colId: 'colD', dir: 'desc' },
      { colId: 'colA', dir: 'asc' },
    ],
    columns,
    [],
    computed,
    [],
    {}
  );

  assert.deepEqual(
    sorted.map((r) => r.id),
    ['r5', 'r3', 'r4', 'r2', 'r1']
  );
});

test('sortDatabaseRows place les cellules vides après les remplies et passe au critère suivant en cas d’égalité vide', () => {
  const columns: DatabaseColumn[] = [
    { id: 'colA', name: 'Nom', type: 'text' },
    { id: 'colDate', name: 'Date', type: 'date' },
  ];

  const rows: DatabaseRow[] = [
    makeRow('r1', 0, { colA: 'Benoît', colDate: '' }),
    makeRow('r2', 1, { colA: 'Alice', colDate: '' }),
    makeRow('r3', 2, { colA: 'Zoe', colDate: '2026-01-10' }),
    makeRow('r4', 3, { colA: 'Marc', colDate: '2026-04-29' }),
  ];

  const computed = new Map(rows.map((r) => [r.id, r.cells]));

  const sorted = sortDatabaseRows(
    rows,
    [
      { colId: 'colDate', dir: 'desc' },
      { colId: 'colA', dir: 'asc' },
    ],
    columns,
    [],
    computed,
    [],
    {}
  );

  assert.deepEqual(
    sorted.map((r) => r.id),
    ['r4', 'r3', 'r2', 'r1']
  );
});

test('sortDatabaseRows supporte les colonnes déduites numériques et dates avec égalités', () => {
  const columns: DatabaseColumn[] = [{ id: 'nom', name: 'Nom', type: 'text' }];
  const deduced: SortableDeducedColumn[] = [
    {
      id: 'ded_count',
      name: 'Présences',
      numeric: true,
      sortValue: (r) => Number(r.id.replace('p', '')),
      render: (r) => r.id,
    },
    {
      id: 'ded_last',
      name: 'Dernière fois',
      sortValue: (r) => (r.id === 'p1' ? '' : '2026-03-01'),
      render: (r) => (r.id === 'p1' ? '—' : '2026-03-01'),
    },
  ];

  const rows: DatabaseRow[] = [
    makeRow('p1', 0, { nom: 'Paul' }),
    makeRow('p2', 1, { nom: 'Claire' }),
    makeRow('p5', 2, { nom: 'Luc' }),
  ];

  const computed = new Map(rows.map((r) => [r.id, r.cells]));

  const sorted = sortDatabaseRows(
    rows,
    [
      { colId: 'ded_last', dir: 'desc' },
      { colId: 'ded_count', dir: 'desc' },
    ],
    columns,
    deduced,
    computed,
    [],
    {}
  );

  assert.deepEqual(
    sorted.map((r) => r.id),
    ['p5', 'p2', 'p1']
  );
});

test('sortDatabaseRows place les cases cochées en tête (asc) puis départage selon la priorité suivante', () => {
  const columns: DatabaseColumn[] = [
    { id: 'nom', name: 'Nom', type: 'text' },
    { id: 'c1', name: '1', type: 'checkbox' },
    { id: 'c2', name: '2', type: 'checkbox' },
  ];

  const rows: DatabaseRow[] = [
    makeRow('e1', 0, { nom: 'Zénon', c1: true, c2: false }),
    makeRow('e2', 1, { nom: 'Alpha', c1: false, c2: true }),
    makeRow('e3', 2, { nom: 'Bêta', c1: true, c2: true }),
    makeRow('e4', 3, { nom: 'Cercle', c1: true, c2: false }),
  ];

  const computed = new Map(rows.map((r) => [r.id, r.cells]));

  // Tri 1: c1 cochés d'abord (asc), Tri 2: c2 cochés d'abord (asc), Tri 3: Nom A→Z
  const sortedAsc = sortDatabaseRows(
    rows,
    [
      { colId: 'c1', dir: 'asc' },
      { colId: 'c2', dir: 'asc' },
      { colId: 'nom', dir: 'asc' },
    ],
    columns,
    [],
    computed,
    [],
    {}
  );

  assert.deepEqual(
    sortedAsc.map((r) => r.id),
    ['e3', 'e4', 'e1', 'e2']
  );

  // Inversion sur c1 (desc => décochés d'abord)
  const sortedDesc = sortDatabaseRows(
    rows,
    [
      { colId: 'c1', dir: 'desc' },
      { colId: 'nom', dir: 'asc' },
    ],
    columns,
    [],
    computed,
    [],
    {}
  );

  assert.deepEqual(
    sortedDesc.map((r) => r.id),
    ['e2', 'e3', 'e4', 'e1']
  );
});

test('sortDatabaseRows respecte l’ordre personnalisé des choix select (et non A-Z) avec valeurs vides ou non listées en fin', () => {
  const columns: DatabaseColumn[] = [
    {
      id: 'etape',
      name: 'Étape',
      type: 'select',
      options: ['echauffement', 'Scène', 'caté', 'conclusion'],
    },
    { id: 'nom', name: 'Nom', type: 'text' },
  ];

  const rows: DatabaseRow[] = [
    makeRow('r1', 0, { etape: 'caté', nom: 'B' }),
    makeRow('r2', 1, { etape: '', nom: 'Vide' }),
    makeRow('r3', 2, { etape: 'echauffement', nom: 'Z' }),
    makeRow('r4', 3, { etape: 'Scène', nom: 'A' }),
    makeRow('r5', 4, { etape: 'Atelier', nom: 'HorsListe' }),
    makeRow('r6', 5, { etape: 'Scène', nom: 'C' }),
  ];

  const computed = new Map(rows.map((r) => [r.id, r.cells]));

  const sortedAsc = sortDatabaseRows(
    rows,
    [
      { colId: 'etape', dir: 'asc' },
      { colId: 'nom', dir: 'asc' },
    ],
    columns,
    [],
    computed,
    [],
    {}
  );

  // Ordre personnalisé : echauffement (r3) -> Scène (r4, r6) -> caté (r1) -> non listé (r5) -> vide (r2)
  assert.deepEqual(
    sortedAsc.map((r) => r.id),
    ['r3', 'r4', 'r6', 'r1', 'r5', 'r2']
  );

  const sortedDesc = sortDatabaseRows(
    rows,
    [
      { colId: 'etape', dir: 'desc' },
      { colId: 'nom', dir: 'asc' },
    ],
    columns,
    [],
    computed,
    [],
    {}
  );

  // Inversé : non listé -> caté -> Scène -> echauffement -> vide toujours à la fin
  assert.deepEqual(
    sortedDesc.map((r) => r.id),
    ['r5', 'r1', 'r4', 'r6', 'r3', 'r2']
  );
});

test('sortDatabaseRows respecte l’ordre personnalisé des choix multi_select et passe au critère suivant en cas d’égalité', () => {
  const columns: DatabaseColumn[] = [
    {
      id: 'tags',
      name: 'Tags',
      type: 'multi_select',
      options: ['Écoute', 'Énergie', 'Construction', 'Personnage'],
    },
    { id: 'nom', name: 'Nom', type: 'text' },
  ];

  const rows: DatabaseRow[] = [
    makeRow('t1', 0, { tags: ['Personnage'], nom: 'Alpha' }),
    makeRow('t2', 1, { tags: ['Construction', 'Écoute'], nom: 'Zoe' }),
    makeRow('t3', 2, { tags: ['Écoute', 'Construction'], nom: 'Marc' }),
    makeRow('t4', 3, { tags: ['Écoute'], nom: 'Luc' }),
    makeRow('t5', 4, { tags: [], nom: 'Vide' }),
  ];

  const computed = new Map(rows.map((r) => [r.id, r.cells]));

  const sorted = sortDatabaseRows(
    rows,
    [
      { colId: 'tags', dir: 'asc' },
      { colId: 'nom', dir: 'asc' },
    ],
    columns,
    [],
    computed,
    [],
    {}
  );

  // [0] (t4) -> [0, 2] égalité (t3 'Marc' avant t2 'Zoe') -> [3] (t1) -> vide (t5)
  assert.deepEqual(
    sorted.map((r) => r.id),
    ['t4', 't3', 't2', 't1', 't5']
  );
});
