import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { IDatabaseAdapter } from '../adapters/database-adapter.interface';

/**
 * 确保 BenchBase 专用数据库存在（BenchBase --create 会自建 TPC-C 表）。
 * PG 用管理账号（playground 为库 owner/超管）；MySQL 用 root。
 */
export async function ensureBenchBaseDatabases(
  pgAdapter: IDatabaseAdapter,
  mysqlAdapter: IDatabaseAdapter
): Promise<void> {
  // PostgreSQL：CREATE DATABASE 不支持 IF NOT EXISTS，已存在时报 42P04，忽略
  try {
    await pgAdapter.execute(`CREATE DATABASE "${config.benchbase.pgDatabase}"`);
  } catch {
    /* 已存在则忽略 */
  }
  try {
    await mysqlAdapter.execute(`CREATE DATABASE IF NOT EXISTS \`${config.benchbase.mysqlDatabase}\``);
  } catch {
    /* 忽略 */
  }
}

export type TPCDatabase = 'mysql' | 'pgsql';
export type TPCScale = 'small' | 'medium' | 'large';

export interface BenchStatus {
  database: TPCDatabase;
  phase: 'idle' | 'creating' | 'loading' | 'running' | 'done' | 'error';
  running: boolean;
  elapsedSec: number;
  progressHint: string | null;
  lastThroughput: number | null;
  message: string | null;
}

export interface BenchPerTxn {
  throughput: number;
  avg: number;
  p50: number;
  p90: number;
  p99: number;
}

export interface BenchResult {
  database: TPCDatabase;
  scale: string;
  durationSec: number;
  /** 总耗时（秒）：含建表 + 灌数据 + 执行，由完成时记录 */
  totalElapsedSec: number;
  warehouses: number;
  tpmC: number;
  tpmTOTAL: number;
  transactionsPerSecond: number;
  avgLatencyMs: number;
  p99LatencyMs: number;
  totalTransactions: number;
  perTxn: Record<string, BenchPerTxn>;
  message?: string;
}

export interface BenchHistoryEntry {
  id: string;
  database: string;
  scale: string;
  durationSec: number;
  /** 总耗时（秒）：含建表 + 灌数据 + 执行 */
  totalElapsedSec: number;
  warehouses: number;
  totalTransactions: number;
  tpm: number;
  avgLatencyMs: number;
  finishedAt: string;
}

const SCALE_WAREHOUSES: Record<TPCScale, number> = { small: 2, medium: 5, large: 10 };
const SCALE_TERMINALS: Record<TPCScale, number> = { small: 4, medium: 8, large: 16 };
// BenchBase 的 -im 吞吐监控间隔（毫秒）
const MONITOR_INTERVAL_MS = 1000;

/** 事务类型顺序（TPC-C 标准，weights 顺序与之对应） */
const TXN_NAMES = ['NewOrder', 'Payment', 'OrderStatus', 'Delivery', 'StockLevel'];

/** XML 转义（密码/URL 里可能含 & < > " '） */
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** 从 stdout 行里尝试提取吞吐数字（txns/sec / tps / txn/sec） */
const THROUGHPUT_RE = /([\d.]+)\s*(?:txns?\/s|tps|txn\/sec|txns\/sec)/i;

interface RunningRun {
  db: TPCDatabase;
  scale: TPCScale;
  durationSec: number;
  workdir: string;
  proc: ChildProcess;
  status: BenchStatus;
  startedAt: number;
  result: BenchResult | null;
}

/**
 * BenchBase 压测执行器（替换自研 TPC-C）。
 * 一次只测一个数据库：spawn java 拉起 com.oltpbenchmark.DBWorkload，
 * 从 stdout 解析阶段与吞吐，跑完解析 results/ 下的 JSON 报告。
 */
export class BenchBaseRunner {
  private current: RunningRun | null = null;
  /** 每个数据库最近一轮的最终状态/结果（进程结束后仍可查询） */
  private lastByDb: Partial<Record<TPCDatabase, { status: BenchStatus; result: BenchResult | null }>> = {};
  private history: BenchHistoryEntry[] = [];

