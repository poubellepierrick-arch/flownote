import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import {
  CheckCircle2,
  CornerDownRight,
  FileText,
  FolderOpen,
  Table2,
  Upload,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { readNotionFromDataTransfer, readNotionFromFileList } from '../utils/notionFolderReader';
import {
  parseSingleNotionFile,
  type NotionImportResult,
} from '../utils/notionImporter';
import { buildPageTree, type PageTreeNode } from '../utils/treeUtils';

const SAMPLE_NOTION_MD = `# Feuille de route produit

Statut: En cours
Responsable: Équipe produit

<aside>
💡 Export Notion complet pris en charge : encadrés, dépliants, tableaux et signets.
</aside>

## Priorités
- [x] Exporter les pages depuis Notion
- [ ] Importer l'arborescence complète
- [ ] Synchroniser avec Firebase

| Module | Statut | Responsable |
| --- | --- | --- |
| Éditeur | Prêt | Alice |
| Import | Actif | Bob |

<details><summary>Détails techniques</summary>Les identifiants UUID Notion et les liens internes sont nettoyés automatiquement.</details>`;

const SAMPLE_NOTION_CSV = `Tâche,Statut,Priorité,Budget,Échéance,Fait
Migration Markdown,Terminé,Haute,1 200 €,November 18 2026,Yes
Import base CSV,En cours,Normale,850 €,2026-11-21,No
Relecture finale,À faire,Basse,400 €,25/11/2026,No`;

const SAMPLE_NOTION_HTML = `<article class="page">
  <header><h1 class="page-title">Note exportée en HTML</h1></header>
  <div class="page-body">
    <h2>Liste de contrôle</h2>
    <ul class="to-do-list">
      <li><div class="checkbox checkbox-on"></div><span>Format HTML Notion reconnu</span></li>
      <li><div class="checkbox checkbox-off"></div><span>Vérifier les blocs importés</span></li>
    </ul>
    <figure class="callout">⚡ Encadré HTML importé</figure>
  </div>
</article>`;

function flattenTreeForSelect(
  nodes: PageTreeNode[]
): Array<{ id: string; title: string; depth: number }> {
  const out: Array<{ id: string; title: string; depth: number }> = [];
  const walk = (list: PageTreeNode[]) => {
    for (const node of list) {
      out.push({ id: node.page.id, title: node.page.title || 'Sans titre', depth: node.depth });
      if (node.children.length > 0) walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

export function NotionImportView() {
  const { pages, importNotionDrafts } = useWorkspace();

  const [mode, setMode] = useState<'file' | 'paste'>('file');
  const [pasteFormat, setPasteFormat] = useState<'md' | 'csv' | 'html'>('md');
  const [pasteTitle, setPasteTitle] = useState('Import Notion');
  const [pasteText, setPasteText] = useState('');
  const [preview, setPreview] = useState<NotionImportResult | null>(null);
  const [targetParentId, setTargetParentId] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const targetOptions = useMemo(() => flattenTreeForSelect(buildPageTree(pages)), [pages]);

  const handleFilesSelected = async (files: FileList | File[]) => {
    setErrorMsg(null);
    setImportedCount(null);
    if (files.length === 0) return;

    setAnalyzing(true);
    try {
      const res = await readNotionFromFileList(files);
      setPreview(res);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lecture du dossier impossible');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      void handleFilesSelected(e.target.files);
    }
    e.target.value = '';
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    setErrorMsg(null);
    setImportedCount(null);
    setAnalyzing(true);
    try {
      const res = await readNotionFromDataTransfer(e.dataTransfer);
      setPreview(res);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lecture du dépôt impossible');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAnalyzePaste = () => {
    setErrorMsg(null);
    setImportedCount(null);
    if (!pasteText.trim()) {
      setErrorMsg('Collez du contenu Markdown, HTML ou CSV.');
      return;
    }
    const ext = pasteFormat === 'csv' ? 'csv' : pasteFormat === 'html' ? 'html' : 'md';
    const filename = `${pasteTitle.trim() || 'Import Notion'}.${ext}`;
    const res = parseSingleNotionFile(filename, pasteText);
    setPreview(res);
  };

  const handleConfirmImport = async () => {
    if (!preview || preview.pages.length === 0) return;
    setImporting(true);
    setErrorMsg(null);
    try {
      const ids = await importNotionDrafts(preview.pages, targetParentId || null);
      setImportedCount(ids.length);
      setPreview(null);
      setPasteText('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Échec de l’importation');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-6 sm:px-10 py-10 space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
          Importer depuis Notion
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Dossier complet avec sous-pages, archive .zip Notion, fichiers individuels ou texte brut.
        </p>
      </div>

      {/* Sélecteur de source */}
      <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setMode('file')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
            mode === 'file'
              ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Dossier ou fichiers (.zip, .md, .html, .csv)
        </button>
        <button
          type="button"
          onClick={() => setMode('paste')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
            mode === 'paste'
              ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Coller du texte
        </button>
      </div>

      {mode === 'file' ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => void handleDrop(e)}
          className={`border border-dashed rounded-lg p-8 text-center transition-colors space-y-4 ${
            isDragging
              ? 'border-slate-900 dark:border-slate-100 bg-slate-50 dark:bg-slate-900'
              : 'border-slate-300 dark:border-slate-700'
          }`}
        >
          <input
            ref={folderInputRef}
            type="file"
            onChange={handleFileInput}
            className="sr-only"
            aria-label="Sélectionner un dossier Notion"
            {...({ webkitdirectory: '', directory: '', multiple: true } as Record<
              string,
              string | boolean
            >)}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,.md,.markdown,.csv,.txt,.html,.htm"
            multiple
            onChange={handleFileInput}
            className="sr-only"
            aria-label="Sélectionner des fichiers ou une archive ZIP Notion"
          />

          <div className="space-y-1">
            <Upload className="w-6 h-6 mx-auto mb-2 text-slate-400" />
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
              {analyzing
                ? 'Analyse du dossier en cours...'
                : 'Glisser un dossier Notion, un .zip ou des fichiers ici'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Pages, sous-pages et bases CSV (.zip, .md, .html, .csv)
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              disabled={analyzing}
              onClick={() => folderInputRef.current?.click()}
              className="px-4 py-2 rounded-md text-xs font-medium bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:opacity-90 disabled:opacity-40 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Choisir un dossier</span>
            </button>

            <button
              type="button"
              disabled={analyzing}
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 rounded-md text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Choisir fichiers / .zip</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={pasteTitle}
                onChange={(e) => setPasteTitle(e.target.value)}
                placeholder="Titre de la page"
                aria-label="Titre de la page à importer"
                className="h-8 px-2.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 focus:outline-none"
              />
              <select
                value={pasteFormat}
                onChange={(e) => setPasteFormat(e.target.value as 'md' | 'csv' | 'html')}
                aria-label="Format du texte"
                className="h-8 px-2.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 focus:outline-none"
              >
                <option value="md">Markdown</option>
                <option value="html">HTML</option>
                <option value="csv">Base CSV</option>
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setPasteFormat('md');
                  setPasteTitle('Feuille de route produit');
                  setPasteText(SAMPLE_NOTION_MD);
                }}
                className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white underline whitespace-nowrap"
              >
                Exemple Markdown
              </button>
              <button
                type="button"
                onClick={() => {
                  setPasteFormat('html');
                  setPasteTitle('Note HTML');
                  setPasteText(SAMPLE_NOTION_HTML);
                }}
                className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white underline whitespace-nowrap"
              >
                Exemple HTML
              </button>
              <button
                type="button"
                onClick={() => {
                  setPasteFormat('csv');
                  setPasteTitle('Suivi migration');
                  setPasteText(SAMPLE_NOTION_CSV);
                }}
                className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white underline whitespace-nowrap"
              >
                Exemple CSV
              </button>
            </div>
          </div>

          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={9}
            placeholder="Collez ici un export Markdown, HTML ou CSV Notion..."
            aria-label="Contenu Notion à analyser"
            className="w-full p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 font-mono text-xs text-slate-800 dark:text-slate-200 focus:outline-none"
          />

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleAnalyzePaste}
              className="px-4 py-2 rounded-md text-xs font-medium bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:opacity-90 whitespace-nowrap"
            >
              Analyser
            </button>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
          {errorMsg}
        </div>
      )}

      {importedCount !== null && (
        <div className="p-3 rounded-md border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span className="tabular-nums">
            {importedCount} {importedCount > 1 ? 'pages importées' : 'page importée'}.
          </span>
        </div>
      )}

      {/* Aperçu arborescent & destination */}
      {preview && (
        <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Aperçu
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {preview.stats.documents} {preview.stats.documents > 1 ? 'documents' : 'document'} ·{' '}
                {preview.stats.databases} {preview.stats.databases > 1 ? 'bases' : 'base'} ·{' '}
                {preview.stats.blocks} {preview.stats.blocks > 1 ? 'blocs' : 'bloc'} ·{' '}
                {preview.stats.rows} {preview.stats.rows > 1 ? 'lignes' : 'ligne'}
                {preview.stats.relations > 0 && (
                  <> · {preview.stats.relations} {preview.stats.relations > 1 ? 'relations' : 'relation'}</>
                )}
                {preview.stats.linkedRowPages > 0 && (
                  <> · {preview.stats.linkedRowPages} {preview.stats.linkedRowPages > 1 ? 'fiches liées' : 'fiche liée'}</>
                )}
                {preview.stats.pageLinks > 0 && (
                  <> · {preview.stats.pageLinks} {preview.stats.pageLinks > 1 ? 'liens internes' : 'lien interne'}</>
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={targetParentId}
                onChange={(e) => setTargetParentId(e.target.value)}
                aria-label="Emplacement de destination"
                className="h-8 max-w-[220px] px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 focus:outline-none truncate"
              >
                <option value="">Racine de l’espace</option>
                {targetOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {'— '.repeat(opt.depth)}
                    {opt.title}
                  </option>
                ))}
              </select>

              <button
                type="button"
                disabled={importing || preview.pages.length === 0}
                onClick={() => void handleConfirmImport()}
                className="px-4 py-2 rounded-md text-xs font-medium bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:opacity-90 disabled:opacity-40 whitespace-nowrap shrink-0"
              >
                {importing ? 'Importation...' : 'Importer'}
              </button>
            </div>
          </div>

          {preview.warnings.length > 0 && (
            <div className="text-xs text-amber-700 dark:text-amber-400 space-y-1">
              {preview.warnings.map((w, i) => (
                <p key={i}>{w}</p>
              ))}
            </div>
          )}

          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
            {preview.pages.map((p) => {
              const depth = p.depth ?? 0;
              return (
                <div
                  key={p.tempId}
                  className="py-2 flex items-center justify-between gap-3 text-sm"
                  style={{ paddingLeft: `${depth * 18}px` }}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    {depth > 0 && (
                      <CornerDownRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 shrink-0" />
                    )}
                    {p.type === 'database' ? (
                      <Table2 className="w-4 h-4 text-slate-400 shrink-0" />
                    ) : (
                      <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                    <span className="truncate text-slate-800 dark:text-slate-200">{p.title}</span>
                  </span>
                  <span className="text-xs text-slate-500 tabular-nums shrink-0">
                    {p.type === 'database'
                      ? `${p.rows?.length ?? 0} ${(p.rows?.length ?? 0) > 1 ? 'lignes' : 'ligne'}`
                      : `${p.blocks.length} ${p.blocks.length > 1 ? 'blocs' : 'bloc'}`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
