import { useState } from 'react';
import { FileText, RotateCcw, Table2, Trash2 } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';

export function TrashView() {
  const { pages, restoreFromTrash, deletePermanently } = useWorkspace();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const trashed = pages.filter((p) => p.isTrashed);

  return (
    <div className="max-w-3xl mx-auto px-6 sm:px-10 py-10 space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
          Corbeille
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 tabular-nums">
          {trashed.length} {trashed.length > 1 ? 'éléments' : 'élément'}
        </p>
      </div>

      {trashed.length === 0 ? (
        <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-8 text-center text-sm text-slate-500 dark:text-slate-400">
          Corbeille vide
        </div>
      ) : (
        <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
          {trashed.map((page) => (
            <div
              key={page.id}
              className="px-4 py-3 flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {page.type === 'database' ? (
                  <Table2 className="w-4 h-4 text-slate-400 shrink-0" />
                ) : (
                  <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                )}
                <span className="text-sm text-slate-900 dark:text-slate-100 truncate">
                  {page.title || 'Sans titre'}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void restoreFromTrash(page.id)}
                  className="px-2.5 py-1.5 rounded text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1 whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Restaurer</span>
                </button>

                {confirmId === page.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        void deletePermanently(page.id);
                        setConfirmId(null);
                      }}
                      className="px-2.5 py-1.5 rounded text-xs font-medium bg-red-600 text-white hover:bg-red-700 whitespace-nowrap"
                    >
                      Confirmer
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(null)}
                      className="px-2 py-1.5 rounded text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
                    >
                      Annuler
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmId(page.id)}
                    aria-label={`Supprimer définitivement ${page.title || 'Sans titre'}`}
                    className="px-2.5 py-1.5 rounded text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-1 whitespace-nowrap"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Supprimer</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
