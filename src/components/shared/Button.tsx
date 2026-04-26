import React from 'react';
import { cn } from '../../lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
    border: '1px solid rgba(59,130,246,0.5)',
    color: '#fff',
    boxShadow: '0 1px 2px rgba(0,0,0,0.3), 0 0 0 1px rgba(59,130,246,0.2), inset 0 1px 0 rgba(255,255,255,0.1)',
  },
  secondary: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#cbd5e1',
    boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
  },
  ghost: {
    background: 'transparent',
    border: '1px solid transparent',
    color: '#94a3b8',
  },
  danger: {
    background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
    border: '1px solid rgba(239,68,68,0.5)',
    color: '#fff',
    boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
  },
  success: {
    background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
    border: '1px solid rgba(16,185,129,0.5)',
    color: '#fff',
    boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
  },
};

const sizes: Record<ButtonSize, string> = {
  xs: 'px-2 py-1 text-xs gap-1 rounded-md',
  sm: 'px-3 py-1.5 text-xs gap-1.5 rounded-lg',
  md: 'px-3.5 py-2 text-sm gap-2 rounded-lg',
  lg: 'px-5 py-2.5 text-sm gap-2 rounded-xl',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  iconRight,
  children,
  className,
  disabled,
  style,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-medium transition-all duration-150 cursor-pointer select-none',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        'active:scale-[0.97]',
        sizes[size],
        className
      )}
      disabled={disabled || loading}
      style={{ ...variantStyles[variant], ...style }}
      onMouseEnter={e => {
        if (!disabled && !loading) {
          (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.12)';
        }
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.filter = '';
      }}
      {...props}
    >
      {loading ? (
        <svg className="animate-spin w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
          <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      ) : icon ? (
        <span className="flex-shrink-0 opacity-90">{icon}</span>
      ) : null}
      {children}
      {iconRight && !loading && <span className="flex-shrink-0 opacity-90">{iconRight}</span>}
    </button>
  );
}
