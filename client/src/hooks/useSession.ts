import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import type { SessionInfo } from '../types';

const SESSION_KEY = 'sqlplayground_session_id';

export function useSession() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [dbName, setDbName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 初始化会话
  useEffect(() => {
    const initSession = async () => {
      try {
        const storedId = localStorage.getItem(SESSION_KEY) || undefined;
        const info: SessionInfo = await api.createSession(storedId);
        setSessionId(info.sessionId);
        setDbName(info.dbName);
        localStorage.setItem(SESSION_KEY, info.sessionId);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create session');
      } finally {
        setIsLoading(false);
      }
    };
    initSession();
  }, []);

  // 重置沙箱
  const resetSession = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const info = await api.resetSession();
      setSessionId(info.sessionId);
      setDbName(info.dbName);
      localStorage.setItem(SESSION_KEY, info.sessionId);
      return info;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset session');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { sessionId, dbName, isLoading, error, resetSession };
}
