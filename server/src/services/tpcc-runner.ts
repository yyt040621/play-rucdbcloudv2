import { IDatabaseAdapter } from '../adapters/database-adapter.interface';
import { config } from '../config';

// ============================================================
// TPC-C 性能测试服务
// 基于 IDatabaseAdapter 抽象，当前测 MySQL，未来可切换自研数据库:
//   const tpcc = new TPCCRunner(new YourDatabaseAdapter());
// ============================================================

export type TPCScale = 'small' | 'medium' | 'large';

export interface TPCConfig {
  warehouse: number;      // 仓库数 W
  durationSec: number;    // 测试时长
}

export interface TPCTransactionResult {
  name: string;           // 事务名
  count: number;          // 执行次数
  avgLatencyMs: number;   // 平均延迟
}

export interface TPCStatus {
  running: boolean;
  ready: boolean;         // 环境是否已预初始化
  scale: TPCScale | null;
  progress: number;       // 0-100
  elapsedSec: number;
  totalTransactions: number;
  tpm: number;            // 每分钟事务数
  avgLatencyMs: number;
  breakdown: TPCTransactionResult[];
  message: string | null;
}

export interface TPCHistoryEntry {
  id: string;
  scale: TPCScale;
  durationSec: number;
  warehouse: number;
  totalTransactions: number;
  tpm: number;
  avgLatencyMs: number;
  finishedAt: string;
}

// 规模配置
const SCALES: Record<TPCScale, number> = {
  small: 2,
  medium: 5,
  large: 10,
};

// 5 种 TPC-C 事务及其标准权重
const TXN_WEIGHTS: { name: string; weight: number }[] = [
  { name: 'NewOrder', weight: 45 },
  { name: 'Payment', weight: 43 },
  { name: 'OrderStatus', weight: 4 },
  { name: 'Delivery', weight: 4 },
  { name: 'StockLevel', weight: 4 },
];

const BENCH_DB = 'tpcc_benchmark';

export class TPCCRunner {
  private running = false;
  private stopRequested = false;
  private status: TPCStatus = this.emptyStatus();
  private history: TPCHistoryEntry[] = [];
  /** 已初始化的 warehouse 数量（预初始化 large=10，各规模都能用） */
  private initializedWarehouses = 0;
  /** 预初始化是否完成 */
  private preInitDone = false;
  /** 预初始化 Promise（避免并发重复初始化） */
  private preInitPromise: Promise<void> | null = null;

  constructor(private adapter: IDatabaseAdapter) {}

  /**
   * 预初始化 TPC-C 环境（服务器启动时调用）。
   * 一次性建好最大规模(large=10仓库)的数据，用户点开始即可直接测试。
   */
  preInitialize(): void {
    if (this.preInitPromise) return;
    this.status.message = '正在准备 TPC-C 环境...';
    this.preInitPromise = (async () => {
      try {
        await this.initialize(SCALES.large, (msg, pct) => {
          this.status.message = msg;
          this.status.progress = Math.round(pct / 2); // 预初始化进度 0-50%
        });
        this.initializedWarehouses = SCALES.large;
        this.preInitDone = true;
        this.status.progress = 0;
        this.status.message = 'TPC-C 环境已就绪，可以开始测试';
      } catch (err) {
        console.error('TPC-C pre-initialize failed:', err);
        this.status.message = 'TPC-C 环境初始化失败';
      }
    })();
  }

  /** 等待预初始化完成（最多等待 N 秒） */
  async waitReady(timeoutMs = 120000): Promise<boolean> {
    if (this.preInitDone) return true;
    const t0 = Date.now();
    while (this.preInitPromise && !this.preInitDone) {
      if (Date.now() - t0 > timeoutMs) return false;
      await new Promise((r) => setTimeout(r, 500));
    }
    return this.preInitDone;
  }

  isReady(): boolean {
    return this.preInitDone;
  }

  private emptyStatus(): TPCStatus {
    return {
      running: false,
      ready: this.preInitDone,
      scale: null,
      progress: 0,
      elapsedSec: 0,
      totalTransactions: 0,
      tpm: 0,
      avgLatencyMs: 0,
      breakdown: TXN_WEIGHTS.map((t) => ({ name: t.name, count: 0, avgLatencyMs: 0 })),
      message: null,
    };
  }

