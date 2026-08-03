import express from 'express';
import cors from 'cors';
import { config } from './config';
import { MySQLAdapter } from './adapters/mysql-adapter';
import { SandboxManager } from './services/sandbox-manager';
import { SqlExecutor } from './services/sql-executor';
import { CleanupScheduler } from './services/cleanup-scheduler';
import { TemplateLoader } from './services/template-loader';
import { AuditLogger } from './services/audit-logger';
import { sessionMiddleware } from './middleware/session.middleware';
import { sqlGuardMiddleware } from './middleware/sql-guard.middleware';
import { rateLimitMiddleware } from './middleware/rate-limit.middleware';
import { createRoutes } from './routes';

async function main(): Promise<void> {
  // 初始化数据库适配器（当前使用 MySQL）
  const adapter = new MySQLAdapter();

  try {
    await adapter.connect();
    console.log('Database connected successfully');
  } catch (err) {
    console.error('Failed to connect to database:', err);
    process.exit(1);
  }

  // 确保管理库和模板库存在（含预置数据）
  const templateLoader = new TemplateLoader(adapter);
  try {
    await templateLoader.initialize();
    console.log('Admin and template databases ready');
  } catch (err) {
    console.warn('Failed to initialize databases (may need manual setup):', err);
  }

  // 初始化服务
  const sandboxManager = new SandboxManager(adapter);
  const sqlExecutor = new SqlExecutor(adapter);
  const auditLogger = new AuditLogger(adapter);

  // 启动清理任务（清理时同步移除沙箱内存缓存，防止 Map 无限增长）
  const cleanupScheduler = new CleanupScheduler(adapter);
  cleanupScheduler.onCleanup((sessionId) => sandboxManager.removeFromCache(sessionId));
  cleanupScheduler.start();

  // 创建 Express 应用
  const app = express();

  // 全局中间件
  app.use(cors());
  app.use(express.json({ limit: '20kb' })); // 限制请求体大小
  app.use(sessionMiddleware);
  app.use(rateLimitMiddleware);

  // SQL 安全检查（仅对 /query 路由生效）
  app.use('/api/v1/query', sqlGuardMiddleware);

  // 挂载路由
  const routes = createRoutes(adapter, sandboxManager, sqlExecutor, auditLogger, cleanupScheduler);
  app.use('/api/v1', routes);

  // 全局错误处理
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
      code: 5000,
      message: 'Internal server error',
    });
  });

  // 启动服务器
  app.listen(config.port, () => {
    console.log(`Server running on http://localhost:${config.port}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Session TTL: ${config.session.ttlHours}h`);
  });

  // 优雅关闭
  const shutdown = async () => {
    console.log('\nShutting down...');
    cleanupScheduler.stop();
    await adapter.disconnect();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
