import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SandboxManager } from './sandbox-manager';
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
});
