import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Monitor, Settings, Server,
  ChevronLeft, Network, Activity, Radar, History, ShieldCheck,
  BookOpen, Zap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';
import { useAppSelector } from '../../store/hooks';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

type NavItem = {
  path: string;
  label: string;
  icon: React.ElementType;
  end?: boolean;
  cta?: boolean;
};

const navGroups: { label: string | null; items: NavItem[] }[] = [
  {
    label: null,
    items: [
      { path: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    ],
  },
  {
    label: 'Infrastructure',
    items: [
      { path: '/os-profiles', label: 'OS Profiles', icon: Monitor },
      { path: '/servers',     label: 'Servers',     icon: Server  },
      { path: '/deploy',      label: 'Deploy',      icon: Zap, cta: true },
      { path: '/discovery',   label: 'Discovery',   icon: Radar   },
    ],
  },
  {
    label: 'Operations',
    items: [
      { path: '/deployments', label: 'History', icon: History },
      { path: '/gold-image', label: 'Gold Image', icon: ShieldCheck },
      { path: '/boot-menu', label: 'Boot Menu', icon: BookOpen },
    ],
  },
  {
    label: 'System',
    items: [
      { path: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation();
  const servers = useAppSelector(s => s.servers.servers);
  const deploying = servers.filter(s => s.status === 'deploying').length;
  const failed = servers.filter(s => s.status === 'failed').length;

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 228 }}
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      className="flex flex-col h-full flex-shrink-0 overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, #0d0d1a 0%, #0a0a14 100%)',
        borderRight: '1px solid rgba(255,255,255,0.055)',
      }}
    >
      {/* Logo */}
      <div
        className={cn(
          'flex items-center h-14 flex-shrink-0 px-4 border-b',
          collapsed ? 'justify-center' : 'gap-3'
        )}
        style={{ borderColor: 'rgba(255,255,255,0.055)' }}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
            boxShadow: '0 0 0 1px rgba(59,130,246,0.3), 0 4px 16px rgba(37,99,235,0.5)',
          }}
        >
          <Network size={16} className="text-white" />
        </div>

        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -6 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden whitespace-nowrap"
            >
              <div className="text-sm font-semibold text-slate-100 tracking-tight">PXE Deployer</div>
              <div className="text-[10px] text-slate-500 font-medium tracking-widest uppercase">Bare Metal</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 overflow-y-auto overflow-x-hidden space-y-0.5">
        {navGroups.map((group, gi) => (
          <div key={gi} className={gi > 0 ? 'pt-1' : ''}>
            {/* Group label */}
            <AnimatePresence>
              {!collapsed && group.label && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.14 }}
                  className="px-3 pb-1 pt-2"
                >
                  <span className="text-[10px] font-semibold tracking-widest uppercase"
                    style={{ color: 'rgba(100,116,139,0.7)' }}>
                    {group.label}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
            {collapsed && group.label && gi > 0 && (
              <div className="mx-3 my-1.5 h-px" style={{ background: 'rgba(255,255,255,0.05)' }} />
            )}

            {/* Nav items */}
            {group.items.map(({ path, label, icon: Icon, end, cta }) => {
              const isActive = end
                ? location.pathname === path
                : location.pathname.startsWith(path);
              const hasBadge = label === 'Servers' && (deploying > 0 || failed > 0);

              return (
                <NavLink key={path} to={path} end={end} title={collapsed ? label : undefined} className="block relative">
                  {isActive && (
                    <motion.div
                      layoutId="nav-active-bar"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full"
                      style={{ background: 'linear-gradient(180deg, #60a5fa, #2563eb)' }}
                      transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                    />
                  )}
                  <div
                    className={cn(
                      'flex items-center gap-3 ml-1 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                      isActive ? 'text-blue-300'
                        : cta ? 'text-blue-400 hover:text-blue-300 hover:bg-blue-500/[0.08]'
                        : 'text-slate-500 hover:text-slate-200 hover:bg-white/[0.04]',
                      collapsed && 'justify-center px-2'
                    )}
                    style={isActive ? {
                      background: 'linear-gradient(90deg, rgba(59,130,246,0.14) 0%, rgba(59,130,246,0.04) 100%)',
                    } : cta && !isActive ? {
                      background: 'rgba(59,130,246,0.07)',
                      border: '1px solid rgba(59,130,246,0.15)',
                    } : undefined}
                  >
                    <Icon size={16} className={cn('flex-shrink-0', isActive ? 'text-blue-400' : '')} />
                    <AnimatePresence>
                      {!collapsed && (
                        <motion.span
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.14 }}
                          className="truncate flex-1"
                        >
                          {label}
                        </motion.span>
                      )}
                    </AnimatePresence>
                    {!collapsed && hasBadge && (
                      <span className={cn(
                        'ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
                        failed > 0
                          ? 'bg-red-500/15 text-red-400 border border-red-500/25'
                          : 'bg-blue-500/15 text-blue-400 border border-blue-500/25'
                      )}>
                        {deploying + failed}
                      </span>
                    )}
                  </div>
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Infrastructure status */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.18 }}
            className="mx-2 mb-2 rounded-xl p-3"
            style={{
              background: 'rgba(255,255,255,0.022)',
              border: '1px solid rgba(255,255,255,0.05)',
            }}
          >
            <div className="flex items-center gap-1.5 mb-2.5">
              <Activity size={11} className="text-slate-500" />
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Infrastructure</span>
            </div>
            <div className="space-y-1.5">
              {[
                { label: 'TFTP Server', online: true },
                { label: 'DHCP Server', online: true },
                { label: 'File Server', online: true },
              ].map(({ label, online }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-500">{label}</span>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{
                        background: online ? '#10b981' : '#ef4444',
                        boxShadow: `0 0 6px ${online ? '#10b981' : '#ef4444'}`,
                      }}
                    />
                    <span className={cn('text-[11px] font-medium', online ? 'text-emerald-400' : 'text-red-400')}>
                      {online ? 'Online' : 'Offline'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Collapse toggle */}
      <div className="border-t p-2 flex-shrink-0" style={{ borderColor: 'rgba(255,255,255,0.055)' }}>
        <button
          onClick={onToggle}
          className={cn(
            'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-slate-600 hover:text-slate-300 hover:bg-white/[0.04] transition-all text-xs font-medium',
            collapsed && 'justify-center'
          )}
        >
          <motion.div animate={{ rotate: collapsed ? 180 : 0 }} transition={{ duration: 0.25 }}>
            <ChevronLeft size={16} />
          </motion.div>
          <AnimatePresence>
            {!collapsed && (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }}>
                Collapse
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </motion.aside>
  );
}
