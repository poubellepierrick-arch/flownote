import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DatabaseRow, ImproPlanStep, WorkspacePage } from '../types/workspace';
import { IMPRO_COL_IDS, IMPRO_DB_IDS } from './improCsvLoader';
import {
  computeBidirectionalRowPatches,
  computeDeleteRowMirrorCleanup,
  computeGroupExerciseMatrix,
  computeImproEcosystem,
  computeImproStats,
  computePrepareSuggestions,
  getGroupMemberIds,
  getSessionTotalDuration,
  parseSessionPlan,
  serializeSessionPlan,
} from './improEngine';

function makeFixture(): { pages: WorkspacePage[]; rowsByPage: Record<string, DatabaseRow[]> } {
  const basePage = (id: string, title: string): WorkspacePage => ({
    id,
    workspaceId: 'local',
    ownerId: 'local',
    parentId: null,
    title,
    icon: '▤',
    type: 'database',
    isFavorite: false,
    isTrashed: false,
    order: 0,
    source: 'native',
    blocks: [],
    columns: [],
    activeView: 'table',
  });

  const pages: WorkspacePage[] = [
    basePage(IMPRO_DB_IDS.exercices, 'Exercices'),
    basePage(IMPRO_DB_IDS.seances, 'Séances'),
    basePage(IMPRO_DB_IDS.groupes, 'Groupes'),
    basePage(IMPRO_DB_IDS.participants, 'Participants'),
  ];

  const rowsByPage: Record<string, DatabaseRow[]> = {
    [IMPRO_DB_IDS.exercices]: [
      {
        id: 'ex_1',
        pageId: IMPRO_DB_IDS.exercices,
        workspaceId: 'local',
        ownerId: 'local',
        order: 0,
        cells: {
          [IMPRO_COL_IDS.exercices.nom]: 'Cercle de prénoms',
          [IMPRO_COL_IDS.exercices.etape]: ['Échauffement'],
          [IMPRO_COL_IDS.exercices.tags]: ['Énergie'],
          [IMPRO_COL_IDS.exercices.description]: 'Rapide',
          [IMPRO_COL_IDS.exercices.check1]: true,
          [IMPRO_COL_IDS.exercices.seances]: ['sea_1'],
        },
      },
      {
        id: 'ex_2',
        pageId: IMPRO_DB_IDS.exercices,
        workspaceId: 'local',
        ownerId: 'local',
        order: 1,
        cells: {
          [IMPRO_COL_IDS.exercices.nom]: 'Personnage animal',
          [IMPRO_COL_IDS.exercices.etape]: ['Corps'],
          [IMPRO_COL_IDS.exercices.tags]: [],
          [IMPRO_COL_IDS.exercices.description]: '',
          [IMPRO_COL_IDS.exercices.checkV]: true,
          [IMPRO_COL_IDS.exercices.seances]: [],
        },
      },
    ],
    [IMPRO_DB_IDS.groupes]: [
      {
        id: 'grp_1',
        pageId: IMPRO_DB_IDS.groupes,
        workspaceId: 'local',
        ownerId: 'local',
        order: 0,
        cells: {
          [IMPRO_COL_IDS.groupes.nom]: 'Troupe A',
          [IMPRO_COL_IDS.groupes.participants]: ['par_1', 'par_2'],
          [IMPRO_COL_IDS.groupes.seances]: ['sea_1'],
        },
      },
    ],
    [IMPRO_DB_IDS.participants]: [
      {
        id: 'par_1',
        pageId: IMPRO_DB_IDS.participants,
        workspaceId: 'local',
        ownerId: 'local',
        order: 0,
        cells: {
          [IMPRO_COL_IDS.participants.nom]: 'Alice',
          [IMPRO_COL_IDS.participants.groupe]: ['grp_1'],
          [IMPRO_COL_IDS.participants.seances]: ['sea_1'],
        },
      },
      {
        id: 'par_2',
        pageId: IMPRO_DB_IDS.participants,
        workspaceId: 'local',
        ownerId: 'local',
        order: 1,
        cells: {
          [IMPRO_COL_IDS.participants.nom]: 'Bob',
          [IMPRO_COL_IDS.participants.groupe]: ['grp_1'],
          [IMPRO_COL_IDS.participants.seances]: [],
        },
      },
    ],
    [IMPRO_DB_IDS.seances]: [
      {
        id: 'sea_1',
        pageId: IMPRO_DB_IDS.seances,
        workspaceId: 'local',
        ownerId: 'local',
        order: 0,
        cells: {
          [IMPRO_COL_IDS.seances.nom]: 'Séance Mardi',
          [IMPRO_COL_IDS.seances.date]: '2026-02-10',
          [IMPRO_COL_IDS.seances.statut]: 'Réalisée',
          [IMPRO_COL_IDS.seances.groupe]: ['grp_1'],
          [IMPRO_COL_IDS.seances.participants]: ['par_1'],
          [IMPRO_COL_IDS.seances.exercices]: ['ex_1'],
        },
      },
    ],
  };

  return { pages, rowsByPage };
}

