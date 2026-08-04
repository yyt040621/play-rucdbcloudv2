import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../ui/Icon';

interface HeaderProps {
  onReset: () => void;
  isResetting: boolean;
}

const NAV_ITEMS = [
  { path: '/', label: '首页', icon: 'home' },
  { path: '/test', label: '性能测试', icon: 'bolt' },
  { path: '/demo', label: '功能演示', icon: 'gamepad' },
] as const;

export function Header({ onReset, isResetting }: HeaderProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;

  return (
    <header className="flex items-center justify-between px-5 h-14 shrink-0
      bg-[var(--header-bg)] border-b border-[var(--border-color)]">
      {/* Logo + 导航 */}
      <div className="flex items-center gap-1">
        <div
          className="flex items-center gap-2.5 cursor-pointer shrink-0 mr-3"
          onClick={() => navigate('/')}
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center
              text-white font-bold text-lg select-none shadow-md"
            style={{ background: 'var(--gradient-brand)' }}
          >
            S
          </div>
          <div className="leading-tight">
            <span className="block font-bold text-[15px] tracking-tight text-[var(--text-primary)]">
              SQL Playground
            </span>
            <span className="block text-[10px] text-[var(--text-tertiary)]">rucdbcloud</span>
          </div>
        </div>

        {/* 导航 Tab（pill 式） */}
        <nav className="flex items-center gap-1 ml-2">
          {NAV_ITEMS.map((item) => {
            const active = currentPath === item.path;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 text-[13px] font-medium
                  rounded-full transition-all cursor-pointer
                  ${active
                    ? 'text-[var(--primary)] bg-[var(--primary-bg)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
                  }`}
              >
                <Icon name={item.icon} className="w-4 h-4" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* 右侧操作 */}
      <div className="flex items-center gap-2">
        <button onClick={onReset} disabled={isResetting} className="btn btn-outline btn-sm">
          <Icon name="refresh" className="w-3.5 h-3.5" />
          {isResetting ? '重置中...' : '重置沙箱'}
        </button>
      </div>
    </header>
  );
}
