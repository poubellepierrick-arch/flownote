import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {
  stripNotionId,
  extractNotionHexId,
  parseNotionMarkdown,
  parseNotionHtml,
  parseNotionCsv,
  parseNotionZip,
  parseNotionEntries,
  normalizeNotionDate,
  exportPageToMarkdown,
} from './notionImporter';
import { materializeImportedDrafts } from './notionImportMaterializer';

test('stripNotionId supprime les identifiants hexadécimaux Notion, _all et les extensions', () => {
  assert.equal(stripNotionId('Feuille de route 3a8f2c1b4d5e6f7a8b9c0d1e2f3a4b5c.md'), 'Feuille de route');
  assert.equal(stripNotionId('Base%20Projets%200123456789abcdef0123456789abcdef_all.csv'), 'Base Projets');
  assert.equal(stripNotionId('Export 1234567890abcdef1234567890abcdef.html'), 'Export');
});

test('parseNotionMarkdown extrait <aside>, <details>, tableaux, signets et frontmatter YAML', () => {
  const md = [
    '---',
    'title: Document Notion Complet',
    'tags: Produit, Sync',
    '---',
    '',
    '<aside>',
    '💡 Note importante Notion',
    '</aside>',
    '',
    '<details><summary>Section pliée</summary>Contenu interne</details>',
    '',
    '| Nom | Rôle |',
    '| --- | --- |',
    '| Alice | Design |',
    '| Bob | Code |',
    '',
    '[Documentation](https://example.com/docs)',
  ].join('\n');

  const parsed = parseNotionMarkdown(md, 'Fallback');
  assert.equal(parsed.title, 'Document Notion Complet');
  assert.equal(parsed.blocks[0].type, 'paragraph');
  assert.match(parsed.blocks[0].content, /tags: Produit, Sync/);
  assert.equal(parsed.blocks[1].type, 'callout');
  assert.equal(parsed.blocks[1].icon, '💡');
  assert.equal(parsed.blocks[1].content, 'Note importante Notion');
  assert.equal(parsed.blocks[2].type, 'toggle');
  assert.equal(parsed.blocks[2].content, 'Section pliée');
  assert.equal(parsed.blocks[2].details, 'Contenu interne');
  assert.equal(parsed.blocks[3].type, 'table');
  assert.equal(parsed.blocks[3].tableRows?.length, 3);
  assert.deepEqual(parsed.blocks[3].tableRows?.[1].cells, ['Alice', 'Design']);
  assert.equal(parsed.blocks[4].type, 'bookmark');
  assert.equal(parsed.blocks[4].url, 'https://example.com/docs');
});

test('parseNotionHtml convertit un export HTML Notion en blocs structurés', () => {
  const html = `
    <html>
      <head><title>Page HTML</title></head>
      <body>
        <article class="page">
          <header><h1 class="page-title">Cahier des charges</h1></header>
          <div class="page-body">
            <h2>Objectifs</h2>
            <ul class="to-do-list">
              <li><div class="checkbox checkbox-on"></div><span>Valider schéma</span></li>
              <li><div class="checkbox checkbox-off"></div><span>Tester import</span></li>
            </ul>
            <figure class="callout">⚡ Point clé</figure>
            <table>
              <tr><th>Module</th><th>État</th></tr>
              <tr><td>Auth</td><td>Prêt</td></tr>
            </table>
          </div>
        </article>
      </body>
    </html>
  `;

  const parsed = parseNotionHtml(html, 'Fallback');
  assert.equal(parsed.title, 'Cahier des charges');
  assert.equal(parsed.blocks[0].type, 'heading2');
  assert.equal(parsed.blocks[1].type, 'todo');
  assert.equal(parsed.blocks[1].checked, true);
  assert.equal(parsed.blocks[2].type, 'todo');
  assert.equal(parsed.blocks[2].checked, false);
  assert.equal(parsed.blocks[3].type, 'callout');
  assert.equal(parsed.blocks[3].icon, '⚡');
  assert.equal(parsed.blocks[4].type, 'table');
  assert.equal(parsed.blocks[4].tableRows?.length, 2);
});

test('normalizeNotionDate et parseNotionCsv normalisent dates, devises et relations Notion', () => {
  assert.equal(normalizeNotionDate('November 18, 2026'), '2026-11-18');
  assert.equal(normalizeNotionDate('18 novembre 2026'), '2026-11-18');
  assert.equal(normalizeNotionDate('25/12/2026'), '2026-12-25');

  const csv = [
    'Tâche,Statut,Budget,Échéance,Fait',
    '"Refonte (https://www.notion.so/abc123)",En cours,"1 500 €","November 18, 2026",No',
    '"Audit sécurité",Terminé,"800 €","18 novembre 2026",Yes',
  ].join('\n');

  const parsed = parseNotionCsv(csv, 'Budget');
  assert.equal(parsed.columns[1].type, 'select');
  assert.equal(parsed.columns[2].type, 'number');
  assert.equal(parsed.columns[3].type, 'date');
  assert.equal(parsed.columns[4].type, 'checkbox');
  assert.equal(parsed.rows[0].col_1, 'Refonte');
  assert.equal(parsed.rows[0].col_3, 1500);
  assert.equal(parsed.rows[0].col_4, '2026-11-18');
  assert.equal(parsed.rows[0].col_5, false);
  assert.equal(parsed.rows[1].col_5, true);
});

