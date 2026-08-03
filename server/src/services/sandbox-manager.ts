import { v4 as uuidv4 } from 'uuid';
import { IDatabaseAdapter } from '../adapters/database-adapter.interface';
import { config } from '../config';

export interface SandboxRecord {
  sessionId: string;
  dbName: string;
  createdAt: Date;
  lastAccessedAt: Date;
  expiresAt: Date;
}

/**
 * 沙箱管理器：负责用户沙箱数据库的创建、恢复、销毁。
 * 通过数据库适配器接口操作，与具体数据库实现解耦。
 */
export class SandboxManager {
  private sandboxes: Map<string, SandboxRecord> = new Map();

  constructor(private adapter: IDatabaseAdapter) {}

  /**
   * 创建新沙箱
   */
  async createSandbox(): Promise<SandboxRecord> {
    const sessionId = uuidv4();  // 标准 UUID 格式（带横线）
    const dbName = `sandbox_${uuidv4().replace(/-/g, '').substring(0, 16)}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + config.session.ttlHours * 60 * 60 * 1000);

    // 创建沙箱数据库
    await this.adapter.createDatabase(dbName);

    // 从模板库克隆表结构和数据
    try {
      await this.adapter.cloneDatabase(config.db.templateDatabase, dbName);
    } catch (err) {
      // 如果模板库不存在或克隆失败，仍创建空数据库
      console.warn(`Failed to clone template database: ${err}`);
    }

    // 也记录到管理库（如果管理库已初始化）
    try {
      await this.adapter.executeUpdate(
        `INSERT INTO \`${config.db.adminDatabase}\`.sandboxes
         (session_id, db_name, status, created_at, last_accessed_at, expires_at)
         VALUES (?, ?, 'active', ?, ?, ?)`,
        [sessionId, dbName, now, now, expiresAt]
      );
    } catch {
      // 管理库可能尚未初始化，忽略
    }

    const record: SandboxRecord = {
      sessionId,
      dbName,
      createdAt: now,
      lastAccessedAt: now,
      expiresAt,
    };

    this.sandboxes.set(sessionId, record);
    return record;
  }

  /**
   * 获取或恢复沙箱
   */
  async getOrCreateSandbox(sessionId: string): Promise<SandboxRecord> {
    // 先查内存缓存
    const existing = this.sandboxes.get(sessionId);
    if (existing) {
      // 检查是否过期
      if (new Date() > existing.expiresAt) {
        await this.destroySandbox(sessionId);
        return this.createSandbox();
      }
      existing.lastAccessedAt = new Date();
      return existing;
    }

    // 查管理库
    const dbName = `sandbox_${sessionId.replace(/-/g, '').substring(0, 16)}`;
    try {
      const rows = await this.adapter.execute(
        `SELECT * FROM \`${config.db.adminDatabase}\`.sandboxes
         WHERE session_id = ? AND status = 'active'`,
        [sessionId]
      );

      if (Array.isArray(rows) && rows.length > 0) {
        const row = rows[0] as Record<string, unknown>;
        const record: SandboxRecord = {
          sessionId,
          dbName: row.db_name as string,
          createdAt: new Date(row.created_at as string),
          lastAccessedAt: new Date(),
          expiresAt: new Date(row.expires_at as string),
        };

        if (new Date() > record.expiresAt) {
          await this.destroySandbox(sessionId);
          return this.createSandbox();
        }

        // 更新最后访问时间
        await this.adapter.executeUpdate(
          `UPDATE \`${config.db.adminDatabase}\`.sandboxes
           SET last_accessed_at = ? WHERE session_id = ?`,
          [new Date(), sessionId]
        );

        this.sandboxes.set(sessionId, record);
        return record;
      }
    } catch {
      // 管理库可能未初始化
    }

    // 检查沙箱数据库是否存在
    try {
      const tables = await this.adapter.getTables(dbName);
      if (tables.length >= 0) {
        const record: SandboxRecord = {
          sessionId,
          dbName,
          createdAt: new Date(),
          lastAccessedAt: new Date(),
          expiresAt: new Date(Date.now() + config.session.ttlHours * 60 * 60 * 1000),
        };
        this.sandboxes.set(sessionId, record);
        return record;
      }
    } catch {
      // 沙箱数据库不存在，创建新的
    }

    return this.createSandbox();
  }

  /**
   * 销毁沙箱
   */
  async destroySandbox(sessionId: string): Promise<void> {
    const record = this.sandboxes.get(sessionId);
    const dbName = record?.dbName || `sandbox_${sessionId.replace(/-/g, '').substring(0, 16)}`;

    try {
      await this.adapter.dropDatabase(dbName);
    } catch (err) {
      console.warn(`Failed to drop sandbox database ${dbName}: ${err}`);
    }

    // 更新管理库
    try {
      await this.adapter.executeUpdate(
        `UPDATE \`${config.db.adminDatabase}\`.sandboxes
         SET status = 'cleaned' WHERE session_id = ?`,
        [sessionId]
      );
    } catch {
      // 忽略
    }

    this.sandboxes.delete(sessionId);
  }

  /**
   * 重置沙箱（销毁 + 重建）
   */
  async resetSandbox(oldSessionId: string): Promise<SandboxRecord> {
    await this.destroySandbox(oldSessionId);
    return this.createSandbox();
  }

  /**
   * 获取沙箱记录
   */
  getSandbox(sessionId: string): SandboxRecord | undefined {
    return this.sandboxes.get(sessionId);
  }

  /**
   * 从内存缓存移除记录（清理调度器调用）
   */
  removeFromCache(sessionId: string): void {
    this.sandboxes.delete(sessionId);
  }
}
