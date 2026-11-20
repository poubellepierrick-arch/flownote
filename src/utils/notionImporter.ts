import JSZip from 'jszip';
import type {
  BlockItem,
  CellValue,
  ColumnType,
  DatabaseColumn,
  DatabaseRow,
  PageType,
  TableBlockRow,
  WorkspacePage,
} from '../types/workspace';
import { generateId } from './id';

export interface ImportedRowMeta {
  tempId: string;
  linkedPageTempId?: string | null;
  notionId?: string | null;
}

export interface ImportedPageDraft {
  tempId: string;
  parentTempId: string | null;
  notionId?: string | null;
  title: string;
  icon: string;
  type: PageType;
  blocks: BlockItem[];
  columns?: DatabaseColumn[];
  rows?: Array<Record<string, CellValue>>;
  rowMeta?: ImportedRowMeta[];
  depth?: number;
}

export interface NotionTextEntry {
  path: string;
  content: string;
}

export interface NotionImportResult {
  pages: ImportedPageDraft[];
  warnings: string[];
  stats: {
    documents: number;
    databases: number;
    blocks: number;
    rows: number;
    relations: number;
    linkedRowPages: number;
    pageLinks: number;
  };
}

const NOTION_UUID_SUFFIX_RE = /\s+[0-9a-f]{32}(_all)?$/i;
const NOTION_DASH_UUID_RE = /\s+[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(_all)?$/i;

export function extractNotionHexId(raw: string): string | null {
  if (!raw) return null;
  const decoded = safeDecodeUri(raw.split('?')[0].split('#')[0]).trim();
  const compactMatch = decoded.match(/(?:^|[\s/%_-])([0-9a-f]{32})(?:_all)?(?:\.[a-z0-9]+)?$/i);
  if (compactMatch) return compactMatch[1].toLowerCase();
  const dashMatch = decoded.match(
    /(?:^|[\s/%_-])([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:_all)?(?:\.[a-z0-9]+)?$/i
  );
  if (dashMatch) return dashMatch[1].replace(/-/g, '').toLowerCase();
  return null;
}

export function stripNotionId(rawName: string): string {
  const withoutExt = rawName.replace(/\.(md|markdown|csv|txt|html|htm)$/i, '');
  const decoded = safeDecodeUri(withoutExt);
  return (
    decoded
      .replace(NOTION_UUID_SUFFIX_RE, '')
      .replace(NOTION_DASH_UUID_RE, '')
      .replace(/_all$/i, '')
      .trim() || 'Sans titre'
  );
}

function safeDecodeUri(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function cleanNotionInlineText(
  text: string,
  options?: { preserveInternalLinks?: boolean }
): string {
  let out = text;
  if (options?.preserveInternalLinks) {
    out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/gi, (full, label: string, href: string) => {
      const cleanHref = href.trim();
      const isInternalFile = /\.(?:md|markdown|csv|html|htm)(?:[?#].*)?$/i.test(cleanHref);
      const isNotionUrl = /^https?:\/\/(?:www\.)?(?:notion\.so|notion\.site)\//i.test(cleanHref);
      if (isInternalFile || isNotionUrl) {
        return `[${label}](notion-ref://${encodeURIComponent(cleanHref)})`;
      }
      return full;
    });
    out = out.replace(
      /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
      (_, target: string, alias?: string) =>
        `[${(alias || target).trim()}](notion-ref://${encodeURIComponent(`wiki:${target.trim()}`)})`
    );
  } else {
    // Remplace les liens internes Notion [Titre](Chemin%2032hex.md) ou .html/.csv par le titre lisible
    out = out.replace(/\[([^\]]+)\]\(([^)]+\.(?:md|csv|html|htm)(?:[?#][^)]*)?)\)/gi, '$1');
    // Nettoie les wiki-links [[Page]]
    out = out.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, alias) => alias || target);
  }
  // Remplace les liens Notion dans les cellules CSV : "Nom (https://www.notion.so/...)" -> "Nom"
  out = out.replace(
    /^(.+?)\s*\(https?:\/\/(?:www\.)?(?:notion\.so|notion\.site)\/[^)]+\)$/i,
    '$1'
  );
  return out.trim();
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripHtmlTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

function isMarkdownTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return false;
  const cells = trimmed
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
  return cells.length >= 1 && cells.every((c) => /^:?-{2,}:?$/.test(c));
}

function splitMarkdownTableRow(line: string, preserveInternalLinks = false): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => cleanNotionInlineText(c.trim(), { preserveInternalLinks }));
}

function extractLeadingEmojiOrIcon(text: string): { icon: string; body: string } {
  const trimmed = text.trim();
  const match = trimmed.match(/^([\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}•!◈★⚑⚡])\s+(.*)$/u);
  if (match) {
    return { icon: match[1], body: match[2].trim() };
  }
  return { icon: '•', body: trimmed };
}

export function parseNotionMarkdown(
  markdown: string,
  fallbackTitle = 'Sans titre',
  options?: { preserveInternalLinks?: boolean }
): { title: string; blocks: BlockItem[] } {
  const preserveLinks = Boolean(options?.preserveInternalLinks);
  const cleanInline = (val: string) => cleanNotionInlineText(val, { preserveInternalLinks: preserveLinks });
  const normalized = markdown.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');

  let title = fallbackTitle;
  let startIndex = 0;

  while (startIndex < lines.length && lines[startIndex].trim() === '') {
    startIndex++;
  }

  // Frontmatter YAML optionnel (--- ... ---)
  const frontmatterMeta: string[] = [];
  if (startIndex < lines.length && lines[startIndex].trim() === '---') {
    let endYaml = startIndex + 1;
    while (endYaml < lines.length && lines[endYaml].trim() !== '---') {
      const kv = lines[endYaml].trim();
      if (kv && !kv.startsWith('#')) {
        const titleMatch = kv.match(/^(?:title|titre):\s*["']?(.+?)["']?$/i);
        if (titleMatch) {
          title = titleMatch[1].trim().slice(0, 200);
        } else {
          frontmatterMeta.push(kv);
        }
      }
      endYaml++;
    }
    if (endYaml < lines.length && lines[endYaml].trim() === '---') {
      startIndex = endYaml + 1;
    }
  }

  while (startIndex < lines.length && lines[startIndex].trim() === '') {
    startIndex++;
  }

  // Titre H1 en tête de document Notion
  if (startIndex < lines.length && /^#\s+(.+)$/.test(lines[startIndex])) {
    const match = lines[startIndex].match(/^#\s+(.+)$/);
    if (match) {
      title = cleanNotionInlineText(match[1]).slice(0, 200) || fallbackTitle;
      startIndex++;
    }
  }

  const blocks: BlockItem[] = [];
  let i = startIndex;

  // Propriétés Notion exportées sous le H1 (ex: "Statut: En cours")
  const metaLines: string[] = [...frontmatterMeta];
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (trimmed === '') {
      if (metaLines.length > 0) {
        i++;
        break;
      }
      i++;
      continue;
    }
    if (/^[A-Za-zÀ-ÿ0-9 _-]{2,32}:\s+.+$/.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
      metaLines.push(trimmed);
      i++;
      continue;
    }
    break;
  }

  if (metaLines.length >= 2) {
    blocks.push({
      id: generateId('blk'),
      type: 'callout',
      icon: '•',
      content: metaLines.map(cleanInline).join(' · ').slice(0, 20000),
    });
  } else if (metaLines.length === 1) {
    blocks.push({
      id: generateId('blk'),
      type: 'paragraph',
      content: cleanInline(metaLines[0]).slice(0, 20000),
    });
  }

  while (i < lines.length && blocks.length < 395) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '') {
      i++;
      continue;
    }

    // Bloc de code clôturé
    if (trimmed.startsWith('```')) {
      const language = trimmed.slice(3).trim().slice(0, 40) || 'texte';
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      blocks.push({
        id: generateId('blk'),
        type: 'code',
        language,
        content: codeLines.join('\n').slice(0, 20000),
      });
      continue;
    }

    // Encadré Notion natif <aside> ... </aside>
    if (trimmed.startsWith('<aside>')) {
      const singleLineMatch = trimmed.match(/^<aside>(.*?)<\/aside>$/i);
      let rawAside = '';
      if (singleLineMatch) {
        rawAside = singleLineMatch[1];
        i++;
      } else {
        const asideLines: string[] = [];
        const afterOpen = trimmed.slice(7).trim();
        if (afterOpen) asideLines.push(afterOpen);
        i++;
        while (i < lines.length && !lines[i].trim().includes('</aside>')) {
          const cur = lines[i].trim();
          if (cur) asideLines.push(cur);
          i++;
        }
        if (i < lines.length) {
          const beforeClose = lines[i].trim().replace(/<\/aside>.*$/i, '').trim();
          if (beforeClose) asideLines.push(beforeClose);
          i++;
        }
        rawAside = asideLines.join('\n');
      }
      const { icon, body } = extractLeadingEmojiOrIcon(cleanInline(stripHtmlTags(rawAside)));
      blocks.push({
        id: generateId('blk'),
        type: 'callout',
        icon: icon.slice(0, 16),
        content: body.slice(0, 20000),
      });
      continue;
    }

    // Liste dépliante Notion <details><summary>...</summary>...</details>
    if (trimmed.startsWith('<details')) {
      const detailLines: string[] = [];
      let summary = 'Détails';

      const singleMatch = trimmed.match(/^<details[^>]*>\s*<summary>(.*?)<\/summary>(.*?)<\/details>$/i);
      if (singleMatch) {
        summary = stripHtmlTags(singleMatch[1]) || 'Détails';
        const inner = stripHtmlTags(singleMatch[2]);
        if (inner) detailLines.push(cleanInline(inner));
        i++;
      } else {
        const inlineSummary = trimmed.match(/<summary>(.*?)<\/summary>(.*)$/i);
        if (inlineSummary) {
          summary = stripHtmlTags(inlineSummary[1]) || 'Détails';
          if (inlineSummary[2].trim()) detailLines.push(cleanInline(inlineSummary[2]));
        }
        i++;
        while (i < lines.length && !lines[i].trim().includes('</details>')) {
          const cur = lines[i].trim();
          const sumMatch = cur.match(/^<summary>(.*?)<\/summary>(.*)$/i);
          if (sumMatch) {
            summary = stripHtmlTags(sumMatch[1]) || 'Détails';
            if (sumMatch[2].trim()) detailLines.push(cleanInline(sumMatch[2]));
          } else if (cur !== '') {
            detailLines.push(cleanInline(cur));
          }
          i++;
        }
        if (i < lines.length) i++;
      }

      blocks.push({
        id: generateId('blk'),
        type: 'toggle',
        content: cleanInline(summary).slice(0, 20000),
        details: detailLines.join('\n').slice(0, 10000),
        isOpen: false,
      });
      continue;
    }

    // Tableau Markdown (| col | col | \n | --- | --- |)
    if (
      trimmed.includes('|') &&
      i + 1 < lines.length &&
      isMarkdownTableSeparator(lines[i + 1])
    ) {
      const headerCells = splitMarkdownTableRow(trimmed, preserveLinks);
      const tableRows: TableBlockRow[] = [{ cells: headerCells.slice(0, 20) }];
      i += 2;
      while (i < lines.length && lines[i].trim().includes('|') && tableRows.length < 100) {
        const rowCells = splitMarkdownTableRow(lines[i], preserveLinks);
        while (rowCells.length < headerCells.length) rowCells.push('');
        tableRows.push({ cells: rowCells.slice(0, 20) });
        i++;
      }
      blocks.push({
        id: generateId('blk'),
        type: 'table',
        content: 'Tableau',
        tableRows,
      });
      continue;
    }

    // Séparateur
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({
        id: generateId('blk'),
        type: 'divider',
        content: '',
      });
      i++;
      continue;
    }

    // Titres
    if (/^###\s+/.test(trimmed)) {
      blocks.push({
        id: generateId('blk'),
        type: 'heading3',
        content: cleanInline(trimmed.replace(/^###\s+/, '')).slice(0, 20000),
      });
      i++;
      continue;
    }
    if (/^##\s+/.test(trimmed)) {
      blocks.push({
        id: generateId('blk'),
        type: 'heading2',
        content: cleanInline(trimmed.replace(/^##\s+/, '')).slice(0, 20000),
      });
      i++;
      continue;
    }
    if (/^#\s+/.test(trimmed)) {
      blocks.push({
        id: generateId('blk'),
        type: 'heading1',
        content: cleanInline(trimmed.replace(/^#\s+/, '')).slice(0, 20000),
      });
      i++;
      continue;
    }

    // Tâches (- [ ] / - [x])
    const todoMatch = trimmed.match(/^[-*]\s+\[([ xX])\]\s*(.*)$/);
    if (todoMatch) {
      blocks.push({
        id: generateId('blk'),
        type: 'todo',
        checked: todoMatch[1].toLowerCase() === 'x',
        content: cleanInline(todoMatch[2]).slice(0, 20000),
      });
      i++;
      continue;
    }

    // Liste à puces
    if (/^[-*+]\s+/.test(trimmed)) {
      blocks.push({
        id: generateId('blk'),
        type: 'bullet',
        content: cleanInline(trimmed.replace(/^[-*+]\s+/, '')).slice(0, 20000),
      });
      i++;
      continue;
    }

    // Liste numérotée
    if (/^\d+\.\s+/.test(trimmed)) {
      blocks.push({
        id: generateId('blk'),
        type: 'numbered',
        content: cleanInline(trimmed.replace(/^\d+\.\s+/, '')).slice(0, 20000),
      });
      i++;
      continue;
    }

    // Signet / Lien autonome ([Titre](https://...) ou https://...)
    const mdBookmarkMatch = trimmed.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/i);
    if (
      mdBookmarkMatch &&
      !(
        preserveLinks &&
        /^https?:\/\/(?:www\.)?(?:notion\.so|notion\.site)\//i.test(mdBookmarkMatch[2].trim())
      )
    ) {
      blocks.push({
        id: generateId('blk'),
        type: 'bookmark',
        content: mdBookmarkMatch[1].trim().slice(0, 20000),
        url: mdBookmarkMatch[2].trim().slice(0, 2000),
      });
      i++;
      continue;
    }
    if (/^https?:\/\/\S+$/i.test(trimmed)) {
      blocks.push({
        id: generateId('blk'),
        type: 'bookmark',
        content: trimmed.replace(/^https?:\/\/(?:www\.)?/, '').slice(0, 20000),
        url: trimmed.slice(0, 2000),
      });
      i++;
      continue;
    }

    // Citation ou encadré Notion (> [!NOTE] ou > 💡 ...)
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      const joined = cleanInline(quoteLines.join('\n'));
      const calloutMatch = joined.match(/^\[!(?:NOTE|TIP|INFO|WARNING)\]\s*/i);
      if (calloutMatch) {
        blocks.push({
          id: generateId('blk'),
          type: 'callout',
          icon: '!',
          content: joined.slice(calloutMatch[0].length).slice(0, 20000),
        });
      } else {
        const iconCheck = extractLeadingEmojiOrIcon(joined);
        if (iconCheck.icon !== '•') {
          blocks.push({
            id: generateId('blk'),
            type: 'callout',
            icon: iconCheck.icon.slice(0, 16),
            content: iconCheck.body.slice(0, 20000),
          });
        } else {
          blocks.push({
            id: generateId('blk'),
            type: 'quote',
            content: joined.slice(0, 20000),
          });
        }
      }
      continue;
    }

    // Paragraphe standard
    const paraLines: string[] = [cleanInline(trimmed)];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,3}\s+|[-*+]\s+|\d+\.\s+|>\s*|```|<details|<aside>|---|\*\*\*|\|.+\|)/.test(
        lines[i].trim()
      )
    ) {
      paraLines.push(cleanInline(lines[i].trim()));
      i++;
    }
    blocks.push({
      id: generateId('blk'),
      type: 'paragraph',
      content: paraLines.join(' ').slice(0, 20000),
    });
  }

  if (blocks.length === 0) {
    blocks.push({
      id: generateId('blk'),
      type: 'paragraph',
      content: '',
    });
  }

  return { title, blocks };
}

function htmlToTextWithLinks(html: string, preserveInternalLinks: boolean): string {
  if (!preserveInternalLinks) return stripHtmlTags(html);
  const replaced = html.replace(
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (full, href: string, innerHtml: string) => {
      const label = stripHtmlTags(innerHtml);
      if (!label) return full;
      const cleanHref = decodeHtmlEntities(href.trim());
      const isInternalFile = /\.(?:md|markdown|csv|html|htm)(?:[?#].*)?$/i.test(cleanHref);
      const isNotionUrl = /^https?:\/\/(?:www\.)?(?:notion\.so|notion\.site)\//i.test(cleanHref);
      if (isInternalFile || isNotionUrl) {
        return `[${label}](notion-ref://${encodeURIComponent(cleanHref)})`;
      }
      return label;
    }
  );
  return stripHtmlTags(replaced);
}

export function parseNotionHtml(
  html: string,
  fallbackTitle = 'Sans titre',
  options?: { preserveInternalLinks?: boolean }
): { title: string; blocks: BlockItem[] } {
  const preserveLinks = Boolean(options?.preserveInternalLinks);
  const extractHtmlText = (segment: string) => htmlToTextWithLinks(segment, preserveLinks);

  let title = fallbackTitle;
  const pageTitleMatch = html.match(/<h1[^>]*class="[^"]*page-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i)
    ?? html.match(/<title>([\s\S]*?)<\/title>/i);
  if (pageTitleMatch) {
    const extracted = stripHtmlTags(pageTitleMatch[1]).slice(0, 200);
    if (extracted) title = extracted;
  }

  const bodyMatch = html.match(/<div[^>]*class="[^"]*page-body[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/article>/i)
    ?? html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const content = bodyMatch ? bodyMatch[1] : html;

  const blocks: BlockItem[] = [];

  // Extraction séquentielle des éléments Notion HTML courants
  const tokenRe =
    /<(h1|h2|h3|p|blockquote|hr|pre|table|figure|details|ul|ol)\b([^>]*)>([\s\S]*?)<\/\1>|<hr\s*\/?>/gi;

  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(content)) !== null && blocks.length < 395) {
    if (match[0].toLowerCase().startsWith('<hr')) {
      blocks.push({ id: generateId('blk'), type: 'divider', content: '' });
      continue;
    }

    const tag = match[1].toLowerCase();
    const attrs = match[2] ?? '';
    const inner = match[3] ?? '';

    if (tag === 'h1') {
      if (attrs.includes('page-title')) continue;
      const text = extractHtmlText(inner);
      if (text) blocks.push({ id: generateId('blk'), type: 'heading1', content: text });
    } else if (tag === 'h2') {
      const text = extractHtmlText(inner);
      if (text) blocks.push({ id: generateId('blk'), type: 'heading2', content: text });
    } else if (tag === 'h3') {
      const text = extractHtmlText(inner);
      if (text) blocks.push({ id: generateId('blk'), type: 'heading3', content: text });
    } else if (tag === 'blockquote') {
      const text = extractHtmlText(inner);
      if (text) blocks.push({ id: generateId('blk'), type: 'quote', content: text });
    } else if (tag === 'pre') {
      const codeText = decodeHtmlEntities(inner.replace(/<[^>]+>/g, '')).trim();
      if (codeText) {
        blocks.push({ id: generateId('blk'), type: 'code', language: 'texte', content: codeText });
      }
    } else if (tag === 'figure' && attrs.includes('callout')) {
      const text = extractHtmlText(inner);
      const { icon, body } = extractLeadingEmojiOrIcon(text);
      if (body) {
        blocks.push({ id: generateId('blk'), type: 'callout', icon, content: body });
      }
    } else if (tag === 'details') {
      const sumMatch = inner.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i);
      const summary = sumMatch ? extractHtmlText(sumMatch[1]) : 'Détails';
      const rest = sumMatch
        ? extractHtmlText(inner.replace(sumMatch[0], ''))
        : extractHtmlText(inner);
      blocks.push({
        id: generateId('blk'),
        type: 'toggle',
        content: summary,
        details: rest,
        isOpen: false,
      });
    } else if (tag === 'table') {
      const trMatches = Array.from(inner.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi));
      const tableRows: TableBlockRow[] = trMatches.slice(0, 100).map((tr) => {
        const cellMatches = Array.from(tr[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi));
        return { cells: cellMatches.slice(0, 20).map((c) => extractHtmlText(c[1])) };
      });
      if (tableRows.length > 0) {
        blocks.push({ id: generateId('blk'), type: 'table', content: 'Tableau', tableRows });
      }
    } else if (tag === 'ul' || tag === 'ol') {
      const isTodoList = attrs.includes('to-do-list');
      const liMatches = Array.from(inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi));
      for (const li of liMatches) {
        const liFull = li[0];
        const liInner = li[1];
        const hasChecked =
          liFull.includes('checkbox-on') ||
          /<input[^>]*type=["']checkbox["'][^>]*checked/i.test(liInner);
        const hasCheckbox = isTodoList || /<input[^>]*type=["']checkbox["']/i.test(liInner);
        const text = extractHtmlText(liInner);
        if (!text) continue;
        if (hasCheckbox) {
          blocks.push({ id: generateId('blk'), type: 'todo', checked: hasChecked, content: text });
        } else {
          blocks.push({
            id: generateId('blk'),
            type: tag === 'ol' ? 'numbered' : 'bullet',
            content: text,
          });
        }
      }
    } else if (tag === 'p') {
      const linkOnly = inner.trim().match(/^<a[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>$/i);
      if (
        linkOnly &&
        !(
          preserveLinks &&
          /^https?:\/\/(?:www\.)?(?:notion\.so|notion\.site)\//i.test(linkOnly[1])
        )
      ) {
        blocks.push({
          id: generateId('blk'),
          type: 'bookmark',
          content: stripHtmlTags(linkOnly[2]) || linkOnly[1],
          url: linkOnly[1].slice(0, 2000),
        });
      } else {
        const text = extractHtmlText(inner);
        if (text) blocks.push({ id: generateId('blk'), type: 'paragraph', content: text });
      }
    }
  }

  if (blocks.length === 0) {
    const plain = extractHtmlText(content);
    blocks.push({
      id: generateId('blk'),
      type: 'paragraph',
      content: plain.slice(0, 20000),
    });
  }

  return { title, blocks };
}

