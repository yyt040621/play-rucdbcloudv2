import type { TableSchema } from '../../types';
import { Loading } from '../common/Loading';

interface TableSchemaProps {
  schema: TableSchema | null;
  isLoading: boolean;
}

export function TableSchemaView({ schema, isLoading }: TableSchemaProps) {
  if (isLoading) {
    return <Loading size="sm" />;
  }

  if (!schema) {
    return (
      <div className="text-xs text-[var(--text-secondary)] p-3 text-center">
        点击表名查看结构
      </div>
    );
  }

  return (
    <div className="text-xs">
      {/* 表名 */}
      <div className="px-3 py-2 font-semibold text-[var(--text-primary)] border-b border-[var(--border-color)]">
        {schema.name}
      </div>

      {/* 字段列表 */}
      <div className="flex flex-col">
        {schema.columns.map((col) => (
          <div
            key={col.name}
            className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--border-color)]/50
              hover:bg-[var(--border-color)]/30 transition-colors"
          >
            {/* 主键图标 */}
            {col.key === 'PRI' && (
              <svg className="w-3 h-3 shrink-0 text-yellow-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15l-4-4 1.41-1.41L11 14.17l6.59-6.59L19 9l-8 8z"/>
              </svg>
            )}
            {col.key !== 'PRI' && <span className="w-3 shrink-0" />}

            {/* 字段名 */}
            <span className={`font-mono font-medium truncate ${
              col.key === 'PRI' ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'
            }`}>
              {col.name}
            </span>

            {/* 类型 */}
            <span className="text-[var(--text-secondary)] shrink-0 ml-auto">
              {col.type}
            </span>

            {/* 可空标记 */}
            {col.nullable && (
              <span className="text-[var(--text-secondary)] shrink-0 opacity-50">?</span>
            )}
          </div>
        ))}
      </div>

      {/* 索引信息 */}
      {schema.indexes.length > 1 && (
        <div className="px-3 py-2 border-t border-[var(--border-color)]">
          <div className="text-[var(--text-secondary)] mb-1 font-medium">索引</div>
          {schema.indexes.map((idx) => (
            <div key={idx.name} className="flex items-center gap-1 text-[var(--text-secondary)]">
              <span className="truncate">{idx.columns.join(', ')}</span>
              {idx.unique && (
                <span className="text-[var(--accent)] font-medium shrink-0">UNIQUE</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
