import type { DatabaseColumn, DatabaseRow, WorkspacePage } from '../types/workspace';

export const IMPRO_DB_IDS = {
  exercices: 'db_impro_exercices',
  seances: 'db_impro_seances',
  groupes: 'db_impro_groupes',
  participants: 'db_impro_participants',
} as const;

export const IMPRO_COL_IDS = {
  exercices: {
    nom: 'col_ex_nom',
    check1: 'col_ex_check_1',
    check2: 'col_ex_check_2',
    checkV: 'col_ex_check_v',
    etape: 'col_ex_etape',
    tags: 'col_ex_tags',
    description: 'col_ex_description',
    seances: 'col_ex_seances',
    utilisations: 'col_ex_utilisations',
  },
  seances: {
    nom: 'col_se_nom',
    date: 'col_se_date',
    statut: 'col_se_statut',
    groupe: 'col_se_groupe',
    participants: 'col_se_participants',
    exercices: 'col_se_exercices',
    presents: 'col_se_presents',
    nbExercices: 'col_se_nb_exos',
    notes: 'col_se_notes',
    deroule: 'col_se_deroule',
  },
  groupes: {
    nom: 'col_gr_nom',
    participants: 'col_gr_participants',
    seances: 'col_gr_seances',
    nbParticipants: 'col_gr_nb_participants',
    nbSeances: 'col_gr_nb_seances',
  },
  participants: {
    nom: 'col_pa_nom',
    groupe: 'col_pa_groupe',
    seances: 'col_pa_seances',
    presences: 'col_pa_presences',
  },
} as const;

export const IMPRO_CSV_PATHS = {
  biblimpro: '/assets/aistudio/Biblimpro_2e2ddc608f9980438568f6cda4766a95_all_e7a164f8.csv',
  groupes: '/assets/aistudio/Groupe_2e2ddc608f9980a69a16da1a63457d77_all_e06e0aa1.csv',
  participants: '/assets/aistudio/Participants_2e2ddc608f9980da8b3fc9e3dbf3e4c3_all_1bb16bb6.csv',
  seances: '/assets/aistudio/S_ances_2e2ddc608f998017a1f0e0664292119d_all_e6b07be3.csv',
} as const;

export interface ImproCsvTexts {
  biblimproCsv: string;
  groupesCsv: string;
  participantsCsv: string;
  seancesCsv: string;
}

export interface NotionRelationRef {
  name: string;
  path: string;
  uuid: string;
}

export interface ImproEcosystemDataset {
  pages: WorkspacePage[];
  rowsByPage: Record<string, DatabaseRow[]>;
}

const FRENCH_MONTHS: Record<string, string> = {
  janvier: '01',
  janv: '01',
  fevrier: '02',
  février: '02',
  fev: '02',
  févr: '02',
  mars: '03',
  avril: '04',
  avr: '04',
  mai: '05',
  juin: '06',
  juillet: '07',
  juil: '07',
  aout: '08',
  août: '08',
  septembre: '09',
  sept: '09',
  octobre: '10',
  oct: '10',
  novembre: '11',
  nov: '11',
  decembre: '12',
  décembre: '12',
  dec: '12',
  déc: '12',
};

export function parseCsvMatrix(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  const clean = text.replace(/^\uFEFF/, '');

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\r' && clean[i + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i++;
    } else if (ch === '\n' || ch === '\r') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export function parseNotionRelationRefs(raw: string): NotionRelationRef[] {
  const out: NotionRelationRef[] = [];
  if (!raw || !raw.trim()) return out;
  const re = /\(((?:Biblimpro|S%C3%A9ances|Groupe|Participants)\/.*?([0-9a-f]{32})\.csv)\)/gi;
  let lastEnd = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) {
    let label = raw.slice(lastEnd, match.index).trim();
    if (label.startsWith(',')) label = label.slice(1).trim();
    out.push({
      name: label,
      path: match[1],
      uuid: match[2].toLowerCase(),
    });
    lastEnd = match.index + match[0].length;
  }
  return out;
}

