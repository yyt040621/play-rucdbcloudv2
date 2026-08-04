import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
}

export function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-2 text-[var(--text-secondary)] px-6">
      {icon && <div className="opacity-20">{icon}</div>}
      <p className="text-sm text-[var(--text-primary)] font-medium">{title}</p>
      {description && <p className="text-xs opacity-60 text-center">{description}</p>}
    </div>
  );
}
