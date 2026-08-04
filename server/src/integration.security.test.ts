import { describe, it, expect } from 'vitest';
import express, { Express } from 'express';
import cors from 'cors';
import { AddressInfo } from 'net';
import { IDatabaseAdapter } from './adapters/database-adapter.interface';
import { SandboxManager } from './services/sandbox-manager';
import { SqlExecutor } from './services/sql-executor';
import { CleanupScheduler } from './services/cleanup-scheduler';
import { AuditLogger } from './services/audit-logger';
import { BenchBaseRunner } from './services/benchbase-runner';
import { sessionMiddleware } from './middleware/session.middleware';
import { createSqlGuardMiddleware } from './middleware/sql-guard.middleware';
import { createRoutes } from './routes';
import { securityHeadersMiddleware } from './middleware/security-headers.middleware';

/**
 * 端到端 HTTP 层安全验证（无需真实数据库）。
 * 挂载与 index.ts 一致的中间件顺序，用内存 mock 适配器驱动。
 */

function createMockAdapter(options: { perIpCount?: number; globalCount?: number } = {}): IDatabaseAdapter {
  const perIpCount = options.perIpCount ?? 0;
  const globalCount = options.globalCount ?? 0;
  return {
    connect: async () => {},
    disconnect: async () => {},
    execute: async (sql: string, params?: unknown[]) => {
      if (sql.includes('client_ip')) return [{ cnt: perIpCount }];
      if (sql.includes('sandboxes') && params?.[0]) return [];
      if (sql.includes('sandboxes')) return [{ cnt: globalCount }];
      return [];
    },
    executeUpdate: async () => ({ affectedRows: 1, insertId: 0 }),
    executeOnDatabase: async () => [],
    executeUserOnDatabase: async () => [],
    executeUserUpdate: async () => ({ affectedRows: 1, insertId: 0 }),
    createDatabase: async () => {},
    dropDatabase: async () => {},
    getTables: async () => [],
    getTableColumns: async () => [],
    getTableIndexes: async () => [],
    databaseExists: async () => true,
    cloneDatabase: async () => {},
    getDatabaseSize: async () => 1,
    getTableCount: async () => 0,
  };
}

function buildApp(adapter: IDatabaseAdapter): Express {
  const sandboxManager = new SandboxManager(adapter);
  const sqlExecutor = new SqlExecutor(adapter);
  const auditLogger = new AuditLogger(adapter);
  const cleanupScheduler = new CleanupScheduler(adapter);
  const benchBaseRunner = new BenchBaseRunner();

  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(cors({ origin: (o, cb) => cb(null, !o) }));
  app.use(securityHeadersMiddleware);
  app.use(express.json({ limit: '20kb' }));
  app.use(sessionMiddleware);
  app.use('/api/v1/query', createSqlGuardMiddleware(sandboxManager));
  app.use('/api/v1', createRoutes(adapter, sandboxManager, sqlExecutor, auditLogger, cleanupScheduler, benchBaseRunner));
  return app;
}

async function startApp(app: Express): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const addr = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

const UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('HTTP 层安全验证', () => {
  it('API 响应包含安全响应头且无 X-Powered-By（2.6/2.4）', async () => {
    const app = buildApp(createMockAdapter());
    const srv = await startApp(app);
    try {
      const res = await fetch(`${srv.baseUrl}/api/v1/health`);
      const headers = res.headers;
      expect(headers.get('x-powered-by')).toBeNull();
      expect(headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
      expect(headers.get('x-frame-options')).toBe('DENY');
      expect(headers.get('x-content-type-options')).toBe('nosniff');
      expect(headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    } finally {
      await srv.close();
    }
  });

  it('HTTPS 代理下 API 响应带 HSTS（2.11 准备）', async () => {
    const app = buildApp(createMockAdapter());
    const srv = await startApp(app);
    try {
      const res = await fetch(`${srv.baseUrl}/api/v1/health`, {
        headers: { 'X-Forwarded-Proto': 'https' },
      });
      expect(res.headers.get('strict-transport-security')).toContain('max-age=31536000');
    } finally {
      await srv.close();
    }
  });

  it('TPC-C /status 未带会话返回 401（2.7 修复）', async () => {
    const app = buildApp(createMockAdapter());
    const srv = await startApp(app);
    try {
      const res = await fetch(`${srv.baseUrl}/api/v1/tpcc/status?database=pgsql`);
      expect(res.status).toBe(401);
    } finally {
      await srv.close();
    }
  });

  it('TPC-C /status 带会话返回 200（2.7 修复）', async () => {
    const app = buildApp(createMockAdapter());
    const srv = await startApp(app);
    try {
      const res = await fetch(`${srv.baseUrl}/api/v1/tpcc/status?database=pgsql`, {
        headers: { 'X-Session-Id': UUID },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.code).toBe(0);
    } finally {
      await srv.close();
    }
  });

  it('pg_sleep 被 SQL 守卫拦截返回 403（6.4 修复）', async () => {
    const app = buildApp(createMockAdapter());
    const srv = await startApp(app);
    try {
      const res = await fetch(`${srv.baseUrl}/api/v1/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Session-Id': UUID },
        body: JSON.stringify({ sql: 'SELECT pg_sleep(5)' }),
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.message).toMatch(/pg_sleep|PG_SLEEP/i);
    } finally {
      await srv.close();
    }
  });

  it('information_schema introspection 通过守卫（1.8 修复）', async () => {
    const app = buildApp(createMockAdapter());
    const srv = await startApp(app);
    try {
      const res = await fetch(`${srv.baseUrl}/api/v1/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Session-Id': UUID },
        body: JSON.stringify({ sql: 'SELECT column_name FROM information_schema.columns' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.code).toBe(0);
    } finally {
      await srv.close();
    }
  });

  it('跨租户越权被拦截返回 403（2.1 回归确认）', async () => {
    const app = buildApp(createMockAdapter());
    const srv = await startApp(app);
    try {
      const res = await fetch(`${srv.baseUrl}/api/v1/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Session-Id': UUID },
        body: JSON.stringify({ sql: 'SELECT * FROM sandbox_other.employees' }),
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.message).toContain('other user');
    } finally {
      await srv.close();
    }
  });

  it('单 IP 沙箱配额超限返回 429（2.9 修复）', async () => {
    // mock 管理库返回该 IP 已有 3 个活跃沙箱（默认上限 3）
    const app = buildApp(createMockAdapter({ perIpCount: 3 }));
    const srv = await startApp(app);
    try {
      const res = await fetch(`${srv.baseUrl}/api/v1/session`, { method: 'POST' });
      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.message).toContain('IP');
    } finally {
      await srv.close();
    }
  });

  it('沙箱配额未超限时创建成功返回 201（2.9 回归确认）', async () => {
    const app = buildApp(createMockAdapter({ perIpCount: 1 }));
    const srv = await startApp(app);
    try {
      const res = await fetch(`${srv.baseUrl}/api/v1/session`, { method: 'POST' });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.sessionId).toBeTruthy();
    } finally {
      await srv.close();
    }
  });
});
