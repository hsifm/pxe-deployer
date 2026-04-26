import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChevronRight, Play, CheckCircle, Check,
  AlertTriangle, Loader, ShieldCheck, HardDrive, Download,
  Package, Wifi, Search, ArrowLeft, Info, XCircle, Zap, Clock,
  Plus, Trash2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import { addDeployment, updateDeployment } from '../store/slices/deploymentsSlice';
import { setServerStatus, updateServer } from '../store/slices/serversSlice';
import Card, { CardBody } from '../components/shared/Card';
import Button from '../components/shared/Button';
import OSIcon from '../components/shared/OSIcon';
import StatusBadge from '../components/shared/StatusBadge';
import { cn } from '../lib/utils';
import { validateConfig, summarize } from '../lib/validateConfig';
import { generateConfig } from '../lib/configGenerators';

// ─── Types ────────────────────────────────────────────────────────────────────

/** A deploy target — either from server inventory or manually entered MAC */
interface DeployTarget {
  key: string;       // unique within wizard session
  mac: string;       // aa:bb:cc:dd:ee:ff
  hostname: string;
  serverId?: string; // present if from inventory
}

type ApiDeployStatus = 'queued' | 'installing' | 'completed' | 'failed' | 'cancelled';

interface ApiDeployment {
  id: string;
  mac: string;
  hostname: string;
  status: ApiDeployStatus;
  logs: string[];
  startedAt: string;
  completedAt?: string;
}

interface TargetProgress {
  deploymentId: string | null;
  status: ApiDeployStatus | 'posting';
  logs: string[];
  pct: number;
}

type WizardStep = 'select' | 'configure' | 'preflight' | 'execute';
const WIZARD_STEPS: { id: WizardStep; label: string }[] = [
  { id: 'select',    label: 'Select Targets' },
  { id: 'configure', label: 'Configure' },
  { id: 'preflight', label: 'Pre-flight' },
  { id: 'execute',   label: 'Execute' },
];

const MAC_RE = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;

// ─── Stage pipeline ───────────────────────────────────────────────────────────

interface StageDef { id: string; label: string; icon: React.ElementType }
const BASE_STAGES: StageDef[] = [
  { id: 'boot',    label: 'PXE Boot',     icon: Wifi        },
  { id: 'disk',    label: 'Disk Setup',   icon: HardDrive   },
  { id: 'install', label: 'OS Install',   icon: Download    },
  { id: 'post',    label: 'Post-Install', icon: Package     },
  { id: 'verify',  label: 'Verify',       icon: CheckCircle },
];

function stageActiveIdx(status: ApiDeployStatus | 'posting'): number {
  switch (status) {
    case 'posting':    return -1;
    case 'queued':     return 0;
    case 'installing': return 2;
    case 'completed':  return BASE_STAGES.length;
    default:           return 0;
  }
}

