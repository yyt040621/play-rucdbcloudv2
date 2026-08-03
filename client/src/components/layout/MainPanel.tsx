import { SqlEditor } from '../editor/SqlEditor';
import { EditorToolbar } from '../editor/EditorToolbar';
import { ResultSummary } from '../result/ResultSummary';
import { ResultTable } from '../result/ResultTable';
import { ErrorDisplay } from '../result/ErrorDisplay';
import { DmlResult } from '../result/DmlResult';
import type { QueryResult } from '../../types';

interface MainPanelProps {
  sql: string;
  onSqlChange: (value: string) => void;
  onExecute: () => void;
  isLoading: boolean;
  results: QueryResult[];
  totalTimeMs: number | null;
  theme: 'light' | 'dark';
}

export function MainPanel({
  sql, onSqlChange, onExecute, isLoading,
  results, totalTimeMs, theme,
}: MainPanelProps) {
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* 编辑区域 */}
      <div className="border-b border-[var(--border-color)]" style={{ flex: '0 0 45%' }}>
        <EditorToolbar
          onExecute={onExecute}
          isLoading={isLoading}
          hasContent={sql.trim().length > 0}
        />
        <div className="h-full" style={{ height: 'calc(100% - 41px)' }}>
          <SqlEditor
            value={sql}
            onChange={onSqlChange}
            onExecute={onExecute}
            theme={theme}
          />
        </div>
      </div>

      {/* 结果区域 */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <ResultSummary results={results} totalTimeMs={totalTimeMs} />

        <div className="flex-1 overflow-auto">
          {results.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-[var(--text-secondary)]">
              <svg className="w-10 h-10 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm">在上方输入 SQL 语句，点击执行查看结果</p>
              <p className="text-xs opacity-60">支持多条语句（用分号分隔），Ctrl + Enter 快捷执行</p>
            </div>
          ) : (
            results.map((result, i) => (
              <div key={i} className="border-b border-[var(--border-color)] last:border-b-0">
                {result.type === 'select' && <ResultTable result={result} />}
                {result.type === 'error' && <ErrorDisplay result={result} />}
                {['insert', 'update', 'delete', 'ddl'].includes(result.type) && (
                  <DmlResult result={result} />
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
