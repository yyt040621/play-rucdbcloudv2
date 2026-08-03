import type { QueryResult } from '../../types';

interface ResultSummaryProps {
  results: QueryResult[];
  totalTimeMs: number | null;
}

export function ResultSummary({ results, totalTimeMs }: ResultSummaryProps) {
  if (results.length === 0) return null;

  const successCount = results.filter((r) => r.type !== 'error').length;
  const errorCount = results.filter((r) => r.type === 'error').length;
  const totalRows = results.reduce((sum, r) => sum + (r.rowCount || 0), 0);
  const totalAffected = results.reduce((sum, r) => sum + (r.affectedRows || 0), 0);

  return (
    <div className="flex items-center gap-4 px-4 py-2 border-b border-[var(--border-color)]
      bg-[var(--bg-secondary)] text-xs text-[var(--text-secondary)] shrink-0">
      {/* 状态 */}
      {errorCount > 0 ? (
        <span className="flex items-center gap-1 text-[var(--error)] font-medium">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {errorCount}/{results.length} 条语句出错
        </span>
      ) : (
        <span className="flex items-center gap-1 text-[var(--success)] font-medium">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {successCount}/{results.length} 条语句执行成功
        </span>
      )}

      {/* 统计信息 */}
      {totalRows > 0 && (
        <span>
          返回 <strong className="text-[var(--text-primary)]">{totalRows.toLocaleString()}</strong> 行
        </span>
      )}
      {totalAffected > 0 && (
        <span>
          影响 <strong className="text-[var(--text-primary)]">{totalAffected.toLocaleString()}</strong> 行
        </span>
      )}

      {/* 耗时 */}
      {totalTimeMs !== null && (
        <span className="ml-auto">
          总耗时 <strong className="text-[var(--text-primary)]">{totalTimeMs}ms</strong>
        </span>
      )}
    </div>
  );
}
