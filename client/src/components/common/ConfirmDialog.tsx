import { useEffect, useRef } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '确认',
  cancelLabel = '取消',
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      const handleEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onCancel();
      };
      document.addEventListener('keydown', handleEsc);
      return () => document.removeEventListener('keydown', handleEsc);
    }
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center
        bg-black/40 backdrop-blur-sm transition-opacity"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        ref={dialogRef}
        className="bg-[var(--bg-primary)] rounded-xl shadow-2xl border border-[var(--border-color)]
          w-full max-w-sm mx-4 overflow-hidden animate-in"
        style={{ animation: 'fadeIn 0.15s ease-out' }}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">
            {title}
          </h3>
          <p className="text-sm text-[var(--text-secondary)] mt-1.5 leading-relaxed">
            {message}
          </p>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2.5 px-5 pb-5 pt-1">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium rounded-md
              bg-[var(--bg-secondary)] text-[var(--text-primary)]
              border border-[var(--border-color)]
              hover:bg-[var(--border-color)] transition-colors cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium rounded-md text-white transition-colors cursor-pointer
              ${variant === 'danger'
                ? 'bg-[var(--error)] hover:opacity-90'
                : 'bg-[var(--accent)] hover:bg-[var(--accent-hover)]'
              }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
