import { useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical, Plus, X } from 'lucide-react';

interface ChoiceOrderEditorProps {
  options: string[];
  onChange: (nextOptions: string[]) => void;
  maxItems?: number;
}

export function ChoiceOrderEditor({
  options,
  onChange,
  maxItems = 100,
}: ChoiceOrderEditorProps) {
  const [newChoice, setNewChoice] = useState('');
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const moveChoice = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= options.length) return;
    const next = [...options];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const handleDrop = (targetIndex: number) => {
    if (dragIdx === null || dragIdx === targetIndex) {
      setDragIdx(null);
      setOverIdx(null);
      return;
    }
    const next = [...options];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(targetIndex, 0, moved);
    setDragIdx(null);
    setOverIdx(null);
    onChange(next);
  };

  const addChoice = () => {
    const trimmed = newChoice.trim().slice(0, 120);
    if (!trimmed || options.includes(trimmed) || options.length >= maxItems) return;
    onChange([...options, trimmed]);
    setNewChoice('');
  };

  const removeChoice = (index: number) => {
    onChange(options.filter((_, i) => i !== index));
  };

  const sortAlphabetically = () => {
    onChange(
      [...options].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' }))
    );
  };

  return (
    <div className="p-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
          Ordre des choix ({options.length})
        </span>
        {options.length > 1 && (
          <button
            type="button"
            onClick={sortAlphabetically}
            className="text-[11px] font-mono text-slate-500 hover:text-slate-900 dark:hover:text-white"
          >
            A → Z
          </button>
        )}
      </div>

      {options.length === 0 ? (
        <div className="text-xs text-slate-400 py-1">Aucun choix</div>
      ) : (
        <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded">
          {options.map((opt, idx) => (
            <div
              key={opt}
              draggable
              onDragStart={() => setDragIdx(idx)}
              onDragOver={(e) => {
                e.preventDefault();
                if (overIdx !== idx) setOverIdx(idx);
              }}
              onDragLeave={() => {
                if (overIdx === idx) setOverIdx(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(idx);
              }}
              onDragEnd={() => {
                setDragIdx(null);
                setOverIdx(null);
              }}
              className={`px-2 py-1.5 flex items-center gap-2 text-xs transition-colors ${
                overIdx === idx && dragIdx !== idx
                  ? 'bg-slate-100 dark:bg-slate-800'
                  : 'bg-transparent'
              }`}
            >
              <GripVertical className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 shrink-0 cursor-grab" />
              <span className="w-5 text-[11px] font-mono tabular-nums text-slate-400 text-right shrink-0">
                {idx + 1}.
              </span>
              <span className="flex-1 min-w-0 truncate text-slate-800 dark:text-slate-200">
                {opt}
              </span>
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => moveChoice(idx, -1)}
                  disabled={idx === 0}
                  aria-label={`Monter choix ${opt}`}
                  className="w-6 h-6 inline-flex items-center justify-center rounded text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-25"
                >
                  <ArrowUp className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => moveChoice(idx, 1)}
                  disabled={idx === options.length - 1}
                  aria-label={`Descendre choix ${opt}`}
                  className="w-6 h-6 inline-flex items-center justify-center rounded text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-25"
                >
                  <ArrowDown className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => removeChoice(idx)}
                  aria-label={`Supprimer choix ${opt}`}
                  className="w-6 h-6 inline-flex items-center justify-center rounded text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {options.length < maxItems && (
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={newChoice}
            onChange={(e) => setNewChoice(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addChoice();
              }
            }}
            placeholder="Ajouter un choix..."
            aria-label="Ajouter un choix"
            className="h-7 flex-1 min-w-0 px-2 rounded border border-slate-200 dark:border-slate-700 bg-transparent text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-slate-400"
          />
          <button
            type="button"
            onClick={addChoice}
            disabled={!newChoice.trim()}
            aria-label="Valider le nouveau choix"
            className="h-7 px-2 rounded border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 inline-flex items-center gap-1"
          >
            <Plus className="w-3 h-3" />
            <span>Ajouter</span>
          </button>
        </div>
      )}
    </div>
  );
}
