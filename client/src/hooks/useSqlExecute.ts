import { useState, useCallback, useRef } from 'react';
import { api } from '../services/api';
import type { QueryResult } from '../types';

export function useSqlExecute() {
  const [results, setResults] = useState<QueryResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalTimeMs, setTotalTimeMs] = useState<number | null>(null);

  // 请求序号：忽略过期响应，防止快速连续执行时旧结果覆盖新结果
  const requestSeq = useRef(0);
  // 进行中标记：防止并发重入
  const inFlight = useRef(false);

  const execute = useCallback(async (sql: string) => {
    if (!sql.trim()) return;
    if (inFlight.current) return; // 拒绝并发重入

    inFlight.current = true;
    const seq = ++requestSeq.current;

    setIsLoading(true);
    setError(null);
    setTotalTimeMs(null);

    try {
      const response = await api.executeQuery(sql);
      // 只有最新请求的结果才能写入状态
      if (seq === requestSeq.current) {
        setResults(response.results);
        setTotalTimeMs(response.totalTimeMs);
      }
      return response.results;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '执行失败';
      if (seq === requestSeq.current) {
        setError(msg);
        setResults([{
          type: 'error',
          message: msg,
          executionTimeMs: 0,
        }]);
      }
      return null;
    } finally {
      inFlight.current = false;
      if (seq === requestSeq.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const clearResults = useCallback(() => {
    // 清除结果时也作废所有在途请求
    requestSeq.current++;
    setResults([]);
    setError(null);
    setTotalTimeMs(null);
    setIsLoading(false);
  }, []);

  return { results, isLoading, error, totalTimeMs, execute, clearResults };
}
