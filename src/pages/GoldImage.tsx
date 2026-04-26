import React, { useState } from 'react';
import toast from 'react-hot-toast';
import {
  ShieldCheck, Plus, Trash2, Save, Download, Copy,
  Server, Network, Lock, Package, Terminal, Eye,
  Check, ChevronRight, Globe, Clock, FileCode2, Play,
  AlertTriangle, X, Info, Database,
} from 'lucide-react';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import { addGoldImage, updateGoldImage, deleteGoldImage } from '../store/slices/goldImagesSlice';
import Card, { CardHeader, CardBody } from '../components/shared/Card';
import Button from '../components/shared/Button';
import { Input, Select, Textarea } from '../components/shared/FormField';
import { GoldImage, GoldImageOsTarget, GoldImageRepo } from '../types';
import { generateId } from '../lib/utils';
import { generateGoldImage } from '../lib/generateGoldImage';
import { ConfirmDialog } from '../components/shared/Modal';

// ─── Types ────────────────────────────────────────────────────────────────────

type TabId = 'identity' | 'network' | 'repos' | 'hardening' | 'packages' | 'script' | 'output';
type OutputFormat = 'ansible' | 'bash' | 'powershell';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'identity',  label: 'Identity',   icon: <Globe size={14} /> },
  { id: 'network',   label: 'Network',    icon: <Network size={14} /> },
  { id: 'repos',     label: 'Repos',      icon: <Database size={14} /> },
  { id: 'hardening', label: 'Hardening',  icon: <Lock size={14} /> },
  { id: 'packages',  label: 'Packages',   icon: <Package size={14} /> },
  { id: 'script',    label: 'Script',     icon: <Terminal size={14} /> },
  { id: 'output',    label: 'Output',     icon: <Eye size={14} /> },
];

const OS_TARGET_OPTIONS: { value: GoldImageOsTarget; label: string; color: string }[] = [
  { value: 'all',     label: 'All OS families',       color: '#60a5fa' },
  { value: 'debian',  label: 'Ubuntu / Debian',        color: '#e95420' },
  { value: 'rhel',    label: 'RHEL / Rocky Linux',     color: '#10b981' },
  { value: 'windows', label: 'Windows Server',         color: '#0078d4' },
];

// ─── Default gold image ───────────────────────────────────────────────────────

const defaultHardening = {
  disableRootSSH: true,
  sshKeyAuthOnly: false,
  disableEmptyPasswords: true,
  enableFirewall: true,
  firewallAllowPorts: ['22'],
  disableServices: [],
  enableFail2ban: false,
  enableAuditd: false,
  disableUSBStorage: false,
  setPasswordPolicy: false,
  passwordMinLength: 12,
  passwordMaxAge: 90,
  enableAutoUpdates: false,
};

const emptyGoldImage = (): GoldImage => {
  const now = new Date().toISOString();
  return {
    id: generateId('gold'),
    name: '',
    description: '',
    osTarget: 'debian',
    hostnameTemplate: '',
    domain: '',
    timezone: 'UTC',
    locale: 'en_US.UTF-8',
    dnsServers: [],
    ntpServers: ['pool.ntp.org'],
    searchDomains: [],
    networkMode: 'dhcp',
    staticAddress: '',
    staticGateway: '',
    networkInterface: '',
    repos: [],
    replaceDefaultRepos: false,
    hardening: { ...defaultHardening },
    sshAuthorizedKeys: [],
    packagesToInstall: [],
    packagesToRemove: [],
    postInstallScript: '# Custom post-install commands\n# These run after all standard settings are applied\n',
    createdAt: now,
    updatedAt: now,
  };
};

const emptyRepoForm = (): Omit<GoldImageRepo, 'id'> => ({
  label: '',
  baseUrl: '',
  suite: '',
  components: 'main restricted universe',
  gpgCheck: false,
  gpgKeyUrl: '',
});

// ─── Toggle helper ────────────────────────────────────────────────────────────

function Toggle({ value, onChange, label, hint }: {
  value: boolean; onChange: (v: boolean) => void; label: string; hint?: string;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div className={`relative flex-shrink-0 w-9 h-5 rounded-full transition-colors mt-0.5 ${value ? 'bg-blue-600' : 'bg-white/[0.08]'}`}
        onClick={() => onChange(!value)}>
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </div>
      <div>
        <div className="text-xs font-medium text-slate-300 group-hover:text-slate-100 transition-colors">{label}</div>
        {hint && <div className="text-[10px] text-slate-500 mt-0.5">{hint}</div>}
      </div>
    </label>
  );
}

// ─── TagInput helper ──────────────────────────────────────────────────────────

