import { Router, Request, Response } from 'express';
import { IDatabaseAdapter } from '../adapters/database-adapter.interface';
import { SandboxManager, SandboxLimitError } from '../services/sandbox-manager';
import { SessionRequest } from '../middleware/session.middleware';
import { ErrorCode } from '../types';

export function createSchemaRoutes(
  adapter: IDatabaseAdapter,
  sandboxManager: SandboxManager
): Router {
  const router = Router();

  /**
   * GET /api/v1/schema/tables
   * 获取沙箱中所有表
   */
  router.get('/tables', async (req: Request, res: Response) => {
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

      const record = await sandboxManager.getOrCreateSandbox(sessionId, req.ip);
      const tables = await adapter.getTables(record.dbName);

      res.json({
        code: ErrorCode.SUCCESS,
        data: { tables },
        message: 'ok',
      });
    } catch (err) {
      if (err instanceof SandboxLimitError) {
        res.status(err.statusCode).json({
          code: ErrorCode.RATE_LIMITED,
          message: err.message,
        });
        return;
      }
      console.error('Get tables error:', err);
      res.status(500).json({
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Failed to get tables',
      });
    }
  });

  /**
   * GET /api/v1/schema/tables/:tableName
   * 获取指定表的结构
   */
  router.get('/tables/:tableName', async (req: Request, res: Response) => {
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

      const { tableName } = req.params;
      const record = await sandboxManager.getOrCreateSandbox(sessionId, req.ip);

      const [columns, indexes] = await Promise.all([
        adapter.getTableColumns(record.dbName, tableName),
        adapter.getTableIndexes(record.dbName, tableName),
      ]);

      res.json({
        code: ErrorCode.SUCCESS,
        data: {
          name: tableName,
          columns,
          indexes,
        },
        message: 'ok',
      });
    } catch (err) {
      if (err instanceof SandboxLimitError) {
        res.status(err.statusCode).json({
          code: ErrorCode.RATE_LIMITED,
          message: err.message,
        });
        return;
      }
      console.error('Get table schema error:', err);
      res.status(500).json({
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Failed to get table schema',
      });
    }
  });

  return router;
}