export function parseCsvMatrix(csvText: string): string[][] {
  const text = csvText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field.trim());
      field = '';
    } else if (ch === '\n') {
      row.push(field.trim());
      if (row.some((cell) => cell !== '')) {
        rows.push(row);
      }
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  row.push(field.trim());
  if (row.some((cell) => cell !== '')) {
    rows.push(row);
  }
  return rows;
}

const MONTH_MAP: Record<string, string> = {
  january: '01',
  janvier: '01',
  jan: '01',
  february: '02',
  février: '02',
  fevrier: '02',
  feb: '02',
  march: '03',
  mars: '03',
  mar: '03',
  april: '04',
  avril: '04',
  apr: '04',
  may: '05',
  mai: '05',
  june: '06',
  juin: '06',
  jun: '06',
  july: '07',
  juillet: '07',
  jul: '07',
  august: '08',
  août: '08',
  aout: '08',
  aug: '08',
  september: '09',
  septembre: '09',
  sep: '09',
  october: '10',
  octobre: '10',
  oct: '10',
  november: '11',
  novembre: '11',
  nov: '11',
  december: '12',
  décembre: '12',
  decembre: '12',
  dec: '12',
};

export function normalizeNotionDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  // ISO YYYY-MM-DD ou YYYY/MM/DD
  const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  }

  // DD/MM/YYYY
  const fr = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (fr) {
    return `${fr[3]}-${fr[2].padStart(2, '0')}-${fr[1].padStart(2, '0')}`;
  }

  // Format Notion anglais "November 18, 2026"
  const enText = s.match(/^([A-Za-zÀ-ÿ]+)\s+(\d{1,2}),\s*(\d{4})/);
  if (enText) {
    const mm = MONTH_MAP[enText[1].toLowerCase()];
    if (mm) return `${enText[3]}-${mm}-${enText[2].padStart(2, '0')}`;
  }

  // Format Notion français "18 novembre 2026"
  const frText = s.match(/^(\d{1,2})\s+([A-Za-zÀ-ÿ]+)\s+(\d{4})/);
  if (frText) {
    const mm = MONTH_MAP[frText[2].toLowerCase()];
    if (mm) return `${frText[3]}-${mm}-${frText[1].padStart(2, '0')}`;
  }

  return null;
}

