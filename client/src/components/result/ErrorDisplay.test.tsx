import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorDisplay } from './ErrorDisplay';
import type { QueryResult } from '../../types';

describe('ErrorDisplay', () => {
  it('渲染错误信息', () => {
    const errorResult: QueryResult = {
      type: 'error',
      message: 'You have an error in your SQL syntax',
      executionTimeMs: 3,
    };

    render(<ErrorDisplay result={errorResult} />);
    expect(screen.getByText('执行错误')).toBeInTheDocument();
    expect(
      screen.getByText('You have an error in your SQL syntax')
    ).toBeInTheDocument();
    expect(screen.getByText('3ms')).toBeInTheDocument();
  });

  it('非 ERROR 类型返回 null', () => {
    const selectResult: QueryResult = {
      type: 'select',
      columns: [],
      rows: [],
      rowCount: 0,
      executionTimeMs: 5,
    };
    const { container } = render(<ErrorDisplay result={selectResult} />);
    expect(container.innerHTML).toBe('');
  });
});
