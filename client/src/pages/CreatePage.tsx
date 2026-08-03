import { useState, useCallback, useEffect } from 'react';
import { PageLayout } from './shared/PageLayout';
import { ModeToggle } from './shared/ModeToggle';
import { SqlHighlight } from './shared/SqlHighlight';
import { ColumnValueForm, buildInsertSQL } from './shared/ColumnValueForm';
import { SqlEditor } from '../components/editor/SqlEditor';
import { ResultTable } from '../components/result/ResultTable';
import { ErrorDisplay } from '../components/result/ErrorDisplay';
import { DmlResult } from '../components/result/DmlResult';
import { useSqlExecute } from '../hooks/useSqlExecute';
import { useSchema } from '../hooks/useSchema';
import { api } from '../services/api';
import type { ColumnInfo, QueryResult } from '../types';

interface CreatePageProps {
  theme: 'light' | 'dark';
  tables: import('../types').TableInfo[];
  onRefreshTables: () => void;
}

const COLUMN_TYPES = [
  'INT', 'VARCHAR(50)', 'VARCHAR(100)', 'VARCHAR(255)', 'TEXT',
  'DECIMAL(10,2)', 'DATE', 'DATETIME', 'BOOLEAN', 'FLOAT', 'DOUBLE',
];

interface FieldDef {
  id: number;
  name: string;
  type: string;
  notNull: boolean;
  isPrimary: boolean;
}

let fieldId = 0;

