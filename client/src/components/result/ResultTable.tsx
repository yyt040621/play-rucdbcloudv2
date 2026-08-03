import type { QueryResult } from '../../types';

interface ResultTableProps {
  result: QueryResult;
}

export function ResultTable({ result }: ResultTableProps) {
  if (result.type !== 'select') return null;

  const { columns = [], rows = [] } = result;

  return (
    <div className="overflow-auto flex-1">
      <table className="result-table">
        <thead>
          <tr>
            <th className="w-10 text-center">#</th>
            {columns.map((col) => (
              <th key={col}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length + 1} className="text-center text-[var(--text-secondary)] py-8">
                查询结果为空
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i}>
                <td className="text-center text-[var(--text-secondary)] text-xs w-10">
                  {i + 1}
                </td>
                {row.map((cell, j) => (
                  <td key={j} title={cell === null ? 'NULL' : String(cell)}>
                    {cell === null ? (
                      <span className="italic text-[var(--text-secondary)]">NULL</span>
                    ) : (
                      String(cell)
                    )}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
      {result.message && (
        <div className="px-4 py-2 text-xs text-[var(--text-secondary)] bg-[var(--bg-secondary)]
          border-t border-[var(--border-color)]">
          {result.message}
        </div>
      )}
    </div>
  );
}
