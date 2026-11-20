import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import {
  buildImproEcosystemFromCsvTexts,
  IMPRO_COL_IDS,
  IMPRO_CSV_PATHS,
  IMPRO_DB_IDS,
  parseFrenchDateToIso,
  parseNotionRelationRefs,
} from './improCsvLoader';
import { computeImproEcosystem } from './improEngine';

function readAsset(publicPath: string): string {
  const rel = publicPath.replace(/^\//, '');
  return readFileSync(resolve(process.cwd(), 'public', rel), 'utf8');
}

describe('improCsvLoader', () => {
  it('convertit les dates françaises et slash en ISO YYYY-MM-DD', () => {
    assert.equal(parseFrenchDateToIso('5 janvier 2026'), '2026-01-05');
    assert.equal(parseFrenchDateToIso('19 février 2025'), '2025-02-19');
    assert.equal(parseFrenchDateToIso('14 juillet 2024'), '2024-07-14');
    assert.equal(parseFrenchDateToIso('02/02/2026'), '2026-02-02');
    assert.equal(parseFrenchDateToIso('2026-03-10'), '2026-03-10');
  });

  it('parse des relations Notion contenant des virgules et parenthèses', () => {
    const raw =
      'Assis, debout, couché (Biblimpro/Assis,%20debout,%20couch%C3%A9%202e2ddc608f998126b5c4e6eb66b46d23.csv), 02/02/2026 APOEC (transitions, oser y aller) (S%C3%A9ances/02%2002%202026%20APOEC%20(transitions,%20oser%20y%20aller)%202fbddc608f99807d853dc882a6f9ee75.csv)';
    const refs = parseNotionRelationRefs(raw);
    assert.equal(refs.length, 2);
    assert.equal(refs[0].name, 'Assis, debout, couché');
    assert.equal(refs[0].uuid, '2e2ddc608f998126b5c4e6eb66b46d23');
    assert.equal(refs[1].name, '02/02/2026 APOEC (transitions, oser y aller)');
    assert.equal(refs[1].uuid, '2fbddc608f99807d853dc882a6f9ee75');
  });

  it('importe et réconcilie les 4 CSV réels sans perte ni bruit', () => {
    const dataset = buildImproEcosystemFromCsvTexts(
      {
        biblimproCsv: readAsset(IMPRO_CSV_PATHS.biblimpro),
        groupesCsv: readAsset(IMPRO_CSV_PATHS.groupes),
        participantsCsv: readAsset(IMPRO_CSV_PATHS.participants),
        seancesCsv: readAsset(IMPRO_CSV_PATHS.seances),
      },
      'ws_test',
      'user_test'
    );

    assert.equal(dataset.pages.length, 4);
    const exRows = dataset.rowsByPage[IMPRO_DB_IDS.exercices];
    const seaRows = dataset.rowsByPage[IMPRO_DB_IDS.seances];
    const grpRows = dataset.rowsByPage[IMPRO_DB_IDS.groupes];
    const parRows = dataset.rowsByPage[IMPRO_DB_IDS.participants];

    assert.ok(exRows.length >= 550 && exRows.length <= 556);
    assert.equal(seaRows.length, 62);
    assert.equal(grpRows.length, 3);
    assert.equal(parRows.length, 53);

    // Vérifier les 3 colonnes à cocher 1, 2 et V
    const exPage = dataset.pages.find((p) => p.id === IMPRO_DB_IDS.exercices)!;
    const checkCols = (exPage.columns ?? []).filter((c) => c.type === 'checkbox');
    assert.deepEqual(
      checkCols.map((c) => c.name),
      ['1', '2', 'V']
    );
    const checked1Count = exRows.filter((r) => r.cells[IMPRO_COL_IDS.exercices.check1] === true).length;
    const checked2Count = exRows.filter((r) => r.cells[IMPRO_COL_IDS.exercices.check2] === true).length;
    const checkedVCount = exRows.filter((r) => r.cells[IMPRO_COL_IDS.exercices.checkV] === true).length;
    assert.equal(checked1Count, 31);
    assert.equal(checked2Count, 19);
    assert.equal(checkedVCount, 12);

    // Vérifier l'absence de lignes bruit PAUSE
    assert.equal(
      exRows.some((r) => String(r.cells[IMPRO_COL_IDS.exercices.nom]).includes('PAUSE')),
      false
    );

    // Vérifier que les homonymes (Julie, Thibaud) restent distincts
    const julies = parRows.filter((r) => r.cells[IMPRO_COL_IDS.participants.nom] === 'Julie');
    const thibauds = parRows.filter((r) => r.cells[IMPRO_COL_IDS.participants.nom] === 'Thibaud');
    assert.equal(julies.length, 2);
    assert.equal(thibauds.length, 2);
    assert.notEqual(julies[0].id, julies[1].id);
    assert.notEqual(thibauds[0].id, thibauds[1].id);

    // Vérifier la parité bidirectionnelle complète après chargement
    const model = computeImproEcosystem(dataset.pages, dataset.rowsByPage);
    assert.equal(model.ready, true);
    assert.ok(model.allEtapes.length >= 3);
    assert.ok(model.exercises.some((e) => e.groupIds.length > 0 && e.participantIds.length > 0));
    assert.ok(model.exercises.some((e) => e.check1 && e.check2 && e.checkV));
  });
});
