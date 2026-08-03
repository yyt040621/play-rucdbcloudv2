import { IDatabaseAdapter } from '../adapters/database-adapter.interface';
import { config } from '../config';

export interface CleanupStats {
  lastRunAt: string | null;
  lastCleanedCount: number;
  totalCleaned: number;
  totalRuns: number;
  isRunning: boolean;
  nextRunInMinutes: number;
}

/**
 * 定时清理过期沙箱。
 * 按固定间隔扫描 playground_admin.sandboxes，清理已过期的沙箱数据库。
 */
export class CleanupScheduler {
  private intervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** 清理沙箱时同步回调（用于删除 SandboxManager 内存缓存） */
  private onCleanupCallback: ((sessionId: string) => void) | null = null;

  // 统计信息
  private stats: CleanupStats = {
    lastRunAt: null,
    lastCleanedCount: 0,
    totalCleaned: 0,
    totalRuns: 0,
    isRunning: false,
    nextRunInMinutes: config.cleanup.intervalMinutes,
  };

  constructor(private adapter: IDatabaseAdapter) {
    this.intervalMs = config.cleanup.intervalMinutes * 60 * 1000;
  }

  /**
   * 注册清理回调（SandboxManager 用它删除内存缓存记录）
   */
  onCleanup(cb: (sessionId: string) => void): void {
    this.onCleanupCallback = cb;
  }

  start(): void {
    if (this.timer) return;

    console.log(
      `CleanupScheduler started — interval: ${config.cleanup.intervalMinutes}min, ` +
      `TTL: ${config.session.ttlHours}h`
    );

    this.timer = setInterval(async () => {
      await this.runCleanup();
    }, this.intervalMs);

    // 启动时立即运行一次
    this.runCleanup();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('CleanupScheduler stopped');
    }
  }

  getStats(): CleanupStats {
    return { ...this.stats };
  }

  /**
   * 手动触发一次清理（用于测试/管理）
   */
  async triggerCleanup(): Promise<number> {
    return this.runCleanup();
  }

  private async runCleanup(): Promise<number> {
    if (this.stats.isRunning) return 0;

    this.stats.isRunning = true;

    try {
      const adminDb = config.db.adminDatabase;
      const now = new Date();

      // 查询已过期的活跃沙箱
      const rows = await this.adapter.execute(
        `SELECT session_id, db_name FROM \`${adminDb}\`.sandboxes
         WHERE status = 'active' AND expires_at < ?`,
        [now]
      );

      if (!Array.isArray(rows) || rows.length === 0) {
        this.updateStats(0, now);
        return 0;
      }

      let cleanedCount = 0;
      for (const row of rows as Array<Record<string, unknown>>) {
        const dbName = row.db_name as string;
        const sessionId = row.session_id as string;

        try {
          await this.adapter.dropDatabase(dbName);
          await this.adapter.executeUpdate(
            `UPDATE \`${adminDb}\`.sandboxes SET status = 'cleaned'
             WHERE session_id = ?`,
            [sessionId]
          );
          // 同步删除内存缓存记录，防止 Map 无限增长
          this.onCleanupCallback?.(sessionId);
          cleanedCount++;
        } catch (err) {
          console.warn(`Cleanup: failed for ${dbName} — ${err}`);
        }
      }

      if (cleanedCount > 0) {
        console.log(
          `Cleanup: removed ${cleanedCount} expired sandboxes ` +
          `(total removed: ${this.stats.totalCleaned + cleanedCount})`
        );
      }

      this.updateStats(cleanedCount, now);
      return cleanedCount;
    } catch (err) {
      console.error('CleanupScheduler error:', err);
      this.stats.lastRunAt = new Date().toISOString();
      return 0;
    } finally {
      this.stats.isRunning = false;
    }
  }

  private updateStats(cleanedCount: number, runTime: Date): void {
    this.stats.lastRunAt = runTime.toISOString();
    this.stats.lastCleanedCount = cleanedCount;
    this.stats.totalCleaned += cleanedCount;
    this.stats.totalRuns++;
    this.stats.nextRunInMinutes = config.cleanup.intervalMinutes;
  }
}
