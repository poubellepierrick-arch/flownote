import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rulesContent = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
const blueprint = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'firebase-blueprint.json'), 'utf8'));

test('firestore.rules contient le filet de sécurité global par défaut', () => {
  assert.match(rulesContent, /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;\s*\}/);
});

test('firestore.rules couvre toutes les collections déclarées dans firebase-blueprint.json', () => {
  const paths = Object.keys(blueprint.firestore);
  assert.ok(paths.includes('/users/{userId}'));
  assert.ok(paths.includes('/workspaces/{workspaceId}'));
  assert.ok(paths.includes('/workspaces/{workspaceId}/pages/{pageId}'));
  assert.ok(paths.includes('/workspaces/{workspaceId}/pages/{pageId}/rows/{rowId}'));

  assert.match(rulesContent, /match \/users\/\{userId\}/);
  assert.match(rulesContent, /match \/workspaces\/\{workspaceId\}/);
  assert.match(rulesContent, /match \/pages\/\{pageId\}/);
  assert.match(rulesContent, /match \/rows\/\{rowId\}/);
});

test('firestore.rules vérifie email_verified, hasOnly, affectedKeys et request.time', () => {
  assert.match(rulesContent, /request\.auth\.token\.email_verified == true/);
  assert.match(rulesContent, /data\.keys\(\)\.hasOnly\(/);
  assert.match(rulesContent, /affectedKeys\(\)\.hasOnly\(/);
  assert.match(rulesContent, /request\.time/);
  assert.match(rulesContent, /allow list: if false;/);
});

test('firestore.rules et firebase-blueprint.json valident sortRules et columnWidths', () => {
  assert.match(rulesContent, /function isValidSortRule\(rule\)/);
  assert.match(rulesContent, /'sortRules'/);
  assert.match(rulesContent, /'columnWidths'/);
  const pageProps = blueprint.entities.WorkspacePage.properties;
  assert.ok('sortRules' in pageProps);
  assert.ok('columnWidths' in pageProps);
});