export function parseFrenchDateToIso(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    const dd = slashMatch[1].padStart(2, '0');
    const mm = slashMatch[2].padStart(2, '0');
    const yyyy = slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  const frMatch = trimmed
    .toLowerCase()
    .match(/^(\d{1,2})\s+([a-zàâäéèêëîïôöùûüç]+)\s+(\d{4})$/);
  if (frMatch) {
    const dd = frMatch[1].padStart(2, '0');
    const month = FRENCH_MONTHS[frMatch[2]];
    const yyyy = frMatch[3];
    if (month) return `${yyyy}-${month}-${dd}`;
  }

  return '';
}

function splitMultiValue(raw: string): string[] {
  if (!raw || !raw.trim()) return [];
  return Array.from(
    new Set(
      raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    )
  );
}

function isNoiseExerciseRow(name: string, description: string, seanceRefs: NotionRelationRef[]): boolean {
  if (!name) return true;
  if (/^_+pause_+$/i.test(name.replace(/\s+/g, ''))) return true;
  if (/^_+libre_+$/i.test(name.replace(/\s+/g, '')) && !description && seanceRefs.length === 0) {
    return true;
  }
  return false;
}

function addUnique(list: string[], value: string) {
  if (value && !list.includes(value)) list.push(value);
}

