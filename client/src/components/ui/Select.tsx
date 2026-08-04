import type { SelectHTMLAttributes } from 'react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {}

export function Select({ className = '', children, ...rest }: SelectProps) {
  return (
    <select className={`select ${className}`} {...rest}>
      {children}
    </select>
  );
}
