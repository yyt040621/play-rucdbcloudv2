import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/ui/Icon';
import type { IconName } from '../components/ui/Icon';

interface EntryCardProps {
  title: string;
  description: string;
  icon: IconName;
  path: string;
  features: string[];
  /** 语义色（与首页渐变蓝区分，四个操作各一色） */
  tone: string;
}

const CARDS: EntryCardProps[] = [
  {
    title: 'SELECT',
    description: '查询数据',
    icon: 'search',
    tone: 'var(--primary)',
    path: '/select',
    features: ['筛选员工', '表关联查询', '排序与分组'],
  },
  {
    title: 'CREATE',
    description: '创建表 / 插入数据',
    icon: 'plus',
    tone: 'var(--success)',
    path: '/create',
    features: ['建表向导', '添加字段', '插入新记录'],
  },
  {
    title: 'UPDATE',
    description: '修改数据',
    icon: 'pencil',
    tone: 'var(--warning)',
    path: '/update',
    features: ['修改薪资', '批量更新', '条件更新'],
  },
  {
    title: 'DELETE',
    description: '删除数据',
    icon: 'trash',
    tone: 'var(--error)',
    path: '/delete',
    features: ['条件删除', '清理数据', '删除表'],
  },
];

export function DemoPage() {
  const navigate = useNavigate();

  return (
    <div className="h-full overflow-auto" style={{ background: 'var(--gradient-hero)' }}>
      <div className="max-w-5xl mx-auto px-6 pb-16 flex flex-col items-center">
        {/* Hero */}
        <div className="text-center mt-16 mb-12">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl
              text-white mb-6 shadow-lg"
            style={{ background: 'var(--gradient-brand)' }}
          >
            <Icon name="gamepad" className="w-8 h-8" />
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-[var(--text-primary)] mb-4">
            功能演示
          </h1>
          <p className="text-[15px] md:text-base text-[var(--text-secondary)] max-w-xl mx-auto leading-relaxed">
            体验完整的 SQL 数据库操作：查询、建表、更新、删除。
            <br className="hidden md:block" />
            表单模式 · SQL 模式 · 沙箱隔离
          </p>
          <div className="flex items-center justify-center gap-3 mt-8">
            <button onClick={() => navigate('/select')} className="btn btn-primary btn-lg">
              <Icon name="search" className="w-4 h-4" />
              立即查询
            </button>
            <button onClick={() => navigate('/create')} className="btn btn-outline btn-lg">
              <Icon name="plus" className="w-4 h-4" />
              创建数据表
            </button>
          </div>
        </div>

        {/* 入口卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full">
          {CARDS.map((card) => (
            <button
              key={card.path}
              onClick={() => navigate(card.path)}
              className="card group relative overflow-hidden p-7 text-left
                hover:-translate-y-1 hover:shadow-hover transition-all duration-200 cursor-pointer"
            >
              <div className="absolute top-0 left-0 right-0 h-1 rounded-t-lg" style={{ background: card.tone }} />
              <div className="flex items-start gap-4">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-white shrink-0 shadow-md"
                  style={{ background: card.tone }}
                >
                  <Icon name={card.icon} className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-[var(--text-primary)] mb-1">{card.title}</h3>
                  <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">{card.description}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-5">
                {card.features.map((f) => (
                  <span key={f} className="chip !cursor-default">{f}</span>
                ))}
              </div>
              <div className="flex items-center gap-1 mt-5 text-[13px] font-medium" style={{ color: card.tone }}>
                进入 {card.title}
                <Icon name="chevron" className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>
          ))}
        </div>

        {/* 底部说明 */}
        <p className="text-xs text-[var(--text-tertiary)] mt-12">
          每个操作类型都支持「表单模式」（无需写 SQL）与「SQL 模式」· 沙箱数据安全隔离
        </p>
      </div>
    </div>
  );
}
