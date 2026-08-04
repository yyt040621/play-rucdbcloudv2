import { useState, useCallback, useEffect, useRef } from 'react';
import { PageLayout } from './shared/PageLayout';
import { ModeToggle } from './shared/ModeToggle';
import { SqlHighlight } from './shared/SqlHighlight';
import { formatSqlValue } from './shared/sql-escape';
import {
  WhereConditionBuilder, createCondition, buildWhereClause,
  type WhereCondition,
} from './shared/WhereConditionBuilder';
import { TableDataPreview } from './shared/TableDataPreview';
import { SqlEditor } from '../components/editor/SqlEditor';
import { ResultTable } from '../components/result/ResultTable';
import { ErrorDisplay } from '../components/result/ErrorDisplay';
import { DmlResult } from '../components/result/DmlResult';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { useSqlExecute } from '../hooks/useSqlExecute';
import { useSchema } from '../hooks/useSchema';
import { api } from '../services/api';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';
import type { ColumnInfo, QueryResult } from '../types';

interface UpdatePageProps {
  onRefreshTables: () => void;
}

interface SetItem {
  id: number;
  column: string;
  value: string;
}

let setId = 0;

export function UpdatePage({ onRefreshTables }: UpdatePageProps) {
  const { results, isLoading, execute } = useSqlExecute();
  const { fetchTables } = useSchema();

  const [mode, setMode] = useState<'form' | 'sql'>('form');
  const [sqlPreviewOpen, setSqlPreviewOpen] = useState(true);
  const [sql, setSql] = useState('');
  // 执行错误提示（醒目横幅）
  const [execError, setExecError] = useState<string | null>(null);

  // 表单
  const [tableList, setTableList] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState('');
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [setItems, setSetItems] = useState<SetItem[]>([{ id: ++setId, column: '', value: '' }]);
  const [conditions, setConditions] = useState<WhereCondition[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [previewTrigger, setPreviewTrigger] = useState(0);

  // 加载表
  useEffect(() => {
    api.getTables().then((t) => setTableList(t.map((x) => x.name))).catch(() => {});
  }, []);

  // 加载列（带过期响应防护）
  const schemaSeq = useRef(0);
  useEffect(() => {
    if (!selectedTable) { setColumns([]); setConditions([]); return; }
    const reqId = ++schemaSeq.current;
    api.getTableSchema(selectedTable)
      .then((s) => {
        if (reqId !== schemaSeq.current) return;
        setColumns(s.columns);
        setConditions([createCondition(s.columns)]);
      })
      .catch(() => {
        if (reqId === schemaSeq.current) setColumns([]);
      });
  }, [selectedTable]);

  // 构建 SQL
  const buildSQL = useCallback(() => {
    if (!selectedTable) return '';
    const sets = setItems
      .filter((s) => s.column && s.value.trim())
      .map((s) => {
        const col = columns.find((c) => c.name === s.column);
        return `  "${s.column}" = ${formatSqlValue(s.value, col?.type)}`;
      });
    if (sets.length === 0) return '';

    let query = `UPDATE ${selectedTable}\nSET\n${sets.join(',\n')}`;
    const where = buildWhereClause(conditions);
    if (where) query += `\nWHERE ${where}`;
    else query += `\n-- ⚠️ 没有 WHERE 条件！`;
    query += ';';
    return query;
  }, [selectedTable, setItems, conditions, columns]);

  const handleExecute = useCallback(async () => {
    const query = mode === 'form' ? buildSQL() : sql;
    if (!query.trim()) return;

    if (mode === 'form') {
      const hasWhere = buildWhereClause(conditions);
      if (!hasWhere) { setShowConfirm(true); return; }
      setSql(query);
    } else {
      // SQL 模式同样检测 WHERE —— 无 WHERE 必须确认（防全表更新）
      const isUpdate = /^\s*UPDATE\b/i.test(query);
      const hasWhere = /\bWHERE\s+/i.test(query);
      if (isUpdate && !hasWhere) { setShowConfirm(true); return; }
    }

    setExecError(null);
    const execResults = await execute(query);
    if (execResults) {
      // 检查是否有 SQL 错误，若有则显示醒目横幅
      const sqlError = execResults.find((r) => r.type === 'error');
      if (sqlError) {
        setExecError(sqlError.message || '执行失败');
      } else {
        onRefreshTables();
        fetchTables();
        setPreviewTrigger((p) => p + 1);
      }
    }
  }, [mode, buildSQL, sql, conditions, execute, onRefreshTables, fetchTables]);

  // SET 操作
  const addSetItem = () => setSetItems([...setItems, { id: ++setId, column: '', value: '' }]);
  const updateSetItem = (id: number, key: 'column' | 'value', val: string) => {
    setSetItems(setItems.map((s) => (s.id === id ? { ...s, [key]: val } : s)));
  };
  const removeSetItem = (id: number) => {
    if (setItems.length <= 1) return;
    setSetItems(setItems.filter((s) => s.id !== id));
  };

  const UpdateIcon = (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
    </svg>
  );

  return (
    <>
      <PageLayout
        title="UPDATE"
        description="修改数据"
        icon={UpdateIcon}
        toolbar={<ModeToggle mode={mode} onChange={setMode} />}
      >
        <div className="flex h-full overflow-hidden">
          {/* ====== 表单模式 ====== */}
          {mode === 'form' && (
            <>
              {execError && (
                <div className="px-4 py-2.5 text-xs bg-[var(--error-bg)] border-b border-[var(--error)]/30 text-[var(--error)] flex items-start gap-2">
                  <Icon name="warning" className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="font-mono break-all">{execError}</span>
                </div>
              )}
              <div className="w-96 border-r border-[var(--border-color)] overflow-y-auto
                bg-[var(--bg-primary)] p-4 flex flex-col gap-4">
                {/* 选表 */}
                <div>
                  <label className="block text-[13px] font-semibold text-[var(--text-primary)]">
                    选择表
                  </label>
                  <select
                    value={selectedTable}
                    onChange={(e) => setSelectedTable(e.target.value)}
                    className="select mt-1.5"
                  >
                    <option value="">选择表...</option>
                    {tableList.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                {/* SET */}
                <div>
                  <span className="block text-[13px] font-semibold text-[var(--text-primary)]">
                    SET (要修改的列)
                  </span>
                  <div className="mt-1.5 space-y-1.5">
                    {setItems.map((s) => (
                      <div key={s.id} className="flex items-center gap-1.5">
                        <select
                          value={s.column}
                          onChange={(e) => updateSetItem(s.id, 'column', e.target.value)}
                          className="select flex-1 font-mono !py-1.5 !text-xs"
                        >
                          <option value="">列名</option>
                          {columns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                        </select>
                        <input
                          type="text"
                          value={s.value}
                          onChange={(e) => updateSetItem(s.id, 'value', e.target.value)}
                          placeholder="新值"
                          className="input flex-1 font-mono !py-1.5 !text-xs"
                        />
                        <button
                          onClick={() => removeSetItem(s.id)}
                          className="p-1 text-[var(--text-secondary)] hover:text-[var(--error)] cursor-pointer"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={addSetItem}
                    className="mt-1.5 w-full px-3 py-1.5 text-xs rounded-lg border border-dashed
                      border-[var(--border-color)] text-[var(--text-secondary)]
                      hover:border-[var(--accent)] transition-colors cursor-pointer"
                  >
                    + 添加修改项
                  </button>
                </div>

                {/* WHERE */}
                <div>
                  <span className="block text-[13px] font-semibold text-[var(--text-primary)]">
                    WHERE 条件
                  </span>
                  <div className="mt-1.5">
                    <WhereConditionBuilder
                      conditions={conditions}
                      columns={columns}
                      onChange={setConditions}
                    />
                  </div>
                  {!buildWhereClause(conditions) && (
                    <div className="mt-2 px-3 py-2 text-xs rounded-lg flex items-start gap-1.5
                      bg-[var(--warning-bg)] border border-[var(--warning)]/30 text-[var(--warning)]">
                      <Icon name="warning" className="w-4 h-4 shrink-0" />
                      <span>无 WHERE 条件将修改所有行，执行前会需要确认</span>
                    </div>
                  )}
                </div>

                {/* 执行 */}
                <Button
                  onClick={handleExecute}
                  disabled={isLoading || !selectedTable}
                  loading={isLoading}
                  className="w-full"
                >
                  {isLoading ? '更新中...' : (<><Icon name="pencil" className="w-4 h-4" />更新</>)}
                </Button>

                {/* SQL 预览（可折叠） */}
                <div className="shrink-0">
                  <button
                    onClick={() => setSqlPreviewOpen(!sqlPreviewOpen)}
                    className="flex items-center gap-1.5 w-full text-xs font-semibold
                      text-[var(--text-secondary)]
                      hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                  >
                    <Icon name="chevron" className={`w-3.5 h-3.5 transition-transform ${sqlPreviewOpen ? 'rotate-90' : ''}`} />
                    SQL 预览
                  </button>
                  {sqlPreviewOpen && (
                    <div className="mt-1">
                      <SqlHighlight sql={buildSQL()} className="max-h-28" />
                    </div>
                  )}
                </div>
              </div>

              {/* 右侧：预览 + 结果 */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* 数据预览区 — 自动填满空间 */}
                {selectedTable && (
                  <div className="flex-1 overflow-auto border-b border-[var(--border-color)]">
                    <TableDataPreview
                      tableName={selectedTable}
                      refreshTrigger={previewTrigger}
                      limit={50}
                    />
                  </div>
                )}

                {/* 结果区 — 有结果时才显示 */}
                {results.length > 0 && (
                  <div className="shrink-0 border-t-2 border-[var(--accent)]/30 max-h-[40%] overflow-auto">
                    <div className="px-3 py-1.5 text-[10px] font-semibold text-[var(--text-secondary)]
                      uppercase tracking-wider bg-[var(--bg-secondary)] border-b border-[var(--border-color)]">
                      执行结果
                    </div>
                    {results.map((r: QueryResult, i: number) => (
                      <div key={i} className="border-b border-[var(--border-color)] last:border-b-0">
                        {r.type === 'select' && <ResultTable result={r} />}
                        {r.type === 'error' && <ErrorDisplay result={r} />}
                        {['insert', 'update', 'delete', 'ddl'].includes(r.type) && <DmlResult result={r} />}
                      </div>
                    ))}
                  </div>
                )}

                {/* 未选表提示 */}
                {!selectedTable && (
                  <div className="flex-1 flex items-center justify-center text-sm text-[var(--text-secondary)] opacity-40">
                    选择表开始操作
                  </div>
                )}
              </div>
            </>
          )}

          {/* ====== SQL 模式 ====== */}
          {mode === 'sql' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {execError && (
                <div className="px-4 py-2.5 text-xs bg-[var(--error-bg)] border-b border-[var(--error)]/30 text-[var(--error)] flex items-start gap-2">
                  <Icon name="warning" className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="font-mono break-all">{execError}</span>
                </div>
              )}
              <div style={{ flex: '0 0 45%' }} className="border-b border-[var(--border-color)]">
                <SqlEditor
                  value={sql || "UPDATE employees\nSET salary = 20000\nWHERE id = 1;"}
                  onChange={setSql}
                  onExecute={handleExecute}
                />
              </div>
              <div className="flex items-center px-4 py-2 border-b border-[var(--border-color)] bg-[var(--bg-secondary)]">
                <span className="text-xs text-[var(--text-secondary)]">Ctrl+Enter 执行</span>
                <Button
                  onClick={handleExecute}
                  disabled={isLoading}
                  loading={isLoading}
                  size="sm"
                  className="ml-auto"
                >
                  {isLoading ? '执行中...' : (<><Icon name="play" className="w-3.5 h-3.5" />执行</>)}
                </Button>
              </div>
              <div className="flex-1 overflow-auto">
                {results.map((r: QueryResult, i: number) => (
                  <div key={i} className="border-b border-[var(--border-color)] last:border-b-0">
                    {r.type === 'select' && <ResultTable result={r} />}
                    {r.type === 'error' && <ErrorDisplay result={r} />}
                    {['insert', 'update', 'delete', 'ddl'].includes(r.type) && <DmlResult result={r} />}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </PageLayout>

      <ConfirmDialog
        open={showConfirm}
        title="没有 WHERE 条件"
        message="此 UPDATE 将修改表中所有行！确定继续？"
        confirmLabel="我确定"
        cancelLabel="取消"
        variant="danger"
        onConfirm={async () => {
          setShowConfirm(false);
          const query = mode === 'form' ? buildSQL() : sql;
          await execute(query);
          onRefreshTables();
          setPreviewTrigger((p) => p + 1);
        }}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  );
}
