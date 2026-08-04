import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  children: ReactNode;
}

export function Chip({ active = false, className = '', children, ...rest }: ChipProps) {
  return (
    <button
      className={`chip ${active ? 'chip-active' : ''} ${className}`}
      aria-pressed={active}
      {...rest}
    >
      {children}
    </button>
  );
}
