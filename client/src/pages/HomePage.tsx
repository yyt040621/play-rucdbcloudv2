import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/ui/Icon';
import type { IconName } from '../components/ui/Icon';

interface EntryCardProps {
  title: string;
  description: string;
  icon: IconName;
  path: string;
  features: string[];
}

const ENTRIES: EntryCardProps[] = [
  {
    title: '性能测试',
    description: 'TPC-C 数据库基准测试，验证 PostgreSQL 与 MySQL 的吞吐与延迟',
    icon: 'bolt',
    path: '/test',
    features: ['TPC-C 标准事务', '实时 TPM 统计', '双数据库支持'],
  },
  {
    title: '功能演示',
    description: '体验完整的 SQL 数据库操作：查询、建表、更新、删除',
    icon: 'gamepad',
    path: '/demo',
    features: ['表单 + SQL 双模式', '多用户沙箱', '安全隔离'],
  },
];

export function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="h-full overflow-auto" style={{ background: 'var(--gradient-hero)' }}>
      <div className="max-w-5xl mx-auto px-6 pb-16 flex flex-col items-center">
        {/* Hero */}
        <div className="text-center mt-16 mb-12">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl
              text-white text-3xl font-bold mb-6 shadow-lg"
            style={{ background: 'var(--gradient-brand)' }}
          >
            S
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-[var(--text-primary)] mb-4">
            SQL Playground
          </h1>
          <p className="text-[15px] md:text-base text-[var(--text-secondary)] max-w-xl mx-auto leading-relaxed">
            rucdbcloud —— 在线数据库性能测试与交互式操作体验平台。
            <br className="hidden md:block" />
            沙箱隔离 · 双数据库 · 实时基准测试
          </p>
          <div className="flex items-center justify-center gap-3 mt-8">
            <button onClick={() => navigate('/test')} className="btn btn-primary btn-lg">
              <Icon name="bolt" className="w-4 h-4" />
              立即测试
            </button>
            <button onClick={() => navigate('/demo')} className="btn btn-outline btn-lg">
              <Icon name="gamepad" className="w-4 h-4" />
              查看演示
            </button>
          </div>
        </div>

        {/* 入口卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full">
          {ENTRIES.map((entry) => (
            <button
              key={entry.path}
              onClick={() => navigate(entry.path)}
              className="card group relative overflow-hidden p-7 text-left
                hover:-translate-y-1 hover:shadow-hover transition-all duration-200 cursor-pointer"
            >
              <div className="absolute top-0 left-0 right-0 h-1 rounded-t-lg" style={{ background: 'var(--gradient-brand)' }} />
              <div className="flex items-start gap-4">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-white shrink-0 shadow-md"
                  style={{ background: 'var(--gradient-brand)' }}
                >
                  <Icon name={entry.icon} className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-[var(--text-primary)] mb-1">{entry.title}</h3>
                  <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">{entry.description}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-5">
                {entry.features.map((f) => (
                  <span key={f} className="chip !cursor-default">{f}</span>
                ))}
              </div>
              <div className="flex items-center gap-1 mt-5 text-[13px] font-medium text-[var(--primary)]">
                进入 {entry.title}
                <Icon name="chevron" className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>
          ))}
        </div>

        {/* 底部说明 */}
        <p className="text-xs text-[var(--text-tertiary)] mt-12">
          每个用户独立沙箱 · 数据安全隔离 · 30 秒查询超时保护
        </p>
      </div>
    </div>
  );
}
