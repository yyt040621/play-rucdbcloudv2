import { Icon } from '../../components/ui/Icon';

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
        className={`flex items-center gap-1 px-3 py-1.5 text-[13px] font-medium rounded-md transition-all cursor-pointer
          ${mode === 'form'
            ? 'bg-[var(--primary)] text-white shadow-sm'
            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
      >
        <Icon name="form" className="w-3.5 h-3.5" />
        表单
      </button>
      <button
        onClick={() => onChange('sql')}
        className={`flex items-center gap-1 px-3 py-1.5 text-[13px] font-medium rounded-md transition-all cursor-pointer
          ${mode === 'sql'
            ? 'bg-[var(--primary)] text-white shadow-sm'
            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
      >
        <Icon name="bolt" className="w-3.5 h-3.5" />
        SQL
      </button>
    </div>
  );
}

export type { Mode };