function parseNotionNumber(raw: string): number | null {
  const cleaned = raw
    .trim()
    .replace(/[\s\u00A0]/g, '')
    .replace(/[€$£%]/g, '')
    .replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function inferColumnType(values: string[], headerName: string): ColumnType {
  const nonEmpty = values.filter((v) => v !== '');
  if (nonEmpty.length === 0) return 'text';

  const lowerName = headerName.toLowerCase();
  if (nonEmpty.every((v) => /^(true|false|yes|no|oui|non|checked|unchecked)$/i.test(v))) {
    return 'checkbox';
  }
  if (nonEmpty.every((v) => /^https?:\/\//i.test(v))) {
    return 'url';
  }
  if (nonEmpty.every((v) => parseNotionNumber(v) !== null)) {
    return 'number';
  }
  if (nonEmpty.every((v) => normalizeNotionDate(v) !== null)) {
    return 'date';
  }

  // Détection multi_select (étiquettes séparées par des virgules sans URL Notion)
  const hasComma = nonEmpty.some((v) => v.includes(','));
  const hasNotionUrl = nonEmpty.some((v) => /https?:\/\/(?:www\.)?(?:notion\.so|notion\.site)\//i.test(v));
  if (hasComma && !hasNotionUrl) {
    const tokens: string[] = [];
    let allShortTokens = true;
    for (const v of nonEmpty) {
      const parts = v.split(',').map((s) => s.trim()).filter(Boolean);
      for (const p of parts) {
        if (p.length > 40 || p.endsWith('.')) {
          allShortTokens = false;
          break;
        }
        tokens.push(p);
      }
      if (!allShortTokens) break;
    }
    const uniqueTokens = new Set(tokens);
    if (
      allShortTokens &&
      uniqueTokens.size >= 2 &&
      uniqueTokens.size <= 30 &&
      (tokens.length > uniqueTokens.size || /tag|étiquette|etiquette|label|catégor|compétenc|multi|stack/i.test(lowerName))
    ) {
      return 'multi_select';
    }
  }

  const unique = new Set(nonEmpty);
  if (
    unique.size <= 15 &&
    nonEmpty.length >= 2 &&
    (unique.size < nonEmpty.length || /statut|status|état|priorit|type|catégor|tag/i.test(lowerName))
  ) {
    return 'select';
  }
  return 'text';
}

function coerceCellValue(raw: string, type: ColumnType): CellValue {
  if (type === 'checkbox') {
    return /^(true|yes|oui|1|checked)$/i.test(raw.trim());
  }
  if (type === 'number') {
    const num = parseNotionNumber(raw);
    return num !== null ? num : raw;
  }
  if (type === 'date') {
    return normalizeNotionDate(raw) ?? raw.slice(0, 100);
  }
  if (type === 'multi_select') {
    return Array.from(
      new Set(
        raw
          .split(',')
          .map((s) => cleanNotionInlineText(s.trim()))
          .filter(Boolean)
      )
    ).slice(0, 50);
  }
  return cleanNotionInlineText(raw).slice(0, 1000);
}

export function parseNotionCsv(
  csvText: string,
  _title = 'Base importée'
): { columns: DatabaseColumn[]; rows: Array<Record<string, CellValue>>; rawValues: string[][] } {
  const matrix = parseCsvMatrix(csvText);
  if (matrix.length === 0) {
    return {
      columns: [{ id: 'col_titre', name: 'Nom', type: 'text' }],
      rows: [],
      rawValues: [],
    };
  }

  // Supprimer les anciens plafonds artificiels : importer toutes les lignes (et jusqu'à 100 colonnes selon schéma Firestore)
  const headers = matrix[0].slice(0, 100).map((h, idx) => h || `Colonne ${idx + 1}`);
  const dataRows = matrix.slice(1);

  const columns: DatabaseColumn[] = headers.map((header, idx) => {
    const colValues = dataRows.map((r) => r[idx] ?? '');
    const type = idx === 0 ? 'text' : inferColumnType(colValues, header);
    const col: DatabaseColumn = {
      id: `col_${idx + 1}`,
      name: header.slice(0, 80),
      type,
    };
    if (type === 'select') {
      const options = Array.from(
        new Set(colValues.map((v) => cleanNotionInlineText(v)).filter(Boolean))
      ).slice(0, 100);
      col.options = options.length > 0 ? options : ['À faire', 'En cours', 'Terminé'];
    } else if (type === 'multi_select') {
      const opts = Array.from(
        new Set(
          colValues
            .flatMap((v) => v.split(',').map((s) => cleanNotionInlineText(s.trim())))
            .filter(Boolean)
        )
      ).slice(0, 100);
      col.options = opts;
    }
    return col;
  });

  const rows: Array<Record<string, CellValue>> = dataRows.map((rawRow) => {
    const cells: Record<string, CellValue> = {};
    columns.forEach((col, idx) => {
      cells[col.id] = coerceCellValue(rawRow[idx] ?? '', col.type);
    });
    return cells;
  });

  const rawValues = dataRows.map((rawRow) => columns.map((_, idx) => rawRow[idx] ?? ''));
  return { columns, rows, rawValues };
}

function normalizeSegmentKey(rawSegment: string): string {
  return stripNotionId(rawSegment)
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeEntryPath(rawPath: string): string {
  return rawPath
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '')
    .normalize('NFC');
}

function splitNotionRelationItems(rawCell: string): Array<{ label: string; notionId: string | null }> {
  const trimmed = rawCell.trim();
  if (!trimmed) return [];

  // Cas 1 : items Notion avec URL "Nom (https://www.notion.so/...)"
  const urlPattern = /(.+?)\s*\((https?:\/\/(?:www\.)?(?:notion\.so|notion\.site)\/[^)]+)\)(?:\s*,\s*|$)/gi;
  const matchedWithUrls: Array<{ label: string; notionId: string | null }> = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = urlPattern.exec(trimmed)) !== null) {
    if (m.index > lastIdx) {
      const gap = trimmed.slice(lastIdx, m.index).replace(/^,+|,+$/g, '').trim();
      if (gap) {
        gap
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((part) => matchedWithUrls.push({ label: part, notionId: null }));
      }
    }
    matchedWithUrls.push({
      label: m[1].replace(/^,\s*/, '').trim(),
      notionId: extractNotionHexId(m[2]),
    });
    lastIdx = urlPattern.lastIndex;
  }
  if (matchedWithUrls.length > 0) {
    if (lastIdx < trimmed.length) {
      const tail = trimmed.slice(lastIdx).replace(/^,+|,+$/g, '').trim();
      if (tail) {
        tail
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((part) => matchedWithUrls.push({ label: part, notionId: null }));
      }
    }
    return matchedWithUrls.filter((item) => item.label || item.notionId);
  }

  // Cas 2 : URL Notion nue
  if (/^https?:\/\/(?:www\.)?(?:notion\.so|notion\.site)\//i.test(trimmed)) {
    return trimmed
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((url) => ({ label: url, notionId: extractNotionHexId(url) }));
  }

  // Cas 3 : liste séparée par virgules (titres)
  return trimmed
    .split(',')
    .map((s) => cleanNotionInlineText(s.trim()))
    .filter(Boolean)
    .map((label) => ({ label, notionId: null }));
}

