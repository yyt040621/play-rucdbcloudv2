import { useNavigate } from 'react-router-dom';

interface CardProps {
  title: string;
  description: string;
  icon: string;
  color: string;
  path: string;
  examples: string[];
}

const CARDS: CardProps[] = [
  {
    title: 'SELECT',
    description: '查询数据',
    icon: '🔍',
    color: '#3B82F6',
    path: '/select',
    examples: ['筛选员工', '表关联查询', '排序与分组'],
  },
  {
    title: 'CREATE',
    description: '创建表 / 插入数据',
    icon: '➕',
    color: '#10B981',
    path: '/create',
    examples: ['建表向导', '添加字段', '插入新记录'],
  },
  {
    title: 'UPDATE',
    description: '修改数据',
    icon: '✏️',
    color: '#F59E0B',
    path: '/update',
    examples: ['修改薪资', '批量更新', '条件更新'],
  },
  {
    title: 'DELETE',
    description: '删除数据',
    icon: '🗑️',
    color: '#EF4444',
    path: '/delete',
    examples: ['条件删除', '清理数据', '删除表'],
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
          在线 SQL 交互式体验平台。选择下方操作类型开始体验，无需安装任何软件。
        </p>
      </div>

      {/* 四个卡片 */}
      <div className="grid grid-cols-2 gap-4 max-w-xl mx-auto px-4 pb-10">
        {CARDS.map((card) => (
          <button
            key={card.path}
            onClick={() => navigate(card.path)}
            className="group relative flex flex-col items-center p-6 rounded-2xl border-2
              border-[var(--border-color)] bg-[var(--bg-secondary)]
              hover:border-[var(--accent)]/50 hover:shadow-lg
              hover:-translate-y-0.5 transition-all duration-200 cursor-pointer
              text-center"
          >
            {/* 顶部色条 */}
            <div
              className="absolute top-0 left-4 right-4 h-1 rounded-b-full opacity-50"
              style={{ backgroundColor: card.color }}
            />

            {/* 图标 */}
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-3 mt-2"
              style={{ backgroundColor: card.color + '18' }}
            >
              {card.icon}
            </div>

            {/* 标题 */}
            <h3
              className="text-sm font-bold mb-1"
              style={{ color: card.color }}
            >
              {card.title}
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mb-3">
              {card.description}
            </p>

            {/* 示例标签 */}
            <div className="flex flex-wrap gap-1 justify-center">
              {card.examples.map((ex) => (
                <span
                  key={ex}
                  className="px-2 py-0.5 text-[10px] rounded-full
                    border border-[var(--border-color)] text-[var(--text-secondary)]
                    group-hover:border-[var(--accent)]/30 group-hover:text-[var(--text-primary)]
                    transition-colors"
                >
                  {ex}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>

      {/* 底部提示 */}
      <p className="text-xs text-[var(--text-secondary)] pb-6">
        每个操作类型都支持 📝<strong>表单模式</strong>（无需写 SQL）和 ⚡<strong>SQL 模式</strong>
      </p>
    </div>
  );
}
