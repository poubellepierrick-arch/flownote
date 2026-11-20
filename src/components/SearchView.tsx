import { useMemo, useState } from 'react';
import { FileText, Search, Table2 } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { searchWorkspace } from '../utils/treeUtils';

export function SearchView() {
  const { pages, rowsByPage, selectPage } = useWorkspace();
  const [query, setQuery] = useState('');

  const results = useMemo(
    () => searchWorkspace(pages, rowsByPage, query),
    [pages, rowsByPage, query]
  );

  return (
    <div className="max-w-3xl mx-auto px-6 sm:px-10 py-10 space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
          Rechercher
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 tabular-nums">
          {results.length} {results.length > 1 ? 'résultats' : 'résultat'}
        </p>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Titre, bloc ou donnée..."
          aria-label="Rechercher dans l'espace de travail"
          autoFocus
          className="w-full h-11 pl-10 pr-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-slate-400"
        />
      </div>

      {results.length === 0 ? (
        <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-8 text-center text-sm text-slate-500">
          Aucun résultat
        </div>
      ) : (
        <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
          {results.map(({ page, snippet }) => (
            <button
              key={page.id}
              type="button"
              onClick={() => selectPage(page.id)}
              className="w-full px-4 py-3 flex items-center justify-between gap-4 text-left hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {page.type === 'database' ? (
                  <Table2 className="w-4 h-4 text-slate-400 shrink-0" />
                ) : (
                  <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                )}
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                  {page.title || 'Sans titre'}
                </span>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[260px]">
                {snippet}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
