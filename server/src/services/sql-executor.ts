import { IDatabaseAdapter } from '../adapters/database-adapter.interface';
import { QueryResult, QueryResultType } from '../types';
import { splitStatements } from './sql-parser';
import { config } from '../config';

/**
 * SQL 执行器：在指定数据库上执行 SQL，返回结构化结果。
 */
export class SqlExecutor {
  constructor(private adapter: IDatabaseAdapter) {}

  /**
   * 执行单条语句
   */
  async executeSingle(database: string, sql: string): Promise<QueryResult> {
    const startTime = performance.now();

    const trimmed = sql.trim();
    if (!trimmed) {
      return { type: 'error', message: 'Empty statement', executionTimeMs: 0 };
    }

    const firstWord = trimmed.split(/\s+/)[0].toUpperCase();
    const type = this.classifyStatement(firstWord);

    try {
      if (type === 'select') {
        return await this.executeSelect(database, trimmed, startTime);
      } else if (['insert', 'update', 'delete'].includes(type)) {
        return await this.executeModify(database, trimmed, type, startTime);
      } else {
        return await this.executeDDL(database, trimmed, firstWord, startTime);
      }
    } catch (err) {
      const executionTimeMs = Math.round(performance.now() - startTime);
      const message = this.formatError(err);
      return { type: 'error', message, executionTimeMs };
    }
  }

  /**
   * 执行多条语句（按分号拆分后逐条执行）
   */
  async executeMultiple(database: string, sql: string): Promise<QueryResult[]> {
    const statements = splitStatements(sql);
    const results: QueryResult[] = [];

    for (const stmt of statements) {
      const trimmed = stmt.trim();
      if (!trimmed) continue;

      const result = await this.executeSingle(database, trimmed);
      results.push(result);
    }

    return results;
  }

  // === 私有方法 ===

  /**
   * 执行 SELECT 类查询
   */
  private async executeSelect(
    database: string,
    sql: string,
    startTime: number
  ): Promise<QueryResult> {
    const timeoutMs = config.security.queryTimeoutSeconds * 1000;
    const maxRows = config.security.maxRowsPerQuery;

    // 只对 SELECT/WITH 语句下推 LIMIT（EXPLAIN/SHOW/DESC 不支持追加 LIMIT）
    const trimmed = sql.trim().replace(/;\s*$/, '');
    const isQuery = /^(SELECT|WITH)\b/i.test(trimmed);

    // 若用户 SQL 已含 LIMIT 子句则不再追加，避免 "LIMIT 100 LIMIT 1001" 语法错误
    const hasOwnLimit = /\bLIMIT\s+\d/i.test(trimmed);
    const guardedSql = isQuery && !hasOwnLimit
      ? `${trimmed} LIMIT ${maxRows + 1}`
      : trimmed;

    // SQL 层超时（MySQL 8.0 max_execution_time，单位毫秒）
    const fullSql = `SET SESSION max_execution_time = ${timeoutMs}; ${guardedSql}`;
    const rows = await this.adapter.executeOnDatabase(database, fullSql);
    const isTruncated = rows.length > maxRows;
    const resultRows = isTruncated ? rows.slice(0, maxRows) : rows;

    const executionTimeMs = Math.round(performance.now() - startTime);

    return {
      type: 'select',
      columns: resultRows.length > 0 ? Object.keys(resultRows[0] as object) : [],
      rows: resultRows.map((row) => Object.values(row as object)),
      rowCount: resultRows.length,
      executionTimeMs,
      message: isTruncated
        ? `Result truncated to ${maxRows} rows (${rows.length} total)`
        : undefined,
    };
  }

  /**
   * 执行 INSERT / UPDATE / DELETE
   */
  private async executeModify(
    database: string,
    sql: string,
    type: QueryResultType,
    startTime: number
  ): Promise<QueryResult> {
    // 在目标数据库中执行修改语句（低权限用户连接）
    const result = await this.adapter.executeUserUpdate(
      `USE \`${database}\`; ${sql}`
    );
    const executionTimeMs = Math.round(performance.now() - startTime);

    return {
      type: type as 'insert' | 'update' | 'delete',
      affectedRows: result.affectedRows,
      insertId: result.insertId,
      executionTimeMs,
    };
  }

  /**
   * 执行 DDL 类语句
   */
  private async executeDDL(
    database: string,
    sql: string,
    firstWord: string,
    startTime: number
  ): Promise<QueryResult> {
    await this.adapter.executeUserUpdate(`USE \`${database}\`; ${sql}`);
    const executionTimeMs = Math.round(performance.now() - startTime);

    // 尝试生成友好的成功消息
    const words = sql.split(/\s+/);
    const secondWord = words[1]?.toUpperCase() || '';

    // 提取目标表名（跳过 IF NOT EXISTS / IF EXISTS）
    let objectName = '';
    if (['CREATE', 'DROP', 'ALTER', 'TRUNCATE'].includes(firstWord)) {
      let idx = 2; // 跳过动词 + 类型
      // 跳过 IF / IF NOT EXISTS / IF EXISTS
      if (words[idx]?.toUpperCase() === 'IF') {
        idx++; // 跳过 IF
        if (words[idx]?.toUpperCase() === 'NOT') idx++; // 跳过 NOT
        if (words[idx]?.toUpperCase() === 'EXISTS') idx++; // 跳过 EXISTS
      }
      objectName = words[idx]?.replace(/[`'"()]/g, '') || '';
    }

    let message: string;
    if (firstWord === 'CREATE' && secondWord === 'TABLE') {
      message = objectName ? `Table '${objectName}' created successfully` : 'Table created successfully';
    } else if (firstWord === 'DROP' && secondWord === 'TABLE') {
      message = objectName ? `Table '${objectName}' dropped successfully` : 'Table dropped successfully';
    } else if (firstWord === 'TRUNCATE') {
      message = objectName ? `Table '${objectName}' truncated successfully` : 'Table truncated successfully';
    } else if (firstWord === 'ALTER') {
      message = objectName ? `Table '${objectName}' altered successfully` : 'Table altered successfully';
    } else if (firstWord === 'SET') {
      message = `Variable set successfully`;
    } else {
      message = `${firstWord} executed successfully`;
    }

    return { type: 'ddl', message, executionTimeMs };
  }

  /**
   * 分类 SQL 语句类型
   */
  private classifyStatement(firstWord: string): QueryResultType {
    const upper = firstWord.toUpperCase();

    if (
      upper === 'SELECT' || upper === 'SHOW' || upper === 'DESCRIBE' ||
      upper === 'DESC' || upper === 'EXPLAIN' || upper === 'WITH'
    ) {
      return 'select';
    }
    if (upper === 'INSERT' || upper === 'REPLACE') return 'insert';
    if (upper === 'UPDATE') return 'update';
    if (upper === 'DELETE') return 'delete';
    return 'ddl';
  }

  /**
   * 错误信息脱敏：不暴露内部路径和IP
   */
  private formatError(err: unknown): string {
    if (!(err instanceof Error)) return String(err);

    let message = err.message;

    // 脱敏处理：移除文件路径
    message = message.replace(/[A-Z]:\\[^\s]*/g, '<path>');
    message = message.replace(/\/[^\s]*\.(js|ts|sql)/g, '<path>');

    // 脱敏 IP 地址
    message = message.replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, '<ip>');

    return message;
  }
}
