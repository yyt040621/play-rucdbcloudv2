import { useState, useCallback, useRef } from 'react';
import { api } from '../services/api';
import type { TableInfo, TableSchema } from '../types';

export function useSchema() {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableSchema, setTableSchema] = useState<TableSchema | null>(null);
  const [isLoadingSchema, setIsLoadingSchema] = useState(false);
  // schema 请求序号，防止快速切换表时过期响应覆盖
  const schemaReqSeq = useRef(0);

  const fetchTables = useCallback(async () => {
    try {
      const result = await api.getTables();
      setTables(result);
      return result;
    } catch {
      // 静默失败
      return [];
    }
  }, []);

  const selectTable = useCallback(async (tableName: string) => {
    setSelectedTable(tableName);
    setIsLoadingSchema(true);
    // 记录请求序号，快速切换表时忽略过期响应
    const reqId = ++schemaReqSeq.current;
    try {
      const schema = await api.getTableSchema(tableName);
      if (reqId === schemaReqSeq.current) {
        setTableSchema(schema);
      }
    } catch {
      if (reqId === schemaReqSeq.current) {
        setTableSchema(null);
      }
    } finally {
      if (reqId === schemaReqSeq.current) {
        setIsLoadingSchema(false);
      }
    }
  }, []);

  return { tables, selectedTable, tableSchema, isLoadingSchema, fetchTables, selectTable };
}