  isRunning(): boolean {
    return this.running;
  }

  getStatus(): TPCStatus {
    return {
      ...this.status,
      ready: this.preInitDone,
      breakdown: this.status.breakdown.map((b) => ({ ...b })),
    };
  }

  getHistory(): TPCHistoryEntry[] {
    return [...this.history];
  }

  /**
   * 启动 TPC-C 测试（异步，不阻塞返回）
   */
  async start(scale: TPCScale, durationSec: number): Promise<void> {
    if (this.running) {
      throw new Error('已有测试正在运行，请等待完成或手动停止');
    }
    if (!SCALES[scale]) {
      throw new Error(`Invalid scale: ${scale}`);
    }
    const duration = Math.max(10, Math.min(durationSec, 300)); // 10~300 秒

    this.running = true;
    this.stopRequested = false;
    this.status = this.emptyStatus();
    this.status.scale = scale;
    this.status.running = true;
    this.status.message = '正在启动测试...';

    // 异步执行，不阻塞请求返回
    void this.run(scale, duration).catch((err) => {
      this.status.message = `测试失败: ${err instanceof Error ? err.message : String(err)}`;
      this.finish();
    });
  }

  /**
   * 手动停止测试
   */
  stop(): boolean {
    if (!this.running) return false;
    this.stopRequested = true;
    this.status.message = '正在停止...';
    return true;
  }

  // === 内部实现 ===

  private async run(scale: TPCScale, durationSec: number): Promise<void> {
    const W = SCALES[scale];

    // 1. 若预初始化完成且数据覆盖当前规模，跳过初始化直接测试
    if (!this.preInitDone || this.initializedWarehouses < W) {
      this.status.message = '正在初始化 TPC-C 环境...';
      await this.initialize(W, (msg, pct) => {
        this.status.message = msg;
        this.status.progress = Math.round(pct / 2); // 初始化 0-50%
      });
      this.initializedWarehouses = Math.max(this.initializedWarehouses, W);
      this.preInitDone = true;
    }

    // 2. 并发跑事务
    this.status.message = '测试进行中...';
    await this.executeBenchmark(W, durationSec);

    // 3. 汇总结果
    this.status.message = '测试完成';
    this.finish();
  }

  private finish(): void {
    this.running = false;
    this.status.running = false;
    this.status.progress = 100;
    if (this.status.totalTransactions > 0) {
      this.history.unshift({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        scale: this.status.scale || 'small',
        durationSec: this.status.elapsedSec,
        warehouse: SCALES[this.status.scale || 'small'],
        totalTransactions: this.status.totalTransactions,
        tpm: this.status.tpm,
        avgLatencyMs: this.status.avgLatencyMs,
        finishedAt: new Date().toISOString(),
      });
      // 只保留最近 20 条
      this.history = this.history.slice(0, 20);
    }
  }

