import { Router, Request, Response } from 'express';
import { BenchBaseRunner, TPCDatabase, TPCScale } from '../services/benchbase-runner';
import { ErrorCode } from '../types';
import { SessionRequest } from '../middleware/session.middleware';

export function createTPCCRoutes(benchBase: BenchBaseRunner): Router {
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

  const parseDb = (v: string | undefined): TPCDatabase => (v === 'pgsql' ? 'pgsql' : 'mysql');

  /**
   * POST /api/v1/tpcc/start
   * 启动 BenchBase TPC-C 测试（一次一个数据库，需会话）
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

      const status = await benchBase.start(
        database as TPCDatabase,
        scale as TPCScale,
        durationSec || 60
      );
      res.json({
        code: ErrorCode.SUCCESS,
        data: { status },
        message: `${database} BenchBase test started`,
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
   * 查询当前测试状态（需会话）
   */
  router.get('/status', requireSession, (req: Request, res: Response) => {
    const status = benchBase.getStatus(parseDb(req.query.database as string));
    res.json({ code: ErrorCode.SUCCESS, data: status, message: 'ok' });
  });

  /**
   * GET /api/v1/tpcc/result?database=mysql|pgsql
   * 查询最新一次完成的测试结果（需会话）
   */
  router.get('/result', requireSession, (req: Request, res: Response) => {
    const result = benchBase.getResult(parseDb(req.query.database as string));
    res.json({ code: ErrorCode.SUCCESS, data: { result }, message: 'ok' });
  });

  /**
   * GET /api/v1/tpcc/history
   * 历史测试结果（需会话）
   */
  router.get('/history', requireSession, (_req: Request, res: Response) => {
    const history = benchBase.getHistory();
    res.json({ code: ErrorCode.SUCCESS, data: { history }, message: 'ok' });
  });

  /**
   * POST /api/v1/tpcc/stop
   * 手动停止测试（需会话）
   */
  router.post('/stop', requireSession, (_req: Request, res: Response) => {
    const stopped = benchBase.stop();
    res.json({
      code: ErrorCode.SUCCESS,
      data: { stopped },
      message: stopped ? 'Test stopping' : 'No test running',
    });
  });

  return router;
}
