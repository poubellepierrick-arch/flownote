import { useState } from 'react';
import {
  BarChart3,
  Calendar,
  ChevronDown,
  ChevronRight,
  Clock,
  Cloud,
  CloudOff,
  FilePlus,
  FileText,
  Layers,
  ListChecks,
  LogIn,
  LogOut,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Star,
  Sun,
  Table2,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { IMPRO_DB_IDS } from '../utils/improCsvLoader';
import { isImproDatabasePage } from '../utils/improEngine';
import { buildPageTree, type PageTreeNode } from '../utils/treeUtils';

interface SidebarProps {
  isOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({ isOpen, onCloseMobile }: SidebarProps) {
  const {
    user,
    authError,
    syncStatus,
    theme,
    toggleTheme,
    signInGoogle,
    signOutUser,
    pages,
    rowsByPage,
    activePageId,
    mainView,
    setMainView,
    selectPage,
    createPage,
    improModel,
    loadImproDatabases,
  } = useWorkspace();

  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [showOtherTools, setShowOtherTools] = useState(false);

  const nonImproPages = pages.filter((p) => !isImproDatabasePage(p.id));
  const tree = buildPageTree(nonImproPages);
  const favorites = nonImproPages.filter((p) => p.isFavorite && !p.isTrashed);
  const trashedCount = pages.filter((p) => p.isTrashed).length;

  const improDbItems = [
    { id: IMPRO_DB_IDS.exercices, label: 'Exercices', icon: Layers },
    { id: IMPRO_DB_IDS.seances, label: 'Séances', icon: Calendar },
    { id: IMPRO_DB_IDS.groupes, label: 'Groupes', icon: Table2 },
    { id: IMPRO_DB_IDS.participants, label: 'Participants', icon: Users },
  ];

  const toggleExpand = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectPage = (id: string) => {
    selectPage(id);
    onCloseMobile();
  };

  const renderTreeNode = (node: PageTreeNode) => {
    const { page, children, depth } = node;
    const isActive = mainView === 'page' && activePageId === page.id;
    const isExpanded = !collapsedIds.has(page.id);
    const hasChildren = children.length > 0;

    return (
      <div key={page.id}>
        <div
          className={`group flex items-center gap-1 rounded-md pr-1.5 py-1 text-sm transition-colors ${
            isActive
              ? 'bg-slate-200/80 dark:bg-slate-800 text-slate-950 dark:text-white font-medium'
              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
          }`}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
        >
          <button
            type="button"
            onClick={() => toggleExpand(page.id)}
            aria-label={isExpanded ? `Replier ${page.title}` : `Déplier ${page.title}`}
            className={`w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 shrink-0 ${
              hasChildren ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={() => handleSelectPage(page.id)}
            className="flex-1 min-w-0 flex items-center gap-2 text-left py-0.5 truncate"
          >
            {page.type === 'database' ? (
              <Table2 className="w-3.5 h-3.5 shrink-0 text-slate-500 dark:text-slate-400" />
            ) : (
              <FileText className="w-3.5 h-3.5 shrink-0 text-slate-500 dark:text-slate-400" />
            )}
            <span className="truncate">{page.title || 'Sans titre'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              void createPage('document', page.id);
              onCloseMobile();
            }}
            aria-label={`Ajouter une sous-page dans ${page.title || 'Sans titre'}`}
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-700 shrink-0 transition-opacity"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {hasChildren && isExpanded && (
          <div>{children.map((child) => renderTreeNode(child))}</div>
        )}
      </div>
    );
  };

  const syncLabel =
    syncStatus === 'synced'
      ? 'Synchronisé'
      : syncStatus === 'syncing'
        ? 'Synchronisation'
        : syncStatus === 'error'
          ? 'Erreur synchro'
          : 'Local';

  return (
    <>
      {isOpen && (
        <button
          type="button"
          aria-label="Fermer le menu"
          onClick={onCloseMobile}
          className="fixed inset-0 z-20 bg-slate-950/30 lg:hidden"
        />
      )}
      <aside
        aria-label="Navigation espace de travail"
        className={`fixed inset-y-0 left-0 z-30 w-64 shrink-0 flex flex-col bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-transform duration-150 lg:static lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* En-tête */}
        <div className="h-12 px-3 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 shrink-0">
          <span className="font-display font-semibold text-sm tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap">
            FlowNote
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Passer au thème clair' : 'Passer au thème sombre'}
              className="w-8 h-8 flex items-center justify-center rounded-md text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Fermer la barre latérale"
              className="lg:hidden w-8 h-8 flex items-center justify-center rounded-md text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Navigation principale : Écosystème Impro */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
          <div className="space-y-0.5">
            <div className="px-2.5 pb-1 text-xs font-medium text-slate-500 dark:text-slate-400">
              Impro
            </div>

            <button
              type="button"
              onClick={() => {
                setMainView('chronology');
                onCloseMobile();
              }}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm transition-colors whitespace-nowrap ${
                mainView === 'chronology'
                  ? 'bg-slate-200/80 dark:bg-slate-800 text-slate-950 dark:text-white font-medium'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              <span className="flex items-center gap-2">
                <Clock className="w-4 h-4 shrink-0 text-slate-500" />
                <span>Chronologie</span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMainView('prepare');
                onCloseMobile();
              }}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm transition-colors whitespace-nowrap ${
                mainView === 'prepare'
                  ? 'bg-slate-200/80 dark:bg-slate-800 text-slate-950 dark:text-white font-medium'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              <span className="flex items-center gap-2">
                <ListChecks className="w-4 h-4 shrink-0 text-slate-500" />
                <span>Préparer</span>
              </span>
              {improModel.plannedSeances.length > 0 && (
                <span className="text-xs font-mono tabular-nums text-slate-400">
                  {improModel.plannedSeances.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setMainView('stats');
                onCloseMobile();
              }}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm transition-colors whitespace-nowrap ${
                mainView === 'stats'
                  ? 'bg-slate-200/80 dark:bg-slate-800 text-slate-950 dark:text-white font-medium'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              <span className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 shrink-0 text-slate-500" />
                <span>Statistiques</span>
              </span>
            </button>

            {improDbItems.map((item) => {
              const Icon = item.icon;
              const page = pages.find((p) => p.id === item.id && !p.isTrashed);
              const count = rowsByPage[item.id]?.length ?? 0;
              const isActive = mainView === 'page' && activePageId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={!page}
                  onClick={() => {
                    if (page) handleSelectPage(page.id);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm transition-colors whitespace-nowrap disabled:opacity-45 ${
                    isActive
                      ? 'bg-slate-200/80 dark:bg-slate-800 text-slate-950 dark:text-white font-medium'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <Icon className="w-4 h-4 shrink-0 text-slate-500" />
                    <span className="truncate">{page?.title || item.label}</span>
                  </span>
                  {page && (
                    <span className="text-xs font-mono tabular-nums text-slate-400">{count}</span>
                  )}
                </button>
              );
            })}

            {!improModel.ready && (
              <div className="pt-2 px-1">
                <button
                  type="button"
                  onClick={() => void loadImproDatabases()}
                  className="w-full px-2.5 py-1.5 rounded-md text-xs font-medium bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:opacity-90"
                >
                  Charger les 4 bases
                </button>
              </div>
            )}
          </div>

          {/* Section discrète : Autres outils & pages */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <button
              type="button"
              onClick={() => setShowOtherTools((v) => !v)}
              className="w-full flex items-center justify-between px-2.5 py-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            >
              <span>Autres outils</span>
              {showOtherTools ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>

            {showOtherTools && (
              <div className="space-y-3">
                <div className="space-y-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setMainView('search');
                      onCloseMobile();
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors whitespace-nowrap ${
                      mainView === 'search'
                        ? 'bg-slate-200/80 dark:bg-slate-800 text-slate-950 dark:text-white font-medium'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <Search className="w-4 h-4 shrink-0 text-slate-500" />
                    <span>Rechercher</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMainView('import');
                      onCloseMobile();
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors whitespace-nowrap ${
                      mainView === 'import'
                        ? 'bg-slate-200/80 dark:bg-slate-800 text-slate-950 dark:text-white font-medium'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <Upload className="w-4 h-4 shrink-0 text-slate-500" />
                    <span>Importer Notion</span>
                  </button>

                  <div className="grid grid-cols-2 gap-1 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        void createPage('document', null);
                        onCloseMobile();
                      }}
                      className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
                    >
                      <FilePlus className="w-3.5 h-3.5 shrink-0" />
                      <span>Page</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void createPage('database', null);
                        onCloseMobile();
                      }}
                      className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
                    >
                      <Table2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Base</span>
                    </button>
                  </div>
                </div>

                {favorites.length > 0 && (
                  <div>
                    <div className="px-2.5 pb-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                      Favoris
                    </div>
                    <div className="space-y-0.5">
                      {favorites.map((page) => {
                        const isActive = mainView === 'page' && activePageId === page.id;
                        return (
                          <button
                            key={`fav_${page.id}`}
                            type="button"
                            onClick={() => handleSelectPage(page.id)}
                            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm text-left transition-colors ${
                              isActive
                                ? 'bg-slate-200/80 dark:bg-slate-800 text-slate-950 dark:text-white font-medium'
                                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                            }`}
                          >
                            <Star className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                            <span className="truncate">{page.title || 'Sans titre'}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {tree.length > 0 && (
                  <div>
                    <div className="px-2.5 pb-1 flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        Pages
                      </span>
                      <span className="text-xs text-slate-400 tabular-nums">
                        {nonImproPages.filter((p) => !p.isTrashed).length}
                      </span>
                    </div>
                    <div className="space-y-0.5">{tree.map((node) => renderTreeNode(node))}</div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setMainView('trash');
                    onCloseMobile();
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm transition-colors ${
                    mainView === 'trash'
                      ? 'bg-slate-200/80 dark:bg-slate-800 text-slate-950 dark:text-white font-medium'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Trash2 className="w-4 h-4 shrink-0" />
                    <span>Corbeille</span>
                  </span>
                  <span className="text-xs tabular-nums text-slate-400">{trashedCount}</span>
                </button>
              </div>
            )}
          </div>
        </nav>

        {/* Pied de barre : Synchro & Compte Firebase */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2 shrink-0">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              {syncStatus === 'syncing' ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : syncStatus === 'synced' ? (
                <Cloud className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <CloudOff className="w-3.5 h-3.5" />
              )}
              <span>{syncLabel}</span>
            </span>
            <span>Firebase</span>
          </div>

          {user ? (
            <div className="flex items-center justify-between gap-2 pt-1">
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                  {user.displayName || user.email}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void signOutUser()}
                aria-label="Déconnexion"
                className="px-2 py-1 rounded text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Quitter</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void signInGoogle()}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-medium bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:opacity-90 transition-opacity whitespace-nowrap"
            >
              <LogIn className="w-3.5 h-3.5 shrink-0" />
              <span>Connexion Google</span>
            </button>
          )}

          {authError && (
            <p className="text-xs text-red-600 dark:text-red-400 break-words">{authError}</p>
          )}
        </div>
      </aside>
    </>
  );
}