test('parseNotionZip décompresse les .zip imbriqués et déduplique les paires _all.csv', async () => {
  const innerZip = new JSZip();
  innerZip.file('Projets aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.md', '# Projets\nVue globale.');
  innerZip.file('Projets/Tâches bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.csv', 'Nom,Fait\nVue partielle,Non');
  innerZip.file('Projets/Tâches bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb_all.csv', 'Nom,Fait,Note\nComplet,Oui,OK');
  const innerBuf = await innerZip.generateAsync({ type: 'uint8array' });

  const outerZip = new JSZip();
  outerZip.file('Export-1234.zip', innerBuf);
  const outerBuf = await outerZip.generateAsync({ type: 'uint8array' });

  const result = await parseNotionZip(outerBuf);
  assert.equal(result.stats.documents, 1);
  assert.equal(result.stats.databases, 1);
  const db = result.pages.find((p) => p.type === 'database');
  assert.ok(db);
  assert.equal(db.columns?.length, 3);
  assert.equal(db.rows?.[0].col_1, 'Complet');
});

test('parseNotionEntries reconstruit pages/sous-pages multi-niveaux et place les sous-dossiers sans page à la racine', () => {
  // Simuler un dossier macOS avec accents NFD et sous-dossier sans fichier page associé
  const nfdParent = 'Ide\u0301es'.normalize('NFD');
  const nfcParent = 'Idées'.normalize('NFC');

  const res = parseNotionEntries(
    [
      {
        path: `MonDossierNotion/${nfdParent} aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Sous-note bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.md`,
        content: '# Sous-note\nContenu enfant',
      },
      {
        path: `MonDossierNotion/${nfcParent} aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.md`,
        content: '# Idées\nPage parente',
      },
      {
        path: 'MonDossierNotion/DossierSansPage/NoteDirecte.md',
        content: '# Note directe\nRattachée à la racine',
      },
      {
        path: `MonDossierNotion/${nfcParent}/Sous-note/Details.md`,
        content: '# Détails\nNiveau 3',
      },
    ],
    { ignoredAssetsCount: 2 }
  );

  assert.equal(res.pages.length, 4);
  assert.equal(res.warnings[0], '2 fichiers média ignorés.');

  const parentPage = res.pages.find((p) => p.title === 'Idées');
  const subPage = res.pages.find((p) => p.title === 'Sous-note');
  const level3 = res.pages.find((p) => p.title === 'Détails');
  const directRoot = res.pages.find((p) => p.title === 'Note directe');

  assert.ok(parentPage && subPage && level3 && directRoot);
  assert.equal(parentPage.parentTempId, null);
  assert.equal(parentPage.depth, 0);
  assert.equal(subPage.parentTempId, parentPage.tempId);
  assert.equal(subPage.depth, 1);
  assert.equal(level3.parentTempId, subPage.tempId);
  assert.equal(level3.depth, 2);
  // Le sous-dossier sans page associée place la page à la racine
  assert.equal(directRoot.parentTempId, null);
  assert.equal(directRoot.depth, 0);
  // Tri topologique : parent avant enfant
  assert.ok(res.pages.indexOf(parentPage) < res.pages.indexOf(subPage));
  assert.ok(res.pages.indexOf(subPage) < res.pages.indexOf(level3));
});

test('exportPageToMarkdown restitue tableaux, signets et encadrés <aside>', () => {
  const md = exportPageToMarkdown({
    id: 'p1',
    workspaceId: 'w1',
    ownerId: 'u1',
    parentId: null,
    title: 'Note',
    icon: '📄',
    type: 'document',
    isFavorite: false,
    isTrashed: false,
    order: 0,
    source: 'native',
    blocks: [
      { id: 'b1', type: 'callout', icon: '💡', content: 'Astuce' },
      { id: 'b2', type: 'bookmark', content: 'Site', url: 'https://example.com' },
      {
        id: 'b3',
        type: 'table',
        content: 'Tableau',
        tableRows: [{ cells: ['A', 'B'] }, { cells: ['1', '2'] }],
      },
    ],
  });
  assert.match(md, /<aside>\n💡 Astuce\n<\/aside>/);
  assert.match(md, /\[Site\]\(https:\/\/example\.com\)/);
  assert.match(md, /\| A \| B \|/);
});

