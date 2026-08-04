import { v4 as uuidv4 } from 'uuid';
import { IDatabaseAdapter } from '../adapters/database-adapter.interface';
import { config } from '../config';

export interface SandboxRecord {
  sessionId: string;
  dbName: string;
  clientIp?: string;
  createdAt: Date;
  lastAccessedAt: Date;
  expiresAt: Date;
}

/**
 * 沙箱配额超限错误。
 * 路由层据此返回 429（限流），而非 500 或 400。
 */
export class SandboxLimitError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 429) {
    super(message);
    this.name = 'SandboxLimitError';
    this.statusCode = statusCode;
  }
}

/**
 * 沙箱管理器：负责用户沙箱数据库的创建、恢复、销毁。
 * 通过数据库适配器接口操作，与具体数据库实现解耦。
 *
 * 配额策略（防批量建库 DoS）：
 * 1. 单 IP 并发沙箱上限（maxSandboxesPerIp，默认 3）——同一来源 IP 的活跃沙箱数
 * 2. 全局活跃沙箱总上限（maxActiveSandboxes，默认 200）——防资源耗尽
 * 两者任一超限即抛 SandboxLimitError（429）。
 */
export class SandboxManager {
  private sandboxes: Map<string, SandboxRecord> = new Map();

  constructor(private adapter: IDatabaseAdapter) {}

