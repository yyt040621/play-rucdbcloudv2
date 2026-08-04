import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SandboxManager, SandboxLimitError } from './sandbox-manager';
import { IDatabaseAdapter } from '../adapters/database-adapter.interface';

/**
 * Mock Database Adapter — 用内存 Map 模拟数据库操作
 */
function createMockAdapter(): IDatabaseAdapter {
  const databases = new Map<string, Map<string, unknown[]>>();

  return {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),

    execute: vi.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
      // 模拟 SELECT FROM sandboxes
      if (sql.includes('sandboxes') && params?.[0]) {
        return [];
      }
      return [];
    }),

    executeOnDatabase: vi.fn().mockResolvedValue([]),

    executeUpdate: vi.fn().mockResolvedValue({ affectedRows: 1, insertId: 0 }),

    createDatabase: vi.fn().mockImplementation(async (name: string) => {
      databases.set(name, new Map());
    }),

    dropDatabase: vi.fn().mockImplementation(async (name: string) => {
      databases.delete(name);
    }),

    getTables: vi.fn().mockImplementation(async (name: string) => {
      if (!databases.has(name)) {
        throw new Error(`Unknown database '${name}'`);
      }
      return [];
    }),
    databaseExists: vi.fn().mockImplementation(async (name: string) => {
      return databases.has(name);
    }),
    getTableColumns: vi.fn().mockResolvedValue([]),
    getTableIndexes: vi.fn().mockResolvedValue([]),
    cloneDatabase: vi.fn().mockResolvedValue(undefined),
    getDatabaseSize: vi.fn().mockResolvedValue(1.5),
    getTableCount: vi.fn().mockResolvedValue(2),
  };
}

