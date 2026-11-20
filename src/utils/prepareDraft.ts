import type {
  DatabaseRow,
  DatabaseSortRule,
  ImproPlanStep,
  ImproPrepareDraftConfig,
  ImproSessionStatus,
} from '../types/workspace';
import { generateId } from './id';
import { getGroupMemberIds, type ImproEcosystemModel } from './improEngine';

export type PrepareSubTab = 'choose' | 'deroule';

export interface ImproPrepareSessionState {
  editingSeanceId: string | null;
  nom: string;
  date: string;
  groupeId: string;
  presentIds: string[];
  showAllParticipants: boolean;
  participantsExpanded: boolean;
  steps: ImproPlanStep[];
  notes: string;
  status: ImproSessionStatus;
  activeSubTab: PrepareSubTab;
  sortRules: DatabaseSortRule[];
  feedback: { text: string; seanceId?: string } | null;
}

export function createInitialPrepareSession(
  today: string = new Date().toISOString().slice(0, 10)
): ImproPrepareSessionState {
  return {
    editingSeanceId: null,
    nom: '',
    date: today,
    groupeId: '',
    presentIds: [],
    showAllParticipants: false,
    participantsExpanded: true,
    steps: [],
    notes: '',
    status: 'Préparée',
    activeSubTab: 'choose',
    sortRules: [{ colId: 'ded_prep_novelty', dir: 'asc' }],
    feedback: null,
  };
}

function appendUniqueExerciseSteps(
  prevSteps: ImproPlanStep[],
  addExerciseIds: string[],
  model: ImproEcosystemModel
): { nextSteps: ImproPlanStep[]; addedCount: number } {
  const existingExIds = new Set(prevSteps.map((s) => s.exerciceId).filter(Boolean));
  const additions: ImproPlanStep[] = [];
  for (const eid of addExerciseIds) {
    if (!existingExIds.has(eid) && model.exerciseById.has(eid)) {
      existingExIds.add(eid);
      additions.push({
        id: generateId('step'),
        kind: 'exercise',
        exerciceId: eid,
        durationMin: 15,
        note: '',
      });
    }
  }
  return {
    nextSteps: additions.length > 0 ? [...prevSteps, ...additions] : prevSteps,
    addedCount: additions.length,
  };
}

export function applyPrepareNavigation(
  current: ImproPrepareSessionState,
  config: ImproPrepareDraftConfig | undefined,
  model: ImproEcosystemModel,
  rowsByPage: Record<string, DatabaseRow[]>,
  today: string = new Date().toISOString().slice(0, 10)
): ImproPrepareSessionState {
  if (!config || !model.ready) return current;

  let next = current;
  let resetBeforeAdding = false;

  if (config.seanceId) {
    const sea = model.seanceById.get(config.seanceId);
    if (sea) {
      next = {
        ...current,
        editingSeanceId: sea.id,
        nom: sea.nom,
        date: sea.date || today,
        groupeId: sea.groupeIds[0] ?? '',
        presentIds: sea.participantIds,
        showAllParticipants: false,
        steps: sea.planSteps,
        notes: sea.notes,
        status: sea.status,
        feedback: null,
        activeSubTab: sea.planSteps.length > 0 ? 'deroule' : 'choose',
      };
      resetBeforeAdding = true;
    }
  } else if (config.duplicateFromId) {
    const src = model.seanceById.get(config.duplicateFromId);
    if (src) {
      const gid = src.groupeIds[0] ?? '';
      next = {
        ...current,
        editingSeanceId: null,
        nom: '',
        date: today,
        groupeId: gid,
        presentIds: gid ? getGroupMemberIds([gid], rowsByPage) : src.participantIds,
        showAllParticipants: false,
        steps: src.planSteps.map((st, idx) => ({
          ...st,
          id: generateId(`step_${idx}`),
        })),
        notes: src.notes,
        status: 'Préparée',
        feedback: null,
        activeSubTab: src.planSteps.length > 0 ? 'deroule' : 'choose',
      };
      resetBeforeAdding = true;
    }
  } else if (config.groupId) {
    const hasExerciseAdditions = Boolean(config.addExerciseIds && config.addExerciseIds.length > 0);
    const matchesCurrentGroup = current.groupeId === config.groupId;
    if (!hasExerciseAdditions || !matchesCurrentGroup) {
      next = {
        ...current,
        editingSeanceId: null,
        nom: '',
        date: current.date || today,
        groupeId: config.groupId,
        presentIds: getGroupMemberIds([config.groupId], rowsByPage),
        showAllParticipants: false,
        steps: [],
        notes: '',
        status: 'Préparée',
        feedback: null,
        activeSubTab: 'choose',
      };
      resetBeforeAdding = true;
    }
  }

  if (config.addExerciseIds && config.addExerciseIds.length > 0) {
    const { nextSteps, addedCount } = appendUniqueExerciseSteps(next.steps, config.addExerciseIds, model);
    next = {
      ...next,
      steps: nextSteps,
      feedback: !resetBeforeAdding
        ? {
            text:
              addedCount > 1
                ? `${addedCount} exercices ajoutés`
                : addedCount === 1
                  ? 'Exercice ajouté au déroulé'
                  : 'Déjà dans le déroulé',
          }
        : next.feedback,
    };
  }

  return next;
}
