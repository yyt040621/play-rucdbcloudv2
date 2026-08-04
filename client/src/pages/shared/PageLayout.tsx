import type { ReactNode } from 'react';

interface PageLayoutProps {
  /** 页面标题（中文） */
  title: string;
  /** 页面描述 */
  description: string;
  /** 操作图标（SVG） */
  icon: ReactNode;
  /** 页面右上角操作区 */
  toolbar: ReactNode;
  /** 主内容区 */
  children: ReactNode;
}

export function PageLayout({ title, description, icon, toolbar, children }: PageLayoutProps) {
  return (
    <div className="flex flex-col h-full overflow-hidden bg-[var(--bg-canvas)]">
      {/* 页面头部 */}
      <div className="flex items-center justify-between px-6 py-3.5 border-b
        border-[var(--border-color)] bg-[var(--bg-primary)] shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl
            bg-[var(--primary-bg)] text-[var(--primary)] shadow-sm">
            {icon}
          </div>
          <div>
            <h2 className="text-base font-bold text-[var(--text-primary)] leading-tight">{title}</h2>
            <p className="text-[13px] text-[var(--text-secondary)]">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {toolbar}
        </div>
      </div>

      {/* 主内容 */}
      <div className="flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
