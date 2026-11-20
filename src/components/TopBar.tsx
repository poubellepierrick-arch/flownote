import { useEffect, useState } from 'react';
import { ChevronRight, Download, Menu, Star, Trash2 } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { isImproDatabasePage } from '../utils/improEngine';
import { exportPageToMarkdown } from '../utils/notionImporter';
import { getPageBreadcrumbs } from '../utils/treeUtils';

interface TopBarProps {
  onOpenMobileSidebar: () => void;
}

export function TopBar({ onOpenMobileSidebar }: TopBarProps) {
  const {
    pages,
    rowsByPage,
    activePage,
    mainView,
    selectPage,
    toggleFavorite,
    moveToTrash,
    pendingLocalDraftsCount,
    migrateLocalPagesToCloud,
    dismissLocalMigration,
  } = useWorkspace();

  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setConfirmDelete(false);
  }, [activePage?.id, mainView]);

  const breadcrumbs =
    mainView === 'page' && activePage ? getPageBreadcrumbs(pages, activePage.id) : [];

  const viewTitle =
    mainView === 'chronology'
      ? 'Chronologie'
      : mainView === 'prepare'
        ? 'Préparer'
        : mainView === 'stats'
          ? 'Statistiques'
          : mainView === 'import'
            ? 'Importer Notion'
            : mainView === 'trash'
              ? 'Corbeille'
              : mainView === 'search'
                ? 'Rechercher'
                : null;

  const isCoreImproDb = Boolean(activePage && isImproDatabasePage(activePage.id));

  const handleExport = () => {
    if (!activePage) return;
    const rows = rowsByPage[activePage.id] ?? [];
    const content = exportPageToMarkdown(activePage, rows);
    const ext = activePage.type === 'database' ? 'csv' : 'md';
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(activePage.title || 'page').replace(/[^a-zA-Z0-9À-ÿ_-]/g, '_')}.${ext}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="shrink-0">
      <header className="h-12 px-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileSidebar}
            aria-label="Ouvrir le menu"
            className="lg:hidden w-9 h-9 flex items-center justify-center rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
          >
            <Menu className="w-4 h-4" />
          </button>

          {viewTitle ? (
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
              {viewTitle}
            </span>
          ) : breadcrumbs.length > 0 ? (
            <nav aria-label="Fil d'Ariane" className="flex items-center gap-1 min-w-0 text-sm">
              {breadcrumbs.map((crumb, index) => {
                const isLast = index === breadcrumbs.length - 1;
                return (
                  <div key={crumb.id} className="flex items-center gap-1 min-w-0">
                    {index > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                    <button
                      type="button"
                      onClick={() => selectPage(crumb.id)}
                      className={`px-1.5 py-0.5 rounded truncate max-w-[180px] transition-colors ${
                        isLast
                          ? 'text-slate-900 dark:text-slate-100 font-medium'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                      }`}
                    >
                      {crumb.title || 'Sans titre'}
                    </button>
                  </div>
                );
              })}
            </nav>
          ) : (
            <span className="text-sm text-slate-500">Espace de travail</span>
          )}
        </div>

        {mainView === 'page' && activePage && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => void toggleFavorite(activePage.id)}
              aria-label={activePage.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              className={`h-8 px-2.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                activePage.isFavorite
                  ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Star className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Favori</span>
            </button>

            <button
              type="button"
              onClick={handleExport}
              aria-label="Exporter la page"
              className="h-8 px-2.5 rounded-md text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Exporter</span>
            </button>

            {!isCoreImproDb &&
              (confirmDelete ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      void moveToTrash(activePage.id);
                      setConfirmDelete(false);
                    }}
                    className="h-8 px-2.5 rounded-md text-xs font-medium bg-red-600 text-white hover:bg-red-700 whitespace-nowrap shrink-0"
                  >
                    Confirmer
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="h-8 px-2.5 rounded-md text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                  >
                    Annuler
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  aria-label="Supprimer la page"
                  className="h-8 px-2.5 rounded-md text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Supprimer</span>
                </button>
              ))}
          </div>
        )}
      </header>

      {pendingLocalDraftsCount > 0 && (
        <div className="px-4 py-2 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-slate-700 dark:text-slate-300">
            <span className="tabular-nums font-medium">{pendingLocalDraftsCount}</span> pages locales prêtes pour la synchronisation
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void migrateLocalPagesToCloud()}
              className="px-2.5 py-1 rounded bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-medium whitespace-nowrap"
            >
              Transférer
            </button>
            <button
              type="button"
              onClick={dismissLocalMigration}
              className="px-2.5 py-1 rounded text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              Ignorer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