export function buildImproEcosystemFromCsvTexts(
  texts: ImproCsvTexts,
  workspaceId: string,
  ownerId: string,
  startOrder = 0
): ImproEcosystemDataset {
  const bibRowsRaw = parseCsvMatrix(texts.biblimproCsv);
  const grpRowsRaw = parseCsvMatrix(texts.groupesCsv);
  const parRowsRaw = parseCsvMatrix(texts.participantsCsv);
  const seaRowsRaw = parseCsvMatrix(texts.seancesCsv);

  // 1. Collecter les UUID canoniques connus depuis les relations Notion
  const groupUuidByName = new Map<string, string>();
  const seanceUuidByName = new Map<string, string>();
  const participantMetaByUuid = new Map<
    string,
    { name: string; seanceUuids: Set<string>; groupUuids: Set<string> }
  >();
  const exerciseMetaByUuid = new Map<string, { name: string; seanceUuids: Set<string> }>();

  const registerParticipantRef = (ref: NotionRelationRef, seanceUuid?: string, groupUuid?: string) => {
    const entry = participantMetaByUuid.get(ref.uuid) ?? {
      name: ref.name,
      seanceUuids: new Set<string>(),
      groupUuids: new Set<string>(),
    };
    if (seanceUuid) entry.seanceUuids.add(seanceUuid);
    if (groupUuid) entry.groupUuids.add(groupUuid);
    participantMetaByUuid.set(ref.uuid, entry);
  };

  // Scanner Groupe.csv pour récupérer les séances et participants liés aux groupes
  const grpDataRows = grpRowsRaw.slice(1).filter((r) => (r[0] ?? '').trim().length > 0);
  for (const r of grpDataRows) {
    const grpName = (r[0] ?? '').trim();
    const sRefs = parseNotionRelationRefs(r[1] ?? '');
    for (const sRef of sRefs) seanceUuidByName.set(sRef.name, sRef.uuid);
    // Le UUID du groupe est lu depuis Participants.csv ou Séances.csv
    if (!groupUuidByName.has(grpName)) {
      groupUuidByName.set(grpName, '');
    }
  }

  // Scanner Participants.csv pour récupérer les UUID des groupes et séances
  const parDataRows = parRowsRaw.slice(1).filter((r) => (r[0] ?? '').trim().length > 0);
  for (const r of parDataRows) {
    for (const gRef of parseNotionRelationRefs(r[1] ?? '')) {
      groupUuidByName.set(gRef.name, gRef.uuid);
    }
    for (const sRef of parseNotionRelationRefs(r[3] ?? '')) {
      seanceUuidByName.set(sRef.name, sRef.uuid);
    }
  }

  // Scanner Séances.csv pour récupérer tous les UUID d'exercices, groupes et participants
  const seaDataRows = seaRowsRaw.slice(1).filter((r) => (r[0] ?? '').trim().length > 0);
  const parsedSeances = seaDataRows.map((r, idx) => {
    const name = (r[0] ?? '').trim();
    const exRefs = parseNotionRelationRefs(r[1] ?? '');
    const dateIso = parseFrenchDateToIso(r[2] ?? '');
    const grpRefs = parseNotionRelationRefs(r[3] ?? '');
    const parRefs = parseNotionRelationRefs(r[4] ?? '');

    for (const g of grpRefs) groupUuidByName.set(g.name, g.uuid);
    const seanceUuid = seanceUuidByName.get(name) || `seance_${idx}`;
    for (const p of parRefs) {
      registerParticipantRef(p, seanceUuid, grpRefs[0]?.uuid);
    }
    for (const e of exRefs) {
      const exMeta = exerciseMetaByUuid.get(e.uuid) ?? {
        name: e.name,
        seanceUuids: new Set<string>(),
      };
      exMeta.seanceUuids.add(seanceUuid);
      exerciseMetaByUuid.set(e.uuid, exMeta);
    }

    return {
      idx,
      name,
      seanceUuid,
      exRefs,
      dateIso,
      grpRefs,
      parRefs,
    };
  });

  // Compléter participantMetaByUuid depuis Groupe.csv
  for (const r of grpDataRows) {
    const grpName = (r[0] ?? '').trim();
    const grpUuid = groupUuidByName.get(grpName) || undefined;
    for (const pRef of parseNotionRelationRefs(r[2] ?? '')) {
      registerParticipantRef(pRef, undefined, grpUuid);
    }
  }

  // Scanner Biblimpro.csv pour ses séances
  const bibDataRows = bibRowsRaw.slice(1);
  for (const r of bibDataRows) {
    for (const sRef of parseNotionRelationRefs(r[4] ?? '')) {
      if (!seanceUuidByName.has(sRef.name)) {
        seanceUuidByName.set(sRef.name, sRef.uuid);
      }
    }
  }

  // 2. Construire les entités avec IDs canoniques Firestore-compatibles
  const groupRowIdByName = new Map<string, string>();
  const groupRowIdByUuid = new Map<string, string>();
  const groupRecords = grpDataRows.map((r, idx) => {
    const name = (r[0] ?? '').trim();
    const uuid = groupUuidByName.get(name) || `g${idx}`;
    const id = `grp_${uuid.slice(0, 24)}`;
    groupRowIdByName.set(name, id);
    if (uuid) groupRowIdByUuid.set(uuid, id);
    return {
      id,
      name,
      uuid,
      seanceRefs: parseNotionRelationRefs(r[1] ?? ''),
      participantRefs: parseNotionRelationRefs(r[2] ?? ''),
      participantIds: [] as string[],
      seanceIds: [] as string[],
    };
  });

  // Résoudre chaque participant vers son UUID unique (crucial pour Julie et Thibaud)
  const usedParticipantUuids = new Set<string>();
  const participantRowIdByUuid = new Map<string, string>();
  const participantRowIdsByName = new Map<string, string[]>();

  const participantRecords = parDataRows.map((r, idx) => {
    const name = (r[0] ?? '').trim();
    const grpRefs = parseNotionRelationRefs(r[1] ?? '');
    const seanceRefs = parseNotionRelationRefs(r[3] ?? '');
    const seanceSet = new Set(seanceRefs.map((s) => s.uuid));
    const grpSet = new Set(grpRefs.map((g) => g.uuid));

    let bestUuid = '';
    let bestScore = -1;
    for (const [uuid, meta] of participantMetaByUuid.entries()) {
      if (usedParticipantUuids.has(uuid)) continue;
      if (meta.name.toLowerCase() !== name.toLowerCase()) continue;
      let score = 1;
      for (const s of seanceSet) if (meta.seanceUuids.has(s)) score += 10;
      for (const g of grpSet) if (meta.groupUuids.has(g)) score += 5;
      if (score > bestScore) {
        bestScore = score;
        bestUuid = uuid;
      }
    }

    if (bestUuid) usedParticipantUuids.add(bestUuid);
    const id = bestUuid ? `par_${bestUuid.slice(0, 24)}` : `par_row_${idx}`;
    if (bestUuid) participantRowIdByUuid.set(bestUuid, id);

    const listByName = participantRowIdsByName.get(name.toLowerCase()) ?? [];
    listByName.push(id);
    participantRowIdsByName.set(name.toLowerCase(), listByName);

    return {
      id,
      name,
      uuid: bestUuid,
      grpRefs,
      seanceRefs,
      groupeIds: [] as string[],
      seanceIds: [] as string[],
    };
  });

  // Séances
  const seanceRowIdByUuid = new Map<string, string>();
  const seanceRowIdByName = new Map<string, string>();
  const seanceRecords = parsedSeances.map((s) => {
    const resolvedUuid = seanceUuidByName.get(s.name) || s.seanceUuid;
    const id = /^[0-9a-f]{32}$/i.test(resolvedUuid)
      ? `sea_${resolvedUuid.slice(0, 24)}`
      : `sea_row_${s.idx}`;
    seanceRowIdByUuid.set(resolvedUuid, id);
    seanceRowIdByName.set(s.name, id);
    return {
      id,
      name: s.name,
      date: s.dateIso,
      uuid: resolvedUuid,
      exRefs: s.exRefs,
      grpRefs: s.grpRefs,
      parRefs: s.parRefs,
      groupeIds: [] as string[],
      participantIds: [] as string[],
      exerciceIds: [] as string[],
    };
  });

  // Exercices (Biblimpro nettoyé)
  const allEtapes = new Set<string>();
  const allTags = new Set<string>();
  const exerciseRecords: Array<{
    id: string;
    name: string;
    check1: boolean;
    check2: boolean;
    checkV: boolean;
    etapes: string[];
    tags: string[];
    description: string;
    seanceRefs: NotionRelationRef[];
    seanceIds: string[];
  }> = [];

  const exerciseRowIdsByName = new Map<string, string[]>();

  bibDataRows.forEach((r, idx) => {
    const name = (r[0] ?? '').trim();
    const check1 = (r[1] ?? '').trim().toLowerCase() === 'yes';
    const check2 = (r[2] ?? '').trim().toLowerCase() === 'yes';
    const checkV = (r[6] ?? '').trim().toLowerCase() === 'yes';
    const description = (r[7] ?? '').trim();
    const seanceRefs = parseNotionRelationRefs(r[4] ?? '');
    if (isNoiseExerciseRow(name, description, seanceRefs)) return;

    const etapes = splitMultiValue(r[10] ?? '');
    const tags = splitMultiValue(r[9] ?? '');
    etapes.forEach((e) => allEtapes.add(e));
    tags.forEach((t) => allTags.add(t));

    const id = `ex_row_${idx}`;
    exerciseRecords.push({
      id,
      name,
      check1,
      check2,
      checkV,
      etapes,
      tags,
      description,
      seanceRefs,
      seanceIds: [],
    });

    const key = name.toLowerCase();
    const bucket = exerciseRowIdsByName.get(key) ?? [];
    bucket.push(id);
    exerciseRowIdsByName.set(key, bucket);
  });

  const exerciseById = new Map(exerciseRecords.map((e) => [e.id, e]));
  const seanceById = new Map(seanceRecords.map((s) => [s.id, s]));
  const groupById = new Map(groupRecords.map((g) => [g.id, g]));
  const participantById = new Map(participantRecords.map((p) => [p.id, p]));

  // Résolution déterministe des exercices par UUID (gère aussi les homonymes comme Faire briller)
  const exerciseRowIdByUuid = new Map<string, string>();
  const usedExerciseRowIdsForDuplicateUuid = new Set<string>();
  for (const [uuid, meta] of exerciseMetaByUuid.entries()) {
    const candidates = exerciseRowIdsByName.get(meta.name.toLowerCase()) ?? [];
    if (candidates.length === 1) {
      exerciseRowIdByUuid.set(uuid, candidates[0]);
    } else if (candidates.length > 1) {
      let bestId = candidates[0];
      let bestScore = -1;
      for (const cid of candidates) {
        const rec = exerciseById.get(cid)!;
        let score = usedExerciseRowIdsForDuplicateUuid.has(cid) ? 0 : 100;
        for (const sRef of rec.seanceRefs) {
          if (meta.seanceUuids.has(sRef.uuid)) score += 10;
        }
        if (score > bestScore) {
          bestScore = score;
          bestId = cid;
        }
      }
      usedExerciseRowIdsForDuplicateUuid.add(bestId);
      exerciseRowIdByUuid.set(uuid, bestId);
    }
  }

  // 3. Réconciliation bidirectionnelle complète entre les 4 bases
  const linkGroupAndParticipant = (grpId: string, parId: string) => {
    const g = groupById.get(grpId);
    const p = participantById.get(parId);
    if (!g || !p) return;
    addUnique(g.participantIds, parId);
    addUnique(p.groupeIds, grpId);
  };

  const linkSeanceAndGroup = (seaId: string, grpId: string) => {
    const s = seanceById.get(seaId);
    const g = groupById.get(grpId);
    if (!s || !g) return;
    addUnique(s.groupeIds, grpId);
    addUnique(g.seanceIds, seaId);
  };

  const linkSeanceAndParticipant = (seaId: string, parId: string) => {
    const s = seanceById.get(seaId);
    const p = participantById.get(parId);
    if (!s || !p) return;
    addUnique(s.participantIds, parId);
    addUnique(p.seanceIds, seaId);
  };

  const linkSeanceAndExercise = (seaId: string, exId: string) => {
    const s = seanceById.get(seaId);
    const e = exerciseById.get(exId);
    if (!s || !e) return;
    addUnique(s.exerciceIds, exId);
    addUnique(e.seanceIds, seaId);
  };

  const resolveParticipantId = (ref: NotionRelationRef): string | undefined => {
    return (
      participantRowIdByUuid.get(ref.uuid) ??
      participantRowIdsByName.get(ref.name.toLowerCase())?.[0]
    );
  };

  const resolveSeanceId = (ref: NotionRelationRef): string | undefined => {
    return seanceRowIdByUuid.get(ref.uuid) ?? seanceRowIdByName.get(ref.name);
  };

  const resolveGroupId = (ref: NotionRelationRef): string | undefined => {
    return groupRowIdByUuid.get(ref.uuid) ?? groupRowIdByName.get(ref.name);
  };

  const resolveExerciseId = (ref: NotionRelationRef): string | undefined => {
    return (
      exerciseRowIdByUuid.get(ref.uuid) ??
      exerciseRowIdsByName.get(ref.name.toLowerCase())?.[0]
    );
  };

  for (const g of groupRecords) {
    for (const pRef of g.participantRefs) {
      const pid = resolveParticipantId(pRef);
      if (pid) linkGroupAndParticipant(g.id, pid);
    }
    for (const sRef of g.seanceRefs) {
      const sid = resolveSeanceId(sRef);
      if (sid) linkSeanceAndGroup(sid, g.id);
    }
  }

  for (const p of participantRecords) {
    for (const gRef of p.grpRefs) {
      const gid = resolveGroupId(gRef);
      if (gid) linkGroupAndParticipant(gid, p.id);
    }
    for (const sRef of p.seanceRefs) {
      const sid = resolveSeanceId(sRef);
      if (sid) linkSeanceAndParticipant(sid, p.id);
    }
  }

  for (const s of seanceRecords) {
    for (const gRef of s.grpRefs) {
      const gid = resolveGroupId(gRef);
      if (gid) linkSeanceAndGroup(s.id, gid);
    }
    for (const pRef of s.parRefs) {
      const pid = resolveParticipantId(pRef);
      if (pid) linkSeanceAndParticipant(s.id, pid);
    }
    for (const eRef of s.exRefs) {
      const eid = resolveExerciseId(eRef);
      if (eid) linkSeanceAndExercise(s.id, eid);
    }
  }

  for (const e of exerciseRecords) {
    for (const sRef of e.seanceRefs) {
      const sid = resolveSeanceId(sRef);
      if (sid) linkSeanceAndExercise(sid, e.id);
    }
  }

  // 4. Créer les 4 WorkspacePage + DatabaseRow[]
  const exCols: DatabaseColumn[] = [
    { id: IMPRO_COL_IDS.exercices.nom, name: 'Nom', type: 'text' },
    { id: IMPRO_COL_IDS.exercices.check1, name: '1', type: 'checkbox' },
    { id: IMPRO_COL_IDS.exercices.check2, name: '2', type: 'checkbox' },
    { id: IMPRO_COL_IDS.exercices.checkV, name: 'V', type: 'checkbox' },
    {
      id: IMPRO_COL_IDS.exercices.etape,
      name: 'Étape',
      type: 'multi_select',
      options: Array.from(allEtapes).sort((a, b) => a.localeCompare(b, 'fr')),
    },
    {
      id: IMPRO_COL_IDS.exercices.tags,
      name: 'Tags',
      type: 'multi_select',
      options: Array.from(allTags).sort((a, b) => a.localeCompare(b, 'fr')),
    },
    { id: IMPRO_COL_IDS.exercices.description, name: 'Description', type: 'text' },
    {
      id: IMPRO_COL_IDS.exercices.seances,
      name: 'Séances',
      type: 'relation',
      relationTargetPageId: IMPRO_DB_IDS.seances,
    },
    {
      id: IMPRO_COL_IDS.exercices.utilisations,
      name: 'Utilisations',
      type: 'rollup',
      rollupRelationColId: IMPRO_COL_IDS.exercices.seances,
      rollupFn: 'count',
    },
  ];

  const seaCols: DatabaseColumn[] = [
    { id: IMPRO_COL_IDS.seances.nom, name: 'Nom', type: 'text' },
    { id: IMPRO_COL_IDS.seances.date, name: 'Date', type: 'date' },
    {
      id: IMPRO_COL_IDS.seances.statut,
      name: 'Statut',
      type: 'select',
      options: ['Réalisée', 'Préparée'],
    },
    {
      id: IMPRO_COL_IDS.seances.groupe,
      name: 'Groupe',
      type: 'relation',
      relationTargetPageId: IMPRO_DB_IDS.groupes,
    },
    {
      id: IMPRO_COL_IDS.seances.participants,
      name: 'Participants',
      type: 'relation',
      relationTargetPageId: IMPRO_DB_IDS.participants,
    },
    {
      id: IMPRO_COL_IDS.seances.exercices,
      name: 'Exercices',
      type: 'relation',
      relationTargetPageId: IMPRO_DB_IDS.exercices,
    },
    {
      id: IMPRO_COL_IDS.seances.presents,
      name: 'Présents',
      type: 'rollup',
      rollupRelationColId: IMPRO_COL_IDS.seances.participants,
      rollupFn: 'count',
    },
    {
      id: IMPRO_COL_IDS.seances.nbExercices,
      name: 'Exercices (nb)',
      type: 'rollup',
      rollupRelationColId: IMPRO_COL_IDS.seances.exercices,
      rollupFn: 'count',
    },
    { id: IMPRO_COL_IDS.seances.notes, name: 'Notes', type: 'text' },
  ];

  const grpCols: DatabaseColumn[] = [
    { id: IMPRO_COL_IDS.groupes.nom, name: 'Nom', type: 'text' },
    {
      id: IMPRO_COL_IDS.groupes.participants,
      name: 'Participants',
      type: 'relation',
      relationTargetPageId: IMPRO_DB_IDS.participants,
    },
    {
      id: IMPRO_COL_IDS.groupes.seances,
      name: 'Séances',
      type: 'relation',
      relationTargetPageId: IMPRO_DB_IDS.seances,
    },
    {
      id: IMPRO_COL_IDS.groupes.nbParticipants,
      name: 'Membres',
      type: 'rollup',
      rollupRelationColId: IMPRO_COL_IDS.groupes.participants,
      rollupFn: 'count',
    },
    {
      id: IMPRO_COL_IDS.groupes.nbSeances,
      name: 'Séances (nb)',
      type: 'rollup',
      rollupRelationColId: IMPRO_COL_IDS.groupes.seances,
      rollupFn: 'count',
    },
  ];

  const parCols: DatabaseColumn[] = [
    { id: IMPRO_COL_IDS.participants.nom, name: 'Nom', type: 'text' },
    {
      id: IMPRO_COL_IDS.participants.groupe,
      name: 'Groupe',
      type: 'relation',
      relationTargetPageId: IMPRO_DB_IDS.groupes,
    },
    {
      id: IMPRO_COL_IDS.participants.seances,
      name: 'Séances',
      type: 'relation',
      relationTargetPageId: IMPRO_DB_IDS.seances,
    },
    {
      id: IMPRO_COL_IDS.participants.presences,
      name: 'Présences',
      type: 'rollup',
      rollupRelationColId: IMPRO_COL_IDS.participants.seances,
      rollupFn: 'count',
    },
  ];

  const pages: WorkspacePage[] = [
    {
      id: IMPRO_DB_IDS.exercices,
      workspaceId,
      ownerId,
      parentId: null,
      title: 'Exercices',
      icon: '▤',
      type: 'database',
      isFavorite: true,
      isTrashed: false,
      order: startOrder,
      source: 'native',
      blocks: [],
      columns: exCols,
      activeView: 'table',
    },
    {
      id: IMPRO_DB_IDS.seances,
      workspaceId,
      ownerId,
      parentId: null,
      title: 'Séances',
      icon: '◷',
      type: 'database',
      isFavorite: true,
      isTrashed: false,
      order: startOrder + 1,
      source: 'native',
      blocks: [],
      columns: seaCols,
      activeView: 'table',
    },
    {
      id: IMPRO_DB_IDS.groupes,
      workspaceId,
      ownerId,
      parentId: null,
      title: 'Groupes',
      icon: '◫',
      type: 'database',
      isFavorite: false,
      isTrashed: false,
      order: startOrder + 2,
      source: 'native',
      blocks: [],
      columns: grpCols,
      activeView: 'table',
    },
    {
      id: IMPRO_DB_IDS.participants,
      workspaceId,
      ownerId,
      parentId: null,
      title: 'Participants',
      icon: '◉',
      type: 'database',
      isFavorite: false,
      isTrashed: false,
      order: startOrder + 3,
      source: 'native',
      blocks: [],
      columns: parCols,
      activeView: 'table',
    },
  ];

  // Trier les séances par date décroissante par défaut
  const sortedSeances = [...seanceRecords].sort((a, b) => b.date.localeCompare(a.date));

  const rowsByPage: Record<string, DatabaseRow[]> = {
    [IMPRO_DB_IDS.exercices]: exerciseRecords.map((e, order) => ({
      id: e.id,
      pageId: IMPRO_DB_IDS.exercices,
      workspaceId,
      ownerId,
      order,
      cells: {
        [IMPRO_COL_IDS.exercices.nom]: e.name,
        [IMPRO_COL_IDS.exercices.check1]: e.check1,
        [IMPRO_COL_IDS.exercices.check2]: e.check2,
        [IMPRO_COL_IDS.exercices.checkV]: e.checkV,
        [IMPRO_COL_IDS.exercices.etape]: e.etapes,
        [IMPRO_COL_IDS.exercices.tags]: e.tags,
        [IMPRO_COL_IDS.exercices.description]: e.description,
        [IMPRO_COL_IDS.exercices.seances]: e.seanceIds,
      },
      linkedPageId: null,
    })),
    [IMPRO_DB_IDS.seances]: sortedSeances.map((s, order) => ({
      id: s.id,
      pageId: IMPRO_DB_IDS.seances,
      workspaceId,
      ownerId,
      order,
      cells: {
        [IMPRO_COL_IDS.seances.nom]: s.name,
        [IMPRO_COL_IDS.seances.date]: s.date,
        [IMPRO_COL_IDS.seances.statut]: 'Réalisée',
        [IMPRO_COL_IDS.seances.groupe]: s.groupeIds,
        [IMPRO_COL_IDS.seances.participants]: s.participantIds,
        [IMPRO_COL_IDS.seances.exercices]: s.exerciceIds,
        [IMPRO_COL_IDS.seances.notes]: '',
      },
      linkedPageId: null,
    })),
    [IMPRO_DB_IDS.groupes]: groupRecords.map((g, order) => ({
      id: g.id,
      pageId: IMPRO_DB_IDS.groupes,
      workspaceId,
      ownerId,
      order,
      cells: {
        [IMPRO_COL_IDS.groupes.nom]: g.name,
        [IMPRO_COL_IDS.groupes.participants]: g.participantIds,
        [IMPRO_COL_IDS.groupes.seances]: g.seanceIds,
      },
      linkedPageId: null,
    })),
    [IMPRO_DB_IDS.participants]: participantRecords.map((p, order) => ({
      id: p.id,
      pageId: IMPRO_DB_IDS.participants,
      workspaceId,
      ownerId,
      order,
      cells: {
        [IMPRO_COL_IDS.participants.nom]: p.name,
        [IMPRO_COL_IDS.participants.groupe]: p.groupeIds,
        [IMPRO_COL_IDS.participants.seances]: p.seanceIds,
      },
      linkedPageId: null,
    })),
  };

  return { pages, rowsByPage };
}

