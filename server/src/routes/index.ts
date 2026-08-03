import { Router } from 'express';
import { createSessionRoutes } from './session.routes';
import { createQueryRoutes } from './query.routes';
import { createSchemaRoutes } from './schema.routes';
import { createTPCCRoutes } from './tpcc.routes';
import { SandboxManager } from '../services/sandbox-manager';
import { SqlExecutor } from '../services/sql-executor';
import { CleanupScheduler } from '../services/cleanup-scheduler';
import { AuditLogger } from '../services/audit-logger';
import { TPCCRunner } from '../services/tpcc-runner';
import { IDatabaseAdapter } from '../adapters/database-adapter.interface';

export function createRoutes(
  adapter: IDatabaseAdapter,
  sandboxManager: SandboxManager,
  sqlExecutor: SqlExecutor,
  auditLogger: AuditLogger,
  cleanupScheduler: CleanupScheduler,
  tpccRunner: TPCCRunner
): Router {
  const router = Router();

  // 核心 API
  router.use('/session', createSessionRoutes(sandboxManager));
  router.use('/query', createQueryRoutes(sqlExecutor, sandboxManager, adapter, auditLogger));
  router.use('/schema', createSchemaRoutes(adapter, sandboxManager));
  router.use('/tpcc', createTPCCRoutes(tpccRunner));

  // Health check
  router.get('/health', (_req, res) => {
    res.json({ code: 0, message: 'ok' });
  });

  // === 管理端点（仅开发/监控用） ===

  /**
   * GET /api/v1/admin/stats
   * 获取系统运行统计
   */
  router.get('/admin/stats', async (_req, res) => {
    try {
      const [logCount, cleanupStats] = await Promise.all([
        auditLogger.getLogCount(),
        cleanupScheduler.getStats(),
      ]);

      res.json({
        code: 0,
        data: {
          totalQueries: logCount,
          cleanup: cleanupStats,
        },
        message: 'ok',
      });
    } catch (err) {
      res.status(500).json({
        code: 5000,
        message: 'Failed to get stats',
      });
    }
  });

  return router;
}
