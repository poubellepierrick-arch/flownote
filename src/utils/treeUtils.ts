import type { DatabaseRow, WorkspacePage } from '../types/workspace';

export interface PageTreeNode {
  page: WorkspacePage;
  children: PageTreeNode[];
  depth: number;
}

export function buildPageTree(pages: WorkspacePage[]): PageTreeNode[] {
  const activePages = pages
    .filter((p) => !p.isTrashed)
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'fr'));

  const pageMap = new Map<string, WorkspacePage>();
  for (const p of activePages) {
    pageMap.set(p.id, p);
  }

  const childrenByParent = new Map<string | null, WorkspacePage[]>();
  for (const p of activePages) {
    const parentKey = p.parentId && pageMap.has(p.parentId) && p.parentId !== p.id ? p.parentId : null;
    const list = childrenByParent.get(parentKey) ?? [];
    list.push(p);
    childrenByParent.set(parentKey, list);
  }

  const visited = new Set<string>();

  function buildNodes(parentId: string | null, depth: number): PageTreeNode[] {
    const list = childrenByParent.get(parentId) ?? [];
    const nodes: PageTreeNode[] = [];
    for (const page of list) {
      if (visited.has(page.id)) continue;
      visited.add(page.id);
      nodes.push({
        page,
        depth,
        children: buildNodes(page.id, depth + 1),
      });
    }
    return nodes;
  }

  return buildNodes(null, 0);
}

export function getPageBreadcrumbs(pages: WorkspacePage[], pageId: string | null): WorkspacePage[] {
  if (!pageId) return [];
  const pageMap = new Map<string, WorkspacePage>();
  for (const p of pages) {
    pageMap.set(p.id, p);
  }

  const trail: WorkspacePage[] = [];
  const seen = new Set<string>();
  let currentId: string | null = pageId;

  while (currentId && !seen.has(currentId)) {
    const page: WorkspacePage | undefined = pageMap.get(currentId);
    if (!page) break;
    seen.add(currentId);
    trail.unshift(page);
    currentId = page.parentId;
  }

  return trail;
}

export function getDescendantIds(pages: WorkspacePage[], rootId: string): string[] {
  const ids: string[] = [];
  const queue = [rootId];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    ids.push(current);
    for (const p of pages) {
      if (p.parentId === current && !seen.has(p.id)) {
        queue.push(p.id);
      }
    }
  }

  return ids;
}

export interface SearchMatch {
  page: WorkspacePage;
  snippet: string;
}

export function searchWorkspace(
  pages: WorkspacePage[],
  rowsByPage: Record<string, DatabaseRow[]>,
  query: string
): SearchMatch[] {
  const q = query.trim().toLowerCase();
  const active = pages.filter((p) => !p.isTrashed);

  if (!q) {
    return active.map((page) => ({
      page,
      snippet:
        page.type === 'database'
          ? `${(rowsByPage[page.id] ?? []).length} lignes`
          : `${page.blocks.length} blocs`,
    }));
  }

  const results: SearchMatch[] = [];

  for (const page of active) {
    if (page.title.toLowerCase().includes(q)) {
      results.push({
        page,
        snippet: page.type === 'database' ? 'Base de données' : 'Titre de page',
      });
      continue;
    }

    const blockMatch = page.blocks.find(
      (b) =>
        b.content.toLowerCase().includes(q) ||
        (b.details && b.details.toLowerCase().includes(q))
    );
    if (blockMatch) {
      results.push({
        page,
        snippet: blockMatch.content.slice(0, 90),
      });
      continue;
    }

    if (page.type === 'database') {
      const rows = rowsByPage[page.id] ?? [];
      const rowMatch = rows.find((r) =>
        Object.values(r.cells).some((v) => String(v).toLowerCase().includes(q))
      );
      if (rowMatch) {
        const firstText = Object.values(rowMatch.cells)
          .filter((v) => typeof v === 'string' && v.trim() !== '')
          .slice(0, 2)
          .join(' · ');
        results.push({
          page,
          snippet: firstText || 'Ligne correspondante',
        });
      }
    }
  }

  return results;
}
