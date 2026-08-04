import { Router, Request, Response } from 'express';
import { SqlExecutor } from '../services/sql-executor';
import { SandboxManager, SandboxLimitError } from '../services/sandbox-manager';
import { AuditLogger } from '../services/audit-logger';
import { IDatabaseAdapter } from '../adapters/database-adapter.interface';
import { SessionRequest } from '../middleware/session.middleware';
import { ErrorCode } from '../types';
import { config } from '../config';

export function createQueryRoutes(
  sqlExecutor: SqlExecutor,
  sandboxManager: SandboxManager,
  adapter: IDatabaseAdapter,
  auditLogger: AuditLogger
): Router {
  const router = Router();

  /**
   * POST /api/v1/query
   * 执行 SQL 语句
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const sessionReq = req as SessionRequest;
      const sessionId = sessionReq.resolvedSessionId;

      if (!sessionId) {
        res.status(401).json({
          code: ErrorCode.INVALID_SESSION,
          message: 'Session ID is required. Create a session first.',
        });
        return;
      }

      const { sql } = req.body as { sql?: string };

      if (!sql || typeof sql !== 'string') {
        res.status(400).json({
          code: ErrorCode.SQL_SYNTAX_ERROR,
          message: 'SQL text is required',
        });
        return;
      }

      // 获取（或创建）沙箱
      const record = await sandboxManager.getOrCreateSandbox(sessionId, req.ip);
      const dbName = record.dbName;

      // === 资源限制检查 ===

      // 表数量检查
      try {
        const tableCount = await adapter.getTableCount(dbName);
        if (tableCount >= config.security.maxTablesPerUser) {
          res.status(403).json({
            code: ErrorCode.DB_SIZE_EXCEEDED,
            message: `Table count (${tableCount}) exceeds limit of ${config.security.maxTablesPerUser}. ` +
              'Please drop some tables before creating new ones.',
          });
          return;
        }
      } catch {
        // 管理库可能未初始化，跳过
      }

      // 数据库大小检查
      try {
        const dbSize = await adapter.getDatabaseSize(dbName);
        if (dbSize > config.security.maxDbSizeMB) {
          res.status(403).json({
            code: ErrorCode.DB_SIZE_EXCEEDED,
            message: `Database size (${dbSize}MB) exceeds limit of ${config.security.maxDbSizeMB}MB. ` +
              'Please delete some data or drop tables to free up space.',
          });
          return;
        }
      } catch {
        // 跳过
      }

      // === 执行 SQL ===
      const totalStartTime = performance.now();
      const results = await sqlExecutor.executeMultiple(dbName, sql);
      const totalTimeMs = Math.round(performance.now() - totalStartTime);

      // === 异步写入审计日志 ===
      auditLogger.logExecutionResults(sessionId, sql, results);

      res.json({
        code: ErrorCode.SUCCESS,
        data: { results, totalTimeMs },
        message: 'ok',
      });
    } catch (err) {
      // 沙箱配额超限返回 429
      if (err instanceof SandboxLimitError) {
        res.status(err.statusCode).json({
          code: ErrorCode.RATE_LIMITED,
          message: err.message,
        });
        return;
      }
      // 不向客户端泄露内部错误详情，仅记录日志
      console.error('Query execution error:', err);
      res.status(500).json({
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Internal server error',
      });
    }
  });

  /**
   * GET /api/v1/query/logs
   * 获取查询历史
   */
  router.get('/logs', async (req: Request, res: Response) => {
    try {
      const sessionReq = req as SessionRequest;
      const sessionId = sessionReq.resolvedSessionId;

      if (!sessionId) {
        res.status(401).json({
          code: ErrorCode.INVALID_SESSION,
          message: 'Session ID is required',
        });
        return;
      }

      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const offset = parseInt(req.query.offset as string) || 0;
      const logs = await auditLogger.getRecentLogs(sessionId, limit, offset);

      res.json({
        code: ErrorCode.SUCCESS,
        data: { logs },
        message: 'ok',
      });
    } catch (err) {
      console.error('Get logs error:', err);
      res.status(500).json({
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Failed to get query logs',
      });
    }
  });

  return router;
}
