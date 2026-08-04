import type { QueryResult } from '../../types';

interface DmlResultProps {
  result: QueryResult;
}

export function DmlResult({ result }: DmlResultProps) {
  if (!['insert', 'update', 'delete', 'ddl'].includes(result.type)) return null;

  const typeLabels: Record<string, string> = {
    insert: 'INSERT',
    update: 'UPDATE',
    delete: 'DELETE',
    ddl: 'DDL',
  };

  return (
    <div className="p-4">
      <div className="flex items-start gap-3 p-3 rounded-md
        bg-[var(--success-bg)] border-l-4 border-l-[var(--success)] border border-[var(--success)]/30">
        <svg className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--success)' }}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-[var(--success)] mb-1">
            {typeLabels[result.type] || result.type.toUpperCase()} 执行成功
          </div>
          <div className="text-xs text-[var(--text-secondary)] space-y-0.5">
            {result.affectedRows !== undefined && (
              <div>影响行数: {result.affectedRows}</div>
            )}
            {result.insertId !== undefined && result.insertId > 0 && (
              <div>新插入 ID: {result.insertId}</div>
            )}
            {result.message && <div>{result.message}</div>}
          </div>
        </div>
        <span className="text-xs text-[var(--text-secondary)] shrink-0">
          {result.executionTimeMs}ms
        </span>
      </div>
    </div>
  );
}
