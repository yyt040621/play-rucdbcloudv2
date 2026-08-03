import { useState, useEffect, useCallback, useRef } from 'react';
import { PageLayout } from './shared/PageLayout';
import { api } from '../services/api';
import type { TPCStatus, TPCHistoryEntry } from '../services/api';

const SCALE_OPTIONS = [
  { value: 'small', label: '小规模 (2 仓库)', desc: '约 1-2 秒初始化，适合快速演示' },
  { value: 'medium', label: '中规模 (5 仓库)', desc: '约 5 秒初始化，标准演示' },
  { value: 'large', label: '大规模 (10 仓库)', desc: '约 10 秒初始化，更接近真实负载' },
];

const DURATION_OPTIONS = [30, 60, 120];

const TXN_COLORS: Record<string, string> = {
  NewOrder: '#3B82F6',
  Payment: '#10B981',
  OrderStatus: '#F59E0B',
  Delivery: '#8B5CF6',
  StockLevel: '#EC4899',
};

export function TestPage() {
  const [scale, setScale] = useState('small');
  const [duration, setDuration] = useState(60);
  const [status, setStatus] = useState<TPCStatus | null>(null);
  const [history, setHistory] = useState<TPCHistoryEntry[]>([]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 加载历史记录
  useEffect(() => {
    api.tpccHistory().then(setHistory).catch(() => {});
  }, []);

  // 轮询状态
  useEffect(() => {
    pollRef.current = setInterval(async () => {
      try {
        const s = await api.tpccStatus();
        // 检测到运行结束（之前 running → 现在 stopped），刷新历史
        setStatus((prev) => {
          if (prev?.running && !s.running) {
            api.tpccHistory().then(setHistory).catch(() => {});
          }
          return s;
        });
      } catch { /* 静默 */ }
    }, 200); // 200ms ≈ 5Hz 轮询

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // 启动测试
  const handleStart = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      const s = await api.tpccStart(scale, duration);
      setStatus(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : '启动失败');
    } finally {
      setStarting(false);
    }
  }, [scale, duration]);

  // 停止测试
  const handleStop = useCallback(async () => {
    try {
      await api.tpccStop();
    } catch { /* 静默 */ }
  }, []);

  const isRunning = status?.running || false;
  const maxTxnCount = Math.max(...(status?.breakdown?.map((b) => b.count) || [1]), 1);

  const TestIcon = (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  );

  return (
    <PageLayout
      title="性能测试"
      description="TPC-C 数据库性能基准测试"
      icon={TestIcon}
      toolbar={null}
    >
      <div className="flex h-full overflow-hidden">
        {/* 左侧：配置 + 控制 */}
        <div className="w-80 border-r border-[var(--border-color)] overflow-y-auto
          bg-[var(--bg-secondary)] p-4 flex flex-col gap-5">
          {/* 规模选择 */}
          <div>
            <span className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase">
              测试规模
            </span>
            <div className="mt-2 space-y-1.5">
              {SCALE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors
                    ${scale === opt.value
                      ? 'bg-[var(--accent)]/10 border-[var(--accent)]/50'
                      : 'border-[var(--border-color)] hover:border-[var(--accent)]/30'
                    }`}
                >
                  <input
                    type="radio"
                    name="scale"
                    value={opt.value}
                    checked={scale === opt.value}
                    onChange={() => setScale(opt.value)}
                    className="mt-0.5 accent-[var(--accent)]"
                    disabled={isRunning}
                  />
                  <div>
                    <div className="text-xs font-medium text-[var(--text-primary)]">{opt.label}</div>
                    <div className="text-[10px] text-[var(--text-secondary)]">{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* 时长选择 */}
          <div>
            <span className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase">
              测试时长
            </span>
            <div className="mt-2 flex gap-2">
              {DURATION_OPTIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => setDuration(d)}
                  disabled={isRunning}
                  className={`flex-1 px-3 py-2 text-sm rounded-lg border cursor-pointer transition-colors
                    ${duration === d
                      ? 'bg-[var(--accent)]/10 border-[var(--accent)] text-[var(--accent)] font-medium'
                      : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--accent)]/30'
                    }`}
                >
                  {d}秒
                </button>
              ))}
            </div>
          </div>

          {/* 控制按钮 */}
          <div className="flex gap-2 mt-auto">
            {isRunning ? (
              <button
                onClick={handleStop}
                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg text-white
                  bg-[var(--error)] hover:opacity-90 transition-all cursor-pointer"
              >
                ⏹ 停止测试
              </button>
            ) : (
              <button
                onClick={handleStart}
                disabled={starting}
                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg text-white
                  bg-[var(--accent)] hover:bg-[var(--accent-hover)] transition-all
                  disabled:opacity-50 cursor-pointer shadow-sm"
              >
                {starting ? '启动中...' : '▶ 开始测试'}
              </button>
            )}
          </div>

          {error && (
            <div className="px-3 py-2.5 text-xs rounded-lg bg-[var(--error)]/10 border border-[var(--error)]/30 text-[var(--error)]">
              ⚠️ {error}
            </div>
          )}

          {/* 数据库接口说明 */}
          <div className="text-[10px] text-[var(--text-secondary)] p-3 rounded-lg
            bg-[var(--bg-primary)] border border-[var(--border-color)] leading-relaxed">
            <p className="font-semibold mb-1">💡 关于 TPC-C</p>
            <p>TPC-C 是数据库 OLTP 性能标准基准，模拟批发商订单处理系统，包含 5 种事务（NewOrder、Payment、OrderStatus、Delivery、StockLevel）。</p>
            <p className="mt-1.5 opacity-70">当前测试 MySQL 性能，未来可切换自研数据库。</p>
          </div>
        </div>

        {/* 右侧：进度 + 结果 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* 实时状态 */}
          <div className="p-5 border-b border-[var(--border-color)]">
            {!status || !status.running ? (
              <div className="text-center py-6 text-[var(--text-secondary)]">
                {status && status.ready ? (
                  <>
                    <p className="text-sm">✅ TPC-C 环境已就绪</p>
                    <p className="text-xs mt-1 opacity-60">选择规模后点击「开始测试」，立即运行</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm">{status?.message || '正在准备 TPC-C 环境...'}</p>
                    <p className="text-xs mt-1 opacity-60">首次加载需建表灌数据，请稍候</p>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {/* 进度条 */}
                <div>
                  <div className="flex justify-between text-xs text-[var(--text-secondary)] mb-1.5">
                    <span>{status.message || '测试进行中...'}</span>
                    <span>{status.progress}%</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-[var(--border-color)] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[var(--accent)] transition-all duration-500"
                      style={{ width: `${status.progress}%` }}
                    />
                  </div>
                </div>

                {/* 实时指标 */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-color)]">
                    <div className="text-[10px] text-[var(--text-secondary)] uppercase">已完成</div>
                    <div className="text-xl font-bold text-[var(--text-primary)]">
                      {status.totalTransactions.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-[var(--text-secondary)]">事务</div>
                  </div>
                  <div className="p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-color)]">
                    <div className="text-[10px] text-[var(--text-secondary)] uppercase">TPM</div>
                    <div className="text-xl font-bold text-[var(--accent)]">
                      {status.tpm.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-[var(--text-secondary)]">每分钟事务数</div>
                  </div>
                  <div className="p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-color)]">
                    <div className="text-[10px] text-[var(--text-secondary)] uppercase">平均延迟</div>
                    <div className="text-xl font-bold text-[var(--text-primary)]">
                      {status.avgLatencyMs}
                    </div>
                    <div className="text-[10px] text-[var(--text-secondary)]">毫秒</div>
                  </div>
                </div>

                {/* 事务分布 */}
                <div className="space-y-2">
                  <div className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase">
                    事务分布
                  </div>
                  {status.breakdown.map((t) => (
                    <div key={t.name} className="flex items-center gap-2">
                      <span className="w-24 text-[10px] text-[var(--text-secondary)]">{t.name}</span>
                      <div className="flex-1 h-4 rounded bg-[var(--border-color)]/50 overflow-hidden">
                        <div
                          className="h-full rounded transition-all duration-500"
                          style={{
                            width: `${(t.count / maxTxnCount) * 100}%`,
                            backgroundColor: TXN_COLORS[t.name] || 'var(--accent)',
                          }}
                        />
                      </div>
                      <span className="w-14 text-right text-[10px] font-mono text-[var(--text-primary)]">
                        {t.count}
                      </span>
                      <span className="w-14 text-right text-[10px] font-mono text-[var(--text-secondary)]">
                        {t.avgLatencyMs}ms
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 历史记录 */}
          <div className="flex-1 overflow-auto">
            <div className="px-5 py-3 text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider
              border-b border-[var(--border-color)]">
              历史测试记录
            </div>
            {history.length === 0 ? (
              <div className="text-center py-8 text-[var(--text-secondary)] text-sm">
                暂无测试记录
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-color)]">
                {history.map((h) => (
                  <div key={h.id} className="px-5 py-3 flex items-center justify-between hover:bg-[var(--bg-secondary)]">
                    <div>
                      <div className="text-sm font-medium text-[var(--text-primary)]">
                        TPM <span className="text-[var(--accent)] font-bold">{h.tpm.toLocaleString()}</span>
                      </div>
                      <div className="text-[10px] text-[var(--text-secondary)]">
                        {h.scale} · {h.warehouse} 仓库 · {h.durationSec}s · {h.totalTransactions} 事务 · 平均 {h.avgLatencyMs}ms
                      </div>
                    </div>
                    <div className="text-[10px] text-[var(--text-secondary)]">
                      {new Date(h.finishedAt).toLocaleString('zh-CN')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
