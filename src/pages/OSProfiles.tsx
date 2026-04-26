import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Plus, ChevronRight, Server, Layers, Search,
} from 'lucide-react';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import { addProfile } from '../store/slices/osProfilesSlice';
import Card, { CardBody } from '../components/shared/Card';
import Button from '../components/shared/Button';
import Badge from '../components/shared/Badge';
import OSIcon from '../components/shared/OSIcon';
import Modal from '../components/shared/Modal';
import { Input, Select, Textarea } from '../components/shared/FormField';
import { OSProfile, OSFamily, OSArch } from '../types';
import { generateId } from '../lib/utils';

const familyLabels: Record<OSFamily, string> = {
  debian: 'Debian/Ubuntu',
  rhel: 'RHEL/Rocky',
  windows: 'Windows',
};

const familyColors: Record<OSFamily, 'blue' | 'green' | 'orange'> = {
  debian: 'orange',
  rhel: 'green',
  windows: 'blue',
};

const defaultNew: Omit<OSProfile, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '',
  version: '',
  codename: '',
  family: 'debian',
  arch: 'x86_64',
  color: '#3b82f6',
  icon: 'custom',
  description: '',
  kernelArgs: [],
  isoPath: '',
};

export default function OSProfiles() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const profiles = useAppSelector(s => s.osProfiles.profiles);
  const configurations = useAppSelector(s => s.configurations.configs);
  const servers = useAppSelector(s => s.servers.servers);

  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ ...defaultNew });

  const filtered = profiles.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.version.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = () => {
    if (!form.name || !form.version) return;
    const now = new Date().toISOString();
    dispatch(addProfile({
      ...form,
      id: generateId('os'),
      icon: form.family === 'debian' ? (form.name.toLowerCase().includes('ubuntu') ? 'ubuntu' : 'debian')
          : form.family === 'rhel' ? 'rocky'
          : 'windows',
      kernelArgs: form.kernelArgs,
      createdAt: now,
      updatedAt: now,
    }));
    setShowCreate(false);
    setForm({ ...defaultNew });
    toast.success(`OS profile "${form.name} ${form.version}" created`);
  };

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search OS profiles…"
            className="w-full rounded-xl pl-9 pr-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 border border-white/[0.07] bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.06)]"
          />
        </div>
        <Button icon={<Plus size={16} />} onClick={() => setShowCreate(true)}>
          Add OS Profile
        </Button>
      </div>

      {/* OS Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {filtered.map(profile => {
          const configCount = configurations.filter(c => c.osProfileId === profile.id).length;
          const serverCount = servers.filter(s => s.osProfileId === profile.id).length;
          const deployingCount = servers.filter(s => s.osProfileId === profile.id && s.status === 'deploying').length;

          return (
            <Card
              key={profile.id}
              hover
              onClick={() => navigate(`/os-profiles/${profile.id}`)}
              className="group"
            >
              <CardBody className="p-5">
                {/* Header */}
                <div className="flex items-start gap-4 mb-4">
                  <OSIcon icon={profile.icon} color={profile.color} size="lg" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base font-semibold text-slate-100">{profile.name}</h2>
                      <Badge variant={familyColors[profile.family]}>
                        {familyLabels[profile.family]}
                      </Badge>
                    </div>
                    <div className="text-sm text-slate-400 mt-0.5">{profile.version}
                      {profile.codename && <span className="text-slate-500"> — {profile.codename}</span>}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">{profile.arch}</div>
                  </div>
                  <ChevronRight size={16} className="text-slate-600 group-hover:text-slate-400 transition-colors flex-shrink-0 mt-1" />
                </div>

                {/* Description */}
                <p className="text-xs text-slate-400 line-clamp-2 mb-4">{profile.description}</p>

                {/* Stats */}
                <div className="flex items-center gap-4 py-3 border-y border-slate-700/40">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Layers size={13} className="text-slate-500" />
                    <span>{configCount} config{configCount !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Server size={13} className="text-slate-500" />
                    <span>{serverCount} server{serverCount !== 1 ? 's' : ''}</span>
                  </div>
                  {deployingCount > 0 && (
                    <div className="flex items-center gap-1.5 text-xs text-blue-400 ml-auto">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 pulse-dot" />
                      {deployingCount} deploying
                    </div>
                  )}
                </div>

                {/* Kernel args */}
                {profile.kernelArgs.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {profile.kernelArgs.slice(0, 4).map(arg => (
                      <code key={arg} className="text-xs bg-slate-700/60 text-slate-400 px-1.5 py-0.5 rounded">
                        {arg}
                      </code>
                    ))}
                    {profile.kernelArgs.length > 4 && (
                      <span className="text-xs text-slate-500">+{profile.kernelArgs.length - 4} more</span>
                    )}
                  </div>
                )}
              </CardBody>
            </Card>
          );
        })}

        {/* Add new card */}
        <Card
          hover
          onClick={() => setShowCreate(true)}
          className="border-dashed border-slate-700 bg-transparent hover:bg-slate-800/30 flex items-center justify-center min-h-48"
        >
          <CardBody className="flex flex-col items-center gap-3 text-center p-8">
            <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center">
              <Plus size={20} className="text-slate-500" />
            </div>
            <div>
              <div className="text-sm font-medium text-slate-400">Add OS Profile</div>
              <div className="text-xs text-slate-600 mt-0.5">Support a new operating system</div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Create Modal */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Add OS Profile"
        subtitle="Define a new operating system for PXE deployment"
        size="lg"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!form.name || !form.version}>Create Profile</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="OS Name *" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ubuntu" />
            <Input label="Version *" value={form.version}
              onChange={e => setForm(f => ({ ...f, version: e.target.value }))} placeholder="22.04 LTS" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Codename" value={form.codename}
              onChange={e => setForm(f => ({ ...f, codename: e.target.value }))} placeholder="Jammy Jellyfish" />
            <Select label="OS Family" value={form.family}
              onChange={e => setForm(f => ({ ...f, family: e.target.value as OSFamily }))}>
              <option value="debian">Debian / Ubuntu</option>
              <option value="rhel">RHEL / Rocky / Alma</option>
              <option value="windows">Windows Server</option>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Architecture" value={form.arch}
              onChange={e => setForm(f => ({ ...f, arch: e.target.value as OSArch }))}>
              <option value="x86_64">x86_64 (AMD64)</option>
              <option value="aarch64">aarch64 (ARM64)</option>
            </Select>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Accent Color</label>
              <div className="flex gap-2">
                <input type="color" value={form.color}
                  onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                  className="h-9 w-12 rounded-xl border border-white/[0.07] bg-white/[0.04] cursor-pointer p-1" />
                <Input value={form.color} mono
                  onChange={e => setForm(f => ({ ...f, color: e.target.value }))} />
              </div>
            </div>
          </div>
          <Input label="ISO / WIM Path" value={form.isoPath} mono
            onChange={e => setForm(f => ({ ...f, isoPath: e.target.value }))}
            placeholder="/srv/pxe/iso/ubuntu-22.04-server.iso" />
          <Textarea label="Description" value={form.description} rows={2}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Brief description of this OS profile…" />
          <Input label="Kernel Arguments (space-separated)" value={form.kernelArgs.join(' ')} mono
            onChange={e => setForm(f => ({ ...f, kernelArgs: e.target.value.split(' ').filter(Boolean) }))}
            placeholder="quiet splash net.ifnames=0" />
        </div>
      </Modal>
    </div>
  );
}
