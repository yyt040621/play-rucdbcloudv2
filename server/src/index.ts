import express from 'express';
import cors from 'cors';
import { config } from './config';
import { MySQLAdapter } from './adapters/mysql-adapter';
import { SandboxManager } from './services/sandbox-manager';
import { SqlExecutor } from './services/sql-executor';
import { CleanupScheduler } from './services/cleanup-scheduler';
import { TemplateLoader } from './services/template-loader';
import { AuditLogger } from './services/audit-logger';
import { TPCCRunner } from './services/tpcc-runner';
import { sessionMiddleware } from './middleware/session.middleware';
import { createSqlGuardMiddleware } from './middleware/sql-guard.middleware';
import { rateLimitMiddleware } from './middleware/rate-limit.middleware';
import { securityHeadersMiddleware } from './middleware/security-headers.middleware';
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
  // TPC-C 性能测试服务（基于 adapter 抽象，未来可切换自研数据库）
  const tpccRunner = new TPCCRunner(adapter);
  // 启动时预初始化 TPC-C 环境（建表+灌数据），用户点开始即可直接测试
  tpccRunner.preInitialize();

  // 启动清理任务（清理时同步移除沙箱内存缓存，防止 Map 无限增长）
  const cleanupScheduler = new CleanupScheduler(adapter);
  cleanupScheduler.onCleanup((sessionId) => sandboxManager.removeFromCache(sessionId));
  cleanupScheduler.start();

  // 创建 Express 应用
  const app = express();

  // 隐藏框架指纹
  app.disable('x-powered-by');

  // CORS 白名单（同源请求无 Origin 头 → 允许；开发前端 localhost:5173 放行）
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
    .split(',').map((s) => s.trim()).filter(Boolean);
  app.use(cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) cb(null, true);
      else cb(null, false); // 拒绝非白名单来源
    },
    credentials: true,
  }));

  // 安全响应头（CSP / X-Frame-Options / nosniff / Referrer-Policy / no-store）
  app.use(securityHeadersMiddleware);

  // 全局中间件
  app.use(express.json({ limit: '20kb' })); // 限制请求体大小
  app.use(sessionMiddleware);
  app.use(rateLimitMiddleware);

  // SQL 安全检查（仅对 /query 路由生效）
  app.use('/api/v1/query', createSqlGuardMiddleware(sandboxManager));

  // 挂载路由
  const routes = createRoutes(adapter, sandboxManager, sqlExecutor, auditLogger, cleanupScheduler, tpccRunner);
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
