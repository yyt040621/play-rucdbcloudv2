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
  private history: BenchHistoryEntry[] = [];

  getStatus(db: TPCDatabase): BenchStatus {
    if (this.current && this.current.db === db) {
      const s = this.current.status;
      s.elapsedSec = Math.round((Date.now() - this.current.startedAt) / 1000);
      return s;
    }
    return this.idleStatus(db);
  }

  getResult(db: TPCDatabase): BenchResult | null {
    if (this.current && this.current.db === db && this.current.status.phase === 'done') {
      return this.current.result;
    }
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
      '-c', 'tpcc_config.xml',
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
      proc: spawn('java', args, { cwd: workdir }),
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
      status.progressHint = stdoutTail.slice(-600).split('\n').filter(Boolean).slice(-6).join('\n');
      if (code === 0) {
        status.phase = 'done';
        status.message = null;
        run.result = this.parseResults(run);
        this.recordHistory(run);
      } else {
        status.phase = 'error';
        status.message = status.message || `BenchBase 退出码 ${code}`;
      }
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
    const url = isPg
      ? `jdbc:postgresql://${config.pg.host}:${config.pg.port}/${config.benchbase.pgDatabase}?sslmode=disable&ApplicationName=tpcc&reWriteBatchedInserts=true`
      : `jdbc:mysql://${config.db.host}:${config.db.port}/${config.benchbase.mysqlDatabase}?useSSL=false&rewriteBatchedStatements=true&serverTimezone=UTC`;
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

  /** 解析 results/ 下的 JSON 报告，容错失败 */
  private parseResults(run: RunningRun): BenchResult {
    const base: BenchResult = {
      database: run.db,
      scale: run.scale,
      durationSec: run.durationSec,
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
      for (const f of files) {
        const raw = JSON.parse(fs.readFileSync(f, 'utf8'));
        this.extractSummary(raw, base);
      }
      if (base.tpmTOTAL === 0 && this.current) {
        // 兜底：结果文件没解析出指标时，用最后一次吞吐近似
        const tps = this.current.status.lastThroughput;
        if (tps) {
          base.transactionsPerSecond = tps;
          base.tpmTOTAL = tps * 60;
          base.message = '吞吐为实时采样近似值（结果文件解析不完整）';
        } else {
          base.message = '结果文件解析不完整';
        }
      }
    } catch {
      base.message = '结果文件解析不完整';
    }
    return base;
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
