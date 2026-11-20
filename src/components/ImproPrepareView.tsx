import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Dices,
  ListOrdered,
  Plus,
  RotateCcw,
  Table,
  Trash2,
  Users,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import type { DatabaseSortRule, ImproPlanStep, ImproSessionStatus } from '../types/workspace';
import { generateId } from '../utils/id';
import { IMPRO_COL_IDS, IMPRO_DB_IDS } from '../utils/improCsvLoader';
import {
  computePrepareSuggestions,
  getGroupMemberIds,
  getSessionTotalDuration,
  serializeSessionPlan,
  type ImproExerciseSuggestion,
} from '../utils/improEngine';
import { ImproPrepareTable } from './ImproPrepareTable';

type PrepareSubTab = 'choose' | 'deroule';

export function ImproPrepareView() {
  const {
    rowsByPage,
    improModel,
    improLoading,
    improError,
    openImproDetail,
    addDatabaseRow,
    updateDatabaseRow,
    prepareDraft,
    clearPrepareDraft,
    navigateToTimeline,
    loadImproDatabases,
  } = useWorkspace();

  const [editingSeanceId, setEditingSeanceId] = useState<string | null>(null);
  const [nom, setNom] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [groupeId, setGroupeId] = useState('');
  const [presentIds, setPresentIds] = useState<string[]>([]);
  const [showAllParticipants, setShowAllParticipants] = useState(false);
  const [participantsExpanded, setParticipantsExpanded] = useState(true);
  const [steps, setSteps] = useState<ImproPlanStep[]>([]);
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<ImproSessionStatus>('Préparée');

  // Sous-onglets Choisir / Déroulé & tri du tableau
  const [activeSubTab, setActiveSubTab] = useState<PrepareSubTab>('choose');
  const [sortRules, setSortRules] = useState<DatabaseSortRule[]>([
    { colId: 'ded_prep_novelty', dir: 'asc' },
  ]);

  // Contrôles d'état en ligne
  const [duplicateId, setDuplicateId] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; seanceId: string } | null>(null);

  // Appliquer les directives entrantes (ouvrir une séance, dupliquer, pré-cibler un groupe ou ajouter un exercice)
  useEffect(() => {
    if (!prepareDraft || !improModel.ready) return;

    if (prepareDraft.seanceId) {
      const sea = improModel.seanceById.get(prepareDraft.seanceId);
      if (sea) {
        setEditingSeanceId(sea.id);
        setNom(sea.nom);
        setDate(sea.date || new Date().toISOString().slice(0, 10));
        setGroupeId(sea.groupeIds[0] ?? '');
        setPresentIds(sea.participantIds);
        setSteps(sea.planSteps);
        setNotes(sea.notes);
        setStatus(sea.status);
        setFeedback(null);
        if (sea.planSteps.length > 0) setActiveSubTab('deroule');
      }
    } else if (prepareDraft.duplicateFromId) {
      const src = improModel.seanceById.get(prepareDraft.duplicateFromId);
      if (src) {
        const gid = src.groupeIds[0] ?? '';
        setEditingSeanceId(null);
        setNom('');
        setDate(new Date().toISOString().slice(0, 10));
        setGroupeId(gid);
        setPresentIds(gid ? getGroupMemberIds([gid], rowsByPage) : src.participantIds);
        setSteps(
          src.planSteps.map((st, idx) => ({
            ...st,
            id: generateId(`step_${idx}`),
          }))
        );
        setNotes(src.notes);
        setStatus('Préparée');
        setFeedback(null);
        if (src.planSteps.length > 0) setActiveSubTab('deroule');
      }
    } else if (prepareDraft.groupId) {
      setEditingSeanceId(null);
      setNom('');
      setGroupeId(prepareDraft.groupId);
      setPresentIds(getGroupMemberIds([prepareDraft.groupId], rowsByPage));
      setSteps([]);
      setNotes('');
      setStatus('Préparée');
      setFeedback(null);
      setActiveSubTab('choose');
    }

    if (prepareDraft.addExerciseIds && prepareDraft.addExerciseIds.length > 0) {
      setSteps((prev) => {
        const existingExIds = new Set(prev.map((s) => s.exerciceId).filter(Boolean));
        const additions: ImproPlanStep[] = [];
        for (const eid of prepareDraft.addExerciseIds ?? []) {
          if (!existingExIds.has(eid) && improModel.exerciseById.has(eid)) {
            additions.push({
              id: generateId('step'),
              kind: 'exercise',
              exerciceId: eid,
              durationMin: 15,
              note: '',
            });
          }
        }
        return additions.length > 0 ? [...prev, ...additions] : prev;
      });
    }

    clearPrepareDraft();
  }, [prepareDraft, improModel, rowsByPage, clearPrepareDraft]);

  const handleGroupChange = (nextGid: string) => {
    setGroupeId(nextGid);
    if (nextGid) {
      setPresentIds(getGroupMemberIds([nextGid], rowsByPage));
      setShowAllParticipants(false);
    } else {
      setPresentIds([]);
    }
  };

  const handleDuplicateSelect = (srcId: string) => {
    setDuplicateId('');
    const src = improModel.seanceById.get(srcId);
    if (!src) return;
    const gid = src.groupeIds[0] ?? '';
    setEditingSeanceId(null);
    setNom('');
    setGroupeId(gid);
    setPresentIds(gid ? getGroupMemberIds([gid], rowsByPage) : src.participantIds);
    setSteps(
      src.planSteps.map((st, idx) => ({
        ...st,
        id: generateId(`step_${idx}`),
      }))
    );
    setNotes(src.notes);
    setStatus('Préparée');
    setFeedback(null);
    if (src.planSteps.length > 0) setActiveSubTab('deroule');
  };

  const handleReset = () => {
    setEditingSeanceId(null);
    setNom('');
    setDate(new Date().toISOString().slice(0, 10));
    setGroupeId('');
    setPresentIds([]);
    setSteps([]);
    setNotes('');
    setStatus('Préparée');
    setFeedback(null);
    setActiveSubTab('choose');
  };

  const toggleParticipant = (pid: string) => {
    setPresentIds((prev) =>
      prev.includes(pid) ? prev.filter((id) => id !== pid) : [...prev, pid]
    );
  };

  const groupMemberIds = useMemo(
    () => (groupeId ? new Set(getGroupMemberIds([groupeId], rowsByPage)) : new Set<string>()),
    [groupeId, rowsByPage]
  );

  const visibleParticipants = useMemo(() => {
    if (!groupeId || showAllParticipants) return improModel.participants;
    return improModel.participants.filter(
      (p) => groupMemberIds.has(p.id) || presentIds.includes(p.id)
    );
  }, [improModel.participants, groupeId, showAllParticipants, groupMemberIds, presentIds]);

  const suggestions = useMemo(
    () => computePrepareSuggestions(improModel, presentIds, groupeId || undefined),
    [improModel, presentIds, groupeId]
  );

  const selectedExIds = useMemo(
    () => new Set(steps.map((s) => s.exerciceId).filter((v): v is string => Boolean(v))),
    [steps]
  );

  const addExerciseStep = (exerciceId: string) => {
    if (selectedExIds.has(exerciceId)) return;
    setSteps((prev) => [
      ...prev,
      {
        id: generateId('step'),
        kind: 'exercise',
        exerciceId,
        durationMin: 15,
        note: '',
      },
    ]);
  };

  const toggleExerciseInPlan = (exerciceId: string) => {
    if (selectedExIds.has(exerciceId)) {
      setSteps((prev) => prev.filter((st) => st.exerciceId !== exerciceId));
    } else {
      addExerciseStep(exerciceId);
    }
  };

  const addCustomStep = () => {
    setSteps((prev) => [
      ...prev,
      {
        id: generateId('step'),
        kind: 'custom',
        label: prev.length === 0 ? 'Accueil & météo' : 'Bilan',
        durationMin: 10,
        note: '',
      },
    ]);
  };

  const removeStep = (stepId: string) => {
    setSteps((prev) => prev.filter((s) => s.id !== stepId));
  };

  const moveStep = (index: number, delta: -1 | 1) => {
    const targetIdx = index + delta;
    if (targetIdx < 0 || targetIdx >= steps.length) return;
    setSteps((prev) => {
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(targetIdx, 0, item);
      return next;
    });
  };

  const updateStep = (stepId: string, patch: Partial<ImproPlanStep>) => {
    setSteps((prev) => prev.map((s) => (s.id === stepId ? { ...s, ...patch } : s)));
  };

  const pickRandomExercise = (candidates: ImproExerciseSuggestion[]) => {
    if (candidates.length === 0) return;
    const picked = candidates[Math.floor(Math.random() * candidates.length)];
    if (picked) addExerciseStep(picked.exercise.id);
  };

  const unaddedSuggestions = useMemo(
    () => suggestions.filter((s) => !selectedExIds.has(s.exercise.id)),
    [suggestions, selectedExIds]
  );

  const totalDurationMin = useMemo(() => getSessionTotalDuration(steps), [steps]);

  const handleSave = async (targetStatus: ImproSessionStatus) => {
    if (saving) return;
    setSaving(true);
    try {
      const grpName = groupeId ? improModel.groupById.get(groupeId)?.nom ?? '' : '';
      const dateLabel = date
        ? `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`
        : '';
      const resolvedName =
        nom.trim() || [dateLabel, grpName].filter(Boolean).join(' ') || 'Atelier';

      const exerciceIds = steps
        .filter((s) => s.kind === 'exercise' && s.exerciceId)
        .map((s) => s.exerciceId!);

      const derouleJson = serializeSessionPlan(steps);

      if (editingSeanceId) {
        const existingRow = (rowsByPage[IMPRO_DB_IDS.seances] ?? []).find(
          (r) => r.id === editingSeanceId
        );
        if (existingRow) {
          updateDatabaseRow(IMPRO_DB_IDS.seances, editingSeanceId, {
            ...existingRow.cells,
            [IMPRO_COL_IDS.seances.nom]: resolvedName,
            [IMPRO_COL_IDS.seances.date]: date,
            [IMPRO_COL_IDS.seances.statut]: targetStatus,
            [IMPRO_COL_IDS.seances.groupe]: groupeId ? [groupeId] : [],
            [IMPRO_COL_IDS.seances.participants]: presentIds,
            [IMPRO_COL_IDS.seances.exercices]: exerciceIds,
            [IMPRO_COL_IDS.seances.notes]: notes.trim(),
            [IMPRO_COL_IDS.seances.deroule]: derouleJson,
          });
          setStatus(targetStatus);
          setFeedback({
            text: `Séance mise à jour · ${targetStatus}`,
            seanceId: editingSeanceId,
          });
          return;
        }
      }

      const createdId = await addDatabaseRow(IMPRO_DB_IDS.seances, {
        [IMPRO_COL_IDS.seances.nom]: resolvedName,
        [IMPRO_COL_IDS.seances.date]: date,
        [IMPRO_COL_IDS.seances.statut]: targetStatus,
        [IMPRO_COL_IDS.seances.groupe]: groupeId ? [groupeId] : [],
        [IMPRO_COL_IDS.seances.participants]: presentIds,
        [IMPRO_COL_IDS.seances.exercices]: exerciceIds,
        [IMPRO_COL_IDS.seances.notes]: notes.trim(),
        [IMPRO_COL_IDS.seances.deroule]: derouleJson,
      });

      if (createdId) {
        setEditingSeanceId(createdId);
        setNom(resolvedName);
        setStatus(targetStatus);
        setFeedback({
          text: `Séance créée · ${targetStatus}`,
          seanceId: createdId,
        });
      }
    } finally {
      setSaving(false);
    }
  };

  if (improLoading && !improModel.ready) {
    return (
      <div className="w-full px-6 py-10 space-y-4">
        <div className="h-8 w-48 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
        <div className="h-24 w-full rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
        <div className="h-72 w-full rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse" />
      </div>
    );
  }

  if (!improModel.ready) {
    return (
      <div className="max-w-xl mx-auto px-6 py-20 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold text-slate-950 dark:text-white">
          Préparer
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {improError || 'Chargez les 4 bases Impro pour préparer un atelier.'}
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

  const dupCandidates = groupeId
    ? improModel.seances.filter((s) => s.groupeIds.includes(groupeId))
    : improModel.seances;

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-5">
      {/* En-tête */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums flex flex-wrap items-center gap-2">
            <span>{editingSeanceId ? 'Édition séance' : 'Nouvel atelier'}</span>
            <span aria-hidden="true">·</span>
            <span>{status}</span>
            <span aria-hidden="true">·</span>
            <span>{presentIds.length} présents</span>
            <span aria-hidden="true">·</span>
            <span>{steps.length} séquences</span>
            <span aria-hidden="true">·</span>
            <span>{totalDurationMin} min</span>
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-950 dark:text-white">
            Préparer
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex items-center">
            <Copy className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
            <select
              value={duplicateId}
              onChange={(e) => handleDuplicateSelect(e.target.value)}
              aria-label="Dupliquer une séance passée"
              className="h-9 pl-8 pr-3 rounded-md text-xs border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none max-w-[200px]"
            >
              <option value="">Dupliquer une séance...</option>
              {dupCandidates.slice(0, 40).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.date ? `${s.date} · ` : ''}
                  {s.nom}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleReset}
            className="h-9 px-3 rounded-md text-xs border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Nouveau</span>
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave('Préparée')}
            className="h-9 px-3.5 rounded-md text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            Enregistrer (Préparée)
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave('Réalisée')}
            className="h-9 px-4 rounded-md text-xs font-medium bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Valider réalisée</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div className="px-3.5 py-2 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-slate-800 dark:text-slate-200 font-medium">{feedback.text}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openImproDetail(IMPRO_DB_IDS.seances, feedback.seanceId)}
              className="text-slate-700 dark:text-slate-300 hover:underline whitespace-nowrap"
            >
              Ouvrir fiche
            </button>
            <button
              type="button"
              onClick={() => navigateToTimeline({ groupId: groupeId || undefined })}
              className="text-slate-700 dark:text-slate-300 hover:underline whitespace-nowrap"
            >
              Voir chronologie
            </button>
          </div>
        </div>
      )}

      {/* Paramètres séance + pointage des présents */}
      <section className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label
              htmlFor="prep-date"
              className="block text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              Date
            </label>
            <input
              id="prep-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full h-8 px-2.5 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 font-mono text-xs tabular-nums focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="prep-groupe"
              className="block text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              Groupe
            </label>
            <select
              id="prep-groupe"
              value={groupeId}
              onChange={(e) => handleGroupChange(e.target.value)}
              className="w-full h-8 px-2.5 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs focus:outline-none"
            >
              <option value="">Sans groupe (libre)</option>
              {improModel.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nom} ({g.participantIds.length})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="prep-nom"
              className="block text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              Nom de séance
            </label>
            <input
              id="prep-nom"
              type="text"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="Auto si vide"
              className="w-full h-8 px-2.5 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs focus:outline-none"
            />
          </div>
        </div>

        {/* Sélection rapide des présents (recalcul en direct) */}
        <div className="space-y-2 pt-2 border-t border-slate-200/80 dark:border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <button
              type="button"
              onClick={() => setParticipantsExpanded((v) => !v)}
              className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white"
            >
              <Users className="w-3.5 h-3.5 text-slate-400" />
              <span>Présents prévus</span>
              <span className="font-mono tabular-nums text-slate-500">
                ({presentIds.length}
                {groupeId ? ` / ${groupMemberIds.size}` : ''})
              </span>
              {participantsExpanded ? (
                <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              )}
            </button>

            <div className="flex flex-wrap items-center gap-2">
              {groupeId && (
                <>
                  <button
                    type="button"
                    onClick={() => setPresentIds(getGroupMemberIds([groupeId], rowsByPage))}
                    className="text-slate-600 dark:text-slate-300 hover:underline whitespace-nowrap"
                  >
                    Membres du groupe
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAllParticipants((v) => !v);
                      setParticipantsExpanded(true);
                    }}
                    className="text-slate-600 dark:text-slate-300 hover:underline whitespace-nowrap"
                  >
                    {showAllParticipants ? 'Membres seuls' : 'Ajouter hors groupe'}
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setPresentIds([])}
                className="text-slate-500 hover:text-slate-900 dark:hover:text-white whitespace-nowrap"
              >
                Aucun
              </button>
            </div>
          </div>

          {participantsExpanded && (
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
              {visibleParticipants.map((p) => {
                const checked = presentIds.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleParticipant(p.id)}
                    className={`px-2.5 py-1 rounded text-xs border transition-colors whitespace-nowrap ${
                      checked
                        ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100 font-medium'
                        : 'bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-slate-400'
                    }`}
                  >
                    {p.displayLabel}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Sélecteur des deux sous-onglets pleine largeur */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="inline-flex items-center p-1 rounded-md bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 gap-1">
          <button
            type="button"
            onClick={() => setActiveSubTab('choose')}
            className={`h-8 px-3 rounded text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              activeSubTab === 'choose'
                ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Table className="w-3.5 h-3.5" />
            <span>Choisir</span>
            <span className="font-mono tabular-nums text-[11px] text-slate-400">
              {suggestions.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('deroule')}
            className={`h-8 px-3 rounded text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              activeSubTab === 'deroule'
                ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <ListOrdered className="w-3.5 h-3.5" />
            <span>Déroulé</span>
            <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
              {steps.length} · {totalDurationMin} min
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs">
          {activeSubTab === 'choose' ? (
            <button
              type="button"
              onClick={() => setActiveSubTab('deroule')}
              className="h-8 px-3 rounded-md border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900 whitespace-nowrap"
            >
              Voir le déroulé ({steps.length})
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setActiveSubTab('choose')}
              className="h-8 px-3 rounded-md border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900 whitespace-nowrap"
            >
              Choisir des exercices
            </button>
          )}
        </div>
      </div>

      {/* SOUS-ONGLET 1 : TABLEAU PLEINE LARGEUR */}
      {activeSubTab === 'choose' && (
        <ImproPrepareTable
          suggestions={suggestions}
          selectedExIds={selectedExIds}
          groupeId={groupeId}
          presentCount={presentIds.length}
          sortRules={sortRules}
          onSortRulesChange={setSortRules}
          onToggleExercise={toggleExerciseInPlan}
          onPickRandom={pickRandomExercise}
        />
      )}

      {/* SOUS-ONGLET 2 : DÉROULÉ PLEINE LARGEUR */}
      {activeSubTab === 'deroule' && (
        <section className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-white dark:bg-slate-950">
          <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-950 dark:text-white">Déroulé</h2>
              <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {steps.length} séquences · {totalDurationMin} min
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setActiveSubTab('choose')}
                className="h-7 px-2.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Exercices</span>
              </button>

              <button
                type="button"
                onClick={() => pickRandomExercise(unaddedSuggestions)}
                disabled={unaddedSuggestions.length === 0}
                className="h-7 px-2.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 flex items-center gap-1 whitespace-nowrap"
              >
                <Dices className="w-3.5 h-3.5" />
                <span>Tirer au sort</span>
              </button>

              <button
                type="button"
                onClick={addCustomStep}
                className="h-7 px-2.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Temps libre</span>
              </button>
            </div>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {steps.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500 space-y-3">
                <p>Aucune séquence dans le déroulé.</p>
                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveSubTab('choose')}
                    className="h-8 px-3 rounded-md bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-xs font-medium whitespace-nowrap"
                  >
                    Choisir des exercices
                  </button>
                  <button
                    type="button"
                    onClick={addCustomStep}
                    className="h-8 px-3 rounded-md border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 text-xs whitespace-nowrap"
                  >
                    + Temps libre
                  </button>
                </div>
              </div>
            ) : (
              steps.map((step, idx) => {
                const ex =
                  step.kind === 'exercise' && step.exerciceId
                    ? improModel.exerciseById.get(step.exerciceId)
                    : undefined;

                return (
                  <div key={step.id} className="p-3.5 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="font-mono text-xs tabular-nums text-slate-400 shrink-0 w-6">
                          {String(idx + 1).padStart(2, '0')}.
                        </span>

                        {step.kind === 'custom' ? (
                          <input
                            type="text"
                            value={step.label ?? ''}
                            onChange={(e) => updateStep(step.id, { label: e.target.value })}
                            aria-label="Nom du temps libre"
                            className="flex-1 min-w-[160px] max-w-md h-8 px-2.5 rounded border border-slate-200 dark:border-slate-800 bg-transparent text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              step.exerciceId &&
                              openImproDetail(IMPRO_DB_IDS.exercices, step.exerciceId)
                            }
                            className="text-left text-sm font-medium text-slate-900 dark:text-slate-100 hover:underline truncate"
                          >
                            {ex?.nom ?? step.exerciceId ?? 'Exercice'}
                          </button>
                        )}

                        {ex && (ex.etapes.length > 0 || ex.tags.length > 0) && (
                          <span className="text-xs text-slate-400 truncate hidden sm:inline">
                            · {[...ex.etapes, ...ex.tags].slice(0, 3).join(' · ')}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <div className="flex items-center gap-1 mr-1">
                          <input
                            type="number"
                            min={0}
                            max={240}
                            value={step.durationMin}
                            onChange={(e) =>
                              updateStep(step.id, {
                                durationMin: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            aria-label="Durée en minutes"
                            className="w-14 h-7 px-1.5 rounded border border-slate-200 dark:border-slate-800 bg-transparent text-right font-mono text-xs tabular-nums focus:outline-none"
                          />
                          <span className="text-[11px] text-slate-400">min</span>
                        </div>

                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => moveStep(idx, -1)}
                          aria-label="Monter"
                          className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === steps.length - 1}
                          onClick={() => moveStep(idx, 1)}
                          aria-label="Descendre"
                          className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeStep(step.id)}
                          aria-label="Retirer séquence"
                          className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {ex?.description && (
                      <p className="pl-8 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                        {ex.description}
                      </p>
                    )}

                    <div className="pl-8">
                      <input
                        type="text"
                        value={step.note}
                        onChange={(e) => updateStep(step.id, { note: e.target.value })}
                        placeholder="Variante, consigne, matériel..."
                        aria-label="Note de séquence"
                        className="w-full h-8 px-2.5 rounded border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:border-slate-400"
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2 bg-slate-50/40 dark:bg-slate-900/30">
            <label
              htmlFor="prep-notes"
              className="block text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              Notes de séance
            </label>
            <textarea
              id="prep-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Objectif de l'atelier, retours..."
              className="w-full px-3 py-2 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-slate-400"
            />

            {editingSeanceId && (
              <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500">
                <span>Modification de séance existante</span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingSeanceId(null);
                    setNom('');
                    setFeedback(null);
                  }}
                  className="hover:underline text-slate-700 dark:text-slate-300"
                >
                  Enregistrer en nouvelle séance
                </button>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
