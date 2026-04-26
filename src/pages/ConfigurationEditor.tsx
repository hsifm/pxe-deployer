import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link, useBlocker } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Save, Plus, Trash2, ChevronRight, GripVertical,
  Terminal, Shield, Network, HardDrive, Package,
  Settings, Code, ChevronDown, ChevronUp, Check,
  AlertTriangle, FlaskConical, Upload, FileArchive, Download, X as XIcon,
  FileJson,
} from 'lucide-react';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import { addConfig, updateConfig } from '../store/slices/configurationsSlice';
import { addPackageFile, deletePackageFile } from '../store/slices/packageFilesSlice';
import Button from '../components/shared/Button';
import Card, { CardHeader, CardBody } from '../components/shared/Card';
import OSIcon from '../components/shared/OSIcon';
import Badge from '../components/shared/Badge';
import { ConfirmDialog } from '../components/shared/Modal';
import ValidationReport from '../components/shared/ValidationReport';
import {
  DeploymentConfig, Command, Agent, ConfigType,
  CommandStage, CommandType, AgentType, PackageFile,
} from '../types';
import { generateId } from '../lib/utils';
import { validateConfig, ValidationCheck } from '../lib/validateConfig';
import { generatePreseed, generateKickstart, generateAutounattend } from '../lib/configGenerators';
import { saveBlob, deleteBlob, downloadBlob, detectFormat, inferOsFamily, formatBytes } from '../lib/packageStorage';

type TabId = 'general' | 'network' | 'disk' | 'packages' | 'commands' | 'agents' | 'preview';

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'general', label: 'General', icon: Settings },
  { id: 'network', label: 'Network', icon: Network },
  { id: 'disk', label: 'Disk', icon: HardDrive },
  { id: 'packages', label: 'Packages', icon: Package },
  { id: 'commands', label: 'Commands', icon: Terminal },
  { id: 'agents', label: 'Agents', icon: Shield },
  { id: 'preview', label: 'Preview', icon: Code },
];

const newCommand = (stage: CommandStage = 'post-install', type: CommandType = 'bash'): Command => ({
  id: generateId('cmd'),
  name: '',
  description: '',
  type,
  stage,
  runAs: 'root',
  content: type === 'bash' ? '#!/bin/bash\n' : type === 'python' ? '#!/usr/bin/env python3\n' : '',
  order: 0,
  enabled: true,
});

const newAgent = (): Agent => ({
  id: generateId('agent'),
  name: '',
  type: 'custom',
  enabled: true,
  version: '',
  serverUrl: '',
  config: '#!/bin/bash\n',
});

function generatePreview(cfg: DeploymentConfig, family: string): string {
  if (family === 'windows') return generateAutounattend(cfg);
  if (family === 'rhel') return generateKickstart(cfg);
  return generatePreseed(cfg);
}