  /**
   * 创建新沙箱
   * @param clientIp 客户端 IP（用于单 IP 配额）
   */
  async createSandbox(clientIp?: string): Promise<SandboxRecord> {
    const sessionId = uuidv4();  // 标准 UUID 格式（带横线）
    const dbName = `sandbox_${uuidv4().replace(/-/g, '').substring(0, 16)}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + config.session.ttlHours * 60 * 60 * 1000);

    // 1. 单 IP 并发沙箱配额（防批量建库耗尽资源）
    if (clientIp) {
      try {
        const rows = await this.adapter.execute(
          `SELECT COUNT(*) AS cnt FROM \`${config.pg.adminSchema}\`.sandboxes
           WHERE client_ip = ? AND status = 'active'`,
          [clientIp]
        );
        const activeCount = Number(((rows as Array<Record<string, unknown>>)[0]?.cnt) || 0);
        if (activeCount >= config.security.maxSandboxesPerIp) {
          throw new SandboxLimitError(
            `每个 IP 最多同时创建 ${config.security.maxSandboxesPerIp} 个沙箱，请稍后再试或等待过期自动清理`,
            429
          );
        }
      } catch (err) {
        // 配额超限必须抛出；管理库未初始化/列不存在时忽略（启动时会初始化）
        if (err instanceof SandboxLimitError) throw err;
      }
    }

    // 2. 全局沙箱总配额（防资源耗尽）
    try {
      const rows = await this.adapter.execute(
        `SELECT COUNT(*) AS cnt FROM \`${config.pg.adminSchema}\`.sandboxes WHERE status = 'active'`
      );
      const activeCount = Number(((rows as Array<Record<string, unknown>>)[0]?.cnt) || 0);
      if (activeCount >= config.security.maxActiveSandboxes) {
        throw new SandboxLimitError(
          `系统沙箱数量已达上限（${config.security.maxActiveSandboxes}），请稍后再试`,
          429
        );
      }
    } catch (err) {
      if (err instanceof SandboxLimitError) throw err;
    }

    // 创建沙箱数据库
    await this.adapter.createDatabase(dbName);

    // 从模板库克隆表结构和数据
    try {
      await this.adapter.cloneDatabase(config.pg.templateSchema, dbName);
    } catch (err) {
      // 如果模板库不存在或克隆失败，仍创建空数据库
      console.warn(`Failed to clone template database: ${err}`);
    }

    // 也记录到管理库（如果管理库已初始化）
    try {
      await this.adapter.executeUpdate(
        `INSERT INTO \`${config.pg.adminSchema}\`.sandboxes
         (session_id, db_name, client_ip, status, created_at, last_accessed_at, expires_at)
         VALUES (?, ?, ?, 'active', ?, ?, ?)`,
        [sessionId, dbName, clientIp ?? null, now, now, expiresAt]
      );
    } catch {
      // 管理库可能尚未初始化，忽略
    }

    const record: SandboxRecord = {
      sessionId,
      dbName,
      clientIp,
      createdAt: now,
      lastAccessedAt: now,
      expiresAt,
    };

    this.sandboxes.set(sessionId, record);
    return record;
  }

  /**
   * 获取或恢复沙箱
   * @param clientIp 客户端 IP（新建沙箱时用于单 IP 配额）
   */
  async getOrCreateSandbox(sessionId: string, clientIp?: string): Promise<SandboxRecord> {
    // 先查内存缓存
    const existing = this.sandboxes.get(sessionId);
    if (existing) {
      // 检查是否过期
      if (new Date() > existing.expiresAt) {
        await this.destroySandbox(sessionId);
        return this.createSandbox(clientIp);
      }
      existing.lastAccessedAt = new Date();
      return existing;
    }

    // 查管理库
    const dbName = `sandbox_${sessionId.replace(/-/g, '').substring(0, 16)}`;
    try {
      const rows = await this.adapter.execute(
        `SELECT * FROM \`${config.pg.adminSchema}\`.sandboxes
         WHERE session_id = ? AND status = 'active'`,
        [sessionId]
      );

      if (Array.isArray(rows) && rows.length > 0) {
        const row = rows[0] as Record<string, unknown>;
        const record: SandboxRecord = {
          sessionId,
          dbName: row.db_name as string,
          clientIp: row.client_ip as string | undefined,
          createdAt: new Date(row.created_at as string),
          lastAccessedAt: new Date(),
          expiresAt: new Date(row.expires_at as string),
        };

        if (new Date() > record.expiresAt) {
          await this.destroySandbox(sessionId);
          return this.createSandbox(clientIp);
        }

        // 记录指向的沙箱 schema 已被清理/丢失（如 cleanup 后记录残留、手工删除），
        // 直接返回会导致前端拿到空表列表且无法选择表。销毁记录并重建全新沙箱。
        if (!(await this.adapter.databaseExists(record.dbName))) {
          // 先缓存记录，让 destroySandbox 能按记录的真实 dbName 清理
          this.sandboxes.set(sessionId, record);
          await this.destroySandbox(sessionId);
          return this.createSandbox(clientIp);
        }

        // 更新最后访问时间
        await this.adapter.executeUpdate(
          `UPDATE \`${config.pg.adminSchema}\`.sandboxes
           SET last_accessed_at = ? WHERE session_id = ?`,
          [new Date(), sessionId]
        );

        this.sandboxes.set(sessionId, record);
        return record;
      }
    } catch {
      // 管理库可能未初始化
    }

    // 管理库无记录：校验派生 dbName 的 schema 是否真实存在。
    // 修复原逻辑 `tables.length >= 0` 恒为 true 的缺陷——schema 不存在时返回空表。
    if (await this.adapter.databaseExists(dbName)) {
      const record: SandboxRecord = {
        sessionId,
        dbName,
        clientIp,
        createdAt: new Date(),
        lastAccessedAt: new Date(),
        expiresAt: new Date(Date.now() + config.session.ttlHours * 60 * 60 * 1000),
      };
      this.sandboxes.set(sessionId, record);
      return record;
    }

    // schema 不存在 → 创建全新沙箱（新 sessionId 会返回给前端并更新 localStorage）
    return this.createSandbox(clientIp);
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
        `UPDATE \`${config.pg.adminSchema}\`.sandboxes
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
  async resetSandbox(oldSessionId: string, clientIp?: string): Promise<SandboxRecord> {
    await this.destroySandbox(oldSessionId);
    return this.createSandbox(clientIp);
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