function statusPct(status: ApiDeployStatus | 'posting'): number {
  if (status === 'posting')    return 0;
  if (status === 'queued')     return 5;
  if (status === 'installing') return 45;
  if (status === 'completed')  return 100;
  return 100; // failed
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: WizardStep }) {
  const idx = WIZARD_STEPS.findIndex(s => s.id === current);
  return (
    <div className="flex items-center">
      {WIZARD_STEPS.map((step, i) => (
        <React.Fragment key={step.id}>
          <div className="flex items-center gap-2">
            <div className={cn(
              'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-200',
              i < idx  ? 'bg-blue-600 text-white'
              : i === idx ? 'text-blue-400 ring-2 ring-blue-500 ring-offset-1 ring-offset-transparent'
              : 'text-slate-600',
            )} style={i === idx ? { background: 'rgba(59,130,246,0.12)' } : i < idx ? {} : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              {i < idx ? <Check size={11} /> : i + 1}
            </div>
            <span className={cn(
              'text-sm font-medium transition-colors hidden sm:inline',
              i === idx ? 'text-slate-100' : i < idx ? 'text-slate-400' : 'text-slate-600',
            )}>
              {step.label}
            </span>
          </div>
          {i < WIZARD_STEPS.length - 1 && (
            <div className="w-6 sm:w-10 h-px mx-2 transition-colors duration-200"
              style={{ background: i < idx ? 'rgba(59,130,246,0.45)' : 'rgba(255,255,255,0.06)' }} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Stage pipeline dots ──────────────────────────────────────────────────────

function StagePipeline({ status }: { status: ApiDeployStatus | 'posting' }) {
  const activeIdx = stageActiveIdx(status);
  const failed    = status === 'failed';
  const done      = status === 'completed';

  return (
    <div className="flex items-center gap-0">
      {BASE_STAGES.map((stage, i) => {
        const Icon      = stage.icon;
        const isActive  = !done && !failed && i === activeIdx;
        const isDone    = done || i < activeIdx;
        const isFailed  = failed && i === activeIdx;

        return (
          <React.Fragment key={stage.id}>
            <div className="relative group/stage">
              <div className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300',
                isDone   ? 'bg-emerald-600/80'
                : isFailed ? 'bg-red-600/80'
                : isActive ? 'bg-blue-600 shadow-lg shadow-blue-500/30'
                : 'border border-white/[0.07]',
              )} style={!isDone && !isFailed && !isActive ? { background: 'rgba(255,255,255,0.04)' } : {}}>
                {isDone   ? <Check size={10} className="text-white" />
                : isFailed ? <XCircle size={10} className="text-white" />
                : isActive ? <Loader size={10} className="text-white animate-spin" />
                : <Icon size={10} className="text-slate-600" />}
              </div>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 pointer-events-none z-10
                              opacity-0 group-hover/stage:opacity-100 transition-opacity whitespace-nowrap">
                <div className="text-[10px] px-1.5 py-0.5 rounded text-slate-300"
                  style={{ background: 'rgba(13,13,26,0.95)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  {stage.label}
                </div>
              </div>
            </div>
            {i < BASE_STAGES.length - 1 && (
              <div className="h-px w-2 transition-colors duration-500"
                style={{ background: isDone ? 'rgba(16,185,129,0.5)' : 'rgba(255,255,255,0.05)' }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DeployWizard() {
  const dispatch     = useAppDispatch();
  const navigate     = useNavigate();
  const [searchParams] = useSearchParams();

  const servers        = useAppSelector(s => s.servers.servers);
  const osProfiles     = useAppSelector(s => s.osProfiles.profiles);
  const configurations = useAppSelector(s => s.configurations.configs);
  const goldImages     = useAppSelector(s => s.goldImages.images);
  const packageFiles   = useAppSelector(s => s.packageFiles.files);
  const settings       = useAppSelector(s => s.settings);

  const apiBase = ((settings as { apiEndpoint?: string }).apiEndpoint ?? 'http://localhost:3001').replace(/\/$/, '');

  const preSelected = searchParams.get('server');

  // ─── Wizard state ──────────────────────────────────────────────────────────
  const [step, setStep]           = useState<WizardStep>('select');
  const [searchQ, setSearchQ]     = useState('');
  const [targets, setTargets]     = useState<DeployTarget[]>(
    preSelected ? [{ key: preSelected, mac: '', hostname: '', serverId: preSelected }] : [],
  );
  const [quickMac,      setQuickMac]      = useState('');
  const [quickHostname, setQuickHostname] = useState('');
  const [osProfileId,   setOsProfileId]  = useState('');
  const [configId,      setConfigId]     = useState('');
  const [goldImageId,   setGoldImageId]  = useState('');
  const [preflightLoading, setPreflightLoading] = useState(false);

  // ─── Execute state ─────────────────────────────────────────────────────────
  const [executing,  setExecuting]  = useState(false);
  const [allDone,    setAllDone]    = useState(false);
  const [progress,   setProgress]   = useState<Record<string, TargetProgress>>({});
  const [elapsed,    setElapsed]    = useState(0);
  const pollRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  // Keep a stable ref to targets for use inside poll closure
  const targetsRef   = useRef<DeployTarget[]>(targets);
  useEffect(() => { targetsRef.current = targets; }, [targets]);
  const serversRef   = useRef(servers);
  useEffect(() => { serversRef.current = servers; }, [servers]);

  // ─── Derived ───────────────────────────────────────────────────────────────
  const inventoryServers = useMemo(() => {
    const q = searchQ.toLowerCase();
    return servers.filter(s =>
      s.hostname.toLowerCase().includes(q) ||
      s.ipAddress.toLowerCase().includes(q) ||
      s.macAddress.toLowerCase().includes(q)
    );
  }, [servers, searchQ]);

  const selectedProfile = osProfiles.find(p => p.id === osProfileId);
  const selectedConfig  = configurations.find(c => c.id === configId);
  const selectedGold    = goldImages.find(g => g.id === goldImageId);
  const activeConfigs   = configurations.filter(c => c.osProfileId === osProfileId);

  const preflightResults = useMemo(() => {
    if (!selectedConfig || !selectedProfile) return null;
    return summarize(validateConfig(selectedConfig, selectedProfile, packageFiles));
  }, [selectedConfig, selectedProfile, packageFiles]);

  // ─── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (step !== 'configure') return;
    const first = servers.find(s => s.id === targets[0]?.serverId);
    if (!osProfileId) setOsProfileId(first?.osProfileId || osProfiles[0]?.id || '');
    if (!goldImageId) setGoldImageId(first?.goldImageId || '');
  }, [step]); // eslint-disable-line

  useEffect(() => {
    if (step !== 'configure' || !osProfileId) return;
    const matching = configurations.filter(c => c.osProfileId === osProfileId);
    if (!configId || !matching.find(c => c.id === configId)) {
      const first = servers.find(s => s.id === targets[0]?.serverId);
      const serverCfg = matching.find(c => c.id === first?.configurationId);
      setConfigId(serverCfg?.id || matching[0]?.id || '');
    }
  }, [osProfileId, step]); // eslint-disable-line

  useEffect(() => {
    if (step !== 'preflight') return;
    setPreflightLoading(true);
    const t = setTimeout(() => setPreflightLoading(false), 1000);
    return () => clearTimeout(t);
  }, [step]);

  // Detect all done
  useEffect(() => {
    if (!executing || allDone || Object.keys(progress).length === 0) return;
    const vals = Object.values(progress);
    if (vals.every(p =>
      p.status === 'completed' || p.status === 'failed' || p.status === 'cancelled'
    )) {
      setAllDone(true);
      if (elapsedTimer.current) clearInterval(elapsedTimer.current);
      if (pollRef.current) clearInterval(pollRef.current);
      const n = vals.filter(p => p.status === 'completed').length;
      toast.success(`${n} of ${vals.length} deployment${vals.length !== 1 ? 's' : ''} completed`);
    }
  }, [progress]); // eslint-disable-line

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (elapsedTimer.current) clearInterval(elapsedTimer.current);
  }, []);

  // ─── Quick-add target ──────────────────────────────────────────────────────

  const addManualTarget = () => {
    const mac = quickMac.trim();
    if (!MAC_RE.test(mac)) { toast.error('Invalid MAC address (e.g. aa:bb:cc:dd:ee:ff)'); return; }
    const hostname = quickHostname.trim() || mac;
    const key = `manual-${mac.toLowerCase()}`;
    if (targets.find(t => t.key === key)) { toast.error('MAC already added'); return; }
    setTargets(prev => [...prev, { key, mac, hostname }]);
    setQuickMac('');
    setQuickHostname('');
  };

  const toggleInventoryServer = (server: typeof servers[number]) => {
    const key = server.id;
    if (!server.macAddress) { toast.error('Server has no MAC address — edit it first'); return; }
    setTargets(prev =>
      prev.find(t => t.key === key)
        ? prev.filter(t => t.key !== key)
        : [...prev, { key, mac: server.macAddress, hostname: server.hostname, serverId: key }]
    );
  };

  // ─── Execution ─────────────────────────────────────────────────────────────

  const normMac = (mac: string) => mac.toLowerCase().replace(/[:-]/g, '-');

  const startExecution = async () => {
    if (!selectedConfig || !selectedProfile) return;
    setExecuting(true);
    setElapsed(0);

    elapsedTimer.current = setInterval(() => setElapsed(e => e + 1000), 1000);

    const initProg: Record<string, TargetProgress> = {};
    targets.forEach(t => { initProg[t.key] = { deploymentId: null, status: 'posting', logs: [], pct: 0 }; });
    setProgress(initProg);

    const osFamily = selectedProfile.family as 'debian' | 'rhel' | 'windows';

    await Promise.all(targets.map(async (target) => {
      try {
        const mac = normMac(target.mac);
        const installerConfig = generateConfig(selectedConfig, osFamily, { apiBase, mac });

        const res = await fetch(`${apiBase}/api/deploy`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            mac:             target.mac,
            hostname:        target.hostname,
            osProfileId:     selectedProfile.id,
            osFamily,
            osName:          `${selectedProfile.name} ${selectedProfile.version}`,
            installerConfig,
            kernelArgs:      (selectedProfile.kernelArgs ?? []).join(' '),
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
          throw new Error(err.error ?? res.statusText);
        }

        const { deploymentId } = await res.json() as { deploymentId: string };

        const now = new Date().toISOString();
        dispatch(addDeployment({
          id:              deploymentId,
          serverId:        target.serverId ?? target.key,
          serverHostname:  target.hostname,
          osProfileId:     selectedProfile.id,
          configurationId: configId,
          status:          'deploying',
          startedAt:       now,
          logs:            [`[${now}] Queued via Deploy Wizard — waiting for PXE boot`],
        }));
        if (target.serverId) dispatch(setServerStatus({ id: target.serverId, status: 'deploying' }));

        setProgress(prev => ({
          ...prev,
          [target.key]: {
            deploymentId,
            status: 'queued',
            logs:   ['PXE configs written — plug in the server to start installation'],
            pct:    5,
          },
        }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`${target.hostname}: ${msg}`);
        setProgress(prev => ({
          ...prev,
          [target.key]: { ...prev[target.key], status: 'failed', logs: [`Error: ${msg}`], pct: 0 },
        }));
      }
    }));

    // Poll for status updates every 4s
    pollRef.current = setInterval(() => {
      setProgress(prev => {
        const pending = Object.entries(prev).filter(([, p]) =>
          p.deploymentId && p.status !== 'completed' && p.status !== 'failed' && p.status !== 'cancelled'
        );
        if (pending.length === 0) return prev;

        pending.forEach(([key, p]) => {
          if (!p.deploymentId) return;
          fetch(`${apiBase}/api/deployments/${p.deploymentId}`)
            .then(r => r.json())
            .then((dep: ApiDeployment) => {
              setProgress(pp => ({
                ...pp,
                [key]: { ...pp[key], status: dep.status, logs: dep.logs, pct: statusPct(dep.status) },
              }));

              if (dep.status === 'completed' || dep.status === 'failed') {
                const target = targetsRef.current.find(t => t.key === key);
                const completedAt = dep.completedAt ?? new Date().toISOString();
                dispatch(updateDeployment({ id: dep.id, status: dep.status === 'completed' ? 'completed' : 'failed', completedAt }));
                if (target?.serverId) {
                  const server = serversRef.current.find(s => s.id === target.serverId);
                  if (server) dispatch(updateServer({
                    ...server,
                    status:         dep.status === 'completed' ? 'completed' : 'failed',
                    lastDeployedAt: completedAt,
                    ...(goldImageId ? { goldImageAppliedAt: completedAt } : {}),
                  }));
                }
              }
            })
            .catch(() => { /* retry next tick */ });
        });
        return prev;
      });
    }, 4000);
  };

  // ─── Navigation ────────────────────────────────────────────────────────────

  const ORDER: WizardStep[] = ['select', 'configure', 'preflight', 'execute'];
  const canNext = (): boolean => {
    if (step === 'select')    return targets.length > 0;
    if (step === 'configure') return !!osProfileId && !!configId;
    if (step === 'preflight') return !preflightLoading;
    return false;
  };
  const goNext = () => { const i = ORDER.indexOf(step); if (i < ORDER.length - 1) setStep(ORDER[i + 1]); };
  const goBack = () => { const i = ORDER.indexOf(step); if (i > 0) setStep(ORDER[i - 1]); };

  const totalDone  = Object.values(progress).filter(p => p.status === 'completed' || p.status === 'failed').length;
  const overallPct = targets.length > 0 ? Math.round((totalDone / targets.length) * 100) : 0;

  // ─── Step renderers ────────────────────────────────────────────────────────

  const renderSelect = () => (
    <div className="space-y-4">
      {/* Quick-add by MAC */}
      <div className="rounded-xl p-4 space-y-3"
        style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.15)' }}>
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-400/70">Quick Add — Enter MAC Directly</p>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1 block">MAC Address</label>
            <input value={quickMac} onChange={e => setQuickMac(e.target.value)}
              placeholder="aa:bb:cc:dd:ee:ff"
              className="w-full px-3 py-2 rounded-xl text-sm font-mono text-slate-200 border outline-none focus:ring-2 focus:ring-blue-500/40"
              style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' }}
              onKeyDown={e => e.key === 'Enter' && addManualTarget()} />
          </div>
          <div className="flex-1">
            <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1 block">Hostname (optional)</label>
            <input value={quickHostname} onChange={e => setQuickHostname(e.target.value)}
              placeholder="staging-server-01"
              className="w-full px-3 py-2 rounded-xl text-sm text-slate-200 border outline-none focus:ring-2 focus:ring-blue-500/40"
              style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' }}
              onKeyDown={e => e.key === 'Enter' && addManualTarget()} />
          </div>
          <button onClick={addManualTarget}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-blue-300 flex-shrink-0 transition-colors"
            style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)' }}>
            <Plus size={14} />Add
          </button>
        </div>
      </div>

      {/* Queued targets */}
      {targets.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600">{targets.length} target{targets.length !== 1 ? 's' : ''} queued</p>
          {targets.map(t => {
            const srv     = servers.find(s => s.id === t.serverId);
            const profile = osProfiles.find(p => p.id === srv?.osProfileId);
            return (
              <div key={t.key} className="flex items-center gap-3 px-3 py-2 rounded-xl"
                style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.18)' }}>
                {profile && <OSIcon icon={profile.icon} color={profile.color} size="sm" />}
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-slate-200">{t.hostname}</span>
                  <code className="text-xs text-slate-500 ml-2 font-mono">{t.mac}</code>
                </div>
                <button onClick={() => setTargets(prev => prev.filter(x => x.key !== t.key))}
                  className="text-slate-600 hover:text-red-400 transition-colors">
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Inventory selector */}
      {servers.length > 0 && (
        <>
          <div className="flex items-center gap-2">
            <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.06)' }} />
            <span className="text-[10px] text-slate-600 uppercase tracking-wider font-medium">Or pick from inventory</span>
            <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.06)' }} />
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search hostname, IP, MAC…"
              className="w-full pl-8 pr-3 py-2 rounded-xl text-sm text-slate-200 border outline-none focus:ring-2 focus:ring-blue-500/40"
              style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.07)' }} />
          </div>
          <div className="space-y-1 max-h-[240px] overflow-y-auto -mr-1 pr-1">
            {inventoryServers.map(server => {
              const isSelected  = targets.some(t => t.key === server.id);
              const isDeploying = server.status === 'deploying';
              const profile     = osProfiles.find(p => p.id === server.osProfileId);
              return (
                <button key={server.id} disabled={isDeploying} onClick={() => toggleInventoryServer(server)}
                  className={cn(
                    'w-full text-left flex items-center gap-3 px-3 py-2 rounded-xl border transition-all',
                    isDeploying ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
                    isSelected ? 'border-blue-500/35 bg-blue-500/[0.08]' : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]',
                  )}>
                  <div className={cn('w-4 h-4 rounded-sm flex items-center justify-center flex-shrink-0 border transition-all',
                    isSelected ? 'bg-blue-600 border-blue-500' : 'border-white/20')}>
                    {isSelected && <Check size={10} className="text-white" />}
                  </div>
                  {profile && <OSIcon icon={profile.icon} color={profile.color} size="sm" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-200 truncate">{server.hostname}</span>
                      <StatusBadge status={server.status} />
                    </div>
                    <div className="text-xs text-slate-500 font-mono">{server.macAddress}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );

  const renderConfigure = () => (
    <div className="space-y-5">
      <div className="flex items-start gap-2.5 rounded-xl px-4 py-3"
        style={{ background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.14)' }}>
        <Info size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
        <span className="text-slate-400 text-sm">
          Applies to all <span className="text-slate-200 font-medium">{targets.length} server{targets.length !== 1 ? 's' : ''}</span>.
        </span>
      </div>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">OS Profile</label>
          <select value={osProfileId} onChange={e => setOsProfileId(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl text-sm text-slate-200 border outline-none focus:ring-2 focus:ring-blue-500/40"
            style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.07)' }}>
            <option value="">— Select OS Profile —</option>
            {osProfiles.map(p => <option key={p.id} value={p.id}>{p.name} {p.version}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Configuration</label>
          <select value={configId} onChange={e => setConfigId(e.target.value)} disabled={!osProfileId}
            className="w-full px-3 py-2.5 rounded-xl text-sm text-slate-200 border outline-none focus:ring-2 focus:ring-blue-500/40 disabled:opacity-40"
            style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.07)' }}>
            <option value="">— Select Configuration —</option>
            {activeConfigs.map(c => <option key={c.id} value={c.id}>{c.name}{c.isDefault ? ' (default)' : ''}</option>)}
          </select>
          {osProfileId && activeConfigs.length === 0 && (
            <p className="text-xs text-amber-400 mt-1.5">No configurations for this OS profile.</p>
          )}
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
            Gold Image <span className="normal-case text-slate-600 font-normal">(optional)</span>
          </label>
          <select value={goldImageId} onChange={e => setGoldImageId(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl text-sm text-slate-200 border outline-none focus:ring-2 focus:ring-blue-500/40"
            style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.07)' }}>
            <option value="">— None (bare OS install) —</option>
            {goldImages.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
      </div>
    </div>
  );

  const renderPreflight = () => (
    <div className="space-y-4 min-h-[220px]">
      {preflightLoading ? (
        <div className="py-12 flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.18)' }}>
            <Loader size={22} className="text-blue-400 animate-spin" />
          </div>
          <p className="text-slate-200 font-medium text-sm">Running pre-flight checks…</p>
        </div>
      ) : (
        <AnimatePresence>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            {preflightResults && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Passed',   count: preflightResults.pass, c: '#10b981', bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.2)'  },
                    { label: 'Warnings', count: preflightResults.warn, c: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)' },
                    { label: 'Errors',   count: preflightResults.fail, c: '#ef4444', bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.2)'  },
                  ].map(({ label, count, c, bg, border }) => (
                    <div key={label} className="rounded-xl p-3 text-center" style={{ background: bg, border: `1px solid ${border}` }}>
                      <div className="text-2xl font-bold" style={{ color: c }}>{count}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{label}</div>
                    </div>
                  ))}
                </div>
                {preflightResults.fail > 0 ? (
                  <div className="flex gap-2.5 rounded-xl p-3" style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)' }}>
                    <AlertTriangle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
                    <span className="text-red-300 text-xs">{preflightResults.fail} error{preflightResults.fail !== 1 ? 's' : ''} — review configuration before deploying.</span>
                  </div>
                ) : preflightResults.warn === 0 ? (
                  <div className="flex gap-2.5 rounded-xl p-3" style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.18)' }}>
                    <CheckCircle size={14} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span className="text-emerald-300 text-xs">All checks passed. Configuration is ready.</span>
                  </div>
                ) : (
                  <div className="flex gap-2.5 rounded-xl p-3" style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.18)' }}>
                    <AlertTriangle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
                    <span className="text-amber-300 text-xs">{preflightResults.warn} warning{preflightResults.warn !== 1 ? 's' : ''} — deployment will proceed.</span>
                  </div>
                )}
              </>
            )}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 mb-2">Targets ({targets.length})</p>
              <div className="space-y-1.5">
                {targets.map(t => (
                  <div key={t.key} className="flex items-center gap-3 px-3 py-2 rounded-lg"
                    style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-slate-200">{t.hostname}</span>
                      <code className="text-xs text-slate-500 ml-2 font-mono">{t.mac}</code>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle size={11} />Ready</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2.5 rounded-xl px-4 py-3"
              style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <Clock size={13} className="text-slate-500" />
              <span className="text-xs text-slate-400">Progress is tracked live via installer callbacks. Plug in the servers after clicking Deploy.</span>
            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );

  const renderExecute = () => (
    <div className="space-y-4">
      {!executing ? (
        <div className="space-y-4">
          <div className="rounded-xl p-5 space-y-3" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 mb-1">Deployment Summary</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {[
                ['Targets',       `${targets.length} server${targets.length !== 1 ? 's' : ''}`],
                ['OS Profile',    `${selectedProfile?.name} ${selectedProfile?.version}`],
                ['Configuration', selectedConfig?.name ?? '—'],
                ['Gold Image',    selectedGold?.name ?? 'None'],
                ['Backend API',   apiBase],
              ].map(([k, v]) => (
                <React.Fragment key={k}>
                  <span className="text-slate-500">{k}</span>
                  <span className="text-slate-200 font-medium truncate">{v}</span>
                </React.Fragment>
              ))}
            </div>
          </div>
          <div className="flex items-start gap-2.5 rounded-xl px-4 py-3"
            style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.15)' }}>
            <AlertTriangle size={13} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-slate-400">
              Clicking Deploy writes the GRUB + installer configs to the staging server. Plug in your servers and they will PXE boot and install automatically.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5 text-xs">
              <span className="text-slate-400 font-medium">
                {allDone ? `All ${targets.length} complete` : `${totalDone} / ${targets.length} done`}
              </span>
              <span className="text-slate-600 font-mono">{formatElapsed(elapsed)}</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <motion.div className="h-full rounded-full"
                style={{ background: allDone ? '#10b981' : 'linear-gradient(90deg, #2563eb 0%, #7c3aed 100%)' }}
                animate={{ width: `${overallPct}%` }} transition={{ duration: 0.4, ease: 'easeOut' }} />
            </div>
          </div>

          <div className="space-y-2.5 max-h-[360px] overflow-y-auto -mr-1 pr-1">
            {targets.map(target => {
              const p = progress[target.key];
              if (!p) return null;
              return (
                <motion.div key={target.key} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl p-3.5"
                  style={{
                    background: p.status === 'completed' ? 'rgba(16,185,129,0.05)' : p.status === 'failed' ? 'rgba(239,68,68,0.05)' : 'rgba(255,255,255,0.025)',
                    border: `1px solid ${p.status === 'completed' ? 'rgba(16,185,129,0.18)' : p.status === 'failed' ? 'rgba(239,68,68,0.18)' : 'rgba(255,255,255,0.06)'}`,
                  }}>
                  <div className="flex items-center gap-2 mb-2.5">
                    <span className="text-sm font-medium text-slate-200">{target.hostname}</span>
                    <code className="text-xs text-slate-600 font-mono">{target.mac}</code>
                    <div className="ml-auto flex items-center gap-2 text-xs">
                      {p.status === 'completed'  && <span className="text-emerald-400 font-medium flex items-center gap-1"><CheckCircle size={12} />Done</span>}
                      {p.status === 'failed'     && <span className="text-red-400 font-medium flex items-center gap-1"><XCircle size={12} />Failed</span>}
                      {p.status === 'installing' && <span className="text-blue-400 font-medium flex items-center gap-1"><Loader size={11} className="animate-spin" />Installing…</span>}
                      {p.status === 'queued'     && <span className="text-slate-400">Waiting for PXE boot…</span>}
                      {p.status === 'posting'    && <span className="text-slate-500 flex items-center gap-1"><Loader size={11} className="animate-spin" />Sending…</span>}
                      <span className="text-slate-600 font-mono w-7 text-right">{p.pct}%</span>
                    </div>
                  </div>
                  <StagePipeline status={p.status} />
                  <div className="mt-2.5 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <motion.div className="h-full rounded-full"
                      style={{ background: p.status === 'completed' ? '#10b981' : p.status === 'failed' ? '#ef4444' : 'linear-gradient(90deg, #2563eb, #7c3aed)' }}
                      animate={{ width: `${p.pct}%` }} transition={{ duration: 0.3, ease: 'easeOut' }} />
                  </div>
                  {p.logs.length > 0 && (
                    <p className="mt-2 text-[10px] font-mono text-slate-600 truncate">{p.logs[p.logs.length - 1]}</p>
                  )}
                </motion.div>
              );
            })}
          </div>

          {allDone && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-between rounded-xl px-4 py-3"
              style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
              <div className="flex items-center gap-2 text-sm text-emerald-300 font-medium">
                <CheckCircle size={15} />
                All deployments finished — servers are ready for the datacenter
              </div>
              <Button size="sm" variant="ghost" onClick={() => navigate('/deployments')}>View History →</Button>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  const stepTitles: Record<WizardStep, string> = {
    select:    'Add servers by MAC address or select from inventory',
    configure: 'Choose the OS, configuration, and gold image',
    preflight: 'Validate configuration before deploying',
    execute:   'Confirm, then write PXE configs to the staging server',
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <button onClick={() => navigate('/servers')}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 transition-colors mb-4">
          <ArrowLeft size={14} />Back to Servers
        </button>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, rgba(37,99,235,0.25) 0%, rgba(124,58,237,0.25) 100%)', border: '1px solid rgba(99,102,241,0.3)' }}>
            <Zap size={16} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-100">Deploy Wizard</h1>
            <p className="text-xs text-slate-500 mt-0.5">{stepTitles[step]}</p>
          </div>
        </div>
      </div>

      <StepIndicator current={step} />

      <Card>
        <CardBody className="py-5 px-5">
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -14 }} transition={{ duration: 0.16, ease: [0.4, 0, 0.2, 1] }}>
              {step === 'select'    && renderSelect()}
              {step === 'configure' && renderConfigure()}
              {step === 'preflight' && renderPreflight()}
              {step === 'execute'   && renderExecute()}
            </motion.div>
          </AnimatePresence>
        </CardBody>

        <div className="px-5 py-3.5 flex items-center gap-3"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.15)' }}>
          {step !== 'select' && !executing && (
            <Button variant="ghost" size="sm" icon={<ArrowLeft size={13} />} onClick={goBack}>Back</Button>
          )}
          <div className="flex-1" />
          {step !== 'execute' ? (
            <Button variant="primary" size="sm" disabled={!canNext()} onClick={goNext} iconRight={<ChevronRight size={13} />}>
              {step === 'preflight' ? 'Proceed to Deploy' : 'Continue'}
            </Button>
          ) : !executing ? (
            <Button variant="primary" size="sm" onClick={startExecution} icon={<Play size={13} />}>
              Write PXE Configs &amp; Deploy
            </Button>
          ) : allDone ? (
            <Button variant="primary" size="sm" onClick={() => navigate('/')}>Return to Dashboard</Button>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
