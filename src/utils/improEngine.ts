import type {
  CellValue,
  DatabaseRow,
  ImproPlanStep,
  ImproSessionStatus,
  WorkspacePage,
} from '../types/workspace';
import { IMPRO_COL_IDS, IMPRO_DB_IDS } from './improCsvLoader';

export interface ImproSessionSummary {
  id: string;
  nom: string;
  date: string;
  status: ImproSessionStatus;
  notes: string;
  planSteps: ImproPlanStep[];
  totalDurationMin: number;
  groupeIds: string[];
  groupeNames: string[];
  participantIds: string[];
  participantNames: string[];
  exerciceIds: string[];
  exerciceNames: string[];
}

export interface ImproExerciseProjection {
  id: string;
  nom: string;
  check1: boolean;
  check2: boolean;
  checkV: boolean;
  etapes: string[];
  tags: string[];
  description: string;
  seanceIds: string[];
  sessions: ImproSessionSummary[];
  plannedSessionIds: string[];
  plannedCount: number;
  groupIds: string[];
  groupNames: string[];
  participantIds: string[];
  participantNames: string[];
  lastDate: string;
  lastSessionName: string;
  usageCount: number;
}

export interface ImproParticipantExerciseRecord {
  exerciceId: string;
  nom: string;
  etapes: string[];
  tags: string[];
  count: number;
  lastDate: string;
  sessions: Array<{ id: string; nom: string; date: string; groupeNames: string[] }>;
}

export interface ImproGroupProjection {
  id: string;
  nom: string;
  participantIds: string[];
  participantNames: string[];
  seanceIds: string[];
  sessions: ImproSessionSummary[];
  plannedSessions: ImproSessionSummary[];
  practicedExercises: ImproParticipantExerciseRecord[];
  neverDoneExercises: ImproExerciseProjection[];
  lastDate: string;
  coveragePct: number;
  avgPresent: number;
  attendancePct: number;
}

export interface ImproParticipantProjection {
  id: string;
  nom: string;
  displayLabel: string;
  groupeIds: string[];
  groupeNames: string[];
  seanceIds: string[];
  sessions: ImproSessionSummary[];
  plannedSessions: ImproSessionSummary[];
  presenceCount: number;
  groupSessionsCount: number;
  attendancePct: number;
  lastDate: string;
  doneExercises: ImproParticipantExerciseRecord[];
  neverDoneExercises: ImproExerciseProjection[];
}

export interface ImproEcosystemModel {
  ready: boolean;
  exercises: ImproExerciseProjection[];
  seances: ImproSessionSummary[];
  realizedSeances: ImproSessionSummary[];
  plannedSeances: ImproSessionSummary[];
  groups: ImproGroupProjection[];
  participants: ImproParticipantProjection[];
  exerciseById: Map<string, ImproExerciseProjection>;
  seanceById: Map<string, ImproSessionSummary>;
  groupById: Map<string, ImproGroupProjection>;
  participantById: Map<string, ImproParticipantProjection>;
  allEtapes: string[];
  allTags: string[];
}

export type NoveltyBucket = 'all_new' | 'majority_new' | 'mixed' | 'all_done';

export interface ImproExerciseSuggestion {
  exercise: ImproExerciseProjection;
  neverDoneByPresentIds: string[];
  doneByPresentIds: string[];
  unseenCount: number;
  seenCount: number;
  totalPresent: number;
  unseenRatio: number;
  groupDoneCount: number;
  groupLastDate: string;
  isPlannedInGroup: boolean;
  noveltyBucket: NoveltyBucket;
}

export interface ImproMatrixCell {
  count: number;
  lastDate: string;
}

export interface ImproGroupExerciseMatrix {
  participants: ImproParticipantProjection[];
  exercises: ImproExerciseProjection[];
  cellByKey: Map<string, ImproMatrixCell>;
  exerciseDoneCountById: Map<string, number>;
}

export interface ImproStatsReport {
  summary: {
    sessionCount: number;
    activeExercisesCount: number;
    totalExercisesCount: number;
    coveragePct: number;
    avgPresentPerSession: number;
    avgAttendancePct: number;
    neverDoneCount: number;
    neverDoneMarkedVCount: number;
  };
  etapeBreakdown: Array<{
    etape: string;
    totalCatalog: number;
    practicedCatalog: number;
    coveragePct: number;
    usagesCount: number;
    usageSharePct: number;
  }>;
  markerStats: {
    total1: number;
    never1: number;
    total2: number;
    never2: number;
    totalV: number;
    neverV: number;
    unplayedMarkedV: ImproExerciseProjection[];
  };
  participantStats: Array<{
    id: string;
    displayLabel: string;
    groupeNames: string[];
    presences: number;
    groupSessionsCount: number;
    attendancePct: number;
    distinctExercisesCount: number;
    coveragePct: number;
    lastDate: string;
  }>;
  topExercises: Array<{
    exercise: ImproExerciseProjection;
    periodCount: number;
    lastDate: string;
  }>;
  forgottenExercises: ImproExerciseProjection[];
  neverDoneExercises: ImproExerciseProjection[];
  groupComparison: Array<{
    id: string;
    nom: string;
    memberCount: number;
    sessionCount: number;
    avgPresent: number;
    attendancePct: number;
    coveredExercisesCount: number;
    coveragePct: number;
    lastDate: string;
    topEtapes: string[];
  }>;
}

export function isImproDatabasePage(pageId: string): boolean {
  return (
    pageId === IMPRO_DB_IDS.exercices ||
    pageId === IMPRO_DB_IDS.seances ||
    pageId === IMPRO_DB_IDS.groupes ||
    pageId === IMPRO_DB_IDS.participants
  );
}

