import type { ColumnInfo } from '../../types';
import { formatSqlValue } from './sql-escape';

export interface WhereCondition {
  id: number;
  column: string;
  operator: string;
  value: string;
  logic: 'AND' | 'OR';
}

interface WhereConditionBuilderProps {
  conditions: WhereCondition[];
  columns: ColumnInfo[];
  onChange: (conditions: WhereCondition[]) => void;
}

const OPERATORS = ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'IN'];

let condId = 0;

export function createCondition(columns: ColumnInfo[]): WhereCondition {
  return {
    id: ++condId,
    column: columns[0]?.name || '',
    operator: '=',
    value: '',
    logic: 'AND',
  };
}

export function buildWhereClause(conditions: WhereCondition[]): string {
  const parts = conditions
    .filter((c) => c.column && c.value.trim())
    .map((c, i) => {
      const col = `\`${c.column}\``;
      let val = c.value.trim();

      if (c.operator === 'IN') {
        // IN 每一项单独判断，负数/字符串都正确处理
        val = `(${val.split(',').map((v) => formatSqlValue(v)).join(', ')})`;
      } else {
        val = formatSqlValue(val);
      }

      const prefix = i === 0 ? '' : ` ${c.logic} `;
      return `${prefix}${col} ${c.operator} ${val}`;
    });

  return parts.join('');
}

export function WhereConditionBuilder({
  conditions,
  columns,
  onChange,
}: WhereConditionBuilderProps) {
  const update = (id: number, key: keyof WhereCondition, value: string) => {
    onChange(
      conditions.map((c) => (c.id === id ? { ...c, [key]: value } : c))
    );
  };

  const remove = (id: number) => {
    if (conditions.length <= 1) return;
    onChange(conditions.filter((c) => c.id !== id));
  };

  const add = () => {
    onChange([...conditions, createCondition(columns)]);
  };

  if (columns.length === 0) {
    return (
      <div className="text-xs text-[var(--text-secondary)] p-3 text-center
        border border-dashed border-[var(--border-color)] rounded-lg">
        请先选择目标表
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {conditions.map((cond, i) => (
        <div key={cond.id} className="flex items-center gap-1.5">
          {/* 逻辑连接符 (第2行起显示) */}
          {i > 0 && (
            <select
              value={cond.logic}
              onChange={(e) => update(cond.id, 'logic', e.target.value)}
              className="w-14 px-1 py-1 text-[11px] font-bold rounded border cursor-pointer
                border-[var(--border-color)] bg-[var(--bg-primary)]
                text-[var(--accent)] focus:outline-none"
            >
              <option value="AND">AND</option>
              <option value="OR">OR</option>
            </select>
          )}
          {i === 0 && <span className="w-14 text-[10px] text-[var(--text-secondary)] text-center">WHERE</span>}

          {/* 列名 */}
          <select
            value={cond.column}
            onChange={(e) => update(cond.id, 'column', e.target.value)}
            className="flex-1 px-2 py-1 text-xs rounded border cursor-pointer
              border-[var(--border-color)] bg-[var(--bg-primary)]
              text-[var(--text-primary)] font-mono focus:outline-none
              focus:border-[var(--accent)]"
          >
            {columns.map((col) => (
              <option key={col.name} value={col.name}>
                {col.name} ({col.type})
              </option>
            ))}
          </select>

          {/* 运算符 */}
          <select
            value={cond.operator}
            onChange={(e) => update(cond.id, 'operator', e.target.value)}
            className="w-16 px-1.5 py-1 text-xs rounded border cursor-pointer
              border-[var(--border-color)] bg-[var(--bg-primary)]
              text-[var(--text-primary)] font-mono focus:outline-none"
          >
            {OPERATORS.map((op) => (
              <option key={op} value={op}>{op}</option>
            ))}
          </select>

          {/* 值 */}
          <input
            type="text"
            aria-label={`条件 ${i + 1} 的值`}
            value={cond.value}
            onChange={(e) => update(cond.id, 'value', e.target.value)}
            placeholder="值"
            className="flex-1 min-w-[80px] px-2 py-1 text-xs rounded border font-mono
              border-[var(--border-color)] bg-[var(--bg-primary)]
              text-[var(--text-primary)] focus:outline-none
              focus:border-[var(--accent)] placeholder:text-[var(--text-secondary)]/50"
          />

          {/* 删除 */}
          <button
            onClick={() => remove(cond.id)}
            disabled={conditions.length <= 1}
            aria-label="删除条件"
            className="p-1 text-[var(--text-secondary)] hover:text-[var(--error)]
              disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shrink-0"
          >
            ×
          </button>
        </div>
      ))}

      <button
        onClick={add}
        className="flex items-center gap-1 px-3 py-1 text-xs rounded-md
          border border-dashed border-[var(--border-color)]
          text-[var(--text-secondary)] hover:border-[var(--accent)]
          hover:text-[var(--accent)] transition-colors cursor-pointer"
      >
        + 添加条件
      </button>
    </div>
  );
}
