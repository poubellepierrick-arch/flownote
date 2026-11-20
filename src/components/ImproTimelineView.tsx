import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpDown,
  CalendarPlus,
  Check,
  Copy,
  GripVertical,
  ListChecks,
  RotateCcw,
  Search,
  UserCheck,
  X,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useColumnDrag } from '../hooks/useColumnDrag';
import { mergeColumnOrder, reorderIds } from '../utils/columnOrder';
import { IMPRO_COL_IDS, IMPRO_DB_IDS } from '../utils/improCsvLoader';
import {
  computeGroupExerciseMatrix,
  getGroupMemberIds,
  type ImproSessionSummary,
} from '../utils/improEngine';

type TimelineMode = 'chronology' | 'matrix' | 'participant';
type GroupByMode = 'flat' | 'month' | 'group';
type StatusFilter = 'all' | 'Réalisée' | 'Préparée';

const MONTH_NAMES_FR = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
];

function formatMonthLabel(isoDate: string): string {
  if (!isoDate || isoDate.length < 7) return 'Sans date';
  const year = isoDate.slice(0, 4);
  const monthIdx = Number(isoDate.slice(5, 7)) - 1;
  const monthName = MONTH_NAMES_FR[monthIdx];
  return monthName ? `${monthName} ${year}` : isoDate.slice(0, 7);
}

