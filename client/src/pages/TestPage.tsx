import { useState, useEffect, useCallback, useRef } from 'react';
import { PageLayout } from './shared/PageLayout';
import { api } from '../services/api';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';
import { StatCard } from '../components/ui/StatCard';
import type { BenchStatus, BenchResult, TPCHistoryEntry } from '../services/api';

const SCALE_OPTIONS = [
  { value: 'small', label: '小规模 (2 仓库)', desc: '约 1-2 分钟，适合快速验证' },
  { value: 'medium', label: '中规模 (5 仓库)', desc: '约 2-3 分钟，标准演示' },
  { value: 'large', label: '大规模 (10 仓库)', desc: '约 3-5 分钟，更接近真实负载' },
];

// 固定执行时长（BenchBase 的测量窗口），不暴露给用户选择
const FIXED_DURATION_SEC = 60;

const PHASE_LABEL: Record<string, string> = {
  idle: '未开始',
  creating: '建表',
  loading: '灌数据',
  running: '运行中',
  done: '已完成',
  error: '失败',
};

const PHASE_TONE: Record<string, string> = {
  idle: 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]',
  creating: 'bg-[var(--primary-bg)] text-[var(--primary)]',
  loading: 'bg-[var(--warning-bg)] text-[var(--warning)]',
  running: 'bg-[var(--primary-bg)] text-[var(--primary)]',
  done: 'bg-[var(--success-bg)] text-[var(--success)]',
  error: 'bg-[var(--error-bg)] text-[var(--error)]',
};

