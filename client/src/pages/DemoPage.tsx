import { useNavigate } from 'react-router-dom';
import { PageLayout } from './shared/PageLayout';

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

export function DemoPage() {
  const navigate = useNavigate();

  const DemoIcon = (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );

  return (
    <PageLayout
      title="功能演示"
      description="选择要体验的数据库操作"
      icon={DemoIcon}
      toolbar={null}
    >
      <div className="h-full flex flex-col items-center justify-center overflow-auto">
        <div className="grid grid-cols-2 gap-4 max-w-xl mx-auto px-4 pb-8 pt-8">
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
              <div
                className="absolute top-0 left-4 right-4 h-1 rounded-b-full opacity-50"
                style={{ backgroundColor: card.color }}
              />
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-3 mt-2"
                style={{ backgroundColor: card.color + '18' }}
              >
                {card.icon}
              </div>
              <h3 className="text-sm font-bold mb-1" style={{ color: card.color }}>
                {card.title}
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mb-3">
                {card.description}
              </p>
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

        <p className="text-xs text-[var(--text-secondary)] pb-6">
          每个操作类型都支持 📝<strong>表单模式</strong>（无需写 SQL）和 ⚡<strong>SQL 模式</strong>
        </p>
      </div>
    </PageLayout>
  );
}
