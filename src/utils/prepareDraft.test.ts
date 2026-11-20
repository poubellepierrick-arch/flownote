import test from 'node:test';
import assert from 'node:assert/strict';
import type { DatabaseRow, WorkspacePage } from '../types/workspace';
import { IMPRO_COL_IDS, IMPRO_DB_IDS } from './improCsvLoader';
import { computeImproEcosystem } from './improEngine';
import { applyPrepareNavigation, createInitialPrepareSession } from './prepareDraft';

function buildTestModel() {
  const pages: WorkspacePage[] = [
    {
      id: IMPRO_DB_IDS.exercices,
      workspaceId: 'local',
      ownerId: 'local',
      parentId: null,
      title: 'Exercices',
      icon: '',
      type: 'database',
      isFavorite: false,
      isTrashed: false,
      order: 0,
      source: 'native',
      blocks: [],
      columns: [{ id: IMPRO_COL_IDS.exercices.nom, name: 'Nom', type: 'text' }],
    },
    {
      id: IMPRO_DB_IDS.seances,
      workspaceId: 'local',
      ownerId: 'local',
      parentId: null,
      title: 'Séances',
      icon: '',
      type: 'database',
      isFavorite: false,
      isTrashed: false,
      order: 1,
      source: 'native',
      blocks: [],
      columns: [{ id: IMPRO_COL_IDS.seances.nom, name: 'Nom', type: 'text' }],
    },
    {
      id: IMPRO_DB_IDS.groupes,
      workspaceId: 'local',
      ownerId: 'local',
      parentId: null,
      title: 'Groupes',
      icon: '',
      type: 'database',
      isFavorite: false,
      isTrashed: false,
      order: 2,
      source: 'native',
      blocks: [],
      columns: [{ id: IMPRO_COL_IDS.groupes.nom, name: 'Nom', type: 'text' }],
    },
    {
      id: IMPRO_DB_IDS.participants,
      workspaceId: 'local',
      ownerId: 'local',
      parentId: null,
      title: 'Participants',
      icon: '',
      type: 'database',
      isFavorite: false,
      isTrashed: false,
      order: 3,
      source: 'native',
      blocks: [],
      columns: [{ id: IMPRO_COL_IDS.participants.nom, name: 'Nom', type: 'text' }],
    },
  ];

  const rowsByPage: Record<string, DatabaseRow[]> = {
    [IMPRO_DB_IDS.exercices]: [
      { id: 'ex1', pageId: IMPRO_DB_IDS.exercices, workspaceId: 'local', ownerId: 'local', order: 0, cells: { [IMPRO_COL_IDS.exercices.nom]: 'Miroir' } },
      { id: 'ex2', pageId: IMPRO_DB_IDS.exercices, workspaceId: 'local', ownerId: 'local', order: 1, cells: { [IMPRO_COL_IDS.exercices.nom]: 'Zip Zap Zop' } },
    ],
    [IMPRO_DB_IDS.groupes]: [
      { id: 'grp1', pageId: IMPRO_DB_IDS.groupes, workspaceId: 'local', ownerId: 'local', order: 0, cells: { [IMPRO_COL_IDS.groupes.nom]: 'Apoec', [IMPRO_COL_IDS.groupes.participants]: ['par1', 'par2'] } },
      { id: 'grp2', pageId: IMPRO_DB_IDS.groupes, workspaceId: 'local', ownerId: 'local', order: 1, cells: { [IMPRO_COL_IDS.groupes.nom]: 'Lumières', [IMPRO_COL_IDS.groupes.participants]: ['par2'] } },
    ],
    [IMPRO_DB_IDS.participants]: [
      { id: 'par1', pageId: IMPRO_DB_IDS.participants, workspaceId: 'local', ownerId: 'local', order: 0, cells: { [IMPRO_COL_IDS.participants.nom]: 'Alice' } },
      { id: 'par2', pageId: IMPRO_DB_IDS.participants, workspaceId: 'local', ownerId: 'local', order: 1, cells: { [IMPRO_COL_IDS.participants.nom]: 'Bob' } },
    ],
    [IMPRO_DB_IDS.seances]: [
      {
        id: 'sea1',
        pageId: IMPRO_DB_IDS.seances,
        workspaceId: 'local',
        ownerId: 'local',
        order: 0,
        cells: {
          [IMPRO_COL_IDS.seances.nom]: 'Atelier 1',
          [IMPRO_COL_IDS.seances.date]: '2026-11-10',
          [IMPRO_COL_IDS.seances.statut]: 'Préparée',
          [IMPRO_COL_IDS.seances.groupe]: ['grp1'],
          [IMPRO_COL_IDS.seances.participants]: ['par1'],
          [IMPRO_COL_IDS.seances.exercices]: ['ex1'],
        },
      },
    ],
  };

  return { model: computeImproEcosystem(pages, rowsByPage), rowsByPage };
}