describe('SandboxManager', () => {
  let adapter: IDatabaseAdapter;
  let manager: SandboxManager;

  beforeEach(() => {
    adapter = createMockAdapter();
    manager = new SandboxManager(adapter);
  });

  describe('createSandbox', () => {
    it('创建新沙箱并返回记录', async () => {
      const record = await manager.createSandbox();

      expect(record.sessionId).toBeTruthy();
      expect(record.sessionId.length).toBe(36); // 标准 UUID 带横线 = 36 位
      expect(record.dbName).toMatch(/^sandbox_/);
      expect(record.isNew).toBeUndefined(); // createSandbox 不返回 isNew
      expect(adapter.createDatabase).toHaveBeenCalledWith(record.dbName);
      expect(adapter.cloneDatabase).toHaveBeenCalled();
    });

    it('不同调用产生不同的沙箱', async () => {
      const a = await manager.createSandbox();
      const b = await manager.createSandbox();

      expect(a.sessionId).not.toBe(b.sessionId);
      expect(a.dbName).not.toBe(b.dbName);
    });
  });

  describe('getOrCreateSandbox', () => {
    it('恢复已有沙箱', async () => {
      const created = await manager.createSandbox();
      const restored = await manager.getOrCreateSandbox(created.sessionId);

      expect(restored.sessionId).toBe(created.sessionId);
      expect(restored.dbName).toBe(created.dbName);
    });

    it('未找到的 sessionId 创建新沙箱', async () => {
      const result = await manager.getOrCreateSandbox('nonexistent');

      expect(result.sessionId).toBeTruthy();
      // 旧 ID 不存在，会创建新沙箱（新 ID 不同于旧 ID）
      expect(result.sessionId.length).toBe(36);
    });

    it('管理库记录指向已丢失的 schema 时自动重建沙箱（修复空表列表）', async () => {
      // 模拟管理库返回 active 记录，但 db_name 指向的 schema 已不存在
      const deadAdapter = {
        ...adapter,
        execute: vi.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
          if (sql.includes('sandboxes')) {
            return [{
              session_id: 'dead-session',
              db_name: 'sandbox_dead',
              client_ip: null,
              created_at: new Date().toISOString(),
              last_accessed_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
            }];
          }
          return [];
        }),
        databaseExists: vi.fn().mockResolvedValue(false), // schema 不存在
      };
      const deadManager = new SandboxManager(deadAdapter);

      const result = await deadManager.getOrCreateSandbox('dead-session');

      expect(result.dbName).not.toBe('sandbox_dead'); // 已重建
      expect(result.sessionId).not.toBe('dead-session');
      expect(deadAdapter.dropDatabase).toHaveBeenCalledWith('sandbox_dead');
      expect(deadAdapter.createDatabase).toHaveBeenCalledWith(result.dbName);
    });
  });

  describe('destroySandbox', () => {
    it('销毁沙箱并删除数据库', async () => {
      const record = await manager.createSandbox();
      await manager.destroySandbox(record.sessionId);

      expect(adapter.dropDatabase).toHaveBeenCalledWith(record.dbName);
    });

    it('销毁不存在的沙箱不报错', async () => {
      await expect(
        manager.destroySandbox('nonexistent')
      ).resolves.toBeUndefined();
    });
  });

  describe('resetSandbox', () => {
    it('重置后得到新沙箱', async () => {
      const original = await manager.createSandbox();
      const resetted = await manager.resetSandbox(original.sessionId);

      expect(resetted.sessionId).not.toBe(original.sessionId);
      expect(resetted.dbName).not.toBe(original.dbName);
      expect(adapter.dropDatabase).toHaveBeenCalledWith(original.dbName);
      // 新沙箱也被创建
      expect(adapter.createDatabase).toHaveBeenCalledWith(resetted.dbName);
    });
  });

  describe('getSandbox', () => {
    it('返回内存中的沙箱记录', async () => {
      const record = await manager.createSandbox();
      const cached = manager.getSandbox(record.sessionId);

      expect(cached).toBeDefined();
      expect(cached!.sessionId).toBe(record.sessionId);
    });

    it('不存在时返回 undefined', () => {
      expect(manager.getSandbox('nonexistent')).toBeUndefined();
    });
  });

  describe('单 IP 沙箱配额（防批量建库 DoS）', () => {
    it('同一 IP 活跃沙箱数达上限时拒绝创建', async () => {
      // 模拟管理库返回该 IP 已有 3 个活跃沙箱（默认上限 3）
      const limitAdapter = {
        ...adapter,
        execute: vi.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
          if (sql.includes('client_ip')) return [{ cnt: 3 }];
          if (sql.includes('sandboxes') && params?.[0]) return [];
          return [];
        }),
      };
      const limitManager = new SandboxManager(limitAdapter);

      await expect(limitManager.createSandbox('1.2.3.4'))
        .rejects.toThrow(SandboxLimitError);
    });

    it('未达上限时正常创建并记录 IP', async () => {
      // 模拟管理库返回该 IP 有 1 个活跃沙箱（< 3）
      const okAdapter = {
        ...adapter,
        execute: vi.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
          if (sql.includes('client_ip')) return [{ cnt: 1 }];
          if (sql.includes('sandboxes') && params?.[0]) return [];
          return [];
        }),
      };
      const okManager = new SandboxManager(okAdapter);

      const record = await okManager.createSandbox('5.6.7.8');
      expect(record.clientIp).toBe('5.6.7.8');
    });

    it('全局沙箱配额超限时拒绝创建', async () => {
      const globalAdapter = {
        ...adapter,
        execute: vi.fn().mockImplementation(async (sql: string) => {
          if (sql.includes('client_ip')) return [{ cnt: 0 }];
          // 全局 active 计数达到上限
          if (sql.includes('sandboxes')) return [{ cnt: 200 }];
          return [];
        }),
      };
      const globalManager = new SandboxManager(globalAdapter);

      await expect(globalManager.createSandbox('9.9.9.9'))
        .rejects.toThrow(SandboxLimitError);
    });
  });
});