export default function ConfigurationEditor() {
  const { osId, configId } = useParams<{ osId: string; configId: string }>();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const isNew = configId === 'new';

  const profile = useAppSelector(s => s.osProfiles.profiles.find(p => p.id === osId));
  const existingConfig = useAppSelector(s => s.configurations.configs.find(c => c.id === configId));

  const defaultConfigType: ConfigType =
    profile?.family === 'rhel' ? 'kickstart'
    : profile?.family === 'windows' ? 'autounattend'
    : 'preseed';

  const allPackageFiles = useAppSelector(s => s.packageFiles.files);

  const [tab, setTab] = useState<TabId>('general');
  const [saved, setSaved] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [newPackage, setNewPackage] = useState('');
  const [validationOpen, setValidationOpen] = useState(false);
  const [validationChecks, setValidationChecks] = useState<ValidationCheck[]>([]);
  const [pkgUploadDrag, setPkgUploadDrag] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importJsonRef = useRef<HTMLInputElement>(null);
  const [cfg, setCfg] = useState<DeploymentConfig>(() => {
    // Guard: packageFiles was added later — fall back for any persisted configs missing it
    if (!isNew && existingConfig) return { ...existingConfig, packageFiles: existingConfig.packageFiles ?? [] };
    return {
      id: generateId('cfg'),
      osProfileId: osId || '',
      name: '',
      description: '',
      isDefault: false,
      configType: defaultConfigType,
      network: {
        mode: 'dhcp',
        hostnameTemplate: 'server-{{index}}',
        domain: 'local',
        dnsServers: ['8.8.8.8', '8.8.4.4'],
        ntpServers: ['pool.ntp.org'],
      },
      partitions: {
        scheme: 'lvm',
        bootDisk: profile?.family === 'windows' ? 'disk 0' : '/dev/sda',
        efiSize: '512M',
        bootSize: '1G',
        swapSize: '4G',
        rootSize: '100%FREE',
        useEFI: true,
      },
      locale: profile?.family === 'windows' ? 'en-US' : 'en_US.UTF-8',
      timezone: 'UTC',
      keyboard: profile?.family === 'windows' ? '0409:00000409' : 'us',
      rootPassword: '',
      adminUser: profile?.family === 'windows' ? 'Administrator' : 'deploy',
      adminPassword: '',
      packages: [],
      packageGroups: [],
      packageFiles: [],
      commands: [],
      agents: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  });

  // Unsaved changes blocker
  const blocker = useBlocker(isDirty && !saved);

  const handleSave = () => {
    const now = new Date().toISOString();
    const toSave = { ...cfg, updatedAt: now };
    if (isNew) {
      dispatch(addConfig(toSave));
      toast.success(`Configuration "${cfg.name}" created`);
    } else {
      dispatch(updateConfig(toSave));
      toast.success(`Configuration "${cfg.name}" saved`);
    }
    setSaved(true);
    setIsDirty(false);
    setTimeout(() => setSaved(false), 2000);
    if (isNew) navigate(`/os-profiles/${osId}`);
  };

  const handleExportJson = () => {
    // Strip passwords before export — they must never leave the browser in plaintext.
    const safe = { ...cfg, rootPassword: '', adminPassword: '' };
    const blob = new Blob([JSON.stringify(safe, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${cfg.name || 'config'}.pxe.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Configuration exported as JSON (passwords excluded)');
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        // Basic shape validation — must be an object with at minimum a name string.
        if (typeof parsed !== 'object' || parsed === null || typeof parsed.name !== 'string') {
          toast.error('Invalid config file — missing required fields');
          return;
        }
        const imported = parsed as DeploymentConfig;
        // Keep current osProfileId / id; strip any passwords from imported file.
        setCfg({
          ...imported,
          id: cfg.id,
          osProfileId: osId || cfg.osProfileId,
          rootPassword: '',
          adminPassword: '',
        });
        setIsDirty(true);
        toast.success(`Imported "${imported.name}" — review and save`);
      } catch {
        toast.error('Invalid JSON file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Dirty-tracking wrapper
  const updateCfg: typeof setCfg = (updater) => {
    setCfg(updater);
    setIsDirty(true);
  };

  const addCommand = (stage: CommandStage) => {
    const cmd = newCommand(stage, profile?.family === 'windows' ? 'powershell' : 'bash');
    updateCfg(c => ({ ...c, commands: [...c.commands, { ...cmd, order: c.commands.length + 1 }] }));
  };

  const updateCommand = (id: string, updates: Partial<Command>) => {
    updateCfg(c => ({ ...c, commands: c.commands.map(cmd => cmd.id === id ? { ...cmd, ...updates } : cmd) }));
  };

  const removeCommand = (id: string) => {
    updateCfg(c => ({ ...c, commands: c.commands.filter(cmd => cmd.id !== id) }));
  };

  const addAgent = () => {
    updateCfg(c => ({ ...c, agents: [...c.agents, newAgent()] }));
  };

  const updateAgent = (id: string, updates: Partial<Agent>) => {
    updateCfg(c => ({ ...c, agents: c.agents.map(a => a.id === id ? { ...a, ...updates } : a) }));
  };

  const removeAgent = (id: string) => {
    updateCfg(c => ({ ...c, agents: c.agents.filter(a => a.id !== id) }));
  };

  const addPackage = () => {
    if (!newPackage.trim()) return;
    const pkgs = newPackage.split(/\s+/).filter(Boolean);
    updateCfg(c => ({ ...c, packages: [...new Set([...c.packages, ...pkgs])] }));
    setNewPackage('');
  };

  const handleValidate = () => {
    if (!profile) return;
    const checks = validateConfig(cfg, profile, allPackageFiles);
    setValidationChecks(checks);
    setValidationOpen(true);
  };

  const handlePackageFiles = async (files: FileList | File[]) => {
    const fileArr = Array.from(files);
    for (const file of fileArr) {
      const format = detectFormat(file.name);
      const osFamily = inferOsFamily(format);
      const pkgFile: PackageFile = {
        id: generateId('pkg'),
        name: file.name.replace(/\.[^.]+$/, ''),
        filename: file.name,
        size: file.size,
        format,
        osFamily,
        description: '',
        uploadedAt: new Date().toISOString(),
      };
      await saveBlob(pkgFile.id, file);
      dispatch(addPackageFile(pkgFile));
      updateCfg(c => ({ ...c, packageFiles: [...c.packageFiles, pkgFile.id] }));
    }
  };

  const handleRemovePackageFile = async (pkgId: string) => {
    await deleteBlob(pkgId);
    dispatch(deletePackageFile(pkgId));
    updateCfg(c => ({ ...c, packageFiles: c.packageFiles.filter(id => id !== pkgId) }));
  };

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-slate-400">OS profile not found.</p>
        <Button variant="secondary" icon={<ArrowLeft size={16} />} onClick={() => navigate('/os-profiles')}>Back</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link to="/os-profiles" className="hover:text-slate-300">OS Profiles</Link>
        <ChevronRight size={14} />
        <Link to={`/os-profiles/${osId}`} className="hover:text-slate-300">{profile.name} {profile.version}</Link>
        <ChevronRight size={14} />
        <span className="text-slate-300">{isNew ? 'New Configuration' : cfg.name || 'Edit Configuration'}</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/os-profiles/${osId}`)} className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/[0.06] transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-3">
            <OSIcon icon={profile.icon} color={profile.color} size="md" />
            <div>
              <h1 className="text-base font-semibold text-slate-100">
                {isNew ? 'New Configuration' : cfg.name || 'Edit Configuration'}
              </h1>
              <p className="text-xs text-slate-500">{profile.name} {profile.version}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Hidden JSON import input */}
          <input ref={importJsonRef} type="file" accept=".json" className="hidden" onChange={handleImportJson} />
          <Button
            icon={<FileJson size={15} />}
            variant="secondary"
            onClick={() => importJsonRef.current?.click()}
            title="Import from JSON"
          >
            Import
          </Button>
          <Button
            icon={<Download size={15} />}
            variant="secondary"
            onClick={handleExportJson}
            disabled={!cfg.name}
            title="Export as JSON"
          >
            Export
          </Button>
          <Button
            icon={<FlaskConical size={15} />}
            variant="secondary"
            onClick={handleValidate}
          >
            Validate
          </Button>
          <Button
            icon={saved ? <Check size={16} /> : <Save size={16} />}
            variant={saved ? 'success' : 'primary'}
            onClick={handleSave}
            disabled={!cfg.name}
          >
            {saved ? 'Saved!' : isNew ? 'Create Configuration' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* Tab nav */}
      <div className="flex gap-0.5 bg-white/[0.03] p-1 rounded-xl border border-white/[0.06] flex-wrap">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              tab === id
                ? 'bg-white/[0.07] text-slate-100 shadow-sm border border-white/[0.08]'
                : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.03]'
            }`}
          >
            <Icon size={13} />
            {label}
            {id === 'commands' && cfg.commands.length > 0 && (
              <span className="bg-blue-900/50 border border-blue-800/40 text-blue-300 text-xs px-1 rounded">{cfg.commands.length}</span>
            )}
            {id === 'agents' && cfg.agents.length > 0 && (
              <span className="bg-blue-900/50 border border-blue-800/40 text-blue-300 text-xs px-1 rounded">{cfg.agents.length}</span>
            )}
            {id === 'packages' && (cfg.packages.length + cfg.packageFiles.length) > 0 && (
              <span className="bg-blue-900/50 border border-blue-800/40 text-blue-300 text-xs px-1 rounded">{cfg.packages.length + cfg.packageFiles.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="min-h-96">
        {/* GENERAL */}
        {tab === 'general' && (
          <Card>
            <CardBody className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Configuration Name *</label>
                  <input
                    value={cfg.name}
                    onChange={e => updateCfg(c => ({ ...c, name: e.target.value }))}
                    placeholder="Web Server, Database, Minimal..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Description</label>
                  <textarea
                    value={cfg.description}
                    onChange={e => updateCfg(c => ({ ...c, description: e.target.value }))}
                    rows={2}
                    placeholder="Brief description of this configuration..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Config Type</label>
                  <select
                    value={cfg.configType}
                    onChange={e => updateCfg(c => ({ ...c, configType: e.target.value as ConfigType }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  >
                    <option value="preseed">Preseed (Debian/Ubuntu)</option>
                    <option value="kickstart">Kickstart (RHEL/Rocky)</option>
                    <option value="autounattend">AutoUnattend (Windows)</option>
                    <option value="cloud-init">Cloud-Init</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Locale</label>
                  <input
                    value={cfg.locale}
                    onChange={e => updateCfg(c => ({ ...c, locale: e.target.value }))}
                    placeholder="en_US.UTF-8"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Timezone</label>
                  <input
                    value={cfg.timezone}
                    onChange={e => updateCfg(c => ({ ...c, timezone: e.target.value }))}
                    placeholder="UTC"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Keyboard Layout</label>
                  <input
                    value={cfg.keyboard}
                    onChange={e => updateCfg(c => ({ ...c, keyboard: e.target.value }))}
                    placeholder="us"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Admin Username</label>
                  <input
                    value={cfg.adminUser}
                    onChange={e => updateCfg(c => ({ ...c, adminUser: e.target.value }))}
                    placeholder="deploy"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cfg.isDefault}
                      onChange={e => updateCfg(c => ({ ...c, isDefault: e.target.checked }))}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5 bg-slate-700 rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-0.5 after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5"></div>
                  </label>
                  <span className="text-sm text-slate-300">Set as default configuration</span>
                </div>
              </div>
            </CardBody>
          </Card>
        )}

        {/* NETWORK */}
        {tab === 'network' && (
          <Card>
            <CardBody className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">Network Mode</label>
                <div className="flex gap-3">
                  {(['dhcp', 'static'] as const).map(mode => (
                    <label key={mode} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border cursor-pointer transition-all ${
                      cfg.network.mode === mode
                        ? 'border-blue-500 bg-blue-900/20 text-blue-300'
                        : 'border-white/[0.07] bg-white/[0.03] text-slate-400 hover:border-white/[0.12]'
                    }`}>
                      <input
                        type="radio"
                        name="networkMode"
                        value={mode}
                        checked={cfg.network.mode === mode}
                        onChange={() => updateCfg(c => ({ ...c, network: { ...c.network, mode } }))}
                        className="sr-only"
                      />
                      <span className="capitalize font-medium text-sm">{mode === 'dhcp' ? 'DHCP (Dynamic)' : 'Static IP'}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Hostname Template</label>
                  <input
                    value={cfg.network.hostnameTemplate}
                    onChange={e => updateCfg(c => ({ ...c, network: { ...c.network, hostnameTemplate: e.target.value } }))}
                    placeholder="server-{{index}}"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                  <p className="text-xs text-slate-600 mt-1">Use {'{{'} index {'}}'}  for auto-numbering</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Domain</label>
                  <input
                    value={cfg.network.domain}
                    onChange={e => updateCfg(c => ({ ...c, network: { ...c.network, domain: e.target.value } }))}
                    placeholder="example.com"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
              </div>

              {cfg.network.mode === 'static' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-white/[0.02] rounded-xl border border-white/[0.06]">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">IP Address</label>
                    <input
                      value={cfg.network.ipAddress || ''}
                      onChange={e => updateCfg(c => ({ ...c, network: { ...c.network, ipAddress: e.target.value } }))}
                      placeholder="10.0.0.100"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Subnet Mask</label>
                    <input
                      value={cfg.network.subnet || ''}
                      onChange={e => updateCfg(c => ({ ...c, network: { ...c.network, subnet: e.target.value } }))}
                      placeholder="255.255.255.0"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Gateway</label>
                    <input
                      value={cfg.network.gateway || ''}
                      onChange={e => updateCfg(c => ({ ...c, network: { ...c.network, gateway: e.target.value } }))}
                      placeholder="10.0.0.1"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">DNS Servers <span className="text-slate-600">(one per line)</span></label>
                  <textarea
                    value={cfg.network.dnsServers.join('\n')}
                    onChange={e => updateCfg(c => ({ ...c, network: { ...c.network, dnsServers: e.target.value.split('\n').filter(Boolean) } }))}
                    rows={3}
                    placeholder="8.8.8.8&#10;8.8.4.4"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">NTP Servers <span className="text-slate-600">(one per line)</span></label>
                  <textarea
                    value={cfg.network.ntpServers.join('\n')}
                    onChange={e => updateCfg(c => ({ ...c, network: { ...c.network, ntpServers: e.target.value.split('\n').filter(Boolean) } }))}
                    rows={3}
                    placeholder="pool.ntp.org"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                  />
                </div>
              </div>
            </CardBody>
          </Card>
        )}

        {/* DISK */}
        {tab === 'disk' && (
          <Card>
            <CardBody className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">Partition Scheme</label>
                <div className="flex gap-3 flex-wrap">
                  {(['auto', 'lvm', 'custom'] as const).map(scheme => (
                    <label key={scheme} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border cursor-pointer transition-all ${
                      cfg.partitions.scheme === scheme
                        ? 'border-blue-500 bg-blue-900/20 text-blue-300'
                        : 'border-white/[0.07] bg-white/[0.03] text-slate-400 hover:border-white/[0.12]'
                    }`}>
                      <input type="radio" name="scheme" value={scheme} checked={cfg.partitions.scheme === scheme}
                        onChange={() => updateCfg(c => ({ ...c, partitions: { ...c.partitions, scheme } }))} className="sr-only" />
                      <span className="font-medium text-sm capitalize">{scheme === 'auto' ? 'Auto' : scheme === 'lvm' ? 'LVM' : 'Custom'}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Boot Disk</label>
                  <input
                    value={cfg.partitions.bootDisk}
                    onChange={e => updateCfg(c => ({ ...c, partitions: { ...c.partitions, bootDisk: e.target.value } }))}
                    placeholder="/dev/sda"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
                <div className="flex items-center gap-3 pt-5">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={cfg.partitions.useEFI}
                      onChange={e => updateCfg(c => ({ ...c, partitions: { ...c.partitions, useEFI: e.target.checked } }))}
                      className="sr-only peer" />
                    <div className="w-10 h-5 bg-slate-700 rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-0.5 after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5"></div>
                  </label>
                  <span className="text-sm text-slate-300">Use UEFI / EFI partition</span>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {cfg.partitions.useEFI && (
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">EFI Size</label>
                    <input value={cfg.partitions.efiSize}
                      onChange={e => updateCfg(c => ({ ...c, partitions: { ...c.partitions, efiSize: e.target.value } }))}
                      placeholder="512M"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">/boot Size</label>
                  <input value={cfg.partitions.bootSize}
                    onChange={e => updateCfg(c => ({ ...c, partitions: { ...c.partitions, bootSize: e.target.value } }))}
                    placeholder="1G"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Swap Size</label>
                  <input value={cfg.partitions.swapSize}
                    onChange={e => updateCfg(c => ({ ...c, partitions: { ...c.partitions, swapSize: e.target.value } }))}
                    placeholder="4G"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Root Size</label>
                  <input value={cfg.partitions.rootSize}
                    onChange={e => updateCfg(c => ({ ...c, partitions: { ...c.partitions, rootSize: e.target.value } }))}
                    placeholder="100%FREE"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
              </div>

              {cfg.partitions.scheme === 'custom' && (
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Custom Layout <span className="text-slate-600">(preseed/kickstart format)</span></label>
                  <textarea
                    value={cfg.partitions.customLayout || ''}
                    onChange={e => updateCfg(c => ({ ...c, partitions: { ...c.partitions, customLayout: e.target.value } }))}
                    rows={8}
                    placeholder="# Enter custom partition layout here..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 code-textarea"
                  />
                </div>
              )}
            </CardBody>
          </Card>
        )}

        {/* PACKAGES */}
        {tab === 'packages' && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <h3 className="text-sm font-semibold text-slate-200">Packages</h3>
              </CardHeader>
              <CardBody className="space-y-3">
                <div className="flex gap-2">
                  <input
                    value={newPackage}
                    onChange={e => setNewPackage(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addPackage()}
                    placeholder="nginx curl wget vim ..."
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                  <Button size="sm" icon={<Plus size={14} />} onClick={addPackage}>Add</Button>
                </div>
                {cfg.packages.length > 0 ? (
                  <div className="flex flex-wrap gap-2 p-3 bg-white/[0.02] rounded-xl border border-white/[0.06] min-h-16">
                    {cfg.packages.map(pkg => (
                      <span key={pkg} className="inline-flex items-center gap-1 bg-white/[0.06] text-slate-200 text-xs px-2 py-1 rounded-lg font-mono border border-white/[0.08]">
                        {pkg}
                        <button onClick={() => updateCfg(c => ({ ...c, packages: c.packages.filter(p => p !== pkg) }))}
                          className="text-slate-500 hover:text-red-400 transition-colors ml-0.5">×</button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-600 italic p-3">No packages added yet. Type package names above and press Enter or click Add.</p>
                )}
              </CardBody>
            </Card>

            {profile.family === 'rhel' && (
              <Card>
                <CardHeader>
                  <h3 className="text-sm font-semibold text-slate-200">Package Groups</h3>
                </CardHeader>
                <CardBody className="space-y-3">
                  <textarea
                    value={cfg.packageGroups.join('\n')}
                    onChange={e => updateCfg(c => ({ ...c, packageGroups: e.target.value.split('\n').filter(Boolean) }))}
                    rows={4}
                    placeholder="@^Minimal Install&#10;@base&#10;@development"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                  <p className="text-xs text-slate-500">One group per line. Use @ prefix for groups (e.g., @^Minimal Install)</p>
                </CardBody>
              </Card>
            )}

            {/* ── Package File Uploads ──────────────────────────────── */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                      <FileArchive size={14} className="text-slate-400" />
                      Offline Package Files
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Upload .deb / .rpm / .msi / .exe or other package files to deploy without internet access.
                    </p>
                  </div>
                  <Button
                    size="xs"
                    variant="secondary"
                    icon={<Upload size={12} />}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Upload
                  </Button>
                </div>
              </CardHeader>
              <CardBody className="space-y-3">
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  accept=".deb,.rpm,.msi,.exe,.tar.gz,.tgz,.zip,.whl"
                  onChange={e => e.target.files && handlePackageFiles(e.target.files)}
                />

                {/* Drop zone */}
                <div
                  onDragOver={e => { e.preventDefault(); setPkgUploadDrag(true); }}
                  onDragLeave={() => setPkgUploadDrag(false)}
                  onDrop={e => {
                    e.preventDefault();
                    setPkgUploadDrag(false);
                    handlePackageFiles(e.dataTransfer.files);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex flex-col items-center justify-center gap-2 p-6 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
                    pkgUploadDrag
                      ? 'border-blue-500 bg-blue-900/10'
                      : 'border-slate-700 hover:border-slate-500 hover:bg-slate-800/30'
                  }`}
                >
                  <Upload size={20} className={pkgUploadDrag ? 'text-blue-400' : 'text-slate-500'} />
                  <p className="text-xs text-slate-500">
                    Drop package files here or <span className="text-blue-400">click to browse</span>
                  </p>
                  <p className="text-xs text-slate-600">.deb · .rpm · .msi · .exe · .tar.gz · .zip · .whl</p>
                </div>

                {/* Attached files list */}
                {cfg.packageFiles.length > 0 && (
                  <div className="space-y-2 mt-2">
                    {cfg.packageFiles.map(fileId => {
                      const f = allPackageFiles.find(p => p.id === fileId);
                      if (!f) return null;
                      const isCompatible = f.osFamily === null || f.osFamily === profile.family;
                      return (
                        <div
                          key={f.id}
                          className={`flex items-center gap-3 p-2.5 rounded-lg border ${
                            isCompatible
                              ? 'bg-white/[0.03] border-white/[0.06]'
                              : 'bg-red-900/10 border-red-800/40'
                          }`}
                        >
                          <FileArchive size={16} className={isCompatible ? 'text-slate-400' : 'text-red-400'} />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-slate-200 truncate">{f.filename}</div>
                            <div className="text-xs text-slate-500 flex items-center gap-2">
                              <span className="font-mono bg-slate-700/60 px-1 rounded">{f.format}</span>
                              <span>{formatBytes(f.size)}</span>
                              {!isCompatible && (
                                <span className="text-red-400 flex items-center gap-1">
                                  <AlertTriangle size={10} />
                                  Incompatible with {profile.family}
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => downloadBlob(f.id, f.filename)}
                            className="p-1 text-slate-500 hover:text-blue-400 transition-colors"
                            title="Download"
                          >
                            <Download size={14} />
                          </button>
                          <button
                            onClick={() => handleRemovePackageFile(f.id)}
                            className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                            title="Remove"
                          >
                            <XIcon size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardBody>
            </Card>
          </div>
        )}

        {/* COMMANDS */}
        {tab === 'commands' && (
          <div className="space-y-4">
            {(['pre-install', 'post-install', 'first-boot'] as CommandStage[]).map(stage => {
              const stageCmds = cfg.commands.filter(c => c.stage === stage);
              return (
                <Card key={stage}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-200 capitalize">{stage.replace('-', ' ')} Commands</h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {stage === 'pre-install' ? 'Run before OS installation begins'
                           : stage === 'post-install' ? 'Run after OS installation, before first reboot'
                           : 'Run on first system boot after deployment'}
                        </p>
                      </div>
                      <Button size="xs" variant="secondary" icon={<Plus size={12} />} onClick={() => addCommand(stage)}>
                        Add Command
                      </Button>
                    </div>
                  </CardHeader>
                  <CardBody className="space-y-3">
                    {stageCmds.length === 0 ? (
                      <p className="text-xs text-slate-600 italic">No {stage} commands. Click "Add Command" to create one.</p>
                    ) : (
                      stageCmds.map(cmd => (
                        <CommandBlock
                          key={cmd.id}
                          cmd={cmd}
                          isWindows={profile.family === 'windows'}
                          onChange={updates => updateCommand(cmd.id, updates)}
                          onDelete={() => removeCommand(cmd.id)}
                        />
                      ))
                    )}
                  </CardBody>
                </Card>
              );
            })}
          </div>
        )}

        {/* AGENTS */}
        {tab === 'agents' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button icon={<Plus size={16} />} onClick={addAgent}>Add Agent</Button>
            </div>
            {cfg.agents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-3 border-2 border-dashed border-white/[0.08] rounded-xl text-slate-500">
                <Shield size={28} />
                <p className="text-sm">No agents configured</p>
                <p className="text-xs text-center max-w-xs text-slate-600">Add Puppet, Chef, Ansible, Salt or custom agents to be installed during provisioning</p>
              </div>
            ) : (
              cfg.agents.map(agent => (
                <AgentBlock
                  key={agent.id}
                  agent={agent}
                  onChange={updates => updateAgent(agent.id, updates)}
                  onDelete={() => removeAgent(agent.id)}
                />
              ))
            )}
          </div>
        )}

        {/* PREVIEW */}
        {tab === 'preview' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-200">Generated Configuration File</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Preview of the auto-generated {cfg.configType} file</p>
                </div>
                <Badge variant="blue">{cfg.configType}</Badge>
              </div>
            </CardHeader>
            <CardBody className="p-0">
              <pre className="code-textarea text-xs text-slate-300 bg-slate-950/80 p-5 rounded-b-xl overflow-auto max-h-[600px] leading-relaxed">
                {generatePreview(cfg, profile.family)}
              </pre>
            </CardBody>
          </Card>
        )}
      </div>

      <ValidationReport
        open={validationOpen}
        onClose={() => setValidationOpen(false)}
        checks={validationChecks}
        configName={cfg.name || 'Untitled Configuration'}
        osName={`${profile.name} ${profile.version}`}
      />

      {/* Unsaved changes navigation blocker */}
      {blocker.state === 'blocked' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6 space-y-4"
            style={{ background: '#0f0f1e', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 24px 48px rgba(0,0,0,0.7)' }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={18} className="text-yellow-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Unsaved changes</h3>
                <p className="text-xs text-slate-400 mt-0.5">You have unsaved changes to this configuration.</p>
              </div>
            </div>
            <p className="text-xs text-slate-500">Leaving this page will discard all unsaved changes. Do you want to continue?</p>
            <div className="flex justify-end gap-3 pt-1">
              <button
                onClick={() => blocker.reset()}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 transition-colors"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                Stay & Save
              </button>
              <button
                onClick={() => blocker.proceed()}
                className="px-4 py-2 rounded-lg text-sm font-medium text-red-300 transition-colors"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}
              >
                Discard & Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Sub-components ----

function CommandBlock({ cmd, isWindows, onChange, onDelete }: {
  cmd: Command;
  isWindows: boolean;
  onChange: (u: Partial<Command>) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(!cmd.name);

  return (
    <div className={`rounded-xl border ${cmd.enabled ? 'border-white/[0.07]' : 'border-white/[0.04] opacity-60'} bg-white/[0.025]`}>
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => setExpanded(e => !e)}>
        <GripVertical size={14} className="text-slate-600 cursor-grab" />
        <label className="relative inline-flex items-center cursor-pointer" onClick={e => e.stopPropagation()}>
          <input type="checkbox" checked={cmd.enabled}
            onChange={e => onChange({ enabled: e.target.checked })} className="sr-only peer" />
          <div className="w-8 h-4 bg-slate-700 rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-0.5 after:start-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-4"></div>
        </label>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-slate-200 truncate">{cmd.name || <span className="text-slate-500 italic">Unnamed command</span>}</span>
          {cmd.description && <span className="text-xs text-slate-500 ml-2 hidden sm:inline">{cmd.description}</span>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <code className="text-xs bg-white/[0.05] text-slate-400 px-1.5 py-0.5 rounded-md">{cmd.type}</code>
          <code className="text-xs bg-white/[0.05] text-slate-400 px-1.5 py-0.5 rounded-md">{cmd.runAs}</code>
          <button onClick={e => { e.stopPropagation(); onDelete(); }}
            className="p-1 text-slate-600 hover:text-red-400 transition-colors">
            <Trash2 size={13} />
          </button>
          {expanded ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/[0.06]">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Name</label>
              <input value={cmd.name} onChange={e => onChange({ name: e.target.value })}
                placeholder="Command name"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500/50" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Type</label>
              <select value={cmd.type} onChange={e => onChange({ type: e.target.value as CommandType })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500/50">
                {!isWindows && <option value="bash">Bash</option>}
                {!isWindows && <option value="python">Python</option>}
                {isWindows && <option value="powershell">PowerShell</option>}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Run As</label>
              <input value={cmd.runAs} onChange={e => onChange({ runAs: e.target.value })}
                placeholder="root"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 font-mono placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500/50" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Description</label>
            <input value={cmd.description} onChange={e => onChange({ description: e.target.value })}
              placeholder="What does this command do?"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500/50" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Script Content</label>
            <textarea
              value={cmd.content}
              onChange={e => onChange({ content: e.target.value })}
              rows={8}
              spellCheck={false}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 code-textarea focus:outline-none focus:ring-1 focus:ring-blue-500/50"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function AgentBlock({ agent, onChange, onDelete }: {
  agent: Agent;
  onChange: (u: Partial<Agent>) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(!agent.name);

  return (
    <div className={`rounded-xl border ${agent.enabled ? 'border-white/[0.07]' : 'border-white/[0.04] opacity-60'} bg-white/[0.025]`}>
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => setExpanded(e => !e)}>
        <label className="relative inline-flex items-center cursor-pointer" onClick={e => e.stopPropagation()}>
          <input type="checkbox" checked={agent.enabled}
            onChange={e => onChange({ enabled: e.target.checked })} className="sr-only peer" />
          <div className="w-8 h-4 bg-slate-700 rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-0.5 after:start-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-4"></div>
        </label>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-slate-200">{agent.name || <span className="text-slate-500 italic">Unnamed agent</span>}</span>
          {agent.serverUrl && <span className="text-xs text-slate-500 ml-2">{agent.serverUrl}</span>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <code className="text-xs bg-white/[0.05] text-slate-400 px-1.5 py-0.5 rounded-md">{agent.type}</code>
          <button onClick={e => { e.stopPropagation(); onDelete(); }}
            className="p-1 text-slate-600 hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
          {expanded ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/[0.06] pt-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Name</label>
              <input value={agent.name} onChange={e => onChange({ name: e.target.value })}
                placeholder="Puppet Agent"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500/50" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Type</label>
              <select value={agent.type} onChange={e => onChange({ type: e.target.value as AgentType })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500/50">
                <option value="puppet">Puppet</option>
                <option value="chef">Chef</option>
                <option value="ansible">Ansible</option>
                <option value="salt">Salt</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Version</label>
              <input value={agent.version} onChange={e => onChange({ version: e.target.value })}
                placeholder="latest"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 font-mono placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500/50" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Server URL <span className="text-slate-600">(optional)</span></label>
            <input value={agent.serverUrl} onChange={e => onChange({ serverUrl: e.target.value })}
              placeholder="https://puppet.example.com"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 font-mono placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500/50" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Install Script</label>
            <textarea value={agent.config} onChange={e => onChange({ config: e.target.value })}
              rows={6} spellCheck={false}
              placeholder="#!/bin/bash&#10;# Install agent..."
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 code-textarea focus:outline-none focus:ring-1 focus:ring-blue-500/50" />
          </div>
        </div>
      )}
    </div>
  );
}
