import { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api';
import type { QueryResult } from '../../types';
import { ResultTable } from '../../components/result/ResultTable';
import { Icon } from '../../components/ui/Icon';

interface TableDataPreviewProps {
  tableName: string;
  /** 刷新触发器（外部执行完 DML 后 +1） */
  refreshTrigger?: number;
  /** 限制行数 */
  limit?: number;
}

export function TableDataPreview({
  tableName,
  refreshTrigger = 0,
  limit = 20,
}: TableDataPreviewProps) {
  const [result, setResult] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!tableName) { setResult(null); return; }
    setLoading(true);
    setError(null);
    try {
      const resp = await api.executeQuery(
        `SELECT * FROM ${tableName} LIMIT ${limit}`
      );
      if (resp.results.length > 0) {
        setResult(resp.results[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [tableName, limit]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshTrigger]);

  if (!tableName) return null;

  return (
    <div>
      <div className="flex items-center justify-between px-3 py-2
        border-b border-[var(--border-color)]">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--text-secondary)]">
          <Icon name="chart" className="w-4 h-4 text-[var(--primary)]" />
          {tableName} 数据预览
          {result && result.type === 'select' && (
            <span className="ml-1 font-normal opacity-60">
              ({result.rowCount} 行)
            </span>
          )}
        </span>
        <button
          onClick={fetchData}
          disabled={loading}
          className="p-1 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors cursor-pointer"
          title="刷新"
        >
          <Icon name="refresh" className={`w-4 h-4 text-[var(--text-secondary)] ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <div className="overflow-auto">
        {loading && (
          <div className="text-xs text-[var(--text-secondary)] p-4 text-center">
            加载中...
          </div>
        )}
        {error && (
          <div className="text-xs text-[var(--error)] p-4 text-center">{error}</div>
        )}
        {result && result.type === 'select' && (
          <ResultTable result={result} />
        )}
        {result && result.type !== 'select' && (
          <div className="text-xs text-[var(--text-secondary)] p-4 text-center">
            暂无数据
          </div>
        )}
      </div>
    </div>
  );
}
