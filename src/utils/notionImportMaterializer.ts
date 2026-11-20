import type {
  BlockItem,
  CellValue,
  DatabaseColumn,
  DatabaseRow,
  WorkspacePage,
} from '../types/workspace';
import { generateId } from './id';
import type { ImportedPageDraft } from './notionImporter';

function remapFlownoteLinks(text: string, pageMap: Map<string, string>): string {
  return text.replace(/flownote:\/\/page\/([a-zA-Z0-9_-]+)/g, (_, tempId: string) => {
    const realId = pageMap.get(tempId) ?? tempId;
    return `flownote://page/${realId}`;
  });
}

function remapBlocksLinks(blocks: BlockItem[], pageMap: Map<string, string>): BlockItem[] {
  return blocks.map((b) => {
    const next: BlockItem = {
      ...b,
      content: remapFlownoteLinks(b.content ?? '', pageMap),
    };
    if (b.details !== undefined) {
      next.details = remapFlownoteLinks(b.details, pageMap);
    }
    if (b.url !== undefined) {
      next.url = remapFlownoteLinks(b.url, pageMap);
    }
    if (b.tableRows) {
      next.tableRows = b.tableRows.map((tr) => ({
        cells: tr.cells.map((c) => remapFlownoteLinks(c, pageMap)),
      }));
    }
    return next;
  });
}

export function materializeImportedDrafts(
  drafts: ImportedPageDraft[],
  workspaceId: string,
  ownerId: string,
  startOrder: number,
  targetParentId: string | null = null
): {
  pages: WorkspacePage[];
  rowsByPage: Record<string, DatabaseRow[]>;
} {
  const pageMap = new Map<string, string>();
  const rowMap = new Map<string, string>();

  for (const draft of drafts) {
    pageMap.set(draft.tempId, generateId('page'));
    if (draft.rows && draft.rows.length > 0) {
      draft.rows.forEach((_, rIdx) => {
        const tempRowId = draft.rowMeta?.[rIdx]?.tempId;
        if (tempRowId) {
          rowMap.set(tempRowId, generateId('row'));
        }
      });
    }
  }

  const pages: WorkspacePage[] = [];
  const rowsByPage: Record<string, DatabaseRow[]> = {};

  drafts.forEach((draft, idx) => {
    const realPageId = pageMap.get(draft.tempId)!;
    const parentId = draft.parentTempId
      ? pageMap.get(draft.parentTempId) ?? draft.parentTempId
      : targetParentId;

    const remappedColumns: DatabaseColumn[] | undefined = draft.columns
      ? draft.columns.map((col) => {
          const nextCol: DatabaseColumn = { ...col };
          if (nextCol.relationTargetPageId) {
            nextCol.relationTargetPageId =
              pageMap.get(nextCol.relationTargetPageId) ?? nextCol.relationTargetPageId;
          }
          return nextCol;
        })
      : undefined;

    const page: WorkspacePage = {
      id: realPageId,
      workspaceId,
      ownerId,
      parentId,
      title: draft.title.slice(0, 200),
      icon: draft.icon.slice(0, 32),
      type: draft.type,
      isFavorite: false,
      isTrashed: false,
      order: startOrder + idx,
      source: 'notion_import',
      blocks: remapBlocksLinks(draft.blocks, pageMap),
      ...(remappedColumns ? { columns: remappedColumns, activeView: 'table' as const } : {}),
    };
    pages.push(page);

    if (draft.rows && draft.rows.length > 0) {
      const relationColIds = new Set(
        (remappedColumns ?? []).filter((c) => c.type === 'relation').map((c) => c.id)
      );

      rowsByPage[realPageId] = draft.rows.map((rawCells, rIdx) => {
        const meta = draft.rowMeta?.[rIdx];
        const realRowId = meta?.tempId ? rowMap.get(meta.tempId) ?? generateId('row') : generateId('row');
        const linkedPageId = meta?.linkedPageTempId
          ? pageMap.get(meta.linkedPageTempId) ?? null
          : null;

        const cells: Record<string, CellValue> = {};
        for (const [k, v] of Object.entries(rawCells)) {
          if (relationColIds.has(k)) {
            const arr = Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : [];
            cells[k] = arr.map((id) => rowMap.get(id) ?? id);
          } else {
            cells[k] = v;
          }
        }

        const row: DatabaseRow = {
          id: realRowId,
          pageId: realPageId,
          workspaceId,
          ownerId,
          order: rIdx,
          cells,
          ...(linkedPageId ? { linkedPageId } : {}),
        };
        return row;
      });
    }
  });

  return { pages, rowsByPage };
}
