import { useState, useEffect, useRef } from 'react';
import { api } from '../../services/api';
import { formatSqlValue } from './sql-escape';
import type { ColumnInfo } from '../../types';

interface ColumnValueFormProps {
  tableName: string;
  /** 已选择的列值 */
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  /** 排除的列（如 AUTO_INCREMENT 主键） */
  excludeColumns?: string[];
  /** 模式：insert 为插入模式，update 为 SET 模式 */
  mode?: 'insert' | 'set';
}

export function ColumnValueForm({
  tableName,
  values,
  onChange,
  excludeColumns = [],
  mode = 'insert',
}: ColumnValueFormProps) {
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [loading, setLoading] = useState(false);
  // 请求序号，防止快速切换表时过期响应覆盖
  const reqSeq = useRef(0);

  useEffect(() => {
    if (!tableName) { setColumns([]); return; }
    const reqId = ++reqSeq.current;
    setLoading(true);
    api.getTableSchema(tableName)
      .then((s) => {
        if (reqId === reqSeq.current) {
          setColumns(s.columns.filter((c) => !excludeColumns.includes(c.name)));
        }
      })
      .catch(() => {
        if (reqId === reqSeq.current) setColumns([]);
      })
      .finally(() => {
        if (reqId === reqSeq.current) setLoading(false);
      });
  }, [tableName]);  // eslint-disable-line react-hooks/exhaustive-deps

  const updateValue = (colName: string, val: string) => {
    onChange({ ...values, [colName]: val });
  };

  if (!tableName) return null;
  if (loading) return <div className="text-xs text-[var(--text-secondary)] p-3">加载列信息...</div>;

  // 自动跳过的列：仅自增列（auto_increment）会自动生成。
  // 普通主键（如字符串主键）需要用户填值，不跳过。
  const skipNames = new Set(excludeColumns);
  for (const c of columns) {
    if (c.extra?.includes('auto_increment')) {
      skipNames.add(c.name);
    }
  }
  const fillColumns = columns.filter((c) => !skipNames.has(c.name));
  const autoNames = columns.filter((c) => skipNames.has(c.name)).map((c) => c.name);

  // 表无可用字段（不存在或无列）时显示提示，避免空白/残留
  if (columns.length === 0) {
    return (
      <div className="text-xs text-[var(--text-secondary)] px-3 py-4 text-center rounded-lg
        border border-dashed border-[var(--border-color)]">
        该表无可用字段或不存在，请先建表
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {/* 自动列提示 */}
      {autoNames.length > 0 && mode === 'insert' && (
        <div className="text-xs text-[var(--text-secondary)] px-3 py-2 rounded-lg
          bg-[var(--bg-secondary)] border border-[var(--border-color)]">
          自动生成: {autoNames.join(', ')}
        </div>
      )}

      {/* 可填写的列 */}
      <div className="grid grid-cols-2 gap-2">
        {fillColumns.map((col) => (
          <div key={col.name} className="flex flex-col gap-0.5">
            <label className="text-[11px] text-[var(--text-secondary)] flex items-center gap-1">
              {col.name}
              <span className="opacity-50">({col.type})</span>
              {col.nullable === false && <span className="text-[var(--error)]">*</span>}
            </label>
            {col.type.includes('enum') || col.name === 'is_active' || col.type === 'tinyint(1)' ? (
              // 枚举/布尔 → 下拉选择
              <select
                value={values[col.name] || ''}
                onChange={(e) => updateValue(col.name, e.target.value)}
                className="px-2 py-1 text-xs rounded border cursor-pointer
                  border-[var(--border-color)] bg-[var(--bg-primary)]
                  text-[var(--text-primary)] font-mono focus:outline-none
                  focus:border-[var(--accent)]"
              >
                <option value="">-- 选择 --</option>
                {col.name === 'is_active' ? (
                  <>
                    <option value="TRUE">TRUE (活跃)</option>
                    <option value="FALSE">FALSE (停用)</option>
                  </>
                ) : col.type.includes('enum') ? (
                  col.type.match(/'([^']+)'/g)?.map((v) => {
                    const val = v.replace(/'/g, '');
                    return <option key={val} value={val}>{val}</option>;
                  }) ?? null
                ) : null}
              </select>
            ) : (
              <input
                type={col.type.includes('date') ? 'date' : col.type.includes('int') || col.type.includes('decimal') ? 'number' : 'text'}
                value={values[col.name] || ''}
                onChange={(e) => updateValue(col.name, e.target.value)}
                placeholder={col.nullable === false ? `${col.name}` : '(可选)'}
                className="px-2 py-1 text-xs rounded border font-mono
                  border-[var(--border-color)] bg-[var(--bg-primary)]
                  text-[var(--text-primary)] focus:outline-none
                  focus:border-[var(--accent)] placeholder:text-[var(--text-secondary)]/50"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 根据列值对象生成 INSERT SQL
 */
export function buildInsertSQL(
  tableName: string,
  values: Record<string, string>,
  columns: ColumnInfo[]
): string {
  const filled = Object.entries(values).filter(([, v]) => v.trim());
  if (filled.length === 0) return '';

  const colNames = filled.map(([k]) => `"${k}"`).join(', ');

  const colValues = filled.map(([k, v]) => {
    const col = columns.find((c) => c.name === k);
    return formatSqlValue(v, col?.type);
  }).join(', ');

  return `INSERT INTO "${tableName}" (${colNames})\nVALUES (${colValues});`;
}

/**
 * 根据列值对象生成 UPDATE SET 子句
 */
export function buildSetClause(values: Record<string, string>, columns: ColumnInfo[]): string {
  const filled = Object.entries(values).filter(([, v]) => v.trim());
  if (filled.length === 0) return '';

  return filled
    .map(([k, v]) => {
      const col = columns.find((c) => c.name === k);
      return `  "${k}" = ${formatSqlValue(v, col?.type)}`;
    })
    .join(',\n');
}