describe('improEngine', () => {
  it('déduit groupes, participants, exercices faits et jamais faits depuis les séances', () => {
    const { pages, rowsByPage } = makeFixture();
    const model = computeImproEcosystem(pages, rowsByPage);

    const ex1 = model.exerciseById.get('ex_1')!;
    assert.deepEqual(ex1.groupNames, ['Troupe A']);
    assert.deepEqual(ex1.participantNames, ['Alice']);
    assert.equal(ex1.lastDate, '2026-02-10');
    assert.equal(ex1.usageCount, 1);

    const alice = model.participantById.get('par_1')!;
    assert.equal(alice.presenceCount, 1);
    assert.equal(alice.attendancePct, 100);
    assert.deepEqual(
      alice.doneExercises.map((e) => e.exerciceId),
      ['ex_1']
    );
    assert.deepEqual(
      alice.neverDoneExercises.map((e) => e.id),
      ['ex_2']
    );

    const bob = model.participantById.get('par_2')!;
    assert.equal(bob.presenceCount, 0);
    assert.equal(bob.attendancePct, 0);
    assert.equal(bob.doneExercises.length, 0);
    assert.equal(bob.neverDoneExercises.length, 2);
  });

  it('calcule les patchs bidirectionnels lors de la modification ou suppression d une séance', () => {
    const { rowsByPage } = makeFixture();
    const sea1 = rowsByPage[IMPRO_DB_IDS.seances][0];

    // Ajouter ex_2 et par_2 sur sea_1
    const nextCells = {
      ...sea1.cells,
      [IMPRO_COL_IDS.seances.exercices]: ['ex_1', 'ex_2'],
      [IMPRO_COL_IDS.seances.participants]: ['par_1', 'par_2'],
    };
    const patches = computeBidirectionalRowPatches(
      IMPRO_DB_IDS.seances,
      'sea_1',
      sea1.cells,
      nextCells,
      rowsByPage
    );

    const ex2Patch = patches.find((p) => p.pageId === IMPRO_DB_IDS.exercices && p.id === 'ex_2');
    const par2Patch = patches.find(
      (p) => p.pageId === IMPRO_DB_IDS.participants && p.id === 'par_2'
    );
    assert.deepEqual(ex2Patch?.cells[IMPRO_COL_IDS.exercices.seances], ['sea_1']);
    assert.deepEqual(par2Patch?.cells[IMPRO_COL_IDS.participants.seances], ['sea_1']);

    // Suppression de sea_1 : nettoie ex_1, grp_1 et par_1
    const cleanup = computeDeleteRowMirrorCleanup(
      IMPRO_DB_IDS.seances,
      'sea_1',
      sea1.cells,
      rowsByPage
    );
    const ex1Clean = cleanup.find((p) => p.pageId === IMPRO_DB_IDS.exercices && p.id === 'ex_1');
    const grp1Clean = cleanup.find((p) => p.pageId === IMPRO_DB_IDS.groupes && p.id === 'grp_1');
    const par1Clean = cleanup.find(
      (p) => p.pageId === IMPRO_DB_IDS.participants && p.id === 'par_1'
    );
    assert.deepEqual(ex1Clean?.cells[IMPRO_COL_IDS.exercices.seances], []);
    assert.deepEqual(grp1Clean?.cells[IMPRO_COL_IDS.groupes.seances], []);
    assert.deepEqual(par1Clean?.cells[IMPRO_COL_IDS.participants.seances], []);
  });

  it('pré-remplit les membres d un groupe pour une séance', () => {
    const { rowsByPage } = makeFixture();
    const members = getGroupMemberIds(['grp_1'], rowsByPage);
    assert.deepEqual(members.sort(), ['par_1', 'par_2']);
  });

  it('isole les séances Préparées des statistiques et compteurs Réalisés', () => {
    const { pages, rowsByPage } = makeFixture();
    rowsByPage[IMPRO_DB_IDS.seances].push({
      id: 'sea_plan',
      pageId: IMPRO_DB_IDS.seances,
      workspaceId: 'local',
      ownerId: 'local',
      order: 1,
      cells: {
        [IMPRO_COL_IDS.seances.nom]: 'Atelier futur',
        [IMPRO_COL_IDS.seances.date]: '2026-03-01',
        [IMPRO_COL_IDS.seances.statut]: 'Préparée',
        [IMPRO_COL_IDS.seances.groupe]: ['grp_1'],
        [IMPRO_COL_IDS.seances.participants]: ['par_1', 'par_2'],
        [IMPRO_COL_IDS.seances.exercices]: ['ex_2'],
      },
    });

    const model = computeImproEcosystem(pages, rowsByPage);
    assert.equal(model.realizedSeances.length, 1);
    assert.equal(model.plannedSeances.length, 1);

    const ex2 = model.exerciseById.get('ex_2')!;
    assert.equal(ex2.usageCount, 0);
    assert.equal(ex2.plannedCount, 1);

    const bob = model.participantById.get('par_2')!;
    assert.equal(bob.presenceCount, 0);
    assert.equal(bob.plannedSessions.length, 1);
  });

  it('sérialise, restaure et calcule la durée du déroulé ordonné', () => {
    const steps: ImproPlanStep[] = [
      { id: 's1', kind: 'custom', label: 'Accueil', durationMin: 10, note: 'Météo du groupe' },
      { id: 's2', kind: 'exercise', exerciceId: 'ex_1', durationMin: 20, note: 'Sans parler' },
    ];
    const json = serializeSessionPlan(steps);
    const parsed = parseSessionPlan(json, ['ex_1', 'ex_2']);
    assert.equal(parsed.length, 3);
    assert.equal(parsed[0].kind, 'custom');
    assert.equal(parsed[0].label, 'Accueil');
    assert.equal(parsed[1].exerciceId, 'ex_1');
    assert.equal(parsed[1].note, 'Sans parler');
    assert.equal(parsed[2].exerciceId, 'ex_2');
    assert.equal(getSessionTotalDuration(parsed), 45);
  });

  it('recalcule en direct les suggestions selon les participants présents', () => {
    const { pages, rowsByPage } = makeFixture();
    const model = computeImproEcosystem(pages, rowsByPage);

    // Avec Alice + Bob présents : ex_1 fait par Alice (1/2 -> mixed), ex_2 jamais fait (2/2 -> all_new)
    const withBoth = computePrepareSuggestions(model, ['par_1', 'par_2'], 'grp_1');
    assert.equal(withBoth[0].exercise.id, 'ex_2');
    assert.equal(withBoth[0].noveltyBucket, 'all_new');
    assert.equal(withBoth[1].exercise.id, 'ex_1');
    assert.equal(withBoth[1].noveltyBucket, 'mixed');
    assert.equal(withBoth[1].seenCount, 1);

    // Avec Bob seul présent : ex_1 et ex_2 sont tous deux inédits pour lui !
    const withBobOnly = computePrepareSuggestions(model, ['par_2'], 'grp_1');
    assert.equal(withBobOnly.find((s) => s.exercise.id === 'ex_1')?.noveltyBucket, 'all_new');
    assert.equal(withBobOnly.find((s) => s.exercise.id === 'ex_2')?.noveltyBucket, 'all_new');
  });

  it('construit la matrice groupe et le rapport statistique', () => {
    const { pages, rowsByPage } = makeFixture();
    const model = computeImproEcosystem(pages, rowsByPage);

    const matrixAll = computeGroupExerciseMatrix(model, { groupId: 'grp_1' });
    assert.equal(matrixAll.participants.length, 2);
    assert.equal(matrixAll.exercises.length, 2);
    assert.equal(matrixAll.cellByKey.get('ex_1::par_1')?.count, 1);
    assert.equal(matrixAll.cellByKey.get('ex_1::par_2'), undefined);

    const matrixNever = computeGroupExerciseMatrix(model, {
      groupId: 'grp_1',
      onlyNeverDoneByGroup: true,
    });
    assert.deepEqual(
      matrixNever.exercises.map((e) => e.id),
      ['ex_2']
    );

    const stats = computeImproStats(model);
    assert.equal(stats.summary.sessionCount, 1);
    assert.equal(stats.summary.activeExercisesCount, 1);
    assert.equal(stats.summary.coveragePct, 50);
    assert.equal(stats.markerStats.neverV, 1);
    assert.equal(stats.markerStats.unplayedMarkedV[0].id, 'ex_2');
    assert.equal(stats.groupComparison[0].attendancePct, 50);
  });
});

