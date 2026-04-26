import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Plus, Search, Trash2, Edit3, Play,
  Server, AlertTriangle, Terminal, CheckCircle, XCircle, Clock,
  CheckSquare, Square, Monitor, Upload, FileText, ShieldCheck, Zap,
} from 'lucide-react';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import { addServer, updateServer, deleteServer, setServerStatus } from '../store/slices/serversSlice';
import { addDeployment, updateDeployment, appendLog } from '../store/slices/deploymentsSlice';
import Card, { CardBody } from '../components/shared/Card';
import Button from '../components/shared/Button';
import StatusBadge from '../components/shared/StatusBadge';
import OSIcon from '../components/shared/OSIcon';
import Modal, { ConfirmDialog } from '../components/shared/Modal';
import { Input, Select, Textarea } from '../components/shared/FormField';
import { Server as ServerType, DeploymentStatus } from '../types';
import { generateId, formatDate } from '../lib/utils';
import { validateConfig } from '../lib/validateConfig';

type FilterStatus = 'all' | DeploymentStatus;

const MAC_RE = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;
const IP_RE  = /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/;

function validateServerForm(form: typeof emptyServer): string | null {
  if (!form.hostname.trim()) return 'Hostname is required';
  if (!form.macAddress.trim()) return 'MAC address is required';
  if (!MAC_RE.test(form.macAddress.trim())) return 'Invalid MAC address format (e.g. 00:1A:2B:3C:4D:5E)';
  if (form.ipAddress.trim() && !IP_RE.test(form.ipAddress.trim())) return 'Invalid IP address format';
  return null;
}

const emptyServer: Omit<ServerType, 'id' | 'createdAt'> = {
  hostname: '',
  macAddress: '',
  ipAddress: '',
  osProfileId: '',
  configurationId: '',
  goldImageId: '',
  status: 'idle',
  notes: '',
  tags: [],
  cpuModel: '',
  ramGB: 16,
  diskGB: 256,
};

