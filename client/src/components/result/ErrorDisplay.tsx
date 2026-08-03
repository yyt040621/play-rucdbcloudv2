import type { QueryResult } from '../../types';

interface ErrorDisplayProps {
  result: QueryResult;
}

export function ErrorDisplay({ result }: ErrorDisplayProps) {
  if (result.type !== 'error') return null;

  return (
    <div className="p-4">
      <div className="flex items-start gap-3 p-3 rounded-md
        bg-[var(--error)]/10 border border-[var(--error)]/30">
        <svg className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--error)' }}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-[var(--error)] mb-1">
            执行错误
          </div>
          <pre className="text-xs whitespace-pre-wrap break-all text-[var(--text-primary)] font-mono
            leading-relaxed">
            {result.message}
          </pre>
        </div>
        <span className="text-xs text-[var(--text-secondary)] shrink-0">
          {result.executionTimeMs}ms
        </span>
      </div>
    </div>
  );
}
