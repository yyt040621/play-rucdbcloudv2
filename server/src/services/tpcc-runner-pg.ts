import { IDatabaseAdapter } from '../adapters/database-adapter.interface';
import { config } from '../config';

// ============================================================
// TPC-C 性能测试服务（PostgreSQL 版）
// 基于 IDatabaseAdapter 抽象，schema 隔离（tpcc_benchmark_pg schema）
// ============================================================

export type TPCScale = 'small' | 'medium' | 'large';

export interface TPCTransactionResult {
  name: string;
  count: number;
  avgLatencyMs: number;
}

export interface TPCStatus {
  running: boolean;
  ready: boolean;
  database: string;
  scale: TPCScale | null;
  progress: number;
  elapsedSec: number;
  totalTransactions: number;
  tpm: number;
  avgLatencyMs: number;
  breakdown: TPCTransactionResult[];
  message: string | null;
}

export interface TPCHistoryEntry {
  id: string;
  database: string;
  scale: TPCScale;
  durationSec: number;
  totalTransactions: number;
  tpm: number;
  avgLatencyMs: number;
  finishedAt: string;
}

const SCALES: Record<TPCScale, number> = {
  small: 2,
  medium: 5,
  large: 10,
};

const TXN_WEIGHTS: { name: string; weight: number }[] = [
  { name: 'NewOrder', weight: 45 },
  { name: 'Payment', weight: 43 },
  { name: 'OrderStatus', weight: 4 },
  { name: 'Delivery', weight: 4 },
  { name: 'StockLevel', weight: 4 },
];

export class TPCCRunnerPG {
  private schema = 'tpcc_benchmark_pg';
  private running = false;
  private stopRequested = false;
  private status: TPCStatus;
  private history: TPCHistoryEntry[] = [];

  constructor(private adapter: IDatabaseAdapter) {
    this.status = this.emptyStatus();
  }