export function ImproTimelineView() {
  const {
    rowsByPage,
    improModel,
    improLoading,
    improError,
    openImproDetail,
    addDatabaseRow,
    loadImproDatabases,
    toggleSeanceStatus,
    toggleSeanceParticipant,
    timelinePreset,
    clearTimelinePreset,
    navigateToPrepare,
    tableColumnOrders,
    setTableColumnOrder,
  } = useWorkspace();

  const [mode, setMode] = useState<TimelineMode>('chronology');
  const [groupBy, setGroupBy] = useState<GroupByMode>('flat');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [groupId, setGroupId] = useState('');
  const [participantId, setParticipantId] = useState('');
  const [exerciseId, setExerciseId] = useState('');
  const [etapeFilter, setEtapeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortDesc, setSortDesc] = useState(true);

  // Pointage rapide en ligne sur une séance
  const [attendanceOpenId, setAttendanceOpenId] = useState<string | null>(null);
  const [attendanceShowAllForId, setAttendanceShowAllForId] = useState<string | null>(null);

  // Options Matrice
  const [matrixGroupId, setMatrixGroupId] = useState('');
  const [matrixOnlyNever, setMatrixOnlyNever] = useState(false);

  // Formulaire en ligne de création rapide d'une séance
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newDate, setNewDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [newNom, setNewNom] = useState('');
  const [newGroupeId, setNewGroupeId] = useState('');
  const [newParticipantIds, setNewParticipantIds] = useState<string[]>([]);
  const [newExerciceIds, setNewExerciceIds] = useState<string[]>([]);
  const [newExQuery, setNewExQuery] = useState('');
  const [creating, setCreating] = useState(false);

  // Appliquer la navigation croisée entrante
  useEffect(() => {
    if (!timelinePreset) return;
    if (timelinePreset.mode) setMode(timelinePreset.mode);
    if (timelinePreset.groupId !== undefined) {
      setGroupId(timelinePreset.groupId);
      if (timelinePreset.groupId) setMatrixGroupId(timelinePreset.groupId);
    }
    if (timelinePreset.participantId !== undefined) setParticipantId(timelinePreset.participantId);
    if (timelinePreset.exerciseId !== undefined) setExerciseId(timelinePreset.exerciseId);
    if (timelinePreset.etape !== undefined) setEtapeFilter(timelinePreset.etape);
    clearTimelinePreset();
  }, [timelinePreset, clearTimelinePreset]);

  // Initialiser le groupe de matrice par défaut dès que les groupes sont prêts
  useEffect(() => {
    if (improModel.ready && !matrixGroupId && improModel.groups[0]) {
      setMatrixGroupId(groupId || improModel.groups[0].id);
    }
  }, [improModel.ready, improModel.groups, matrixGroupId, groupId]);

  const hasActiveFilters = Boolean(
    searchQuery ||
      groupId ||
      participantId ||
      exerciseId ||
      etapeFilter ||
      dateFrom ||
      dateTo ||
      statusFilter !== 'all'
  );

  const resetFilters = () => {
    setSearchQuery('');
    setGroupId('');
    setParticipantId('');
    setExerciseId('');
    setEtapeFilter('');
    setDateFrom('');
    setDateTo('');
    setStatusFilter('all');
  };

  const handleGroupChangeInForm = (nextGrpId: string) => {
    setNewGroupeId(nextGrpId);
    if (nextGrpId) {
      setNewParticipantIds(getGroupMemberIds([nextGrpId], rowsByPage));
    } else {
      setNewParticipantIds([]);
    }
  };

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    try {
      const grpName = newGroupeId ? improModel.groupById.get(newGroupeId)?.nom ?? '' : '';
      const dateLabel = newDate
        ? `${newDate.slice(8, 10)}/${newDate.slice(5, 7)}/${newDate.slice(0, 4)}`
        : '';
      const fallbackName = [dateLabel, grpName].filter(Boolean).join(' ') || 'Nouvelle séance';
      const createdId = await addDatabaseRow(IMPRO_DB_IDS.seances, {
        [IMPRO_COL_IDS.seances.nom]: newNom.trim() || fallbackName,
        [IMPRO_COL_IDS.seances.date]: newDate,
        [IMPRO_COL_IDS.seances.statut]: 'Réalisée',
        [IMPRO_COL_IDS.seances.groupe]: newGroupeId ? [newGroupeId] : [],
        [IMPRO_COL_IDS.seances.participants]: newParticipantIds,
        [IMPRO_COL_IDS.seances.exercices]: newExerciceIds,
      });
      setShowCreateForm(false);
      setNewNom('');
      setNewGroupeId('');
      setNewParticipantIds([]);
      setNewExerciceIds([]);
      setNewExQuery('');
      if (createdId) {
        openImproDetail(IMPRO_DB_IDS.seances, createdId);
      }
    } finally {
      setCreating(false);
    }
  };

  const filteredSeances = useMemo(() => {
    if (!improModel.ready) return [];
    const q = searchQuery.trim().toLowerCase();

    const list = improModel.seances.filter((s) => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (groupId && !s.groupeIds.includes(groupId)) return false;
      if (participantId && !s.participantIds.includes(participantId)) return false;
      if (exerciseId && !s.exerciceIds.includes(exerciseId)) return false;
      if (dateFrom && (!s.date || s.date < dateFrom)) return false;
      if (dateTo && (!s.date || s.date > dateTo)) return false;
      if (etapeFilter) {
        const matchesEtape = s.exerciceIds.some((eid) =>
          improModel.exerciseById.get(eid)?.etapes.includes(etapeFilter)
        );
        if (!matchesEtape) return false;
      }
      if (q) {
        const hay = [
          s.nom,
          s.date,
          s.status,
          ...s.groupeNames,
          ...s.participantNames,
          ...s.exerciceNames,
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (!sortDesc) {
      return [...list].sort(
        (a, b) => a.date.localeCompare(b.date) || a.nom.localeCompare(b.nom, 'fr')
      );
    }
    return list;
  }, [
    improModel,
    statusFilter,
    groupId,
    participantId,
    exerciseId,
    etapeFilter,
    dateFrom,
    dateTo,
    searchQuery,
    sortDesc,
  ]);

  const groupedSeances = useMemo(() => {
    if (groupBy === 'flat') return [{ key: 'all', label: '', items: filteredSeances }];

    const buckets = new Map<string, { label: string; items: ImproSessionSummary[] }>();
    for (const s of filteredSeances) {
      if (groupBy === 'month') {
        const key = s.date ? s.date.slice(0, 7) : 'sans-date';
        const label = formatMonthLabel(s.date);
        const cur = buckets.get(key) ?? { label, items: [] };
        cur.items.push(s);
        buckets.set(key, cur);
      } else {
        const key = s.groupeIds[0] ?? 'sans-groupe';
        const label = s.groupeNames[0] ?? 'Sans groupe';
        const cur = buckets.get(key) ?? { label, items: [] };
        cur.items.push(s);
        buckets.set(key, cur);
      }
    }
    const entries = Array.from(buckets.entries()).map(([key, v]) => ({ key, ...v }));
    if (groupBy === 'group') {
      entries.sort((a, b) => a.label.localeCompare(b.label, 'fr'));
    }
    return entries;
  }, [filteredSeances, groupBy]);

  const timelineStats = useMemo(() => {
    const exIds = new Set<string>();
    const parIds = new Set<string>();
    for (const s of filteredSeances) {
      s.exerciceIds.forEach((id) => exIds.add(id));
      s.participantIds.forEach((id) => parIds.add(id));
    }
    return {
      seanceCount: filteredSeances.length,
      exerciseCount: exIds.size,
      participantCount: parIds.size,
    };
  }, [filteredSeances]);

  const selectedParticipant = participantId
    ? improModel.participantById.get(participantId) ?? null
    : null;

  const participantDirectory = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return improModel.participants.filter((p) => {
      if (groupId && !p.groupeIds.includes(groupId)) return false;
      if (q) {
        const hay = `${p.displayLabel} ${p.groupeNames.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [improModel.participants, groupId, searchQuery]);

  // Liste des participants proposée dans le filtre (priorise le groupe si sélectionné)
  const filterParticipantOptions = useMemo(() => {
    if (!groupId) return improModel.participants;
    const inGroup = improModel.participants.filter((p) => p.groupeIds.includes(groupId));
    return inGroup.length > 0 ? inGroup : improModel.participants;
  }, [improModel.participants, groupId]);

  const matrix = useMemo(
    () =>
      computeGroupExerciseMatrix(improModel, {
        groupId: matrixGroupId || undefined,
        etapeFilter: etapeFilter || undefined,
        searchQuery,
        onlyNeverDoneByGroup: matrixOnlyNever,
      }),
    [improModel, matrixGroupId, etapeFilter, searchQuery, matrixOnlyNever]
  );

  const MATRIX_ORDER_KEY = 'timeline_matrix';
  const matrixDefaultColIds = useMemo(
    () => ['__ex__', '__done__', ...matrix.participants.map((p) => p.id)],
    [matrix.participants]
  );
  const matrixOrderedColIds = useMemo(
    () => mergeColumnOrder(matrixDefaultColIds, tableColumnOrders[MATRIX_ORDER_KEY]),
    [matrixDefaultColIds, tableColumnOrders]
  );
  const matrixDrag = useColumnDrag((sourceId, targetId, position) => {
    const next = reorderIds(matrixOrderedColIds, sourceId, targetId, position);
    if (next !== matrixOrderedColIds) setTableColumnOrder(MATRIX_ORDER_KEY, next);
  });
  const matrixParticipantById = useMemo(
    () => new Map(matrix.participants.map((p) => [p.id, p])),
    [matrix.participants]
  );

  const DIR_ORDER_KEY = 'timeline_participants';
  const dirDefaultCols = useMemo(
    () => [
      { id: 'nom', label: 'Participant', align: 'left' as const },
      { id: 'groupe', label: 'Groupe', align: 'left' as const },
      { id: 'presences', label: 'Présences', align: 'right' as const },
      { id: 'assiduite', label: 'Assiduité', align: 'right' as const },
      { id: 'faits', label: 'Faits', align: 'right' as const },
      { id: 'jamais', label: 'Jamais faits', align: 'right' as const },
    ],
    []
  );
  const dirOrderedColIds = useMemo(
    () =>
      mergeColumnOrder(
        dirDefaultCols.map((c) => c.id),
        tableColumnOrders[DIR_ORDER_KEY]
      ),
    [dirDefaultCols, tableColumnOrders]
  );
  const dirOrderedCols = useMemo(() => {
    const map = new Map(dirDefaultCols.map((c) => [c.id, c]));
    return dirOrderedColIds
      .map((id) => map.get(id))
      .filter((c): c is (typeof dirDefaultCols)[number] => Boolean(c));
  }, [dirDefaultCols, dirOrderedColIds]);
  const dirDrag = useColumnDrag((sourceId, targetId, position) => {
    const next = reorderIds(dirOrderedColIds, sourceId, targetId, position);
    if (next !== dirOrderedColIds) setTableColumnOrder(DIR_ORDER_KEY, next);
  });

  if (improLoading && !improModel.ready) {
    return (
      <div className="max-w-5xl mx-auto px-6 sm:px-10 py-10 space-y-4">
        <div className="h-7 w-48 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
        <div className="h-10 w-full rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
        <div className="h-64 w-full rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse" />
      </div>
    );
  }

  if (!improModel.ready) {
    return (
      <div className="max-w-xl mx-auto px-6 py-20 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold text-slate-950 dark:text-white">
          Écosystème Impro
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {improError
            ? improError
            : 'Chargez les 4 bases (Exercices, Séances, Groupes, Participants) pour activer la chronologie.'}
        </p>
        <button
          type="button"
          onClick={() => void loadImproDatabases()}
          className="px-4 py-2 rounded-md text-xs font-medium bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:opacity-90 whitespace-nowrap"
        >
          Charger les 4 bases impro
        </button>
      </div>
    );
  }

  const formExQ = newExQuery.trim().toLowerCase();
  const formExercises = improModel.exercises.filter(
    (e) =>
      !formExQ ||
      e.nom.toLowerCase().includes(formExQ) ||
      e.etapes.some((et) => et.toLowerCase().includes(formExQ))
  );

  const renderSessionCard = (s: ImproSessionSummary) => {
    const isAttendanceOpen = attendanceOpenId === s.id;
    const showAllMembers = attendanceShowAllForId === s.id;
    const groupMembers =
      s.groupeIds.length > 0 ? getGroupMemberIds(s.groupeIds, rowsByPage) : [];
    const candidateIds = new Set([...groupMembers, ...s.participantIds]);
    const attendancePool = showAllMembers
      ? improModel.participants
      : improModel.participants.filter((p) => candidateIds.has(p.id));

    return (
      <div
        key={s.id}
        className="p-4 hover:bg-slate-50/70 dark:hover:bg-slate-900/40 transition-colors space-y-2.5"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex flex-wrap items-baseline gap-2.5 min-w-0">
            <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
              {s.date || 'Sans date'}
            </span>
            <button
              type="button"
              onClick={() => openImproDetail(IMPRO_DB_IDS.seances, s.id)}
              className="text-sm font-semibold text-slate-950 dark:text-white hover:underline text-left"
            >
              {s.nom}
            </button>
            {s.groupeIds.map((gid) => {
              const g = improModel.groupById.get(gid);
              return (
                <button
                  key={gid}
                  type="button"
                  onClick={() => openImproDetail(IMPRO_DB_IDS.groupes, gid)}
                  className="text-left text-xs text-slate-600 dark:text-slate-300 hover:underline"
                >
                  · {g?.nom ?? gid}
                </button>
              );
            })}
            <span
              className={`text-xs font-medium ${
                s.status === 'Préparée'
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              · {s.status}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {s.exerciceIds.length} exos · {s.participantIds.length} présents
              {s.totalDurationMin > 0 ? ` · ${s.totalDurationMin} min` : ''}
            </span>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setAttendanceOpenId((prev) => (prev === s.id ? null : s.id))}
                className={`h-7 px-2 rounded border text-xs flex items-center gap-1 whitespace-nowrap transition-colors ${
                  isAttendanceOpen
                    ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <UserCheck className="w-3 h-3" />
                <span>Pointage</span>
              </button>

              <button
                type="button"
                onClick={() => navigateToPrepare({ seanceId: s.id })}
                className="h-7 px-2 rounded border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1 whitespace-nowrap"
              >
                <ListChecks className="w-3 h-3" />
                <span>Préparer</span>
              </button>

              <button
                type="button"
                onClick={() => navigateToPrepare({ duplicateFromId: s.id })}
                aria-label={`Dupliquer ${s.nom}`}
                title="Dupliquer cette séance"
                className="w-7 h-7 rounded border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"
              >
                <Copy className="w-3 h-3" />
              </button>

              {s.status === 'Préparée' && (
                <button
                  type="button"
                  onClick={() => toggleSeanceStatus(s.id)}
                  className="h-7 px-2 rounded bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-xs font-medium whitespace-nowrap"
                >
                  Marquer réalisée
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Tiroir de pointage rapide en ligne */}
        {isAttendanceOpen && (
          <div className="p-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 space-y-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-300">
                Pointage rapide ({s.participantIds.length} présents)
              </span>
              <button
                type="button"
                onClick={() =>
                  setAttendanceShowAllForId((prev) => (prev === s.id ? null : s.id))
                }
                className="text-slate-600 dark:text-slate-300 hover:underline whitespace-nowrap"
              >
                {showAllMembers ? 'Membres du groupe' : 'Tous les participants'}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {attendancePool.length === 0 ? (
                <span className="text-xs text-slate-400">
                  Aucun participant lié à ce groupe. Cliquez sur Tous les participants.
                </span>
              ) : (
                attendancePool.map((p) => {
                  const present = s.participantIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleSeanceParticipant(s.id, p.id)}
                      className={`px-2 py-1 rounded border text-xs transition-colors whitespace-nowrap ${
                        present
                          ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100 font-medium'
                          : 'bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      {p.displayLabel}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Quoi : Exercices */}
        {s.exerciceIds.length > 0 && (
          <div className="text-xs text-slate-700 dark:text-slate-300 flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span className="text-slate-400 shrink-0">Exercices :</span>
            {s.exerciceIds.map((eid, idx) => {
              const ex = improModel.exerciseById.get(eid);
              return (
                <span key={eid} className="inline-flex items-center">
                  <button
                    type="button"
                    onClick={() => openImproDetail(IMPRO_DB_IDS.exercices, eid)}
                    className={`text-left hover:underline ${
                      exerciseId === eid ? 'font-semibold text-slate-950 dark:text-white' : ''
                    }`}
                  >
                    {ex?.nom ?? eid}
                  </button>
                  {idx < s.exerciceIds.length - 1 && (
                    <span className="text-slate-300 dark:text-slate-700 ml-1.5">·</span>
                  )}
                </span>
              );
            })}
          </div>
        )}

        {/* Qui : Participants */}
        {s.participantIds.length > 0 && (
          <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span className="shrink-0">Participants :</span>
            {s.participantIds.map((pid, idx) => {
              const p = improModel.participantById.get(pid);
              return (
                <span key={pid} className="inline-flex items-center">
                  <button
                    type="button"
                    onClick={() => openImproDetail(IMPRO_DB_IDS.participants, pid)}
                    className={`text-left hover:text-slate-900 dark:hover:text-white hover:underline ${
                      participantId === pid ? 'font-semibold text-slate-950 dark:text-white' : ''
                    }`}
                  >
                    {p?.displayLabel ?? pid}
                  </button>
                  {idx < s.participantIds.length - 1 && (
                    <span className="text-slate-300 dark:text-slate-700 ml-1.5">,</span>
                  )}
                </span>
              );
            })}
          </div>
        )}

        {s.notes && (
          <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
            Notes : {s.notes}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
      {/* En-tête + Mode + Action */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums flex flex-wrap items-center gap-2">
            <span>{improModel.exercises.length} exercices</span>
            <span aria-hidden="true">·</span>
            <span>{improModel.realizedSeances.length} réalisées</span>
            {improModel.plannedSeances.length > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span>{improModel.plannedSeances.length} préparées</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span>{improModel.groups.length} groupes</span>
            <span aria-hidden="true">·</span>
            <span>{improModel.participants.length} participants</span>
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-950 dark:text-white">
            Chronologie
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setMode('chronology')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                mode === 'chronology'
                  ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Qui · Quoi · Quand
            </button>
            <button
              type="button"
              onClick={() => setMode('matrix')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                mode === 'matrix'
                  ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Matrice
            </button>
            <button
              type="button"
              onClick={() => setMode('participant')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                mode === 'participant'
                  ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Par participant
            </button>
          </div>

          <button
            type="button"
            onClick={() => navigateToPrepare({ groupId: groupId || undefined })}
            className="h-9 px-3.5 rounded-md text-xs font-medium border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900 flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <ListChecks className="w-3.5 h-3.5" />
            <span>Préparer</span>
          </button>

          <button
            type="button"
            onClick={() => setShowCreateForm((v) => !v)}
            className="h-9 px-3.5 rounded-md text-xs font-medium bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:opacity-90 flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            {showCreateForm ? <X className="w-3.5 h-3.5" /> : <CalendarPlus className="w-3.5 h-3.5" />}
            <span>{showCreateForm ? 'Fermer' : 'Nouvelle séance'}</span>
          </button>
        </div>
      </div>

      {/* Formulaire en ligne : Nouvelle séance avec pré-remplissage par groupe */}
      {showCreateForm && (
        <form
          onSubmit={(e) => void handleCreateSession(e)}
          className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label
                htmlFor="new-sea-date"
                className="block text-xs font-medium text-slate-600 dark:text-slate-400"
              >
                Date
              </label>
              <input
                id="new-sea-date"
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                required
                className="w-full h-8 px-2.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-xs tabular-nums focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="new-sea-grp"
                className="block text-xs font-medium text-slate-600 dark:text-slate-400"
              >
                Groupe
              </label>
              <select
                id="new-sea-grp"
                value={newGroupeId}
                onChange={(e) => handleGroupChangeInForm(e.target.value)}
                className="w-full h-8 px-2.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs focus:outline-none"
              >
                <option value="">Choisir un groupe...</option>
                {improModel.groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nom}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="new-sea-nom"
                className="block text-xs font-medium text-slate-600 dark:text-slate-400"
              >
                Nom de séance
              </label>
              <input
                id="new-sea-nom"
                type="text"
                value={newNom}
                onChange={(e) => setNewNom(e.target.value)}
                placeholder="Auto si vide"
                className="w-full h-8 px-2.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-600 dark:text-slate-400">
                  Participants ({newParticipantIds.length})
                </span>
                {newGroupeId && (
                  <button
                    type="button"
                    onClick={() => handleGroupChangeInForm(newGroupeId)}
                    className="text-slate-600 dark:text-slate-300 hover:underline"
                  >
                    Pré-remplir le groupe
                  </button>
                )}
              </div>
              <div className="max-h-36 overflow-y-auto p-2 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 grid grid-cols-2 gap-1">
                {improModel.participants.map((p) => {
                  const checked = newParticipantIds.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer truncate"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setNewParticipantIds((prev) =>
                            checked ? prev.filter((id) => id !== p.id) : [...prev, p.id]
                          )
                        }
                        className="w-3.5 h-3.5 accent-slate-900 dark:accent-slate-100 shrink-0"
                      />
                      <span className="truncate">{p.displayLabel}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs gap-2">
                <span className="font-medium text-slate-600 dark:text-slate-400">
                  Exercices ({newExerciceIds.length})
                </span>
                <input
                  type="text"
                  value={newExQuery}
                  onChange={(e) => setNewExQuery(e.target.value)}
                  placeholder="Filtrer exercices..."
                  className="h-6 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs focus:outline-none"
                />
              </div>
              <div className="max-h-36 overflow-y-auto p-2 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 space-y-1">
                {formExercises.slice(0, 100).map((ex) => {
                  const checked = newExerciceIds.includes(ex.id);
                  return (
                    <label
                      key={ex.id}
                      className="flex items-center justify-between gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setNewExerciceIds((prev) =>
                              checked ? prev.filter((id) => id !== ex.id) : [...prev, ex.id]
                            )
                          }
                          className="w-3.5 h-3.5 accent-slate-900 dark:accent-slate-100 shrink-0"
                        />
                        <span className="truncate">{ex.nom}</span>
                      </span>
                      {ex.etapes[0] && (
                        <span className="text-[11px] text-slate-400 shrink-0">{ex.etapes[0]}</span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="h-8 px-3 rounded text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={creating}
              className="h-8 px-4 rounded bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-xs font-medium disabled:opacity-50"
            >
              {creating ? 'Création...' : 'Créer la séance'}
            </button>
          </div>
        </form>
      )}

      {/* Barre de filtres en ligne */}
      <div className="flex flex-wrap items-center gap-2 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher..."
            aria-label="Recherche globale"
            className="w-full h-8 pl-8 pr-2.5 rounded-md text-xs border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:outline-none focus:border-slate-400"
          />
        </div>

        <select
          value={groupId}
          onChange={(e) => {
            setGroupId(e.target.value);
            if (e.target.value) setMatrixGroupId(e.target.value);
          }}
          aria-label="Filtrer par groupe"
          className="flex-1 min-w-[140px] max-w-full h-8 px-2.5 rounded-md text-xs border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:outline-none"
        >
          <option value="">Tous les groupes</option>
          {improModel.groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.nom}
            </option>
          ))}
        </select>

        <select
          value={participantId}
          onChange={(e) => setParticipantId(e.target.value)}
          aria-label="Filtrer par participant"
          className="flex-1 min-w-[150px] max-w-full h-8 px-2.5 rounded-md text-xs border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:outline-none"
        >
          <option value="">Tous les participants</option>
          {filterParticipantOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.displayLabel}
            </option>
          ))}
        </select>

        <select
          value={exerciseId}
          onChange={(e) => setExerciseId(e.target.value)}
          aria-label="Filtrer par exercice"
          className="flex-1 min-w-[150px] max-w-full h-8 px-2.5 rounded-md text-xs border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:outline-none"
        >
          <option value="">Tous les exercices</option>
          {improModel.exercises.map((ex) => (
            <option key={ex.id} value={ex.id}>
              {ex.nom}
            </option>
          ))}
        </select>

        <select
          value={etapeFilter}
          onChange={(e) => setEtapeFilter(e.target.value)}
          aria-label="Filtrer par étape"
          className="flex-1 min-w-[140px] max-w-full h-8 px-2.5 rounded-md text-xs border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:outline-none"
        >
          <option value="">Toutes les étapes</option>
          {improModel.allEtapes.map((et) => (
            <option key={et} value={et}>
              {et}
            </option>
          ))}
        </select>

        {mode === 'chronology' && (
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            aria-label="Filtrer par statut"
            className="h-8 px-2.5 rounded-md text-xs border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:outline-none"
          >
            <option value="all">Tous statuts</option>
            <option value="Réalisée">Réalisées</option>
            <option value="Préparée">Préparées</option>
          </select>
        )}

        <div className="flex items-center gap-1.5 w-full sm:w-auto shrink-0">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            aria-label="Date début"
            className="flex-1 sm:w-[126px] min-w-[110px] h-8 px-2 rounded-md text-xs font-mono tabular-nums border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:outline-none"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            aria-label="Date fin"
            className="flex-1 sm:w-[126px] min-w-[110px] h-8 px-2 rounded-md text-xs font-mono tabular-nums border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:outline-none"
          />
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              aria-label="Réinitialiser les filtres"
              className="w-8 h-8 shrink-0 flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* MODE 1 : CHRONOLOGIE QUI / QUOI / QUAND */}
      {mode === 'chronology' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
            <div className="font-mono tabular-nums flex items-center gap-2">
              <span>{timelineStats.seanceCount} séances</span>
              <span aria-hidden="true">·</span>
              <span>{timelineStats.exerciseCount} exercices</span>
              <span aria-hidden="true">·</span>
              <span>{timelineStats.participantCount} participants</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 p-0.5 rounded-md bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                {(
                  [
                    { id: 'flat', label: 'Liste' },
                    { id: 'month', label: 'Par mois' },
                    { id: 'group', label: 'Par groupe' },
                  ] as const
                ).map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setGroupBy(g.id)}
                    className={`px-2 py-1 rounded text-xs whitespace-nowrap transition-colors ${
                      groupBy === g.id
                        ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white font-medium'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setSortDesc((v) => !v)}
                className="h-7 px-2 rounded border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 flex items-center gap-1 whitespace-nowrap"
              >
                <ArrowUpDown className="w-3 h-3" />
                <span>{sortDesc ? 'Récents' : 'Anciens'}</span>
              </button>
            </div>
          </div>

          {filteredSeances.length === 0 ? (
            <div className="p-8 border border-slate-200 dark:border-slate-800 rounded-lg text-center space-y-2">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Aucune séance pour ces critères
              </p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="px-3 py-1.5 rounded border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300"
                >
                  Réinitialiser
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {groupedSeances.map((bucket) => (
                <div key={bucket.key} className="space-y-1.5">
                  {bucket.label && (
                    <div className="flex items-center justify-between px-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
                      <span>{bucket.label}</span>
                      <span className="font-mono tabular-nums text-slate-400">
                        {bucket.items.length} séances
                      </span>
                    </div>
                  )}
                  <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                    {bucket.items.map((s) => renderSessionCard(s))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODE 2 : MATRICE CROISÉE PARTICIPANTS x EXERCICES */}
      {mode === 'matrix' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={matrixGroupId}
                onChange={(e) => setMatrixGroupId(e.target.value)}
                aria-label="Groupe de la matrice"
                className="h-8 px-2.5 rounded-md text-xs border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:outline-none"
              >
                <option value="">Tous les participants ({improModel.participants.length})</option>
                {improModel.groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nom} ({g.participantIds.length})
                  </option>
                ))}
              </select>

              <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer px-2">
                <input
                  type="checkbox"
                  checked={matrixOnlyNever}
                  onChange={(e) => setMatrixOnlyNever(e.target.checked)}
                  className="w-3.5 h-3.5 accent-slate-900 dark:accent-slate-100"
                />
                <span>Inédits du groupe uniquement</span>
              </label>
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-500 font-mono tabular-nums">
              <span>
                {matrix.exercises.length} exercices · {matrix.participants.length} participants
              </span>
              {matrixGroupId && (
                <button
                  type="button"
                  onClick={() => navigateToPrepare({ groupId: matrixGroupId })}
                  className="h-7 px-2.5 rounded bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-sans font-medium whitespace-nowrap"
                >
                  Préparer ce groupe
                </button>
              )}
            </div>
          </div>

          {matrix.participants.length === 0 || matrix.exercises.length === 0 ? (
            <div className="p-8 border border-slate-200 dark:border-slate-800 rounded-lg text-center text-xs text-slate-500">
              Aucune donnée pour cette sélection
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg max-h-[620px]">
              <table className="border-collapse text-left w-full">
                <thead className="sticky top-0 z-20 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-xs">
                  <tr>
                    {matrixOrderedColIds.map((colId, colIdx) => {
                      const isDragging = matrixDrag.dragColId === colId;
                      const dropSide =
                        matrixDrag.dropIndicator?.colId === colId
                          ? matrixDrag.dropIndicator.position
                          : null;
                      const indicator = dropSide ? (
                        <div
                          aria-hidden="true"
                          className={`pointer-events-none absolute top-0 bottom-0 w-0.5 bg-slate-900 dark:bg-slate-100 z-30 ${
                            dropSide === 'before' ? 'left-0' : 'right-0'
                          }`}
                        />
                      ) : null;

                      if (colId === '__ex__') {
                        return (
                          <th
                            key={colId}
                            {...matrixDrag.getThDropProps(colId)}
                            className={`group/th ${
                              colIdx === 0 ? 'sticky left-0 z-30' : 'relative'
                            } bg-slate-50 dark:bg-slate-900 px-3 py-2.5 font-medium text-slate-600 dark:text-slate-300 border-r border-slate-200 dark:border-slate-800 min-w-[220px] select-none transition-opacity ${
                              isDragging ? 'opacity-45' : ''
                            }`}
                          >
                            {indicator}
                            <div
                              {...matrixDrag.getDragHandleProps(colId)}
                              title="Glisser pour réordonner"
                              className="inline-flex items-center gap-1 cursor-grab active:cursor-grabbing"
                            >
                              <GripVertical className="w-3 h-3 shrink-0 text-slate-300 dark:text-slate-600 opacity-0 group-hover/th:opacity-100 transition-opacity" />
                              <span>Exercice</span>
                            </div>
                          </th>
                        );
                      }

                      if (colId === '__done__') {
                        return (
                          <th
                            key={colId}
                            {...matrixDrag.getThDropProps(colId)}
                            className={`group/th relative px-2.5 py-2.5 font-medium text-slate-500 text-right border-r border-slate-200 dark:border-slate-800 whitespace-nowrap select-none transition-opacity ${
                              isDragging ? 'opacity-45' : ''
                            }`}
                          >
                            {indicator}
                            <div
                              {...matrixDrag.getDragHandleProps(colId)}
                              title="Glisser pour réordonner"
                              className="inline-flex items-center justify-end gap-1 w-full cursor-grab active:cursor-grabbing"
                            >
                              <GripVertical className="w-3 h-3 shrink-0 text-slate-300 dark:text-slate-600 opacity-0 group-hover/th:opacity-100 transition-opacity" />
                              <span>Fait par</span>
                            </div>
                          </th>
                        );
                      }

                      const p = matrixParticipantById.get(colId);
                      if (!p) return null;
                      return (
                        <th
                          key={p.id}
                          {...matrixDrag.getThDropProps(p.id)}
                          className={`group/th relative px-2.5 py-2 font-medium text-slate-700 dark:text-slate-200 border-r border-slate-200 dark:border-slate-800 last:border-r-0 text-center min-w-[92px] select-none transition-opacity ${
                            isDragging ? 'opacity-45' : ''
                          }`}
                        >
                          {indicator}
                          <div
                            {...matrixDrag.getDragHandleProps(p.id)}
                            title="Glisser pour réordonner"
                            className="cursor-grab active:cursor-grabbing"
                          >
                            <button
                              type="button"
                              onClick={() => openImproDetail(IMPRO_DB_IDS.participants, p.id)}
                              className="hover:underline block w-full truncate"
                              title={p.displayLabel}
                            >
                              {p.nom}
                            </button>
                            <div className="text-[10px] font-mono tabular-nums text-slate-400 font-normal">
                              {p.presenceCount} séa.
                            </div>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  {matrix.exercises.slice(0, 150).map((ex) => {
                    const doneCount = matrix.exerciseDoneCountById.get(ex.id) ?? 0;
                    return (
                      <tr
                        key={ex.id}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-900/40"
                      >
                        {matrixOrderedColIds.map((colId, colIdx) => {
                          if (colId === '__ex__') {
                            return (
                              <td
                                key={colId}
                                className={`${
                                  colIdx === 0 ? 'sticky left-0 z-10' : ''
                                } bg-white dark:bg-slate-950 px-3 py-2 border-r border-slate-200 dark:border-slate-800`}
                              >
                                <button
                                  type="button"
                                  onClick={() => openImproDetail(IMPRO_DB_IDS.exercices, ex.id)}
                                  className="font-medium text-slate-900 dark:text-slate-100 hover:underline text-left block truncate max-w-[210px]"
                                >
                                  {ex.nom}
                                </button>
                                {ex.etapes.length > 0 && (
                                  <div className="text-[11px] text-slate-400 truncate max-w-[210px]">
                                    {ex.etapes.join(', ')}
                                  </div>
                                )}
                              </td>
                            );
                          }
                          if (colId === '__done__') {
                            return (
                              <td
                                key={colId}
                                className="px-2.5 py-2 text-right font-mono tabular-nums border-r border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 whitespace-nowrap"
                              >
                                {doneCount}/{matrix.participants.length}
                              </td>
                            );
                          }
                          const p = matrixParticipantById.get(colId);
                          if (!p) return null;
                          const cell = matrix.cellByKey.get(`${ex.id}::${p.id}`);
                          return (
                            <td
                              key={p.id}
                              className="px-2 py-2 text-center font-mono tabular-nums border-r border-slate-200 dark:border-slate-800 last:border-r-0"
                            >
                              {cell ? (
                                <span
                                  title={`${cell.count}× · dernier ${cell.lastDate || '—'}`}
                                  className="inline-flex items-center justify-center gap-0.5 text-emerald-600 dark:text-emerald-400 font-medium"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  {cell.count > 1 && <span className="text-[10px]">{cell.count}</span>}
                                </span>
                              ) : (
                                <span className="text-slate-300 dark:text-slate-700">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODE 3 : PAR PARTICIPANT (Faits vs Jamais faits) */}
      {mode === 'participant' && (
        <div className="space-y-5">
          {selectedParticipant ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2 font-mono tabular-nums">
                    <span>{selectedParticipant.groupeNames.join(', ') || 'Sans groupe'}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {selectedParticipant.presenceCount} présences ({selectedParticipant.attendancePct}%)
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{selectedParticipant.doneExercises.length} faits</span>
                    <span aria-hidden="true">·</span>
                    <span>{selectedParticipant.neverDoneExercises.length} jamais faits</span>
                  </div>
                  <h2 className="font-display text-xl font-semibold text-slate-950 dark:text-white">
                    {selectedParticipant.displayLabel}
                  </h2>
                </div>

                <div className="flex items-center gap-2">
                  {selectedParticipant.groupeIds[0] && (
                    <button
                      type="button"
                      onClick={() =>
                        navigateToPrepare({ groupId: selectedParticipant.groupeIds[0] })
                      }
                      className="h-8 px-3 rounded border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 whitespace-nowrap"
                    >
                      Préparer groupe
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      openImproDetail(IMPRO_DB_IDS.participants, selectedParticipant.id)
                    }
                    className="h-8 px-3 rounded border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 whitespace-nowrap"
                  >
                    Ouvrir fiche
                  </button>
                  <button
                    type="button"
                    onClick={() => setParticipantId('')}
                    className="h-8 px-3 rounded border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap"
                  >
                    Tous
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                {/* Exercices faits */}
                <section className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex items-center justify-between text-xs font-medium">
                    <span>Exercices faits</span>
                    <span className="font-mono tabular-nums text-slate-500">
                      {
                        selectedParticipant.doneExercises.filter(
                          (e) =>
                            (!etapeFilter || e.etapes.includes(etapeFilter)) &&
                            (!searchQuery ||
                              e.nom.toLowerCase().includes(searchQuery.trim().toLowerCase()))
                        ).length
                      }
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800/80 max-h-[540px] overflow-y-auto">
                    {selectedParticipant.doneExercises
                      .filter(
                        (e) =>
                          (!etapeFilter || e.etapes.includes(etapeFilter)) &&
                          (!searchQuery ||
                            e.nom.toLowerCase().includes(searchQuery.trim().toLowerCase()))
                      )
                      .map((rec) => (
                        <button
                          key={rec.exerciceId}
                          type="button"
                          onClick={() => openImproDetail(IMPRO_DB_IDS.exercices, rec.exerciceId)}
                          className="w-full px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-900/50 space-y-0.5"
                        >
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-medium text-slate-900 dark:text-slate-100 flex items-center gap-1.5 truncate">
                              <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              <span className="truncate">{rec.nom}</span>
                            </span>
                            <span className="font-mono tabular-nums text-slate-500 shrink-0">
                              {rec.count}× · {rec.lastDate || '—'}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {rec.sessions.map((s) => s.nom).join(', ')}
                          </div>
                        </button>
                      ))}
                  </div>
                </section>

                {/* Exercices jamais faits */}
                <section className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex items-center justify-between text-xs font-medium">
                    <span>Exercices jamais faits</span>
                    <span className="font-mono tabular-nums text-slate-500">
                      {
                        selectedParticipant.neverDoneExercises.filter(
                          (e) =>
                            (!etapeFilter || e.etapes.includes(etapeFilter)) &&
                            (!searchQuery ||
                              e.nom.toLowerCase().includes(searchQuery.trim().toLowerCase()))
                        ).length
                      }
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800/80 max-h-[540px] overflow-y-auto">
                    {selectedParticipant.neverDoneExercises
                      .filter(
                        (e) =>
                          (!etapeFilter || e.etapes.includes(etapeFilter)) &&
                          (!searchQuery ||
                            e.nom.toLowerCase().includes(searchQuery.trim().toLowerCase()))
                      )
                      .map((ex) => (
                        <button
                          key={ex.id}
                          type="button"
                          onClick={() => openImproDetail(IMPRO_DB_IDS.exercices, ex.id)}
                          className="w-full px-4 py-2 flex items-center justify-between gap-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-900/50"
                        >
                          <span className="truncate text-slate-800 dark:text-slate-200">
                            {ex.nom}
                          </span>
                          <span className="text-[11px] text-slate-400 shrink-0">
                            {ex.etapes.join(', ') || '—'}
                          </span>
                        </button>
                      ))}
                  </div>
                </section>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 text-xs font-medium text-slate-500 dark:text-slate-400">
                    {dirOrderedCols.map((col) => {
                      const isDragging = dirDrag.dragColId === col.id;
                      const dropSide =
                        dirDrag.dropIndicator?.colId === col.id
                          ? dirDrag.dropIndicator.position
                          : null;
                      return (
                        <th
                          key={col.id}
                          {...dirDrag.getThDropProps(col.id)}
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
                            {...dirDrag.getDragHandleProps(col.id)}
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
                    <th className="px-4 py-2.5 w-24" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                  {participantDirectory.map((p) => (
                    <tr
                      key={p.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-900/40 transition-colors"
                    >
                      {dirOrderedCols.map((col) => {
                        if (col.id === 'nom') {
                          return (
                            <td
                              key={col.id}
                              className="px-4 py-2 font-medium text-slate-900 dark:text-slate-100"
                            >
                              <button
                                type="button"
                                onClick={() => setParticipantId(p.id)}
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
                              className="px-4 py-2 text-xs text-slate-600 dark:text-slate-400"
                            >
                              {p.groupeNames.join(', ') || '—'}
                            </td>
                          );
                        }
                        if (col.id === 'presences') {
                          return (
                            <td
                              key={col.id}
                              className="px-4 py-2 text-right font-mono tabular-nums text-xs"
                            >
                              {p.presenceCount}
                            </td>
                          );
                        }
                        if (col.id === 'assiduite') {
                          return (
                            <td
                              key={col.id}
                              className="px-4 py-2 text-right font-mono tabular-nums text-xs text-slate-500"
                            >
                              {p.attendancePct}%
                            </td>
                          );
                        }
                        if (col.id === 'faits') {
                          return (
                            <td
                              key={col.id}
                              className="px-4 py-2 text-right font-mono tabular-nums text-xs"
                            >
                              {p.doneExercises.length}
                            </td>
                          );
                        }
                        return (
                          <td
                            key={col.id}
                            className="px-4 py-2 text-right font-mono tabular-nums text-xs text-slate-500"
                          >
                            {p.neverDoneExercises.length}
                          </td>
                        );
                      })}
                      <td className="px-4 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => openImproDetail(IMPRO_DB_IDS.participants, p.id)}
                          className="px-2 py-1 rounded text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          Fiche
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
