import React from 'react';
import { DeploymentStatus } from '../../types';
import { cn } from '../../lib/utils';

const statusConfig: Record<DeploymentStatus, {
  label: string;
  dot: string;
  glow: string;
  bg: string;
  text: string;
  border: string;
}> = {
  idle: {
    label: 'Idle',
    dot: '#64748b',
    glow: '#64748b',
    bg: 'rgba(100,116,139,0.1)',
    text: '#94a3b8',
    border: 'rgba(100,116,139,0.2)',
  },
  pending: {
    label: 'Pending',
    dot: '#f59e0b',
    glow: '#f59e0b',
    bg: 'rgba(245,158,11,0.1)',
    text: '#fcd34d',
    border: 'rgba(245,158,11,0.2)',
  },
  deploying: {
    label: 'Deploying',
    dot: '#3b82f6',
    glow: '#3b82f6',
    bg: 'rgba(59,130,246,0.1)',
    text: '#93c5fd',
    border: 'rgba(59,130,246,0.2)',
  },
  completed: {
    label: 'Deployed',
    dot: '#10b981',
    glow: '#10b981',
    bg: 'rgba(16,185,129,0.1)',
    text: '#6ee7b7',
    border: 'rgba(16,185,129,0.2)',
  },
  failed: {
    label: 'Failed',
    dot: '#ef4444',
    glow: '#ef4444',
    bg: 'rgba(239,68,68,0.1)',
    text: '#fca5a5',
    border: 'rgba(239,68,68,0.2)',
  },
};

interface StatusBadgeProps {
  status: DeploymentStatus;
  className?: string;
}

export default function StatusBadge({ status, className }: StatusBadgeProps) {
  const cfg = statusConfig[status];
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium', className)}
      style={{
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        color: cfg.text,
      }}
    >
      <span
        className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', status === 'deploying' && 'pulse-dot')}
        style={{
          background: cfg.dot,
          boxShadow: `0 0 5px ${cfg.glow}`,
        }}
      />
      {cfg.label}
    </span>
  );
}
