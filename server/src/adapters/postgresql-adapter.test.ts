import { describe, it, expect } from 'vitest';
import { PostgreSQLAdapter } from './postgresql-adapter';

/**
 * 仅测试适配器的纯函数（方言转换 / RETURNING 回填），不连接真实数据库。
 * PostgreSQLAdapter 构造时创建连接池（惰性，不建立实际连接）。
 */
describe('PostgreSQLAdapter 方言适配', () => {
  const adapter = new PostgreSQLAdapter() as unknown as {
    convertDialect(sql: string): string;
    convertUseToSearchPath(sql: string): string;
    convertTimeout(sql: string): string;
    tryAddReturning(sql: string): { sql: string; capture: boolean };
    extractInsertId(res: { rows: unknown[] } | null): number;
  };

  it('反引号 → 双引号（4.4 修复）', () => {
    expect(adapter.convertDialect('CREATE TABLE `users_test` ("id" INT PRIMARY KEY)'))
      .toBe('CREATE TABLE "users_test" ("id" INT PRIMARY KEY)');
  });

  it('列定义 AUTO_INCREMENT → GENERATED ALWAYS AS IDENTITY（1.7 修复）', () => {
    expect(adapter.convertDialect('CREATE TABLE t (id INT AUTO_INCREMENT PRIMARY KEY)'))
      .toBe('CREATE TABLE t (id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY)');
  });

  it('表选项 AUTO_INCREMENT=n 被移除（不误转换为 IDENTITY）', () => {
    expect(adapter.convertDialect('CREATE TABLE t (id INT PRIMARY KEY) AUTO_INCREMENT=5'))
      .toBe('CREATE TABLE t (id INT PRIMARY KEY) ');
  });

  it('移除 MySQL 表选项 ENGINE / DEFAULT CHARSET', () => {
    expect(adapter.convertDialect('CREATE TABLE t (id INT) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'))
      .toBe('CREATE TABLE t (id INT)');
  });

  it('SET NAMES → client_encoding', () => {
    expect(adapter.convertDialect('SET NAMES utf8mb4'))
      .toBe("SET client_encoding TO 'UTF8'");
  });

  it('USE 库前缀 → SET search_path（兼容 MySQL 风格）', () => {
    expect(adapter.convertUseToSearchPath('USE `sandbox_abc`; SELECT 1'))
      .toBe('SET search_path TO "sandbox_abc";  SELECT 1');
  });

  it('MySQL max_execution_time → statement_timeout', () => {
    expect(adapter.convertTimeout('SET SESSION max_execution_time = 30000; SELECT 1'))
      .toBe('SET statement_timeout = 30000; SELECT 1');
  });
});

describe('PostgreSQLAdapter INSERT 自增 id 回填（1.9 修复）', () => {
  const adapter = new PostgreSQLAdapter() as unknown as {
    tryAddReturning(sql: string): { sql: string; capture: boolean };
    extractInsertId(res: { rows: unknown[] } | null): number;
  };

  it('单条 INSERT 追加 RETURNING *', () => {
    const { sql, capture } = adapter.tryAddReturning(
      'SET search_path TO "sandbox_abc"; INSERT INTO "employees" ("name") VALUES (\'x\')'
    );
    expect(capture).toBe(true);
    expect(sql).toContain('RETURNING *');
  });

  it('非 INSERT 语句不追加 RETURNING', () => {
    const { sql, capture } = adapter.tryAddReturning(
      'SET search_path TO "sandbox_abc"; UPDATE "employees" SET "name"=\'y\''
    );
    expect(capture).toBe(false);
    expect(sql).not.toContain('RETURNING');
  });

  it('已含 RETURNING 的 INSERT 不重复追加', () => {
    const { capture } = adapter.tryAddReturning(
      'SET search_path TO "sandbox_abc"; INSERT INTO "employees" ("name") VALUES (\'x\') RETURNING id'
    );
    expect(capture).toBe(false);
  });

  it('从 RETURNING 结果提取 id（PG 返回 BIGINT 字符串）', () => {
    expect(adapter.extractInsertId({ rows: [{ id: '12', name: 'x' }] })).toBe(12);
    expect(adapter.extractInsertId({ rows: [] })).toBe(0);
    expect(adapter.extractInsertId(null)).toBe(0);
  });
});
