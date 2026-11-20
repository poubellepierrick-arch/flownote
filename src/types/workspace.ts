export type BlockType =
  | 'paragraph'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'todo'
  | 'bullet'
  | 'numbered'
  | 'quote'
  | 'callout'
  | 'code'
  | 'divider'
  | 'toggle'
  | 'table'
  | 'bookmark';

export interface TableBlockRow {
  cells: string[];
}

export interface BlockItem {
  id: string;
  type: BlockType;
  content: string;
  checked?: boolean;
  language?: string;
  icon?: string;
  isOpen?: boolean;
  details?: string;
  url?: string;
  tableRows?: TableBlockRow[];
}

export type ColumnType =
  | 'text'
  | 'number'
  | 'select'
  | 'multi_select'
  | 'checkbox'
  | 'date'
  | 'url'
  | 'relation'
  | 'rollup'
  | 'formula';

export type RollupFunction =
  | 'count'
  | 'sum'
  | 'avg'
  | 'min'
  | 'max'
  | 'values'
  | 'checked_count';

export interface DatabaseColumn {
  id: string;
  name: string;
  type: ColumnType;
  options?: string[];
  relationTargetPageId?: string;
  rollupRelationColId?: string;
  rollupTargetColId?: string;
  rollupFn?: RollupFunction;
  formulaExpression?: string;
}

export type DatabaseViewType = 'table' | 'kanban' | 'list';

export type CellValue = string | number | boolean | string[];

export interface DatabaseRow {
  id: string;
  pageId: string;
  workspaceId: string;
  ownerId: string;
  order: number;
  cells: Record<string, CellValue>;
  linkedPageId?: string | null;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type PageType = 'document' | 'database';
export type PageSource = 'native' | 'notion_import';

export interface WorkspacePage {
  id: string;
  workspaceId: string;
  ownerId: string;
  parentId: string | null;
  title: string;
  icon: string;
  type: PageType;
  isFavorite: boolean;
  isTrashed: boolean;
  order: number;
  source: PageSource;
  blocks: BlockItem[];
  columns?: DatabaseColumn[];
  activeView?: DatabaseViewType;
  sortRules?: DatabaseSortRule[];
  columnWidths?: Record<string, number>;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Workspace {
  id: string;
  ownerId: string;
  name: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type ThemeMode = 'light' | 'dark';

export interface UserProfile {
  uid: string;
  displayName?: string;
  email?: string;
  photoURL?: string;
  theme: ThemeMode;
  updatedAt?: unknown;
}

export type SyncStatus = 'local' | 'syncing' | 'synced' | 'error';

export type MainViewMode =
  | 'chronology'
  | 'prepare'
  | 'stats'
  | 'page'
  | 'import'
  | 'trash'
  | 'search';

export type ImproSessionStatus = 'Réalisée' | 'Préparée';

export interface ImproPlanStep {
  id: string;
  kind: 'exercise' | 'custom';
  exerciceId?: string;
  label?: string;
  durationMin: number;
  note: string;
}

export interface ImproTimelineFilterPreset {
  mode?: 'chronology' | 'matrix' | 'participant';
  groupId?: string;
  participantId?: string;
  exerciseId?: string;
  etape?: string;
}

export interface ImproPrepareDraftConfig {
  seanceId?: string;
  duplicateFromId?: string;
  groupId?: string;
  addExerciseIds?: string[];
}

export type SortDirection = 'asc' | 'desc';

export interface DatabaseSortRule {
  colId: string;
  dir: SortDirection;
}
