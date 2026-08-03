import { useEffect, useState } from 'react';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  onClose: () => void;
  duration?: number;
}

const typeStyles = {
  success: 'border-[var(--success)] text-[var(--success)]',
  error: 'border-[var(--error)] text-[var(--error)]',
  info: 'border-[var(--accent)] text-[var(--accent)]',
};

const typeIcons = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
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
      className={`fixed top-4 right-4 z-[100] flex items-center gap-2 px-4 py-3
        rounded-lg border shadow-lg bg-[var(--bg-primary)] max-w-md
        ${typeStyles[type]} ${exiting ? 'toast-exit' : 'toast-enter'}`}
    >
      <span className="font-bold text-lg">{typeIcons[type]}</span>
      <span className="text-sm flex-1">{message}</span>
      <button onClick={handleClose} className="ml-2 opacity-60 hover:opacity-100 text-lg leading-none">
        ×
      </button>
    </div>
  );
}
