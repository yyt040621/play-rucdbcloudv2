interface EditorToolbarProps {
  onExecute: () => void;
  isLoading: boolean;
  hasContent: boolean;
}

export function EditorToolbar({ onExecute, isLoading, hasContent }: EditorToolbarProps) {
  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border-color)]
      bg-[var(--bg-secondary)] shrink-0">
      <div className="flex items-center gap-2">
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
              执行
            </>
          )}
        </button>

        {/* 快捷键提示 */}
        <span className="text-xs text-[var(--text-secondary)]">
          Ctrl + Enter
        </span>
      </div>

      {/* 状态指示 */}
      {isLoading && (
        <span className="text-xs text-[var(--accent)] font-medium">
          正在查询...
        </span>
      )}
    </div>
  );
}
