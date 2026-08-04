import { useNavigate } from 'react-router-dom';
import { PageLayout } from './shared/PageLayout';
import { Icon } from '../components/ui/Icon';
import type { IconName } from '../components/ui/Icon';

interface CardProps {
  title: string;
  description: string;
  icon: IconName;
  tone: 'primary' | 'success' | 'warning' | 'error';
  path: string;
  examples: string[];
}

const TONES = {
  primary: 'var(--primary)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  error: 'var(--error)',
} as const;

const CARDS: CardProps[] = [
  {
    title: 'SELECT',
    description: '查询数据',
    icon: 'search',
    tone: 'primary',
    path: '/select',
    examples: ['筛选员工', '表关联查询', '排序与分组'],
  },
  {
    title: 'CREATE',
    description: '创建表 / 插入数据',
    icon: 'plus',
    tone: 'success',
    path: '/create',
    examples: ['建表向导', '添加字段', '插入新记录'],
  },
  {
    title: 'UPDATE',
    description: '修改数据',
    icon: 'pencil',
    tone: 'warning',
    path: '/update',
    examples: ['修改薪资', '批量更新', '条件更新'],
  },
  {
    title: 'DELETE',
    description: '删除数据',
    icon: 'trash',
    tone: 'error',
    path: '/delete',
    examples: ['条件删除', '清理数据', '删除表'],
  },
];

export function DemoPage() {
  const navigate = useNavigate();

  const DemoIcon = <Icon name="gamepad" className="w-5 h-5" />;

  return (
    <PageLayout
      title="功能演示"
      description="选择要体验的数据库操作"
      icon={DemoIcon}
      toolbar={null}
    >
      <div className="h-full flex flex-col items-center justify-center overflow-auto">
        <div className="grid grid-cols-2 gap-5 max-w-2xl mx-auto px-4 pb-8 pt-8 w-full">
          {CARDS.map((card) => {
            const color = TONES[card.tone];
            return (
              <button
                key={card.path}
                onClick={() => navigate(card.path)}
                className="card group relative flex flex-col items-center p-7 rounded-2xl text-center
                  hover:-translate-y-1 hover:shadow-hover transition-all duration-200 cursor-pointer
                  overflow-hidden"
              >
                <div className="absolute top-0 left-0 right-0 h-1" style={{ background: color }} />
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center text-white mb-4 mt-2 shadow-md"
                  style={{ background: color }}
                >
                  <Icon name={card.icon} className="w-7 h-7" />
                </div>
                <h3 className="text-base font-bold mb-1 text-[var(--text-primary)]">{card.title}</h3>
                <p className="text-xs text-[var(--text-secondary)] mb-4">{card.description}</p>
                <div className="flex flex-wrap gap-1 justify-center">
                  {card.examples.map((ex) => (
                    <span key={ex} className="chip !cursor-default">{ex}</span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>

        <p className="text-xs text-[var(--text-secondary)] pb-6">
          每个操作类型都支持 <strong className="text-[var(--text-primary)]">表单模式</strong>（无需写 SQL）和{' '}
          <strong className="text-[var(--text-primary)]">SQL 模式</strong>
        </p>
      </div>
    </PageLayout>
  );
}
