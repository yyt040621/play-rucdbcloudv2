interface OperationToolbarProps {
  /** 模板按钮列表 */
  templates?: { label: string; sql: string }[];
  onSelectTemplate?: (sql: string) => void;
  onExecute: () => void;
  isLoading: boolean;
  hasContent: boolean;
  executeLabel?: string;
}

export function OperationToolbar({
  templates = [],
  onSelectTemplate,
  onExecute,
  isLoading,
  hasContent,
  executeLabel = '执行',
}: OperationToolbarProps) {
  return (
    <div className="flex items-center gap-2">
      {/* 快捷模板 */}
      {templates.map((t) => (
        <button
          key={t.label}
          onClick={() => onSelectTemplate?.(t.sql)}
          className="px-3 py-1.5 text-xs rounded-md border cursor-pointer
            border-[var(--border-color)] bg-[var(--bg-primary)]
            text-[var(--text-secondary)] hover:text-[var(--text-primary)]
            hover:border-[var(--accent)]/50 transition-colors"
        >
          {t.label}
        </button>
      ))}

      {/* 执行按钮 */}
      <button
        onClick={onExecute}
        disabled={!hasContent || isLoading}
        className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-md
          text-white transition-all cursor-pointer
          bg-[var(--accent)] hover:bg-[var(--accent-hover)]
          disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
      >
        {isLoading ? (
          <>
            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            执行中...
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
            {executeLabel}
          </>
        )}
      </button>
      <span className="text-xs text-[var(--text-secondary)]">Ctrl+Enter</span>
    </div>
  );
}
