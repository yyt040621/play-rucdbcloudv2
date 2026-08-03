import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResultTable } from './ResultTable';
import type { QueryResult } from '../../types';

const selectResult: QueryResult = {
  type: 'select',
  columns: ['id', 'name', 'email'],
  rows: [
    [1, 'Alice', 'alice@example.com'],
    [2, 'Bob', 'bob@example.com'],
    [3, null, 'null@test.com'],
  ],
  rowCount: 3,
  executionTimeMs: 15,
};

const emptyResult: QueryResult = {
  type: 'select',
  columns: ['id', 'name'],
  rows: [],
  rowCount: 0,
  executionTimeMs: 5,
};

describe('ResultTable', () => {
  it('渲染表头', () => {
    render(<ResultTable result={selectResult} />);
    expect(screen.getByText('id')).toBeInTheDocument();
    expect(screen.getByText('name')).toBeInTheDocument();
    expect(screen.getByText('email')).toBeInTheDocument();
  });

  it('渲染数据行', () => {
    render(<ResultTable result={selectResult} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('NULL 值显示为 NULL 文本', () => {
    render(<ResultTable result={selectResult} />);
    expect(screen.getByText('NULL')).toBeInTheDocument();
  });

  it('空结果显示提示', () => {
    render(<ResultTable result={emptyResult} />);
    expect(screen.getByText('查询结果为空')).toBeInTheDocument();
  });

  it('非 SELECT 类型返回 null', () => {
    const ddlResult: QueryResult = {
      type: 'ddl',
      message: 'Table created',
      executionTimeMs: 10,
    };
    const { container } = render(<ResultTable result={ddlResult} />);
    expect(container.innerHTML).toBe('');
  });

  it('截断消息显示', () => {
    const truncated: QueryResult = {
      ...selectResult,
      message: 'Result truncated to 1000 rows',
    };
    render(<ResultTable result={truncated} />);
    expect(screen.getByText('Result truncated to 1000 rows')).toBeInTheDocument();
  });
});
