import test from 'node:test';
import assert from 'node:assert/strict';
import type { DatabaseColumn, DatabaseRow, WorkspacePage } from '../types/workspace';
import { computeRollupValue, evaluateFormula, getComputedRowCells } from './notionFormula';

test('evaluateFormula exécute arithmétique, prop(), if(), texte et dates', () => {
  const ctx = {
    resolveProp: (name: string) => {
      if (name === 'Prix') return 25;
      if (name === 'Quantité') return 4;
      if (name === 'Validé') return true;
      if (name === 'Titre') return 'Audit';
      if (name === 'Début') return '2026-11-01';
      if (name === 'Fin') return '2026-11-18';
      return null;
    },
  };

  assert.equal(evaluateFormula('prop("Prix") * prop("Quantité")', ctx).value, 100);
  assert.equal(
    evaluateFormula('if(prop("Validé") and prop("Prix") > 20, concat(prop("Titre"), " OK"), "En attente")', ctx).value,
    'Audit OK'
  );
  assert.equal(evaluateFormula('dateBetween(prop("Fin"), prop("Début"), "days")', ctx).value, 17);
  assert.equal(evaluateFormula('dateAdd(prop("Début"), 5, "days")', ctx).value, '2026-11-06');
  assert.equal(evaluateFormula('round(sum(10, 20, 30) / 7, 2)', ctx).value, 8.57);
  assert.ok(evaluateFormula('prop("Prix") / 0', ctx).error);
});

test('computeRollupValue et getComputedRowCells calculent relations, agrégats et formules en chaîne', () => {
  const taskCols: DatabaseColumn[] = [
    { id: 'c_name', name: 'Tâche', type: 'text' },
    { id: 'c_hours', name: 'Heures', type: 'number' },
    { id: 'c_done', name: 'Fait', type: 'checkbox' },
  ];
  const projectCols: DatabaseColumn[] = [
    { id: 'p_name', name: 'Projet', type: 'text' },
    { id: 'p_tasks', name: 'Tâches', type: 'relation', relationTargetPageId: 'db_tasks' },
    {
      id: 'p_sum_hours',
      name: 'Total heures',
      type: 'rollup',
      rollupRelationColId: 'p_tasks',
      rollupTargetColId: 'c_hours',
      rollupFn: 'sum',
    },
    {
      id: 'p_done_count',
      name: 'Terminées',
      type: 'rollup',
      rollupRelationColId: 'p_tasks',
      rollupTargetColId: 'c_done',
      rollupFn: 'checked_count',
    },
    {
      id: 'p_cost',
      name: 'Coût estimé',
      type: 'formula',
      formulaExpression: 'prop("Total heures") * 80',
    },
  ];

  const pages: WorkspacePage[] = [
    {
      id: 'db_tasks',
      workspaceId: 'w1',
      ownerId: 'u1',
      parentId: null,
      title: 'Tâches',
      icon: '⊞',
      type: 'database',
      isFavorite: false,
      isTrashed: false,
      order: 0,
      source: 'native',
      blocks: [],
      columns: taskCols,
    },
    {
      id: 'db_projects',
      workspaceId: 'w1',
      ownerId: 'u1',
      parentId: null,
      title: 'Projets',
      icon: '⊞',
      type: 'database',
      isFavorite: false,
      isTrashed: false,
      order: 1,
      source: 'native',
      blocks: [],
      columns: projectCols,
    },
  ];

  const rowsByPage: Record<string, DatabaseRow[]> = {
    db_tasks: [
      { id: 't1', pageId: 'db_tasks', workspaceId: 'w1', ownerId: 'u1', order: 0, cells: { c_name: 'Design', c_hours: 6, c_done: true } },
      { id: 't2', pageId: 'db_tasks', workspaceId: 'w1', ownerId: 'u1', order: 1, cells: { c_name: 'Code', c_hours: 14, c_done: false } },
    ],
    db_projects: [
      { id: 'p1', pageId: 'db_projects', workspaceId: 'w1', ownerId: 'u1', order: 0, cells: { p_name: 'Alpha', p_tasks: ['t1', 't2'] } },
    ],
  };

  const sumHours = computeRollupValue(
    projectCols[2],
    rowsByPage.db_projects[0],
    projectCols,
    rowsByPage,
    new Map(pages.map((p) => [p.id, p]))
  );
  assert.equal(sumHours, 20);

  const computed = getComputedRowCells(pages[1], rowsByPage.db_projects[0], pages, rowsByPage);
  assert.equal(computed.cells.p_sum_hours, 20);
  assert.equal(computed.cells.p_done_count, 1);
  assert.equal(computed.cells.p_cost, 1600);
  assert.deepEqual(computed.errors, {});
});
