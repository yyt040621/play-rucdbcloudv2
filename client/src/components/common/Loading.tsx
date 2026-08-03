export function Loading({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-10 h-10' };

  return (
    <div className="flex items-center justify-center p-4">
      <div
        className={`${sizeClasses[size]} border-2 border-[var(--accent)] border-t-transparent
          rounded-full animate-spin`}
      />
    </div>
  );
}

export function LoadingOverlay({ message }: { message?: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center
      bg-[var(--bg-primary)]/80 z-50 gap-3">
      <Loading size="lg" />
      {message && <p className="text-sm text-[var(--text-secondary)]">{message}</p>}
    </div>
  );
}