  /**
   * 建库建表 + 灌入初始数据
   */
  private async initialize(W: number, onProgress?: (msg: string, pct: number) => void): Promise<void> {
    await this.adapter.createDatabase(BENCH_DB);
    const db = BENCH_DB;

    // 建表
    const ddl = [
      `DROP TABLE IF EXISTS ${db}.new_order, ${db}.order_line, ${db}.history,
        ${db}.orders, ${db}.stock, ${db}.item, ${db}.customer, ${db}.district, ${db}.warehouse`,
      `CREATE TABLE ${db}.warehouse (
        w_id INT PRIMARY KEY, w_name VARCHAR(20), w_street VARCHAR(30),
        w_city VARCHAR(20), w_state VARCHAR(2), w_zip VARCHAR(9),
        w_tax DECIMAL(4,2), w_ytd DECIMAL(12,2))`,
      `CREATE TABLE ${db}.district (
        d_id INT, d_w_id INT, d_name VARCHAR(20), d_ytd DECIMAL(12,2),
        d_next_o_id INT, PRIMARY KEY (d_w_id, d_id))`,
      `CREATE TABLE ${db}.customer (
        c_id INT, c_d_id INT, c_w_id INT, c_first VARCHAR(30), c_last VARCHAR(30),
        c_credit VARCHAR(2), c_balance DECIMAL(12,2), c_ytd DECIMAL(12,2),
        c_credit_lim DECIMAL(12,2), c_discount DECIMAL(4,2),
        PRIMARY KEY (c_w_id, c_d_id, c_id))`,
      `CREATE TABLE ${db}.history (
        h_c_id INT, h_c_d_id INT, h_c_w_id INT, h_d_id INT, h_w_id INT,
        h_date DATETIME, h_amount DECIMAL(12,2), h_data VARCHAR(50))`,
      `CREATE TABLE ${db}.item (
        i_id INT PRIMARY KEY, i_name VARCHAR(30), i_price DECIMAL(5,2), i_data VARCHAR(50))`,
      `CREATE TABLE ${db}.stock (
        s_i_id INT, s_w_id INT, s_quantity INT, s_data VARCHAR(50),
        PRIMARY KEY (s_w_id, s_i_id))`,
      `CREATE TABLE ${db}.orders (
        o_id INT, o_d_id INT, o_w_id INT, o_c_id INT, o_ol_cnt INT,
        PRIMARY KEY (o_w_id, o_d_id, o_id))`,
      `CREATE TABLE ${db}.order_line (
        ol_o_id INT, ol_d_id INT, ol_w_id INT, ol_number INT,
        ol_i_id INT, ol_quantity INT, ol_amount DECIMAL(7,2),
        PRIMARY KEY (ol_w_id, ol_d_id, ol_o_id, ol_number))`,
      `CREATE TABLE ${db}.new_order (
        no_o_id INT, no_d_id INT, no_w_id INT, PRIMARY KEY (no_w_id, no_d_id, no_o_id))`,
    ];
    for (let i = 0; i < ddl.length; i++) {
      await this.adapter.execute(ddl[i]);
      // 建表进度 5%~20%
      const msg = `正在初始化 TPC-C 环境 (建表 ${i + 1}/${ddl.length})...`;
      const pct = Math.round(5 + (i / ddl.length) * 15);
      this.status.message = msg;
      this.status.progress = pct;
      onProgress?.(msg, pct);
    }

    // 灌数据（进度 20%~40%）
    this.status.message = '正在灌入初始数据...';
    this.status.progress = 20;
    onProgress?.('正在灌入初始数据...', 20);
    await this.seedData(W, (pct) => {
      const msg = `正在灌入初始数据 (${pct}%)...`;
      const progress = 20 + Math.round(pct * 0.2);
      this.status.message = msg;
      this.status.progress = progress;
      onProgress?.(msg, progress);
    });
  }

  /**
   * 灌入初始数据（按 warehouse 规模 W）
   * @param onProgress 可选进度回调 (0-100)
   */
  private async seedData(W: number, onProgress?: (pct: number) => void): Promise<void> {
    const db = BENCH_DB;

    // 1. warehouse
    const wRows: string[] = [];
    for (let w = 1; w <= W; w++) {
      wRows.push(`(${w}, 'Warehouse_${w}', 'Street ${w}', 'City_${w}', 'CN', '10000', 0.10, 300000.00)`);
    }
    await this.adapter.execute(`INSERT INTO ${db}.warehouse VALUES ${wRows.join(',')}`);
    onProgress?.(10);

    // 2. district (W × 10)
    const dRows: string[] = [];
    for (let w = 1; w <= W; w++) {
      for (let d = 1; d <= 10; d++) {
        dRows.push(`(${d}, ${w}, 'District_${w}_${d}', 30000.00, 3001)`);
      }
    }
    await this.adapter.execute(`INSERT INTO ${db}.district VALUES ${dRows.join(',')}`);
    onProgress?.(20);

    // 3. item (固定 1000)
    const iRows: string[] = [];
    for (let i = 1; i <= 1000; i++) {
      iRows.push(`(${i}, 'Item_${i}', ${(Math.random() * 90 + 10).toFixed(2)}, 'data${i}')`);
    }
    await this.adapter.execute(`INSERT INTO ${db}.item VALUES ${iRows.join(',')}`);
    onProgress?.(30);

    // 4. customer (W × 100) + history — 逐 warehouse 灌入并汇报进度
    const cRows: string[] = [];
    const hRows: string[] = [];
    for (let w = 1; w <= W; w++) {
      for (let d = 1; d <= 10; d++) {
        for (let c = 1; c <= 100; c++) {
          cRows.push(`(${c}, ${d}, ${w}, 'First_${c}', 'Customer_${w}_${d}_${c}', 'GC',
            10.00, 10.00, 50000.00, 0.10)`);
          hRows.push(`(${c}, ${d}, ${w}, ${d}, ${w}, NOW(), 10.00, 'seed')`);
        }
      }
      // 每完成一个 warehouse 汇报进度 (30%~70%)
      onProgress?.(30 + Math.round((w / W) * 40));
    }
    // 分批插入避免 SQL 过长
    await this.batchInsert(cRows, 500, `INSERT INTO ${db}.customer VALUES`);
    await this.batchInsert(hRows, 500, `INSERT INTO ${db}.history VALUES`);

    // 5. stock (W × 1000) — 逐 warehouse 灌入并汇报进度 (70%~100%)
    for (let w = 1; w <= W; w++) {
      const sRows: string[] = [];
      for (let i = 1; i <= 1000; i++) {
        sRows.push(`(${i}, ${w}, 100, 'stock_${w}_${i}')`);
      }
      await this.batchInsert(sRows, 500, `INSERT INTO ${db}.stock VALUES`);
      onProgress?.(70 + Math.round((w / W) * 30));
    }
  }

