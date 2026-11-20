import { useMemo, useState } from 'react';
import { CalendarPlus, Check, Copy, ExternalLink, ListChecks, Search, Users, X } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { IMPRO_COL_IDS, IMPRO_DB_IDS } from '../utils/improCsvLoader';

export function ImproDetailPanel() {
  const {
    rowsByPage,
    improModel,
    improDetailTarget,
    openImproDetail,
    closeImproDetail,
    selectPage,
    updateDatabaseRow,
    prefillSeanceFromGroup,
    navigateToPrepare,
    navigateToTimeline,
  } = useWorkspace();

  const [editingBlock, setEditingBlock] = useState<string | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');
  const [subTab, setSubTab] = useState<'done' | 'never' | 'sessions'>('done');
  const [neverEtapeFilter, setNeverEtapeFilter] = useState('');

  const targetRow = useMemo(() => {
    if (!improDetailTarget) return null;
    return (rowsByPage[improDetailTarget.pageId] ?? []).find(
      (r) => r.id === improDetailTarget.rowId
    );
  }, [improDetailTarget, rowsByPage]);

  if (!improDetailTarget || !improModel.ready || !targetRow) return null;

  const { pageId, rowId } = improDetailTarget;

  const toggleRelationId = (colId: string, targetId: string) => {
    const raw = targetRow.cells[colId];
    const current = Array.isArray(raw) ? raw.map(String) : [];
    const next = current.includes(targetId)
      ? current.filter((id) => id !== targetId)
      : [...current, targetId];
    updateDatabaseRow(pageId, rowId, { ...targetRow.cells, [colId]: next });
  };

  const resetPicker = (blockName: string) => {
    setPickerQuery('');
    setEditingBlock((prev) => (prev === blockName ? null : blockName));
  };

  const renderHeader = (kindLabel: string, title: string, nameColId: string) => (
    <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 space-y-2 shrink-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-500 dark:text-slate-400">{kindLabel}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => selectPage(pageId)}
            className="h-7 px-2 rounded text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1 whitespace-nowrap"
          >
            <ExternalLink className="w-3 h-3" />
            <span>Base</span>
          </button>
          <button
            type="button"
            onClick={closeImproDetail}
            aria-label="Fermer la fiche"
            className="w-7 h-7 rounded flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <input
        type="text"
        value={String(targetRow.cells[nameColId] ?? title)}
        onChange={(e) =>
          updateDatabaseRow(pageId, rowId, { ...targetRow.cells, [nameColId]: e.target.value })
        }
        aria-label={`Nom ${kindLabel.toLowerCase()}`}
        className="w-full bg-transparent font-display text-lg font-semibold text-slate-950 dark:text-white focus:outline-none border-b border-transparent focus:border-slate-300 dark:focus:border-slate-700 pb-0.5"
      />
    </div>
  );

  // 1. FICHE EXERCICE
  if (pageId === IMPRO_DB_IDS.exercices) {
    const ex = improModel.exerciseById.get(rowId);
    if (!ex) return null;

    const participantStats = new Map<string, { count: number; lastDate: string }>();
    for (const s of ex.sessions) {
      for (const pid of s.participantIds) {
        const cur = participantStats.get(pid) ?? { count: 0, lastDate: '' };
        cur.count += 1;
        if (!cur.lastDate || s.date > cur.lastDate) cur.lastDate = s.date;
        participantStats.set(pid, cur);
      }
    }

    const q = pickerQuery.trim().toLowerCase();
    const filteredSeances = improModel.seances.filter(
      (s) => !q || s.nom.toLowerCase().includes(q) || s.date.includes(q)
    );

    return (
      <aside
        aria-label="Fiche exercice"
        className="w-full lg:w-[400px] xl:w-[430px] shrink-0 border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex flex-col max-h-[75vh] lg:max-h-none lg:h-full"
      >
        {renderHeader('Exercice', ex.nom, IMPRO_COL_IDS.exercices.nom)}

        <div className="flex-1 overflow-y-auto p-4 space-y-5 text-sm">
          <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono tabular-nums">
            <span>{ex.usageCount} séances</span>
            {ex.plannedCount > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-amber-600 dark:text-amber-400">{ex.plannedCount} prévues</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span>{ex.groupIds.length} groupes</span>
            <span aria-hidden="true">·</span>
            <span>{ex.participantIds.length} participants</span>
            {ex.lastDate && (
              <>
                <span aria-hidden="true">·</span>
                <span>Dernière : {ex.lastDate}</span>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigateToPrepare({ addExerciseIds: [ex.id] })}
              className="h-7 px-2.5 rounded bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-xs font-medium flex items-center gap-1 whitespace-nowrap"
            >
              <CalendarPlus className="w-3 h-3" />
              <span>Ajouter à Préparer</span>
            </button>
            <button
              type="button"
              onClick={() => navigateToTimeline({ mode: 'chronology', exerciseId: ex.id })}
              className="h-7 px-2.5 rounded border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 whitespace-nowrap"
            >
              Chronologie
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-700 dark:text-slate-300">
            {(
              [
                { colId: IMPRO_COL_IDS.exercices.check1, label: '1', checked: ex.check1 },
                { colId: IMPRO_COL_IDS.exercices.check2, label: '2', checked: ex.check2 },
                { colId: IMPRO_COL_IDS.exercices.checkV, label: 'V', checked: ex.checkV },
              ] as const
            ).map((item) => (
              <label key={item.colId} className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={(e) =>
                    updateDatabaseRow(pageId, rowId, {
                      ...targetRow.cells,
                      [item.colId]: e.target.checked,
                    })
                  }
                  className="w-3.5 h-3.5 rounded accent-slate-900 dark:accent-slate-100"
                />
                <span className="font-mono font-medium">{item.label}</span>
              </label>
            ))}
          </div>

          {(ex.etapes.length > 0 || ex.tags.length > 0) && (
            <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
              {ex.etapes.length > 0 && <div>Étape : {ex.etapes.join(', ')}</div>}
              {ex.tags.length > 0 && <div>Tags : {ex.tags.join(', ')}</div>}
            </div>
          )}

          <div className="space-y-1">
            <label
              htmlFor="impro-ex-desc"
              className="block text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              Description
            </label>
            <textarea
              id="impro-ex-desc"
              rows={3}
              value={String(targetRow.cells[IMPRO_COL_IDS.exercices.description] ?? '')}
              onChange={(e) =>
                updateDatabaseRow(pageId, rowId, {
                  ...targetRow.cells,
                  [IMPRO_COL_IDS.exercices.description]: e.target.value,
                })
              }
              placeholder="Aucune note"
              className="w-full rounded border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 px-2.5 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-slate-400"
            />
          </div>

          {/* Groupes déduits */}
          <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800/80">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Groupes déduits ({ex.groupIds.length})
            </div>
            {ex.groupIds.length === 0 ? (
              <p className="text-xs text-slate-400">Aucun groupe</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {ex.groupIds.map((gid) => {
                  const g = improModel.groupById.get(gid);
                  return (
                    <button
                      key={gid}
                      type="button"
                      onClick={() => openImproDetail(IMPRO_DB_IDS.groupes, gid)}
                      className="px-2 py-1 rounded border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      {g?.nom ?? gid}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Participants déduits */}
          <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800/80">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Participants déduits ({ex.participantIds.length})
            </div>
            {ex.participantIds.length === 0 ? (
              <p className="text-xs text-slate-400">Aucun participant</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80 border border-slate-200 dark:border-slate-800 rounded">
                {ex.participantIds.map((pid) => {
                  const p = improModel.participantById.get(pid);
                  const st = participantStats.get(pid);
                  return (
                    <button
                      key={pid}
                      type="button"
                      onClick={() => openImproDetail(IMPRO_DB_IDS.participants, pid)}
                      className="w-full px-2.5 py-1.5 flex items-center justify-between gap-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-900"
                    >
                      <span className="text-slate-800 dark:text-slate-200 truncate">
                        {p?.displayLabel ?? pid}
                      </span>
                      <span className="font-mono tabular-nums text-slate-400 shrink-0">
                        {st?.count ?? 1}×{st?.lastDate ? ` · ${st.lastDate}` : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Séances liées */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Séances ({ex.sessions.length})
              </span>
              <button
                type="button"
                onClick={() => resetPicker('ex_seances')}
                className="text-xs text-slate-600 dark:text-slate-300 hover:underline"
              >
                {editingBlock === 'ex_seances' ? 'Terminer' : 'Modifier'}
              </button>
            </div>

            {editingBlock === 'ex_seances' && (
              <div className="p-2 rounded border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={pickerQuery}
                    onChange={(e) => setPickerQuery(e.target.value)}
                    placeholder="Chercher une séance..."
                    className="w-full h-7 pl-7 pr-2 text-xs rounded border border-slate-200 dark:border-slate-700 bg-transparent focus:outline-none"
                  />
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {filteredSeances.map((s) => {
                    const checked = ex.seanceIds.includes(s.id);
                    return (
                      <label
                        key={s.id}
                        className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer py-0.5"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleRelationId(IMPRO_COL_IDS.exercices.seances, s.id)}
                          className="w-3.5 h-3.5 accent-slate-900 dark:accent-slate-100"
                        />
                        <span className="font-mono tabular-nums text-slate-400 shrink-0">
                          {s.date || '—'}
                        </span>
                        <span className="truncate">{s.nom}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {ex.sessions.length === 0 ? (
              <p className="text-xs text-slate-400">Aucune séance enregistrée</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80 border border-slate-200 dark:border-slate-800 rounded">
                {ex.sessions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => openImproDetail(IMPRO_DB_IDS.seances, s.id)}
                    className="w-full px-2.5 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-900 space-y-0.5"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                        {s.nom}
                      </span>
                      <span className="font-mono tabular-nums text-slate-500 shrink-0">
                        {s.date || '—'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {s.groupeNames.join(', ') || 'Sans groupe'} · {s.participantIds.length}{' '}
                      participants
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </aside>
    );
  }

  // 2. FICHE SÉANCE
  if (pageId === IMPRO_DB_IDS.seances) {
    const sea = improModel.seanceById.get(rowId);
    if (!sea) return null;

    const q = pickerQuery.trim().toLowerCase();
    const filteredExos = improModel.exercises.filter(
      (e) =>
        !q ||
        e.nom.toLowerCase().includes(q) ||
        e.etapes.some((et) => et.toLowerCase().includes(q))
    );
    const filteredPars = improModel.participants.filter(
      (p) => !q || p.displayLabel.toLowerCase().includes(q)
    );

    return (
      <aside
        aria-label="Fiche séance"
        className="w-full lg:w-[400px] xl:w-[430px] shrink-0 border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex flex-col max-h-[75vh] lg:max-h-none lg:h-full"
      >
        {renderHeader('Séance', sea.nom, IMPRO_COL_IDS.seances.nom)}

        <div className="flex-1 overflow-y-auto p-4 space-y-5 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigateToPrepare({ seanceId: sea.id })}
              className="h-7 px-2.5 rounded bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-xs font-medium flex items-center gap-1 whitespace-nowrap"
            >
              <ListChecks className="w-3 h-3" />
              <span>Ouvrir dans Préparer</span>
            </button>
            <button
              type="button"
              onClick={() => navigateToPrepare({ duplicateFromId: sea.id })}
              className="h-7 px-2.5 rounded border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 flex items-center gap-1 whitespace-nowrap"
            >
              <Copy className="w-3 h-3" />
              <span>Dupliquer</span>
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <label
                htmlFor="impro-sea-date"
                className="block text-xs font-medium text-slate-500 dark:text-slate-400"
              >
                Date
              </label>
              <input
                id="impro-sea-date"
                type="date"
                value={String(targetRow.cells[IMPRO_COL_IDS.seances.date] ?? '')}
                onChange={(e) =>
                  updateDatabaseRow(pageId, rowId, {
                    ...targetRow.cells,
                    [IMPRO_COL_IDS.seances.date]: e.target.value,
                  })
                }
                className="w-full h-8 px-2 rounded border border-slate-200 dark:border-slate-800 bg-transparent font-mono text-xs tabular-nums focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="impro-sea-statut"
                className="block text-xs font-medium text-slate-500 dark:text-slate-400"
              >
                Statut
              </label>
              <select
                id="impro-sea-statut"
                value={sea.status}
                onChange={(e) =>
                  updateDatabaseRow(pageId, rowId, {
                    ...targetRow.cells,
                    [IMPRO_COL_IDS.seances.statut]: e.target.value,
                  })
                }
                className="w-full h-8 px-2 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs focus:outline-none"
              >
                <option value="Réalisée">Réalisée</option>
                <option value="Préparée">Préparée</option>
              </select>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="impro-sea-grp"
                className="block text-xs font-medium text-slate-500 dark:text-slate-400"
              >
                Groupe
              </label>
              <select
                id="impro-sea-grp"
                value={sea.groupeIds[0] ?? ''}
                onChange={(e) =>
                  updateDatabaseRow(pageId, rowId, {
                    ...targetRow.cells,
                    [IMPRO_COL_IDS.seances.groupe]: e.target.value ? [e.target.value] : [],
                  })
                }
                className="w-full h-8 px-2 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs focus:outline-none"
              >
                <option value="">Aucun</option>
                {improModel.groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nom}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="impro-sea-notes"
              className="block text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              Notes
            </label>
            <textarea
              id="impro-sea-notes"
              rows={2}
              value={String(targetRow.cells[IMPRO_COL_IDS.seances.notes] ?? '')}
              onChange={(e) =>
                updateDatabaseRow(pageId, rowId, {
                  ...targetRow.cells,
                  [IMPRO_COL_IDS.seances.notes]: e.target.value,
                })
              }
              placeholder="Aucune note"
              className="w-full rounded border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-slate-400"
            />
          </div>

          {sea.groupeIds.length > 0 && (
            <div className="flex items-center justify-between gap-2 px-2.5 py-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
              <span className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-slate-400" />
                <span>Membres du groupe</span>
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => prefillSeanceFromGroup(sea.id, 'merge')}
                  className="px-2 py-1 rounded text-xs font-medium bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 whitespace-nowrap"
                >
                  Pré-remplir
                </button>
                <button
                  type="button"
                  onClick={() => prefillSeanceFromGroup(sea.id, 'replace')}
                  className="px-2 py-1 rounded text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 whitespace-nowrap"
                >
                  Remplacer
                </button>
              </div>
            </div>
          )}

          {/* Participants */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Participants ({sea.participantIds.length})
              </span>
              <button
                type="button"
                onClick={() => resetPicker('sea_pars')}
                className="text-xs text-slate-600 dark:text-slate-300 hover:underline"
              >
                {editingBlock === 'sea_pars' ? 'Terminer' : 'Modifier'}
              </button>
            </div>

            {editingBlock === 'sea_pars' && (
              <div className="p-2 rounded border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={pickerQuery}
                    onChange={(e) => setPickerQuery(e.target.value)}
                    placeholder="Chercher un participant..."
                    className="w-full h-7 pl-7 pr-2 text-xs rounded border border-slate-200 dark:border-slate-700 bg-transparent focus:outline-none"
                  />
                </div>
                <div className="max-h-44 overflow-y-auto space-y-1">
                  {filteredPars.map((p) => {
                    const checked = sea.participantIds.includes(p.id);
                    return (
                      <label
                        key={p.id}
                        className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer py-0.5"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            toggleRelationId(IMPRO_COL_IDS.seances.participants, p.id)
                          }
                          className="w-3.5 h-3.5 accent-slate-900 dark:accent-slate-100"
                        />
                        <span className="truncate">{p.displayLabel}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {sea.participantIds.length === 0 ? (
              <p className="text-xs text-slate-400">Aucun participant</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {sea.participantIds.map((pid) => {
                  const p = improModel.participantById.get(pid);
                  return (
                    <button
                      key={pid}
                      type="button"
                      onClick={() => openImproDetail(IMPRO_DB_IDS.participants, pid)}
                      className="px-2 py-1 rounded border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      {p?.displayLabel ?? pid}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Déroulé / Exercices */}
          {sea.planSteps.length > 0 &&
            (sea.totalDurationMin > 0 ||
              sea.planSteps.some((st) => st.kind === 'custom' || Boolean(st.note))) && (
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Déroulé ({sea.planSteps.length})
                  </span>
                  <span className="text-xs font-mono tabular-nums text-slate-400">
                    {sea.totalDurationMin} min
                  </span>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800/80 border border-slate-200 dark:border-slate-800 rounded">
                  {sea.planSteps.map((st, idx) => {
                    const ex =
                      st.kind === 'exercise' && st.exerciceId
                        ? improModel.exerciseById.get(st.exerciceId)
                        : undefined;
                    return (
                      <div key={st.id} className="px-2.5 py-1.5 space-y-0.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-mono tabular-nums text-slate-400 shrink-0">
                              {String(idx + 1).padStart(2, '0')}.
                            </span>
                            {st.kind === 'exercise' && st.exerciceId ? (
                              <button
                                type="button"
                                onClick={() => openImproDetail(IMPRO_DB_IDS.exercices, st.exerciceId!)}
                                className="text-left font-medium text-slate-800 dark:text-slate-200 hover:underline truncate"
                              >
                                {ex?.nom ?? st.exerciceId}
                              </button>
                            ) : (
                              <span className="font-medium text-slate-700 dark:text-slate-300 truncate">
                                {st.label || 'Temps libre'}
                              </span>
                            )}
                          </div>
                          <span className="font-mono tabular-nums text-slate-400 shrink-0">
                            {st.durationMin} min
                          </span>
                        </div>
                        {st.note && (
                          <div className="pl-6 text-[11px] text-slate-500 dark:text-slate-400">
                            {st.note}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          {/* Exercices */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Exercices ({sea.exerciceIds.length})
              </span>
              <button
                type="button"
                onClick={() => resetPicker('sea_exos')}
                className="text-xs text-slate-600 dark:text-slate-300 hover:underline"
              >
                {editingBlock === 'sea_exos' ? 'Terminer' : 'Modifier'}
              </button>
            </div>

            {editingBlock === 'sea_exos' && (
              <div className="p-2 rounded border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={pickerQuery}
                    onChange={(e) => setPickerQuery(e.target.value)}
                    placeholder="Chercher un exercice..."
                    className="w-full h-7 pl-7 pr-2 text-xs rounded border border-slate-200 dark:border-slate-700 bg-transparent focus:outline-none"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {filteredExos.slice(0, 120).map((ex) => {
                    const checked = sea.exerciceIds.includes(ex.id);
                    return (
                      <label
                        key={ex.id}
                        className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer py-0.5"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleRelationId(IMPRO_COL_IDS.seances.exercices, ex.id)}
                          className="w-3.5 h-3.5 accent-slate-900 dark:accent-slate-100"
                        />
                        <span className="truncate flex-1">{ex.nom}</span>
                        {ex.etapes[0] && (
                          <span className="text-[11px] text-slate-400 shrink-0">{ex.etapes[0]}</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {sea.exerciceIds.length === 0 ? (
              <p className="text-xs text-slate-400">Aucun exercice</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80 border border-slate-200 dark:border-slate-800 rounded">
                {sea.exerciceIds.map((eid) => {
                  const ex = improModel.exerciseById.get(eid);
                  return (
                    <button
                      key={eid}
                      type="button"
                      onClick={() => openImproDetail(IMPRO_DB_IDS.exercices, eid)}
                      className="w-full px-2.5 py-1.5 flex items-center justify-between gap-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-900"
                    >
                      <span className="text-slate-800 dark:text-slate-200 truncate">
                        {ex?.nom ?? eid}
                      </span>
                      <span className="text-[11px] text-slate-400 shrink-0">
                        {ex?.etapes.join(', ') || ''}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </aside>
    );
  }

  // 3. FICHE GROUPE
  if (pageId === IMPRO_DB_IDS.groupes) {
    const grp = improModel.groupById.get(rowId);
    if (!grp) return null;

    const q = pickerQuery.trim().toLowerCase();
    const filteredPars = improModel.participants.filter(
      (p) => !q || p.displayLabel.toLowerCase().includes(q)
    );
    const filteredNever = grp.neverDoneExercises.filter(
      (e) => !neverEtapeFilter || e.etapes.includes(neverEtapeFilter)
    );

    return (
      <aside
        aria-label="Fiche groupe"
        className="w-full lg:w-[400px] xl:w-[430px] shrink-0 border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex flex-col max-h-[75vh] lg:max-h-none lg:h-full"
      >
        {renderHeader('Groupe', grp.nom, IMPRO_COL_IDS.groupes.nom)}

        <div className="flex-1 overflow-y-auto p-4 space-y-5 text-sm">
          <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono tabular-nums">
            <span>{grp.participantIds.length} membres</span>
            <span aria-hidden="true">·</span>
            <span>{grp.sessions.length} séances</span>
            <span aria-hidden="true">·</span>
            <span>{grp.attendancePct}% assiduité</span>
            <span aria-hidden="true">·</span>
            <span>{grp.coveragePct}% répertoire</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigateToPrepare({ groupId: grp.id })}
              className="h-7 px-2.5 rounded bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-xs font-medium flex items-center gap-1 whitespace-nowrap"
            >
              <CalendarPlus className="w-3 h-3" />
              <span>Préparer un atelier</span>
            </button>
            <button
              type="button"
              onClick={() => navigateToTimeline({ mode: 'matrix', groupId: grp.id })}
              className="h-7 px-2.5 rounded border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 whitespace-nowrap"
            >
              Matrice
            </button>
            <button
              type="button"
              onClick={() => navigateToTimeline({ mode: 'chronology', groupId: grp.id })}
              className="h-7 px-2.5 rounded border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 whitespace-nowrap"
            >
              Chronologie
            </button>
          </div>

          {/* Membres */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Membres ({grp.participantIds.length})
              </span>
              <button
                type="button"
                onClick={() => resetPicker('grp_pars')}
                className="text-xs text-slate-600 dark:text-slate-300 hover:underline"
              >
                {editingBlock === 'grp_pars' ? 'Terminer' : 'Modifier'}
              </button>
            </div>

            {editingBlock === 'grp_pars' && (
              <div className="p-2 rounded border border-slate-200 dark:border-slate-800 space-y-2">
                <input
                  type="text"
                  value={pickerQuery}
                  onChange={(e) => setPickerQuery(e.target.value)}
                  placeholder="Chercher..."
                  className="w-full h-7 px-2 text-xs rounded border border-slate-200 dark:border-slate-700 bg-transparent focus:outline-none"
                />
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {filteredPars.map((p) => {
                    const checked = grp.participantIds.includes(p.id);
                    return (
                      <label
                        key={p.id}
                        className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer py-0.5"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            toggleRelationId(IMPRO_COL_IDS.groupes.participants, p.id)
                          }
                          className="w-3.5 h-3.5 accent-slate-900 dark:accent-slate-100"
                        />
                        <span className="truncate">{p.displayLabel}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-1.5">
              {grp.participantIds.map((pid) => {
                const p = improModel.participantById.get(pid);
                return (
                  <button
                    key={pid}
                    type="button"
                    onClick={() => openImproDetail(IMPRO_DB_IDS.participants, pid)}
                    className="px-2 py-1 rounded border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    {p?.displayLabel ?? pid}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Onglets Faits / Jamais faits / Séances */}
          <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800/80">
            <div className="flex items-center gap-1 p-1 rounded-md bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              {(
                [
                  { id: 'done', label: `Pratiqués (${grp.practicedExercises.length})` },
                  { id: 'never', label: `Jamais (${grp.neverDoneExercises.length})` },
                  { id: 'sessions', label: `Séances (${grp.sessions.length})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSubTab(tab.id)}
                  className={`flex-1 py-1 px-2 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                    subTab === tab.id
                      ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {subTab === 'done' && (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80 border border-slate-200 dark:border-slate-800 rounded max-h-80 overflow-y-auto">
                {grp.practicedExercises.length === 0 ? (
                  <p className="p-3 text-xs text-slate-400">Aucun exercice</p>
                ) : (
                  grp.practicedExercises.map((rec) => (
                    <button
                      key={rec.exerciceId}
                      type="button"
                      onClick={() => openImproDetail(IMPRO_DB_IDS.exercices, rec.exerciceId)}
                      className="w-full px-2.5 py-1.5 flex items-center justify-between gap-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-900"
                    >
                      <span className="truncate text-slate-800 dark:text-slate-200">{rec.nom}</span>
                      <span className="font-mono tabular-nums text-slate-400 shrink-0">
                        {rec.count}× · {rec.lastDate || '—'}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}

            {subTab === 'never' && (
              <div className="space-y-2">
                <select
                  value={neverEtapeFilter}
                  onChange={(e) => setNeverEtapeFilter(e.target.value)}
                  aria-label="Filtrer par étape"
                  className="w-full h-8 px-2 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs"
                >
                  <option value="">Toutes les étapes</option>
                  {improModel.allEtapes.map((et) => (
                    <option key={et} value={et}>
                      {et}
                    </option>
                  ))}
                </select>
                <div className="divide-y divide-slate-100 dark:divide-slate-800/80 border border-slate-200 dark:border-slate-800 rounded max-h-72 overflow-y-auto">
                  {filteredNever.slice(0, 150).map((ex) => (
                    <button
                      key={ex.id}
                      type="button"
                      onClick={() => openImproDetail(IMPRO_DB_IDS.exercices, ex.id)}
                      className="w-full px-2.5 py-1.5 flex items-center justify-between gap-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-900"
                    >
                      <span className="truncate text-slate-800 dark:text-slate-200">{ex.nom}</span>
                      <span className="text-[11px] text-slate-400 shrink-0">
                        {ex.etapes.join(', ')}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {subTab === 'sessions' && (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80 border border-slate-200 dark:border-slate-800 rounded max-h-80 overflow-y-auto">
                {grp.sessions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => openImproDetail(IMPRO_DB_IDS.seances, s.id)}
                    className="w-full px-2.5 py-1.5 flex items-center justify-between gap-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-900"
                  >
                    <span className="truncate text-slate-800 dark:text-slate-200">{s.nom}</span>
                    <span className="font-mono tabular-nums text-slate-400 shrink-0">
                      {s.date || '—'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </aside>
    );
  }

  // 4. FICHE PARTICIPANT
  if (pageId === IMPRO_DB_IDS.participants) {
    const par = improModel.participantById.get(rowId);
    if (!par) return null;

    const filteredNever = par.neverDoneExercises.filter(
      (e) => !neverEtapeFilter || e.etapes.includes(neverEtapeFilter)
    );

    return (
      <aside
        aria-label="Fiche participant"
        className="w-full lg:w-[400px] xl:w-[430px] shrink-0 border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex flex-col max-h-[75vh] lg:max-h-none lg:h-full"
      >
        {renderHeader('Participant', par.displayLabel, IMPRO_COL_IDS.participants.nom)}

        <div className="flex-1 overflow-y-auto p-4 space-y-5 text-sm">
          <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono tabular-nums">
            <span>{par.presenceCount} présences</span>
            <span aria-hidden="true">·</span>
            <span>{par.attendancePct}% assiduité</span>
            <span aria-hidden="true">·</span>
            <span>{par.doneExercises.length} faits</span>
            <span aria-hidden="true">·</span>
            <span>{par.neverDoneExercises.length} jamais faits</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigateToTimeline({ mode: 'participant', participantId: par.id })}
              className="h-7 px-2.5 rounded border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 whitespace-nowrap"
            >
              Bilan complet
            </button>
            {par.groupeIds[0] && (
              <button
                type="button"
                onClick={() => navigateToPrepare({ groupId: par.groupeIds[0] })}
                className="h-7 px-2.5 rounded border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 whitespace-nowrap"
              >
                Préparer groupe
              </button>
            )}
          </div>

          {/* Groupes */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Groupe</span>
              <button
                type="button"
                onClick={() => resetPicker('par_grps')}
                className="text-xs text-slate-600 dark:text-slate-300 hover:underline"
              >
                {editingBlock === 'par_grps' ? 'Terminer' : 'Modifier'}
              </button>
            </div>

            {editingBlock === 'par_grps' ? (
              <div className="p-2 rounded border border-slate-200 dark:border-slate-800 space-y-1">
                {improModel.groups.map((g) => {
                  const checked = par.groupeIds.includes(g.id);
                  return (
                    <label
                      key={g.id}
                      className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer py-0.5"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleRelationId(IMPRO_COL_IDS.participants.groupe, g.id)}
                        className="w-3.5 h-3.5 accent-slate-900 dark:accent-slate-100"
                      />
                      <span>{g.nom}</span>
                    </label>
                  );
                })}
              </div>
            ) : par.groupeIds.length === 0 ? (
              <p className="text-xs text-slate-400">Aucun groupe</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {par.groupeIds.map((gid) => {
                  const g = improModel.groupById.get(gid);
                  return (
                    <button
                      key={gid}
                      type="button"
                      onClick={() => openImproDetail(IMPRO_DB_IDS.groupes, gid)}
                      className="px-2 py-1 rounded border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      {g?.nom ?? gid}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Onglets Faits / Jamais faits / Séances */}
          <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800/80">
            <div className="flex items-center gap-1 p-1 rounded-md bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              {(
                [
                  { id: 'done', label: `Faits (${par.doneExercises.length})` },
                  { id: 'never', label: `Jamais (${par.neverDoneExercises.length})` },
                  { id: 'sessions', label: `Séances (${par.sessions.length})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSubTab(tab.id)}
                  className={`flex-1 py-1 px-2 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                    subTab === tab.id
                      ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {subTab === 'done' && (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80 border border-slate-200 dark:border-slate-800 rounded max-h-80 overflow-y-auto">
                {par.doneExercises.length === 0 ? (
                  <p className="p-3 text-xs text-slate-400">Aucun exercice fait</p>
                ) : (
                  par.doneExercises.map((rec) => (
                    <button
                      key={rec.exerciceId}
                      type="button"
                      onClick={() => openImproDetail(IMPRO_DB_IDS.exercices, rec.exerciceId)}
                      className="w-full px-2.5 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-900 space-y-0.5"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-medium text-slate-900 dark:text-slate-100 truncate flex items-center gap-1.5">
                          <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span className="truncate">{rec.nom}</span>
                        </span>
                        <span className="font-mono tabular-nums text-slate-400 shrink-0">
                          {rec.count}× · {rec.lastDate || '—'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {rec.sessions.map((s) => s.nom).join(', ')}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}

            {subTab === 'never' && (
              <div className="space-y-2">
                <select
                  value={neverEtapeFilter}
                  onChange={(e) => setNeverEtapeFilter(e.target.value)}
                  aria-label="Filtrer par étape"
                  className="w-full h-8 px-2 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs"
                >
                  <option value="">Toutes les étapes</option>
                  {improModel.allEtapes.map((et) => (
                    <option key={et} value={et}>
                      {et}
                    </option>
                  ))}
                </select>
                <div className="divide-y divide-slate-100 dark:divide-slate-800/80 border border-slate-200 dark:border-slate-800 rounded max-h-72 overflow-y-auto">
                  {filteredNever.slice(0, 150).map((ex) => (
                    <button
                      key={ex.id}
                      type="button"
                      onClick={() => openImproDetail(IMPRO_DB_IDS.exercices, ex.id)}
                      className="w-full px-2.5 py-1.5 flex items-center justify-between gap-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-900"
                    >
                      <span className="truncate text-slate-800 dark:text-slate-200">{ex.nom}</span>
                      <span className="text-[11px] text-slate-400 shrink-0">
                        {ex.etapes.join(', ')}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {subTab === 'sessions' && (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80 border border-slate-200 dark:border-slate-800 rounded max-h-80 overflow-y-auto">
                {par.sessions.length === 0 ? (
                  <p className="p-3 text-xs text-slate-400">Aucune séance</p>
                ) : (
                  par.sessions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => openImproDetail(IMPRO_DB_IDS.seances, s.id)}
                      className="w-full px-2.5 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-900 space-y-0.5"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                          {s.nom}
                        </span>
                        <span className="font-mono tabular-nums text-slate-500 shrink-0">
                          {s.date || '—'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {s.groupeNames.join(', ') || 'Sans groupe'} · {s.exerciceIds.length} exercices
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </aside>
    );
  }

  return null;
}
