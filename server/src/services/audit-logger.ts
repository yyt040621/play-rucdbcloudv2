import { IDatabaseAdapter } from '../adapters/database-adapter.interface';
import { config } from '../config';
import type { QueryResult } from '../types';

export interface AuditEntry {
  sessionId: string;
  sql: string;
  isAllowed: boolean;
  errorMessage?: string;
  executionTimeMs: number;
}

/**
 * 审计日志服务。
 * 异步写入 query_logs，失败时静默丢弃（不阻塞主流程）。
 */
export class AuditLogger {
  constructor(private adapter: IDatabaseAdapter) {}

  /**
   * 记录查询日志（异步，不阻塞）
   */
  log(entry: AuditEntry): void {
    // 使用 setImmediate 避免阻塞请求响应
    setImmediate(() => {
      this.writeLog(entry).catch((err) => {
        // 审计写入失败静默处理
        console.warn('Failed to write audit log:', err);
      });
    });
  }

  /**
   * 批量记录执行结果
   */
  logExecutionResults(
    sessionId: string,
    sql: string,
    results: QueryResult[]
  ): void {
    // 所有语句执行成功 → 记录一条汇总日志
    const hasError = results.some((r) => r.type === 'error');
    const errorMessages = results
      .filter((r) => r.type === 'error')
      .map((r) => r.message)
      .join('; ');

    this.log({
      sessionId,
      sql: sql.substring(0, 2000), // 截断过长 SQL
      isAllowed: !hasError,
      errorMessage: errorMessages || undefined,
      executionTimeMs: results.reduce((sum, r) => sum + r.executionTimeMs, 0),
    });
  }

  /**
   * 获取最近查询历史（分页）
   */
  async getRecentLogs(
    sessionId: string,
    limit = 20,
    offset = 0
  ): Promise<Array<{
    sqlText: string;
    isAllowed: boolean;
    errorMessage: string | null;
    executedAt: string;
  }>> {
    try {
      const rows = await this.adapter.execute(
        `SELECT sql_text, is_allowed, error_message, executed_at
         FROM \`${config.db.adminDatabase}\`.query_logs
         WHERE session_id = ?
         ORDER BY executed_at DESC
         LIMIT ? OFFSET ?`,
        [sessionId, limit, offset]
      );

      return (rows as Array<Record<string, unknown>>).map((row) => ({
        sqlText: row.sql_text as string,
        isAllowed: !!row.is_allowed,
        errorMessage: (row.error_message as string) || null,
        executedAt: row.executed_at as string,
      }));
    } catch {
      return [];
    }
  }

  /**
   * 获取日志总数（用于统计）
   */
  async getLogCount(): Promise<number> {
    try {
      const rows = await this.adapter.execute(
        `SELECT COUNT(*) AS cnt FROM \`${config.db.adminDatabase}\`.query_logs`
      );
      return ((rows as Array<Record<string, unknown>>)[0]?.cnt as number) || 0;
    } catch {
      return 0;
    }
  }

  /**
   * 实际写入 MySQL
   */
  private async writeLog(entry: AuditEntry): Promise<void> {
    await this.adapter.executeUpdate(
      `INSERT INTO \`${config.db.adminDatabase}\`.query_logs
       (session_id, sql_text, is_allowed, error_message, executed_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [entry.sessionId, entry.sql, entry.isAllowed, entry.errorMessage || null]
    );
  }
}
