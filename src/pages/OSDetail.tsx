import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Plus, Star, Trash2, Edit3, Server,
  Terminal, Shield, HardDrive, Network, Package,
  ChevronRight, Copy, MoreVertical, CheckCircle,
} from 'lucide-react';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import { deleteProfile, updateProfile } from '../store/slices/osProfilesSlice';
import { addConfig, deleteConfig, setDefault } from '../store/slices/configurationsSlice';
import Card, { CardBody, CardHeader } from '../components/shared/Card';
import Button from '../components/shared/Button';
import Badge from '../components/shared/Badge';
import OSIcon from '../components/shared/OSIcon';
import StatusBadge from '../components/shared/StatusBadge';
import { ConfirmDialog } from '../components/shared/Modal';
import { formatDate, generateId } from '../lib/utils';
import { ConfigType, OSFamily } from '../types';

const configTypeLabels: Record<ConfigType, string> = {
  preseed: 'Preseed',
  kickstart: 'Kickstart',
  autounattend: 'AutoUnattend',
  'cloud-init': 'Cloud-Init',
};

const configTypeBadge: Record<ConfigType, 'blue' | 'green' | 'purple' | 'yellow'> = {
  preseed: 'blue',
  kickstart: 'green',
  autounattend: 'purple',
  'cloud-init': 'yellow',
};

