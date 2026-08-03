import { useEffect, useState } from 'react';
import { api, type QueryLogEntry } from '../../services/api';

interface QueryHistoryProps {
  onSelectQuery: (sql: string) => void;
  refreshTrigger: number;
}

export function QueryHistory({ onSelectQuery, refreshTrigger }: QueryHistoryProps) {
  const [history, setHistory] = useState<QueryLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchHistory = async () => {
      setIsLoading(true);
      try {
        const logs = await api.getQueryLogs(15, 0);
        if (!cancelled) setHistory(logs);
      } catch {
        // 静默（后端可能还未启动或管理库未初始化）
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    fetchHistory();
    return () => { cancelled = true; };
  }, [refreshTrigger]);

  if (isLoading && history.length === 0) {
    return (
      <div className="text-xs text-[var(--text-secondary)] p-3 text-center">
        加载中...
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="text-xs text-[var(--text-secondary)] p-3 text-center leading-relaxed">
        <p>暂无查询记录</p>
        <p className="mt-1 opacity-60">执行的 SQL 将显示在这里</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      {history.map((entry, i) => {
        const timeStr = entry.executedAt
          ? new Date(entry.executedAt).toLocaleTimeString('zh-CN', {
              hour: '2-digit', minute: '2-digit',
            })
          : '';

        return (
          <button
            key={i}
            onClick={() => onSelectQuery(entry.sqlText)}
            className="w-full text-left px-3 py-1.5 text-xs rounded transition-colors
              hover:bg-[var(--border-color)] group cursor-pointer"
            title={entry.sqlText}
          >
            <div className="flex items-center gap-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  entry.isAllowed ? 'bg-[var(--success)]' : 'bg-[var(--error)]'
                }`}
              />
              <span className="text-[var(--text-primary)] truncate flex-1 font-mono text-[11px]">
                {entry.sqlText.length > 55
                  ? entry.sqlText.substring(0, 55) + '...'
                  : entry.sqlText}
              </span>
              {timeStr && (
                <span className="text-[var(--text-secondary)] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-[10px]">
                  {timeStr}
                </span>
              )}
            </div>
            {entry.errorMessage && (
              <div className="mt-0.5 text-[10px] text-[var(--error)] truncate ml-[10px]">
                {entry.errorMessage}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
