import { useState, useCallback, useEffect, useRef } from 'react';
import { PageLayout } from './shared/PageLayout';
import { ModeToggle } from './shared/ModeToggle';
import { SqlHighlight } from './shared/SqlHighlight';
import {
  WhereConditionBuilder, createCondition, buildWhereClause,
  type WhereCondition,
} from './shared/WhereConditionBuilder';
import { SqlEditor } from '../components/editor/SqlEditor';
import { ResultTable } from '../components/result/ResultTable';
import { ErrorDisplay } from '../components/result/ErrorDisplay';
import { useSqlExecute } from '../hooks/useSqlExecute';
import { api } from '../services/api';
import type { ColumnInfo, TableInfo, QueryResult } from '../types';

interface SelectPageProps {
  theme: 'light' | 'dark';
  tables: TableInfo[];
}

export function SelectPage({ theme, tables }: SelectPageProps) {
  const { results, isLoading, execute } = useSqlExecute();

  const [mode, setMode] = useState<'form' | 'sql'>('form');
  const [sqlPreviewOpen, setSqlPreviewOpen] = useState(true);
  const [sql, setSql] = useState('SELECT * FROM employees;');

  // 表单状态
  const [selectedTable, setSelectedTable] = useState('employees');
  const [allColumns, setAllColumns] = useState<ColumnInfo[]>([]);
  const [checkedCols, setCheckedCols] = useState<Set<string>>(new Set(['*']));
  const [conditions, setConditions] = useState<WhereCondition[]>([]);
  const [orderCol, setOrderCol] = useState('');
  const [orderDir, setOrderDir] = useState<'ASC' | 'DESC'>('ASC');
  const [limitCnt, setLimitCnt] = useState('100');

  // 加载选中表的列信息（带过期响应防护）
  const schemaSeq = useRef(0);
  useEffect(() => {
    if (!selectedTable) { setAllColumns([]); setCheckedCols(new Set()); return; }
    const reqId = ++schemaSeq.current;
    api.getTableSchema(selectedTable)
      .then((s) => {
        if (reqId !== schemaSeq.current) return; // 过期响应忽略
        setAllColumns(s.columns);
        // 初始化全部勾选
        setCheckedCols(new Set(s.columns.map((c) => c.name)));
        // 初始化一条空条件
        setConditions([createCondition(s.columns)]);
      })
      .catch(() => {
        if (reqId === schemaSeq.current) {
          setAllColumns([]);
          setCheckedCols(new Set());
        }
      });
  }, [selectedTable]);

  // 切换全选
  const toggleAllCols = () => {
    if (checkedCols.has('*') || checkedCols.size === allColumns.length) {
      setCheckedCols(new Set());
    } else {
      setCheckedCols(new Set(allColumns.map((c) => c.name)));
    }
  };

  // 勾选单列
  const toggleCol = (name: string) => {
    const next = new Set(checkedCols);
    next.delete('*');
    if (next.has(name)) next.delete(name); else next.add(name);
    setCheckedCols(next);
  };

  // 构建 SELECT SQL
  const buildSQL = useCallback(() => {
    if (!selectedTable) return '';

    const cols = checkedCols.size === 0
      ? '*'
      : Array.from(checkedCols).map((c) => `\`${c}\``).join(', ');

    let query = `SELECT ${cols}\nFROM ${selectedTable}`;

    const where = buildWhereClause(conditions);
    if (where) query += `\nWHERE ${where}`;

    if (orderCol) query += `\nORDER BY \`${orderCol}\` ${orderDir}`;

    // LIMIT 为空时给默认 100，防止无限制查询卡死浏览器
    const limitVal = limitCnt.trim() ? limitCnt : '100';
    query += `\nLIMIT ${limitVal}`;

    query += ';';
    return query;
  }, [selectedTable, checkedCols, conditions, orderCol, orderDir, limitCnt]);

  // 执行查询
  const handleExecute = useCallback(async () => {
    const query = mode === 'form' ? buildSQL() : sql;
    if (!query.trim()) return;
    if (mode === 'form') setSql(query); // 同步到 SQL 编辑器
    await execute(query);
  }, [mode, buildSQL, sql, execute]);

  // 重置
  const handleReset = () => {
    setCheckedCols(new Set(allColumns.map((c) => c.name)));
    setConditions([createCondition(allColumns)]);
    setOrderCol('');
    setOrderDir('ASC');
    setLimitCnt('100');
  };

  const SelectIcon = (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );

  return (
    <PageLayout
      title="SELECT"
      description="查询数据"
      icon={SelectIcon}
      toolbar={<ModeToggle mode={mode} onChange={setMode} />}
    >
      <div className="flex h-full overflow-hidden">
        {/* ====== 表单模式 ====== */}
        {mode === 'form' && (
          <>
            {/* 左侧：查询构建器 */}
            <div className="w-96 border-r border-[var(--border-color)] overflow-y-auto
              bg-[var(--bg-secondary)] p-4 flex flex-col gap-4">
              {/* 选表 */}
              <div>
                <label className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase">
                  选择表
                </label>
                <select
                  value={selectedTable}
                  onChange={(e) => setSelectedTable(e.target.value)}
                  className="w-full mt-1.5 px-3 py-2 text-sm rounded-lg border cursor-pointer
                    border-[var(--border-color)] bg-[var(--bg-primary)]
                    text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                >
                  {tables.map((t) => (
                    <option key={t.name} value={t.name}>{t.name}</option>
                  ))}
                </select>
              </div>

              {/* 选列 */}
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase">
                    选择列
                  </span>
                  <button
                    onClick={toggleAllCols}
                    className="text-[10px] text-[var(--accent)] hover:underline cursor-pointer"
                  >
                    {checkedCols.size === allColumns.length ? '取消全选' : '全选'}
                  </button>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {allColumns.map((col) => (
                    <label
                      key={col.name}
                      className={`flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border
                        cursor-pointer transition-colors
                        ${checkedCols.has(col.name)
                          ? 'bg-[var(--accent)]/10 border-[var(--accent)]/50 text-[var(--accent)]'
                          : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--accent)]/30'
                        }`}
                    >
                      <input
                        type="checkbox"
                        checked={checkedCols.has(col.name)}
                        onChange={() => toggleCol(col.name)}
                        className="sr-only"
                      />
                      {col.name}
                    </label>
                  ))}
                </div>
              </div>

              {/* WHERE 条件 */}
              <div>
                <span className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase">
                  WHERE 条件
                </span>
                <div className="mt-1.5">
                  <WhereConditionBuilder
                    conditions={conditions}
                    columns={allColumns}
                    onChange={setConditions}
                  />
                </div>
              </div>

              {/* ORDER + LIMIT */}
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                    ORDER BY
                  </label>
                  <select
                    value={orderCol}
                    onChange={(e) => setOrderCol(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs rounded border cursor-pointer
                      border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)]"
                  >
                    <option value="">(无)</option>
                    {allColumns.map((c) => (
                      <option key={c.name} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="w-16">
                  <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                    方向
                  </label>
                  <select
                    value={orderDir}
                    onChange={(e) => setOrderDir(e.target.value as 'ASC' | 'DESC')}
                    className="w-full px-2 py-1.5 text-xs rounded border cursor-pointer
                      border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)]"
                  >
                    <option value="ASC">ASC</option>
                    <option value="DESC">DESC</option>
                  </select>
                </div>
                <div className="w-20">
                  <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                    LIMIT
                  </label>
                  <input
                    type="number"
                    value={limitCnt}
                    onChange={(e) => setLimitCnt(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs rounded border font-mono
                      border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)]"
                  />
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-2 mt-auto pt-3 border-t border-[var(--border-color)]">
                <button
                  onClick={handleExecute}
                  disabled={isLoading || !selectedTable}
                  className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 text-sm
                    font-medium rounded-lg text-white transition-all cursor-pointer
                    bg-[var(--accent)] hover:bg-[var(--accent-hover)]
                    disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                >
                  {isLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      查询中...
                    </>
                  ) : (
                    <>🔍 查询</>
                  )}
                </button>
                <button
                  onClick={handleReset}
                  title="重置所有条件"
                  className="flex items-center gap-1 px-3 py-2 text-xs rounded-lg border cursor-pointer
                    border-[var(--border-color)] text-[var(--text-secondary)]
                    hover:bg-[var(--border-color)] transition-colors"
                >
                  🔄 重置
                </button>
              </div>

              {/* SQL 预览（可折叠） */}
              <div className="shrink-0">
                <button
                  onClick={() => setSqlPreviewOpen(!sqlPreviewOpen)}
                  className="flex items-center gap-1.5 w-full text-[10px] font-semibold
                    text-[var(--text-secondary)] uppercase tracking-wider
                    hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  <span className={`transition-transform ${sqlPreviewOpen ? 'rotate-90' : ''}`}>▶</span>
                  SQL 预览
                </button>
                {sqlPreviewOpen && (
                  <div className="mt-1">
                    <SqlHighlight sql={buildSQL()} className="max-h-28" />
                  </div>
                )}
              </div>
            </div>

            {/* 右侧：结果 */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2
                border-b border-[var(--border-color)] bg-[var(--bg-secondary)]">
                <span className="text-xs text-[var(--text-secondary)]">
                  {results.length > 0 && results[0].type === 'select' && (
                    <>
                      返回 <strong className="text-[var(--text-primary)]">{results[0].rowCount}</strong> 行
                      · {results[0].executionTimeMs}ms
                    </>
                  )}
                </span>
                <span className="text-[10px] text-[var(--text-secondary)]">
                  Ctrl+Enter 快捷执行
                </span>
              </div>
              <div className="flex-1 overflow-auto">
                {results.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-2 text-[var(--text-secondary)]">
                    <svg className="w-10 h-10 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <p className="text-sm">选择表、勾选列、添加条件</p>
                    <p className="text-xs opacity-60">然后点击「查询」按钮</p>
                  </div>
                ) : (
                  results.map((r: QueryResult, i: number) => (
                    <div key={i} className="border-b border-[var(--border-color)] last:border-b-0">
                      {r.type === 'select' && <ResultTable result={r} />}
                      {r.type === 'error' && <ErrorDisplay result={r} />}
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}

        {/* ====== SQL 模式 ====== */}
        {mode === 'sql' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div style={{ flex: '0 0 45%' }} className="border-b border-[var(--border-color)]">
              <SqlEditor
                value={sql}
                onChange={setSql}
                onExecute={handleExecute}
                theme={theme}
              />
            </div>
            <div className="flex items-center justify-between px-4 py-2
              border-b border-[var(--border-color)] bg-[var(--bg-secondary)]">
              <span className="text-xs text-[var(--text-secondary)]">
                输入 SELECT 语句，Ctrl+Enter 执行
              </span>
              <button
                onClick={handleExecute}
                disabled={isLoading}
                className="px-4 py-1.5 text-sm font-medium rounded-lg text-white
                  bg-[var(--accent)] hover:bg-[var(--accent-hover)] transition-all
                  disabled:opacity-40 cursor-pointer"
              >
                {isLoading ? '执行中...' : '▶ 执行'}
              </button>
            </div>
            <div className="flex-1 overflow-auto">
              {results.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-[var(--text-secondary)]">
                  <svg className="w-10 h-10 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <p className="text-sm">输入 SELECT 语句查询数据</p>
                </div>
              ) : (
                results.map((r: QueryResult, i: number) => (
                  <div key={i} className="border-b border-[var(--border-color)] last:border-b-0">
                    {r.type === 'select' && <ResultTable result={r} />}
                    {r.type === 'error' && <ErrorDisplay result={r} />}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