export default function OSDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const profile = useAppSelector(s => s.osProfiles.profiles.find(p => p.id === id));
  const configurations = useAppSelector(s => s.configurations.configs.filter(c => c.osProfileId === id));
  const servers = useAppSelector(s => s.servers.servers.filter(s => s.osProfileId === id));

  const [tab, setTab] = useState<'configs' | 'servers'>('configs');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteOsOpen, setDeleteOsOpen] = useState(false);

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-slate-400">OS profile not found.</p>
        <Button variant="secondary" icon={<ArrowLeft size={16} />} onClick={() => navigate('/os-profiles')}>
          Back to OS Profiles
        </Button>
      </div>
    );
  }

  const handleDeleteConfig = (configId: string) => {
    const name = configurations.find(c => c.id === configId)?.name;
    dispatch(deleteConfig(configId));
    setDeleteId(null);
    toast.success(`Configuration "${name}" deleted`);
  };

  const handleDeleteOS = () => {
    dispatch(deleteProfile(profile.id));
    navigate('/os-profiles');
    toast.success(`OS profile "${profile.name} ${profile.version}" deleted`);
  };

  const handleSetDefault = (configId: string) => {
    const name = configurations.find(c => c.id === configId)?.name;
    dispatch(setDefault({ configId, osProfileId: profile.id }));
    toast.success(`"${name}" set as default configuration`);
  };

  const handleCloneConfig = (configId: string) => {
    const source = configurations.find(c => c.id === configId);
    if (!source) return;
    const now = new Date().toISOString();
    const clone = {
      ...source,
      id: generateId('cfg'),
      name: `${source.name} (copy)`,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    };
    dispatch(addConfig(clone));
    toast.success(`"${clone.name}" created`);
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link to="/os-profiles" className="hover:text-slate-300 transition-colors">OS Profiles</Link>
        <ChevronRight size={14} />
        <span className="text-slate-300">{profile.name} {profile.version}</span>
      </div>

      {/* Profile header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start">
        <div className="flex items-start gap-5 flex-1">
          <OSIcon icon={profile.icon} color={profile.color} size="xl" />
          <div>
            <h1 className="text-2xl font-bold text-slate-100">
              {profile.name} <span style={{ color: profile.color }}>{profile.version}</span>
            </h1>
            {profile.codename && (
              <p className="text-slate-400 text-sm mt-0.5">{profile.codename}</p>
            )}
            <p className="text-slate-400 text-sm mt-2 max-w-xl">{profile.description}</p>
            <div className="flex flex-wrap gap-2 mt-3">
              <Badge variant="blue">{profile.arch}</Badge>
              <Badge variant={profile.family === 'debian' ? 'orange' : profile.family === 'rhel' ? 'green' : 'blue'}>
                {profile.family === 'debian' ? 'Debian-based' : profile.family === 'rhel' ? 'RHEL-based' : 'Windows'}
              </Badge>
              {profile.isoPath && (
                <code className="text-xs bg-white/[0.04] text-slate-400 px-2 py-0.5 rounded-lg border border-white/[0.07]">
                  {profile.isoPath.split('/').pop()}
                </code>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button
            variant="primary"
            icon={<Plus size={16} />}
            onClick={() => navigate(`/os-profiles/${id}/config/new`)}
          >
            New Configuration
          </Button>
          <Button
            variant="danger"
            icon={<Trash2 size={16} />}
            onClick={() => setDeleteOsOpen(true)}
          >
            Delete
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Configurations', value: configurations.length, icon: HardDrive, color: 'text-blue-400' },
          { label: 'Servers', value: servers.length, icon: Server, color: 'text-emerald-400' },
          { label: 'Commands', value: configurations.reduce((acc, c) => acc + c.commands.length, 0), icon: Terminal, color: 'text-purple-400' },
          { label: 'Agents', value: configurations.reduce((acc, c) => acc + c.agents.filter(a => a.enabled).length, 0), icon: Shield, color: 'text-orange-400' },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardBody className="flex items-center gap-3">
              <Icon size={18} className={color} />
              <div>
                <div className="text-lg font-bold text-slate-100">{value}</div>
                <div className="text-xs text-slate-400">{label}</div>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="border-b border-white/[0.06]">
        <div className="flex gap-1">
          {(['configs', 'servers'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize ${
                tab === t
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              {t === 'configs' ? `Configurations (${configurations.length})` : `Servers (${servers.length})`}
            </button>
          ))}
        </div>
      </div>

      {tab === 'configs' && (
        <div className="space-y-3">
          {configurations.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40 gap-3 border-2 border-dashed border-slate-700 rounded-xl text-slate-500">
              <HardDrive size={28} />
              <p className="text-sm">No configurations yet</p>
              <Button
                size="sm"
                icon={<Plus size={14} />}
                onClick={() => navigate(`/os-profiles/${id}/config/new`)}
              >
                Create first configuration
              </Button>
            </div>
          )}

          {configurations.map(config => (
            <Card key={config.id} hover className="group" onClick={() => navigate(`/os-profiles/${id}/config/${config.id}`)}>
              <CardBody className="flex items-center gap-4 p-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-100">{config.name}</span>
                    {config.isDefault && (
                      <span className="inline-flex items-center gap-1 text-xs text-yellow-400 bg-yellow-900/30 border border-yellow-800/40 px-1.5 py-0.5 rounded-md">
                        <Star size={10} />Default
                      </span>
                    )}
                    <Badge variant={configTypeBadge[config.configType]}>{configTypeLabels[config.configType]}</Badge>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">{config.description}</p>
                  <div className="flex flex-wrap gap-3 mt-2 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Network size={11} />{config.network.mode === 'dhcp' ? 'DHCP' : `Static: ${config.network.ipAddress}`}
                    </span>
                    <span className="flex items-center gap-1">
                      <HardDrive size={11} />{config.partitions.scheme.toUpperCase()}
                    </span>
                    <span className="flex items-center gap-1">
                      <Package size={11} />{config.packages.length} packages
                    </span>
                    <span className="flex items-center gap-1">
                      <Terminal size={11} />{config.commands.length} commands
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                  {!config.isDefault && (
                    <button
                      title="Set as default"
                      onClick={() => handleSetDefault(config.id)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-yellow-400 hover:bg-white/[0.06] transition-colors"
                    >
                      <Star size={15} />
                    </button>
                  )}
                  <button
                    title="Duplicate configuration"
                    onClick={() => handleCloneConfig(config.id)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                  >
                    <Copy size={15} />
                  </button>
                  <button
                    title="Edit"
                    onClick={() => navigate(`/os-profiles/${id}/config/${config.id}`)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-white/[0.06] transition-colors"
                  >
                    <Edit3 size={15} />
                  </button>
                  <button
                    title="Delete"
                    onClick={() => setDeleteId(config.id)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-white/[0.06] transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                <ChevronRight size={16} className="text-slate-600 group-hover:text-slate-400 flex-shrink-0" />
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {tab === 'servers' && (
        <Card>
          {servers.length === 0 ? (
            <CardBody className="flex flex-col items-center justify-center h-40 gap-3 text-slate-500">
              <Server size={28} />
              <p className="text-sm">No servers assigned to this OS profile</p>
              <Button size="sm" variant="secondary" onClick={() => navigate('/servers')}>
                Go to Server Inventory
              </Button>
            </CardBody>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase">Hostname</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase">MAC</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase">IP</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase">Config</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase">Status</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase hidden md:table-cell">Last Deployed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {servers.map(server => {
                    const config = configurations.find(c => c.id === server.configurationId);
                    return (
                      <tr key={server.id} className="hover:bg-white/[0.02]">
                        <td className="px-5 py-3 font-medium text-slate-200">{server.hostname}</td>
                        <td className="px-5 py-3">
                          <code className="text-xs text-slate-300 bg-white/[0.05] px-1.5 py-0.5 rounded-md">{server.macAddress}</code>
                        </td>
                        <td className="px-5 py-3 text-slate-400 text-xs">{server.ipAddress || '—'}</td>
                        <td className="px-5 py-3 text-slate-400 text-xs">{config?.name || '—'}</td>
                        <td className="px-5 py-3"><StatusBadge status={server.status} /></td>
                        <td className="px-5 py-3 text-slate-500 text-xs hidden md:table-cell">
                          {formatDate(server.lastDeployedAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Kernel args */}
      <Card>
        <CardHeader>
          <h3 className="text-sm font-semibold text-slate-200">Kernel Arguments</h3>
        </CardHeader>
        <CardBody>
          <div className="flex flex-wrap gap-2">
            {profile.kernelArgs.map(arg => (
              <code key={arg} className="text-xs bg-slate-700/60 text-slate-300 px-2 py-1 rounded border border-slate-600/40">
                {arg}
              </code>
            ))}
            {profile.kernelArgs.length === 0 && (
              <span className="text-xs text-slate-500">No kernel arguments configured</span>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Confirm dialogs */}
      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && handleDeleteConfig(deleteId)}
        title="Delete Configuration"
        description="Are you sure you want to delete this configuration? This action cannot be undone."
        confirmLabel="Delete Configuration"
      />
      <ConfirmDialog
        open={deleteOsOpen}
        onClose={() => setDeleteOsOpen(false)}
        onConfirm={handleDeleteOS}
        title="Delete OS Profile"
        description={`Delete ${profile.name} ${profile.version}? This will also affect any servers assigned to this profile.`}
        confirmLabel="Delete Profile"
      />
    </div>
  );
}