export function hasImproDatabasesInPages(pages: WorkspacePage[]): boolean {
  const activeIds = new Set(pages.filter((p) => !p.isTrashed).map((p) => p.id));
  return (
    activeIds.has(IMPRO_DB_IDS.exercices) &&
    activeIds.has(IMPRO_DB_IDS.seances) &&
    activeIds.has(IMPRO_DB_IDS.groupes) &&
    activeIds.has(IMPRO_DB_IDS.participants)
  );
}

export function normalizeSessionStatus(val: CellValue | undefined): ImproSessionStatus {
  const raw = String(val ?? '').trim().toLowerCase();
  if (raw === 'préparée' || raw === 'preparee' || raw === 'planifiée' || raw === 'planifiee') {
    return 'Préparée';
  }
  return 'Réalisée';
}

export function parseSessionPlan(
  raw: CellValue | undefined,
  fallbackExerciseIds: string[]
): ImproPlanStep[] {
  const steps: ImproPlanStep[] = [];
  const seenExIds = new Set<string>();

  if (typeof raw === 'string' && raw.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (let i = 0; i < parsed.length; i++) {
          const item = parsed[i];
          if (!item || typeof item !== 'object') continue;
          const kind = item.kind === 'custom' ? 'custom' : 'exercise';
          const durationNum = Number(item.durationMin);
          const durationMin = Number.isFinite(durationNum) && durationNum >= 0 ? Math.min(240, Math.round(durationNum)) : 15;
          const note = typeof item.note === 'string' ? item.note.slice(0, 240) : '';
          const id = typeof item.id === 'string' && item.id ? item.id : `step_${i}_${Date.now()}`;

          if (kind === 'custom') {
            const label = typeof item.label === 'string' && item.label.trim() ? item.label.trim().slice(0, 120) : 'Temps libre';
            steps.push({ id, kind: 'custom', label, durationMin, note });
          } else if (typeof item.exerciceId === 'string' && item.exerciceId) {
            if (!fallbackExerciseIds.includes(item.exerciceId)) continue;
            seenExIds.add(item.exerciceId);
            steps.push({
              id,
              kind: 'exercise',
              exerciceId: item.exerciceId,
              durationMin,
              note,
            });
          }
        }
      }
    } catch {
      // Repli silencieux sur fallbackExerciseIds
    }
  }

  for (let i = 0; i < fallbackExerciseIds.length; i++) {
    const eid = fallbackExerciseIds[i];
    if (!eid || seenExIds.has(eid)) continue;
    seenExIds.add(eid);
    steps.push({
      id: `step_ex_${eid}_${i}`,
      kind: 'exercise',
      exerciceId: eid,
      durationMin: 15,
      note: '',
    });
  }

  return steps;
}

export function serializeSessionPlan(steps: ImproPlanStep[]): string {
  const compact = steps.slice(0, 80).map((s) => ({
    id: s.id.slice(0, 48),
    kind: s.kind,
    ...(s.kind === 'exercise' && s.exerciceId ? { exerciceId: s.exerciceId.slice(0, 80) } : {}),
    ...(s.kind === 'custom' && s.label ? { label: s.label.trim().slice(0, 100) } : {}),
    durationMin: Math.max(0, Math.min(240, Math.round(Number(s.durationMin) || 0))),
    note: String(s.note ?? '').trim().slice(0, 240),
  }));

  let json = JSON.stringify(compact);
  while (json.length > 4800 && compact.length > 0) {
    compact.pop();
    json = JSON.stringify(compact);
  }
  return json;
}

export function getSessionTotalDuration(steps: ImproPlanStep[]): number {
  return steps.reduce((sum, s) => sum + (Number.isFinite(s.durationMin) ? Math.max(0, s.durationMin) : 0), 0);
}

function asIdList(val: CellValue | undefined): string[] {
  if (Array.isArray(val)) return val.map(String).filter(Boolean);
  if (typeof val === 'string' && val.trim()) return [val.trim()];
  return [];
}

function asString(val: CellValue | undefined): string {
  if (val === undefined || val === null) return '';
  if (Array.isArray(val)) return val.join(', ');
  return String(val);
}

