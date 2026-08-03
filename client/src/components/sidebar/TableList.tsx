import type { TableInfo } from '../../types';

interface TableListProps {
  tables: TableInfo[];
  selectedTable: string | null;
  onSelectTable: (name: string) => void;
  onInsertTableName: (name: string) => void;
}

export function TableList({ tables, selectedTable, onSelectTable, onInsertTableName }: TableListProps) {
  if (tables.length === 0) {
    return (
      <div className="text-xs text-[var(--text-secondary)] p-3 text-center leading-relaxed">
        <p>暂无表</p>
        <p className="mt-1 opacity-60">
          在编辑器中执行<br />
          <code className="text-[11px] bg-[var(--border-color)]/50 px-1 py-0.5 rounded">
            CREATE TABLE my_table (...)
          </code>
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      {tables.map((table) => (
        <button
          key={table.name}
          onClick={() => onSelectTable(table.name)}
          onDoubleClick={() => onInsertTableName(table.name)}
          className={`flex items-center justify-between w-full px-3 py-1.5 text-left text-sm
            rounded transition-colors cursor-pointer group
            ${selectedTable === table.name
              ? 'bg-[var(--accent)]/10 text-[var(--accent)] font-medium'
              : 'hover:bg-[var(--border-color)] text-[var(--text-primary)]'
            }`}
          title={`点击查看结构 · 双击插入表名`}
        >
          <span className="flex items-center gap-2 truncate">
            <svg className="w-4 h-4 shrink-0 opacity-60" fill="none" viewBox="0 0 24 24"
              stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            {table.name}
          </span>
          <span className="text-xs text-[var(--text-secondary)] shrink-0 flex items-center gap-1">
            <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-[var(--text-secondary)]">
              双击插入
            </span>
            {table.rowCount.toLocaleString()}
          </span>
        </button>
      ))}
    </div>
  );
}
