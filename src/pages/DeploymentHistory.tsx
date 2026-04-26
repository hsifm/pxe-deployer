import React, { useState, useRef, useEffect } from 'react';
import {
  Clock, CheckCircle, XCircle, Loader, Terminal,
  Search, Filter, ChevronDown, ChevronRight, Trash2,
  TrendingUp, Activity, AlertTriangle, Download,
} from 'lucide-react';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import { updateDeployment } from '../store/slices/deploymentsSlice';
import Card, { CardHeader, CardBody } from '../components/shared/Card';
import StatusBadge from '../components/shared/StatusBadge';
import OSIcon from '../components/shared/OSIcon';
import Modal from '../components/shared/Modal';
import { Deployment } from '../types';
import { formatDate } from '../lib/utils';

type FilterStatus = 'all' | 'completed' | 'failed' | 'deploying';

function formatDuration(seconds?: number): string {
  if (!seconds) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export default function DeploymentHistory() {
  const dispatch = useAppDispatch();
  const deployments = useAppSelector(s => s.deployments.deployments);
  const osProfiles = useAppSelector(s => s.osProfiles.profiles);
  const configurations = useAppSelector(s => s.configurations.configs);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [logDep, setLogDep] = useState<Deployment | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logDep) logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logDep, deployments]);

  const filtered = deployments.filter(d => {
    const matchSearch = !search ||
      d.serverHostname.toLowerCase().includes(search.toLowerCase()) ||
      d.id.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || d.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // Stats
  const total = deployments.length;
  const completed = deployments.filter(d => d.status === 'completed').length;
  const failed = deployments.filter(d => d.status === 'failed').length;
  const deploying = deployments.filter(d => d.status === 'deploying').length;
  const successRate = (completed + failed) > 0
    ? Math.round((completed / (completed + failed)) * 100)
    : null;
  const avgDuration = (() => {
    const withDur = deployments.filter(d => d.duration);
    if (!withDur.length) return null;
    return Math.round(withDur.reduce((sum, d) => sum + (d.duration || 0), 0) / withDur.length);
  })();

  const exportLogs = (dep: Deployment) => {
    const text = dep.logs.join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deploy-${dep.serverHostname}-${dep.id}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Open log modal from the live log viewer
  const openLog = (dep: Deployment) => {
    setLogDep(dep);
    setExpandedId(null);
  };

  // Reflect live updates in modal
  const liveDep = logDep
    ? deployments.find(d => d.id === logDep.id) ?? logDep
    : null;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          {
            label: 'Total Deployments', value: total,
            color: '#60a5fa', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.18)',
            sub: deploying > 0 ? `${deploying} active` : 'lifetime',
          },
          {
            label: 'Successful', value: completed,
            color: '#10b981', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.18)',
            sub: successRate !== null ? `${successRate}% success rate` : 'no data yet',
          },
          {
            label: 'Failed', value: failed,
            color: failed > 0 ? '#ef4444' : '#22c55e',
            bg: failed > 0 ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.06)',
            border: failed > 0 ? 'rgba(239,68,68,0.18)' : 'rgba(34,197,94,0.14)',
            sub: failed > 0 ? 'needs review' : 'all clear',
          },
          {
            label: 'Avg Duration', value: avgDuration ? formatDuration(avgDuration) : '—',
            color: '#a855f7', bg: 'rgba(168,85,247,0.08)', border: 'rgba(168,85,247,0.18)',
            sub: 'per deployment',
          },
        ].map(({ label, value, color, bg, border, sub }) => (
          <div key={label} className="rounded-2xl p-4 border" style={{ background: bg, borderColor: border }}>
            <div className="text-2xl font-bold mb-0.5" style={{ color }}>{value}</div>
            <div className="text-sm font-medium text-slate-300">{label}</div>
            <div className="text-xs text-slate-500 mt-0.5">{sub}</div>
          </div>
        ))}
      </div>

      {/* Success rate bar */}
      {successRate !== null && (
        <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <TrendingUp size={14} className="text-slate-400" />
              <span className="text-sm font-medium text-slate-300">Deployment Success Rate</span>
            </div>
            <span className="text-sm font-bold tabular-nums" style={{
              color: successRate >= 90 ? '#10b981' : successRate >= 70 ? '#f59e0b' : '#ef4444'
            }}>
              {successRate}%
            </span>
          </div>
          <div className="h-2 bg-white/[0.04] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${successRate}%`,
                background: successRate >= 90
                  ? 'linear-gradient(90deg, #059669, #10b981)'
                  : successRate >= 70
                  ? 'linear-gradient(90deg, #d97706, #f59e0b)'
                  : 'linear-gradient(90deg, #dc2626, #ef4444)',
                boxShadow: `0 0 10px ${successRate >= 90 ? '#10b98150' : successRate >= 70 ? '#f59e0b50' : '#ef444450'}`,
              }}
            />
          </div>
          <p className="text-xs text-slate-500 mt-1.5">{completed} of {completed + failed} deployments completed successfully</p>
        </div>
      )}

      {/* Filter row */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by hostname or ID…"
            className="w-full rounded-xl pl-9 pr-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 border border-white/[0.07] bg-[rgba(255,255,255,0.04)]"
          />
        </div>
        <div className="flex gap-1.5">
          {(['all', 'completed', 'failed', 'deploying'] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all capitalize ${
                statusFilter === s
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                  : 'bg-[rgba(255,255,255,0.04)] text-slate-400 hover:bg-[rgba(255,255,255,0.07)] hover:text-slate-200 border border-white/[0.06]'
              }`}>
              {s}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-500 ml-auto">{filtered.length} of {total}</span>
      </div>

      {/* Table */}
      <Card>
        {filtered.length === 0 ? (
          <CardBody className="flex flex-col items-center justify-center h-48 gap-3 text-slate-500">
            <Activity size={22} />
            <p className="text-sm">{search || statusFilter !== 'all' ? 'No deployments match your filter' : 'No deployments yet'}</p>
          </CardBody>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {filtered.map(dep => {
              const os = osProfiles.find(o => o.id === dep.osProfileId);
              const cfg = configurations.find(c => c.id === dep.configurationId);
              const expanded = expandedId === dep.id;
              const isLive = dep.status === 'deploying';

              return (
                <div key={dep.id}>
                  {/* Row */}
                  <div
                    className="flex items-center gap-3 px-5 py-3.5 hover:bg-white/[0.02] transition-colors cursor-pointer"
                    onClick={() => setExpandedId(expanded ? null : dep.id)}
                  >
                    {/* OS icon */}
                    <div className="flex-shrink-0">
                      {os ? (
                        <OSIcon icon={os.icon} color={os.color} size="sm" />
                      ) : (
                        <div className="w-7 h-7 rounded-lg bg-white/[0.04] flex-shrink-0" />
                      )}
                    </div>

                    {/* Hostname */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-200 truncate flex items-center gap-1.5">
                        {dep.serverHostname}
                        {isLive && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 pulse-dot flex-shrink-0" />}
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        {os ? `${os.name} ${os.version}` : '—'} {cfg ? `· ${cfg.name}` : ''}
                      </div>
                    </div>

                    {/* Status */}
                    <div className="flex-shrink-0 hidden sm:block">
                      <StatusBadge status={dep.status} />
                    </div>

                    {/* Timing */}
                    <div className="flex-shrink-0 text-right hidden md:block">
                      <div className="text-xs text-slate-400 flex items-center gap-1 justify-end">
                        <Clock size={11} />
                        {formatDate(dep.startedAt)}
                      </div>
                      {dep.duration && (
                        <div className="text-xs text-slate-600">{formatDuration(dep.duration)}</div>
                      )}
                    </div>

                    {/* Log lines count */}
                    <div className="flex-shrink-0 hidden lg:block">
                      <span className="text-xs text-slate-600">{dep.logs.length} lines</span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => openLog(dep)}
                        title="View full logs"
                        className="p-1.5 rounded-lg text-slate-600 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                      >
                        <Terminal size={13} />
                      </button>
                      <button
                        onClick={() => exportLogs(dep)}
                        title="Download logs"
                        className="p-1.5 rounded-lg text-slate-600 hover:text-slate-200 hover:bg-white/[0.06] transition-colors"
                      >
                        <Download size={13} />
                      </button>
                      {expanded
                        ? <ChevronDown size={13} className="text-slate-500" />
                        : <ChevronRight size={13} className="text-slate-500" />
                      }
                    </div>
                  </div>

                  {/* Expanded log preview */}
                  {expanded && (
                    <div className="px-5 pb-4">
                      <div className="bg-black/50 rounded-xl border border-white/[0.05] overflow-hidden">
                        <div className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.05] bg-white/[0.02]">
                          <Terminal size={11} className="text-slate-500" />
                          <span className="text-xs text-slate-500">deployment log — {dep.serverHostname}</span>
                          <div className="ml-auto flex gap-1">
                            {isLive && <span className="text-xs text-blue-400 flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-blue-400 animate-pulse" />Live</span>}
                            {dep.status === 'completed' && <span className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle size={10} /> Done</span>}
                            {dep.status === 'failed' && <span className="text-xs text-red-400 flex items-center gap-1"><XCircle size={10} /> Failed</span>}
                          </div>
                        </div>
                        <div className="p-3 max-h-48 overflow-y-auto space-y-0.5 font-mono text-xs">
                          {dep.logs.length > 0 ? dep.logs.map((line, i) => (
                            <div key={i} className="text-emerald-400/80 leading-relaxed">
                              <span className="text-slate-700 select-none mr-2">{String(i + 1).padStart(3, '0')}</span>
                              {line}
                            </div>
                          )) : (
                            <div className="text-slate-600">No log output.</div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Full-screen log modal */}
      {liveDep && (
        <Modal
          open={!!logDep}
          onClose={() => setLogDep(null)}
          title="Deployment Logs"
          subtitle={liveDep.serverHostname}
          size="xl"
        >
          <div className="space-y-4">
            {/* Info strip */}
            <div className="flex flex-wrap gap-3 items-center p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              {(() => {
                const os = osProfiles.find(o => o.id === liveDep.osProfileId);
                const cfg = configurations.find(c => c.id === liveDep.configurationId);
                return (
                  <>
                    {os && <div className="flex items-center gap-2">
                      <OSIcon icon={os.icon} color={os.color} size="sm" />
                      <span className="text-xs text-slate-300">{os.name} {os.version}</span>
                    </div>}
                    {cfg && <span className="text-xs text-slate-500 border-l border-white/[0.08] pl-3">{cfg.name}</span>}
                    <div className="ml-auto flex items-center gap-3">
                      <StatusBadge status={liveDep.status} />
                      {liveDep.duration && (
                        <span className="text-xs text-slate-500">{formatDuration(liveDep.duration)}</span>
                      )}
                      <span className="text-xs text-slate-600 flex items-center gap-1">
                        <Clock size={10} />{formatDate(liveDep.startedAt)}
                      </span>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Terminal */}
            <div className="bg-black/60 rounded-xl border border-white/[0.06] overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.05] bg-white/[0.02]">
                <Terminal size={13} className="text-slate-500" />
                <span className="text-xs font-medium text-slate-500">stdout / deployment log</span>
                <div className="ml-auto flex items-center gap-3">
                  <span className="text-xs text-slate-600">{liveDep.logs.length} lines</span>
                  <button
                    onClick={() => exportLogs(liveDep)}
                    className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    <Download size={11} /> Export
                  </button>
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
                  </div>
                </div>
              </div>
              <div className="p-4 max-h-96 overflow-y-auto space-y-1 font-mono text-xs">
                {liveDep.logs.length > 0 ? liveDep.logs.map((line, i) => (
                  <div key={i} className="text-emerald-400/90 leading-relaxed">
                    <span className="text-slate-600 select-none mr-2">{String(i + 1).padStart(3, '0')}</span>
                    {line}
                  </div>
                )) : (
                  <div className="text-slate-600">No log output yet…</div>
                )}
                <div ref={logEndRef} />
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
