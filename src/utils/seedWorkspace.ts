import type { DatabaseRow, WorkspacePage } from '../types/workspace';

export interface SeedWorkspaceData {
  pages: WorkspacePage[];
  rowsByPage: Record<string, DatabaseRow[]>;
}

export function createSeedWorkspace(workspaceId: string, ownerId: string): SeedWorkspaceData {
  const welcomeId = 'page_bienvenue';
  const notesId = 'page_notes_projet';
  const dbId = 'page_suivi_taches';

  const pages: WorkspacePage[] = [
    {
      id: welcomeId,
      workspaceId,
      ownerId,
      parentId: null,
      title: 'Bienvenue',
      icon: '◈',
      type: 'document',
      isFavorite: true,
      isTrashed: false,
      order: 0,
      source: 'native',
      blocks: [
        {
          id: 'blk_w1',
          type: 'paragraph',
          content: 'Espace de travail modulaire inspiré d’AppFlowy. Créez des pages, structurez vos données et importez vos exports Notion.',
        },
        {
          id: 'blk_w2',
          type: 'heading2',
          content: 'Commandes rapides',
        },
        {
          id: 'blk_w3',
          type: 'bullet',
          content: 'Tapez / au début d’un bloc pour changer son type.',
        },
        {
          id: 'blk_w4',
          type: 'bullet',
          content: 'Utilisez # , - , [] , > ou ``` pour formater instantanément.',
        },
        {
          id: 'blk_w5',
          type: 'todo',
          checked: false,
          content: 'Importer un export Notion (.zip, .md ou .csv) via le panneau Importer',
        },
        {
          id: 'blk_w6',
          type: 'todo',
          checked: false,
          content: 'Connecter votre compte Google pour synchroniser sur Firebase',
        },
      ],
    },
    {
      id: notesId,
      workspaceId,
      ownerId,
      parentId: welcomeId,
      title: 'Architecture & Notes',
      icon: '📄',
      type: 'document',
      isFavorite: false,
      isTrashed: false,
      order: 1,
      source: 'native',
      blocks: [
        {
          id: 'blk_n1',
          type: 'callout',
          icon: '•',
          content: 'Chaque document est composé de blocs indépendants synchronisés en temps réel.',
        },
        {
          id: 'blk_n2',
          type: 'heading2',
          content: 'Exemple de bloc de code',
        },
        {
          id: 'blk_n3',
          type: 'code',
          language: 'typescript',
          content: 'const page = await importerNotion(archiveZip);\nconsole.log(page.stats);',
        },
        {
          id: 'blk_n4',
          type: 'toggle',
          content: 'Format pris en charge lors de l’importation',
          details: 'Exports Notion complets (.zip), fichiers Markdown (.md) avec UUID Notion, et bases CSV (.csv).',
          isOpen: false,
        },
      ],
    },
    {
      id: dbId,
      workspaceId,
      ownerId,
      parentId: null,
      title: 'Suivi des tâches',
      icon: '⊞',
      type: 'database',
      isFavorite: true,
      isTrashed: false,
      order: 2,
      source: 'native',
      blocks: [],
      activeView: 'table',
      columns: [
        { id: 'col_titre', name: 'Tâche', type: 'text' },
        {
          id: 'col_statut',
          name: 'Statut',
          type: 'select',
          options: ['À faire', 'En cours', 'Terminé'],
        },
        {
          id: 'col_priorite',
          name: 'Priorité',
          type: 'select',
          options: ['Haute', 'Normale', 'Basse'],
        },
        { id: 'col_echeance', name: 'Échéance', type: 'date' },
        { id: 'col_fait', name: 'Validé', type: 'checkbox' },
      ],
    },
  ];

  const rowsByPage: Record<string, DatabaseRow[]> = {
    [dbId]: [
      {
        id: 'row_1',
        pageId: dbId,
        workspaceId,
        ownerId,
        order: 0,
        cells: {
          col_titre: 'Préparer l’export Notion (.zip)',
          col_statut: 'Terminé',
          col_priorite: 'Haute',
          col_echeance: '2026-11-18',
          col_fait: true,
        },
      },
      {
        id: 'row_2',
        pageId: dbId,
        workspaceId,
        ownerId,
        order: 1,
        cells: {
          col_titre: 'Vérifier les vues Tableau et Kanban',
          col_statut: 'En cours',
          col_priorite: 'Normale',
          col_echeance: '2026-11-20',
          col_fait: false,
        },
      },
      {
        id: 'row_3',
        pageId: dbId,
        workspaceId,
        ownerId,
        order: 2,
        cells: {
          col_titre: 'Activer la synchronisation Firebase',
          col_statut: 'À faire',
          col_priorite: 'Haute',
          col_echeance: '2026-11-22',
          col_fait: false,
        },
      },
    ],
  };

  return { pages, rowsByPage };
}
