import React from 'react';
import { cn } from '../../lib/utils';

interface OSIconProps {
  icon: string;
  color: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizes = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-14 h-14 text-lg',
  xl: 'w-20 h-20 text-2xl',
};

function UbuntuSVG({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="40" fill="currentColor" fillOpacity="0.15"/>
      <circle cx="50" cy="50" r="15" fill="currentColor"/>
      <circle cx="50" cy="18" r="8" fill="currentColor"/>
      <circle cx="76" cy="64" r="8" fill="currentColor"/>
      <circle cx="24" cy="64" r="8" fill="currentColor"/>
    </svg>
  );
}

function DebianSVG({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M50 10 C28 10 10 28 10 50 C10 72 28 90 50 90" stroke="currentColor" strokeWidth="6" fill="none" strokeLinecap="round"/>
      <path d="M50 10 C72 10 90 28 90 50 C90 67 77 82 60 87" stroke="currentColor" strokeWidth="6" fill="none" strokeLinecap="round"/>
      <path d="M55 35 C55 35 70 38 68 52 C66 65 53 72 45 65 C37 58 40 44 50 42" stroke="currentColor" strokeWidth="5" fill="none" strokeLinecap="round"/>
    </svg>
  );
}

function RockyLinuxSVG({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="38" stroke="currentColor" strokeWidth="5" fill="none"/>
      <polygon points="50,20 68,58 82,42" fill="currentColor" fillOpacity="0.3" stroke="currentColor" strokeWidth="3"/>
      <polygon points="50,20 32,58 18,42" fill="currentColor" fillOpacity="0.3" stroke="currentColor" strokeWidth="3"/>
      <polygon points="50,78 68,58 32,58" fill="currentColor" stroke="currentColor" strokeWidth="3"/>
    </svg>
  );
}

function WindowsSVG({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <rect x="12" y="12" width="34" height="34" rx="3"/>
      <rect x="54" y="12" width="34" height="34" rx="3" fillOpacity="0.7"/>
      <rect x="12" y="54" width="34" height="34" rx="3" fillOpacity="0.7"/>
      <rect x="54" y="54" width="34" height="34" rx="3" fillOpacity="0.5"/>
    </svg>
  );
}

export default function OSIcon({ icon, color, size = 'md', className }: OSIconProps) {
  const sizeClass = sizes[size];

  const renderIcon = () => {
    switch (icon) {
      case 'ubuntu': return <UbuntuSVG className="w-3/5 h-3/5" />;
      case 'debian': return <DebianSVG className="w-3/5 h-3/5" />;
      case 'rocky': return <RockyLinuxSVG className="w-3/5 h-3/5" />;
      case 'windows': return <WindowsSVG className="w-3/5 h-3/5" />;
      default: return <span className="font-bold uppercase">{icon.slice(0, 2)}</span>;
    }
  };

  return (
    <div
      className={cn(
        'rounded-xl flex items-center justify-center flex-shrink-0',
        sizeClass,
        className
      )}
      style={{ backgroundColor: `${color}22`, color }}
    >
      {renderIcon()}
    </div>
  );
}