test('addExerciseIds preserves existing groupeId, notes, nom, and prior steps when groupId is omitted', () => {
  const { model, rowsByPage } = buildTestModel();
  let state = createInitialPrepareSession('2026-11-20');
  state = applyPrepareNavigation(state, { groupId: 'grp1' }, model, rowsByPage, '2026-11-20');
  state = {
    ...state,
    nom: 'Mon atelier',
    notes: 'Objectif écoute',
    steps: [{ id: 's1', kind: 'exercise', exerciceId: 'ex1', durationMin: 15, note: '' }],
  };

  const next = applyPrepareNavigation(state, { addExerciseIds: ['ex2'] }, model, rowsByPage, '2026-11-20');
  assert.equal(next.groupeId, 'grp1');
  assert.deepEqual(next.presentIds, ['par1', 'par2']);
  assert.equal(next.nom, 'Mon atelier');
  assert.equal(next.notes, 'Objectif écoute');
  assert.equal(next.steps.length, 2);
  assert.equal(next.steps[1]?.exerciceId, 'ex2');
  assert.equal(next.feedback?.text, 'Exercice ajouté au déroulé');
});

test('addExerciseIds with same groupId preserves existing steps and does not wipe draft', () => {
  const { model, rowsByPage } = buildTestModel();
  let state = createInitialPrepareSession('2026-11-20');
  state = applyPrepareNavigation(state, { groupId: 'grp1' }, model, rowsByPage, '2026-11-20');
  state = {
    ...state,
    steps: [{ id: 's1', kind: 'exercise', exerciceId: 'ex1', durationMin: 15, note: '' }],
  };

  const next = applyPrepareNavigation(
    state,
    { groupId: 'grp1', addExerciseIds: ['ex2', 'ex1'] },
    model,
    rowsByPage,
    '2026-11-20'
  );
  assert.equal(next.groupeId, 'grp1');
  assert.equal(next.steps.length, 2);
  assert.equal(next.steps[0]?.exerciceId, 'ex1');
  assert.equal(next.steps[1]?.exerciceId, 'ex2');
});

test('addExerciseIds with a different explicit groupId switches group and prepares selected exercise', () => {
  const { model, rowsByPage } = buildTestModel();
  let state = createInitialPrepareSession('2026-11-20');
  state = applyPrepareNavigation(state, { groupId: 'grp1' }, model, rowsByPage, '2026-11-20');

  const next = applyPrepareNavigation(
    state,
    { groupId: 'grp2', addExerciseIds: ['ex2'] },
    model,
    rowsByPage,
    '2026-11-20'
  );
  assert.equal(next.groupeId, 'grp2');
  assert.deepEqual(next.presentIds, ['par2']);
  assert.equal(next.steps.length, 1);
  assert.equal(next.steps[0]?.exerciceId, 'ex2');
});

test('seanceId loads existing session and duplicateFromId clones without id', () => {
  const { model, rowsByPage } = buildTestModel();
  const base = createInitialPrepareSession('2026-11-20');

  const loaded = applyPrepareNavigation(base, { seanceId: 'sea1' }, model, rowsByPage, '2026-11-20');
  assert.equal(loaded.editingSeanceId, 'sea1');
  assert.equal(loaded.nom, 'Atelier 1');
  assert.equal(loaded.activeSubTab, 'deroule');

  const dup = applyPrepareNavigation(loaded, { duplicateFromId: 'sea1' }, model, rowsByPage, '2026-11-20');
  assert.equal(dup.editingSeanceId, null);
  assert.equal(dup.nom, '');
  assert.equal(dup.steps.length, 1);
  assert.equal(dup.steps[0]?.exerciceId, 'ex1');
});