function asStringList(val: CellValue | undefined): string[] {
  if (Array.isArray(val)) return val.map((v) => String(v).trim()).filter(Boolean);
  if (typeof val === 'string' && val.trim()) {
    return val
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export function computeImproEcosystem(
  pages: WorkspacePage[],
  rowsByPage: Record<string, DatabaseRow[]>
): ImproEcosystemModel {
  const ready = hasImproDatabasesInPages(pages);
  if (!ready) {
    return {
      ready: false,
      exercises: [],
      seances: [],
      realizedSeances: [],
      plannedSeances: [],
      groups: [],
      participants: [],
      exerciseById: new Map(),
      seanceById: new Map(),
      groupById: new Map(),
      participantById: new Map(),
      allEtapes: [],
      allTags: [],
    };
  }

  const exRows = rowsByPage[IMPRO_DB_IDS.exercices] ?? [];
  const seaRows = rowsByPage[IMPRO_DB_IDS.seances] ?? [];
  const grpRows = rowsByPage[IMPRO_DB_IDS.groupes] ?? [];
  const parRows = rowsByPage[IMPRO_DB_IDS.participants] ?? [];

  const grpNameById = new Map<string, string>();
  for (const r of grpRows) {
    grpNameById.set(r.id, asString(r.cells[IMPRO_COL_IDS.groupes.nom]) || 'Groupe sans nom');
  }

  const parNameCounts = new Map<string, number>();
  for (const r of parRows) {
    const n = (asString(r.cells[IMPRO_COL_IDS.participants.nom]) || 'Participant').trim();
    parNameCounts.set(n.toLowerCase(), (parNameCounts.get(n.toLowerCase()) ?? 0) + 1);
  }

  const parNameById = new Map<string, string>();
  const parLabelById = new Map<string, string>();
  for (const r of parRows) {
    const nom = (asString(r.cells[IMPRO_COL_IDS.participants.nom]) || 'Participant').trim();
    const gIds = asIdList(r.cells[IMPRO_COL_IDS.participants.groupe]);
    const gNames = gIds.map((gid) => grpNameById.get(gid)).filter((v): v is string => Boolean(v));
    parNameById.set(r.id, nom);
    const isHomonym = (parNameCounts.get(nom.toLowerCase()) ?? 0) > 1;
    parLabelById.set(
      r.id,
      isHomonym && gNames.length > 0 ? `${nom} (${gNames.join(', ')})` : nom
    );
  }

  const exNameById = new Map<string, string>();
  for (const r of exRows) {
    exNameById.set(r.id, asString(r.cells[IMPRO_COL_IDS.exercices.nom]) || 'Exercice');
  }

  const seanceById = new Map<string, ImproSessionSummary>();
  const seances: ImproSessionSummary[] = [];

  for (const r of seaRows) {
    const nom = asString(r.cells[IMPRO_COL_IDS.seances.nom]) || 'Séance';
    const date = asString(r.cells[IMPRO_COL_IDS.seances.date]);
    const status = normalizeSessionStatus(r.cells[IMPRO_COL_IDS.seances.statut]);
    const notes = asString(r.cells[IMPRO_COL_IDS.seances.notes]);
    const groupeIds = asIdList(r.cells[IMPRO_COL_IDS.seances.groupe]);
    const participantIds = asIdList(r.cells[IMPRO_COL_IDS.seances.participants]);
    const exerciceIds = asIdList(r.cells[IMPRO_COL_IDS.seances.exercices]);
    const planSteps = parseSessionPlan(r.cells[IMPRO_COL_IDS.seances.deroule], exerciceIds);
    const totalDurationMin =
      typeof r.cells[IMPRO_COL_IDS.seances.deroule] === 'string' &&
      String(r.cells[IMPRO_COL_IDS.seances.deroule]).trim().startsWith('[')
        ? getSessionTotalDuration(planSteps)
        : 0;

    const summary: ImproSessionSummary = {
      id: r.id,
      nom,
      date,
      status,
      notes,
      planSteps,
      totalDurationMin,
      groupeIds,
      groupeNames: groupeIds.map((id) => grpNameById.get(id) ?? id),
      participantIds,
      participantNames: participantIds.map((id) => parLabelById.get(id) ?? parNameById.get(id) ?? id),
      exerciceIds,
      exerciceNames: exerciceIds.map((id) => exNameById.get(id) ?? id),
    };
    seanceById.set(r.id, summary);
    seances.push(summary);
  }

  for (const r of exRows) {
    for (const sid of asIdList(r.cells[IMPRO_COL_IDS.exercices.seances])) {
      const s = seanceById.get(sid);
      if (s && !s.exerciceIds.includes(r.id)) {
        s.exerciceIds.push(r.id);
        s.exerciceNames.push(exNameById.get(r.id) ?? r.id);
      }
    }
  }
  for (const r of parRows) {
    for (const sid of asIdList(r.cells[IMPRO_COL_IDS.participants.seances])) {
      const s = seanceById.get(sid);
      if (s && !s.participantIds.includes(r.id)) {
        s.participantIds.push(r.id);
        s.participantNames.push(parLabelById.get(r.id) ?? parNameById.get(r.id) ?? r.id);
      }
    }
  }
  for (const r of grpRows) {
    for (const sid of asIdList(r.cells[IMPRO_COL_IDS.groupes.seances])) {
      const s = seanceById.get(sid);
      if (s && !s.groupeIds.includes(r.id)) {
        s.groupeIds.push(r.id);
        s.groupeNames.push(grpNameById.get(r.id) ?? r.id);
      }
    }
  }

  seances.sort((a, b) => b.date.localeCompare(a.date) || a.nom.localeCompare(b.nom, 'fr'));

  const realizedSeances = seances.filter((s) => s.status === 'Réalisée');
  const plannedSeances = seances.filter((s) => s.status === 'Préparée');

  const etapeSet = new Set<string>();
  const tagSet = new Set<string>();
  const exercises: ImproExerciseProjection[] = [];
  const exerciseById = new Map<string, ImproExerciseProjection>();

  for (const r of exRows) {
    const nom = asString(r.cells[IMPRO_COL_IDS.exercices.nom]) || 'Exercice';
    const etapes = asStringList(r.cells[IMPRO_COL_IDS.exercices.etape]);
    const tags = asStringList(r.cells[IMPRO_COL_IDS.exercices.tags]);
    const description = asString(r.cells[IMPRO_COL_IDS.exercices.description]);
    etapes.forEach((e) => etapeSet.add(e));
    tags.forEach((t) => tagSet.add(t));

    const linkedRealized = realizedSeances.filter((s) => s.exerciceIds.includes(r.id));
    const linkedPlanned = plannedSeances.filter((s) => s.exerciceIds.includes(r.id));
    const seanceIds = linkedRealized.map((s) => s.id);

    const groupIdSet = new Set<string>();
    const participantIdSet = new Set<string>();
    for (const s of linkedRealized) {
      s.groupeIds.forEach((gid) => groupIdSet.add(gid));
      s.participantIds.forEach((pid) => participantIdSet.add(pid));
    }

    const groupIds = Array.from(groupIdSet);
    const participantIds = Array.from(participantIdSet);
    const lastSession = linkedRealized[0];

    const proj: ImproExerciseProjection = {
      id: r.id,
      nom,
      check1: Boolean(r.cells[IMPRO_COL_IDS.exercices.check1]),
      check2: Boolean(r.cells[IMPRO_COL_IDS.exercices.check2]),
      checkV: Boolean(r.cells[IMPRO_COL_IDS.exercices.checkV]),
      etapes,
      tags,
      description,
      seanceIds,
      sessions: linkedRealized,
      plannedSessionIds: linkedPlanned.map((s) => s.id),
      plannedCount: linkedPlanned.length,
      groupIds,
      groupNames: groupIds.map((gid) => grpNameById.get(gid) ?? gid),
      participantIds,
      participantNames: participantIds.map((pid) => parLabelById.get(pid) ?? parNameById.get(pid) ?? pid),
      lastDate: lastSession?.date ?? '',
      lastSessionName: lastSession?.nom ?? '',
      usageCount: linkedRealized.length,
    };
    exercises.push(proj);
    exerciseById.set(r.id, proj);
  }

  const buildPracticeStats = (memberSessions: ImproSessionSummary[]) => {
    const map = new Map<
      string,
      { count: number; lastDate: string; sessions: Array<{ id: string; nom: string; date: string; groupeNames: string[] }> }
    >();
    for (const s of memberSessions) {
      for (const exId of s.exerciceIds) {
        const entry = map.get(exId) ?? { count: 0, lastDate: '', sessions: [] };
        entry.count += 1;
        if (!entry.lastDate || s.date > entry.lastDate) entry.lastDate = s.date;
        entry.sessions.push({ id: s.id, nom: s.nom, date: s.date, groupeNames: s.groupeNames });
        map.set(exId, entry);
      }
    }
    const doneExercises: ImproParticipantExerciseRecord[] = [];
    const doneIds = new Set<string>();
    for (const [exId, data] of map.entries()) {
      const ex = exerciseById.get(exId);
      if (!ex) continue;
      doneIds.add(exId);
      doneExercises.push({
        exerciceId: exId,
        nom: ex.nom,
        etapes: ex.etapes,
        tags: ex.tags,
        count: data.count,
        lastDate: data.lastDate,
        sessions: data.sessions,
      });
    }
    doneExercises.sort((a, b) => b.lastDate.localeCompare(a.lastDate) || a.nom.localeCompare(b.nom, 'fr'));
    const neverDoneExercises = exercises.filter((e) => !doneIds.has(e.id));
    return { doneExercises, neverDoneExercises };
  };

  const groups: ImproGroupProjection[] = [];
  const groupById = new Map<string, ImproGroupProjection>();
  for (const r of grpRows) {
    const nom = grpNameById.get(r.id) ?? 'Groupe';
    const participantIds = asIdList(r.cells[IMPRO_COL_IDS.groupes.participants]);
    for (const p of parRows) {
      if (asIdList(p.cells[IMPRO_COL_IDS.participants.groupe]).includes(r.id) && !participantIds.includes(p.id)) {
        participantIds.push(p.id);
      }
    }
    const groupSessions = realizedSeances.filter((s) => s.groupeIds.includes(r.id));
    const groupPlanned = plannedSeances.filter((s) => s.groupeIds.includes(r.id));
    const { doneExercises, neverDoneExercises } = buildPracticeStats(groupSessions);

    const totalPresents = groupSessions.reduce((acc, s) => acc + s.participantIds.length, 0);
    const avgPresent = groupSessions.length > 0 ? totalPresents / groupSessions.length : 0;
    const attendancePct =
      groupSessions.length > 0 && participantIds.length > 0
        ? Math.min(100, Math.round((avgPresent / participantIds.length) * 100))
        : 0;
    const coveragePct =
      exercises.length > 0 ? Math.round((doneExercises.length / exercises.length) * 100) : 0;

    const proj: ImproGroupProjection = {
      id: r.id,
      nom,
      participantIds,
      participantNames: participantIds.map((pid) => parLabelById.get(pid) ?? parNameById.get(pid) ?? pid),
      seanceIds: groupSessions.map((s) => s.id),
      sessions: groupSessions,
      plannedSessions: groupPlanned,
      practicedExercises: doneExercises,
      neverDoneExercises,
      lastDate: groupSessions[0]?.date ?? '',
      coveragePct,
      avgPresent: Math.round(avgPresent * 10) / 10,
      attendancePct,
    };
    groups.push(proj);
    groupById.set(r.id, proj);
  }

  const participants: ImproParticipantProjection[] = [];
  const participantById = new Map<string, ImproParticipantProjection>();
  for (const r of parRows) {
    const nom = parNameById.get(r.id) ?? 'Participant';
    const displayLabel = parLabelById.get(r.id) ?? nom;
    const groupeIds = asIdList(r.cells[IMPRO_COL_IDS.participants.groupe]);
    for (const g of groups) {
      if (g.participantIds.includes(r.id) && !groupeIds.includes(g.id)) {
        groupeIds.push(g.id);
      }
    }
    const partSessions = realizedSeances.filter((s) => s.participantIds.includes(r.id));
    const partPlanned = plannedSeances.filter((s) => s.participantIds.includes(r.id));
    const { doneExercises, neverDoneExercises } = buildPracticeStats(partSessions);

    const groupSessionIdSet = new Set<string>();
    for (const gid of groupeIds) {
      const grp = groupById.get(gid);
      if (grp) grp.seanceIds.forEach((sid) => groupSessionIdSet.add(sid));
    }
    const groupSessionsCount = groupSessionIdSet.size;
    const attendedInOwnGroups = partSessions.filter((s) => groupSessionIdSet.has(s.id)).length;
    const attendancePct =
      groupSessionsCount > 0
        ? Math.min(100, Math.round((attendedInOwnGroups / groupSessionsCount) * 100))
        : partSessions.length > 0
          ? 100
          : 0;

    const proj: ImproParticipantProjection = {
      id: r.id,
      nom,
      displayLabel,
      groupeIds,
      groupeNames: groupeIds.map((gid) => grpNameById.get(gid) ?? gid),
      seanceIds: partSessions.map((s) => s.id),
      sessions: partSessions,
      plannedSessions: partPlanned,
      presenceCount: partSessions.length,
      groupSessionsCount,
      attendancePct,
      lastDate: partSessions[0]?.date ?? '',
      doneExercises,
      neverDoneExercises,
    };
    participants.push(proj);
    participantById.set(r.id, proj);
  }

  participants.sort((a, b) => a.displayLabel.localeCompare(b.displayLabel, 'fr'));

  return {
    ready: true,
    exercises,
    seances,
    realizedSeances,
    plannedSeances,
    groups,
    participants,
    exerciseById,
    seanceById,
    groupById,
    participantById,
    allEtapes: Array.from(etapeSet).sort((a, b) => a.localeCompare(b, 'fr')),
    allTags: Array.from(tagSet).sort((a, b) => a.localeCompare(b, 'fr')),
  };
}

/**
 * Calcule en direct la nouveauté de chaque exercice selon les participants présents.
 */
export function computePrepareSuggestions(
  model: ImproEcosystemModel,
  presentParticipantIds: string[],
  groupId?: string
): ImproExerciseSuggestion[] {
  if (!model.ready) return [];

  const uniquePresent = Array.from(new Set(presentParticipantIds)).filter((id) =>
    model.participantById.has(id)
  );
  const doneLookupByParticipant = new Map<string, Set<string>>();
  for (const pid of uniquePresent) {
    const p = model.participantById.get(pid);
    doneLookupByParticipant.set(
      pid,
      new Set((p?.doneExercises ?? []).map((rec) => rec.exerciceId))
    );
  }

  const groupProj = groupId ? model.groupById.get(groupId) : undefined;
  const groupPracticeByExId = new Map<string, { count: number; lastDate: string }>();
  if (groupProj) {
    for (const rec of groupProj.practicedExercises) {
      groupPracticeByExId.set(rec.exerciceId, { count: rec.count, lastDate: rec.lastDate });
    }
  }
  const plannedInGroupExIds = new Set<string>();
  if (groupProj) {
    for (const s of groupProj.plannedSessions) {
      s.exerciceIds.forEach((eid) => plannedInGroupExIds.add(eid));
    }
  }

  const totalPresent = uniquePresent.length;

  const suggestions: ImproExerciseSuggestion[] = model.exercises.map((ex) => {
    const neverDoneByPresentIds: string[] = [];
    const doneByPresentIds: string[] = [];

    for (const pid of uniquePresent) {
      const doneSet = doneLookupByParticipant.get(pid);
      if (doneSet?.has(ex.id)) {
        doneByPresentIds.push(pid);
      } else {
        neverDoneByPresentIds.push(pid);
      }
    }

    const gStat = groupPracticeByExId.get(ex.id);
    const groupDoneCount = gStat?.count ?? 0;
    const groupLastDate = gStat?.lastDate ?? '';
    const unseenCount = neverDoneByPresentIds.length;
    const seenCount = doneByPresentIds.length;

    let unseenRatio = 0;
    let noveltyBucket: NoveltyBucket = 'all_done';

    if (totalPresent > 0) {
      unseenRatio = unseenCount / totalPresent;
      if (seenCount === 0) noveltyBucket = 'all_new';
      else if (unseenCount > seenCount) noveltyBucket = 'majority_new';
      else if (unseenCount > 0) noveltyBucket = 'mixed';
      else noveltyBucket = 'all_done';
    } else if (groupId) {
      unseenRatio = groupDoneCount === 0 ? 1 : 0;
      noveltyBucket = groupDoneCount === 0 ? 'all_new' : 'all_done';
    } else {
      unseenRatio = ex.usageCount === 0 ? 1 : 0;
      noveltyBucket = ex.usageCount === 0 ? 'all_new' : 'all_done';
    }

    return {
      exercise: ex,
      neverDoneByPresentIds,
      doneByPresentIds,
      unseenCount,
      seenCount,
      totalPresent,
      unseenRatio,
      groupDoneCount,
      groupLastDate,
      isPlannedInGroup: plannedInGroupExIds.has(ex.id),
      noveltyBucket,
    };
  });

  suggestions.sort((a, b) => {
    if (b.unseenRatio !== a.unseenRatio) return b.unseenRatio - a.unseenRatio;
    if (a.groupDoneCount !== b.groupDoneCount) return a.groupDoneCount - b.groupDoneCount;
    const scoreA = (a.exercise.checkV ? 2 : 0) + (a.exercise.check1 ? 1 : 0);
    const scoreB = (b.exercise.checkV ? 2 : 0) + (b.exercise.check1 ? 1 : 0);
    if (scoreB !== scoreA) return scoreB - scoreA;
    if (a.exercise.lastDate !== b.exercise.lastDate) {
      if (!a.exercise.lastDate) return -1;
      if (!b.exercise.lastDate) return 1;
      return a.exercise.lastDate.localeCompare(b.exercise.lastDate);
    }
    return a.exercise.nom.localeCompare(b.exercise.nom, 'fr');
  });

  return suggestions;
}

/**
 * Construit la matrice croisée Participants x Exercices pour un groupe ou l'ensemble.
 */
export function computeGroupExerciseMatrix(
  model: ImproEcosystemModel,
  options: {
    groupId?: string;
    etapeFilter?: string;
    searchQuery?: string;
    onlyNeverDoneByGroup?: boolean;
  }
): ImproGroupExerciseMatrix {
  if (!model.ready) {
    return {
      participants: [],
      exercises: [],
      cellByKey: new Map(),
      exerciseDoneCountById: new Map(),
    };
  }

  const participants = options.groupId
    ? model.participants.filter((p) => p.groupeIds.includes(options.groupId!))
    : model.participants;

  const cellByKey = new Map<string, ImproMatrixCell>();
  for (const p of participants) {
    for (const rec of p.doneExercises) {
      cellByKey.set(`${rec.exerciceId}::${p.id}`, {
        count: rec.count,
        lastDate: rec.lastDate,
      });
    }
  }

  const q = (options.searchQuery ?? '').trim().toLowerCase();
  const exerciseDoneCountById = new Map<string, number>();

  const exercises = model.exercises.filter((ex) => {
    if (options.etapeFilter && !ex.etapes.includes(options.etapeFilter)) return false;
    if (
      q &&
      !ex.nom.toLowerCase().includes(q) &&
      !ex.etapes.some((et) => et.toLowerCase().includes(q)) &&
      !ex.tags.some((tg) => tg.toLowerCase().includes(q))
    ) {
      return false;
    }

    let doneCount = 0;
    for (const p of participants) {
      if (cellByKey.has(`${ex.id}::${p.id}`)) doneCount++;
    }
    exerciseDoneCountById.set(ex.id, doneCount);

    if (options.onlyNeverDoneByGroup && doneCount > 0) return false;
    return true;
  });

  return {
    participants,
    exercises,
    cellByKey,
    exerciseDoneCountById,
  };
}

/**
 * Calcule le tableau de bord statistique complet sur une période et/ou un groupe.
 */
export function computeImproStats(
  model: ImproEcosystemModel,
  options: { groupId?: string; dateFrom?: string; dateTo?: string } = {}
): ImproStatsReport {
  const empty: ImproStatsReport = {
    summary: {
      sessionCount: 0,
      activeExercisesCount: 0,
      totalExercisesCount: model.exercises.length,
      coveragePct: 0,
      avgPresentPerSession: 0,
      avgAttendancePct: 0,
      neverDoneCount: model.exercises.length,
      neverDoneMarkedVCount: model.exercises.filter((e) => e.checkV).length,
    },
    etapeBreakdown: [],
    markerStats: {
      total1: 0,
      never1: 0,
      total2: 0,
      never2: 0,
      totalV: 0,
      neverV: 0,
      unplayedMarkedV: [],
    },
    participantStats: [],
    topExercises: [],
    forgottenExercises: [],
    neverDoneExercises: [],
    groupComparison: [],
  };
  if (!model.ready) return empty;

  const filteredSessions = model.realizedSeances.filter((s) => {
    if (options.groupId && !s.groupeIds.includes(options.groupId)) return false;
    if (options.dateFrom && (!s.date || s.date < options.dateFrom)) return false;
    if (options.dateTo && (!s.date || s.date > options.dateTo)) return false;
    return true;
  });

  const exUsageMap = new Map<string, { count: number; lastDate: string }>();
  const parPresenceMap = new Map<string, { count: number; lastDate: string; distinctEx: Set<string> }>();
  let totalPresentsSum = 0;

  for (const s of filteredSessions) {
    totalPresentsSum += s.participantIds.length;
    for (const eid of s.exerciceIds) {
      const cur = exUsageMap.get(eid) ?? { count: 0, lastDate: '' };
      cur.count += 1;
      if (!cur.lastDate || s.date > cur.lastDate) cur.lastDate = s.date;
      exUsageMap.set(eid, cur);
    }
    for (const pid of s.participantIds) {
      const cur = parPresenceMap.get(pid) ?? { count: 0, lastDate: '', distinctEx: new Set() };
      cur.count += 1;
      if (!cur.lastDate || s.date > cur.lastDate) cur.lastDate = s.date;
      s.exerciceIds.forEach((eid) => cur.distinctEx.add(eid));
      parPresenceMap.set(pid, cur);
    }
  }

  const totalExercisesCount = model.exercises.length;
  const activeExercisesCount = Array.from(exUsageMap.keys()).filter((id) =>
    model.exerciseById.has(id)
  ).length;
  const coveragePct =
    totalExercisesCount > 0 ? Math.round((activeExercisesCount / totalExercisesCount) * 100) : 0;

  const neverDoneExercises = model.exercises
    .filter((ex) => !exUsageMap.has(ex.id))
    .sort((a, b) => {
      const scoreA = (a.checkV ? 4 : 0) + (a.check1 ? 2 : 0) + (a.check2 ? 1 : 0);
      const scoreB = (b.checkV ? 4 : 0) + (b.check1 ? 2 : 0) + (b.check2 ? 1 : 0);
      if (scoreB !== scoreA) return scoreB - scoreA;
      return a.nom.localeCompare(b.nom, 'fr');
    });

  // Répartition par étape
  const etapeMap = new Map<string, { totalCatalog: number; practicedCatalog: number; usagesCount: number }>();
  let totalEtapeUsages = 0;
  for (const ex of model.exercises) {
    const etapes = ex.etapes.length > 0 ? ex.etapes : ['Sans étape'];
    const usage = exUsageMap.get(ex.id);
    for (const et of etapes) {
      const cur = etapeMap.get(et) ?? { totalCatalog: 0, practicedCatalog: 0, usagesCount: 0 };
      cur.totalCatalog += 1;
      if (usage) {
        cur.practicedCatalog += 1;
        cur.usagesCount += usage.count;
        totalEtapeUsages += usage.count;
      }
      etapeMap.set(et, cur);
    }
  }

  const etapeBreakdown = Array.from(etapeMap.entries())
    .map(([etape, data]) => ({
      etape,
      totalCatalog: data.totalCatalog,
      practicedCatalog: data.practicedCatalog,
      coveragePct: data.totalCatalog > 0 ? Math.round((data.practicedCatalog / data.totalCatalog) * 100) : 0,
      usagesCount: data.usagesCount,
      usageSharePct: totalEtapeUsages > 0 ? Math.round((data.usagesCount / totalEtapeUsages) * 100) : 0,
    }))
    .sort((a, b) => b.usagesCount - a.usagesCount || b.totalCatalog - a.totalCatalog);

  // Marqueurs 1 / 2 / V
  const total1 = model.exercises.filter((e) => e.check1).length;
  const never1 = neverDoneExercises.filter((e) => e.check1).length;
  const total2 = model.exercises.filter((e) => e.check2).length;
  const never2 = neverDoneExercises.filter((e) => e.check2).length;
  const totalV = model.exercises.filter((e) => e.checkV).length;
  const unplayedMarkedV = neverDoneExercises.filter((e) => e.checkV);

  // Participants filtrés (si groupe sélectionné, membres du groupe ou présents sur la période)
  const targetParticipants = options.groupId
    ? model.participants.filter((p) => p.groupeIds.includes(options.groupId!))
    : model.participants;

  const participantStats = targetParticipants
    .map((p) => {
      const stat = parPresenceMap.get(p.id);
      const groupSessInPeriod = filteredSessions.filter((s) =>
        s.groupeIds.some((gid) => p.groupeIds.includes(gid))
      );
      const groupSessionsCount = options.groupId
        ? filteredSessions.length
        : groupSessInPeriod.length;
      const presences = stat?.count ?? 0;
      const attendancePct =
        groupSessionsCount > 0
          ? Math.min(100, Math.round((presences / groupSessionsCount) * 100))
          : presences > 0
            ? 100
            : 0;
      const distinctExercisesCount = stat?.distinctEx.size ?? 0;
      const pCoveragePct =
        totalExercisesCount > 0 ? Math.round((distinctExercisesCount / totalExercisesCount) * 100) : 0;

      return {
        id: p.id,
        displayLabel: p.displayLabel,
        groupeNames: p.groupeNames,
        presences,
        groupSessionsCount,
        attendancePct,
        distinctExercisesCount,
        coveragePct: pCoveragePct,
        lastDate: stat?.lastDate ?? '',
      };
    })
    .sort((a, b) => b.presences - a.presences || b.attendancePct - a.attendancePct || a.displayLabel.localeCompare(b.displayLabel, 'fr'));

  const avgPresentPerSession =
    filteredSessions.length > 0
      ? Math.round((totalPresentsSum / filteredSessions.length) * 10) / 10
      : 0;

  const participantsWithDenominator = participantStats.filter((p) => p.groupSessionsCount > 0);
  const avgAttendancePct =
    participantsWithDenominator.length > 0
      ? Math.round(
          participantsWithDenominator.reduce((acc, p) => acc + p.attendancePct, 0) /
            participantsWithDenominator.length
        )
      : 0;

  const topExercises = Array.from(exUsageMap.entries())
    .map(([eid, data]) => {
      const exercise = model.exerciseById.get(eid);
      if (!exercise) return null;
      return {
        exercise,
        periodCount: data.count,
        lastDate: data.lastDate,
      };
    })
    .filter((item): item is { exercise: ImproExerciseProjection; periodCount: number; lastDate: string } => Boolean(item))
    .sort((a, b) => b.periodCount - a.periodCount || b.lastDate.localeCompare(a.lastDate));

  // Oubliés depuis longtemps (pratiqués historiquement, pas forcément sur la période récente, triés par dernière date ascendante)
  const forgottenBase = options.groupId
    ? model.exercises.filter((ex) =>
        ex.sessions.some((s) => s.groupeIds.includes(options.groupId!))
      )
    : model.exercises.filter((ex) => ex.usageCount > 0);

  const forgottenExercises = [...forgottenBase].sort((a, b) => {
    const lastA = options.groupId
      ? a.sessions.find((s) => s.groupeIds.includes(options.groupId!))?.date ?? ''
      : a.lastDate;
    const lastB = options.groupId
      ? b.sessions.find((s) => s.groupeIds.includes(options.groupId!))?.date ?? ''
      : b.lastDate;
    return lastA.localeCompare(lastB) || b.usageCount - a.usageCount;
  });

  // Comparaison des groupes (respecte les bornes dateFrom/dateTo si actives)
  const groupComparison = model.groups
    .map((g) => {
      const gSessions = model.realizedSeances.filter((s) => {
        if (!s.groupeIds.includes(g.id)) return false;
        if (options.dateFrom && (!s.date || s.date < options.dateFrom)) return false;
        if (options.dateTo && (!s.date || s.date > options.dateTo)) return false;
        return true;
      });
      const coveredSet = new Set<string>();
      const etapeCounts = new Map<string, number>();
      let presSum = 0;

      for (const s of gSessions) {
        presSum += s.participantIds.length;
        for (const eid of s.exerciceIds) {
          coveredSet.add(eid);
          const ex = model.exerciseById.get(eid);
          if (ex) {
            for (const et of ex.etapes) {
              etapeCounts.set(et, (etapeCounts.get(et) ?? 0) + 1);
            }
          }
        }
      }

      const avgP = gSessions.length > 0 ? Math.round((presSum / gSessions.length) * 10) / 10 : 0;
      const attPct =
        gSessions.length > 0 && g.participantIds.length > 0
          ? Math.min(100, Math.round((avgP / g.participantIds.length) * 100))
          : 0;
      const covPct =
        totalExercisesCount > 0 ? Math.round((coveredSet.size / totalExercisesCount) * 100) : 0;
      const topEtapes = Array.from(etapeCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([et]) => et);

      return {
        id: g.id,
        nom: g.nom,
        memberCount: g.participantIds.length,
        sessionCount: gSessions.length,
        avgPresent: avgP,
        attendancePct: attPct,
        coveredExercisesCount: coveredSet.size,
        coveragePct: covPct,
        lastDate: gSessions[0]?.date ?? '',
        topEtapes,
      };
    })
    .sort((a, b) => b.sessionCount - a.sessionCount || a.nom.localeCompare(b.nom, 'fr'));

  return {
    summary: {
      sessionCount: filteredSessions.length,
      activeExercisesCount,
      totalExercisesCount,
      coveragePct,
      avgPresentPerSession,
      avgAttendancePct,
      neverDoneCount: neverDoneExercises.length,
      neverDoneMarkedVCount: unplayedMarkedV.length,
    },
    etapeBreakdown,
    markerStats: {
      total1,
      never1,
      total2,
      never2,
      totalV,
      neverV: unplayedMarkedV.length,
      unplayedMarkedV,
    },
    participantStats,
    topExercises,
    forgottenExercises,
    neverDoneExercises,
    groupComparison,
  };
}

interface RelationPair {
  sourcePageId: string;
  sourceColId: string;
  targetPageId: string;
  targetColId: string;
}

const RELATION_PAIRS: RelationPair[] = [
  {
    sourcePageId: IMPRO_DB_IDS.seances,
    sourceColId: IMPRO_COL_IDS.seances.exercices,
    targetPageId: IMPRO_DB_IDS.exercices,
    targetColId: IMPRO_COL_IDS.exercices.seances,
  },
  {
    sourcePageId: IMPRO_DB_IDS.exercices,
    sourceColId: IMPRO_COL_IDS.exercices.seances,
    targetPageId: IMPRO_DB_IDS.seances,
    targetColId: IMPRO_COL_IDS.seances.exercices,
  },
  {
    sourcePageId: IMPRO_DB_IDS.seances,
    sourceColId: IMPRO_COL_IDS.seances.groupe,
    targetPageId: IMPRO_DB_IDS.groupes,
    targetColId: IMPRO_COL_IDS.groupes.seances,
  },
  {
    sourcePageId: IMPRO_DB_IDS.groupes,
    sourceColId: IMPRO_COL_IDS.groupes.seances,
    targetPageId: IMPRO_DB_IDS.seances,
    targetColId: IMPRO_COL_IDS.seances.groupe,
  },
  {
    sourcePageId: IMPRO_DB_IDS.seances,
    sourceColId: IMPRO_COL_IDS.seances.participants,
    targetPageId: IMPRO_DB_IDS.participants,
    targetColId: IMPRO_COL_IDS.participants.seances,
  },
  {
    sourcePageId: IMPRO_DB_IDS.participants,
    sourceColId: IMPRO_COL_IDS.participants.seances,
    targetPageId: IMPRO_DB_IDS.seances,
    targetColId: IMPRO_COL_IDS.seances.participants,
  },
  {
    sourcePageId: IMPRO_DB_IDS.groupes,
    sourceColId: IMPRO_COL_IDS.groupes.participants,
    targetPageId: IMPRO_DB_IDS.participants,
    targetColId: IMPRO_COL_IDS.participants.groupe,
  },
  {
    sourcePageId: IMPRO_DB_IDS.participants,
    sourceColId: IMPRO_COL_IDS.participants.groupe,
    targetPageId: IMPRO_DB_IDS.groupes,
    targetColId: IMPRO_COL_IDS.groupes.participants,
  },
];

export function getGroupMemberIds(
  groupeIds: string[],
  rowsByPage: Record<string, DatabaseRow[]>
): string[] {
  const grpSet = new Set(groupeIds);
  const memberIds = new Set<string>();
  for (const g of rowsByPage[IMPRO_DB_IDS.groupes] ?? []) {
    if (grpSet.has(g.id)) {
      for (const pid of asIdList(g.cells[IMPRO_COL_IDS.groupes.participants])) {
        memberIds.add(pid);
      }
    }
  }
  for (const p of rowsByPage[IMPRO_DB_IDS.participants] ?? []) {
    const pGrps = asIdList(p.cells[IMPRO_COL_IDS.participants.groupe]);
    if (pGrps.some((gid) => grpSet.has(gid))) {
      memberIds.add(p.id);
    }
  }
  return Array.from(memberIds);
}

/**
 * Calcule automatiquement les lignes miroirs à mettre à jour lorsqu'une ligne
 * d'une des 4 bases Impro est créée ou modifiée.
 */
export function computeBidirectionalRowPatches(
  sourcePageId: string,
  sourceRowId: string,
  prevCells: Record<string, CellValue>,
  nextCells: Record<string, CellValue>,
  rowsByPage: Record<string, DatabaseRow[]>
): DatabaseRow[] {
  const activePairs = RELATION_PAIRS.filter((p) => p.sourcePageId === sourcePageId);
  if (activePairs.length === 0) return [];

  const updatedTargets = new Map<string, DatabaseRow>();

  for (const pair of activePairs) {
    const prevSet = new Set(asIdList(prevCells[pair.sourceColId]));
    const nextSet = new Set(asIdList(nextCells[pair.sourceColId]));

    const added: string[] = [];
    const removed: string[] = [];
    for (const id of nextSet) if (!prevSet.has(id)) added.push(id);
    for (const id of prevSet) if (!nextSet.has(id)) removed.push(id);
    if (added.length === 0 && removed.length === 0) continue;

    const targetRows = rowsByPage[pair.targetPageId] ?? [];
    for (const targetRow of targetRows) {
      if (!added.includes(targetRow.id) && !removed.includes(targetRow.id)) continue;
      const key = `${pair.targetPageId}::${targetRow.id}`;
      const baseRow = updatedTargets.get(key) ?? targetRow;
      const currentLinked = asIdList(baseRow.cells[pair.targetColId]);
      let nextLinked = currentLinked;

      if (added.includes(targetRow.id) && !currentLinked.includes(sourceRowId)) {
        nextLinked = [...currentLinked, sourceRowId];
      } else if (removed.includes(targetRow.id) && currentLinked.includes(sourceRowId)) {
        nextLinked = currentLinked.filter((id) => id !== sourceRowId);
      }

      if (nextLinked !== currentLinked) {
        updatedTargets.set(key, {
          ...baseRow,
          cells: {
            ...baseRow.cells,
            [pair.targetColId]: nextLinked,
          },
        });
      }
    }
  }

  return Array.from(updatedTargets.values());
}

/**
 * Nettoie les liens miroirs lorsqu'une ligne est supprimée.
 */
export function computeDeleteRowMirrorCleanup(
  deletedPageId: string,
  deletedRowId: string,
  deletedCells: Record<string, CellValue>,
  rowsByPage: Record<string, DatabaseRow[]>
): DatabaseRow[] {
  return computeBidirectionalRowPatches(deletedPageId, deletedRowId, deletedCells, {}, rowsByPage);
}
