import React from 'react';
import { cn } from '../../lib/utils';

// ─── Base input styles ────────────────────────────────────────────────────────
const inputBase =
  'w-full rounded-xl px-3 py-2 text-sm text-slate-200 placeholder-slate-500 ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-all ' +
  'border border-white/[0.07] ' +
  'bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.06)] ' +
  'focus:bg-[rgba(255,255,255,0.06)] focus:border-blue-500/40';

const inputMono = 'font-mono';
const inputDisabled = 'opacity-50 cursor-not-allowed';

// ─── Label ────────────────────────────────────────────────────────────────────
interface LabelProps {
  children: React.ReactNode;
  hint?: string;
  className?: string;
}

export function FieldLabel({ children, hint, className }: LabelProps) {
  return (
    <div className={cn('mb-1.5', className)}>
      <label className="block text-xs font-medium text-slate-400">{children}</label>
      {hint && <p className="text-xs text-slate-600 mt-0.5">{hint}</p>}
    </div>
  );
}

// ─── Input ────────────────────────────────────────────────────────────────────
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  mono?: boolean;
  error?: string;
}

export function Input({ label, hint, mono, error, className, ...props }: InputProps) {
  return (
    <div className="space-y-1.5">
      {label && <FieldLabel hint={!error ? hint : undefined}>{label}</FieldLabel>}
      <input
        className={cn(
          inputBase,
          mono && inputMono,
          props.disabled && inputDisabled,
          error && 'border-red-500/60 focus:ring-red-500/40',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      {!error && hint && !label && <p className="text-xs text-slate-600">{hint}</p>}
    </div>
  );
}

// ─── Select ───────────────────────────────────────────────────────────────────
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}

export function Select({ label, hint, error, className, children, ...props }: SelectProps) {
  return (
    <div className="space-y-1.5">
      {label && <FieldLabel hint={!error ? hint : undefined}>{label}</FieldLabel>}
      <select
        className={cn(
          inputBase,
          'appearance-none cursor-pointer',
          props.disabled && inputDisabled,
          error && 'border-red-500/60 focus:ring-red-500/40',
          className
        )}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

// ─── Textarea ─────────────────────────────────────────────────────────────────
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  mono?: boolean;
  error?: string;
}

export function Textarea({ label, hint, mono, error, className, ...props }: TextareaProps) {
  return (
    <div className="space-y-1.5">
      {label && <FieldLabel hint={!error ? hint : undefined}>{label}</FieldLabel>}
      <textarea
        className={cn(
          inputBase,
          'resize-none',
          mono && inputMono,
          props.disabled && inputDisabled,
          error && 'border-red-500/60 focus:ring-red-500/40',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