function resolveRelativeNormalizedKey(fromDirSegments: string[], rawRelHref: string): string {
  const cleanHref = safeDecodeUri(rawRelHref.split('?')[0].split('#')[0]).replace(/\\/g, '/');
  const stack = [...fromDirSegments];
  const parts = cleanHref.split('/').filter(Boolean);
  for (let idx = 0; idx < parts.length; idx++) {
    const seg = parts[idx];
    if (seg === '.') continue;
    if (seg === '..') {
      stack.pop();
    } else {
      stack.push(normalizeSegmentKey(seg));
    }
  }
  return stack.join('/');
}

export async function extractZipEntries(
  data: ArrayBuffer | Uint8Array,
  prefix = '',
  depth = 0
): Promise<NotionTextEntry[]> {
  if (depth > 3) return [];
  const zip = await JSZip.loadAsync(data);
  const collected: NotionTextEntry[] = [];
  const cleanPrefix = prefix ? `${normalizeEntryPath(prefix).replace(/\/+$/, '')}/` : '';

  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const normName = normalizeEntryPath(entry.name);
    if (
      normName.startsWith('__MACOSX/') ||
      normName.split('/').some((seg) => seg.startsWith('.'))
    ) {
      continue;
    }

    if (/\.zip$/i.test(normName)) {
      const nestedBuf = await entry.async('uint8array');
      const nestedDir = normName.includes('/')
        ? `${cleanPrefix}${normName.slice(0, normName.lastIndexOf('/'))}`
        : cleanPrefix.replace(/\/$/, '');
      const nestedFiles = await extractZipEntries(nestedBuf, nestedDir, depth + 1);
      collected.push(...nestedFiles);
      continue;
    }

    if (/\.(md|markdown|csv|txt|html|htm)$/i.test(normName)) {
      const content = await entry.async('string');
      collected.push({ path: `${cleanPrefix}${normName}`, content });
    }
  }

  return collected;
}

