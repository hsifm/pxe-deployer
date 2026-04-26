import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, RefreshCw, AlertTriangle, CheckCircle, XCircle, Clock, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppSelector } from '../../store/hooks';
import { formatDate } from '../../lib/utils';

const pageTitles: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Dashboard', subtitle: 'Infrastructure overview' },
  '/os-profiles': { title: 'OS Profiles', subtitle: 'Manage operating systems' },
  '/servers': { title: 'Server Inventory', subtitle: 'Bare-metal servers' },
  '/discovery': { title: 'Network Discovery', subtitle: 'Scan and import devices' },
  '/deployments': { title: 'Deployment History', subtitle: 'Full log archive & analytics' },
  '/gold-image':  { title: 'Gold Image Standards', subtitle: 'OS baseline & hardening playbooks' },
  '/boot-menu':   { title: 'PXE Boot Menu', subtitle: 'Network boot configuration' },
  '/settings': { title: 'Settings', subtitle: 'Infrastructure configuration' },
};

export default function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const servers = useAppSelector(s => s.servers.servers);
  const deployments = useAppSelector(s => s.deployments.deployments);
  const deploying = servers.filter(s => s.status === 'deploying').length;
  const failed = servers.filter(s => s.status === 'failed').length;

  const [notifOpen, setNotifOpen] = useState(false);
  const bellRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        bellRef.current && !bellRef.current.contains(e.target as Node) &&
        panelRef.current && !panelRef.current.contains(e.target as Node)
      ) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Notification items: active deployments + recent failures + recent completions
  const activeItems = servers
    .filter(s => s.status === 'deploying')
    .map(s => {
      const dep = deployments.find(d => d.serverId === s.id && d.status === 'deploying');
      return {
        id: s.id, type: 'deploying' as const,
        title: `Deploying ${s.hostname}`,
        detail: dep?.logs[dep.logs.length - 1] || 'In progress…',
        time: dep?.startedAt,
      };
    });

  const failedItems = deployments
    .filter(d => d.status === 'failed')
    .slice(0, 3)
    .map(d => ({
      id: d.id, type: 'failed' as const,
      title: `Deployment failed: ${d.serverHostname}`,
      detail: d.logs[d.logs.length - 1] || 'No log output',
      time: d.completedAt || d.startedAt,
    }));

  const completedItems = deployments
    .filter(d => d.status === 'completed')
    .slice(0, 3)
    .map(d => ({
      id: d.id, type: 'completed' as const,
      title: `${d.serverHostname} deployed successfully`,
      detail: d.duration ? `Completed in ${d.duration}s` : 'Completed',
      time: d.completedAt || d.startedAt,
    }));

  const notifications = [...activeItems, ...failedItems, ...completedItems];
  const hasNotifs = notifications.length > 0;
  const badgeCount = activeItems.length + failedItems.length;

  let pageInfo = pageTitles['/'];
  for (const [path, info] of Object.entries(pageTitles)) {
    if (location.pathname === path || (path !== '/' && location.pathname.startsWith(path))) {
      pageInfo = info;
    }
  }

  return (
    <header
      className="h-14 flex items-center px-5 gap-4 flex-shrink-0 sticky top-0 z-20"
      style={{
        background: 'rgba(7, 7, 15, 0.75)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.055)',
      }}
    >
      {/* Page title */}
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="flex-1 min-w-0"
      >
        <h1 className="text-sm font-semibold text-slate-100 leading-tight">{pageInfo.title}</h1>
        <p className="text-[11px] text-slate-500 leading-tight hidden sm:block">{pageInfo.subtitle}</p>
      </motion.div>

      {/* Status pills */}
      <div className="flex items-center gap-2">
        <AnimatePresence>
          {deploying > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, x: 8 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.9, x: 8 }}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
              style={{
                background: 'rgba(59,130,246,0.12)',
                border: '1px solid rgba(59,130,246,0.25)',
                color: '#93c5fd',
              }}
            >
              <RefreshCw size={11} className="animate-spin" />
              {deploying} deploying
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {failed > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, x: 8 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.9, x: 8 }}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
              style={{
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.22)',
                color: '#fca5a5',
              }}
            >
              <AlertTriangle size={11} />
              {failed} failed
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bell + notification panel */}
      <div className="relative">
        <button
          ref={bellRef}
          onClick={() => setNotifOpen(o => !o)}
          className="relative p-2 rounded-lg text-slate-500 hover:text-slate-200 transition-colors"
          style={{ background: notifOpen ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0)' }}
        >
          <Bell size={16} />
          {badgeCount > 0 && (
            <span
              className="absolute top-1 right-1 min-w-[14px] h-[14px] rounded-full flex items-center justify-center text-[9px] font-bold text-white px-0.5"
              style={{
                background: failed > 0 ? '#ef4444' : '#3b82f6',
                boxShadow: `0 0 6px ${failed > 0 ? '#ef4444' : '#3b82f6'}`,
              }}
            >
              {badgeCount > 9 ? '9+' : badgeCount}
            </span>
          )}
        </button>

        <AnimatePresence>
          {notifOpen && (
            <motion.div
              ref={panelRef}
              initial={{ opacity: 0, scale: 0.96, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -6 }}
              transition={{ duration: 0.14 }}
              className="absolute right-0 top-full mt-2 w-80 rounded-2xl shadow-2xl overflow-hidden z-50"
              style={{
                background: '#0e0e1d',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 24px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
              }}
            >
              {/* Panel header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <Bell size={13} className="text-slate-400" />
                  <span className="text-xs font-semibold text-slate-200">Notifications</span>
                  {badgeCount > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/25">
                      {badgeCount}
                    </span>
                  )}
                </div>
                <button onClick={() => setNotifOpen(false)} className="text-slate-600 hover:text-slate-300 transition-colors">
                  <X size={13} />
                </button>
              </div>

              {/* Notifications list */}
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-3 text-slate-600">
                    <div className="w-10 h-10 rounded-2xl bg-white/[0.03] border border-white/[0.05] flex items-center justify-center">
                      <Bell size={16} />
                    </div>
                    <p className="text-xs">No notifications</p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/[0.04]">
                    {notifications.map(n => (
                      <button
                        key={n.id}
                        onClick={() => { navigate('/deployments'); setNotifOpen(false); }}
                        className="w-full flex items-start gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors text-left"
                      >
                        {/* Status icon */}
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                          n.type === 'deploying' ? 'bg-blue-500/15 border border-blue-500/25' :
                          n.type === 'failed'    ? 'bg-red-500/15 border border-red-500/25' :
                                                   'bg-emerald-500/15 border border-emerald-500/25'
                        }`}>
                          {n.type === 'deploying' && <RefreshCw size={12} className="text-blue-400 animate-spin" />}
                          {n.type === 'failed'    && <XCircle size={12} className="text-red-400" />}
                          {n.type === 'completed' && <CheckCircle size={12} className="text-emerald-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-slate-200 truncate">{n.title}</div>
                          <div className="text-[10px] text-slate-500 truncate mt-0.5">{n.detail}</div>
                          {n.time && (
                            <div className="text-[10px] text-slate-600 flex items-center gap-1 mt-1">
                              <Clock size={9} />{formatDate(n.time)}
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              {notifications.length > 0 && (
                <div className="px-4 py-2.5 border-t border-white/[0.05]">
                  <button
                    onClick={() => { navigate('/deployments'); setNotifOpen(false); }}
                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors w-full text-center"
                  >
                    View full deployment history →
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* User avatar */}
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 cursor-pointer"
        style={{
          background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
          boxShadow: '0 0 0 2px rgba(255,255,255,0.08)',
        }}
      >
        AD
      </div>
    </header>
  );
}
