import express from 'express';
import cors from 'cors';
import { config } from './config';
import { MySQLAdapter } from './adapters/mysql-adapter';
import { PostgreSQLAdapter } from './adapters/postgresql-adapter';
import { SandboxManager } from './services/sandbox-manager';
import { SqlExecutor } from './services/sql-executor';
import { CleanupScheduler } from './services/cleanup-scheduler';
import { TemplateLoader } from './services/template-loader';
import { AuditLogger } from './services/audit-logger';
import { BenchBaseRunner, ensureBenchBaseDatabases } from './services/benchbase-runner';
import { sessionMiddleware } from './middleware/session.middleware';
import { createSqlGuardMiddleware } from './middleware/sql-guard.middleware';
import { sessionRateLimit, globalIpRateLimit, createSessionRateLimit } from './middleware/rate-limit.middleware';
import { securityHeadersMiddleware } from './middleware/security-headers.middleware';
import { createRoutes } from './routes';

async function main(): Promise<void> {
  // 数据库适配器：PostgreSQL 用于演示沙箱，MySQL 用于 TPC-C MySQL 选项
  const pgAdapter = new PostgreSQLAdapter();
  const mysqlAdapter = new MySQLAdapter();

  try {
    await pgAdapter.connect();
    await mysqlAdapter.connect();
    console.log('PostgreSQL + MySQL connected successfully');
  } catch (err) {
    console.error('Failed to connect to database:', err);
    process.exit(1);
  }

  // 确保管理 schema 和模板 schema 存在（含预置数据）
  const templateLoader = new TemplateLoader(pgAdapter);
  try {
    await templateLoader.initialize();
    console.log('Admin and template schemas ready');
  } catch (err) {
    console.warn('Failed to initialize schemas (may need manual setup):', err);
  }

  // 初始化服务（演示沙箱基于 PostgreSQL）
  const sandboxManager = new SandboxManager(pgAdapter);
  const sqlExecutor = new SqlExecutor(pgAdapter);
  const auditLogger = new AuditLogger(pgAdapter);
  // BenchBase 压测服务（替换自研 TPC-C，一次测一个数据库）
  const benchBaseRunner = new BenchBaseRunner();
  // 确保 BenchBase 专用数据库存在（BenchBase 会自建 TPC-C 表）
  try {
    await ensureBenchBaseDatabases(pgAdapter, mysqlAdapter);
  } catch (err) {
    console.warn('Failed to ensure BenchBase databases:', err);
  }

  // 启动清理任务（清理时同步移除沙箱内存缓存，防止 Map 无限增长）
  const cleanupScheduler = new CleanupScheduler(pgAdapter);
  cleanupScheduler.onCleanup((sessionId) => sandboxManager.removeFromCache(sessionId));
  cleanupScheduler.start();

  // 创建 Express 应用
  const app = express();

  // 信任一层反代（nginx），使 req.ip 取真实客户端 IP。
  // 这是 IP 限流与「单 IP 沙箱配额」正确工作的前提。
  // nginx 已设置 X-Forwarded-For: $proxy_add_x_forwarded_for，伪造的前缀会被忽略。
  app.set('trust proxy', 1);

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
  app.use(globalIpRateLimit);   // 全局 IP 限流（总量保护）
  app.use(sessionRateLimit);    // 每会话限流
  app.use('/api/v1/session', createSessionRateLimit); // 建沙箱端点严格限流

  // SQL 安全检查（仅对 /query 路由生效）
  app.use('/api/v1/query', createSqlGuardMiddleware(sandboxManager));

  // 挂载路由
  const routes = createRoutes(pgAdapter, sandboxManager, sqlExecutor, auditLogger, cleanupScheduler, benchBaseRunner);
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
    await pgAdapter.disconnect();
    await mysqlAdapter.disconnect();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