function TagInput({ label, values, onChange, placeholder, mono = false }: {
  label: string; values: string[]; onChange: (v: string[]) => void;
  placeholder?: string; mono?: boolean;
}) {
  const [input, setInput] = useState('');
  const add = () => {
    const parts = input.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
    if (!parts.length) return;
    onChange([...new Set([...values, ...parts])]);
    setInput('');
  };
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1.5">{label}</label>
      <div className="flex gap-2 mb-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className={`flex-1 rounded-xl px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 border border-white/[0.07] bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.06)] ${mono ? 'font-mono' : ''}`}
        />
        <button onClick={add}
          className="px-3 py-1.5 rounded-xl text-xs font-medium text-slate-300 bg-white/[0.05] border border-white/[0.07] hover:bg-white/[0.09] transition-colors">
          Add
        </button>
      </div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map(v => (
            <span key={v} className={`inline-flex items-center gap-1 bg-blue-900/20 border border-blue-700/25 text-blue-300 text-xs px-2 py-0.5 rounded-md ${mono ? 'font-mono' : ''}`}>
              {v}
              <button onClick={() => onChange(values.filter(x => x !== v))}
                className="text-blue-400/50 hover:text-red-400 transition-colors ml-0.5">×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function GoldImagePage() {
  const dispatch = useAppDispatch();
  const goldImages = useAppSelector(s => s.goldImages.images);

  const [selected, setSelected] = useState<GoldImage | null>(goldImages[0] ?? null);
  const [form, setForm] = useState<GoldImage>(selected ?? emptyGoldImage());
  const [tab, setTab] = useState<TabId>('identity');
  const [outputFmt, setOutputFmt] = useState<OutputFormat>('ansible');
  const [isDirty, setIsDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newOsTarget, setNewOsTarget] = useState<GoldImageOsTarget>('debian');

  // Repo form state
  const [showRepoForm, setShowRepoForm] = useState(false);
  const [repoForm, setRepoForm] = useState<Omit<GoldImageRepo, 'id'>>(emptyRepoForm());

  const handleAddRepo = () => {
    if (!repoForm.label || !repoForm.baseUrl) return;
    const repo: GoldImageRepo = {
      ...repoForm,
      id: generateId('repo'),
      suite: repoForm.suite?.trim() || undefined,
      components: repoForm.components?.trim() || undefined,
      gpgKeyUrl: repoForm.gpgKeyUrl?.trim() || undefined,
    };
    set('repos', [...(form.repos ?? []), repo]);
    setRepoForm(emptyRepoForm());
    setShowRepoForm(false);
  };

  const update: typeof setForm = (updater) => {
    setForm(updater);
    setIsDirty(true);
  };
  const set = <K extends keyof GoldImage>(key: K, val: GoldImage[K]) =>
    update(f => ({ ...f, [key]: val }));
  const setHard = <K extends keyof GoldImage['hardening']>(key: K, val: GoldImage['hardening'][K]) =>
    update(f => ({ ...f, hardening: { ...f.hardening, [key]: val } }));

  const selectImage = (img: GoldImage) => {
    setSelected(img);
    setForm({ ...img });
    setIsDirty(false);
    setTab('identity');
  };

  const handleSave = () => {
    const toSave = { ...form, updatedAt: new Date().toISOString() };
    if (goldImages.find(g => g.id === toSave.id)) {
      dispatch(updateGoldImage(toSave));
      toast.success(`"${toSave.name}" saved`);
    } else {
      dispatch(addGoldImage(toSave));
      toast.success(`"${toSave.name}" created`);
    }
    setSelected(toSave);
    setIsDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleCreate = () => {
    if (!newName.trim()) return;
    const g = { ...emptyGoldImage(), name: newName.trim(), osTarget: newOsTarget };
    dispatch(addGoldImage(g));
    selectImage(g);
    setShowCreate(false);
    setNewName('');
    toast.success(`"${g.name}" created`);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    dispatch(deleteGoldImage(deleteId));
    const next = goldImages.find(g => g.id !== deleteId) ?? null;
    selectImage(next ?? emptyGoldImage());
    toast.success('Gold image deleted');
  };

  const handleExport = () => {
    const content = generateGoldImage(form, outputFmt);
    const ext = outputFmt === 'ansible' ? 'yml' : outputFmt === 'bash' ? 'sh' : 'ps1';
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${form.name.toLowerCase().replace(/\s+/g, '-')}-gold-image.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported as .${ext}`);
  };

  const handleCopy = () => {
    const content = generateGoldImage(form, outputFmt);
    navigator.clipboard.writeText(content).then(
      () => toast.success('Copied to clipboard'),
      () => toast.error('Clipboard not available'),
    );
  };

  const outputContent = generateGoldImage(form, outputFmt);
  const lineCount = outputContent.split('\n').length;

  const generateRepoPreview = (): string => {
    const repos = form.repos ?? [];
    if (repos.length === 0) return '';
    if (form.osTarget === 'debian') {
      return repos.map(r => {
        const suite = r.suite || 'noble';
        const comps = r.components || 'main';
        return `# ${r.label}\ndeb ${r.baseUrl} ${suite} ${comps}\ndeb ${r.baseUrl} ${suite}-updates ${comps}\ndeb ${r.baseUrl} ${suite}-security ${comps}`;
      }).join('\n\n');
    }
    if (form.osTarget === 'rhel') {
      return repos.map(r => {
        const id = r.label.toLowerCase().replace(/\s+/g, '-');
        return `[${id}]\nname=${r.label}\nbaseurl=${r.baseUrl}\nenabled=1\ngpgcheck=${r.gpgCheck ? '1' : '0'}${r.gpgKeyUrl ? `\ngpgkey=${r.gpgKeyUrl}` : ''}`;
      }).join('\n\n');
    }
    if (form.osTarget === 'windows') {
      return repos.map(r =>
        `# Chocolatey source\nchoco source add --name="${r.label.toLowerCase().replace(/\s+/g, '-')}" --source="${r.baseUrl}"`
      ).join('\n');
    }
    // 'all'
    const aptPart = repos.map(r => `deb ${r.baseUrl} ${r.suite || 'noble'} ${r.components || 'main'}`).join('\n');
    const yumPart = repos.map(r => {
      const id = r.label.toLowerCase().replace(/\s+/g, '-');
      return `[${id}]\nname=${r.label}\nbaseurl=${r.baseUrl}\nenabled=1\ngpgcheck=0`;
    }).join('\n\n');
    return `### /etc/apt/sources.list.d/local-mirror.list (Debian/Ubuntu)\n${aptPart}\n\n### /etc/yum.repos.d/local-mirror.repo (RHEL/Rocky)\n${yumPart}`;
  };

  const osTargetInfo = OS_TARGET_OPTIONS.find(o => o.value === form.osTarget) ?? OS_TARGET_OPTIONS[0];

  // ── Sidebar ──────────────────────────────────────────────────────────────
  return (
    <div className="flex gap-5 min-h-0 h-full">
      {/* Left sidebar — gold image list */}
      <div className="w-64 flex-shrink-0 flex flex-col gap-3">
        <Button icon={<Plus size={15} />} onClick={() => setShowCreate(true)} className="w-full justify-center">
          New Gold Image
        </Button>

        <div className="space-y-1.5">
          {goldImages.map(img => {
            const target = OS_TARGET_OPTIONS.find(o => o.value === img.osTarget);
            const isActive = selected?.id === img.id;
            return (
              <button
                key={img.id}
                onClick={() => selectImage(img)}
                className={`w-full text-left rounded-xl px-3.5 py-3 transition-all border ${
                  isActive
                    ? 'border-blue-500/35 bg-blue-500/8 text-slate-100'
                    : 'border-white/[0.06] bg-white/[0.02] text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2.5 mb-1">
                  <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
                    style={{ background: `${target?.color ?? '#60a5fa'}18`, border: `1px solid ${target?.color ?? '#60a5fa'}30` }}>
                    <ShieldCheck size={11} style={{ color: target?.color ?? '#60a5fa' }} />
                  </div>
                  <span className="text-xs font-semibold truncate flex-1">{img.name}</span>
                  {isActive && <ChevronRight size={12} className="text-blue-400 flex-shrink-0" />}
                </div>
                <div className="text-[10px] opacity-60 truncate pl-7">{target?.label}</div>
              </button>
            );
          })}
        </div>

        {/* Info card */}
        <div className="mt-auto p-3 rounded-xl border border-white/[0.06] bg-white/[0.02]">
          <div className="flex items-start gap-2">
            <Info size={13} className="text-slate-500 flex-shrink-0 mt-0.5" />
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Gold images define your OS standard. The generated Ansible playbook, bash script, or PowerShell script can be applied to any server after PXE installation.
            </p>
          </div>
        </div>
      </div>

      {/* Right panel — editor */}
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        {/* Header bar */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-slate-100 truncate">{form.name || 'Untitled Gold Image'}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-md"
                style={{ background: `${osTargetInfo.color}18`, color: osTargetInfo.color, border: `1px solid ${osTargetInfo.color}30` }}>
                {osTargetInfo.label}
              </span>
              {isDirty && (
                <span className="text-[10px] text-yellow-400 flex items-center gap-1">
                  <div className="w-1 h-1 rounded-full bg-yellow-400" />
                  Unsaved changes
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {selected && (
              <Button
                variant="secondary"
                icon={<Trash2 size={14} />}
                onClick={() => setDeleteId(form.id)}
              >
                Delete
              </Button>
            )}
            <Button
              icon={saved ? <Check size={15} /> : <Save size={15} />}
              variant={saved ? 'success' : 'primary'}
              onClick={handleSave}
              disabled={!form.name}
            >
              {saved ? 'Saved!' : 'Save Standard'}
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06] w-fit">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                tab === t.id
                  ? 'bg-blue-600 text-white shadow shadow-blue-600/30'
                  : 'text-slate-500 hover:text-slate-200 hover:bg-white/[0.05]'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <Card className="flex-1">
          <CardBody>
            {/* ── Identity ─────────────────────────────────────────────── */}
            {tab === 'identity' && (
              <div className="space-y-5 max-w-xl">
                <Input
                  label="Gold Image Name *"
                  value={form.name}
                  onChange={e => set('name', e.target.value)}
                  placeholder="e.g. Production Ubuntu Baseline"
                />
                <Textarea
                  label="Description"
                  value={form.description}
                  onChange={e => set('description', e.target.value)}
                  rows={2}
                  placeholder="What does this standard enforce?"
                />
                <Select
                  label="OS Target"
                  value={form.osTarget}
                  onChange={e => set('osTarget', e.target.value as GoldImageOsTarget)}
                >
                  {OS_TARGET_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>

                <div className="border-t border-white/[0.06] pt-4">
                  <p className="text-xs font-medium text-slate-400 mb-3 uppercase tracking-wider">System Identity</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="Hostname Template"
                      value={form.hostnameTemplate}
                      onChange={e => set('hostnameTemplate', e.target.value)}
                      placeholder="{{role}}-{{seq}}"
                      mono
                      hint="Leave blank to keep existing hostname"
                    />
                    <Input
                      label="Domain / FQDN suffix"
                      value={form.domain}
                      onChange={e => set('domain', e.target.value)}
                      placeholder="internal.example.com"
                      mono
                    />
                    <Select
                      label="Timezone"
                      value={form.timezone}
                      onChange={e => set('timezone', e.target.value)}
                    >
                      {['UTC', 'America/New_York', 'America/Chicago', 'America/Los_Angeles',
                        'Europe/London', 'Europe/Berlin', 'Europe/Paris', 'Asia/Dubai',
                        'Asia/Riyadh', 'Asia/Tokyo', 'Asia/Singapore', 'Australia/Sydney',
                      ].map(tz => <option key={tz} value={tz}>{tz}</option>)}
                    </Select>
                    <Select
                      label="Locale"
                      value={form.locale}
                      onChange={e => set('locale', e.target.value)}
                    >
                      {['en_US.UTF-8', 'en_GB.UTF-8', 'ar_SA.UTF-8', 'fr_FR.UTF-8',
                        'de_DE.UTF-8', 'ja_JP.UTF-8', 'zh_CN.UTF-8',
                      ].map(l => <option key={l} value={l}>{l}</option>)}
                    </Select>
                  </div>
                </div>
              </div>
            )}

            {/* ── Network ──────────────────────────────────────────────── */}
            {tab === 'network' && (
              <div className="space-y-5 max-w-xl">

                {/* IP / Interface section */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <Network size={13} className="text-slate-400" />
                    IP Address
                  </p>

                  {/* Mode toggle */}
                  <div className="flex gap-2">
                    {(['dhcp', 'static'] as const).map(mode => (
                      <button
                        key={mode}
                        onClick={() => set('networkMode', mode)}
                        className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                          (form.networkMode ?? 'dhcp') === mode
                            ? 'bg-blue-600 text-white border-blue-600 shadow shadow-blue-600/30'
                            : 'text-slate-400 border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.06] hover:text-slate-200'
                        }`}
                      >
                        {mode === 'dhcp' ? 'DHCP (auto)' : 'Static IP'}
                      </button>
                    ))}
                  </div>

                  {(form.networkMode ?? 'dhcp') === 'dhcp' && (
                    <div className="flex items-start gap-2 p-3 rounded-xl border border-white/[0.06] bg-white/[0.02] text-xs text-slate-500">
                      <Info size={12} className="mt-0.5 flex-shrink-0 text-slate-600" />
                      DHCP — the server's IP is assigned automatically. DNS, NTP and search domain are still configured separately.
                    </div>
                  )}

                  {(form.networkMode ?? 'dhcp') === 'static' && (
                    <div className="space-y-3 p-4 rounded-xl border border-white/[0.07] bg-white/[0.02]">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                          <Input
                            label="IP Address / Prefix *"
                            value={form.staticAddress ?? ''}
                            onChange={e => set('staticAddress', e.target.value)}
                            placeholder="10.0.0.100/24"
                            mono
                            hint="CIDR notation — e.g. 10.0.0.100/24"
                          />
                        </div>
                        <Input
                          label="Default Gateway"
                          value={form.staticGateway ?? ''}
                          onChange={e => set('staticGateway', e.target.value)}
                          placeholder="10.0.0.1"
                          mono
                        />
                        <Input
                          label="Interface (optional)"
                          value={form.networkInterface ?? ''}
                          onChange={e => set('networkInterface', e.target.value)}
                          placeholder="eth0, ens3…"
                          mono
                          hint="Leave blank to auto-detect"
                        />
                      </div>
                      <div className="flex items-start gap-2 p-2.5 rounded-lg border border-yellow-700/20 bg-yellow-900/10 text-[10px] text-yellow-300/80">
                        <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" />
                        Static IP is applied after OS install. Ensure the address does not conflict with existing DHCP leases.
                      </div>
                    </div>
                  )}

                </div>

                <div className="border-t border-white/[0.05] pt-4 space-y-5">
                  <TagInput
                    label="DNS Servers"
                    values={form.dnsServers}
                    onChange={v => set('dnsServers', v)}
                    placeholder="1.1.1.1 or 8.8.8.8"
                    mono
                  />
                  <TagInput
                    label="NTP Servers"
                    values={form.ntpServers}
                    onChange={v => set('ntpServers', v)}
                    placeholder="pool.ntp.org or 10.0.0.5"
                    mono
                  />
                  <TagInput
                    label="DNS Search Domains"
                    values={form.searchDomains}
                    onChange={v => set('searchDomains', v)}
                    placeholder="internal.example.com"
                    mono
                  />
                </div>
              </div>
            )}

            {/* ── Repos ────────────────────────────────────────────────── */}
            {tab === 'repos' && (
              <div className="space-y-5 max-w-2xl">
                {/* Info banner */}
                <div className="p-3 rounded-xl border border-blue-500/20 bg-blue-500/5 flex items-start gap-2">
                  <Info size={13} className="text-blue-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-300">
                    Configure your local/offline mirror server as the package source. These repos are applied <strong>before</strong> any package installs — ideal for air-gapped environments. Supports apt (Debian/Ubuntu) and yum/dnf (RHEL/Rocky).
                  </p>
                </div>

                {/* Replace defaults toggle */}
                <div className="p-4 rounded-xl border border-white/[0.07] bg-white/[0.02] space-y-3">
                  <Toggle
                    value={form.replaceDefaultRepos ?? false}
                    onChange={v => set('replaceDefaultRepos', v)}
                    label="Replace default system repositories"
                    hint="Disables all default apt/yum repos before adding your local ones — use for fully offline/air-gapped servers"
                  />
                  {form.replaceDefaultRepos && (
                    <div className="ml-12 p-2 rounded-lg bg-yellow-900/20 border border-yellow-700/20 text-[10px] text-yellow-300/80">
                      ⚠ Default repos will be disabled. Ensure all required packages exist in your local mirror.
                    </div>
                  )}
                </div>

                {/* Repo list header */}
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Database size={12} />
                    Repositories ({(form.repos ?? []).length})
                  </p>
                  <button
                    onClick={() => setShowRepoForm(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-blue-300 bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/18 transition-colors"
                  >
                    <Plus size={12} />
                    Add Repository
                  </button>
                </div>

                {/* Empty state */}
                {(form.repos ?? []).length === 0 && !showRepoForm && (
                  <div className="flex flex-col items-center justify-center py-10 text-slate-600 border border-dashed border-white/[0.07] rounded-xl">
                    <Database size={22} className="mb-2 text-slate-700" />
                    <p className="text-xs">No custom repositories</p>
                    <p className="text-[10px] mt-0.5 text-slate-700">
                      {form.replaceDefaultRepos ? 'Add at least one repo or packages will fail to install' : 'Default system repos will be used'}
                    </p>
                    <button onClick={() => setShowRepoForm(true)}
                      className="mt-3 text-[11px] text-blue-400 hover:text-blue-300 transition-colors">
                      + Add your local mirror
                    </button>
                  </div>
                )}

                {/* Repo cards */}
                {(form.repos ?? []).map(repo => (
                  <div key={repo.id} className="p-4 rounded-xl border border-white/[0.07] bg-white/[0.02] flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Database size={14} className="text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-xs text-slate-200 mb-1">{repo.label}</div>
                      <code className="text-[10px] text-slate-400 font-mono block mb-2 truncate">{repo.baseUrl}</code>
                      <div className="flex flex-wrap gap-1.5">
                        {repo.suite && (
                          <span className="text-[10px] bg-blue-900/20 text-blue-300 border border-blue-700/20 px-1.5 py-0.5 rounded font-mono">
                            suite: {repo.suite}
                          </span>
                        )}
                        {repo.components && (
                          <span className="text-[10px] bg-white/[0.04] text-slate-400 border border-white/[0.06] px-1.5 py-0.5 rounded">
                            {repo.components}
                          </span>
                        )}
                        {!repo.gpgCheck && form.osTarget !== 'debian' && (
                          <span className="text-[10px] text-yellow-500/70 border border-yellow-700/20 bg-yellow-900/10 px-1.5 py-0.5 rounded">
                            GPG off
                          </span>
                        )}
                        {repo.gpgKeyUrl && (
                          <span className="text-[10px] text-emerald-400/70 border border-emerald-700/20 bg-emerald-900/10 px-1.5 py-0.5 rounded">
                            GPG key set
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => set('repos', (form.repos ?? []).filter(r => r.id !== repo.id))}
                      className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}

                {/* Inline add form */}
                {showRepoForm && (
                  <div className="p-4 rounded-xl border border-blue-500/25 bg-blue-500/5 space-y-3">
                    <p className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                      <Plus size={12} className="text-blue-400" />
                      New Repository
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <Input
                          label="Label *"
                          value={repoForm.label}
                          onChange={e => setRepoForm(f => ({ ...f, label: e.target.value }))}
                          placeholder="Local Ubuntu 24.04 Mirror"
                        />
                      </div>
                      <div className="col-span-2">
                        <Input
                          label="Base URL *"
                          value={repoForm.baseUrl}
                          onChange={e => setRepoForm(f => ({ ...f, baseUrl: e.target.value }))}
                          placeholder={
                            form.osTarget === 'rhel'
                              ? 'http://10.0.0.5/rocky/9/BaseOS/x86_64/os/'
                              : form.osTarget === 'windows'
                              ? 'http://10.0.0.5/chocolatey'
                              : 'http://10.0.0.5/ubuntu'
                          }
                          mono
                        />
                      </div>
                      {(form.osTarget === 'debian' || form.osTarget === 'all') && (
                        <>
                          <Input
                            label="Suite (distro codename)"
                            value={repoForm.suite ?? ''}
                            onChange={e => setRepoForm(f => ({ ...f, suite: e.target.value }))}
                            placeholder="noble, jammy, bookworm"
                            mono
                          />
                          <Input
                            label="Components"
                            value={repoForm.components ?? ''}
                            onChange={e => setRepoForm(f => ({ ...f, components: e.target.value }))}
                            placeholder="main restricted universe"
                            mono
                          />
                        </>
                      )}
                      {(form.osTarget === 'rhel' || form.osTarget === 'all') && (
                        <div className="col-span-2">
                          <Toggle
                            value={repoForm.gpgCheck}
                            onChange={v => setRepoForm(f => ({ ...f, gpgCheck: v }))}
                            label="Enable GPG signature checking"
                            hint="Disable for self-signed or unsigned internal repos"
                          />
                        </div>
                      )}
                      <div className="col-span-2">
                        <Input
                          label="GPG Key URL (optional)"
                          value={repoForm.gpgKeyUrl ?? ''}
                          onChange={e => setRepoForm(f => ({ ...f, gpgKeyUrl: e.target.value }))}
                          placeholder="http://10.0.0.5/keys/repo.gpg"
                          mono
                          hint="URL to the GPG public key for this repo"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        onClick={() => { setShowRepoForm(false); setRepoForm(emptyRepoForm()); }}
                        className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                      >
                        Cancel
                      </button>
                      <Button size="sm" onClick={handleAddRepo} disabled={!repoForm.label || !repoForm.baseUrl}>
                        Add Repository
                      </Button>
                    </div>
                  </div>
                )}

                {/* Generated file preview */}
                {(form.repos ?? []).length > 0 && (
                  <div className="rounded-xl border border-white/[0.06] overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.05] bg-white/[0.02]">
                      <FileCode2 size={13} className="text-slate-500" />
                      <span className="text-xs font-medium text-slate-500">
                        {form.osTarget === 'debian'
                          ? '/etc/apt/sources.list.d/local-mirror.list'
                          : form.osTarget === 'rhel'
                          ? '/etc/yum.repos.d/local-mirror.repo'
                          : form.osTarget === 'windows'
                          ? 'choco source config'
                          : 'repo config preview'}
                      </span>
                      <span className="ml-auto text-[10px] text-slate-600">preview</span>
                    </div>
                    <div className="p-4 max-h-52 overflow-auto font-mono text-xs leading-relaxed bg-black/40">
                      {generateRepoPreview().split('\n').map((line, i) => (
                        <div key={i} className={`${line.startsWith('#') || line.startsWith('###') ? 'text-slate-600 italic' : 'text-emerald-400/90'}`}>
                          {line || '\u00a0'}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Hardening ─────────────────────────────────────────────── */}
            {tab === 'hardening' && (
              <div className="space-y-6 max-w-xl">
                {/* SSH */}
                <div>
                  <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Lock size={13} className="text-slate-400" /> SSH Hardening
                  </p>
                  <div className="space-y-3">
                    <Toggle value={form.hardening.disableRootSSH} onChange={v => setHard('disableRootSSH', v)}
                      label="Disable root SSH login" hint="Sets PermitRootLogin no in sshd_config" />
                    <Toggle value={form.hardening.sshKeyAuthOnly} onChange={v => setHard('sshKeyAuthOnly', v)}
                      label="Key-based auth only" hint="Sets PasswordAuthentication no — ensure keys are added before enabling" />
                    <Toggle value={form.hardening.disableEmptyPasswords} onChange={v => setHard('disableEmptyPasswords', v)}
                      label="Disable empty passwords" hint="Sets PermitEmptyPasswords no" />
                  </div>
                </div>

                {/* Firewall */}
                <div className="border-t border-white/[0.05] pt-4">
                  <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">Firewall</p>
                  <div className="space-y-3">
                    <Toggle value={form.hardening.enableFirewall} onChange={v => setHard('enableFirewall', v)}
                      label="Enable firewall"
                      hint={form.osTarget === 'windows' ? 'Windows Firewall' : form.osTarget === 'rhel' ? 'firewalld (RHEL/Rocky)' : 'UFW (Ubuntu/Debian)'} />
                    {form.hardening.enableFirewall && (
                      <div className="pl-12">
                        <TagInput
                          label="Allowed inbound ports"
                          values={form.hardening.firewallAllowPorts}
                          onChange={v => setHard('firewallAllowPorts', v)}
                          placeholder="22, 80, 443"
                          mono
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Services */}
                <div className="border-t border-white/[0.05] pt-4">
                  <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">Services</p>
                  <div className="space-y-3">
                    <Toggle value={form.hardening.enableFail2ban} onChange={v => setHard('enableFail2ban', v)}
                      label="Install and enable fail2ban"
                      hint="Bans IPs with 5 failed SSH attempts within 10 minutes (1-hour ban)" />
                    <Toggle value={form.hardening.enableAuditd} onChange={v => setHard('enableAuditd', v)}
                      label="Enable auditd"
                      hint="Kernel-level audit daemon for compliance logging" />
                    <Toggle value={form.hardening.enableAutoUpdates} onChange={v => setHard('enableAutoUpdates', v)}
                      label="Enable automatic security updates"
                      hint="unattended-upgrades (Debian/Ubuntu only)" />
                    <TagInput
                      label="Services to disable"
                      values={form.hardening.disableServices}
                      onChange={v => setHard('disableServices', v)}
                      placeholder="cups, avahi-daemon, bluetooth"
                      mono
                    />
                  </div>
                </div>

                {/* Other */}
                <div className="border-t border-white/[0.05] pt-4">
                  <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">System</p>
                  <div className="space-y-3">
                    <Toggle value={form.hardening.disableUSBStorage} onChange={v => setHard('disableUSBStorage', v)}
                      label="Disable USB storage devices"
                      hint="Adds usb-storage to modprobe blacklist" />
                    <Toggle value={form.hardening.setPasswordPolicy} onChange={v => setHard('setPasswordPolicy', v)}
                      label="Enforce password policy" />
                    {form.hardening.setPasswordPolicy && (
                      <div className="pl-12 grid grid-cols-2 gap-3">
                        <Input
                          label="Min password length"
                          type="number"
                          value={form.hardening.passwordMinLength}
                          onChange={e => setHard('passwordMinLength', +e.target.value)}
                        />
                        <Input
                          label="Max password age (days)"
                          type="number"
                          value={form.hardening.passwordMaxAge}
                          onChange={e => setHard('passwordMaxAge', +e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── Packages ─────────────────────────────────────────────── */}
            {tab === 'packages' && (
              <div className="space-y-6 max-w-xl">
                <div className="p-3 rounded-xl border border-white/[0.06] bg-white/[0.02] flex items-start gap-2">
                  <Info size={13} className="text-slate-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-slate-500">
                    {form.osTarget === 'windows'
                      ? 'Windows packages are installed via Chocolatey. Ensure Chocolatey is available on the target server.'
                      : 'Packages use apt (Debian/Ubuntu) or dnf (RHEL/Rocky) automatically detected at runtime.'}
                  </p>
                </div>
                <TagInput
                  label="Packages to install"
                  values={form.packagesToInstall}
                  onChange={v => set('packagesToInstall', v)}
                  placeholder="curl vim git htop…"
                  mono
                />
                {form.osTarget !== 'windows' && (
                  <TagInput
                    label="Packages to remove"
                    values={form.packagesToRemove}
                    onChange={v => set('packagesToRemove', v)}
                    placeholder="telnet rsh-client cups…"
                    mono
                  />
                )}

                {/* SSH keys */}
                <div className="border-t border-white/[0.05] pt-4">
                  <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">SSH Authorized Keys</p>
                  <p className="text-[10px] text-slate-500 mb-3">Added to root's authorized_keys on every server.</p>
                  <Textarea
                    label=""
                    value={form.sshAuthorizedKeys.join('\n')}
                    onChange={e => set('sshAuthorizedKeys', e.target.value.split('\n').map(l => l.trim()).filter(Boolean))}
                    rows={4}
                    mono
                    placeholder="ssh-rsa AAAA… user@host&#10;ssh-ed25519 AAAA… admin"
                  />
                  {form.sshAuthorizedKeys.length > 0 && (
                    <p className="text-[10px] text-slate-500 mt-1">{form.sshAuthorizedKeys.length} key(s) configured</p>
                  )}
                </div>
              </div>
            )}

            {/* ── Script ───────────────────────────────────────────────── */}
            {tab === 'script' && (
              <div className="space-y-4 max-w-2xl">
                <div className="p-3 rounded-xl border border-yellow-500/20 bg-yellow-500/5 flex items-start gap-2">
                  <AlertTriangle size={13} className="text-yellow-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-yellow-300">
                    This script runs after all standard hardening steps. Use {form.osTarget === 'windows' ? 'PowerShell syntax' : 'bash syntax'}.
                    It's appended directly to the generated script — test carefully before applying to production.
                  </p>
                </div>
                <Textarea
                  label={form.osTarget === 'windows' ? 'Custom PowerShell script' : 'Custom bash script'}
                  value={form.postInstallScript}
                  onChange={e => set('postInstallScript', e.target.value)}
                  rows={18}
                  mono
                  placeholder={form.osTarget === 'windows'
                    ? '# PowerShell commands\n# Restart-Service sshd\n'
                    : '# Bash commands\n# useradd -m -s /bin/bash appuser\n'}
                />
              </div>
            )}

            {/* ── Output ───────────────────────────────────────────────── */}
            {tab === 'output' && (
              <div className="space-y-4">
                {/* What will be applied summary */}
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <ShieldCheck size={13} className="text-emerald-400" />
                    What will be applied
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5">
                    {[
                      { label: `Timezone: ${form.timezone}`, active: true },
                      { label: `Locale: ${form.locale}`, active: true },
                      { label: `IP: ${(form.networkMode ?? 'dhcp') === 'static' ? (form.staticAddress || 'not set') + (form.staticGateway ? ` gw ${form.staticGateway}` : '') : 'DHCP'}`, active: true },
                      { label: `DNS: ${form.dnsServers.join(', ') || 'not set'}`, active: form.dnsServers.length > 0 },
                      { label: `NTP: ${form.ntpServers.join(', ') || 'not set'}`, active: form.ntpServers.length > 0 },
                      { label: `${form.packagesToInstall.length} pkg(s) to install`, active: form.packagesToInstall.length > 0 },
                      { label: `${form.packagesToRemove.length} pkg(s) to remove`, active: form.packagesToRemove.length > 0 },
                      { label: 'Disable root SSH login', active: form.hardening.disableRootSSH },
                      { label: 'Key-based auth only', active: form.hardening.sshKeyAuthOnly },
                      { label: 'No empty passwords', active: form.hardening.disableEmptyPasswords },
                      { label: `Firewall (ports: ${form.hardening.firewallAllowPorts.join(', ') || 'none'})`, active: form.hardening.enableFirewall },
                      { label: 'fail2ban enabled', active: form.hardening.enableFail2ban },
                      { label: 'auditd enabled', active: form.hardening.enableAuditd },
                      { label: 'Auto security updates', active: form.hardening.enableAutoUpdates },
                      { label: 'USB storage disabled', active: form.hardening.disableUSBStorage },
                      { label: `Password policy (min ${form.hardening.passwordMinLength} chars, ${form.hardening.passwordMaxAge}d max)`, active: form.hardening.setPasswordPolicy },
                      { label: `${form.hardening.disableServices.length} service(s) disabled`, active: form.hardening.disableServices.length > 0 },
                      { label: `${(form.repos ?? []).length} repo(s) configured${form.replaceDefaultRepos ? ' (replace defaults)' : ''}`, active: (form.repos ?? []).length > 0 },
                      { label: `${form.sshAuthorizedKeys.length} SSH key(s)`, active: form.sshAuthorizedKeys.length > 0 },
                      { label: 'Custom post-install script', active: form.postInstallScript.trim().split('\n').some(l => l.trim() && !l.trim().startsWith('#')) },
                    ].map(({ label, active }) => (
                      <div key={label} className={`flex items-center gap-1.5 text-[11px] ${active ? 'text-slate-300' : 'text-slate-600 line-through'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${active ? 'bg-emerald-400' : 'bg-slate-700'}`} />
                        {label}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Format selector + actions */}
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    {([
                      { id: 'ansible', label: 'Ansible YAML', icon: <Play size={12} /> },
                      { id: 'bash', label: 'Bash Script', icon: <Terminal size={12} /> },
                      { id: 'powershell', label: 'PowerShell', icon: <FileCode2 size={12} /> },
                    ] as const).map(f => (
                      <button
                        key={f.id}
                        onClick={() => setOutputFmt(f.id)}
                        disabled={f.id === 'powershell' && form.osTarget !== 'windows' && form.osTarget !== 'all'}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                          outputFmt === f.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.05]'
                        }`}
                      >
                        {f.icon}{f.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2 ml-auto">
                    <Button variant="secondary" icon={<Copy size={14} />} onClick={handleCopy}>
                      Copy
                    </Button>
                    <Button icon={<Download size={14} />} onClick={handleExport}>
                      Download
                    </Button>
                  </div>
                </div>

                {/* Usage hint */}
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                  <p className="text-[10px] text-slate-500 font-mono">
                    {outputFmt === 'ansible' && `ansible-playbook -i hosts.ini gold-image.yml --become`}
                    {outputFmt === 'bash' && `chmod +x gold-image.sh && sudo ./gold-image.sh`}
                    {outputFmt === 'powershell' && `# Run in PowerShell as Administrator\n.\\gold-image.ps1`}
                  </p>
                </div>

                {/* Code preview */}
                <div className="rounded-xl border border-white/[0.06] overflow-hidden">
                  {/* Terminal chrome */}
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.05] bg-white/[0.02]">
                    <FileCode2 size={13} className="text-slate-500" />
                    <span className="text-xs font-medium text-slate-500">
                      {form.name ? `${form.name.toLowerCase().replace(/\s+/g, '-')}-gold-image.${outputFmt === 'ansible' ? 'yml' : outputFmt === 'bash' ? 'sh' : 'ps1'}` : 'gold-image'}
                    </span>
                    <span className="ml-auto text-[10px] text-slate-600">{lineCount} lines</span>
                    <div className="flex gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
                      <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/50" />
                      <div className="w-2.5 h-2.5 rounded-full bg-green-500/50" />
                    </div>
                  </div>
                  <div className="p-4 max-h-[500px] overflow-auto font-mono text-xs leading-relaxed bg-black/40">
                    {outputContent.split('\n').map((line, i) => {
                      // Simple syntax highlighting
                      const isComment  = line.trim().startsWith('#') || line.trim().startsWith('//');
                      const isKey      = /^  ?- name:/.test(line) || /^  \w+:/.test(line);
                      const isSection  = /^# ──/.test(line);
                      const isString   = line.includes(': "') || line.includes(': |') || line.includes("'");
                      return (
                        <div key={i} className="flex">
                          <span className="text-slate-700 select-none mr-4 min-w-[2.5rem] text-right tabular-nums">
                            {i + 1}
                          </span>
                          <span className={
                            isSection  ? 'text-slate-500' :
                            isComment  ? 'text-slate-600 italic' :
                            isKey      ? 'text-blue-400' :
                            isString   ? 'text-emerald-400' :
                                         'text-slate-300'
                          }>
                            {line || '\u00a0'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Create new modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6 space-y-4"
            style={{ background: '#0f0f1e', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <ShieldCheck size={16} className="text-blue-400" />
                New Gold Image
              </h3>
              <button onClick={() => setShowCreate(false)} className="text-slate-500 hover:text-slate-200 transition-colors">
                <X size={16} />
              </button>
            </div>
            <Input label="Name *" value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="e.g. Production Web Server Standard"
              onKeyDown={e => e.key === 'Enter' && handleCreate()} />
            <Select label="OS Target" value={newOsTarget} onChange={e => setNewOsTarget(e.target.value as GoldImageOsTarget)}>
              {OS_TARGET_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
            <div className="flex justify-end gap-3 pt-1">
              <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={!newName.trim()}>Create</Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Gold Image"
        confirmLabel="Delete"
        description="This gold image standard will be permanently deleted. Generated scripts won't be affected."
      />
    </div>
  );
}