  private emptyStatus(): TPCStatus {
    return {
      running: false,
      ready: false,
      database: 'PostgreSQL',
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
    return { ...this.status, breakdown: this.status.breakdown.map((b) => ({ ...b })) };
  }

  getHistory(): TPCHistoryEntry[] {
    return [...this.history];
  }

  /**
   * 预初始化 TPC-C 环境（建 schema + 灌数据）
   */
  preInitialize(): void {
    this.status.message = '正在准备 PostgreSQL TPC-C 环境...';
    void (async () => {
      try {
        await this.initialize(SCALES.large);
        this.status.ready = true;
        this.status.message = 'PostgreSQL TPC-C 环境已就绪';
      } catch (err) {
        console.error('TPC-C PG pre-initialize failed:', err);
        this.status.message = 'PostgreSQL TPC-C 环境初始化失败';
      }
    })();
  }

  async start(scale: TPCScale, durationSec: number): Promise<void> {
    if (this.running) {
      throw new Error('PostgreSQL TPC-C 测试正在运行，请等待完成或停止');
    }
    if (!SCALES[scale]) throw new Error(`Invalid scale: ${scale}`);
    const duration = Math.max(10, Math.min(durationSec, 300));

    this.running = true;
    this.stopRequested = false;
    this.status = this.emptyStatus();
    this.status.scale = scale;
    this.status.running = true;
    this.status.message = '正在启动测试...';

    void this.run(scale, duration).catch((err) => {
      this.status.message = `测试失败: ${err instanceof Error ? err.message : String(err)}`;
      this.finish();
    });
  }

  stop(): boolean {
    if (!this.running) return false;
    this.stopRequested = true;
    this.status.message = '正在停止...';
    return true;
  }

  // === 内部实现 ===

  private async run(scale: TPCScale, durationSec: number): Promise<void> {
    const W = SCALES[scale];
    if (!this.status.ready) {
      this.status.message = '正在初始化 PostgreSQL TPC-C 环境...';
      await this.initialize(W);
      this.status.ready = true;
    }
    this.status.message = '测试进行中...';
    await this.executeBenchmark(W, durationSec);
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
        database: 'PostgreSQL',
        scale: this.status.scale || 'small',
        durationSec: this.status.elapsedSec,
        totalTransactions: this.status.totalTransactions,
        tpm: this.status.tpm,
        avgLatencyMs: this.status.avgLatencyMs,
        finishedAt: new Date().toISOString(),
      });
      this.history = this.history.slice(0, 20);
    }
  }

  private async initialize(W: number): Promise<void> {
    const s = this.schema;
    await this.adapter.createDatabase(s);

    const ddl = [
      `DROP TABLE IF EXISTS ${s}.new_order, ${s}.order_line, ${s}.history,
        ${s}.orders, ${s}.stock, ${s}.item, ${s}.customer, ${s}.district, ${s}.warehouse CASCADE`,
      `CREATE TABLE ${s}.warehouse (
        w_id INT PRIMARY KEY, w_name VARCHAR(20), w_street VARCHAR(30),
        w_city VARCHAR(20), w_state VARCHAR(2), w_zip VARCHAR(9),
        w_tax DECIMAL(4,2), w_ytd DECIMAL(12,2))`,
      `CREATE TABLE ${s}.district (
        d_id INT, d_w_id INT, d_name VARCHAR(20), d_ytd DECIMAL(12,2),
        d_next_o_id INT, PRIMARY KEY (d_w_id, d_id))`,
      `CREATE TABLE ${s}.customer (
        c_id INT, c_d_id INT, c_w_id INT, c_first VARCHAR(30), c_last VARCHAR(30),
        c_credit VARCHAR(2), c_balance DECIMAL(12,2), c_ytd DECIMAL(12,2),
        c_credit_lim DECIMAL(12,2), c_discount DECIMAL(4,2),
        PRIMARY KEY (c_w_id, c_d_id, c_id))`,
      `CREATE TABLE ${s}.history (
        h_c_id INT, h_c_d_id INT, h_c_w_id INT, h_d_id INT, h_w_id INT,
        h_date TIMESTAMPTZ, h_amount DECIMAL(12,2), h_data VARCHAR(50))`,
      `CREATE TABLE ${s}.item (
        i_id INT PRIMARY KEY, i_name VARCHAR(30), i_price DECIMAL(5,2), i_data VARCHAR(50))`,
      `CREATE TABLE ${s}.stock (
        s_i_id INT, s_w_id INT, s_quantity INT, s_data VARCHAR(50),
        PRIMARY KEY (s_w_id, s_i_id))`,
      `CREATE TABLE ${s}.orders (
        o_id INT, o_d_id INT, o_w_id INT, o_c_id INT, o_ol_cnt INT,
        PRIMARY KEY (o_w_id, o_d_id, o_id))`,
      `CREATE TABLE ${s}.order_line (
        ol_o_id INT, ol_d_id INT, ol_w_id INT, ol_number INT,
        ol_i_id INT, ol_quantity INT, ol_amount DECIMAL(7,2),
        PRIMARY KEY (ol_w_id, ol_d_id, ol_o_id, ol_number))`,
      `CREATE TABLE ${s}.new_order (
        no_o_id INT, no_d_id INT, no_w_id INT, PRIMARY KEY (no_w_id, no_d_id, no_o_id))`,
    ];
    for (const sql of ddl) {
      await this.adapter.execute(sql);
    }
    await this.seedData(W);
  }

  private async seedData(W: number): Promise<void> {
    const s = this.schema;

    const wRows: string[] = [];
    for (let w = 1; w <= W; w++) wRows.push(`(${w}, 'Warehouse_${w}', 'Street ${w}', 'City_${w}', 'CN', '10000', 0.10, 300000.00)`);
    await this.adapter.execute(`INSERT INTO ${s}.warehouse VALUES ${wRows.join(',')}`);

    const dRows: string[] = [];
    for (let w = 1; w <= W; w++) for (let d = 1; d <= 10; d++) dRows.push(`(${d}, ${w}, 'D${w}_${d}', 30000.00, 3001)`);
    await this.adapter.execute(`INSERT INTO ${s}.district VALUES ${dRows.join(',')}`);

    const iRows: string[] = [];
    for (let i = 1; i <= 1000; i++) iRows.push(`(${i}, 'Item_${i}', ${(Math.random() * 90 + 10).toFixed(2)}, 'd${i}')`);
    await this.adapter.execute(`INSERT INTO ${s}.item VALUES ${iRows.join(',')}`);

    const cRows: string[] = [];
    const hRows: string[] = [];
    for (let w = 1; w <= W; w++) for (let d = 1; d <= 10; d++) for (let c = 1; c <= 100; c++) {
      cRows.push(`(${c}, ${d}, ${w}, 'F${c}', 'C${w}_${d}_${c}', 'GC', 10.00, 10.00, 50000.00, 0.10)`);
      hRows.push(`(${c}, ${d}, ${w}, ${d}, ${w}, NOW(), 10.00, 'seed')`);
    }
    await this.batchInsert(cRows, 500, `INSERT INTO ${s}.customer VALUES`);
    await this.batchInsert(hRows, 500, `INSERT INTO ${s}.history VALUES`);

    for (let w = 1; w <= W; w++) {
      const stRows: string[] = [];
      for (let i = 1; i <= 1000; i++) stRows.push(`(${i}, ${w}, 100, 's${w}_${i}')`);
      await this.batchInsert(stRows, 500, `INSERT INTO ${s}.stock VALUES`);
    }
  }

  private async batchInsert(rows: string[], batchSize: number, prefix: string): Promise<void> {
    for (let i = 0; i < rows.length; i += batchSize) {
      await this.adapter.execute(`${prefix} ${rows.slice(i, i + batchSize).join(',')}`);
    }
  }

  private async executeBenchmark(W: number, durationSec: number): Promise<void> {
    const startTime = Date.now();
    const targetEnd = startTime + durationSec * 1000;
    const txnStats = new Map<string, { count: number; totalLatency: number }>();
    for (const t of TXN_WEIGHTS) txnStats.set(t.name, { count: 0, totalLatency: 0 });

    const pickTxn = (): string => {
      let roll = Math.random() * 100;
      for (const t of TXN_WEIGHTS) {
        if (roll < t.weight) return t.name;
        roll -= t.weight;
      }
      return 'NewOrder';
    };

    const concurrency = 4;
    const worker = async () => {
      while (!this.stopRequested && Date.now() < targetEnd) {
        const txnName = pickTxn();
        const t0 = Date.now();
        try {
          await this.executeTransaction(txnName, W);
        } catch { /* 单事务失败忽略 */ }
        const latency = Date.now() - t0;
        const stat = txnStats.get(txnName);
        if (stat) { stat.count++; stat.totalLatency += latency; }
      }
    };

    // 实时进度更新
    const progressTimer = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      let total = 0, lat = 0;
      for (const t of TXN_WEIGHTS) {
        const s = txnStats.get(t.name)!;
        total += s.count; lat += s.totalLatency;
      }
      this.status.elapsedSec = Math.round(elapsed);
      this.status.totalTransactions = total;
      this.status.tpm = Math.round((total / Math.max(elapsed, 1)) * 60);
      this.status.avgLatencyMs = total > 0 ? Math.round(lat / total) : 0;
      this.status.progress = Math.min(99, Math.round((elapsed / durationSec) * 99));
      this.status.breakdown = TXN_WEIGHTS.map((t) => {
        const s = txnStats.get(t.name)!;
        return { name: t.name, count: s.count, avgLatencyMs: s.count > 0 ? Math.round(s.totalLatency / s.count) : 0 };
      });
    }, 200);

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    clearInterval(progressTimer);

    const elapsedSec = (Date.now() - startTime) / 1000;
    let total = 0, lat = 0;
    for (const t of TXN_WEIGHTS) { const s = txnStats.get(t.name)!; total += s.count; lat += s.totalLatency; }
    this.status.elapsedSec = Math.round(elapsedSec);
    this.status.totalTransactions = total;
    this.status.tpm = Math.round((total / Math.max(elapsedSec, 1)) * 60);
    this.status.avgLatencyMs = total > 0 ? Math.round(lat / total) : 0;
    this.status.breakdown = TXN_WEIGHTS.map((t) => {
      const s = txnStats.get(t.name)!;
      return { name: t.name, count: s.count, avgLatencyMs: s.count > 0 ? Math.round(s.totalLatency / s.count) : 0 };
    });
  }

  private async executeTransaction(name: string, W: number): Promise<void> {
    const s = this.schema;
    const w = Math.floor(Math.random() * W) + 1;
    const d = Math.floor(Math.random() * 10) + 1;
    const c = Math.floor(Math.random() * 100) + 1;
    const oid = 3001 + Math.floor(Math.random() * 1000);

    switch (name) {
      case 'NewOrder': {
        const itemId = Math.floor(Math.random() * 1000) + 1;
        await this.adapter.execute(
          `BEGIN; ` +
          `INSERT INTO ${s}.orders (o_id, o_d_id, o_w_id, o_c_id, o_ol_cnt) VALUES (${oid}, ${d}, ${w}, ${c}, 1); ` +
          `INSERT INTO ${s}.order_line (ol_o_id, ol_d_id, ol_w_id, ol_number, ol_i_id, ol_quantity, ol_amount) VALUES (${oid}, ${d}, ${w}, 1, ${itemId}, 5, 100.00); ` +
          `INSERT INTO ${s}.new_order (no_o_id, no_d_id, no_w_id) VALUES (${oid}, ${d}, ${w}); ` +
          `UPDATE ${s}.stock SET s_quantity = s_quantity - 1 WHERE s_w_id=${w} AND s_i_id=${itemId}; ` +
          `COMMIT`
        );
        break;
      }
      case 'Payment': {
        await this.adapter.execute(
          `BEGIN; ` +
          `UPDATE ${s}.customer SET c_balance = c_balance - 10 WHERE c_w_id=${w} AND c_d_id=${d} AND c_id=${c}; ` +
          `INSERT INTO ${s}.history (h_c_id, h_c_d_id, h_c_w_id, h_d_id, h_w_id, h_date, h_amount, h_data) VALUES (${c}, ${d}, ${w}, ${d}, ${w}, NOW(), 10.00, 'payment'); ` +
          `UPDATE ${s}.district SET d_ytd = d_ytd + 10 WHERE d_w_id=${w} AND d_id=${d}; ` +
          `COMMIT`
        );
        break;
      }
      case 'OrderStatus': {
        await this.adapter.execute(
          `SELECT o_id FROM ${s}.orders WHERE o_w_id=${w} AND o_d_id=${d} AND o_c_id=${c} ORDER BY o_id DESC LIMIT 1`
        );
        break;
      }
      case 'Delivery': {
        await this.adapter.execute(
          `BEGIN; ` +
          `DELETE FROM ${s}.new_order WHERE no_w_id=${w} AND no_d_id=${d} LIMIT 1; ` +
          `COMMIT`
        );
        break;
      }
      case 'StockLevel': {
        await this.adapter.execute(
          `SELECT COUNT(*) FROM ${s}.order_line WHERE ol_w_id=${w} AND ol_d_id=${d} AND ol_o_id > ${oid - 20}`
        );
        break;
      }
    }
  }
}