  getStatus(db: TPCDatabase): BenchStatus {
    if (this.current && this.current.db === db) {
      const s = this.current.status;
      s.elapsedSec = Math.round((Date.now() - this.current.startedAt) / 1000);
      return s;
    }
    return this.lastByDb[db]?.status || this.idleStatus(db);
  }

  getResult(db: TPCDatabase): BenchResult | null {
    const last = this.lastByDb[db];
    if (last && last.status.phase === 'done') return last.result;
    return null;
  }

  getHistory(): BenchHistoryEntry[] {
    return this.history;
  }

  async start(db: TPCDatabase, scale: TPCScale, durationSec: number): Promise<BenchStatus> {
    if (this.current && this.current.proc && this.current.status.running) {
      throw new Error(`已有测试在运行（${this.current.db}），请先停止`);
    }
    // 清理可能残留的进程
    if (this.current?.proc) {
      try { this.current.proc.kill('SIGKILL'); } catch { /* 忽略 */ }
    }

    const runId = uuidv4().replace(/-/g, '').substring(0, 12);
    const workdir = path.join(config.benchbase.workDir, runId);
    fs.mkdirSync(path.join(workdir, 'results'), { recursive: true });

    const warehouses = SCALE_WAREHOUSES[scale];
    const terminals = SCALE_TERMINALS[scale];
    const xml = this.buildConfig(db, warehouses, durationSec, terminals);
    fs.writeFileSync(path.join(workdir, 'tpcc_config.xml'), xml, 'utf8');

    // 显式 classpath：benchbase.jar + lib/*（lib 内含 PG + MySQL 双驱动）
    const home = config.benchbase.home;
    const cp = `${path.join(home, 'benchbase.jar')}${path.delimiter}${path.join(home, 'lib', '*')}`;
    const args = [
      `-Xmx${config.benchbase.xmx}`,
      '-cp', cp,
      'com.oltpbenchmark.DBWorkload',
      '-b', 'tpcc',
      '-c', path.join(workdir, 'tpcc_config.xml'),
      '--create=true', '--load=true', '--execute=true',
      '-im', String(MONITOR_INTERVAL_MS),
      '-d', path.join(workdir, 'results'),
    ];

    const status: BenchStatus = {
      database: db,
      phase: 'creating',
      running: true,
      elapsedSec: 0,
      progressHint: '正在启动 BenchBase...',
      lastThroughput: null,
      message: null,
    };

    const run: RunningRun = {
      db, scale, durationSec, workdir,
      // cwd 用发行包根目录：BenchBase 需要按相对路径找到 config/plugin.xml
      proc: spawn('java', args, { cwd: home }),
      status,
      startedAt: Date.now(),
      result: null,
    };
    this.current = run;

    let stdoutTail = '';
    run.proc.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      stdoutTail = (stdoutTail + text).slice(-4000);
      this.parseLine(run, text);
    });
    run.proc.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      stdoutTail = (stdoutTail + text).slice(-4000);
      // 错误阶段也归到 progressHint
      if (!status.message && /error|exception|failed/i.test(text)) {
        status.message = text.split('\n')[0].trim().slice(0, 300);
      }
    });
    run.proc.on('error', (err) => {
      status.running = false;
      status.phase = 'error';
      status.message = err.message;
    });
    run.proc.on('exit', (code) => {
      status.running = false;
      status.elapsedSec = Math.round((Date.now() - run.startedAt) / 1000);
      status.progressHint = stdoutTail.slice(-600).split('\n').filter(Boolean).slice(-6).join('\n');
      if (code === 0) {
        status.phase = 'done';
        status.message = null;
        run.result = this.parseResults(run);
        // 记录总耗时（含建表/灌数据/执行），供前端展示真实运行时长
        if (run.result) run.result.totalElapsedSec = status.elapsedSec;
        this.recordHistory(run);
      } else {
        status.phase = 'error';
        status.message = status.message || `BenchBase 退出码 ${code}`;
      }
      // 保留本轮最终状态与结果，供前端在结束后查询
      this.lastByDb[run.db] = { status, result: run.result };
      this.current = null;
    });

    return status;
  }

  stop(): boolean {
    const run = this.current;
    if (!run || !run.proc) return false;
    try { run.proc.kill('SIGTERM'); } catch { /* 忽略 */ }
    // 兜底：2 秒后未退出则强杀
    setTimeout(() => {
      if (run.proc.exitCode === null) {
        try { run.proc.kill('SIGKILL'); } catch { /* 忽略 */ }
      }
    }, 2000).unref();
    return true;
  }

  /** 生成 BenchBase TPC-C XML 配置 */
  buildConfig(db: TPCDatabase, warehouses: number, durationSec: number, terminals: number): string {
    const isPg = db === 'pgsql';
    const type = isPg ? 'POSTGRES' : 'MYSQL';
    const driver = isPg ? 'org.postgresql.Driver' : 'com.mysql.cj.jdbc.Driver';
    // 注意：URL 里的 & 必须转义为 &amp;，否则 XML 解析失败（SAXParseException）
    const url = isPg
      ? `jdbc:postgresql://${config.pg.host}:${config.pg.port}/${config.benchbase.pgDatabase}?sslmode=disable&amp;ApplicationName=tpcc&amp;reWriteBatchedInserts=true`
      : `jdbc:mysql://${config.db.host}:${config.db.port}/${config.benchbase.mysqlDatabase}?useSSL=false&amp;rewriteBatchedStatements=true&amp;serverTimezone=UTC`;
    const user = isPg ? config.pg.user : config.db.user;
    const password = isPg ? config.pg.password : config.db.password;

    const txnTypes = TXN_NAMES.map((n) => `    <transactiontype><name>${n}</name></transactiontype>`).join('\n');
    return `<?xml version="1.0"?>
<parameters>
  <type>${type}</type>
  <driver>${driver}</driver>
  <url>${url}</url>
  <username>${xmlEscape(user)}</username>
  <password>${xmlEscape(password)}</password>
  <reconnectOnConnectionFailure>true</reconnectOnConnectionFailure>
  <isolation>TRANSACTION_READ_COMMITTED</isolation>
  <batchsize>128</batchsize>
  <scalefactor>${warehouses}</scalefactor>
  <terminals>${terminals}</terminals>
  <works>
    <work>
      <time>${durationSec}</time>
      <rate>10000</rate>
      <weights>45,43,4,4,4</weights>
    </work>
  </works>
  <transactiontypes>
${txnTypes}
  </transactiontypes>
</parameters>`;
  }

  /** 解析 stdout：阶段 + 吞吐 */
  private parseLine(run: RunningRun, text: string): void {
    const status = run.status;
    for (const line of text.split('\n')) {
      const lower = line.toLowerCase();
      if (/build schema|creating schema|building database/i.test(lower)) {
        status.phase = 'creating';
        status.progressHint = '正在创建 TPC-C 表结构...';
      } else if (/loading data|load data|creating.*data/i.test(lower)) {
        status.phase = 'loading';
        status.progressHint = '正在灌入 TPC-C 数据...';
      }
      const m = line.match(THROUGHPUT_RE);
      if (m) {
        status.phase = 'running';
        const tps = parseFloat(m[1]);
        if (Number.isFinite(tps)) {
          status.lastThroughput = tps;
          status.progressHint = `运行中，当前吞吐 ≈ ${Math.round(tps)} txns/sec`;
        }
      }
    }
  }

  /** 解析 results/ 下的 BenchBase 输出：summary.json（总指标）+ per-txn CSV（明细） */
  private parseResults(run: RunningRun): BenchResult {
    const base: BenchResult = {
      database: run.db,
      scale: run.scale,
      durationSec: run.durationSec,
      totalElapsedSec: 0,
      warehouses: SCALE_WAREHOUSES[run.scale],
      tpmC: 0,
      tpmTOTAL: 0,
      transactionsPerSecond: 0,
      avgLatencyMs: 0,
      p99LatencyMs: 0,
      totalTransactions: 0,
      perTxn: {},
    };
    try {
      const files = this.findJsonFiles(run.workdir);
      let parsedSummary = false;
      for (const f of files) {
        if (!f.toLowerCase().includes('.summary.')) continue;
        const raw = JSON.parse(fs.readFileSync(f, 'utf8')) as Record<string, unknown>;
        this.extractSummaryFile(raw, base);
        parsedSummary = true;
      }
      // 每事务明细（results.<Txn>.csv → perTxn；NewOrder → tpmC）
      this.extractPerTxnFromCsv(run.workdir, base);
      if (!parsedSummary && base.tpmTOTAL === 0) {
        // 兜底：无 summary.json 时用实时吞吐近似
        const tps = this.current?.status.lastThroughput;
        if (tps) {
          base.transactionsPerSecond = tps;
          base.tpmTOTAL = Math.round(tps * 60);
          base.message = '吞吐为实时采样近似值（未找到 summary.json）';
        } else {
          base.message = '结果文件解析不完整';
        }
      }
    } catch {
      base.message = '结果文件解析不完整';
    }
    return base;
  }

  /** 解析 BenchBase summary.json（键名以实际输出为准） */
  private extractSummaryFile(raw: Record<string, unknown>, out: BenchResult): void {
    const num = (v: unknown): number | undefined =>
      typeof v === 'number' && Number.isFinite(v) ? v : undefined;

    const measured = num(raw['Measured Requests']);
    const elapsedNs = num(raw['Elapsed Time (nanoseconds)']);
    const tps = num(raw['Throughput (requests/second)']);
    const goodput = num(raw['Goodput (requests/second)']);

    const lat = (raw['Latency Distribution'] ?? {}) as Record<string, unknown>;
    const avgUs = num(lat['Average Latency (microseconds)']);
    const p50Us = num(lat['Median Latency (microseconds)']);
    const p90Us = num(lat['90th Percentile Latency (microseconds)']);
    const p99Us = num(lat['99th Percentile Latency (microseconds)']);

    if (measured) out.totalTransactions = Math.round(measured);
    if (tps) out.transactionsPerSecond = Math.round(tps * 100) / 100;
    if (measured && elapsedNs) {
      // tpmTOTAL = requests / (elapsed ns → 分钟)
      out.tpmTOTAL = Math.round(measured / (elapsedNs / 6e10));
    }
    if (!tps && goodput) out.transactionsPerSecond = Math.round(goodput * 100) / 100;
    if (avgUs) out.avgLatencyMs = Math.round(avgUs / 1000);
    if (p50Us) out.perTxn['TOTAL'] = { ...(out.perTxn['TOTAL'] || {} as BenchPerTxn), p50: Math.round(p50Us / 1000) };
    if (p90Us) out.perTxn['TOTAL'] = { ...(out.perTxn['TOTAL'] || {} as BenchPerTxn), p90: Math.round(p90Us / 1000) };
    if (p99Us) out.p99LatencyMs = Math.round(p99Us / 1000);
  }

  /** 解析 per-txn CSV：results.<Txn>.csv / results.csv，平均各时间窗口指标 */
  private extractPerTxnFromCsv(workdir: string, out: BenchResult): void {
    if (!fs.existsSync(workdir)) return;
    for (const f of this.findCsvFiles(workdir)) {
      const m = path.basename(f).match(/\.results\.([^.]+)\.csv$/);
      const txnName = m ? m[1] : 'TOTAL';
      const rows = this.parseCsv(f);
      if (rows.length === 0) continue;
      let tp = 0, avg = 0, p50 = 0, p90 = 0, p99 = 0, n = 0;
      for (const r of rows) {
        const a = parseFloat(r[1]); // Throughput (req/s)
        const b = parseFloat(r[2]); // Average Latency (ms)
        const c = parseFloat(r[5]); // Median
        const d = parseFloat(r[7]); // 90th
        const e = parseFloat(r[9]); // 99th
        if (!Number.isFinite(a)) continue;
        tp += a; avg += Number.isFinite(b) ? b : 0;
        p50 += Number.isFinite(c) ? c : 0; p90 += Number.isFinite(d) ? d : 0;
        p99 += Number.isFinite(e) ? e : 0; n++;
      }
      if (n === 0) continue;
      const perTxn: BenchPerTxn = {
        throughput: Math.round((tp / n) * 100) / 100,
        avg: Math.round((avg / n) * 10) / 10,
        p50: Math.round((p50 / n) * 10) / 10,
        p90: Math.round((p90 / n) * 10) / 10,
        p99: Math.round((p99 / n) * 10) / 10,
      };
      out.perTxn[txnName] = perTxn;
      // tpmC = NewOrder 吞吐 × 60
      if (txnName === 'NewOrder') out.tpmC = Math.round(perTxn.throughput * 60);
    }
  }

  /** 读取 CSV（跳过头行，按逗号拆分） */
  private parseCsv(file: string): string[][] {
    const text = fs.readFileSync(file, 'utf8');
    return text.split(/\r?\n/).filter(Boolean).slice(1).map((line) => line.split(','));
  }

  /** 递归查找工作目录下的所有 .csv 文件 */
  private findCsvFiles(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    const out: string[] = [];
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) out.push(...this.findCsvFiles(full));
      else if (name.toLowerCase().endsWith('.csv')) out.push(full);
    }
    return out;
  }

  /** 递归查找工作目录下的所有 .json 结果文件（BenchBase 的 -d 目录嵌套行为不确定） */
  private findJsonFiles(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    const out: string[] = [];
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) out.push(...this.findJsonFiles(full));
      else if (name.endsWith('.json')) out.push(full);
    }
    return out;
  }

  /** 从 BenchBase 的 JSON 中递归提取关键指标（容错，格式以实际运行为准） */
  private extractSummary(node: unknown, out: BenchResult): void {
    if (node === null || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    const lower = (s: string) => String(s).toLowerCase();

    // 顶层的 p50/p90/p99/avg 作为整体延迟分位数
    const p = out as BenchResult & { _p50?: number; _p90?: number; _p99?: number; _avg?: number };

    for (const [key, value] of Object.entries(obj)) {
      const k = lower(key);
      if (typeof value === 'number' && Number.isFinite(value)) {
        if (k === 'tpmtotal') out.tpmTOTAL = value;
        else if (k === 'tpmc') out.tpmC = value;
        else if (k === 'tps' || k === 'transactionspersecond' || k === 'throughput' || k === 'requests') {
          out.transactionsPerSecond = value;
          if (!out.tpmTOTAL) out.tpmTOTAL = value * 60;
        } else if (k === 'totaltxn' || k === 'transactions' || k === 'total') out.totalTransactions = value;
        else if (k === 'p50' || k === 'p50latency' || k === 'p50latencyms') p._p50 = value;
        else if (k === 'p90' || k === 'p90latency' || k === 'p90latencyms') p._p90 = value;
        else if (k === 'p99' || k === 'p99latency' || k === 'p99latencyms') p._p99 = value;
        else if (k === 'average' || k === 'avglatency' || k === 'mean' || k === 'avg') p._avg = value;
      } else {
        this.extractSummary(value, out);
      }
    }

    if (p._avg !== undefined) out.avgLatencyMs = Math.round(p._avg);
    if (p._p99 !== undefined) out.p99LatencyMs = Math.round(p._p99);
  }

  private idleStatus(db: TPCDatabase): BenchStatus {
    return {
      database: db,
      phase: 'idle',
      running: false,
      elapsedSec: 0,
      progressHint: null,
      lastThroughput: null,
      message: null,
    };
  }

  private recordHistory(run: RunningRun): void {
    const r = run.result;
    const entry: BenchHistoryEntry = {
      id: uuidv4(),
      database: run.db,
      scale: run.scale,
      durationSec: run.durationSec,
      totalElapsedSec: run.status.elapsedSec,
      warehouses: SCALE_WAREHOUSES[run.scale],
      totalTransactions: r?.totalTransactions || 0,
      tpm: Math.round(r?.tpmTOTAL || 0),
      avgLatencyMs: Math.round(r?.avgLatencyMs || 0),
      finishedAt: new Date().toISOString(),
    };
    this.history.unshift(entry);
    if (this.history.length > 20) this.history.length = 20;
  }
}
