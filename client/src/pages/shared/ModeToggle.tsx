type Mode = 'form' | 'sql';

interface ModeToggleProps {
  mode: Mode;
  onChange: (mode: Mode) => void;
}

export function ModeToggle({ mode, onChange }: ModeToggleProps) {
  return (
    <div className="flex items-center rounded-lg border border-[var(--border-color)]
      bg-[var(--bg-secondary)] p-0.5">
      <button
        onClick={() => onChange('form')}
        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer
          ${mode === 'form'
            ? 'bg-[var(--accent)] text-white shadow-sm'
            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
      >
        📝 表单
      </button>
      <button
        onClick={() => onChange('sql')}
        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer
          ${mode === 'sql'
            ? 'bg-[var(--accent)] text-white shadow-sm'
            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
      >
        ⚡ SQL
      </button>
    </div>
  );
}

export type { Mode };
