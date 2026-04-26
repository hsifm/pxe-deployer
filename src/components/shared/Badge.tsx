import React from 'react';
import { cn } from '../../lib/utils';

type BadgeVariant = 'default' | 'blue' | 'green' | 'red' | 'yellow' | 'purple' | 'orange';

const variants: Record<BadgeVariant, string> = {
  default: 'bg-slate-700 text-slate-300',
  blue: 'bg-blue-900/40 text-blue-300 border border-blue-800/40',
  green: 'bg-emerald-900/40 text-emerald-300 border border-emerald-800/40',
  red: 'bg-red-900/40 text-red-300 border border-red-800/40',
  yellow: 'bg-yellow-900/40 text-yellow-300 border border-yellow-800/40',
  purple: 'bg-purple-900/40 text-purple-300 border border-purple-800/40',
  orange: 'bg-orange-900/40 text-orange-300 border border-orange-800/40',
};

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

export default function Badge({ variant = 'default', children, className }: BadgeProps) {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium', variants[variant], className)}>
      {children}
    </span>
  );
}
