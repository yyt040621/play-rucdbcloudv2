import { useEffect, useState } from 'react';
import { Icon } from '../ui/Icon';
import type { IconName } from '../ui/Icon';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  onClose: () => void;
  duration?: number;
}

const typeColors: Record<'success' | 'error' | 'info', string> = {
  success: 'var(--success)',
  error: 'var(--error)',
  info: 'var(--primary)',
};

const typeIcons: Record<'success' | 'error' | 'info', IconName> = {
  success: 'check',
  error: 'xcircle',
  info: 'info',
};

export function Toast({ message, type = 'info', onClose, duration = 4000 }: ToastProps) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setExiting(true);
      setTimeout(onClose, 300);
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const handleClose = () => {
    setExiting(true);
    setTimeout(onClose, 300);
  };

  return (
    <div
      className={`fixed top-4 right-4 z-[100] flex items-center gap-2.5 px-4 py-3
        rounded-lg border-l-4 border border-[var(--border-color)] shadow-pop
        bg-[var(--bg-primary)] max-w-md
        ${exiting ? 'toast-exit' : 'toast-enter'}`}
      style={{ borderLeftColor: typeColors[type] }}
    >
      <Icon name={typeIcons[type]} className="w-5 h-5 shrink-0" />
      <span className="text-sm flex-1 text-[var(--text-primary)]">{message}</span>
      <button
        onClick={handleClose}
        className="ml-2 opacity-50 hover:opacity-100 text-lg leading-none
          text-[var(--text-secondary)] cursor-pointer"
        aria-label="关闭"
      >
        ×
      </button>
    </div>
  );
}