export async function fetchImproCsvTexts(): Promise<ImproCsvTexts> {
  const [biblimproCsv, groupesCsv, participantsCsv, seancesCsv] = await Promise.all([
    fetch(IMPRO_CSV_PATHS.biblimpro).then((r) => {
      if (!r.ok) throw new Error('Erreur chargement Biblimpro');
      return r.text();
    }),
    fetch(IMPRO_CSV_PATHS.groupes).then((r) => {
      if (!r.ok) throw new Error('Erreur chargement Groupes');
      return r.text();
    }),
    fetch(IMPRO_CSV_PATHS.participants).then((r) => {
      if (!r.ok) throw new Error('Erreur chargement Participants');
      return r.text();
    }),
    fetch(IMPRO_CSV_PATHS.seances).then((r) => {
      if (!r.ok) throw new Error('Erreur chargement Séances');
      return r.text();
    }),
  ]);
  return { biblimproCsv, groupesCsv, participantsCsv, seancesCsv };
}

export async function fetchAndBuildImproEcosystem(
  workspaceId: string,
  ownerId: string,
  startOrder = 0
): Promise<ImproEcosystemDataset> {
  const texts = await fetchImproCsvTexts();
  return buildImproEcosystemFromCsvTexts(texts, workspaceId, ownerId, startOrder);
}