export function TestPage() {
  const [database, setDatabase] = useState<'mysql' | 'pgsql'>('mysql');
  const [scale, setScale] = useState('small');
  const [status, setStatus] = useState<BenchStatus | null>(null);
  const [result, setResult] = useState<BenchResult | null>(null);
  const [history, setHistory] = useState<TPCHistoryEntry[]>([]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevRunningRef = useRef(false);

  const isRunning = status?.running || false;

  // 加载历史
  useEffect(() => {
    api.tpccHistory().then(setHistory).catch(() => {});
  }, []);

  // 轮询状态（1s 粗粒度）
  useEffect(() => {
    pollRef.current = setInterval(async () => {
      try {
        const s = await api.tpccStatus(database);
        // 从运行中 → 结束：拉取结果与历史
        if (prevRunningRef.current && !s.running && (s.phase === 'done' || s.phase === 'error')) {
          api.tpccResult(database).then(setResult).catch(() => {});
          api.tpccHistory().then(setHistory).catch(() => {});
        }
        prevRunningRef.current = s.running;
        setStatus(s);
      } catch { /* 静默 */ }
    }, 1000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [database]);

  const handleStart = useCallback(async () => {
    setStarting(true);
    setError(null);
    setResult(null);
    try {
      const s = await api.tpccStart(database, scale, FIXED_DURATION_SEC);
      prevRunningRef.current = s.running;
      setStatus(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : '启动失败');
    } finally {
      setStarting(false);
    }
  }, [database, scale]);

  const handleStop = useCallback(async () => {
    try { await api.tpccStop(database); } catch { /* 静默 */ }
  }, [database]);

  const TestIcon = <Icon name="bolt" className="w-5 h-5" />;

  return (
    <PageLayout
      title="性能测试"
      description="TPC-C 数据库性能基准测试（BenchBase）"
      icon={TestIcon}
      toolbar={null}
    >
      <div className="flex h-full overflow-hidden">
        {/* 左侧：配置 + 控制 */}
        <div className="w-80 border-r border-[var(--border-color)] overflow-y-auto
          bg-[var(--bg-primary)] p-4 flex flex-col gap-5">
          {/* 数据库选择 */}
          <div>
            <span className="block text-[13px] font-semibold text-[var(--text-primary)]">
              测试数据库
            </span>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {([
                { value: 'mysql', label: 'MySQL' },
                { value: 'pgsql', label: 'PostgreSQL' },
              ] as const).map((db) => (
                <button
                  key={db.value}
                  onClick={() => setDatabase(db.value)}
                  disabled={isRunning}
                  className={`flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-lg border cursor-pointer transition-all
                    ${database === db.value
                      ? 'border-[var(--primary)] bg-[var(--primary-bg)] text-[var(--primary)] shadow-sm'
                      : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--primary)]/40'
                    }`}
                >
                  <Icon name="database" className="w-5 h-5" />
                  <span className="text-xs font-medium">{db.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 规模 */}
          <div>
            <span className="block text-[13px] font-semibold text-[var(--text-primary)]">
              测试规模
            </span>
            <div className="mt-2 space-y-1.5">
              {SCALE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors
                    ${scale === opt.value
                      ? 'bg-[var(--primary-bg)] border-[var(--primary)]/50'
                      : 'border-[var(--border-color)] hover:border-[var(--primary)]/30'
                    }`}
                >
                  <input
                    type="radio"
                    name="scale"
                    value={opt.value}
                    checked={scale === opt.value}
                    onChange={() => setScale(opt.value)}
                    className="mt-0.5 accent-[var(--primary)]"
                    disabled={isRunning}
                  />
                  <div>
                    <div className="text-xs font-medium text-[var(--text-primary)]">{opt.label}</div>
                    <div className="text-[11px] text-[var(--text-secondary)]">{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* 控制按钮 */}
          <div className="flex gap-2 mt-auto">
            {isRunning ? (
              <Button onClick={handleStop} variant="danger" className="flex-1">
                <Icon name="stop" className="w-4 h-4" />
                停止测试
              </Button>
            ) : (
              <Button onClick={handleStart} disabled={starting} loading={starting} className="flex-1">
                {starting ? '启动中...' : (<><Icon name="play" className="w-4 h-4" />开始测试</>)}
              </Button>
            )}
          </div>

          {error && (
            <div className="px-3 py-2.5 text-xs rounded-lg flex items-start gap-1.5
              bg-[var(--error-bg)] border border-[var(--error)]/30 text-[var(--error)]">
              <Icon name="warning" className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* BenchBase 说明 */}
          <div className="text-xs text-[var(--text-secondary)] p-3 rounded-lg
            bg-[var(--bg-secondary)] border border-[var(--border-color)] leading-relaxed">
            <p className="font-semibold mb-1 flex items-center gap-1.5">
              <Icon name="lightbulb" className="w-3.5 h-3.5 text-[var(--primary)]" />
              关于 BenchBase
            </p>
            <p>BenchBase 是 CMU 开源的业界标准多数据库压测框架。本页用它运行标准 TPC-C 事务（NewOrder / Payment / OrderStatus / Delivery / StockLevel），结果可与其他数据库横向对比。</p>
          </div>
        </div>

        {/* 右侧：状态 + 结果 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* 状态区 */}
          <div className="p-5 border-b border-[var(--border-color)] bg-[var(--bg-primary)]">
            {!status || status.phase === 'idle' ? (
              <div className="text-center py-6 text-[var(--text-secondary)]">
                <p className="text-sm">选择数据库与规模，点击「开始测试」</p>
                <p className="text-xs mt-1 opacity-60">BenchBase 将自动建表、灌数据并执行标准 TPC-C</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${PHASE_TONE[status.phase] || PHASE_TONE.idle}`}>
                    {PHASE_LABEL[status.phase] || status.phase}
                  </span>
                  <span className="text-xs text-[var(--text-secondary)]">已运行 {status.elapsedSec}s</span>
                  {status.lastThroughput != null && status.running && (
                    <span className="text-xs text-[var(--text-secondary)]">
                      当前吞吐 ≈ {Math.round(status.lastThroughput)} txns/s
                    </span>
                  )}
                  {status.running && (
                    <span className="inline-block w-4 h-4 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
                  )}
                </div>
                {status.progressHint && (
                  <div className="text-xs text-[var(--text-secondary)] font-mono whitespace-pre-wrap leading-relaxed max-h-28 overflow-auto">
                    {status.progressHint}
                  </div>
                )}
                {status.message && status.phase === 'error' && (
                  <div className="px-3 py-2 text-xs rounded-lg bg-[var(--error-bg)] border border-[var(--error)]/30 text-[var(--error)]">
                    {status.message}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 结果 + 历史 */}
          <div className="flex-1 overflow-auto p-5 space-y-4">
            {result && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatCard label="TPM（总吞吐）" value={Math.round(result.tpmTOTAL ?? 0).toLocaleString()} hint="每分钟事务数" accent="primary" />
                  <StatCard label="tpmC" value={Math.round(result.tpmC ?? 0).toLocaleString()} hint="NewOrder 吞吐" accent="success" />
                  <StatCard label="平均延迟" value={`${result.avgLatencyMs}`} hint="毫秒" accent="warning" />
                  <StatCard label="P99 延迟" value={`${result.p99LatencyMs}`} hint="毫秒" accent="error" />
                </div>
                {result.message && (
                  <div className="px-3 py-2 text-xs rounded-lg bg-[var(--warning-bg)] border border-[var(--warning)]/30 text-[var(--warning)]">
                    {result.message}
                  </div>
                )}
                <div className="card p-4">
                  <div className="text-[13px] font-semibold text-[var(--text-primary)] mb-3">本次测试信息</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-[var(--text-secondary)]">
                    <div>数据库：{result.database === 'pgsql' ? 'PostgreSQL' : 'MySQL'}</div>
                    <div>规模：{result.scale}（{result.warehouses} 仓库）</div>
                    <div>总耗时：{result.totalElapsedSec != null && result.totalElapsedSec > 0 ? `${result.totalElapsedSec}s` : `${result.durationSec}s`}</div>
                    <div>总事务数：{(result.totalTransactions ?? 0).toLocaleString()}</div>
                  </div>
                </div>
              </div>
            )}

            {/* 历史 */}
            <div>
              <div className="px-1 py-2 text-[13px] font-semibold text-[var(--text-primary)]">
                历史测试记录
              </div>
              {history.length === 0 ? (
                <div className="text-center py-6 text-[var(--text-secondary)] text-sm">
                  暂无测试记录
                </div>
              ) : (
                <div className="divide-y divide-[var(--border-color)]">
                  {history.map((h) => (
                    <div key={h.id} className="py-3 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-[var(--text-primary)]">
                          TPM <span className="text-[var(--primary)] font-bold">{(h.tpm ?? 0).toLocaleString()}</span>
                        </div>
                        <div className="text-[11px] text-[var(--text-secondary)]">
                          {h.database === 'pgsql' ? 'PostgreSQL' : 'MySQL'} · {h.scale} · {h.warehouses} 仓库 · 总耗时 {h.totalElapsedSec != null && h.totalElapsedSec > 0 ? `${h.totalElapsedSec}s` : `${h.durationSec}s`} · {h.totalTransactions} 事务 · 平均 {h.avgLatencyMs}ms
                        </div>
                      </div>
                      <div className="text-[11px] text-[var(--text-secondary)]">
                        {new Date(h.finishedAt).toLocaleString('zh-CN')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