export function parseNotionEntries(
  entries: NotionTextEntry[],
  options?: { ignoredAssetsCount?: number }
): NotionImportResult {
  const warnings: string[] = [];
  const normalizedEntries = entries
    .map((e) => ({
      path: normalizeEntryPath(e.path),
      content: e.content,
    }))
    .filter(
      (e) =>
        e.path.length > 0 &&
        !e.path.startsWith('__MACOSX/') &&
        !e.path.split('/').some((seg) => seg.startsWith('.')) &&
        /\.(md|markdown|csv|txt|html|htm)$/i.test(e.path)
    );

  // Dédupliquer les paires Notion Foo.csv + Foo_all.csv (privilégier _all.csv)
  const allCsvKeys = new Set<string>();
  for (const f of normalizedEntries) {
    if (/_all\.csv$/i.test(f.path)) {
      allCsvKeys.add(f.path.replace(/_all\.csv$/i, '.csv').toLowerCase());
    }
  }
  const filteredFiles = normalizedEntries.filter((f) => {
    const lower = f.path.toLowerCase();
    if (lower.endsWith('.csv') && !lower.endsWith('_all.csv') && allCsvKeys.has(lower)) {
      return false;
    }
    return true;
  });

  // Trier les fichiers pour un ordre stable
  const sortedEntries = [...filteredFiles].sort((a, b) => {
    const aDepth = a.path.split('/').length;
    const bDepth = b.path.split('/').length;
    if (aDepth !== bDepth) return aDepth - bDepth;
    return a.path.localeCompare(b.path, 'fr');
  });

  const pathToTempId = new Map<string, string>();
  const notionIdToTempId = new Map<string, string>();
  const titleToTempId = new Map<string, string>();
  const draftFolderSegments = new Map<string, string[]>();
  const dbRawValuesByTempId = new Map<string, string[][]>();
  const pages: ImportedPageDraft[] = [];

  for (const entry of sortedEntries) {
    const parts = entry.path.split('/').filter(Boolean);
    if (parts.length === 0) continue;

    const fileName = parts[parts.length - 1];
    const baseName = stripNotionId(fileName).normalize('NFC');
    const notionId = extractNotionHexId(fileName);
    const isCsv = /\.csv$/i.test(fileName);
    const isHtml = /\.(html|htm)$/i.test(fileName);

    const tempId = generateId('imp');
    const folderNormSegments = parts.slice(0, -1).map(normalizeSegmentKey);
    const selfNormSegment = normalizeSegmentKey(fileName);
    const selfKey = [...folderNormSegments, selfNormSegment].join('/');

    if (!pathToTempId.has(selfKey)) {
      pathToTempId.set(selfKey, tempId);
    }
    if (notionId && !notionIdToTempId.has(notionId)) {
      notionIdToTempId.set(notionId, tempId);
    }
    draftFolderSegments.set(tempId, folderNormSegments);

    if (isCsv) {
      const parsedDb = parseNotionCsv(entry.content, baseName);
      const rowMeta: ImportedRowMeta[] = parsedDb.rows.map(() => ({
        tempId: generateId('row'),
        linkedPageTempId: null,
        notionId: null,
      }));
      dbRawValuesByTempId.set(tempId, parsedDb.rawValues);

      const dbTitle = baseName.slice(0, 200);
      const normTitle = normalizeSegmentKey(dbTitle);
      if (normTitle && !titleToTempId.has(normTitle)) {
        titleToTempId.set(normTitle, tempId);
      }

      pages.push({
        tempId,
        parentTempId: null,
        notionId,
        title: dbTitle,
        icon: '⊞',
        type: 'database',
        blocks: [],
        columns: parsedDb.columns,
        rows: parsedDb.rows,
        rowMeta,
      });
    } else if (isHtml) {
      const parsedHtml = parseNotionHtml(entry.content, baseName, { preserveInternalLinks: true });
      const docTitle = parsedHtml.title.slice(0, 200);
      const normTitle = normalizeSegmentKey(docTitle);
      if (normTitle && !titleToTempId.has(normTitle)) {
        titleToTempId.set(normTitle, tempId);
      }
      pages.push({
        tempId,
        parentTempId: null,
        notionId,
        title: docTitle,
        icon: '📄',
        type: 'document',
        blocks: parsedHtml.blocks,
      });
    } else {
      const parsedDoc = parseNotionMarkdown(entry.content, baseName, { preserveInternalLinks: true });
      const docTitle = parsedDoc.title.slice(0, 200);
      const normTitle = normalizeSegmentKey(docTitle);
      if (normTitle && !titleToTempId.has(normTitle)) {
        titleToTempId.set(normTitle, tempId);
      }
      pages.push({
        tempId,
        parentTempId: null,
        notionId,
        title: docTitle,
        icon: '📄',
        type: 'document',
        blocks: parsedDoc.blocks,
      });
    }
  }

  // Passe 2a : résoudre le parent le plus proche
  for (const page of pages) {
    const folderSegs = draftFolderSegments.get(page.tempId) ?? [];
    let resolvedParentId: string | null = null;
    for (let len = folderSegs.length; len >= 1; len--) {
      const candidateKey = folderSegs.slice(0, len).join('/');
      const foundId = pathToTempId.get(candidateKey);
      if (foundId && foundId !== page.tempId) {
        resolvedParentId = foundId;
        break;
      }
    }
    page.parentTempId = resolvedParentId;
  }

  // Passe 2b : associer chaque ligne de base à sa fiche sous-page (.md/.html) et indexer les lignes
  let linkedRowPagesCount = 0;
  const rowNotionIdToRef = new Map<string, { dbTempId: string; rowTempId: string }>();
  const dbRowTitleToRowId = new Map<string, Map<string, string>>();

  const dbPages = pages.filter((p) => p.type === 'database');
  for (const dbPage of dbPages) {
    const rowTitleMap = new Map<string, string>();
    dbRowTitleToRowId.set(dbPage.tempId, rowTitleMap);

    const rows = dbPage.rows ?? [];
    const rowMeta = dbPage.rowMeta ?? [];
    const rawValues = dbRawValuesByTempId.get(dbPage.tempId) ?? [];
    const primaryCol = dbPage.columns?.[0];
    if (!primaryCol) continue;

    const childDocs = pages.filter(
      (p) => p.parentTempId === dbPage.tempId && p.type === 'document'
    );
    const usedChildIds = new Set<string>();

    for (let rIdx = 0; rIdx < rows.length; rIdx++) {
      const meta = rowMeta[rIdx];
      if (!meta) continue;
      const rawPrimary = rawValues[rIdx]?.[0] ?? '';
      const rowHexId = extractNotionHexId(rawPrimary);
      const primaryText = String(rows[rIdx][primaryCol.id] ?? '');
      const normPrimary = normalizeSegmentKey(primaryText);

      if (normPrimary && !rowTitleMap.has(normPrimary)) {
        rowTitleMap.set(normPrimary, meta.tempId);
      }

      // Chercher la sous-page associée (par notionId d'abord, puis par titre)
      let matchedChild: ImportedPageDraft | undefined;
      if (rowHexId) {
        matchedChild = childDocs.find(
          (c) => !usedChildIds.has(c.tempId) && c.notionId === rowHexId
        );
      }
      if (!matchedChild && normPrimary) {
        matchedChild = childDocs.find(
          (c) => !usedChildIds.has(c.tempId) && normalizeSegmentKey(c.title) === normPrimary
        );
      }

      if (matchedChild) {
        usedChildIds.add(matchedChild.tempId);
        meta.linkedPageTempId = matchedChild.tempId;
        meta.notionId = matchedChild.notionId ?? rowHexId;
        linkedRowPagesCount++;
      } else if (rowHexId) {
        meta.notionId = rowHexId;
      }

      if (meta.notionId) {
        rowNotionIdToRef.set(meta.notionId, { dbTempId: dbPage.tempId, rowTempId: meta.tempId });
      }
    }
  }

  // Passe 2c : reconstruire les relations inter-bases (par ID 32-hex Notion ou par correspondance exacte des titres)
  let relationsCount = 0;
  for (const dbPage of dbPages) {
    const cols = dbPage.columns ?? [];
    const rows = dbPage.rows ?? [];
    const rawValues = dbRawValuesByTempId.get(dbPage.tempId) ?? [];
    if (rows.length === 0) continue;

    for (let cIdx = 1; cIdx < cols.length; cIdx++) {
      const col = cols[cIdx];
      const colRawCells = rawValues.map((r) => r[cIdx] ?? '');
      const nonEmptyCells = colRawCells.filter((v) => v.trim() !== '');
      if (nonEmptyCells.length === 0) continue;

      const parsedPerRow = colRawCells.map(splitNotionRelationItems);
      const hasNotionLinks = parsedPerRow.some((items) => items.some((it) => it.notionId !== null));

      if (!hasNotionLinks && (col.type === 'number' || col.type === 'date' || col.type === 'checkbox' || col.type === 'url')) {
        continue;
      }

      let targetDbTempId: string | null = null;

      if (hasNotionLinks) {
        const countsByDb = new Map<string, number>();
        for (const items of parsedPerRow) {
          for (const it of items) {
            if (!it.notionId) continue;
            const ref = rowNotionIdToRef.get(it.notionId);
            if (ref) {
              countsByDb.set(ref.dbTempId, (countsByDb.get(ref.dbTempId) ?? 0) + 1);
            }
          }
        }
        let bestCount = 0;
        for (const [candidateDbId, cnt] of countsByDb.entries()) {
          if (cnt > bestCount) {
            bestCount = cnt;
            targetDbTempId = candidateDbId;
          }
        }
      }

      // Secours par correspondance exacte des titres sur les autres bases
      if (!targetDbTempId && !hasNotionLinks) {
        const allItems = parsedPerRow.flat();
        if (allItems.length > 0) {
          const candidateDbs: Array<{ dbId: string; matched: number }> = [];
          for (const otherDb of dbPages) {
            if (otherDb.tempId === dbPage.tempId) continue;
            const titleMap = dbRowTitleToRowId.get(otherDb.tempId);
            if (!titleMap || titleMap.size === 0) continue;
            let matched = 0;
            for (const it of allItems) {
              const key = normalizeSegmentKey(it.label);
              if (key && titleMap.has(key)) matched++;
            }
            if (matched >= 1 && matched / allItems.length >= 0.8) {
              candidateDbs.push({ dbId: otherDb.tempId, matched });
            }
          }
          if (candidateDbs.length === 1) {
            targetDbTempId = candidateDbs[0].dbId;
          } else if (candidateDbs.length > 1) {
            candidateDbs.sort((a, b) => b.matched - a.matched);
            if (candidateDbs[0].matched > candidateDbs[1].matched) {
              targetDbTempId = candidateDbs[0].dbId;
            }
          }
        }
      }

      if (!targetDbTempId) continue;

      const targetTitleMap = dbRowTitleToRowId.get(targetDbTempId);
      col.type = 'relation';
      col.relationTargetPageId = targetDbTempId;
      delete col.options;

      for (let rIdx = 0; rIdx < rows.length; rIdx++) {
        const items = parsedPerRow[rIdx];
        const linkedRowIds: string[] = [];
        for (const it of items) {
          if (it.notionId) {
            const ref = rowNotionIdToRef.get(it.notionId);
            if (ref && ref.dbTempId === targetDbTempId) {
              linkedRowIds.push(ref.rowTempId);
              continue;
            }
          }
          const titleKey = normalizeSegmentKey(it.label);
          const matchedByTitle = titleKey ? targetTitleMap?.get(titleKey) : undefined;
          if (matchedByTitle) {
            linkedRowIds.push(matchedByTitle);
          }
        }
        rows[rIdx][col.id] = Array.from(new Set(linkedRowIds));
      }
      relationsCount++;
    }
  }

  // Passe 2d : convertir les jetons [Label](notion-ref://...) vers flownote://page/<tempId>
  let pageLinksCount = 0;
  const resolveNotionRefToken = (
    rawEncodedRef: string,
    label: string,
    folderSegs: string[]
  ): string => {
    const decodedRef = safeDecodeUri(rawEncodedRef);
    let targetTempId: string | undefined;

    if (decodedRef.startsWith('wiki:')) {
      const targetName = normalizeSegmentKey(decodedRef.slice(5));
      targetTempId = titleToTempId.get(targetName);
    } else {
      const hexId = extractNotionHexId(decodedRef);
      if (hexId) {
        targetTempId = notionIdToTempId.get(hexId) ?? rowNotionIdToRef.get(hexId)?.dbTempId;
      }
      if (!targetTempId && !/^https?:\/\//i.test(decodedRef)) {
        const relKey = resolveRelativeNormalizedKey(folderSegs, decodedRef);
        targetTempId = pathToTempId.get(relKey);
        if (!targetTempId) {
          const baseFromRef = normalizeSegmentKey(decodedRef.split('/').pop() ?? '');
          targetTempId = titleToTempId.get(baseFromRef);
        }
      }
      if (!targetTempId) {
        targetTempId = titleToTempId.get(normalizeSegmentKey(label));
      }
    }

    if (targetTempId) {
      pageLinksCount++;
      return `[${label}](flownote://page/${targetTempId})`;
    }
    if (/^https?:\/\//i.test(decodedRef)) {
      return `[${label}](${decodedRef})`;
    }
    return label;
  };

  const rewriteTextWithRefs = (text: string, folderSegs: string[]): string =>
    text.replace(/\[([^\]]+)\]\(notion-ref:\/\/([^)]+)\)/g, (_, label: string, encodedRef: string) =>
      resolveNotionRefToken(encodedRef, label, folderSegs)
    );

  for (const page of pages) {
    if (page.type !== 'document') continue;
    const folderSegs = draftFolderSegments.get(page.tempId) ?? [];
    for (const block of page.blocks) {
      if (block.content) {
        block.content = rewriteTextWithRefs(block.content, folderSegs);
      }
      if (block.details) {
        block.details = rewriteTextWithRefs(block.details, folderSegs);
      }
      if (block.tableRows) {
        block.tableRows = block.tableRows.map((tr) => ({
          cells: tr.cells.map((c) => rewriteTextWithRefs(c, folderSegs)),
        }));
      }
    }
  }

  // Tri topologique pour afficher l'arborescence et enregistrer les parents avant les enfants
  const childrenMap = new Map<string | null, ImportedPageDraft[]>();
  for (const p of pages) {
    const key = p.parentTempId ?? null;
    const list = childrenMap.get(key) ?? [];
    list.push(p);
    childrenMap.set(key, list);
  }

  const orderedPages: ImportedPageDraft[] = [];
  const visited = new Set<string>();
  const visit = (parentId: string | null, depth: number) => {
    const list = childrenMap.get(parentId) ?? [];
    for (const item of list) {
      if (visited.has(item.tempId)) continue;
      visited.add(item.tempId);
      orderedPages.push({ ...item, depth });
      visit(item.tempId, depth + 1);
    }
  };
  visit(null, 0);

  // Sécurité si un élément isolé n'a pas été parcouru
  for (const p of pages) {
    if (!visited.has(p.tempId)) {
      orderedPages.push({ ...p, parentTempId: null, depth: 0 });
    }
  }

  if (options?.ignoredAssetsCount && options.ignoredAssetsCount > 0) {
    warnings.push(
      `${options.ignoredAssetsCount} ${options.ignoredAssetsCount > 1 ? 'fichiers média ignorés' : 'fichier média ignoré'}.`
    );
  }

  if (orderedPages.length === 0) {
    warnings.push('Aucun fichier Markdown, HTML ou CSV trouvé.');
  }

  return buildImportResult(orderedPages, warnings, {
    relations: relationsCount,
    linkedRowPages: linkedRowPagesCount,
    pageLinks: pageLinksCount,
  });
}

