import { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api';
import type { TableInfo, ColumnInfo } from '../../types';

interface TableSelectorProps {
  /** 当前选中的表 */
  selectedTable: string | null;
  onSelectTable: (tableName: string) => void;
  /** 选中列回调（用于 UPDATE SET 子句） */
  onSelectColumn?: (columnName: string) => void;
  /** 是否显示列选择面板 */
  showColumns?: boolean;
}

export function TableSelector({
  selectedTable,
  onSelectTable,
  onSelectColumn,
  showColumns = false,
}: TableSelectorProps) {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [loadingColumns, setLoadingColumns] = useState(false);

  const fetchTables = useCallback(async () => {
    try {
      const result = await api.getTables();
      setTables(result);
    } catch {
      // 静默
    }
  }, []);

  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  useEffect(() => {
    if (selectedTable && showColumns) {
      setLoadingColumns(true);
      api.getTableSchema(selectedTable)
        .then((schema) => setColumns(schema.columns))
        .catch(() => setColumns([]))
        .finally(() => setLoadingColumns(false));
    } else {
      setColumns([]);
    }
  }, [selectedTable, showColumns]);

  return (
    <div className="flex flex-col gap-3">
      {/* 表选择下拉 */}
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-[var(--text-secondary)] shrink-0">
          目标表:
        </label>
        <select
          value={selectedTable || ''}
          onChange={(e) => onSelectTable(e.target.value)}
          className="flex-1 px-3 py-1.5 text-sm rounded-md border cursor-pointer
            border-[var(--border-color)] bg-[var(--bg-primary)]
            text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]
            focus:ring-1 focus:ring-[var(--accent)] transition-colors"
        >
          <option value="">选择表...</option>
          {tables.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          onClick={fetchTables}
          className="p-1.5 rounded hover:bg-[var(--border-color)] transition-colors cursor-pointer"
          title="刷新表列表"
        >
          <svg className="w-4 h-4 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* 列选择面板 */}
      {showColumns && selectedTable && (
        <div className="border border-[var(--border-color)] rounded-lg overflow-hidden">
          <div className="px-3 py-2 text-xs font-semibold text-[var(--text-secondary)]
            bg-[var(--bg-secondary)] border-b border-[var(--border-color)]">
            列列表 {loadingColumns ? '(加载中...)' : `(${columns.length} 列)`}
          </div>
          <div className="flex flex-wrap gap-1.5 p-3">
            {columns.map((col) => (
              <button
                key={col.name}
                onClick={() => onSelectColumn?.(col.name)}
                className="px-2 py-1 text-xs rounded-md border cursor-pointer
                  border-[var(--border-color)] bg-[var(--bg-primary)]
                  hover:border-[var(--accent)]/50 hover:text-[var(--accent)]
                  transition-colors flex items-center gap-1"
                title={`${col.name} ${col.type}${col.nullable ? ' NULL' : ''}`}
              >
                {col.key === 'PRI' && <span className="text-yellow-500 text-[10px]">🔑</span>}
                <span className="font-mono">{col.name}</span>
                <span className="text-[var(--text-secondary)] text-[10px] opacity-60">
                  {col.type}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
