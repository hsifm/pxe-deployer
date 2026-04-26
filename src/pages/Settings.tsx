import React, { useState } from 'react';
import toast from 'react-hot-toast';
import {
  Save, Server, Network, HardDrive, Globe, Check, Info, Zap, Loader,
  CheckCircle, XCircle,
} from 'lucide-react';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import { updateSettings } from '../store/slices/settingsSlice';
import Card, { CardHeader, CardBody } from '../components/shared/Card';
import Button from '../components/shared/Button';
import { Input, Select } from '../components/shared/FormField';

export default function Settings() {
  const dispatch = useAppDispatch();
  const settings = useAppSelector(s => s.settings);
  const [form, setForm] = useState({ ...settings, apiEndpoint: settings.apiEndpoint ?? 'http://localhost:3001' });
  const [saved, setSaved] = useState(false);
  const [apiStatus, setApiStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');

  const testApiConnection = async () => {
    setApiStatus('testing');
    try {
      const res = await fetch(`${form.apiEndpoint.replace(/\/$/, '')}/api/health`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        setApiStatus('ok');
        toast.success('Backend API connected');
      } else {
        setApiStatus('error');
        toast.error(`API returned ${res.status}`);
      }
    } catch {
      setApiStatus('error');
      toast.error('Could not reach backend API');
    }
  };

  const handleSave = () => {
    dispatch(updateSettings(form));
    setSaved(true);
    toast.success('Settings saved');
    setTimeout(() => setSaved(false), 2000);
  };

  const f = <K extends keyof typeof form>(key: K) => ({
    value: String(form[key]),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(prev => ({
        ...prev,
        [key]: (typeof form[key] === 'number') ? +e.target.value : e.target.value,
      })),
  });

  return (
    <div className="space-y-6 max-w-4xl">
      {/* TFTP Server */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <Server size={14} className="text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-200">TFTP Server</h3>
              <p className="text-xs text-slate-500 mt-0.5">Trivial File Transfer Protocol server for PXE boot files</p>
            </div>
          </div>
        </CardHeader>
        <CardBody className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="TFTP Server Address" placeholder="10.0.0.1" mono {...f('tftpServer')} />
          <Input label="TFTP Root Directory" placeholder="/srv/tftp" mono
            hint="Root directory where PXE boot files are stored" {...f('tftpRoot')} />
        </CardBody>
      </Card>

      {/* DHCP Server */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Network size={14} className="text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-200">DHCP Server</h3>
              <p className="text-xs text-slate-500 mt-0.5">Dynamic Host Configuration Protocol for IP assignment and PXE boot options</p>
            </div>
          </div>
        </CardHeader>
        <CardBody className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="DHCP Server Address" placeholder="10.0.0.1" mono {...f('dhcpServer')} />
          <Input label="DHCP Interface" placeholder="eth0" mono
            hint="Network interface DHCP listens on" {...f('dhcpInterface')} />
        </CardBody>
      </Card>

      {/* File Server */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
              <HardDrive size={14} className="text-purple-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-200">File Server</h3>
              <p className="text-xs text-slate-500 mt-0.5">Server for OS images, preseed/kickstart files, and installation media</p>
            </div>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="File Server Address" placeholder="10.0.0.1" mono {...f('fileServer')} />
            <Select
              label="Server Type"
              value={form.fileServerType}
              onChange={e => setForm(prev => ({ ...prev, fileServerType: e.target.value as 'http' | 'nfs' | 'smb' }))}
            >
              <option value="http">HTTP / HTTPS</option>
              <option value="nfs">NFS</option>
              <option value="smb">SMB / CIFS (Windows)</option>
            </Select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {form.fileServerType === 'nfs' && (
              <Input label="NFS Root Path" placeholder="/srv/nfs" mono {...f('nfsRoot')} />
            )}
            {form.fileServerType === 'http' && (
              <Input label="HTTP Port" type="number" placeholder="8080"
                hint="Port for HTTP file server (default: 8080)" {...f('httpPort')} />
            )}
          </div>
        </CardBody>
      </Card>

      {/* PXE Menu */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
              <Globe size={14} className="text-yellow-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-200">PXE Boot Menu</h3>
              <p className="text-xs text-slate-500 mt-0.5">Boot menu appearance and behavior settings</p>
            </div>
          </div>
        </CardHeader>
        <CardBody className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Menu Timeout (seconds)" type="number"
            hint="Seconds before auto-booting default entry (0 = wait forever)" {...f('pxeMenuTimeout')} />
          <Input label="Menu Background Color" placeholder="#1e293b" mono
            hint="Hex color or path to background image" {...f('pxeMenuBackground')} />
        </CardBody>
      </Card>

      {/* Backend API */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)' }}>
              <Zap size={14} className="text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Backend API</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                pxe-deployer-api — writes GRUB2 configs and installer files to disk for real deployments
              </p>
            </div>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Input
                label="API Endpoint URL"
                placeholder="http://192.168.1.10:3001"
                mono
                hint="The pxe-api container address. Use your staging server's IP in production."
                {...f('apiEndpoint')}
              />
            </div>
            <button
              onClick={testApiConnection}
              disabled={apiStatus === 'testing'}
              className="mb-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex-shrink-0"
              style={{
                background: apiStatus === 'ok'    ? 'rgba(16,185,129,0.12)'
                          : apiStatus === 'error' ? 'rgba(239,68,68,0.12)'
                          : 'rgba(255,255,255,0.06)',
                border: `1px solid ${
                  apiStatus === 'ok'    ? 'rgba(16,185,129,0.3)'
                : apiStatus === 'error' ? 'rgba(239,68,68,0.3)'
                : 'rgba(255,255,255,0.1)'}`,
                color: apiStatus === 'ok'    ? '#10b981'
                     : apiStatus === 'error' ? '#ef4444'
                     : '#94a3b8',
              }}
            >
              {apiStatus === 'testing' ? <Loader size={13} className="animate-spin" />
              : apiStatus === 'ok'     ? <CheckCircle size={13} />
              : apiStatus === 'error'  ? <XCircle size={13} />
              : <Zap size={13} />}
              {apiStatus === 'testing' ? 'Testing…'
              : apiStatus === 'ok'     ? 'Connected'
              : apiStatus === 'error'  ? 'Failed'
              : 'Test Connection'}
            </button>
          </div>

          <div className="flex items-start gap-2.5 rounded-xl px-3 py-2.5"
            style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.12)' }}>
            <Info size={13} className="text-blue-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-slate-400">
              Run <code className="text-blue-300 font-mono">sudo ./deploy/setup-pxe.sh</code> on your staging server first,
              then start <code className="text-blue-300 font-mono">docker compose up -d</code>.
              The Deploy Wizard will use this endpoint to write real PXE boot configs.
            </p>
          </div>
        </CardBody>
      </Card>

      {/* Service info */}
      <Card>
        <CardHeader>
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Info size={15} className="text-slate-400" />
            Infrastructure Overview
          </h3>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { name: 'TFTP / DHCP', addr: `${form.tftpServer} (${form.dhcpInterface})` },
              { name: 'File Server',  addr: `${form.fileServer}:${form.fileServerType === 'http' ? form.httpPort : 2049}` },
              { name: 'Backend API',  addr: form.apiEndpoint || '—' },
            ].map(({ name, addr }) => (
              <div key={name} className="flex items-center gap-3 p-3 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="min-w-0">
                  <div className="text-xs font-medium text-slate-300">{name}</div>
                  <code className="text-xs text-slate-500 truncate block font-mono">{addr}</code>
                </div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* Save button */}
      <div className="flex justify-end pt-2">
        <Button
          icon={saved ? <Check size={16} /> : <Save size={16} />}
          variant={saved ? 'success' : 'primary'}
          onClick={handleSave}
          size="lg"
        >
          {saved ? 'Settings Saved!' : 'Save Settings'}
        </Button>
      </div>
    </div>
  );
}
