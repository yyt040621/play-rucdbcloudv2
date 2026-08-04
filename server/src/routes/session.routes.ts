import { Router, Request, Response } from 'express';
import { SandboxManager, SandboxLimitError } from '../services/sandbox-manager';
import { SessionRequest } from '../middleware/session.middleware';
import { ErrorCode } from '../types';

export function createSessionRoutes(sandboxManager: SandboxManager): Router {
  const router = Router();

  /**
   * POST /api/v1/session
   * 创建或恢复会话
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const sessionReq = req as SessionRequest;
      const existingId = sessionReq.resolvedSessionId;

      if (existingId) {
        // 尝试恢复已有会话
        const record = await sandboxManager.getOrCreateSandbox(existingId, req.ip);
        res.json({
          code: ErrorCode.SUCCESS,
          data: {
            sessionId: record.sessionId,
            dbName: record.dbName,
            isNew: record.sessionId !== existingId,
            expiresAt: record.expiresAt.toISOString(),
          },
          message: 'ok',
        });
      } else {
        // 创建新会话
        const record = await sandboxManager.createSandbox(req.ip);
        res.status(201).json({
          code: ErrorCode.SUCCESS,
          data: {
            sessionId: record.sessionId,
            dbName: record.dbName,
            isNew: true,
            expiresAt: record.expiresAt.toISOString(),
          },
          message: 'Session created',
        });
      }
    } catch (err) {
      // 沙箱配额超限返回 429，其他返回 500
      if (err instanceof SandboxLimitError) {
        res.status(err.statusCode).json({
          code: ErrorCode.RATE_LIMITED,
          message: err.message,
        });
        return;
      }
      console.error('Session create error:', err);
      res.status(500).json({
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Failed to create session',
      });
    }
  });

  /**
   * DELETE /api/v1/session
   * 重置沙箱（销毁并重建）
   */
  router.delete('/', async (req: Request, res: Response) => {
    try {
      const sessionReq = req as SessionRequest;
      const sessionId = sessionReq.resolvedSessionId;

      if (!sessionId) {
        res.status(400).json({
          code: ErrorCode.INVALID_SESSION,
          message: 'Session ID is required',
        });
        return;
      }

      const record = await sandboxManager.resetSandbox(sessionId, req.ip);

      res.json({
        code: ErrorCode.SUCCESS,
        data: {
          sessionId: record.sessionId,
          dbName: record.dbName,
          recreated: true,
          expiresAt: record.expiresAt.toISOString(),
        },
        message: 'Sandbox reset successfully',
      });
    } catch (err) {
      if (err instanceof SandboxLimitError) {
        res.status(err.statusCode).json({
          code: ErrorCode.RATE_LIMITED,
          message: err.message,
        });
        return;
      }
      console.error('Session reset error:', err);
      res.status(500).json({
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Failed to reset sandbox',
      });
    }
  });

  return router;
}
