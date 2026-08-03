import { Router, Request, Response } from 'express';
import { TPCCRunner, TPCScale } from '../services/tpcc-runner';
import { ErrorCode } from '../types';
import { SessionRequest } from '../middleware/session.middleware';

export function createTPCCRoutes(tpcc: TPCCRunner): Router {
  const router = Router();

  /**
   * 控制端点鉴权：要求有效会话（防止匿名触发压测/干扰）
   */
  const requireSession = (req: Request, res: Response, next: () => void): void => {
    const sessionId = (req as SessionRequest).resolvedSessionId;
    if (!sessionId) {
      res.status(401).json({
        code: ErrorCode.INVALID_SESSION,
        message: 'Session ID is required',
      });
      return;
    }
    next();
  };

  /**
   * POST /api/v1/tpcc/start
   * 启动 TPC-C 测试（需会话）
   * body: { scale: 'small'|'medium'|'large', durationSec?: number }
   */
  router.post('/start', requireSession, async (req: Request, res: Response) => {
    try {
      const { scale, durationSec } = req.body as { scale?: string; durationSec?: number };
      if (!scale || !['small', 'medium', 'large'].includes(scale)) {
        res.status(400).json({
          code: ErrorCode.SQL_SYNTAX_ERROR,
          message: 'scale must be small | medium | large',
        });
        return;
      }
      await tpcc.start(scale as TPCScale, durationSec || 60);
      res.json({
        code: ErrorCode.SUCCESS,
        data: { status: tpcc.getStatus() },
        message: 'TPC-C test started',
      });
    } catch (err) {
      res.status(400).json({
        code: ErrorCode.INTERNAL_ERROR,
        message: err instanceof Error ? err.message : 'Failed to start test',
      });
    }
  });

  /**
   * GET /api/v1/tpcc/status
   * 查询当前测试状态
   */
  router.get('/status', (_req, res) => {
    res.json({
      code: ErrorCode.SUCCESS,
      data: tpcc.getStatus(),
      message: 'ok',
    });
  });

  /**
   * GET /api/v1/tpcc/history
   * 历史测试结果
   */
  router.get('/history', (_req, res) => {
    res.json({
      code: ErrorCode.SUCCESS,
      data: { history: tpcc.getHistory() },
      message: 'ok',
    });
  });

  /**
   * POST /api/v1/tpcc/stop
   * 手动停止测试（需会话）
   */
  router.post('/stop', requireSession, (_req, res) => {
    const stopped = tpcc.stop();
    res.json({
      code: ErrorCode.SUCCESS,
      data: { stopped },
      message: stopped ? 'Test stopping' : 'No test running',
    });
  });

  return router;
}
