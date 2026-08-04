interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  accent?: 'primary' | 'success' | 'warning' | 'error';
}

const ACCENT_COLORS: Record<NonNullable<StatCardProps['accent']>, string> = {
  primary: 'var(--primary)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  error: 'var(--error)',
};

export function StatCard({ label, value, hint, accent = 'primary' }: StatCardProps) {
  return (
    <div className="stat-card p-4 flex flex-col gap-1 min-w-0">
      <span className="text-xs text-[var(--text-secondary)] truncate">{label}</span>
      <span className="text-2xl font-bold leading-tight truncate" style={{ color: ACCENT_COLORS[accent] }}>
        {value}
      </span>
      {hint && <span className="text-[11px] text-[var(--text-tertiary)] truncate">{hint}</span>}
    </div>
  );
}
