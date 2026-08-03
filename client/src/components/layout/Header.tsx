import { useLocation, useNavigate } from 'react-router-dom';
import { ThemeToggle } from '../common/ThemeToggle';
import type { Theme } from '../../types';

interface HeaderProps {
  theme: Theme;
  onToggleTheme: () => void;
  onReset: () => void;
  isResetting: boolean;
}

const NAV_ITEMS = [
  { path: '/', label: '首页', icon: '🏠' },
  { path: '/test', label: '测试', icon: '⚡' },
  { path: '/demo', label: '演示', icon: '🎮' },
];

export function Header({ theme, onToggleTheme, onReset, isResetting }: HeaderProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;

  return (
    <header
      className="flex items-center justify-between px-5 py-2.5 border-b
        bg-[var(--header-bg)] border-[var(--border-color)] shrink-0"
      style={{ height: 48 }}
    >
      {/* Logo + 导航 */}
      <div className="flex items-center gap-1">
        <div
          className="flex items-center gap-2 cursor-pointer shrink-0 mr-2"
          onClick={() => navigate('/')}
        >
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
            <rect width="24" height="24" rx="6" fill="var(--accent)" />
            <text x="12" y="17" textAnchor="middle" fill="white" fontSize="13" fontWeight="bold">S</text>
          </svg>
          <span className="font-semibold text-base tracking-tight">SQL Playground</span>
        </div>

        {/* 导航 Tab */}
        <div className="flex items-center ml-4">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`relative px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer
                ${currentPath === item.path
                  ? 'text-[var(--accent)] bg-[var(--accent)]/10'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]'
                }`}
            >
              <span className="mr-1">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* 右侧操作 */}
      <div className="flex items-center gap-2">
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />

        <button
          onClick={onReset}
          disabled={isResetting}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border
            bg-[var(--bg-secondary)] border-[var(--border-color)]
            hover:bg-[var(--border-color)] transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {isResetting ? '重置中...' : '重置沙箱'}
        </button>
      </div>
    </header>
  );
}
