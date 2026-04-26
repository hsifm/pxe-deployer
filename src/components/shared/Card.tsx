import React from 'react';
import { cn } from '../../lib/utils';

interface CardProps {
  className?: string;
  children: React.ReactNode;
  hover?: boolean;
  onClick?: () => void;
  glow?: boolean;
}

export default function Card({ className, children, hover, onClick, glow }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-xl overflow-hidden transition-all duration-200 relative',
        hover && 'cursor-pointer hover:translate-y-[-1px]',
        onClick && 'cursor-pointer',
        className
      )}
      style={{
        background: 'rgba(255,255,255,0.028)',
        border: '1px solid rgba(255,255,255,0.07)',
        boxShadow: hover
          ? '0 1px 3px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.2)'
          : '0 1px 3px rgba(0,0,0,0.3)',
        ...(glow && {
          boxShadow: '0 0 0 1px rgba(59,130,246,0.2), 0 0 20px rgba(59,130,246,0.06)',
        }),
      }}
      onMouseEnter={hover ? e => {
        (e.currentTarget as HTMLDivElement).style.border = '1px solid rgba(255,255,255,0.11)';
        (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.038)';
      } : undefined}
      onMouseLeave={hover ? e => {
        (e.currentTarget as HTMLDivElement).style.border = '1px solid rgba(255,255,255,0.07)';
        (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.028)';
      } : undefined}
    >
      {/* Subtle gradient top accent */}
      <div
        className="absolute top-0 inset-x-0 h-px pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, rgba(99,102,241,0.35) 30%, rgba(59,130,246,0.45) 50%, rgba(99,102,241,0.35) 70%, transparent 100%)',
        }}
      />
      {children}
    </div>
  );
}

interface CardHeaderProps {
  className?: string;
  children: React.ReactNode;
}

export function CardHeader({ className, children }: CardHeaderProps) {
  return (
    <div
      className={cn('px-5 py-3.5', className)}
      style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
    >
      {children}
    </div>
  );
}

export function CardBody({ className, children }: CardHeaderProps) {
  return (
    <div className={cn('px-5 py-4', className)}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children }: CardHeaderProps) {
  return (
    <div
      className={cn('px-5 py-3 rounded-b-xl', className)}
      style={{
        borderTop: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(0,0,0,0.15)',
      }}
    >
      {children}
    </div>
  );
}
