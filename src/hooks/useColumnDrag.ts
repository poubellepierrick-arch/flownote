import { useCallback, useState, type DragEvent } from 'react';

export interface ColumnDropIndicator {
  colId: string;
  position: 'before' | 'after';
}

/**
 * Hook partagé pour réordonner les colonnes d'un tableau par glisser-déposer d'en-tête.
 */
export function useColumnDrag(
  onReorder: (sourceId: string, targetId: string, position: 'before' | 'after') => void
) {
  const [dragColId, setDragColId] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<ColumnDropIndicator | null>(null);

  const handleDragStart = useCallback((colId: string, e: DragEvent<HTMLElement>) => {
    setDragColId(colId);
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', colId);
    } catch {
      // Ignore si restreint par l'environnement
    }
  }, []);

  const handleDragOver = useCallback(
    (targetColId: string, e: DragEvent<HTMLElement>) => {
      if (!dragColId || dragColId === targetColId) {
        if (dropIndicator?.colId === targetColId) setDropIndicator(null);
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = e.currentTarget.getBoundingClientRect();
      const position: 'before' | 'after' =
        e.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
      setDropIndicator((prev) =>
        prev && prev.colId === targetColId && prev.position === position
          ? prev
          : { colId: targetColId, position }
      );
    },
    [dragColId, dropIndicator]
  );

  const handleDrop = useCallback(
    (targetColId: string, e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      const sourceId = dragColId || e.dataTransfer.getData('text/plain');
      if (sourceId && sourceId !== targetColId) {
        const rect = e.currentTarget.getBoundingClientRect();
        const position: 'before' | 'after' =
          e.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
        onReorder(sourceId, targetColId, position);
      }
      setDragColId(null);
      setDropIndicator(null);
    },
    [dragColId, onReorder]
  );

  const handleDragEnd = useCallback(() => {
    setDragColId(null);
    setDropIndicator(null);
  }, []);

  const getThDropProps = useCallback(
    (colId: string) => ({
      onDragOver: (e: DragEvent<HTMLTableCellElement>) => handleDragOver(colId, e),
      onDrop: (e: DragEvent<HTMLTableCellElement>) => handleDrop(colId, e),
    }),
    [handleDragOver, handleDrop]
  );

  const getDragHandleProps = useCallback(
    (colId: string) => ({
      draggable: true,
      onDragStart: (e: DragEvent<HTMLElement>) => handleDragStart(colId, e),
      onDragEnd: handleDragEnd,
    }),
    [handleDragStart, handleDragEnd]
  );

  return {
    dragColId,
    dropIndicator,
    getThDropProps,
    getDragHandleProps,
  };
}