export async function parseNotionZip(data: ArrayBuffer | Uint8Array): Promise<NotionImportResult> {
  const rawFiles = await extractZipEntries(data);
  return parseNotionEntries(rawFiles);
}

export function parseSingleNotionFile(fileName: string, content: string): NotionImportResult {
  const baseName = stripNotionId(fileName);
  const isCsv = /\.csv$/i.test(fileName);
  const isHtml = /\.(html|htm)$/i.test(fileName);
  const tempId = generateId('imp');

  if (isCsv) {
    const parsedDb = parseNotionCsv(content, baseName);
    const rowMeta: ImportedRowMeta[] = parsedDb.rows.map(() => ({
      tempId: generateId('row'),
      linkedPageTempId: null,
      notionId: null,
    }));
    return buildImportResult([
      {
        tempId,
        parentTempId: null,
        title: baseName.slice(0, 200),
        icon: '⊞',
        type: 'database',
        blocks: [],
        columns: parsedDb.columns,
        rows: parsedDb.rows,
        rowMeta,
      },
    ]);
  }

  if (isHtml) {
    const parsedHtml = parseNotionHtml(content, baseName);
    return buildImportResult([
      {
        tempId,
        parentTempId: null,
        title: parsedHtml.title.slice(0, 200),
        icon: '📄',
        type: 'document',
        blocks: parsedHtml.blocks,
      },
    ]);
  }

  const parsedDoc = parseNotionMarkdown(content, baseName);
  return buildImportResult([
    {
      tempId,
      parentTempId: null,
      title: parsedDoc.title.slice(0, 200),
      icon: '📄',
      type: 'document',
      blocks: parsedDoc.blocks,
    },
  ]);
}

