import test from 'node:test';
import assert from 'node:assert/strict';
import type { WorkspacePage } from '../types/workspace';
import { buildPageTree, getPageBreadcrumbs, getDescendantIds, searchWorkspace } from './treeUtils';

const samplePages: WorkspacePage[] = [
  {
    id: 'p1',
    workspaceId: 'w1',
    ownerId: 'u1',
    parentId: null,
    title: 'Racine',
    icon: '📄',
    type: 'document',
    isFavorite: false,
    isTrashed: false,
    order: 0,
    source: 'native',
    blocks: [{ id: 'b1', type: 'paragraph', content: 'Texte alpha' }],
  },
  {
    id: 'p2',
    workspaceId: 'w1',
    ownerId: 'u1',
    parentId: 'p1',
    title: 'Enfant',
    icon: '📄',
    type: 'document',
    isFavorite: false,
    isTrashed: false,
    order: 1,
    source: 'native',
    blocks: [{ id: 'b2', type: 'paragraph', content: 'Contenu beta' }],
  },
  {
    id: 'p3',
    workspaceId: 'w1',
    ownerId: 'u1',
    parentId: null,
    title: 'Supprimée',
    icon: '📄',
    type: 'document',
    isFavorite: false,
    isTrashed: true,
    order: 2,
    source: 'native',
    blocks: [],
  },
];

test('buildPageTree construit la hiérarchie et exclut la corbeille', () => {
  const tree = buildPageTree(samplePages);
  assert.equal(tree.length, 1);
  assert.equal(tree[0].page.id, 'p1');
  assert.equal(tree[0].children.length, 1);
  assert.equal(tree[0].children[0].page.id, 'p2');
});

test('getPageBreadcrumbs retourne le chemin ordonné jusqu’à la page', () => {
  const crumbs = getPageBreadcrumbs(samplePages, 'p2');
  assert.deepEqual(crumbs.map((c) => c.id), ['p1', 'p2']);
});

test('getDescendantIds collecte la page et ses enfants', () => {
  assert.deepEqual(getDescendantIds(samplePages, 'p1'), ['p1', 'p2']);
});

test('searchWorkspace trouve par titre et contenu de bloc', () => {
  const res = searchWorkspace(samplePages, {}, 'beta');
  assert.equal(res.length, 1);
  assert.equal(res[0].page.id, 'p2');
});
