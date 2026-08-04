import { Router, Request, Response } from 'express';
import { TPCCRunner } from '../services/tpcc-runner';
import { TPCCRunnerPG } from '../services/tpcc-runner-pg';
import { ErrorCode } from '../types';
import { SessionRequest } from '../middleware/session.middleware';

type TPCScale = 'small' | 'medium' | 'large';
type TPCDatabase = 'mysql' | 'pgsql';

export function createTPCCRoutes(tpccMySQL: TPCCRunner, tpccPG: TPCCRunnerPG): Router {
  const router = Router();

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
   * body: { database: 'mysql'|'pgsql', scale: 'small'|'medium'|'large', durationSec?: number }
   */
  router.post('/start', requireSession, async (req: Request, res: Response) => {
    try {
      const { database, scale, durationSec } = req.body as
        { database?: string; scale?: string; durationSec?: number };

      if (!database || !['mysql', 'pgsql'].includes(database)) {
        res.status(400).json({ code: ErrorCode.SQL_SYNTAX_ERROR, message: 'database must be mysql | pgsql' });
        return;
      }
      if (!scale || !['small', 'medium', 'large'].includes(scale)) {
        res.status(400).json({ code: ErrorCode.SQL_SYNTAX_ERROR, message: 'scale must be small | medium | large' });
        return;
      }

      const status = database === 'mysql'
        ? await tpccMySQL.start(scale as TPCScale, durationSec || 60)
        : await tpccPG.start(scale as TPCScale, durationSec || 60);

      const curStatus = database === 'mysql' ? tpccMySQL.getStatus() : tpccPG.getStatus();
      res.json({
        code: ErrorCode.SUCCESS,
        data: { status: curStatus },
        message: `${database} TPC-C test started`,
      });
    } catch (err) {
      res.status(400).json({
        code: ErrorCode.INTERNAL_ERROR,
        message: err instanceof Error ? err.message : 'Failed to start test',
      });
    }
  });

  /**
   * GET /api/v1/tpcc/status?database=mysql|pgsql
   * 查询当前测试状态（需会话，防匿名探测内部状态）
   */
  router.get('/status', requireSession, (req: Request, res: Response) => {
    const database = (req.query.database as string) || 'mysql';
    const status = database === 'pgsql' ? tpccPG.getStatus() : tpccMySQL.getStatus();
    res.json({ code: ErrorCode.SUCCESS, data: status, message: 'ok' });
  });

  /**
   * GET /api/v1/tpcc/history?database=mysql|pgsql
   * 历史测试结果（需会话）
   */
  router.get('/history', requireSession, (req: Request, res: Response) => {
    const database = (req.query.database as string) || 'mysql';
    const history = database === 'pgsql' ? tpccPG.getHistory() : tpccMySQL.getHistory();
    res.json({ code: ErrorCode.SUCCESS, data: { history }, message: 'ok' });
  });

  /**
   * POST /api/v1/tpcc/stop
   * 手动停止测试（需会话）
   */
  router.post('/stop', requireSession, (req: Request, res: Response) => {
    const database = (req.body?.database as string) || 'mysql';
    const stopped = database === 'pgsql' ? tpccPG.stop() : tpccMySQL.stop();
    res.json({
      code: ErrorCode.SUCCESS,
      data: { stopped },
      message: stopped ? 'Test stopping' : 'No test running',
    });
  });

  return router;
}
