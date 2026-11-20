import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  ExternalLink,
  FileText,
  GripVertical,
  Heading1,
  Heading2,
  Heading3,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  MessageSquareQuote,
  Minus,
  Plus,
  Table,
  Text,
  Trash2,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useColumnDrag } from '../hooks/useColumnDrag';
import type { BlockItem, BlockType, TableBlockRow, WorkspacePage } from '../types/workspace';
import { reorderByIndex } from '../utils/columnOrder';
import { generateId } from '../utils/id';
import { parseNotionHtml, parseNotionMarkdown } from '../utils/notionImporter';

interface BlockEditorProps {
  page: WorkspacePage;
}

interface SlashOption {
  type: BlockType;
  label: string;
  keywords: string;
  icon: typeof Text;
}

const SLASH_OPTIONS: SlashOption[] = [
  { type: 'paragraph', label: 'Texte', keywords: 'texte paragraphe', icon: Text },
  { type: 'heading1', label: 'Titre 1', keywords: 'titre h1 grand', icon: Heading1 },
  { type: 'heading2', label: 'Titre 2', keywords: 'titre h2 moyen', icon: Heading2 },
  { type: 'heading3', label: 'Titre 3', keywords: 'titre h3 petit', icon: Heading3 },
  { type: 'todo', label: 'Tâche', keywords: 'tache case a cocher todo', icon: ListChecks },
  { type: 'bullet', label: 'Liste à puces', keywords: 'liste puce bullet', icon: List },
  { type: 'numbered', label: 'Liste numérotée', keywords: 'numero liste ordonnee', icon: ListOrdered },
  { type: 'toggle', label: 'Liste dépliante', keywords: 'depliant toggle accordeon', icon: ChevronRight },
  { type: 'callout', label: 'Encadré', keywords: 'encadre note callout aside', icon: MessageSquareQuote },
  { type: 'quote', label: 'Citation', keywords: 'citation quote', icon: MessageSquareQuote },
  { type: 'table', label: 'Tableau simple', keywords: 'tableau table grille', icon: Table },
  { type: 'bookmark', label: 'Signet', keywords: 'signet lien url bookmark', icon: Link2 },
  { type: 'code', label: 'Code', keywords: 'code script', icon: Code2 },
  { type: 'divider', label: 'Séparateur', keywords: 'separateur ligne divider', icon: Minus },
];

const PAGE_ICONS = ['📄', '◈', '⊞', '✓', '≡', '⌘', '⚡', '⚑', '★', '○'];

