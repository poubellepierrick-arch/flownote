import { useMemo, useState } from 'react';
import { ArrowUpDown, CalendarPlus, GripVertical, RotateCcw } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useColumnDrag } from '../hooks/useColumnDrag';
import { mergeColumnOrder, reorderIds } from '../utils/columnOrder';
import { IMPRO_DB_IDS } from '../utils/improCsvLoader';
import { computeImproStats } from '../utils/improEngine';

type PeriodPreset = 'all' | '30d' | '90d' | '12m';
type ExerciseRankTab = 'top' | 'forgotten' | 'never';
type ParticipantSortKey = 'presences' | 'attendancePct' | 'distinct' | 'nom';

function computeDateFromPreset(preset: PeriodPreset): string {
  if (preset === 'all') return '';
  const now = new Date();
  if (preset === '30d') now.setDate(now.getDate() - 30);
  else if (preset === '90d') now.setDate(now.getDate() - 90);
  else if (preset === '12m') now.setFullYear(now.getFullYear() - 1);
  return now.toISOString().slice(0, 10);
}

export function ImproStatsView() {
  const {
    improModel,
    improLoading,
    improError,
    openImproDetail,
    navigateToPrepare,
    navigateToTimeline,
    loadImproDatabases,
    tableColumnOrders,
    setTableColumnOrder,
  } = useWorkspace();

  const [groupId, setGroupId] = useState('');
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [exerciseTab, setExerciseTab] = useState<ExerciseRankTab>('top');
  const [parSortKey, setParSortKey] = useState<ParticipantSortKey>('presences');
  const [parSortAsc, setParSortAsc] = useState(false);

  const handlePresetClick = (preset: PeriodPreset) => {
    setPeriodPreset(preset);
    setDateFrom(computeDateFromPreset(preset));
    setDateTo('');
  };

  const resetFilters = () => {
    setGroupId('');
    setPeriodPreset('all');
    setDateFrom('');
    setDateTo('');
  };

  const stats = useMemo(
    () =>
      computeImproStats(improModel, {
        groupId: groupId || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }),
    [improModel, groupId, dateFrom, dateTo]
  );

  const sortedParticipants = useMemo(() => {
    const list = [...stats.participantStats];
    list.sort((a, b) => {
      let cmp = 0;
      if (parSortKey === 'presences') cmp = a.presences - b.presences;
      else if (parSortKey === 'attendancePct') cmp = a.attendancePct - b.attendancePct;
      else if (parSortKey === 'distinct') cmp = a.distinctExercisesCount - b.distinctExercisesCount;
      else cmp = a.displayLabel.localeCompare(b.displayLabel, 'fr');
      return parSortAsc ? cmp : -cmp;
    });
    return list;
  }, [stats.participantStats, parSortKey, parSortAsc]);

  const toggleParSort = (key: ParticipantSortKey) => {
    if (parSortKey === key) {
      setParSortAsc((v) => !v);
    } else {
      setParSortKey(key);
      setParSortAsc(key === 'nom');
    }
  };

  const GROUP_ORDER_KEY = 'stats_groups';
  const groupDefaultCols = useMemo(
    () => [
      { id: 'groupe', label: 'Groupe', align: 'left' as const },
      { id: 'membres', label: 'Membres', align: 'right' as const },
      { id: 'seances', label: 'Séances', align: 'right' as const },
      { id: 'moy', label: 'Moy. présents', align: 'right' as const },
      { id: 'assiduite', label: 'Assiduité', align: 'right' as const },
      { id: 'couverture', label: 'Couverture', align: 'right' as const },
      { id: 'derniere', label: 'Dernière', align: 'left' as const },
      { id: 'etapes', label: 'Étapes dominantes', align: 'left' as const },
    ],
    []
  );
  const groupOrderedColIds = useMemo(
    () =>
      mergeColumnOrder(
        groupDefaultCols.map((c) => c.id),
        tableColumnOrders[GROUP_ORDER_KEY]
      ),
    [groupDefaultCols, tableColumnOrders]
  );
  const groupOrderedCols = useMemo(() => {
    const map = new Map(groupDefaultCols.map((c) => [c.id, c]));
    return groupOrderedColIds
      .map((id) => map.get(id))
      .filter((c): c is (typeof groupDefaultCols)[number] => Boolean(c));
  }, [groupDefaultCols, groupOrderedColIds]);
  const groupDrag = useColumnDrag((sourceId, targetId, position) => {
    const next = reorderIds(groupOrderedColIds, sourceId, targetId, position);
    if (next !== groupOrderedColIds) setTableColumnOrder(GROUP_ORDER_KEY, next);
  });

  const PAR_ORDER_KEY = 'stats_participants';
  const parDefaultCols = useMemo(
    () => [
      { id: 'nom', label: 'Participant', align: 'left' as const, sortKey: 'nom' as const },
      { id: 'groupe', label: 'Groupe', align: 'left' as const, sortKey: null },
      { id: 'presences', label: 'Présences', align: 'right' as const, sortKey: 'presences' as const },
      { id: 'taux', label: 'Taux', align: 'right' as const, sortKey: 'attendancePct' as const },
      { id: 'exos', label: 'Exos', align: 'right' as const, sortKey: 'distinct' as const },
      { id: 'derniere', label: 'Dernière', align: 'right' as const, sortKey: null },
    ],
    []
  );
  const parOrderedColIds = useMemo(
    () =>
      mergeColumnOrder(
        parDefaultCols.map((c) => c.id),
        tableColumnOrders[PAR_ORDER_KEY]
      ),
    [parDefaultCols, tableColumnOrders]
  );
  const parOrderedCols = useMemo(() => {
    const map = new Map(parDefaultCols.map((c) => [c.id, c]));
    return parOrderedColIds
      .map((id) => map.get(id))
      .filter((c): c is (typeof parDefaultCols)[number] => Boolean(c));
  }, [parDefaultCols, parOrderedColIds]);
  const parDrag = useColumnDrag((sourceId, targetId, position) => {
    const next = reorderIds(parOrderedColIds, sourceId, targetId, position);
    if (next !== parOrderedColIds) setTableColumnOrder(PAR_ORDER_KEY, next);
  });

  if (improLoading && !improModel.ready) {
    return (
      <div className="w-full px-6 py-10 space-y-4">
        <div className="h-8 w-48 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!improModel.ready) {
    return (
      <div className="max-w-xl mx-auto px-6 py-20 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold text-slate-950 dark:text-white">
          Statistiques
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {improError || 'Chargez les 4 bases Impro pour consulter les statistiques.'}
        </p>
        <button
          type="button"
          onClick={() => void loadImproDatabases()}
          className="px-4 py-2 rounded-md text-xs font-medium bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 whitespace-nowrap"
        >
          Charger les 4 bases
        </button>
      </div>
    );
  }

  const hasFilters = Boolean(groupId || dateFrom || dateTo);

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
      {/* En-tête + filtres période / groupe */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums flex flex-wrap items-center gap-2">
            <span>{improModel.realizedSeances.length} séances réalisées</span>
            <span aria-hidden="true">·</span>
            <span>{improModel.plannedSeances.length} préparées</span>
            <span aria-hidden="true">·</span>
            <span>{improModel.exercises.length} exercices</span>
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-950 dark:text-white">
            Statistiques
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            {(
              [
                { id: 'all', label: 'Tout' },
                { id: '30d', label: '30 j' },
                { id: '90d', label: '90 j' },
                { id: '12m', label: '12 mois' },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handlePresetClick(p.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                  periodPreset === p.id && !dateTo
                    ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <select
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            aria-label="Filtrer par groupe"
            className="h-8 px-2.5 rounded-md text-xs border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:outline-none"
          >
            <option value="">Tous les groupes</option>
            {improModel.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nom}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setPeriodPreset('all');
              setDateFrom(e.target.value);
            }}
            aria-label="Date début"
            className="w-[126px] h-8 px-2 rounded-md text-xs font-mono tabular-nums border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:outline-none"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            aria-label="Date fin"
            className="w-[126px] h-8 px-2 rounded-md text-xs font-mono tabular-nums border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:outline-none"
          />

          {hasFilters && (
            <button
              type="button"
              onClick={resetFilters}
              aria-label="Réinitialiser filtres"
              className="w-8 h-8 flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Bandeau 4 indicateurs clés */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 space-y-1">
          <div className="text-xs text-slate-500 dark:text-slate-400">Séances réalisées</div>
          <div className="font-mono tabular-nums text-2xl font-bold text-slate-950 dark:text-white">
            {stats.summary.sessionCount}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            Moy. {stats.summary.avgPresentPerSession} présents
          </div>
        </div>

        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 space-y-1">
          <div className="text-xs text-slate-500 dark:text-slate-400">Couverture répertoire</div>
          <div className="font-mono tabular-nums text-2xl font-bold text-slate-950 dark:text-white">
            {stats.summary.coveragePct}%
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {stats.summary.activeExercisesCount} / {stats.summary.totalExercisesCount} exercices
          </div>
        </div>

        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 space-y-1">
          <div className="text-xs text-slate-500 dark:text-slate-400">Assiduité moyenne</div>
          <div className="font-mono tabular-nums text-2xl font-bold text-slate-950 dark:text-white">
            {stats.summary.avgAttendancePct}%
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {stats.participantStats.length} participants
          </div>
        </div>

        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 space-y-1">
          <div className="text-xs text-slate-500 dark:text-slate-400">Exercices jamais faits</div>
          <div className="font-mono tabular-nums text-2xl font-bold text-slate-950 dark:text-white">
            {stats.summary.neverDoneCount}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {stats.summary.neverDoneMarkedVCount} marqués V à découvrir
          </div>
        </div>
      </div>

      {/* Section 1 : Couverture par étape + Repères 1 / 2 / V */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-7 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-950 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-950 dark:text-white">
              Équilibre par étape
            </h2>
            <span className="text-xs text-slate-500 font-mono tabular-nums">
              Pratiqués / Catalogue · Usages
            </span>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {stats.etapeBreakdown.map((item) => (
              <div key={item.etape} className="px-4 py-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() =>
                      navigateToTimeline({
                        mode: 'chronology',
                        etape: item.etape === 'Sans étape' ? undefined : item.etape,
                        groupId: groupId || undefined,
                      })
                    }
                    className="font-medium text-slate-900 dark:text-slate-100 hover:underline text-left truncate"
                  >
                    {item.etape}
                  </button>
                  <div className="font-mono tabular-nums text-slate-600 dark:text-slate-400 shrink-0 flex items-center gap-2">
                    <span>
                      {item.practicedCatalog}/{item.totalCatalog} ({item.coveragePct}%)
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {item.usagesCount}× ({item.usageSharePct}%)
                    </span>
                  </div>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-slate-900 dark:bg-slate-100 transition-all"
                    style={{ width: `${item.coveragePct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="lg:col-span-5 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-950 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-950 dark:text-white">
              Repères 1 · 2 · V
            </h2>
            <span className="text-xs text-slate-500 font-mono tabular-nums">Non joués</span>
          </div>

          <div className="grid grid-cols-3 divide-x divide-slate-200 dark:divide-slate-800 border-b border-slate-200 dark:border-slate-800 text-center">
            <div className="p-3">
              <div className="text-xs text-slate-500 font-mono">1</div>
              <div className="font-mono tabular-nums text-base font-semibold text-slate-950 dark:text-white">
                {stats.markerStats.never1}/{stats.markerStats.total1}
              </div>
            </div>
            <div className="p-3">
              <div className="text-xs text-slate-500 font-mono">2</div>
              <div className="font-mono tabular-nums text-base font-semibold text-slate-950 dark:text-white">
                {stats.markerStats.never2}/{stats.markerStats.total2}
              </div>
            </div>
            <div className="p-3">
              <div className="text-xs text-slate-500 font-mono">V</div>
              <div className="font-mono tabular-nums text-base font-semibold text-slate-950 dark:text-white">
                {stats.markerStats.neverV}/{stats.markerStats.totalV}
              </div>
            </div>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800/80 max-h-64 overflow-y-auto">
            {stats.markerStats.unplayedMarkedV.length === 0 ? (
              <div className="p-4 text-xs text-slate-500 text-center">
                Tous les exercices V ont été pratiqués
              </div>
            ) : (
              stats.markerStats.unplayedMarkedV.slice(0, 30).map((ex) => (
                <div
                  key={ex.id}
                  className="px-4 py-2 flex items-center justify-between gap-2 text-xs hover:bg-slate-50/70 dark:hover:bg-slate-900/40"
                >
                  <button
                    type="button"
                    onClick={() => openImproDetail(IMPRO_DB_IDS.exercices, ex.id)}
                    className="text-left text-slate-800 dark:text-slate-200 hover:underline truncate"
                  >
                    {ex.nom}
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateToPrepare({ addExerciseIds: [ex.id] })}
                    className="text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white whitespace-nowrap shrink-0"
                  >
                    + Préparer
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Section 2 : Comparaison des groupes */}
      <section className="border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-950 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-950 dark:text-white">
            Comparaison des groupes
          </h2>
          <span className="text-xs text-slate-500 font-mono tabular-nums">
            {stats.groupComparison.length} groupes
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 text-xs font-medium text-slate-500 dark:text-slate-400">
                {groupOrderedCols.map((col) => {
                  const isDragging = groupDrag.dragColId === col.id;
                  const dropSide =
                    groupDrag.dropIndicator?.colId === col.id
                      ? groupDrag.dropIndicator.position
                      : null;
                  return (
                    <th
                      key={col.id}
                      {...groupDrag.getThDropProps(col.id)}
                      className={`group/th relative px-4 py-2.5 select-none whitespace-nowrap transition-opacity ${
                        col.align === 'right' ? 'text-right' : 'text-left'
                      } ${isDragging ? 'opacity-45' : ''}`}
                    >
                      {dropSide && (
                        <div
                          aria-hidden="true"
                          className={`pointer-events-none absolute top-0 bottom-0 w-0.5 bg-slate-900 dark:bg-slate-100 z-20 ${
                            dropSide === 'before' ? 'left-0' : 'right-0'
                          }`}
                        />
                      )}
                      <div
                        {...groupDrag.getDragHandleProps(col.id)}
                        title="Glisser pour réordonner"
                        className={`inline-flex items-center gap-1 cursor-grab active:cursor-grabbing ${
                          col.align === 'right' ? 'justify-end' : ''
                        }`}
                      >
                        <GripVertical className="w-3 h-3 shrink-0 text-slate-300 dark:text-slate-600 opacity-0 group-hover/th:opacity-100 transition-opacity" />
                        <span>{col.label}</span>
                      </div>
                    </th>
                  );
                })}
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              {stats.groupComparison.map((g) => (
                <tr key={g.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-900/40">
                  {groupOrderedCols.map((col) => {
                    if (col.id === 'groupe') {
                      return (
                        <td
                          key={col.id}
                          className="px-4 py-2.5 font-medium text-slate-900 dark:text-slate-100"
                        >
                          <button
                            type="button"
                            onClick={() => openImproDetail(IMPRO_DB_IDS.groupes, g.id)}
                            className="hover:underline text-left"
                          >
                            {g.nom}
                          </button>
                        </td>
                      );
                    }
                    if (col.id === 'membres') {
                      return (
                        <td key={col.id} className="px-4 py-2.5 text-right font-mono tabular-nums">
                          {g.memberCount}
                        </td>
                      );
                    }
                    if (col.id === 'seances') {
                      return (
                        <td key={col.id} className="px-4 py-2.5 text-right font-mono tabular-nums">
                          {g.sessionCount}
                        </td>
                      );
                    }
                    if (col.id === 'moy') {
                      return (
                        <td key={col.id} className="px-4 py-2.5 text-right font-mono tabular-nums">
                          {g.avgPresent}
                        </td>
                      );
                    }
                    if (col.id === 'assiduite') {
                      return (
                        <td key={col.id} className="px-4 py-2.5 text-right font-mono tabular-nums">
                          {g.attendancePct}%
                        </td>
                      );
                    }
                    if (col.id === 'couverture') {
                      return (
                        <td key={col.id} className="px-4 py-2.5 text-right font-mono tabular-nums">
                          {g.coveredExercisesCount} ({g.coveragePct}%)
                        </td>
                      );
                    }
                    if (col.id === 'derniere') {
                      return (
                        <td
                          key={col.id}
                          className="px-4 py-2.5 font-mono tabular-nums text-slate-500"
                        >
                          {g.lastDate || '—'}
                        </td>
                      );
                    }
                    return (
                      <td key={col.id} className="px-4 py-2.5 text-slate-600 dark:text-slate-400">
                        {g.topEtapes.join(', ') || '—'}
                      </td>
                    );
                  })}
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => navigateToTimeline({ mode: 'matrix', groupId: g.id })}
                        className="text-slate-600 dark:text-slate-300 hover:underline"
                      >
                        Matrice
                      </button>
                      <button
                        type="button"
                        onClick={() => navigateToPrepare({ groupId: g.id })}
                        className="inline-flex items-center gap-1 text-slate-900 dark:text-slate-100 font-medium hover:underline"
                      >
                        <CalendarPlus className="w-3 h-3" />
                        <span>Préparer</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 3 & 4 : Assiduité participants + Palmarès exercices */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Assiduité participants */}
        <section className="lg:col-span-7 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-950 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-950 dark:text-white">
              Assiduité des participants
            </h2>
            <span className="text-xs text-slate-500 font-mono tabular-nums">
              {sortedParticipants.length}
            </span>
          </div>

          <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                <tr>
                  {parOrderedCols.map((col, idx) => {
                    const isDragging = parDrag.dragColId === col.id;
                    const dropSide =
                      parDrag.dropIndicator?.colId === col.id
                        ? parDrag.dropIndicator.position
                        : null;
                    const padClass =
                      idx === 0 || idx === parOrderedCols.length - 1 ? 'px-4 py-2' : 'px-3 py-2';
                    return (
                      <th
                        key={col.id}
                        {...parDrag.getThDropProps(col.id)}
                        className={`group/th relative ${padClass} select-none whitespace-nowrap transition-opacity ${
                          col.align === 'right' ? 'text-right' : 'text-left'
                        } ${isDragging ? 'opacity-45' : ''}`}
                      >
                        {dropSide && (
                          <div
                            aria-hidden="true"
                            className={`pointer-events-none absolute top-0 bottom-0 w-0.5 bg-slate-900 dark:bg-slate-100 z-20 ${
                              dropSide === 'before' ? 'left-0' : 'right-0'
                            }`}
                          />
                        )}
                        <div
                          {...parDrag.getDragHandleProps(col.id)}
                          title="Glisser pour réordonner"
                          className={`inline-flex items-center gap-1 cursor-grab active:cursor-grabbing ${
                            col.align === 'right' ? 'justify-end' : ''
                          }`}
                        >
                          <GripVertical className="w-3 h-3 shrink-0 text-slate-300 dark:text-slate-600 opacity-0 group-hover/th:opacity-100 transition-opacity" />
                          {col.sortKey ? (
                            <button
                              type="button"
                              onClick={() => toggleParSort(col.sortKey!)}
                              className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                            >
                              <span>{col.label}</span>
                              <ArrowUpDown className="w-3 h-3" />
                            </button>
                          ) : (
                            <span>{col.label}</span>
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                {sortedParticipants.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-900/40">
                    {parOrderedCols.map((col, idx) => {
                      const padClass =
                        idx === 0 || idx === parOrderedCols.length - 1 ? 'px-4 py-2' : 'px-3 py-2';
                      if (col.id === 'nom') {
                        return (
                          <td
                            key={col.id}
                            className={`${padClass} font-medium text-slate-900 dark:text-slate-100`}
                          >
                            <button
                              type="button"
                              onClick={() => openImproDetail(IMPRO_DB_IDS.participants, p.id)}
                              className="hover:underline text-left"
                            >
                              {p.displayLabel}
                            </button>
                          </td>
                        );
                      }
                      if (col.id === 'groupe') {
                        return (
                          <td
                            key={col.id}
                            className={`${padClass} text-slate-500 dark:text-slate-400 truncate max-w-[130px]`}
                          >
                            {p.groupeNames.join(', ') || '—'}
                          </td>
                        );
                      }
                      if (col.id === 'presences') {
                        return (
                          <td key={col.id} className={`${padClass} text-right font-mono tabular-nums`}>
                            {p.presences}
                            {p.groupSessionsCount > 0 ? `/${p.groupSessionsCount}` : ''}
                          </td>
                        );
                      }
                      if (col.id === 'taux') {
                        return (
                          <td key={col.id} className={`${padClass} text-right font-mono tabular-nums`}>
                            {p.attendancePct}%
                          </td>
                        );
                      }
                      if (col.id === 'exos') {
                        return (
                          <td key={col.id} className={`${padClass} text-right font-mono tabular-nums`}>
                            {p.distinctExercisesCount}
                          </td>
                        );
                      }
                      return (
                        <td
                          key={col.id}
                          className={`${padClass} text-right font-mono tabular-nums text-slate-500`}
                        >
                          {p.lastDate || '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Palmarès des exercices */}
        <section className="lg:col-span-5 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-950 overflow-hidden">
          <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-2.5">
            <h2 className="text-sm font-semibold text-slate-950 dark:text-white">Exercices</h2>
            <div className="grid grid-cols-3 gap-1 p-1 rounded-md bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              {(
                [
                  { id: 'top', label: `Plus joués (${stats.topExercises.length})` },
                  { id: 'forgotten', label: `Oubliés (${stats.forgottenExercises.length})` },
                  { id: 'never', label: `Jamais (${stats.neverDoneExercises.length})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setExerciseTab(tab.id)}
                  className={`py-1 px-1.5 rounded text-[11px] font-medium whitespace-nowrap truncate transition-colors ${
                    exerciseTab === tab.id
                      ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800/80 max-h-[410px] overflow-y-auto">
            {exerciseTab === 'top' &&
              (stats.topExercises.length === 0 ? (
                <div className="p-6 text-xs text-slate-500 text-center">Aucune donnée</div>
              ) : (
                stats.topExercises.slice(0, 60).map((item) => (
                  <div
                    key={item.exercise.id}
                    className="px-4 py-2.5 flex items-center justify-between gap-2 text-xs hover:bg-slate-50/70 dark:hover:bg-slate-900/40"
                  >
                    <button
                      type="button"
                      onClick={() => openImproDetail(IMPRO_DB_IDS.exercices, item.exercise.id)}
                      className="text-left text-slate-900 dark:text-slate-100 hover:underline truncate"
                    >
                      {item.exercise.nom}
                    </button>
                    <span className="font-mono tabular-nums text-slate-500 shrink-0">
                      {item.periodCount}× · {item.lastDate || '—'}
                    </span>
                  </div>
                ))
              ))}

            {exerciseTab === 'forgotten' &&
              (stats.forgottenExercises.length === 0 ? (
                <div className="p-6 text-xs text-slate-500 text-center">Aucune donnée</div>
              ) : (
                stats.forgottenExercises.slice(0, 60).map((ex) => (
                  <div
                    key={ex.id}
                    className="px-4 py-2.5 flex items-center justify-between gap-2 text-xs hover:bg-slate-50/70 dark:hover:bg-slate-900/40"
                  >
                    <button
                      type="button"
                      onClick={() => openImproDetail(IMPRO_DB_IDS.exercices, ex.id)}
                      className="text-left text-slate-900 dark:text-slate-100 hover:underline truncate"
                    >
                      {ex.nom}
                    </button>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono tabular-nums text-slate-500">
                        {ex.lastDate || '—'}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          navigateToPrepare({
                            groupId: groupId || undefined,
                            addExerciseIds: [ex.id],
                          })
                        }
                        className="text-slate-700 dark:text-slate-300 hover:underline"
                      >
                        + Préparer
                      </button>
                    </div>
                  </div>
                ))
              ))}

            {exerciseTab === 'never' &&
              (stats.neverDoneExercises.length === 0 ? (
                <div className="p-6 text-xs text-slate-500 text-center">
                  Tout le répertoire a été pratiqué
                </div>
              ) : (
                stats.neverDoneExercises.slice(0, 80).map((ex) => {
                  const marks = [
                    ex.check1 ? '1' : '',
                    ex.check2 ? '2' : '',
                    ex.checkV ? 'V' : '',
                  ].filter(Boolean);
                  return (
                    <div
                      key={ex.id}
                      className="px-4 py-2.5 flex items-center justify-between gap-2 text-xs hover:bg-slate-50/70 dark:hover:bg-slate-900/40"
                    >
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => openImproDetail(IMPRO_DB_IDS.exercices, ex.id)}
                          className="text-left text-slate-900 dark:text-slate-100 hover:underline truncate block max-w-full"
                        >
                          {ex.nom}
                        </button>
                        {(ex.etapes.length > 0 || marks.length > 0) && (
                          <div className="text-[11px] text-slate-400 truncate">
                            {[ex.etapes.join(', '), marks.join('·')].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          navigateToPrepare({
                            groupId: groupId || undefined,
                            addExerciseIds: [ex.id],
                          })
                        }
                        className="text-slate-700 dark:text-slate-300 hover:underline whitespace-nowrap shrink-0"
                      >
                        + Préparer
                      </button>
                    </div>
                  );
                })
              ))}
          </div>
        </section>
      </div>
    </div>
  );
}