function buildImportResult(
  pages: ImportedPageDraft[],
  warnings: string[] = [],
  linkStats: { relations?: number; linkedRowPages?: number; pageLinks?: number } = {}
): NotionImportResult {
  let documents = 0;
  let databases = 0;
  let blocks = 0;
  let rows = 0;

  for (const p of pages) {
    if (p.type === 'database') {
      databases++;
      rows += p.rows?.length ?? 0;
    } else {
      documents++;
      blocks += p.blocks.length;
    }
  }

  return {
    pages,
    warnings,
    stats: {
      documents,
      databases,
      blocks,
      rows,
      relations: linkStats.relations ?? 0,
      linkedRowPages: linkStats.linkedRowPages ?? 0,
      pageLinks: linkStats.pageLinks ?? 0,
    },
  };
}

export function exportPageToMarkdown(page: WorkspacePage, rows: DatabaseRow[] = []): string {
  if (page.type === 'database') {
    const cols = page.columns ?? [];
    const header = cols.map((c) => `"${c.name.replace(/"/g, '""')}"`).join(',');
    const lines = rows.map((r) =>
      cols
        .map((c) => {
          const val = r.cells[c.id] ?? '';
          const text = Array.isArray(val) ? val.join(', ') : String(val);
          return `"${text.replace(/"/g, '""')}"`;
        })
        .join(',')
    );
    return [header, ...lines].join('\n');
  }

  const lines: string[] = [`# ${page.title}`, ''];
  let numIdx = 1;

  for (const block of page.blocks) {
    if (block.type !== 'numbered') {
      numIdx = 1;
    }
    switch (block.type) {
      case 'heading1':
        lines.push(`# ${block.content}`, '');
        break;
      case 'heading2':
        lines.push(`## ${block.content}`, '');
        break;
      case 'heading3':
        lines.push(`### ${block.content}`, '');
        break;
      case 'todo':
        lines.push(`- [${block.checked ? 'x' : ' '}] ${block.content}`);
        break;
      case 'bullet':
        lines.push(`- ${block.content}`);
        break;
      case 'numbered':
        lines.push(`${numIdx++}. ${block.content}`);
        break;
      case 'quote':
        lines.push(`> ${block.content}`, '');
        break;
      case 'callout':
        lines.push(`<aside>`, `${block.icon ? `${block.icon} ` : ''}${block.content}`, `</aside>`, '');
        break;
      case 'code':
        lines.push(`\`\`\`${block.language || ''}`, block.content, '```', '');
        break;
      case 'divider':
        lines.push('---', '');
        break;
      case 'toggle':
        lines.push(`<details><summary>${block.content}</summary>`, block.details || '', '</details>', '');
        break;
      case 'bookmark':
        lines.push(`[${block.content || block.url || 'Lien'}](${block.url || ''})`, '');
        break;
      case 'table': {
        const tRows = block.tableRows ?? [];
        if (tRows.length > 0) {
          lines.push(`| ${tRows[0].cells.join(' | ')} |`);
          lines.push(`| ${tRows[0].cells.map(() => '---').join(' | ')} |`);
          for (let r = 1; r < tRows.length; r++) {
            lines.push(`| ${tRows[r].cells.join(' | ')} |`);
          }
          lines.push('');
        }
        break;
      }
      default:
        lines.push(block.content, '');
        break;
    }
  }

  return lines.join('\n').trim() + '\n';
}