function AutoTextarea({
  value,
  onChangeValue,
  onKeyDown,
  onPaste,
  onFocus,
  placeholder,
  ariaLabel,
  className,
  inputRef,
}: {
  value: string;
  onChangeValue: (val: string) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste?: (e: ClipboardEvent<HTMLTextAreaElement>) => void;
  onFocus?: () => void;
  placeholder?: string;
  ariaLabel: string;
  className: string;
  inputRef?: (el: HTMLTextAreaElement | null) => void;
}) {
  const localRef = useRef<HTMLTextAreaElement | null>(null);

  const syncHeight = () => {
    const el = localRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  useLayoutEffect(() => {
    syncHeight();
  }, [value]);

  useEffect(() => {
    window.addEventListener('resize', syncHeight);
    return () => window.removeEventListener('resize', syncHeight);
  }, []);

  return (
    <textarea
      ref={(el) => {
        localRef.current = el;
        inputRef?.(el);
      }}
      value={value}
      rows={1}
      onChange={(e) => onChangeValue(e.target.value)}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      onFocus={onFocus}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={`overflow-hidden resize-none ${className}`}
    />
  );
}

function extractFlownotePageLinks(text: string): Array<{ label: string; pageId: string }> {
  const out: Array<{ label: string; pageId: string }> = [];
  const seen = new Set<string>();
  const re = /\[([^\]]+)\]\(flownote:\/\/page\/([a-zA-Z0-9_-]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (!seen.has(m[2])) {
      seen.add(m[2]);
      out.push({ label: m[1].trim() || 'Page liée', pageId: m[2] });
    }
  }
  return out;
}

export function BlockEditor({ page }: BlockEditorProps) {
  const { pages, selectPage, updatePageTitle, updatePageIcon, updatePageBlocks } = useWorkspace();

  const [slashTargetId, setSlashTargetId] = useState<string | null>(null);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const [focusBlockId, setFocusBlockId] = useState<string | null>(null);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const blockInputsRef = useRef<Map<string, HTMLTextAreaElement | HTMLInputElement>>(new Map());

  const blocks: BlockItem[] =
    page.blocks.length > 0
      ? page.blocks
      : [{ id: generateId('blk'), type: 'paragraph', content: '' }];

  useEffect(() => {
    setSlashTargetId(null);
    setShowIconPicker(false);
    setActiveBlockId(null);
  }, [page.id]);

  useEffect(() => {
    if (!focusBlockId) return;
    const el = blockInputsRef.current.get(focusBlockId);
    if (el) {
      el.focus();
      setFocusBlockId(null);
    }
  }, [focusBlockId, blocks]);

  const filteredSlash = SLASH_OPTIONS.filter((opt) => {
    if (!slashQuery) return true;
    const q = slashQuery.toLowerCase();
    return opt.label.toLowerCase().includes(q) || opt.keywords.includes(q);
  });

  const setBlocks = (next: BlockItem[]) => {
    updatePageBlocks(page.id, next.slice(0, 400));
  };

  const insertBlockAfter = (afterId: string, type: BlockType = 'paragraph') => {
    const idx = blocks.findIndex((b) => b.id === afterId);
    const created: BlockItem = {
      id: generateId('blk'),
      type,
      content: type === 'table' ? 'Tableau' : '',
      ...(type === 'todo' ? { checked: false } : {}),
      ...(type === 'code' ? { language: 'typescript' } : {}),
      ...(type === 'callout' ? { icon: '•' } : {}),
      ...(type === 'toggle' ? { isOpen: true, details: '' } : {}),
      ...(type === 'bookmark' ? { url: 'https://' } : {}),
      ...(type === 'table'
        ? {
            tableRows: [
              { cells: ['Colonne 1', 'Colonne 2'] },
              { cells: ['', ''] },
            ],
          }
        : {}),
    };
    const next = [...blocks];
    next.splice(idx + 1, 0, created);
    setBlocks(next);
    setFocusBlockId(created.id);
    setActiveBlockId(created.id);
    return created.id;
  };

  const applyBlockType = (blockId: string, newType: BlockType, clearSlash = false) => {
    const next = blocks.map((b) => {
      if (b.id !== blockId) return b;
      const content = clearSlash ? b.content.replace(/^\/\S*/, '').trimStart() : b.content;
      const updated: BlockItem = {
        id: b.id,
        type: newType,
        content: newType === 'divider' ? '' : newType === 'table' ? 'Tableau' : content,
      };
      if (newType === 'todo') updated.checked = b.checked ?? false;
      if (newType === 'code') updated.language = b.language ?? 'typescript';
      if (newType === 'callout') updated.icon = b.icon ?? '•';
      if (newType === 'toggle') {
        updated.isOpen = true;
        updated.details = b.details ?? '';
      }
      if (newType === 'bookmark') {
        updated.url = b.url ?? (/^https?:\/\//i.test(content) ? content : 'https://');
      }
      if (newType === 'table') {
        updated.tableRows = b.tableRows ?? [
          { cells: ['Colonne 1', 'Colonne 2'] },
          { cells: [content || '', ''] },
        ];
      }
      return updated;
    });
    setBlocks(next);
    setSlashTargetId(null);
    setSlashQuery('');
    setSlashIndex(0);
    setFocusBlockId(blockId);
  };

  const handleContentChange = (block: BlockItem, value: string) => {
    if (block.type === 'paragraph') {
      const shortcuts: Array<[RegExp, BlockType]> = [
        [/^###\s$/, 'heading3'],
        [/^##\s$/, 'heading2'],
        [/^#\s$/, 'heading1'],
        [/^[-*]\s$/, 'bullet'],
        [/^1\.\s$/, 'numbered'],
        [/^\[\s?\]\s$/, 'todo'],
        [/^>\s$/, 'quote'],
        [/^---$/, 'divider'],
        [/^```$/, 'code'],
      ];
      for (const [pattern, targetType] of shortcuts) {
        if (pattern.test(value)) {
          const next = blocks.map((b) =>
            b.id === block.id
              ? {
                  id: b.id,
                  type: targetType,
                  content: '',
                  ...(targetType === 'todo' ? { checked: false } : {}),
                  ...(targetType === 'code' ? { language: 'typescript' } : {}),
                }
              : b
          );
          setBlocks(next);
          setSlashTargetId(null);
          return;
        }
      }
    }

    if (value.startsWith('/')) {
      setSlashTargetId(block.id);
      setSlashQuery(value.slice(1));
      setSlashIndex(0);
    } else if (slashTargetId === block.id) {
      setSlashTargetId(null);
      setSlashQuery('');
    }

    setBlocks(blocks.map((b) => (b.id === block.id ? { ...b, content: value } : b)));
  };

  const handleBlockPaste = (block: BlockItem, e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (block.type === 'code') return;

    const html = e.clipboardData.getData('text/html');
    const plain = e.clipboardData.getData('text/plain');

    const hasNotionHtml =
      Boolean(html) &&
      /<(h[1-3]|ul|ol|li|table|details|blockquote|pre|figure)\b/i.test(html);
    const hasMultiLineMarkdown =
      plain.includes('\n') &&
      /(^|\n)\s*(?:#{1,3}\s|[-*+]\s|\d+\.\s|>\s|```|<aside>|<details|\|.+\|)/m.test(plain);

    if (!hasNotionHtml && !hasMultiLineMarkdown) return;

    const parsed = hasNotionHtml
      ? parseNotionHtml(html, page.title)
      : parseNotionMarkdown(plain, page.title);

    if (parsed.blocks.length <= 1 && parsed.blocks[0]?.type === 'paragraph') {
      return;
    }

    e.preventDefault();
    const idx = blocks.findIndex((b) => b.id === block.id);
    if (idx < 0) return;

    const next = [...blocks];
    if (block.content.trim() === '') {
      next.splice(idx, 1, ...parsed.blocks);
    } else {
      next.splice(idx + 1, 0, ...parsed.blocks);
    }
    setBlocks(next);
    const lastInserted = parsed.blocks[parsed.blocks.length - 1];
    if (lastInserted) setFocusBlockId(lastInserted.id);
  };

  const handleKeyDown = (block: BlockItem, e: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if (slashTargetId === block.id && filteredSlash.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashIndex((i) => (i + 1) % filteredSlash.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIndex((i) => (i - 1 + filteredSlash.length) % filteredSlash.length);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const chosen = filteredSlash[slashIndex] ?? filteredSlash[0];
        if (chosen) applyBlockType(block.id, chosen.type, true);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashTargetId(null);
        return;
      }
    }

    if (block.type !== 'code' && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (
        (block.type === 'todo' || block.type === 'bullet' || block.type === 'numbered') &&
        block.content.trim() === ''
      ) {
        applyBlockType(block.id, 'paragraph');
      } else {
        const nextType: BlockType =
          block.type === 'todo' || block.type === 'bullet' || block.type === 'numbered'
            ? block.type
            : 'paragraph';
        insertBlockAfter(block.id, nextType);
      }
      return;
    }

    if (e.key === 'Backspace' && block.content === '') {
      if (block.type !== 'paragraph') {
        e.preventDefault();
        applyBlockType(block.id, 'paragraph');
        return;
      }
      if (blocks.length > 1) {
        e.preventDefault();
        const idx = blocks.findIndex((b) => b.id === block.id);
        const prevBlock = blocks[idx - 1];
        setBlocks(blocks.filter((b) => b.id !== block.id));
        if (prevBlock) setFocusBlockId(prevBlock.id);
      }
    }
  };

  const moveBlock = (blockId: string, dir: -1 | 1) => {
    const idx = blocks.findIndex((b) => b.id === blockId);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    const [removed] = next.splice(idx, 1);
    next.splice(target, 0, removed);
    setBlocks(next);
  };

  const deleteBlock = (blockId: string) => {
    if (blocks.length <= 1) {
      setBlocks([{ id: blockId, type: 'paragraph', content: '' }]);
      return;
    }
    setBlocks(blocks.filter((b) => b.id !== blockId));
  };

  const updateTableRows = (blockId: string, tableRows: TableBlockRow[]) => {
    setBlocks(blocks.map((b) => (b.id === blockId ? { ...b, tableRows } : b)));
  };

  const tableColDrag = useColumnDrag((sourceKey, targetKey, position) => {
    const [srcBlockId, srcIdxStr] = sourceKey.split('::');
    const [tgtBlockId, tgtIdxStr] = targetKey.split('::');
    if (!srcBlockId || srcBlockId !== tgtBlockId) return;
    const fromIdx = Number(srcIdxStr);
    const toIdx = Number(tgtIdxStr);
    if (!Number.isInteger(fromIdx) || !Number.isInteger(toIdx) || fromIdx === toIdx) return;
    const targetBlock = blocks.find((b) => b.id === srcBlockId);
    if (!targetBlock) return;
    const current = targetBlock.tableRows ?? [{ cells: ['Colonne 1', 'Colonne 2'] }];
    const nextRows = current.map((row) => ({
      cells: reorderByIndex(row.cells, fromIdx, toIdx, position),
    }));
    updateTableRows(srcBlockId, nextRows);
  });

  const copyCode = (block: BlockItem) => {
    void navigator.clipboard?.writeText(block.content);
    setCopiedId(block.id);
    setTimeout(() => setCopiedId((prev) => (prev === block.id ? null : prev)), 1500);
  };

  let numberedCounter = 0;

  return (
    <div className="max-w-3xl mx-auto px-5 sm:pl-24 sm:pr-10 py-10">
      {/* En-tête de la page */}
      <div className="mb-8 space-y-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowIconPicker((v) => !v)}
            aria-label="Changer l'icône de la page"
            className="w-10 h-10 flex items-center justify-center rounded-md text-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
          >
            {page.icon || '📄'}
          </button>
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 tabular-nums">
            <span>{page.source === 'notion_import' ? 'Importé de Notion' : 'Document'}</span>
            <span aria-hidden="true">·</span>
            <span>{blocks.length} {blocks.length > 1 ? 'blocs' : 'bloc'}</span>
          </div>
        </div>

        {showIconPicker && (
          <div className="inline-flex flex-wrap items-center gap-1 p-1.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
            {PAGE_ICONS.map((sym) => (
              <button
                key={sym}
                type="button"
                onClick={() => {
                  updatePageIcon(page.id, sym);
                  setShowIconPicker(false);
                }}
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-white dark:hover:bg-slate-800 text-base"
              >
                {sym}
              </button>
            ))}
          </div>
        )}

        <input
          type="text"
          value={page.title}
          onChange={(e) => updatePageTitle(page.id, e.target.value)}
          placeholder="Sans titre"
          aria-label="Titre de la page"
          className="w-full bg-transparent font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-950 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-700 focus:outline-none"
        />
      </div>

      {/* Liste des blocs */}
      <div className="space-y-2">
        {blocks.map((block, index) => {
          if (block.type === 'numbered') {
            numberedCounter += 1;
          } else {
            numberedCounter = 0;
          }
          const currentNum = numberedCounter;
          const isBlockActive = activeBlockId === block.id;

          return (
            <div key={block.id} className="group relative">
              {/* Contrôles de marge gauche sur desktop */}
              <div className="hidden sm:flex sm:absolute sm:-left-20 sm:top-0.5 sm:w-20 sm:pr-2 items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => {
                    const createdId = insertBlockAfter(block.id, 'paragraph');
                    setSlashTargetId(createdId);
                    setSlashQuery('');
                  }}
                  aria-label="Ajouter un bloc en dessous"
                  className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => moveBlock(block.id, -1)}
                  disabled={index === 0}
                  aria-label="Monter le bloc"
                  className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-25"
                >
                  <ArrowUp className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => moveBlock(block.id, 1)}
                  disabled={index === blocks.length - 1}
                  aria-label="Descendre le bloc"
                  className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-25"
                >
                  <ArrowDown className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => deleteBlock(block.id)}
                  aria-label="Supprimer le bloc"
                  className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>

              {/* Corps du bloc */}
              <div className="w-full min-w-0 relative">
                {block.type === 'divider' ? (
                  <div className="py-3">
                    <hr className="border-slate-200 dark:border-slate-800" />
                  </div>
                ) : block.type === 'bookmark' ? (
                  <div className="my-1.5 px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Link2 className="w-4 h-4 text-slate-400 shrink-0" />
                      <input
                        ref={(el) => {
                          if (el) blockInputsRef.current.set(block.id, el);
                        }}
                        type="text"
                        value={block.content}
                        onChange={(e) => handleContentChange(block, e.target.value)}
                        placeholder="Libellé du lien"
                        aria-label="Libellé du signet"
                        className="w-40 sm:w-52 bg-transparent text-sm font-medium text-slate-900 dark:text-slate-100 focus:outline-none"
                      />
                      <input
                        type="url"
                        value={block.url ?? ''}
                        onChange={(e) =>
                          setBlocks(
                            blocks.map((b) =>
                              b.id === block.id ? { ...b, url: e.target.value } : b
                            )
                          )
                        }
                        placeholder="https://..."
                        aria-label="Adresse URL du signet"
                        className="flex-1 min-w-[140px] bg-transparent font-mono text-xs text-slate-500 dark:text-slate-400 focus:outline-none"
                      />
                    </div>
                    {block.url && block.url.startsWith('flownote://page/') ? (
                      <button
                        type="button"
                        onClick={() => selectPage(block.url!.replace('flownote://page/', ''))}
                        className="px-2 py-1 rounded text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 inline-flex items-center gap-1 shrink-0"
                      >
                        <FileText className="w-3 h-3" />
                        <span>Ouvrir</span>
                      </button>
                    ) : (
                      block.url &&
                      /^https?:\/\//i.test(block.url) && (
                        <a
                          href={block.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Ouvrir ${block.content || block.url}`}
                          className="px-2 py-1 rounded text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 inline-flex items-center gap-1 shrink-0"
                        >
                          <span>Ouvrir</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )
                    )}
                  </div>
                ) : block.type === 'table' ? (
                  <div className="my-2 space-y-1.5">
                    <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                      <table className="w-full border-collapse text-left">
                        <tbody>
                          {(block.tableRows ?? [{ cells: ['Colonne 1', 'Colonne 2'] }]).map(
                            (tRow, rIdx) => (
                              <tr
                                key={rIdx}
                                className={`border-b border-slate-200 dark:border-slate-800 last:border-b-0 ${
                                  rIdx === 0 ? 'bg-slate-50 dark:bg-slate-900/70 font-medium' : ''
                                }`}
                              >
                                {tRow.cells.map((cell, cIdx) => {
                                  const colKey = `${block.id}::${cIdx}`;
                                  const isHeaderRow = rIdx === 0;
                                  const isDragging = tableColDrag.dragColId === colKey;
                                  const dropSide =
                                    isHeaderRow && tableColDrag.dropIndicator?.colId === colKey
                                      ? tableColDrag.dropIndicator.position
                                      : null;
                                  return (
                                    <td
                                      key={cIdx}
                                      {...(isHeaderRow ? tableColDrag.getThDropProps(colKey) : {})}
                                      className={`group/tcol relative px-2.5 py-1.5 border-r border-slate-200 dark:border-slate-800 last:border-r-0 transition-opacity ${
                                        isDragging ? 'opacity-45' : ''
                                      }`}
                                    >
                                      {dropSide && (
                                        <div
                                          aria-hidden="true"
                                          className={`pointer-events-none absolute top-0 bottom-0 w-0.5 bg-slate-900 dark:bg-slate-100 z-20 ${
                                            dropSide === 'before' ? 'left-0' : 'right-0'
                                          }`}
                                        />
                                      )}
                                      <div className="flex items-center gap-1">
                                        {isHeaderRow && (
                                          <span
                                            {...tableColDrag.getDragHandleProps(colKey)}
                                            title="Glisser pour réordonner la colonne"
                                            className="cursor-grab active:cursor-grabbing text-slate-300 dark:text-slate-600 opacity-40 group-hover/tcol:opacity-100 shrink-0"
                                          >
                                            <GripVertical className="w-3 h-3" />
                                          </span>
                                        )}
                                        <input
                                          type="text"
                                          value={cell}
                                          onChange={(e) => {
                                            const current = block.tableRows ?? [];
                                            const updated = current.map((row, ri) =>
                                              ri === rIdx
                                                ? {
                                                    cells: row.cells.map((c, ci) =>
                                                      ci === cIdx ? e.target.value : c
                                                    ),
                                                  }
                                                : row
                                            );
                                            updateTableRows(block.id, updated);
                                          }}
                                          aria-label={`Cellule ${rIdx + 1}-${cIdx + 1}`}
                                          className="w-full bg-transparent text-xs sm:text-sm text-slate-800 dark:text-slate-200 focus:outline-none"
                                        />
                                      </div>
                                    </td>
                                  );
                                })}
                                <td className="w-8 px-1 text-center">
                                  {(block.tableRows?.length ?? 0) > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const nextRows = (block.tableRows ?? []).filter(
                                          (_, ri) => ri !== rIdx
                                        );
                                        updateTableRows(block.id, nextRows);
                                      }}
                                      aria-label={`Supprimer la ligne ${rIdx + 1}`}
                                      className="text-slate-400 hover:text-red-600 dark:hover:text-red-400 p-1"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            )
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const current = block.tableRows ?? [{ cells: ['Colonne 1', 'Colonne 2'] }];
                          const colCount = current[0]?.cells.length || 2;
                          updateTableRows(block.id, [
                            ...current,
                            { cells: Array.from({ length: colCount }, () => '') },
                          ]);
                        }}
                        className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white"
                      >
                        + Ligne
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const current = block.tableRows ?? [{ cells: ['Colonne 1'] }];
                          updateTableRows(
                            block.id,
                            current.map((r, ri) => ({
                              cells: [...r.cells, ri === 0 ? `Colonne ${r.cells.length + 1}` : ''],
                            }))
                          );
                        }}
                        className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white"
                      >
                        + Colonne
                      </button>
                    </div>
                  </div>
                ) : block.type === 'code' ? (
                  <div className="rounded-lg bg-slate-950 border border-slate-800 overflow-hidden my-1">
                    <div className="px-3 py-1.5 flex items-center justify-between border-b border-slate-800 text-xs text-slate-400">
                      <input
                        type="text"
                        value={block.language ?? 'texte'}
                        onChange={(e) =>
                          setBlocks(
                            blocks.map((b) =>
                              b.id === block.id ? { ...b, language: e.target.value.slice(0, 40) } : b
                            )
                          )
                        }
                        aria-label="Langage du bloc de code"
                        className="bg-transparent font-mono text-xs text-slate-300 focus:outline-none w-28"
                      />
                      <button
                        type="button"
                        onClick={() => copyCode(block)}
                        className="flex items-center gap-1 text-xs text-slate-300 hover:text-white"
                      >
                        {copiedId === block.id ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Copié</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copier</span>
                          </>
                        )}
                      </button>
                    </div>
                    <AutoTextarea
                      inputRef={(el) => {
                        if (el) blockInputsRef.current.set(block.id, el);
                      }}
                      value={block.content}
                      onChangeValue={(val) => handleContentChange(block, val)}
                      onKeyDown={(e) => handleKeyDown(block, e)}
                      onFocus={() => setActiveBlockId(block.id)}
                      placeholder="Code..."
                      ariaLabel="Contenu du bloc de code"
                      className="w-full p-3 bg-transparent font-mono text-xs leading-relaxed text-slate-100 focus:outline-none"
                    />
                  </div>
                ) : block.type === 'toggle' ? (
                  <div className="py-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setBlocks(
                            blocks.map((b) =>
                              b.id === block.id ? { ...b, isOpen: !b.isOpen } : b
                            )
                          )
                        }
                        aria-label={block.isOpen ? 'Replier' : 'Déplier'}
                        className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 shrink-0"
                      >
                        {block.isOpen ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </button>
                      <input
                        ref={(el) => {
                          if (el) blockInputsRef.current.set(block.id, el);
                        }}
                        type="text"
                        value={block.content}
                        onChange={(e) => handleContentChange(block, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(block, e)}
                        onFocus={() => setActiveBlockId(block.id)}
                        placeholder="Titre du dépliant"
                        aria-label="Titre du bloc dépliant"
                        className="flex-1 bg-transparent text-sm font-medium text-slate-900 dark:text-slate-100 focus:outline-none"
                      />
                    </div>
                    {block.isOpen && (
                      <div className="pl-8">
                        <AutoTextarea
                          value={block.details ?? ''}
                          onChangeValue={(val) =>
                            setBlocks(
                              blocks.map((b) =>
                                b.id === block.id ? { ...b, details: val } : b
                              )
                            )
                          }
                          placeholder="Contenu caché..."
                          ariaLabel="Contenu du bloc dépliant"
                          className="w-full px-3 py-2 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 text-sm text-slate-700 dark:text-slate-300 focus:outline-none"
                        />
                      </div>
                    )}
                  </div>
                ) : block.type === 'callout' ? (
                  <div className="my-1 flex items-start gap-3 px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
                    <span className="text-sm font-semibold text-slate-500 dark:text-slate-400 pt-0.5 select-none">
                      {block.icon || '•'}
                    </span>
                    <AutoTextarea
                      inputRef={(el) => {
                        if (el) blockInputsRef.current.set(block.id, el);
                      }}
                      value={block.content}
                      onChangeValue={(val) => handleContentChange(block, val)}
                      onKeyDown={(e) => handleKeyDown(block, e)}
                      onPaste={(e) => handleBlockPaste(block, e)}
                      onFocus={() => setActiveBlockId(block.id)}
                      placeholder="Note..."
                      ariaLabel="Contenu de l'encadré"
                      className="flex-1 bg-transparent text-sm text-slate-800 dark:text-slate-200 focus:outline-none leading-relaxed"
                    />
                  </div>
                ) : (
                  <div
                    className={`flex items-start gap-2.5 ${
                      block.type === 'quote'
                        ? 'px-4 py-2.5 my-1 rounded-md bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800 italic'
                        : 'py-0.5'
                    }`}
                  >
                    {block.type === 'todo' && (
                      <input
                        type="checkbox"
                        checked={Boolean(block.checked)}
                        onChange={(e) =>
                          setBlocks(
                            blocks.map((b) =>
                              b.id === block.id ? { ...b, checked: e.target.checked } : b
                            )
                          )
                        }
                        aria-label={`Tâche : ${block.content || 'vide'}`}
                        className="mt-1.5 w-4 h-4 rounded border-slate-300 dark:border-slate-600 accent-slate-900 dark:accent-slate-100 shrink-0 cursor-pointer"
                      />
                    )}
                    {block.type === 'bullet' && (
                      <span className="mt-1 text-slate-400 select-none shrink-0">•</span>
                    )}
                    {block.type === 'numbered' && (
                      <span className="mt-1 text-xs font-mono tabular-nums text-slate-500 select-none shrink-0 w-5 text-right">
                        {currentNum}.
                      </span>
                    )}

                    <AutoTextarea
                      inputRef={(el) => {
                        if (el) blockInputsRef.current.set(block.id, el);
                      }}
                      value={block.content}
                      onChangeValue={(val) => handleContentChange(block, val)}
                      onKeyDown={(e) => handleKeyDown(block, e)}
                      onPaste={(e) => handleBlockPaste(block, e)}
                      onFocus={() => setActiveBlockId(block.id)}
                      placeholder={
                        block.type === 'heading1'
                          ? 'Titre 1'
                          : block.type === 'heading2'
                            ? 'Titre 2'
                            : block.type === 'heading3'
                              ? 'Titre 3'
                              : index === 0
                                ? 'Écrire, coller depuis Notion ou taper /...'
                                : 'Texte...'
                      }
                      ariaLabel={`Bloc ${block.type}`}
                      className={`w-full bg-transparent focus:outline-none leading-relaxed ${
                        block.type === 'heading1'
                          ? 'font-display text-2xl font-bold text-slate-950 dark:text-white pt-3 pb-1'
                          : block.type === 'heading2'
                            ? 'font-display text-xl font-semibold text-slate-900 dark:text-slate-100 pt-2.5 pb-0.5'
                            : block.type === 'heading3'
                              ? 'font-display text-base font-semibold text-slate-900 dark:text-slate-100 pt-1.5'
                              : block.type === 'todo' && block.checked
                                ? 'text-[15px] text-slate-400 line-through'
                                : 'text-[15px] text-slate-800 dark:text-slate-200'
                      }`}
                    />
                  </div>
                )}

                {(() => {
                  const internalLinks = extractFlownotePageLinks(
                    `${block.content || ''}\n${block.details || ''}`
                  );
                  if (internalLinks.length === 0) return null;
                  return (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {internalLinks.map((lnk) => {
                        const target = pages.find((p) => p.id === lnk.pageId && !p.isTrashed);
                        return (
                          <button
                            key={lnk.pageId}
                            type="button"
                            onClick={() => selectPage(lnk.pageId)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500 underline decoration-slate-300 dark:decoration-slate-600"
                          >
                            <FileText className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>{target?.title || lnk.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Barre mobile compacte quand le bloc est sélectionné */}
                {isBlockActive && (
                  <div className="sm:hidden flex items-center gap-1 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        const createdId = insertBlockAfter(block.id, 'paragraph');
                        setSlashTargetId(createdId);
                        setSlashQuery('');
                      }}
                      className="px-2 py-1 rounded text-xs text-slate-500 border border-slate-200 dark:border-slate-800"
                    >
                      + Bloc
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteBlock(block.id)}
                      className="px-2 py-1 rounded text-xs text-red-600 dark:text-red-400 border border-slate-200 dark:border-slate-800"
                    >
                      Supprimer
                    </button>
                  </div>
                )}

                {/* Menu commandes slash en ligne */}
                {slashTargetId === block.id && (
                  <div
                    role="listbox"
                    aria-label="Types de blocs"
                    className="mt-1 w-64 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1 z-20 max-h-72 overflow-y-auto"
                  >
                    {filteredSlash.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-slate-500">Aucun bloc</div>
                    ) : (
                      filteredSlash.map((opt, optIdx) => {
                        const Icon = opt.icon;
                        const active = optIdx === slashIndex;
                        return (
                          <button
                            key={opt.type}
                            type="button"
                            onClick={() => applyBlockType(block.id, opt.type, true)}
                            className={`w-full px-3 py-1.5 flex items-center gap-2.5 text-left text-sm transition-colors ${
                              active
                                ? 'bg-slate-100 dark:bg-slate-800 text-slate-950 dark:text-white'
                                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                            }`}
                          >
                            <Icon className="w-4 h-4 shrink-0 text-slate-500" />
                            <span>{opt.label}</span>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bouton ajout rapide en bas */}
      <div className="mt-6">
        <button
          type="button"
          onClick={() => {
            const last = blocks[blocks.length - 1];
            if (last) insertBlockAfter(last.id, 'paragraph');
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Ajouter un bloc</span>
        </button>
      </div>
    </div>
  );
}
