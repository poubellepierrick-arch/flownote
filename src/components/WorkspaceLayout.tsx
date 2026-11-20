import { useState } from 'react';
import { FilePlus, Table2, Upload } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { BlockEditor } from './BlockEditor';
import { DatabaseView } from './DatabaseView';
import { ImproDetailPanel } from './ImproDetailPanel';
import { ImproPrepareView } from './ImproPrepareView';
import { ImproStatsView } from './ImproStatsView';
import { ImproTimelineView } from './ImproTimelineView';
import { NotionImportView } from './NotionImportView';
import { SearchView } from './SearchView';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { TrashView } from './TrashView';

export function WorkspaceLayout() {
  const { activePage, mainView, setMainView, createPage, improDetailTarget } = useWorkspace();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <div className="h-screen flex bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden">
      <Sidebar
        isOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <TopBar onOpenMobileSidebar={() => setMobileSidebarOpen(true)} />

        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
          <main className="flex-1 min-w-0 overflow-y-auto">
            {mainView === 'chronology' ? (
              <ImproTimelineView />
            ) : mainView === 'prepare' ? (
              <ImproPrepareView />
            ) : mainView === 'stats' ? (
              <ImproStatsView />
            ) : mainView === 'import' ? (
              <NotionImportView />
            ) : mainView === 'trash' ? (
              <TrashView />
            ) : mainView === 'search' ? (
              <SearchView />
            ) : activePage ? (
              activePage.type === 'database' ? (
                <DatabaseView page={activePage} />
              ) : (
                <BlockEditor page={activePage} />
              )
            ) : (
              <div className="max-w-md mx-auto py-24 px-6 text-center space-y-5">
                <h1 className="font-display text-xl font-semibold text-slate-900 dark:text-slate-100">
                  Aucune page ouverte
                </h1>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => void createPage('document', null)}
                    className="px-4 py-2 rounded-md text-xs font-medium bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <FilePlus className="w-3.5 h-3.5" />
                    <span>Nouvelle page</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void createPage('database', null)}
                    className="px-4 py-2 rounded-md text-xs font-medium border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Table2 className="w-3.5 h-3.5" />
                    <span>Nouvelle base</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMainView('import')}
                    className="px-4 py-2 rounded-md text-xs font-medium border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Importer Notion</span>
                  </button>
                </div>
              </div>
            )}
          </main>

          {improDetailTarget && <ImproDetailPanel />}
        </div>
      </div>
    </div>
  );
}