export function CreatePage({ theme, tables, onRefreshTables }: CreatePageProps) {
  const { results, isLoading, execute } = useSqlExecute();
  const { fetchTables } = useSchema();

  const [mode, setMode] = useState<'form' | 'sql'>('form');
  const [sqlPreviewOpen, setSqlPreviewOpen] = useState(true);
  const [sql, setSql] = useState('');
  const [formTab, setFormTab] = useState<'build' | 'insert'>('build');

  // 建表表单
  const [tableName, setTableName] = useState('');
  const [fields, setFields] = useState<FieldDef[]>([
    { id: ++fieldId, name: '', type: 'INT', notNull: true, isPrimary: true },
  ]);

  // 插入数据表单
  const [insertTable, setInsertTable] = useState('employees');
  const [colValues, setColValues] = useState<Record<string, string>>({});
  const [insertCols, setInsertCols] = useState<ColumnInfo[]>([]);

  // 加载选中表的列
  useEffect(() => {
    if (!insertTable) return;
    api.getTableSchema(insertTable)
      .then((s) => { setInsertCols(s.columns); setColValues({}); })
      .catch(() => {});
  }, [insertTable]);

  // 建表-添加字段
  const addField = () => setFields([
    ...fields,
    { id: ++fieldId, name: '', type: 'VARCHAR(50)', notNull: false, isPrimary: false },
  ]);

  // 建表-更新字段
  const updateField = (id: number, key: keyof FieldDef, val: string | boolean) => {
    setFields(fields.map((f) => (f.id === id ? { ...f, [key]: val } : f)));
  };

  // 建表-移除字段
  const removeField = (id: number) => {
    if (fields.length <= 1) return;
    setFields(fields.filter((f) => f.id !== id));
  };

  // 生成当前 Tab 的 SQL
  const buildSQL = useCallback(() => {
    if (formTab === 'build') {
      if (!tableName.trim()) return '';
      const cols = fields
        .filter((f) => f.name.trim())
        .map((f) => {
          let col = `  \`${f.name}\` ${f.type}`;
          if (f.notNull) col += ' NOT NULL';
          if (f.isPrimary) col += ' PRIMARY KEY';
          return col;
        });
      if (cols.length === 0) return '';
      return `CREATE TABLE IF NOT EXISTS \`${tableName}\` (\n${cols.join(',\n')}\n);`;
    } else {
      return buildInsertSQL(insertTable, colValues, insertCols);
    }
  }, [formTab, tableName, fields, insertTable, colValues, insertCols]);

  // 建表-生成并执行
  const handleBuildTable = useCallback(async () => {
    if (!tableName.trim()) return;
    const cols = fields
      .filter((f) => f.name.trim())
      .map((f) => {
        let col = `  \`${f.name}\` ${f.type}`;
        if (f.notNull) col += ' NOT NULL';
        if (f.isPrimary) col += ' PRIMARY KEY';
        return col;
      });
    if (cols.length === 0) return;
    const query = `CREATE TABLE IF NOT EXISTS \`${tableName}\` (\n${cols.join(',\n')}\n);`;
    setSql(query);
    await execute(query);
    onRefreshTables();
    fetchTables();
  }, [tableName, fields, execute, onRefreshTables, fetchTables]);

  // 插入数据-执行
  const handleInsert = useCallback(async () => {
    if (!insertTable) return;
    const query = buildInsertSQL(insertTable, colValues, insertCols);
    if (!query) return;
    setSql(query);
    await execute(query);
    onRefreshTables();
    setColValues({});
  }, [insertTable, colValues, insertCols, execute, onRefreshTables]);

  // SQL 模式执行
  const handleExecuteSQL = useCallback(async () => {
    if (!sql.trim()) return;
    const execResults = await execute(sql);
    if (execResults) {
      onRefreshTables();
      fetchTables();
      }
  }, [sql, execute, onRefreshTables, fetchTables]);

  const CreateIcon = (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  );

  return (
    <PageLayout
      title="CREATE"
      description="创建表或插入数据"
      icon={CreateIcon}
      toolbar={<ModeToggle mode={mode} onChange={setMode} />}
    >
      <div className="flex h-full overflow-hidden">
        {/* ====== 表单模式 ====== */}
        {mode === 'form' && (
          <>
            {/* 左侧：表单面板 */}
            <div className="w-96 border-r border-[var(--border-color)] overflow-y-auto
              bg-[var(--bg-secondary)] flex flex-col">
              {/* 子 Tab */}
              <div className="flex border-b border-[var(--border-color)]">
                <button
                  onClick={() => setFormTab('build')}
                  className={`flex-1 py-2.5 text-xs font-semibold transition-colors cursor-pointer
                    ${formTab === 'build'
                      ? 'text-[var(--accent)] border-b-2 border-[var(--accent)] bg-[var(--bg-primary)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                >
                  🏗️ 建表
                </button>
                <button
                  onClick={() => setFormTab('insert')}
                  className={`flex-1 py-2.5 text-xs font-semibold transition-colors cursor-pointer
                    ${formTab === 'insert'
                      ? 'text-[var(--accent)] border-b-2 border-[var(--accent)] bg-[var(--bg-primary)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                >
                  ➕ 插入数据
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {/* ====== 建表 Tab ====== */}
                {formTab === 'build' && (
                  <div className="flex flex-col gap-4">
                    <div>
                      <label className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase">
                        表名
                      </label>
                      <input
                        type="text"
                        value={tableName}
                        onChange={(e) => setTableName(e.target.value)}
                        placeholder="my_table"
                        className="w-full mt-1.5 px-3 py-2 text-sm rounded-lg border font-mono
                          border-[var(--border-color)] bg-[var(--bg-primary)]
                          text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase">
                        字段 ({fields.length})
                      </label>
                      <div className="mt-1.5 space-y-1.5">
                        {fields.map((f) => (
                          <div key={f.id} className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={f.name}
                              onChange={(e) => updateField(f.id, 'name', e.target.value)}
                              placeholder="列名"
                              className="flex-1 px-2 py-1.5 text-xs rounded border font-mono
                                border-[var(--border-color)] bg-[var(--bg-primary)]
                                text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                            />
                            <select
                              value={f.type}
                              onChange={(e) => updateField(f.id, 'type', e.target.value)}
                              className="w-24 px-1.5 py-1.5 text-xs rounded border cursor-pointer
                                border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)]"
                            >
                              {COLUMN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                            <button
                              onClick={() => updateField(f.id, 'notNull', !f.notNull)}
                              className={`px-2 py-1.5 text-[10px] rounded border font-bold cursor-pointer
                                ${f.notNull
                                  ? 'bg-[var(--accent)]/10 border-[var(--accent)] text-[var(--accent)]'
                                  : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--accent)]/50'
                                }`}
                            >
                              NN
                            </button>
                            <button
                              onClick={() => removeField(f.id)}
                              className="p-1 text-[var(--text-secondary)] hover:text-[var(--error)]
                                cursor-pointer shrink-0"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={addField}
                        className="mt-2 w-full px-3 py-2 text-xs rounded-lg border border-dashed
                          border-[var(--border-color)] text-[var(--text-secondary)]
                          hover:border-[var(--accent)] hover:text-[var(--accent)]
                          transition-colors cursor-pointer"
                      >
                        + 添加字段
                      </button>
                    </div>

                    <button
                      onClick={handleBuildTable}
                      disabled={isLoading || !tableName.trim()}
                      className="w-full px-4 py-2.5 text-sm font-medium rounded-lg text-white
                        bg-[var(--accent)] hover:bg-[var(--accent-hover)] transition-all
                        disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-sm"
                    >
                      {isLoading ? '执行中...' : '🔄 生成并执行'}
                    </button>

                    {/* SQL 预览 */}
                    <div className="shrink-0 mt-4">
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
                )}

                {/* ====== 插入数据 Tab ====== */}
                {formTab === 'insert' && (
                  <div className="flex flex-col gap-4">
                    <div>
                      <label className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase">
                        选择表
                      </label>
                      <select
                        value={insertTable}
                        onChange={(e) => {
                          setInsertTable(e.target.value);
                          setColValues({});
                        }}
                        className="w-full mt-1.5 px-3 py-2 text-sm rounded-lg border cursor-pointer
                          border-[var(--border-color)] bg-[var(--bg-primary)]
                          text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                      >
                        {tables.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase">
                        填写数据
                      </label>
                      <div className="mt-1.5">
                        <ColumnValueForm
                          tableName={insertTable}
                          values={colValues}
                          onChange={setColValues}
                          mode="insert"
                        />
                      </div>
                    </div>

                    <button
                      onClick={handleInsert}
                      disabled={isLoading || Object.values(colValues).filter((v) => v.trim()).length === 0}
                      className="w-full px-4 py-2.5 text-sm font-medium rounded-lg text-white
                        bg-[var(--accent)] hover:bg-[var(--accent-hover)] transition-all
                        disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-sm"
                    >
                      {isLoading ? '插入中...' : '➕ 插入数据'}
                    </button>

                    {/* SQL 预览 */}
                    <div className="shrink-0 mt-4">
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
                )}
              </div>
            </div>

            {/* 右侧：结果区 */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2
                border-b border-[var(--border-color)] bg-[var(--bg-secondary)]">
                <span className="text-xs text-[var(--text-secondary)]">
                  {results.length > 0 ? `${results.length} 条结果` : '执行结果显示区'}
                </span>
                <span className="text-[10px] text-[var(--text-secondary)]">
                  Ctrl+Enter
                </span>
              </div>
              <div className="flex-1 overflow-auto">
                {results.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-2 text-[var(--text-secondary)]">
                    <svg className="w-8 h-8 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    <p className="text-sm">建表或插入数据后查看结果</p>
                  </div>
                ) : (
                  results.map((r: QueryResult, i: number) => (
                    <div key={i} className="border-b border-[var(--border-color)] last:border-b-0">
                      {r.type === 'select' && <ResultTable result={r} />}
                      {r.type === 'error' && <ErrorDisplay result={r} />}
                      {['insert', 'update', 'delete', 'ddl'].includes(r.type) && <DmlResult result={r} />}
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
            <div style={{ flex: '0 0 50%' }} className="border-b border-[var(--border-color)]">
              <SqlEditor
                value={sql || 'CREATE TABLE my_table (\n  id INT AUTO_INCREMENT PRIMARY KEY,\n  name VARCHAR(100)\n);'}
                onChange={setSql}
                onExecute={handleExecuteSQL}
                theme={theme}
              />
            </div>
            <div className="flex items-center px-4 py-2 border-b border-[var(--border-color)]
              bg-[var(--bg-secondary)]">
              <button
                onClick={handleExecuteSQL}
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
                  <p className="text-sm">执行 CREATE TABLE 或 INSERT 语句</p>
                </div>
              ) : (
                results.map((r: QueryResult, i: number) => (
                  <div key={i} className="border-b border-[var(--border-color)] last:border-b-0">
                    {r.type === 'select' && <ResultTable result={r} />}
                    {r.type === 'error' && <ErrorDisplay result={r} />}
                    {['insert', 'update', 'delete', 'ddl'].includes(r.type) && <DmlResult result={r} />}
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
