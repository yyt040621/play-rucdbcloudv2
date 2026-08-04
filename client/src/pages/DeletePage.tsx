import { useState, useCallback, useEffect, useRef } from 'react';
import { PageLayout } from './shared/PageLayout';
import { ModeToggle } from './shared/ModeToggle';
import { SqlHighlight } from './shared/SqlHighlight';
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

interface DeletePageProps {
  onRefreshTables: () => void;
}

const PROTECTED = ['employees', 'orders'];

type PendingAction = { type: 'delete'; sql: string } | { type: 'drop'; sql: string };

export function DeletePage({ onRefreshTables }: DeletePageProps) {
  const { results, isLoading, execute } = useSqlExecute();
  const { fetchTables } = useSchema();

  const [mode, setMode] = useState<'form' | 'sql'>('form');
  const [sqlPreviewOpen, setSqlPreviewOpen] = useState(true);
  const [sql, setSql] = useState('');

  // 表单
  const [tableList, setTableList] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState('');
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [conditions, setConditions] = useState<WhereCondition[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [previewTrigger, setPreviewTrigger] = useState(0);
  const [blockedMsg, setBlockedMsg] = useState<string | null>(null);
  const sqlRef = useRef(sql);
  sqlRef.current = sql;

  // 加载表
  useEffect(() => {
    api.getTables().then((t) => setTableList(t.map((x) => x.name))).catch(() => {});
  }, []);

  // 加载列
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

  const isProtected = PROTECTED.includes(selectedTable);
  const hasWhere = !!buildWhereClause(conditions);

  // 构建 DELETE SQL
  const buildSQL = useCallback(() => {
    if (!selectedTable) return '';
    let query = `DELETE FROM ${selectedTable}`;
    const where = buildWhereClause(conditions);
    if (where) query += `\nWHERE ${where}`;
    else query += `\n-- ⚠️ 没有 WHERE 条件！`;
    query += ';';
    return query;
  }, [selectedTable, conditions]);

  // 删除数据 → 弹出确认
  const handleDelete = useCallback(() => {
    const query = mode === 'form' ? buildSQL() : sqlRef.current;
    if (!query.trim()) return;

    // SQL 模式下拦截对受保护表的 DROP / TRUNCATE
    if (mode === 'sql') {
      const isDropOrTruncate = /^\s*(DROP TABLE|TRUNCATE TABLE)\b/i.test(query);
      if (isDropOrTruncate) {
        for (const p of PROTECTED) {
          if (new RegExp(`\\b${p}\\b`, 'i').test(query)) {
            setShowConfirm(false);
            setPendingAction(null);
            setBlockedMsg(`表 ${p} 是受保护表，不允许 DROP / TRUNCATE`);
            return;
          }
        }
      }
    }

    setBlockedMsg(null);
    setPendingAction({ type: 'delete', sql: query });
    setShowConfirm(true);
  }, [mode, buildSQL]);

  // DROP TABLE → 弹出确认
  const handleDropTable = useCallback(() => {
    if (!selectedTable || isProtected) return;
    const dropSQL = `DROP TABLE IF EXISTS ${selectedTable};`;
    setPendingAction({ type: 'drop', sql: dropSQL });
    setShowConfirm(true);
  }, [selectedTable, isProtected]);

  // 确认后执行
  const doExecute = useCallback(async () => {
    setShowConfirm(false);
    if (!pendingAction) return;

    const execResults = await execute(pendingAction.sql);
    if (execResults) {
      onRefreshTables();
      fetchTables();
      setPreviewTrigger((p) => p + 1);
      if (pendingAction.type === 'drop') {
        setSelectedTable('');
        setColumns([]);
        setConditions([]);
      }
    }
    setPendingAction(null);
  }, [pendingAction, execute, onRefreshTables, fetchTables]);

  const DeleteIcon = (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  );

  // 确认弹窗的内容
  const confirmTitle = pendingAction?.type === 'drop'
    ? '确认删除表'
    : '确认删除';

  const confirmMessage = pendingAction?.type === 'drop'
    ? `将永久删除表 ${selectedTable} 及其全部数据。此操作不可撤销！确定继续？`
    : hasWhere
      ? `将从 ${selectedTable} 表中删除符合 WHERE 条件的行。此操作不可撤销。确定继续？`
      : `未检测到 WHERE 条件！将从 ${selectedTable} 表中删除所有行。此操作不可撤销。确定继续？`;

  return (
    <>
      <PageLayout
        title="DELETE"
        description="删除数据（需要确认）"
        icon={DeleteIcon}
        toolbar={<ModeToggle mode={mode} onChange={setMode} />}
      >
        <div className="flex h-full overflow-hidden">
          {/* ====== 表单模式 ====== */}
          {mode === 'form' && (
            <>
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
                    {tableList.map((t) => (
                      <option key={t} value={t}>
                        {t}{PROTECTED.includes(t) ? ' (受保护)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* WHERE */}
                {selectedTable && (
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
                  </div>
                )}

                {/* 安全警告区 */}
                {selectedTable && (
                  <div className="space-y-2">
                    {!hasWhere && (
                      <div className="px-3 py-2.5 text-xs rounded-lg flex items-start gap-2
                        bg-[var(--error-bg)] border border-[var(--error)]/30 text-[var(--error)]">
                        <Icon name="warning" className="w-4 h-4 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold mb-0.5">危险：没有 WHERE 条件</p>
                          <p className="opacity-80">此 DELETE 将删除表中 <strong>所有行</strong>！</p>
                        </div>
                      </div>
                    )}

                    {isProtected && (
                      <div className="px-3 py-2.5 text-xs rounded-lg flex items-start gap-2
                        bg-[var(--bg-secondary)] border border-[var(--border-color)]">
                        <Icon name="shield" className="w-4 h-4 shrink-0 mt-0.5 text-[var(--primary)]" />
                        <div>
                          <p className="font-semibold mb-1">受保护的表</p>
                          <p className="text-[var(--text-secondary)] opacity-80">
                            <code className="text-[11px] bg-[var(--border-color)]/50 px-1 rounded">
                              {selectedTable}
                            </code> 不允许 DROP / TRUNCATE。
                            DELETE 必须带 WHERE 条件。
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 执行按钮 */}
                {selectedTable && (
                  <div className="flex flex-col gap-2 mt-auto pt-3 border-t border-[var(--border-color)]">
                    <Button
                      onClick={handleDelete}
                      disabled={isLoading}
                      loading={isLoading}
                      variant="danger"
                      className="w-full"
                    >
                      {isLoading ? '执行中...' : (<><Icon name="trash" className="w-4 h-4" />删除数据</>)}
                    </Button>

                    {!isProtected && (
                      <Button
                        variant="danger"
                        onClick={handleDropTable}
                        className="w-full"
                      >
                        <Icon name="alert" className="w-3.5 h-3.5" />
                        DROP TABLE {selectedTable}
                      </Button>
                    )}
                  </div>
                )}

                {/* SQL 预览（可折叠） */}
                {selectedTable && (
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
                )}
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
              {blockedMsg && (
                <div className="px-4 py-2 text-xs flex items-start gap-1.5
                  bg-[var(--error-bg)] border-b border-[var(--error)]/30 text-[var(--error)]">
                  <Icon name="ban" className="w-4 h-4 shrink-0" />
                  <span>{blockedMsg}</span>
                </div>
              )}
              <div style={{ flex: '0 0 45%' }} className="border-b border-[var(--border-color)]">
                <SqlEditor
                  value={sql || "DELETE FROM orders\nWHERE status = 'cancelled';"}
                  onChange={setSql}
                  onExecute={handleDelete}
                />
              </div>
              <div className="flex items-center px-4 py-2 border-b border-[var(--border-color)] bg-[var(--bg-secondary)]">
                <span className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                  <Icon name="warning" className="w-4 h-4 text-[var(--warning)]" />
                  DELETE / DROP 操作需要二次确认
                </span>
                <Button
                  onClick={handleDelete}
                  disabled={isLoading}
                  loading={isLoading}
                  variant="danger"
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

      {/* 确认弹窗 */}
      <ConfirmDialog
        open={showConfirm}
        title={confirmTitle}
        message={confirmMessage}
        confirmLabel={pendingAction?.type === 'drop' ? '确认删除表' : '确认删除'}
        cancelLabel="取消"
        variant="danger"
        onConfirm={doExecute}
        onCancel={() => { setShowConfirm(false); setPendingAction(null); }}
      />
    </>
  );
}
