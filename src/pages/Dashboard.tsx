import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Server, Monitor, XCircle, Loader, TrendingUp,
  HardDrive, Cpu, Zap, ArrowRight, Clock, Play,
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useAppSelector } from '../store/hooks';
import Card, { CardHeader, CardBody } from '../components/shared/Card';
import StatusBadge from '../components/shared/StatusBadge';
import OSIcon from '../components/shared/OSIcon';
import { formatDate } from '../lib/utils';

export default function Dashboard() {
  const navigate = useNavigate();
  const servers = useAppSelector(s => s.servers.servers);
  const osProfiles = useAppSelector(s => s.osProfiles.profiles);
  const configurations = useAppSelector(s => s.configurations.configs);
  const deployments = useAppSelector(s => s.deployments.deployments);

  const deployedCount = servers.filter(s => s.status === 'completed').length;
  const deployingCount = servers.filter(s => s.status === 'deploying').length;
  const failedCount = servers.filter(s => s.status === 'failed').length;
  const pendingCount = servers.filter(s => s.status === 'pending').length;
  const totalServers = servers.length;

  const completedDeps = deployments.filter(d => d.status === 'completed').length;
  const failedDeps = deployments.filter(d => d.status === 'failed').length;
  const totalDeps = completedDeps + failedDeps;
  const successRate = totalDeps > 0 ? Math.round((completedDeps / totalDeps) * 100) : null;

  const osDistribution = osProfiles.map(os => ({
    name: `${os.name} ${os.version}`,
    value: servers.filter(s => s.osProfileId === os.id).length,
    color: os.color,
  })).filter(d => d.value > 0);

  const statusData = [
    { name: 'Deployed', value: deployedCount, color: '#10b981' },
    { name: 'Deploying', value: deployingCount, color: '#3b82f6' },
    { name: 'Pending', value: pendingCount, color: '#f59e0b' },
    { name: 'Failed', value: failedCount, color: '#ef4444' },
    { name: 'Idle', value: servers.filter(s => s.status === 'idle').length, color: '#475569' },
  ].filter(d => d.value > 0);

  const recentDeployments = [...deployments].slice(0, 6);
  const activeDeployments = servers.filter(s => s.status === 'deploying');

  const statCards = [
    {
      label: 'Total Servers',
      value: totalServers,
      icon: Server,
      color: '#3b82f6',
      bgColor: 'rgba(59,130,246,0.1)',
      borderColor: 'rgba(59,130,246,0.2)',
      sub: `${deployedCount} deployed`,
      onClick: () => navigate('/servers'),
    },
    {
      label: 'OS Profiles',
      value: osProfiles.length,
      icon: Monitor,
      color: '#a855f7',
      bgColor: 'rgba(168,85,247,0.1)',
      borderColor: 'rgba(168,85,247,0.2)',
      sub: `${configurations.length} configurations`,
      onClick: () => navigate('/os-profiles'),
    },
    {
      label: 'Deploying Now',
      value: deployingCount,
      icon: Loader,
      color: '#f59e0b',
      bgColor: 'rgba(245,158,11,0.1)',
      borderColor: 'rgba(245,158,11,0.2)',
      sub: `${pendingCount} pending`,
      pulse: deployingCount > 0,
      onClick: () => navigate('/servers'),
    },
    {
      label: 'Failures',
      value: failedCount,
      icon: XCircle,
      color: failedCount > 0 ? '#ef4444' : '#22c55e',
      bgColor: failedCount > 0 ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.08)',
      borderColor: failedCount > 0 ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.15)',
      sub: failedCount > 0 ? 'Needs attention' : 'All clear',
      onClick: () => navigate('/servers'),
    },
  ];

  return (
    <div className="space-y-5">
      {/* Hero status bar */}
      <div
        className="relative rounded-2xl px-6 py-5 overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(37,99,235,0.13) 0%, rgba(124,58,237,0.08) 60%, transparent 100%)',
          border: '1px solid rgba(59,130,246,0.13)',
        }}
      >
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse at 0% 50%, rgba(59,130,246,0.12) 0%, transparent 55%)',
        }} />
        <div className="relative flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-100 tracking-tight">Infrastructure Overview</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {totalServers} server{totalServers !== 1 ? 's' : ''} registered
              {deployedCount > 0 && ` · ${deployedCount} deployed`}
              {deployingCount > 0
                ? ` · ${deployingCount} deploying now`
                : totalServers > 0 ? ' · no active deployments' : ''}
            </p>
          </div>
          {successRate !== null && (
            <div className="hidden sm:flex flex-col items-end flex-shrink-0">
              <span
                className="text-2xl font-bold tabular-nums"
                style={{
                  color: successRate >= 90 ? '#10b981' : successRate >= 70 ? '#f59e0b' : '#ef4444',
                  textShadow: `0 0 24px ${successRate >= 90 ? '#10b98160' : successRate >= 70 ? '#f59e0b60' : '#ef444460'}`,
                }}
              >
                {successRate}%
              </span>
              <span className="text-xs text-slate-500">success rate</span>
            </div>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {statCards.map(({ label, value, icon: Icon, color, bgColor, borderColor, sub, pulse, onClick }) => (
          <button
            key={label}
            onClick={onClick}
            className="text-left rounded-2xl p-5 border transition-all hover:scale-[1.01] active:scale-[0.99] group relative overflow-hidden"
            style={{ background: bgColor, borderColor }}
          >
            {/* Top gradient accent */}
            <div className="absolute top-0 inset-x-0 h-px" style={{
              background: `linear-gradient(90deg, transparent 0%, ${color}65 50%, transparent 100%)`,
            }} />
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{
                  background: `${color}20`,
                  border: `1px solid ${color}40`,
                  boxShadow: `0 0 20px ${color}25`,
                }}>
                <Icon size={18} style={{ color }} className={pulse ? 'animate-spin' : ''} />
              </div>
              <ArrowRight size={14} className="text-slate-600 group-hover:text-slate-400 group-hover:translate-x-0.5 transition-all" />
            </div>
            <div
              className="text-3xl font-bold mb-0.5 tabular-nums"
              style={{ color, textShadow: `0 0 28px ${color}55` }}
            >
              {value}
            </div>
            <div className="text-sm font-medium text-slate-300">{label}</div>
            <div className="text-xs text-slate-500 mt-0.5">{sub}</div>
          </button>
        ))}
      </div>

      {/* Live activity banner */}
      {activeDeployments.length > 0 && (
        <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-blue-400 pulse-dot" />
            <span className="text-sm font-medium text-blue-300">
              {activeDeployments.length} active deployment{activeDeployments.length > 1 ? 's' : ''} in progress
            </span>
          </div>
          <div className="space-y-2">
            {activeDeployments.slice(0, 3).map(server => {
              const dep = deployments.find(d => d.serverId === server.id && d.status === 'deploying');
              const os = osProfiles.find(o => o.id === server.osProfileId);
              return (
                <div key={server.id} className="flex items-center gap-3 p-3 rounded-xl bg-blue-500/5 border border-blue-500/10">
                  {os && <OSIcon icon={os.icon} color={os.color} size="sm" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-slate-200">{server.hostname}</div>
                    {dep?.logs && dep.logs.length > 0 && (
                      <code className="text-xs text-blue-400/80 font-mono truncate block">
                        {dep.logs[dep.logs.length - 1]}
                      </code>
                    )}
                  </div>
                  <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Charts + Recent */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* OS Distribution */}
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <TrendingUp size={15} className="text-slate-400" />
              OS Distribution
            </h3>
          </CardHeader>
          <CardBody>
            {osDistribution.length > 0 ? (
              <div className="flex flex-col items-center gap-4">
                <ResponsiveContainer width="100%" height={175}>
                  <PieChart>
                    <Pie
                      data={osDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={76}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {osDistribution.map((entry, index) => (
                        <Cell key={index} fill={entry.color} stroke="transparent" />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: 'rgba(13,13,26,0.95)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '10px',
                        color: '#f1f5f9',
                        fontSize: '12px',
                        backdropFilter: 'blur(12px)',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="w-full space-y-2">
                  {osDistribution.map(d => (
                    <div key={d.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: d.color, boxShadow: `0 0 4px ${d.color}` }} />
                        <span className="text-slate-300 truncate">{d.name}</span>
                      </div>
                      <span className="text-slate-400 font-medium tabular-nums">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-40 gap-3 text-slate-600">
                <div className="w-12 h-12 rounded-2xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-center">
                  <TrendingUp size={20} />
                </div>
                <p className="text-xs">No servers assigned to OS profiles</p>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Status Overview */}
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Zap size={15} className="text-slate-400" />
              Deployment Status
            </h3>
          </CardHeader>
          <CardBody>
            <div className="space-y-3">
              {statusData.length > 0 ? statusData.map(({ name, value, color }) => (
                <div key={name}>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-slate-400">{name}</span>
                    <span className="text-slate-300 font-medium tabular-nums">{value} / {totalServers}</span>
                  </div>
                  <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${totalServers > 0 ? (value / totalServers) * 100 : 0}%`,
                        backgroundColor: color,
                        boxShadow: `0 0 8px ${color}60`,
                      }}
                    />
                  </div>
                </div>
              )) : (
                <div className="text-xs text-slate-600 text-center py-4">No servers added yet</div>
              )}
            </div>

            {successRate !== null && (
              <div className="mt-5 p-3 rounded-xl bg-white/[0.025] border border-white/[0.06]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400">Deployment Success Rate</span>
                  <span className="text-sm font-bold" style={{ color: successRate >= 90 ? '#10b981' : successRate >= 70 ? '#f59e0b' : '#ef4444' }}>
                    {successRate}%
                  </span>
                </div>
                <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${successRate}%`,
                      backgroundColor: successRate >= 90 ? '#10b981' : successRate >= 70 ? '#f59e0b' : '#ef4444',
                      boxShadow: `0 0 8px ${successRate >= 90 ? '#10b98160' : successRate >= 70 ? '#f59e0b60' : '#ef444460'}`,
                    }}
                  />
                </div>
                <p className="text-xs text-slate-600 mt-1.5">{completedDeps} of {totalDeps} deployments successful</p>
              </div>
            )}

            <div className="mt-5 pt-4 border-t border-white/[0.05]">
              <h4 className="text-xs font-medium text-slate-500 mb-3 uppercase tracking-wider">Quick Actions</h4>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'OS Profiles', icon: Monitor, color: '#3b82f6', path: '/os-profiles' },
                  { label: 'Add Server', icon: Server, color: '#10b981', path: '/servers' },
                  { label: 'Boot Menu', icon: HardDrive, color: '#a855f7', path: '/boot-menu' },
                  { label: 'Settings', icon: Cpu, color: '#f97316', path: '/settings' },
                ].map(({ label, icon: Icon, color, path }) => (
                  <button
                    key={label}
                    onClick={() => navigate(path)}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs text-slate-300 transition-all hover:text-slate-100"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <Icon size={13} style={{ color }} />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Recent Deployments */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Clock size={15} className="text-slate-400" />
                Recent Deployments
              </h3>
              <button
                onClick={() => navigate('/deployments')}
                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
              >
                Full history <ArrowRight size={12} />
              </button>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            {recentDeployments.length > 0 ? (
              <div className="divide-y divide-white/[0.04]">
                {recentDeployments.map(dep => {
                  const os = osProfiles.find(o => o.id === dep.osProfileId);
                  const statusIcon =
                    dep.status === 'completed' ? { icon: '✓', color: '#10b981' } :
                    dep.status === 'failed'    ? { icon: '✕', color: '#ef4444' } :
                    dep.status === 'deploying' ? { icon: '↻', color: '#3b82f6' } :
                                                 { icon: '○', color: '#475569' };
                  return (
                    <div
                      key={dep.id}
                      className="px-5 py-3 flex items-center gap-3 hover:bg-white/[0.02] transition-colors cursor-pointer"
                      onClick={() => navigate('/deployments')}
                    >
                      <div className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                        style={{ background: `${statusIcon.color}18`, color: statusIcon.color, border: `1px solid ${statusIcon.color}30` }}>
                        {statusIcon.icon}
                      </div>
                      {os ? (
                        <OSIcon icon={os.icon} color={os.color} size="sm" />
                      ) : (
                        <div className="w-6 h-6 rounded-md bg-white/[0.05] flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-slate-200 truncate">{dep.serverHostname}</div>
                        <div className="text-xs text-slate-600 truncate">{formatDate(dep.startedAt)}</div>
                      </div>
                      {dep.duration && (
                        <span className="text-xs text-slate-600 flex-shrink-0">{dep.duration}s</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-32 gap-3 text-slate-600 px-5">
                <Clock size={20} />
                <p className="text-xs text-center">No deployments yet. Start one from the Servers page.</p>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Server inventory preview */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Server size={15} className="text-slate-400" />
              Server Inventory
            </h3>
            <button
              onClick={() => navigate('/servers')}
              className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
            >
              View all <ArrowRight size={12} />
            </button>
          </div>
        </CardHeader>
        {servers.length === 0 ? (
          <CardBody className="flex flex-col items-center justify-center h-32 gap-3 text-slate-600">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-center">
              <Server size={20} />
            </div>
            <p className="text-xs">No servers added yet</p>
            <button
              onClick={() => navigate('/servers')}
              className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
            >
              <Play size={11} /> Add your first server
            </button>
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.05]">
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Hostname</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">MAC Address</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider hidden md:table-cell">OS</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider hidden lg:table-cell">Hardware</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {servers.slice(0, 6).map(server => {
                  const os = osProfiles.find(o => o.id === server.osProfileId);
                  return (
                    <tr
                      key={server.id}
                      onClick={() => navigate('/servers')}
                      className="hover:bg-white/[0.02] transition-colors cursor-pointer"
                    >
                      <td className="px-5 py-3.5">
                        <div className="font-medium text-slate-200">{server.hostname}</div>
                        <div className="text-xs text-slate-600">{server.ipAddress || '—'}</div>
                      </td>
                      <td className="px-5 py-3.5">
                        <code className="text-xs text-slate-300 bg-white/[0.05] px-1.5 py-0.5 rounded-md font-mono">{server.macAddress}</code>
                      </td>
                      <td className="px-5 py-3.5 hidden md:table-cell">
                        {os ? (
                          <div className="flex items-center gap-2">
                            <OSIcon icon={os.icon} color={os.color} size="sm" />
                            <div>
                              <div className="text-xs font-medium text-slate-200">{os.name}</div>
                              <div className="text-xs text-slate-500">{os.version}</div>
                            </div>
                          </div>
                        ) : <span className="text-slate-600 text-xs">Unassigned</span>}
                      </td>
                      <td className="px-5 py-3.5 hidden lg:table-cell">
                        <div className="text-xs text-slate-400">{server.ramGB}GB RAM · {server.diskGB}GB</div>
                        <div className="text-xs text-slate-600 truncate max-w-32">{server.cpuModel}</div>
                      </td>
                      <td className="px-5 py-3.5">
                        <StatusBadge status={server.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {servers.length > 6 && (
              <div className="px-5 py-3 border-t border-white/[0.04]">
                <button onClick={() => navigate('/servers')}
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors">
                  View {servers.length - 6} more servers <ArrowRight size={11} />
                </button>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
