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
  // 建表校验错误提示
  const [buildError, setBuildError] = useState<string | null>(null);
  // 建表警告提示（不阻止，如只有主键列）
  const [buildWarning, setBuildWarning] = useState<string | null>(null);

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
  const addField = () => {
    setFields([
      ...fields,
      { id: ++fieldId, name: '', type: 'VARCHAR(50)', notNull: false, isPrimary: false },
    ]);
    setBuildError(null);
    setBuildWarning(null);
  };

  // 建表-更新字段
  const updateField = (id: number, key: keyof FieldDef, val: string | boolean) => {
    setFields(fields.map((f) => (f.id === id ? { ...f, [key]: val } : f)));
    setBuildError(null);
    setBuildWarning(null);
  };

  // 建表-移除字段
  const removeField = (id: number) => {
    if (fields.length <= 1) return;
    setFields(fields.filter((f) => f.id !== id));
    setBuildError(null);
    setBuildWarning(null);
  };

  // 切换主键（单选：设某列为主键时，其他列取消主键；主键强制 NOT NULL）
  const togglePrimary = (id: number) => {
    setFields(fields.map((f) => {
      if (f.id === id) {
        const isPrimary = !f.isPrimary;
        return { ...f, isPrimary, notNull: isPrimary ? true : f.notNull };
      }
      return { ...f, isPrimary: false };
    }));
    setBuildError(null);
    setBuildWarning(null);
  };

  // 校验建表表单，返回错误数组（空 = 通过）
  const validateTable = (): string[] => {
    const errors: string[] = [];

    // 1. 表名
    if (!tableName.trim()) {
      errors.push('请输入表名');
    } else if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tableName)) {
      errors.push('表名只能包含字母、数字、下划线，且不能以数字开头');
    }

    // 2. 有效字段（列名非空）
    const validCols = fields.filter((f) => f.name.trim());
    if (validCols.length === 0) {
      errors.push('至少需要一个有效字段（填写列名）');
    } else {
      // 3. 列名唯一
      const seen = new Set<string>();
      for (const f of validCols) {
        const name = f.name.trim().toLowerCase();
        if (seen.has(name)) {
          errors.push(`列名重复: "${f.name}"`);
          break;
        }
        seen.add(name);
      }
      // 4. 列名合法性
      for (const f of validCols) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(f.name.trim())) {
          errors.push(`列名 "${f.name}" 非法（只能包含字母、数字、下划线，不能以数字开头）`);
          break;
        }
      }
      // 5. 主键：至少一个，且最多一个（MySQL 单列主键只能一个）
      const primaryCols = validCols.filter((f) => f.isPrimary);
      if (primaryCols.length === 0) {
        errors.push('请至少选择一个主键（点击 PK 按钮）');
      } else if (primaryCols.length > 1) {
        errors.push('只能选择一个主键（当前选中多个 PK，请只保留一个）');
      }
    }

    return errors;
  };

  // 生成单列定义（整数主键自动加 AUTO_INCREMENT，插入时自动生成）
  const buildColumnDef = useCallback((f: FieldDef): string => {
    let col = `  \`${f.name}\` ${f.type}`;
    const isIntType = /INT|BIGINT|SMALLINT|TINYINT/.test(f.type);
    if (f.isPrimary && isIntType) col += ' AUTO_INCREMENT';
    if (f.notNull) col += ' NOT NULL';
    if (f.isPrimary) col += ' PRIMARY KEY';
    return col;
  }, []);

  // 生成当前 Tab 的 SQL
  const buildSQL = useCallback(() => {
    if (formTab === 'build') {
      if (!tableName.trim()) return '';
      const cols = fields
        .filter((f) => f.name.trim())
        .map((f) => buildColumnDef(f));
      if (cols.length === 0) return '';
      return `CREATE TABLE \`${tableName}\` (\n${cols.join(',\n')}\n);`;
    } else {
      return buildInsertSQL(insertTable, colValues, insertCols);
    }
  }, [formTab, tableName, fields, insertTable, colValues, insertCols]);

  // 建表-生成并执行（先校验）
  const handleBuildTable = useCallback(async () => {
    // 校验表单
    const errors = validateTable();
    if (errors.length > 0) {
      setBuildError(errors[0]);
      return;
    }
    setBuildError(null);
    setBuildWarning(null);

    // 检查表是否已存在（避免静默覆盖）
    const exists = tables.some((t) => t.name === tableName);
    if (exists) {
      setBuildError(`表 "${tableName}" 已存在。请使用其他表名，或先删除该表再重建`);
      return;
    }

    // 提示：只有主键列、无业务字段时给出警告（不阻止）
    const validCols = fields.filter((f) => f.name.trim());
    const hasBusinessCol = validCols.some((f) => !f.isPrimary);
    setBuildWarning(
      !hasBusinessCol
        ? '提示：该表只有主键列，没有业务字段。通常建议至少添加一个普通字段（如名称、描述等）'
        : null
    );

    const cols = fields
      .filter((f) => f.name.trim())
      .map((f) => buildColumnDef(f));
    if (cols.length === 0) return;
    const query = `CREATE TABLE \`${tableName}\` (\n${cols.join(',\n')}\n);`;
    setSql(query);
    const execResults = await execute(query);
    if (execResults) {
      const hasError = execResults.some((r) => r.type === 'error');
      if (!hasError) {
        // 建表成功 → 自动切到「插入数据」tab 并选中新表，方便直接插入
        setInsertTable(tableName);
        setFormTab('insert');
      }
      onRefreshTables();
      fetchTables();
    }
  }, [tableName, fields, tables, buildColumnDef, execute, onRefreshTables, fetchTables]);

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
                              onClick={() => togglePrimary(f.id)}
                              title={f.isPrimary ? '主键（点击取消）' : '设为主键 PK'}
                              className={`px-2 py-1.5 text-[10px] rounded border font-bold cursor-pointer
                                ${f.isPrimary
                                  ? 'bg-yellow-500/20 border-yellow-500 text-yellow-500'
                                  : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:border-yellow-500/50 hover:text-yellow-500'
                                }`}
                            >
                              PK
                            </button>
                            <button
                              onClick={() => updateField(f.id, 'notNull', !f.notNull)}
                              title={f.notNull ? 'NOT NULL（点击取消）' : '设为 NOT NULL'}
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

                    {/* 建表警告提示（不阻止） */}
                    {buildWarning && (
                      <div className="px-3 py-2.5 text-xs rounded-lg
                        bg-yellow-500/10 border border-yellow-500/40 text-yellow-500
                        flex items-start gap-2">
                        <span>💡</span>
                        <span>{buildWarning}</span>
                      </div>
                    )}

                    {/* 建表错误提示 */}
                    {buildError && (
                      <div className="px-3 py-2.5 text-xs rounded-lg
                        bg-[var(--error)]/10 border border-[var(--error)]/40 text-[var(--error)]
                        flex items-start gap-2">
                        <span>⚠️</span>
                        <span>{buildError}</span>
                      </div>
                    )}

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
                        {/* 当前选中的表（即使 tables 尚未刷新也显示） */}
                        {!tables.some((t) => t.name === insertTable) && (
                          <option value={insertTable}>{insertTable}</option>
                        )}
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
                      disabled={isLoading || insertCols.length === 0 ||
                        Object.values(colValues).filter((v) => v.trim()).length === 0}
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