export default function ServerInventory() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const servers = useAppSelector(s => s.servers.servers);
  const osProfiles = useAppSelector(s => s.osProfiles.profiles);
  const configurations = useAppSelector(s => s.configurations.configs);
  const deployments = useAppSelector(s => s.deployments.deployments);
  const packageFiles = useAppSelector(s => s.packageFiles.files);
  const goldImages = useAppSelector(s => s.goldImages.images);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [editServer, setEditServer] = useState<ServerType | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deployServer, setDeployServer] = useState<ServerType | null>(null);
  const [logServer, setLogServer] = useState<ServerType | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOsId, setBulkOsId] = useState('');
  const [bulkConfigId, setBulkConfigId] = useState('');
  const [showBulkAssign, setShowBulkAssign] = useState(false);

  // Pre-deploy validation
  const deployValidationErrors = (() => {
    if (!deployServer) return [];
    const cfg = configurations.find(c => c.id === deployServer.configurationId);
    const os = osProfiles.find(o => o.id === deployServer.osProfileId);
    if (!cfg || !os) return [];
    return validateConfig(cfg, os, packageFiles).filter(v => v.level === 'fail');
  })();

  // CSV import
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [csvPreview, setCsvPreview] = useState<Omit<ServerType, 'id' | 'createdAt'>[]>([]);
  const [showCsvPreview, setShowCsvPreview] = useState(false);

  // Auto-scroll log viewer to bottom when new log lines arrive
  useEffect(() => {
    if (logServer) {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logServer, deployments]);
  const [form, setForm] = useState({ ...emptyServer });
  const [tagInput, setTagInput] = useState('');

  const filtered = servers.filter(s => {
    const matchSearch = !search ||
      s.hostname.toLowerCase().includes(search.toLowerCase()) ||
      s.macAddress.toLowerCase().includes(search.toLowerCase()) ||
      s.ipAddress.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || s.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const openCreate = () => {
    setForm({ ...emptyServer });
    setShowCreate(true);
  };

  const openEdit = (server: ServerType, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditServer(server);
    setForm({
      hostname: server.hostname,
      macAddress: server.macAddress,
      ipAddress: server.ipAddress,
      osProfileId: server.osProfileId,
      configurationId: server.configurationId,
      goldImageId: server.goldImageId ?? '',
      status: server.status,
      notes: server.notes,
      tags: [...server.tags],
      cpuModel: server.cpuModel,
      ramGB: server.ramGB,
      diskGB: server.diskGB,
    });
  };

  const handleSave = () => {
    const validationError = validateServerForm(form);
    if (validationError) { toast.error(validationError); return; }
    const now = new Date().toISOString();
    if (editServer) {
      dispatch(updateServer({ ...editServer, ...form }));
      setEditServer(null);
      toast.success(`Server "${form.hostname}" updated`);
    } else {
      dispatch(addServer({ ...form, id: generateId('srv'), createdAt: now }));
      setShowCreate(false);
      toast.success(`Server "${form.hostname}" added`);
    }
  };

  const handleDeploy = (server: ServerType) => {
    dispatch(setServerStatus({ id: server.id, status: 'deploying' }));
    const depId = generateId('dep');
    dispatch(addDeployment({
      id: depId,
      serverId: server.id,
      serverHostname: server.hostname,
      osProfileId: server.osProfileId,
      configurationId: server.configurationId,
      status: 'deploying',
      startedAt: new Date().toISOString(),
      logs: [
        `[${new Date().toLocaleTimeString()}] Initiating PXE deployment`,
        `[${new Date().toLocaleTimeString()}] Sending DHCP PXE offer to ${server.macAddress}`,
        `[${new Date().toLocaleTimeString()}] Serving boot files via TFTP`,
      ],
    }));
    setDeployServer(null);
    toast('Deployment started for ' + server.hostname, { icon: '🚀' });

    // Progressive log simulation
    const goldImage = goldImages.find(g => g.id === server.goldImageId);
    const baseMessages = [
      'Kernel loaded via PXE',
      'Mounting installation media',
      'Partitioning disk…',
      'Installing base system…',
      'Configuring network interfaces',
      'Installing additional packages',
      'Running post-install scripts',
      'Finalizing configuration',
      'OS installation complete',
    ];
    const goldMessages = goldImage ? [
      `Applying gold image standard: ${goldImage.name}`,
      goldImage.dnsServers.length > 0 ? `Configuring DNS servers: ${goldImage.dnsServers.join(', ')}` : null,
      goldImage.ntpServers.length > 0 ? `Configuring NTP: ${goldImage.ntpServers.join(', ')}` : null,
      goldImage.hardening.enableFirewall ? 'Enabling firewall and applying port rules' : null,
      goldImage.hardening.disableRootSSH ? 'Hardening SSH: PermitRootLogin no' : null,
      goldImage.hardening.enableFail2ban ? 'Installing and configuring fail2ban' : null,
      goldImage.packagesToInstall.length > 0 ? `Installing baseline packages: ${goldImage.packagesToInstall.join(', ')}` : null,
      goldImage.hardening.enableAutoUpdates ? 'Enabling automatic security updates' : null,
      `Gold image "${goldImage.name}" applied successfully`,
    ].filter(Boolean) as string[] : [];

    const allMessages = [...baseMessages, ...goldMessages];
    const totalDuration = (allMessages.length + 1) * 3000;

    allMessages.forEach((msg, i) => {
      setTimeout(() => {
        dispatch(appendLog({ id: depId, line: `[${new Date().toLocaleTimeString()}] ${msg}` }));
      }, (i + 1) * 3000);
    });

    setTimeout(() => {
      const completedAt = new Date().toISOString();
      dispatch(setServerStatus({ id: server.id, status: 'completed' }));
      dispatch(updateServer({
        ...server,
        status: 'completed',
        lastDeployedAt: completedAt,
        ...(goldImage ? { goldImageAppliedAt: completedAt } : {}),
      }));
      dispatch(updateDeployment({
        id: depId,
        status: 'completed',
        completedAt,
        duration: Math.round(totalDuration / 1000),
      }));
      toast.success(`${server.hostname} deployed successfully`);
    }, totalDuration);
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const allFilteredIds = filtered.map(s => s.id);
  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selected.has(id));
  const someSelected = allFilteredIds.some(id => selected.has(id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(prev => {
        const next = new Set(prev);
        allFilteredIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelected(prev => new Set([...prev, ...allFilteredIds]));
    }
  };

  const handleBulkDelete = () => {
    const count = selected.size;
    selected.forEach(id => dispatch(deleteServer(id)));
    setSelected(new Set());
    toast.success(`${count} server${count > 1 ? 's' : ''} removed`);
  };

  const handleBulkAssign = () => {
    if (!bulkOsId) return;
    selected.forEach(id => {
      const s = servers.find(x => x.id === id);
      if (s) dispatch(updateServer({ ...s, osProfileId: bulkOsId, configurationId: bulkConfigId }));
    });
    const count = selected.size;
    const os = osProfiles.find(o => o.id === bulkOsId);
    toast.success(`${count} server${count > 1 ? 's' : ''} assigned to ${os?.name}`);
    setSelected(new Set());
    setShowBulkAssign(false);
    setBulkOsId('');
    setBulkConfigId('');
  };

  const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) { toast.error('CSV must have a header row and at least one data row'); return; }
      // Auto-detect header: hostname,mac,ip,ram,disk,cpu,notes
      const header = lines[0].toLowerCase().split(',').map(h => h.trim());
      const get = (row: string[], key: string) => {
        const i = header.indexOf(key);
        return i >= 0 ? (row[i] || '').trim() : '';
      };
      const parsed: Omit<ServerType, 'id' | 'createdAt'>[] = [];
      for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split(',');
        const hostname = get(row, 'hostname');
        const mac = get(row, 'mac') || get(row, 'macaddress') || get(row, 'mac_address');
        if (!hostname || !mac || !MAC_RE.test(mac)) continue;
        parsed.push({
          hostname,
          macAddress: mac,
          ipAddress: get(row, 'ip') || get(row, 'ipaddress') || '',
          ramGB: parseInt(get(row, 'ram') || get(row, 'ramgb') || '16') || 16,
          diskGB: parseInt(get(row, 'disk') || get(row, 'diskgb') || '256') || 256,
          cpuModel: get(row, 'cpu') || get(row, 'cpumodel') || '',
          notes: get(row, 'notes') || '',
          osProfileId: '',
          configurationId: '',
          status: 'idle',
          tags: [],
        });
      }
      if (parsed.length === 0) { toast.error('No valid rows found. Ensure hostname and mac columns exist.'); return; }
      setCsvPreview(parsed);
      setShowCsvPreview(true);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleCsvImport = () => {
    const now = new Date().toISOString();
    csvPreview.forEach(s => dispatch(addServer({ ...s, id: generateId('srv'), createdAt: now })));
    toast.success(`${csvPreview.length} servers imported from CSV`);
    setShowCsvPreview(false);
    setCsvPreview([]);
  };

  const osConfigOptions = (osId: string) =>
    configurations.filter(c => c.osProfileId === osId);

  const FormContent = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Input
            label="Hostname *"
            value={form.hostname}
            onChange={e => setForm(f => ({ ...f, hostname: e.target.value }))}
            placeholder="web-01.example.com"
            mono
          />
        </div>
        <Input
          label="MAC Address *"
          value={form.macAddress}
          onChange={e => setForm(f => ({ ...f, macAddress: e.target.value }))}
          placeholder="00:1A:2B:3C:4D:5E"
          mono
        />
        <Input
          label="IP Address"
          value={form.ipAddress}
          onChange={e => setForm(f => ({ ...f, ipAddress: e.target.value }))}
          placeholder="10.0.0.100"
          mono
        />
        <Select
          label="OS Profile"
          value={form.osProfileId}
          onChange={e => setForm(f => ({ ...f, osProfileId: e.target.value, configurationId: '' }))}
        >
          <option value="">— Select OS —</option>
          {osProfiles.map(os => (
            <option key={os.id} value={os.id}>{os.name} {os.version}</option>
          ))}
        </Select>
        <Select
          label="Configuration"
          value={form.configurationId}
          onChange={e => setForm(f => ({ ...f, configurationId: e.target.value }))}
          disabled={!form.osProfileId}
        >
          <option value="">— Select Config —</option>
          {osConfigOptions(form.osProfileId).map(cfg => (
            <option key={cfg.id} value={cfg.id}>{cfg.name}{cfg.isDefault ? ' (default)' : ''}</option>
          ))}
        </Select>
        <div className="col-span-2">
          <Select
            label="Gold Image Standard"
            value={form.goldImageId ?? ''}
            onChange={e => setForm(f => ({ ...f, goldImageId: e.target.value }))}
          >
            <option value="">— None (skip post-deploy hardening) —</option>
            {goldImages.map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </Select>
          {form.goldImageId && (() => {
            const gi = goldImages.find(x => x.id === form.goldImageId);
            return gi ? (
              <p className="text-[10px] text-slate-500 mt-1 pl-1">
                {gi.osTarget !== 'all' ? `${gi.osTarget} · ` : ''}{gi.description || 'No description'}
              </p>
            ) : null;
          })()}
        </div>
      </div>

      {/* Hardware */}
      <div className="grid grid-cols-3 gap-3">
        <Input
          label="RAM (GB)"
          type="number"
          value={form.ramGB}
          onChange={e => setForm(f => ({ ...f, ramGB: +e.target.value }))}
        />
        <Input
          label="Disk (GB)"
          type="number"
          value={form.diskGB}
          onChange={e => setForm(f => ({ ...f, diskGB: +e.target.value }))}
        />
        <div className="col-span-3">
          <Input
            label="CPU Model"
            value={form.cpuModel}
            onChange={e => setForm(f => ({ ...f, cpuModel: e.target.value }))}
            placeholder="Intel Xeon E5-2680 v4"
          />
        </div>
      </div>

      {/* Tags */}
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">Tags</label>
        <div className="flex gap-2 mb-2">
          <input
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && tagInput.trim()) {
                setForm(f => ({ ...f, tags: [...new Set([...f.tags, tagInput.trim()])] }));
                setTagInput('');
              }
            }}
            placeholder="production, web, db…"
            className="flex-1 rounded-xl px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 border border-white/[0.07] bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.06)]"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {form.tags.map(tag => (
            <span key={tag} className="inline-flex items-center gap-1 bg-blue-900/30 border border-blue-700/30 text-blue-300 text-xs px-2 py-0.5 rounded-md">
              {tag}
              <button onClick={() => setForm(f => ({ ...f, tags: f.tags.filter(t => t !== tag) }))}
                className="text-blue-400/60 hover:text-red-400 transition-colors">×</button>
            </span>
          ))}
        </div>
      </div>

      {/* Notes */}
      <Textarea
        label="Notes"
        value={form.notes}
        onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
        rows={2}
        placeholder="Optional notes about this server…"
      />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search servers…"
            className="w-full rounded-xl pl-9 pr-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 border border-white/[0.07] bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.06)]"
          />
        </div>

        {/* Status filter */}
        <div className="flex gap-1.5 flex-wrap">
          {(['all', 'completed', 'deploying', 'pending', 'failed', 'idle'] as const).map(s => (
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

        <div className="flex gap-2 ml-auto">
          <input ref={csvInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleCsvFile} />
          <Button variant="secondary" icon={<Upload size={16} />} onClick={() => csvInputRef.current?.click()}>
            Import CSV
          </Button>
          <Button variant="secondary" icon={<Zap size={15} />} onClick={() => navigate('/deploy')}
            style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)', color: '#60a5fa' }}>
            Deploy Wizard
          </Button>
          <Button variant="primary" icon={<Plus size={16} />} onClick={openCreate}>
            Add Server
          </Button>
        </div>
      </div>

      {/* Stats summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total', value: servers.length, color: 'text-slate-300', glow: false },
          { label: 'Deployed', value: servers.filter(s => s.status === 'completed').length, color: 'text-emerald-400', glow: true },
          { label: 'Deploying', value: servers.filter(s => s.status === 'deploying').length, color: 'text-blue-400', glow: false },
          { label: 'Pending', value: servers.filter(s => s.status === 'pending').length, color: 'text-yellow-400', glow: false },
          { label: 'Failed', value: servers.filter(s => s.status === 'failed').length, color: 'text-red-400', glow: false },
        ].map(({ label, value, color }) => (
          <Card key={label}>
            <CardBody className="py-3">
              <div className={`text-2xl font-bold ${color}`}>{value}</div>
              <div className="text-xs text-slate-500">{label}</div>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-blue-500/25 bg-blue-500/5 flex-wrap">
          <span className="text-sm font-medium text-blue-300">{selected.size} server{selected.size > 1 ? 's' : ''} selected</span>
          <div className="flex gap-2 ml-auto flex-wrap">
            <button
              onClick={() => setShowBulkAssign(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-200 transition-all border border-white/[0.08] bg-white/[0.05] hover:bg-white/[0.09]"
            >
              <Monitor size={13} />
              Assign OS Profile
            </button>
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-300 transition-all border border-red-500/20 bg-red-500/8 hover:bg-red-500/15"
            >
              <Trash2 size={13} />
              Delete Selected
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-300 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <Card>
        {filtered.length === 0 ? (
          <CardBody className="flex flex-col items-center justify-center h-48 gap-3 text-slate-500">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
              <Server size={22} className="text-slate-600" />
            </div>
            <p className="text-sm">{search || statusFilter !== 'all' ? 'No servers match your filter' : 'No servers added yet'}</p>
            {!search && statusFilter === 'all' && (
              <Button size="sm" icon={<Plus size={14} />} onClick={openCreate}>Add first server</Button>
            )}
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.05]">
                  <th className="w-10 px-4 py-3">
                    <button onClick={toggleSelectAll} className="text-slate-500 hover:text-slate-200 transition-colors">
                      {allSelected ? <CheckSquare size={15} className="text-blue-400" /> : someSelected ? <CheckSquare size={15} className="text-slate-500" /> : <Square size={15} />}
                    </button>
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Server</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider hidden sm:table-cell">MAC / IP</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider hidden md:table-cell">OS / Config</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider hidden lg:table-cell">Hardware</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider hidden xl:table-cell">Tags</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {filtered.map(server => {
                  const os = osProfiles.find(o => o.id === server.osProfileId);
                  const config = configurations.find(c => c.id === server.configurationId);
                  return (
                    <tr key={server.id} className={`hover:bg-white/[0.02] transition-colors group ${selected.has(server.id) ? 'bg-blue-500/[0.04]' : ''}`}>
                      <td className="w-10 px-4 py-3.5">
                        <button onClick={() => toggleSelect(server.id)} className="text-slate-500 hover:text-blue-400 transition-colors">
                          {selected.has(server.id)
                            ? <CheckSquare size={15} className="text-blue-400" />
                            : <Square size={15} />
                          }
                        </button>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-medium text-slate-200 flex items-center gap-1.5">
                          <Server size={13} className="text-slate-600 flex-shrink-0" />
                          {server.hostname}
                        </div>
                        {server.notes && <div className="text-xs text-slate-600 truncate max-w-40 mt-0.5">{server.notes}</div>}
                      </td>
                      <td className="px-5 py-3.5 hidden sm:table-cell">
                        <code className="text-xs text-slate-300 bg-white/[0.05] px-1.5 py-0.5 rounded-md block mb-1 font-mono">{server.macAddress}</code>
                        <span className="text-xs text-slate-500">{server.ipAddress || '—'}</span>
                      </td>
                      <td className="px-5 py-3.5 hidden md:table-cell">
                        {os ? (
                          <div className="flex items-center gap-2">
                            <OSIcon icon={os.icon} color={os.color} size="sm" />
                            <div>
                              <div className="text-xs font-medium text-slate-200">{os.name} {os.version}</div>
                              <div className="text-xs text-slate-500">{config?.name || '—'}</div>
                              {server.goldImageId && (() => {
                                const gi = goldImages.find(g => g.id === server.goldImageId);
                                return gi ? (
                                  <div className="flex items-center gap-1 mt-0.5">
                                    <ShieldCheck size={10} className="text-emerald-400" />
                                    <span className="text-[10px] text-emerald-400/80 truncate max-w-28">{gi.name}</span>
                                  </div>
                                ) : null;
                              })()}
                            </div>
                          </div>
                        ) : <span className="text-xs text-slate-600">Unassigned</span>}
                      </td>
                      <td className="px-5 py-3.5 hidden lg:table-cell">
                        <div className="text-xs text-slate-400">{server.ramGB}GB · {server.diskGB}GB</div>
                        <div className="text-xs text-slate-600 truncate max-w-32">{server.cpuModel}</div>
                      </td>
                      <td className="px-5 py-3.5 hidden xl:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {server.tags.map(tag => (
                            <span key={tag} className="text-xs bg-blue-900/20 text-blue-400 px-1.5 py-0.5 rounded border border-blue-800/30">{tag}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <StatusBadge status={server.status} />
                        <div className="text-xs text-slate-600 mt-0.5">
                          {server.lastDeployedAt ? formatDate(server.lastDeployedAt) : ''}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          {server.status === 'deploying' && (
                            <button
                              onClick={() => setLogServer(server)}
                              title="View live logs"
                              className="p-1.5 rounded-lg text-blue-500 hover:text-blue-300 hover:bg-blue-500/10 transition-colors"
                            >
                              <Terminal size={14} />
                            </button>
                          )}
                          {server.status === 'completed' && deployments.some(d => d.serverId === server.id) && (
                            <button
                              onClick={() => setLogServer(server)}
                              title="View deployment logs"
                              className="p-1.5 rounded-lg text-slate-600 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                            >
                              <Terminal size={14} />
                            </button>
                          )}
                          {server.osProfileId && server.configurationId && server.status !== 'deploying' && (
                            <button
                              onClick={() => setDeployServer(server)}
                              title="Deploy"
                              className="p-1.5 rounded-lg text-slate-600 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                            >
                              <Play size={14} />
                            </button>
                          )}
                          <button onClick={e => openEdit(server, e)} title="Edit"
                            className="p-1.5 rounded-lg text-slate-600 hover:text-slate-200 hover:bg-white/[0.06] transition-colors">
                            <Edit3 size={14} />
                          </button>
                          <button onClick={() => setDeleteId(server.id)} title="Delete"
                            className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add Server"
        subtitle="Register a new bare-metal server for PXE deployment" size="lg"
        footer={<div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!form.hostname || !form.macAddress}>Add Server</Button>
        </div>}>
        <FormContent />
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editServer} onClose={() => setEditServer(null)} title="Edit Server"
        subtitle={editServer?.hostname} size="lg"
        footer={<div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setEditServer(null)}>Cancel</Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </div>}>
        <FormContent />
      </Modal>

      {/* Deploy Confirm */}
      <Modal open={!!deployServer} onClose={() => setDeployServer(null)}
        title="Start Deployment" size="sm"
        footer={<div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeployServer(null)}>Cancel</Button>
          <Button variant="success" icon={<Play size={14} />} onClick={() => deployServer && handleDeploy(deployServer)}>
            Start Deployment
          </Button>
        </div>}>
        {deployServer && (() => {
          const os = osProfiles.find(o => o.id === deployServer.osProfileId);
          const cfg = configurations.find(c => c.id === deployServer.configurationId);
          const gi = goldImages.find(g => g.id === deployServer.goldImageId);
          return (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-white/[0.03] rounded-xl border border-white/[0.07]">
                {os && <OSIcon icon={os.icon} color={os.color} size="md" />}
                <div>
                  <div className="text-sm font-medium text-slate-200">{deployServer.hostname}</div>
                  <div className="text-xs text-slate-400 font-mono">{deployServer.macAddress}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    {os?.name} {os?.version} — {cfg?.name || 'Default config'}
                  </div>
                </div>
              </div>

              {/* Gold image summary */}
              {gi ? (
                <div className="p-3 bg-emerald-900/15 border border-emerald-700/25 rounded-xl space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-300">
                    <ShieldCheck size={13} />
                    Gold Image: {gi.name}
                  </div>
                  <div className="grid grid-cols-2 gap-1 pl-1">
                    {gi.hardening.disableRootSSH && <span className="text-[10px] text-emerald-400/70">· Disable root SSH</span>}
                    {gi.hardening.sshKeyAuthOnly && <span className="text-[10px] text-emerald-400/70">· Key-only auth</span>}
                    {gi.hardening.enableFirewall && <span className="text-[10px] text-emerald-400/70">· Firewall enabled</span>}
                    {gi.hardening.enableFail2ban && <span className="text-[10px] text-emerald-400/70">· fail2ban</span>}
                    {gi.hardening.enableAuditd && <span className="text-[10px] text-emerald-400/70">· auditd</span>}
                    {gi.hardening.disableUSBStorage && <span className="text-[10px] text-emerald-400/70">· USB disabled</span>}
                    {gi.dnsServers.length > 0 && <span className="text-[10px] text-emerald-400/70">· DNS configured</span>}
                    {gi.ntpServers.length > 0 && <span className="text-[10px] text-emerald-400/70">· NTP configured</span>}
                    {gi.packagesToInstall.length > 0 && <span className="text-[10px] text-emerald-400/70">· {gi.packagesToInstall.length} pkg(s) installed</span>}
                    {gi.hardening.enableAutoUpdates && <span className="text-[10px] text-emerald-400/70">· Auto-updates</span>}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 p-3 bg-white/[0.02] border border-white/[0.05] rounded-xl text-xs text-slate-500">
                  <ShieldCheck size={12} className="text-slate-600" />
                  No gold image standard assigned — bare OS install only
                </div>
              )}

              {deployValidationErrors.length > 0 && (
                <div className="p-3 bg-red-900/20 border border-red-800/30 rounded-xl space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-red-300">
                    <XCircle size={13} />
                    {deployValidationErrors.length} validation error{deployValidationErrors.length > 1 ? 's' : ''} detected
                  </div>
                  {deployValidationErrors.map(e => (
                    <div key={e.id} className="text-xs text-red-400/80 pl-4">· {e.title}</div>
                  ))}
                  <p className="text-xs text-red-400/60 pt-1">Deployment may fail. Review configuration before proceeding.</p>
                </div>
              )}
              <div className="flex items-start gap-2 p-3 bg-yellow-900/20 border border-yellow-800/30 rounded-xl">
                <AlertTriangle size={16} className="text-yellow-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-yellow-300">This will initiate a PXE network boot. The server must be configured to boot from network on next restart.</p>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Bulk Assign OS Modal */}
      <Modal
        open={showBulkAssign}
        onClose={() => setShowBulkAssign(false)}
        title="Assign OS Profile"
        subtitle={`Apply to ${selected.size} selected server${selected.size > 1 ? 's' : ''}`}
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowBulkAssign(false)}>Cancel</Button>
            <Button onClick={handleBulkAssign} disabled={!bulkOsId}>Apply to {selected.size} servers</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Select
            label="OS Profile"
            value={bulkOsId}
            onChange={e => { setBulkOsId(e.target.value); setBulkConfigId(''); }}
          >
            <option value="">— Select OS —</option>
            {osProfiles.map(os => (
              <option key={os.id} value={os.id}>{os.name} {os.version}</option>
            ))}
          </Select>
          <Select
            label="Configuration"
            value={bulkConfigId}
            onChange={e => setBulkConfigId(e.target.value)}
            disabled={!bulkOsId}
          >
            <option value="">— Select Config —</option>
            {osConfigOptions(bulkOsId).map(cfg => (
              <option key={cfg.id} value={cfg.id}>{cfg.name}{cfg.isDefault ? ' (default)' : ''}</option>
            ))}
          </Select>
        </div>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) {
            const s = servers.find(x => x.id === deleteId);
            dispatch(deleteServer(deleteId));
            toast.success(`Server "${s?.hostname}" removed`);
          }
        }}
        title="Delete Server" confirmLabel="Delete Server"
        description="Are you sure you want to remove this server from inventory? This does not affect the actual server hardware." />

      {/* CSV Import Preview Modal */}
      <Modal
        open={showCsvPreview}
        onClose={() => setShowCsvPreview(false)}
        title="CSV Import Preview"
        subtitle={`${csvPreview.length} servers ready to import`}
        size="xl"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowCsvPreview(false)}>Cancel</Button>
            <Button icon={<Upload size={14} />} onClick={handleCsvImport}>
              Import {csvPreview.length} Servers
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="flex items-start gap-2 p-3 bg-blue-900/20 border border-blue-800/30 rounded-xl">
            <FileText size={15} className="text-blue-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-300">
              Review the servers below before importing. OS profile and configuration can be assigned after import from the Server Inventory.
            </p>
          </div>
          <div className="overflow-x-auto max-h-72 overflow-y-auto rounded-xl border border-white/[0.07]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-[#0f0f1e]">
                <tr className="border-b border-white/[0.05]">
                  {['Hostname', 'MAC Address', 'IP', 'RAM', 'Disk', 'CPU'].map(h => (
                    <th key={h} className="text-left px-3 py-2.5 font-medium text-slate-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {csvPreview.map((s, i) => (
                  <tr key={i} className="hover:bg-white/[0.02]">
                    <td className="px-3 py-2 font-medium text-slate-200">{s.hostname}</td>
                    <td className="px-3 py-2"><code className="text-slate-400 font-mono">{s.macAddress}</code></td>
                    <td className="px-3 py-2 text-slate-500">{s.ipAddress || '—'}</td>
                    <td className="px-3 py-2 text-slate-500">{s.ramGB}GB</td>
                    <td className="px-3 py-2 text-slate-500">{s.diskGB}GB</td>
                    <td className="px-3 py-2 text-slate-500 truncate max-w-32">{s.cpuModel || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      {/* Deployment Log Viewer */}
      {(() => {
        if (!logServer) return null;
        const dep = deployments.find(d =>
          d.serverId === logServer.id &&
          (d.status === 'deploying' || d.status === 'completed' || d.status === 'failed')
        );
        const os = osProfiles.find(o => o.id === logServer.osProfileId);
        const cfg = configurations.find(c => c.id === logServer.configurationId);
        return (
          <Modal open={!!logServer} onClose={() => setLogServer(null)}
            title="Deployment Logs" subtitle={logServer.hostname} size="xl">
            <div className="space-y-4">
              {/* Deployment info strip */}
              <div className="flex flex-wrap gap-3 items-center p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                {os && <div className="flex items-center gap-2">
                  <OSIcon icon={os.icon} color={os.color} size="sm" />
                  <span className="text-xs text-slate-300">{os.name} {os.version}</span>
                </div>}
                {cfg && <span className="text-xs text-slate-500 border-l border-white/[0.08] pl-3">{cfg.name}</span>}
                {dep && (
                  <div className="ml-auto flex items-center gap-2">
                    {dep.status === 'deploying' && (
                      <span className="flex items-center gap-1.5 text-xs text-blue-400">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-400 pulse-dot" />
                        Deploying…
                      </span>
                    )}
                    {dep.status === 'completed' && (
                      <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                        <CheckCircle size={12} /> Completed
                      </span>
                    )}
                    {dep.status === 'failed' && (
                      <span className="flex items-center gap-1.5 text-xs text-red-400">
                        <XCircle size={12} /> Failed
                      </span>
                    )}
                    {dep.startedAt && (
                      <span className="text-xs text-slate-600 flex items-center gap-1">
                        <Clock size={11} />{formatDate(dep.startedAt)}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Log terminal */}
              <div className="bg-black/60 rounded-xl border border-white/[0.06] overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.05] bg-white/[0.02]">
                  <Terminal size={13} className="text-slate-500" />
                  <span className="text-xs font-medium text-slate-500">stdout / deployment log</span>
                  <div className="ml-auto flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
                  </div>
                </div>
                <div className="p-4 max-h-80 overflow-y-auto space-y-1 font-mono text-xs">
                  {dep?.logs && dep.logs.length > 0 ? dep.logs.map((line, i) => (
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
        );
      })()}
    </div>
  );
}