  /**
   * 分批批量插入，避免单条 SQL 过长
   */
  private async batchInsert(rows: string[], batchSize: number, prefix: string): Promise<void> {
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      await this.adapter.execute(`${prefix} ${batch.join(',')}`);
    }
  }

  /**
   * 并发执行 5 种事务，按标准比例混合
   */
  private async executeBenchmark(W: number, durationSec: number): Promise<void> {
    const startTime = Date.now();
    const targetEnd = startTime + durationSec * 1000;

    // 事务计数器
    const txnStats = new Map<string, { count: number; totalLatency: number }>();
    for (const t of TXN_WEIGHTS) txnStats.set(t.name, { count: 0, totalLatency: 0 });

    // 选择下一个事务类型（按权重）
    const pickTxn = (): string => {
      let roll = Math.random() * 100;
      for (const t of TXN_WEIGHTS) {
        if (roll < t.weight) return t.name;
        roll -= t.weight;
      }
      return 'NewOrder';
    };

    // 并发工作器
    const concurrency = 4; // 4 个并发终端

    const worker = async () => {
      while (!this.stopRequested && Date.now() < targetEnd) {
        const txnName = pickTxn();
        const t0 = Date.now();
        try {
          await this.executeTransaction(txnName, W);
        } catch {
          // 单事务失败不计入（如主键冲突等），继续跑
        }
        const latency = Date.now() - t0;
        const stat = txnStats.get(txnName);
        if (stat) {
          stat.count++;
          stat.totalLatency += latency;
        }
      }
    };

    // 实时进度更新器（每 1 秒刷新一次 status）
    const progressTimer = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      let total = 0;
      let lat = 0;
      for (const t of TXN_WEIGHTS) {
        const s = txnStats.get(t.name)!;
        total += s.count;
        lat += s.totalLatency;
      }
      this.status.elapsedSec = Math.round(elapsed);
      this.status.totalTransactions = total;
      this.status.tpm = Math.round((total / Math.max(elapsed, 1)) * 60);
      this.status.avgLatencyMs = total > 0 ? Math.round(lat / total) : 0;
      // 测试进度 50%~99%（初始化阶段已消耗 0-50%）
      this.status.progress = Math.min(99, 50 + Math.round((elapsed / durationSec) * 49));
      // 更新 breakdown
      this.status.breakdown = TXN_WEIGHTS.map((t) => {
        const s = txnStats.get(t.name)!;
        return {
          name: t.name,
          count: s.count,
          avgLatencyMs: s.count > 0 ? Math.round(s.totalLatency / s.count) : 0,
        };
      });
    }, 200); // 200ms ≈ 5Hz 进度刷新

    // 启动并发工作器
    const workers = Array.from({ length: concurrency }, () => worker());
    await Promise.all(workers);

    // 停止进度更新器
    clearInterval(progressTimer);

    // 汇总
    const elapsedSec = (Date.now() - startTime) / 1000;
    let totalTxn = 0;
    let totalLatency = 0;
    const breakdown: TPCTransactionResult[] = TXN_WEIGHTS.map((t) => {
      const stat = txnStats.get(t.name)!;
      totalTxn += stat.count;
      totalLatency += stat.totalLatency;
      return {
        name: t.name,
        count: stat.count,
        avgLatencyMs: stat.count > 0 ? Math.round(stat.totalLatency / stat.count) : 0,
      };
    });

    this.status.elapsedSec = Math.round(elapsedSec);
    this.status.totalTransactions = totalTxn;
    this.status.tpm = Math.round((totalTxn / elapsedSec) * 60);
    this.status.avgLatencyMs = totalTxn > 0 ? Math.round(totalLatency / totalTxn) : 0;
    this.status.breakdown = breakdown;
    this.status.progress = 100;
  }

  /**
   * 执行单个 TPC-C 事务
   */
  private async executeTransaction(name: string, W: number): Promise<void> {
    const db = BENCH_DB;
    const use = `USE \`${db}\``;
    const w = Math.floor(Math.random() * W) + 1;
    const d = Math.floor(Math.random() * 10) + 1;
    const c = Math.floor(Math.random() * 100) + 1;

    switch (name) {
      case 'NewOrder': {
        const itemId = Math.floor(Math.random() * 1000) + 1;
        await this.adapter.execute(
          `${use}; BEGIN; ` +
          `INSERT INTO ${db}.orders (o_id, o_d_id, o_w_id, o_c_id, o_ol_cnt) ` +
          `VALUES (${this.nextOrderId(w, d)}, ${d}, ${w}, ${c}, 1); ` +
          `INSERT INTO ${db}.order_line (ol_o_id, ol_d_id, ol_w_id, ol_number, ol_i_id, ol_quantity, ol_amount) ` +
          `VALUES (${this.nextOrderId(w, d)}, ${d}, ${w}, 1, ${itemId}, 5, 100.00); ` +
          `INSERT INTO ${db}.new_order (no_o_id, no_d_id, no_w_id) ` +
          `VALUES (${this.nextOrderId(w, d)}, ${d}, ${w}); ` +
          `UPDATE ${db}.stock SET s_quantity = s_quantity - 1 WHERE s_w_id=${w} AND s_i_id=${itemId}; ` +
          `COMMIT`
        );
        break;
      }
      case 'Payment': {
        await this.adapter.execute(
          `${use}; BEGIN; ` +
          `UPDATE ${db}.customer SET c_balance = c_balance - 10 WHERE c_w_id=${w} AND c_d_id=${d} AND c_id=${c}; ` +
          `INSERT INTO ${db}.history (h_c_id, h_c_d_id, h_c_w_id, h_d_id, h_w_id, h_date, h_amount, h_data) ` +
          `VALUES (${c}, ${d}, ${w}, ${d}, ${w}, NOW(), 10.00, 'payment'); ` +
          `UPDATE ${db}.district SET d_ytd = d_ytd + 10 WHERE d_w_id=${w} AND d_id=${d}; ` +
          `COMMIT`
        );
        break;
      }
      case 'OrderStatus': {
        await this.adapter.execute(
          `${use}; SELECT o_id FROM ${db}.orders WHERE o_w_id=${w} AND o_d_id=${d} AND o_c_id=${c} ORDER BY o_id DESC LIMIT 1`
        );
        break;
      }
      case 'Delivery': {
        await this.adapter.execute(
          `${use}; BEGIN; ` +
          `DELETE FROM ${db}.new_order WHERE no_w_id=${w} AND no_d_id=${d} LIMIT 1; ` +
          `COMMIT`
        );
        break;
      }
      case 'StockLevel': {
        await this.adapter.execute(
          `${use}; SELECT COUNT(*) FROM ${db}.order_line ` +
          `WHERE ol_w_id=${w} AND ol_d_id=${d} AND ol_o_id > ${this.nextOrderId(w, d) - 20}`
        );
        break;
      }
    }
  }

  /**
   * 从 district 读取下一个订单号（简化：用固定值，避免并发读写冲突）
   */
  private nextOrderId(w: number, d: number): number {
    return 3001 + Math.floor(Math.random() * 1000);
  }
}
