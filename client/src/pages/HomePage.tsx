import { useNavigate } from 'react-router-dom';

interface EntryCardProps {
  title: string;
  description: string;
  icon: string;
  color: string;
  path: string;
  features: string[];
}

const ENTRIES: EntryCardProps[] = [
  {
    title: '性能测试',
    description: 'TPC-C 数据库基准测试',
    icon: '⚡',
    color: '#8B5CF6',
    path: '/test',
    features: ['TPC-C 标准事务', '实时 TPM 统计', '多规模可选'],
  },
  {
    title: '功能演示',
    description: '体验完整的 SQL 数据库操作',
    icon: '🎮',
    color: '#3B82F6',
    path: '/demo',
    features: ['表单 + SQL 双模式', '多用户沙箱', '安全隔离'],
  },
];

export function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="h-full flex flex-col items-center justify-center bg-[var(--bg-primary)] overflow-auto">
      {/* Hero */}
      <div className="text-center mb-10 mt-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl
          bg-[var(--accent)]/10 mb-5">
          <svg className="w-9 h-9" viewBox="0 0 24 24" fill="none">
            <rect width="24" height="24" rx="6" fill="var(--accent)" />
            <text x="12" y="17" textAnchor="middle" fill="white" fontSize="13" fontWeight="bold">S</text>
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
          SQL Playground
        </h1>
        <p className="text-sm text-[var(--text-secondary)] max-w-md mx-auto leading-relaxed">
          演示我们的 rucdbcloud — 数据库性能测试与交互式操作体验平台。
        </p>
      </div>

      {/* 两个入口卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto px-4 pb-10 w-full">
        {ENTRIES.map((entry) => (
          <button
            key={entry.path}
            onClick={() => navigate(entry.path)}
            className="group relative flex flex-col items-center p-7 rounded-2xl border-2
              border-[var(--border-color)] bg-[var(--bg-secondary)]
              hover:border-[var(--accent)]/50 hover:shadow-lg
              hover:-translate-y-0.5 transition-all duration-200 cursor-pointer
              text-center"
          >
            <div
              className="absolute top-0 left-4 right-4 h-1.5 rounded-b-full opacity-50"
              style={{ backgroundColor: entry.color }}
            />
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-4 mt-3"
              style={{ backgroundColor: entry.color + '18' }}
            >
              {entry.icon}
            </div>
            <h3
              className="text-base font-bold mb-1.5"
              style={{ color: entry.color }}
            >
              {entry.title}
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mb-4">
              {entry.description}
            </p>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {entry.features.map((f) => (
                <span
                  key={f}
                  className="px-2.5 py-1 text-[11px] rounded-full
                    border border-[var(--border-color)] text-[var(--text-secondary)]
                    group-hover:border-[var(--accent)]/30 group-hover:text-[var(--text-primary)]
                    transition-colors"
                >
                  {f}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>

      <p className="text-xs text-[var(--text-secondary)] pb-6">
        选择上方入口开始体验
      </p>
    </div>
  );
}