test('parseNotionCsv importe plus de 300 lignes, plus de 30 colonnes et infère multi_select', () => {
  const colNames = ['Nom', 'Tags', ...Array.from({ length: 33 }, (_, i) => `Champ${i + 1}`)];
  const header = colNames.join(',');
  const rowLines = Array.from({ length: 350 }, (_, r) => {
    const tags = r % 2 === 0 ? '"Urgent, Backend"' : '"Frontend, Backend"';
    const extras = Array.from({ length: 33 }, (__, c) => `V${r}_${c}`).join(',');
    return `Tâche ${r + 1},${tags},${extras}`;
  });
  const parsed = parseNotionCsv([header, ...rowLines].join('\n'), 'Volumineuse');
  assert.equal(parsed.columns.length, 35);
  assert.equal(parsed.rows.length, 350);
  assert.equal(parsed.columns[1].type, 'multi_select');
  assert.deepEqual(parsed.rows[0].col_2, ['Urgent', 'Backend']);
  assert.equal(parsed.rows[349].col_1, 'Tâche 350');
});

test('parseNotionEntries + materializeImportedDrafts reconstruisent relations, fiches de lignes et liens internes', () => {
  const projDbId = '11111111111111111111111111111111';
  const taskDbId = '22222222222222222222222222222222';
  const rowProj1Id = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const rowProj2Id = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const noteId = 'cccccccccccccccccccccccccccccccc';

  assert.equal(
    extractNotionHexId(`https://www.notion.so/Refonte-${rowProj1Id}?pvs=4`),
    rowProj1Id
  );

  const res = parseNotionEntries([
    {
      path: `Projets ${projDbId}_all.csv`,
      content: 'Nom,Budget\nRefonte,2000\nMobile,3500',
    },
    {
      path: `Projets ${projDbId}/Refonte ${rowProj1Id}.md`,
      content: `# Refonte\nVoir aussi [Note architecture](Notes/Note%20architecture%20${noteId}.md).`,
    },
    {
      path: `Projets ${projDbId}/Mobile ${rowProj2Id}.md`,
      content: '# Mobile\nApplication iOS et Android.',
    },
    {
      path: `Tâches ${taskDbId}_all.csv`,
      content: [
        'Tâche,Projet,Durée',
        `"Maquette Figma","Refonte (https://www.notion.so/Refonte-${rowProj1Id})",12`,
        `"API Sync","Refonte (https://www.notion.so/Refonte-${rowProj1Id}), Mobile (https://www.notion.so/Mobile-${rowProj2Id})",8`,
      ].join('\n'),
    },
    {
      path: `Notes/Note architecture ${noteId}.html`,
      content: `<article class="page"><h1 class="page-title">Note architecture</h1><div class="page-body"><p>Liée au projet <a href="../Projets%20${projDbId}/Refonte%20${rowProj1Id}.md">Refonte</a>.</p></div></article>`,
    },
  ]);

  assert.equal(res.stats.databases, 2);
  assert.equal(res.stats.documents, 3);
  assert.equal(res.stats.relations, 1);
  assert.equal(res.stats.linkedRowPages, 2);
  assert.ok(res.stats.pageLinks >= 2);

  const projDb = res.pages.find((p) => p.title === 'Projets');
  const taskDb = res.pages.find((p) => p.title === 'Tâches');
  const refontePage = res.pages.find((p) => p.title === 'Refonte');
  const notePage = res.pages.find((p) => p.title === 'Note architecture');
  assert.ok(projDb && taskDb && refontePage && notePage);

  // Vérifier la liaison ligne -> fiche sous-page
  assert.equal(projDb.rowMeta?.[0].linkedPageTempId, refontePage.tempId);

  // Vérifier la colonne relation
  const relCol = taskDb.columns?.[1];
  assert.equal(relCol?.type, 'relation');
  assert.equal(relCol?.relationTargetPageId, projDb.tempId);
  assert.deepEqual(taskDb.rows?.[1][relCol!.id], [
    projDb.rowMeta![0].tempId,
    projDb.rowMeta![1].tempId,
  ]);

  // Vérifier les liens internes entre documents
  assert.match(refontePage.blocks[0].content, new RegExp(`flownote://page/${notePage.tempId}`));
  assert.match(notePage.blocks[0].content, new RegExp(`flownote://page/${refontePage.tempId}`));

  // Matérialiser vers des IDs réels et vérifier le remappage complet
  const materialized = materializeImportedDrafts(res.pages, 'ws_1', 'u_1', 0, null);
  const realProjDb = materialized.pages.find((p) => p.title === 'Projets')!;
  const realTaskDb = materialized.pages.find((p) => p.title === 'Tâches')!;
  const realRefontePage = materialized.pages.find((p) => p.title === 'Refonte')!;
  const realNotePage = materialized.pages.find((p) => p.title === 'Note architecture')!;

  const realProjRows = materialized.rowsByPage[realProjDb.id];
  const realTaskRows = materialized.rowsByPage[realTaskDb.id];

  assert.equal(realProjRows[0].linkedPageId, realRefontePage.id);
  assert.equal(realTaskDb.columns?.[1].relationTargetPageId, realProjDb.id);
  assert.deepEqual(realTaskRows[1].cells[realTaskDb.columns![1].id], [
    realProjRows[0].id,
    realProjRows[1].id,
  ]);
  assert.match(
    realRefontePage.blocks[0].content,
    new RegExp(`flownote://page/${realNotePage.id}`)
  );
  assert.match(
    realNotePage.blocks[0].content,
    new RegExp(`flownote://page/${realRefontePage.id}`)
  );
});

