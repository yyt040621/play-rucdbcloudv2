import { useState } from 'react';
import { TableList } from '../sidebar/TableList';
import { TableSchemaView } from '../sidebar/TableSchema';
import { QueryHistory } from '../sidebar/QueryHistory';
import type { TableInfo, TableSchema } from '../../types';

type SidebarTab = 'tables' | 'history';

interface SidebarProps {
  tables: TableInfo[];
  selectedTable: string | null;
  tableSchema: TableSchema | null;
  isLoadingSchema: boolean;
  onSelectTable: (name: string) => void;
  onInsertTableName: (name: string) => void;
  onRefreshTables: () => void;
  onSelectHistoryQuery: (sql: string) => void;
  isRefreshingTables: boolean;
  historyRefreshTrigger: number;
}

export function Sidebar({
  tables, selectedTable, tableSchema, isLoadingSchema,
  onSelectTable, onInsertTableName, onRefreshTables,
  onSelectHistoryQuery, isRefreshingTables, historyRefreshTrigger,
}: SidebarProps) {
  const [activeTab, setActiveTab] = useState<SidebarTab>('tables');

  return (
    <aside
      className="flex flex-col border-r border-[var(--border-color)] bg-[var(--sidebar-bg)] shrink-0 overflow-hidden"
      style={{ width: 260 }}
    >
      {/* 顶部 Tab 切换 */}
      <div className="flex border-b border-[var(--border-color)] shrink-0">
        <button
          onClick={() => setActiveTab('tables')}
          className={`flex-1 py-2 text-xs font-medium transition-colors cursor-pointer
            ${activeTab === 'tables'
              ? 'text-[var(--accent)] border-b-2 border-[var(--accent)]'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
        >
          表
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 py-2 text-xs font-medium transition-colors cursor-pointer
            ${activeTab === 'history'
              ? 'text-[var(--accent)] border-b-2 border-[var(--accent)]'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
        >
          历史
        </button>
      </div>

      {/* Tab: 表 */}
      {activeTab === 'tables' && (
        <>
          {/* 表列表区域 */}
          <div className="flex flex-col overflow-hidden" style={{ flex: '0 0 auto', maxHeight: '50%' }}>
            <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-color)]">
              <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                数据库表
              </span>
              <button
                onClick={onRefreshTables}
                disabled={isRefreshingTables}
                className="p-0.5 rounded hover:bg-[var(--border-color)] transition-colors
                  disabled:opacity-50 cursor-pointer"
                title="刷新表列表"
              >
                <svg
                  className={`w-3.5 h-3.5 text-[var(--text-secondary)] ${
                    isRefreshingTables ? 'animate-spin' : ''
                  }`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-1">
              <TableList
                tables={tables}
                selectedTable={selectedTable}
                onSelectTable={onSelectTable}
                onInsertTableName={onInsertTableName}
              />
            </div>
          </div>

          {/* 表结构区域 */}
          <div className="flex flex-col flex-1 overflow-hidden border-t border-[var(--border-color)]">
            <div className="px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider
              border-b border-[var(--border-color)]">
              表结构
            </div>
            <div className="overflow-y-auto flex-1">
              <TableSchemaView schema={tableSchema} isLoading={isLoadingSchema} />
            </div>
          </div>
        </>
      )}

      {/* Tab: 历史 */}
      {activeTab === 'history' && (
        <div className="flex-1 overflow-y-auto p-1">
          <QueryHistory
            onSelectQuery={onSelectHistoryQuery}
            refreshTrigger={historyRefreshTrigger}
          />
        </div>
      )}
    </aside>
  );
}
