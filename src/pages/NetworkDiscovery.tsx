import React, { useState, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  Radar, Play, Square, Download, Server, Wifi,
  CheckCircle, AlertCircle, Clock, Plus, RefreshCw,
  ChevronDown, ChevronRight, Network, HardDrive,
  Zap, Info,
} from 'lucide-react';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import { addServer } from '../store/slices/serversSlice';
import Card, { CardHeader, CardBody } from '../components/shared/Card';
import Button from '../components/shared/Button';
import StatusBadge from '../components/shared/StatusBadge';
import { Input, Select } from '../components/shared/FormField';
import { generateId } from '../lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────
interface DiscoveredHost {
  id: string;
  ip: string;
  mac: string;
  hostname: string;
  vendor: string;
  pingMs: number;
  openPorts: number[];
  osHint: string;
  firstSeen: string;
  alreadyAdded: boolean;
}

interface DhcpLease {
  mac: string;
  ip: string;
  hostname: string;
  leaseExpiry: string;
  vendor: string;
  alreadyAdded: boolean;
}

// ── Vendor DB (truncated) ─────────────────────────────────────────────────────
const VENDORS: Record<string, string> = {
  '00:1A': 'Cisco Systems',
  '00:50': 'VMware Inc.',
  'B8:27': 'Raspberry Pi Foundation',
  'DC:A6': 'Apple Inc.',
  '00:0C': 'VMware, Inc.',
  '18:66': 'Dell Inc.',
  '00:26': 'Hewlett Packard',
  '3C:52': 'HP Enterprise',
  '00:25': 'Supermicro',
};

function getVendor(mac: string) {
  const prefix = mac.substring(0, 5).toUpperCase();
  return VENDORS[prefix] || 'Unknown Vendor';
}

// ── Simulated scan data ───────────────────────────────────────────────────────
function generateSimulatedHosts(cidr: string, count: number, existingMacs: string[]): DiscoveredHost[] {
  const base = cidr.split('/')[0].split('.').slice(0, 3).join('.');
  const vendors = Object.keys(VENDORS);
  const osHints = ['Linux', 'Linux', 'Linux', 'Windows Server', 'Unknown'];
  const hostnames = [
    'web-srv-01', 'db-master-01', 'cache-01', 'lb-01', 'app-01',
    'monitor-01', 'backup-srv', 'mail-relay', 'dns-secondary', 'nfs-srv',
    'k8s-node-01', 'k8s-node-02', 'build-agent-01', 'ci-runner-01', 'log-collector',
  ];
  const results: DiscoveredHost[] = [];
  const usedIps = new Set<number>();
  for (let i = 0; i < count; i++) {
    let octet: number;
    do { octet = Math.floor(Math.random() * 200) + 10; } while (usedIps.has(octet));
    usedIps.add(octet);
    const vendorPrefix = vendors[Math.floor(Math.random() * vendors.length)];
    const randHex = () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase();
    const mac = `${vendorPrefix}:${randHex()}:${randHex()}:${randHex()}`;
    results.push({
      id: generateId('disc'),
      ip: `${base}.${octet}`,
      mac,
      hostname: hostnames[i % hostnames.length],
      vendor: getVendor(mac),
      pingMs: Math.floor(Math.random() * 4) + 1,
      openPorts: [22, ...(Math.random() > 0.5 ? [80] : []), ...(Math.random() > 0.7 ? [443] : []), ...(Math.random() > 0.8 ? [3306] : [])],
      osHint: osHints[Math.floor(Math.random() * osHints.length)],
      firstSeen: new Date().toISOString(),
      alreadyAdded: existingMacs.includes(mac),
    });
  }
  return results.sort((a, b) => {
    const aOctet = parseInt(a.ip.split('.').pop()!);
    const bOctet = parseInt(b.ip.split('.').pop()!);
    return aOctet - bOctet;
  });
}

function generateDhcpLeases(count: number, existingMacs: string[]): DhcpLease[] {
  const vendors = Object.keys(VENDORS);
  const hostnames = [
    'srv-pxe-candidate-01', 'rack-b-node-03', 'compute-04', 'storage-node-02',
    'mgmt-switch-01', 'ipmi-node-05', 'worker-06', 'infra-07',
  ];
  const leases: DhcpLease[] = [];
  const usedIps = new Set<number>();
  for (let i = 0; i < count; i++) {
    let octet: number;
    do { octet = Math.floor(Math.random() * 100) + 150; } while (usedIps.has(octet));
    usedIps.add(octet);
    const vendorPrefix = vendors[Math.floor(Math.random() * vendors.length)];
    const randHex = () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase();
    const mac = `${vendorPrefix}:${randHex()}:${randHex()}:${randHex()}`;
    const expiry = new Date(Date.now() + (Math.random() * 86400 * 2 - 3600) * 1000);
    leases.push({
      mac,
      ip: `10.0.0.${octet}`,
      hostname: hostnames[i % hostnames.length],
      leaseExpiry: expiry.toISOString(),
      vendor: getVendor(mac),
      alreadyAdded: existingMacs.includes(mac),
    });
  }
  return leases;
}

// ─────────────────────────────────────────────────────────────────────────────
export default function NetworkDiscovery() {
  const dispatch = useAppDispatch();
  const servers = useAppSelector(s => s.servers.servers);
  const osProfiles = useAppSelector(s => s.osProfiles.profiles);
  const existingMacs = servers.map(s => s.macAddress.toUpperCase());

  // Scanner state
  const [cidr, setCidr] = useState('10.0.0.0/24');
  const [scanMethod, setScanMethod] = useState<'arp' | 'ping' | 'dhcp'>('arp');
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [scanStage, setScanStage] = useState('');
  const [discovered, setDiscovered] = useState<DiscoveredHost[]>([]);
  const [dhcpLeases, setDhcpLeases] = useState<DhcpLease[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedHost, setExpandedHost] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'scan' | 'dhcp'>('scan');
  const [defaultOsId, setDefaultOsId] = useState('');
  const scanRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stages = [
    'Sending ARP probes…',
    'Waiting for responses…',
    'Resolving hostnames…',
    'Detecting OS signatures…',
    'Probing open ports…',
    'Building device profiles…',
    'Finalizing results…',
  ];

  const startScan = () => {
    setScanning(true);
    setProgress(0);
    setDiscovered([]);
    setSelected(new Set());
    let step = 0;
    setScanStage(stages[0]);

    scanRef.current = setInterval(() => {
      step++;
      const pct = Math.min(step * 15, 100);
      setProgress(pct);
      setScanStage(stages[Math.min(Math.floor(step * 0.8), stages.length - 1)]);
      if (pct >= 100) {
        clearInterval(scanRef.current!);
        const hostCount = Math.floor(Math.random() * 8) + 4;
        const hosts = generateSimulatedHosts(cidr, hostCount, existingMacs);
        setDiscovered(hosts);
        setScanning(false);
        setProgress(100);
        setScanStage('');
        toast.success(`Scan complete — ${hosts.length} hosts discovered`);
      }
    }, 600);
  };

  const stopScan = () => {
    if (scanRef.current) clearInterval(scanRef.current);
    setScanning(false);
    setScanStage('');
    toast('Scan stopped', { icon: '⏹' });
  };

  const loadDhcpLeases = () => {
    const leases = generateDhcpLeases(8, existingMacs);
    setDhcpLeases(leases);
    toast.success(`Loaded ${leases.length} DHCP leases`);
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    const importable = discovered.filter(h => !h.alreadyAdded).map(h => h.id);
    setSelected(new Set(importable));
  };

  const importSelected = () => {
    const now = new Date().toISOString();
    let count = 0;
    for (const id of selected) {
      const host = discovered.find(h => h.id === id) ||
        (() => {
          const l = dhcpLeases.find(l => l.mac === id);
          return l ? { id: l.mac, ip: l.ip, mac: l.mac, hostname: l.hostname } : null;
        })();
      if (!host || existingMacs.includes(host.mac.toUpperCase())) continue;
      dispatch(addServer({
        id: generateId('srv'),
        hostname: host.hostname + '.local',
        macAddress: host.mac,
        ipAddress: host.ip,
        osProfileId: defaultOsId,
        configurationId: '',
        status: 'idle',
        notes: `Discovered via network scan on ${new Date().toLocaleDateString()}`,
        tags: ['discovered'],
        cpuModel: '',
        ramGB: 16,
        diskGB: 256,
        createdAt: now,
      }));
      count++;
    }
    if (count > 0) {
      toast.success(`${count} server${count > 1 ? 's' : ''} added to inventory`);
      setSelected(new Set());
      // Mark as added
      setDiscovered(prev => prev.map(h => selected.has(h.id) ? { ...h, alreadyAdded: true } : h));
    } else {
      toast.error('No new servers to import');
    }
  };

  const importDhcpLease = (lease: DhcpLease) => {
    if (lease.alreadyAdded) return;
    const now = new Date().toISOString();
    dispatch(addServer({
      id: generateId('srv'),
      hostname: lease.hostname + '.local',
      macAddress: lease.mac,
      ipAddress: lease.ip,
      osProfileId: defaultOsId,
      configurationId: '',
      status: 'idle',
      notes: `Imported from DHCP lease — expires ${new Date(lease.leaseExpiry).toLocaleDateString()}`,
      tags: ['dhcp', 'discovered'],
      cpuModel: '',
      ramGB: 16,
      diskGB: 256,
      createdAt: now,
    }));
    toast.success(`${lease.hostname} added to inventory`);
    setDhcpLeases(prev => prev.map(l => l.mac === lease.mac ? { ...l, alreadyAdded: true } : l));
  };

  return (
    <div className="space-y-6">
      {/* How-it-works info banner */}
      <div className="flex gap-3 p-4 rounded-xl border border-blue-500/20 bg-blue-500/5">
        <Info size={16} className="text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-blue-300/80 leading-relaxed">
          <strong className="text-blue-300">How discovery works:</strong> Scan your network to find bare-metal servers
          before they boot. Once discovered, import them into the inventory, assign an OS profile,
          then power them on — they'll PXE boot and receive the config automatically.
        </div>
      </div>

      {/* Tab toggle */}
      <div className="flex gap-0.5 bg-white/[0.03] p-1 rounded-xl border border-white/[0.06] w-fit">
        {[
          { id: 'scan', label: 'Network Scanner', icon: Radar },
          { id: 'dhcp', label: 'DHCP Leases', icon: Network },
        ].map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActiveTab(id as 'scan' | 'dhcp')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === id
                ? 'bg-white/[0.07] text-slate-100 border border-white/[0.08]'
                : 'text-slate-500 hover:text-slate-300'
            }`}>
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* ── NETWORK SCANNER ─────────────────────────────────────────────── */}
      {activeTab === 'scan' && (
        <div className="space-y-4">
          {/* Scanner config */}
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Radar size={15} className="text-slate-400" />
                ARP / Ping Network Scan
              </h3>
            </CardHeader>
            <CardBody>
              <div className="flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-48">
                  <Input
                    label="Target Subnet (CIDR)"
                    value={cidr}
                    onChange={e => setCidr(e.target.value)}
                    placeholder="10.0.0.0/24"
                    mono
                    disabled={scanning}
                  />
                </div>
                <div className="min-w-44">
                  <Select
                    label="Scan Method"
                    value={scanMethod}
                    onChange={e => setScanMethod(e.target.value as 'arp' | 'ping' | 'dhcp')}
                    disabled={scanning}
                  >
                    <option value="arp">ARP Sweep (fastest)</option>
                    <option value="ping">ICMP Ping Sweep</option>
                  </Select>
                </div>
                <div className="min-w-44">
                  <Select
                    label="Default OS Profile"
                    value={defaultOsId}
                    onChange={e => setDefaultOsId(e.target.value)}
                  >
                    <option value="">— Assign later —</option>
                    {osProfiles.map(os => (
                      <option key={os.id} value={os.id}>{os.name} {os.version}</option>
                    ))}
                  </Select>
                </div>
                <div className="flex gap-2">
                  {!scanning ? (
                    <Button icon={<Play size={15} />} onClick={startScan}>
                      Start Scan
                    </Button>
                  ) : (
                    <Button variant="danger" icon={<Square size={15} />} onClick={stopScan}>
                      Stop
                    </Button>
                  )}
                </div>
              </div>

              {/* Progress */}
              {scanning && (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 pulse-dot" />
                      {scanStage}
                    </span>
                    <span className="tabular-nums">{progress}%</span>
                  </div>
                  <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${progress}%`,
                        background: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
                        boxShadow: '0 0 8px rgba(59,130,246,0.5)',
                      }}
                    />
                  </div>
                  <p className="text-xs text-slate-600">Scanning {cidr} · {scanMethod.toUpperCase()} method</p>
                </div>
              )}
            </CardBody>
          </Card>

          {/* Results */}
          {discovered.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                      <CheckCircle size={15} className="text-emerald-400" />
                      Discovered Hosts ({discovered.length})
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {discovered.filter(h => !h.alreadyAdded).length} new · {discovered.filter(h => h.alreadyAdded).length} already in inventory
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={selectAll}
                      className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                      Select all new
                    </button>
                    <Button
                      icon={<Download size={14} />}
                      disabled={selected.size === 0}
                      onClick={importSelected}
                    >
                      Import Selected ({selected.size})
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardBody className="p-0">
                <div className="divide-y divide-white/[0.04]">
                  {discovered.map(host => (
                    <div key={host.id}>
                      <div
                        className={`flex items-center gap-3 px-5 py-3.5 cursor-pointer transition-colors ${
                          host.alreadyAdded ? 'opacity-50' : 'hover:bg-white/[0.02]'
                        }`}
                        onClick={() => !host.alreadyAdded && setExpandedHost(expandedHost === host.id ? null : host.id)}
                      >
                        {/* Checkbox */}
                        {!host.alreadyAdded ? (
                          <input type="checkbox"
                            checked={selected.has(host.id)}
                            onChange={() => toggleSelect(host.id)}
                            onClick={e => e.stopPropagation()}
                            className="w-4 h-4 rounded border-white/[0.2] bg-white/[0.05] accent-blue-500 flex-shrink-0"
                          />
                        ) : (
                          <div className="w-4 h-4 rounded border border-emerald-500/40 bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                            <CheckCircle size={10} className="text-emerald-400" />
                          </div>
                        )}

                        {/* IP */}
                        <div className="w-28 flex-shrink-0">
                          <code className="text-sm font-mono text-slate-200">{host.ip}</code>
                          <div className="text-xs text-slate-600 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 4px #10b981' }} />
                            {host.pingMs}ms
                          </div>
                        </div>

                        {/* Hostname */}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-200 truncate">{host.hostname}</div>
                          <code className="text-xs text-slate-500 font-mono">{host.mac}</code>
                        </div>

                        {/* Vendor */}
                        <div className="hidden md:block w-40 flex-shrink-0">
                          <div className="text-xs text-slate-400 truncate">{host.vendor}</div>
                          <div className="text-xs text-slate-600">{host.osHint}</div>
                        </div>

                        {/* Open ports */}
                        <div className="hidden lg:flex gap-1 flex-wrap w-32 flex-shrink-0">
                          {host.openPorts.map(p => (
                            <span key={p} className="text-xs bg-white/[0.05] text-slate-400 px-1 py-0.5 rounded font-mono border border-white/[0.06]">{p}</span>
                          ))}
                        </div>

                        {/* Already added badge */}
                        {host.alreadyAdded ? (
                          <span className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full flex-shrink-0">In inventory</span>
                        ) : (
                          <div className="flex items-center gap-1 flex-shrink-0 text-slate-600">
                            {expandedHost === host.id
                              ? <ChevronDown size={14} />
                              : <ChevronRight size={14} />
                            }
                          </div>
                        )}
                      </div>

                      {/* Expanded details */}
                      {expandedHost === host.id && (
                        <div className="px-5 pb-4 ml-7 pt-1">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {[
                              { label: 'IP Address', value: host.ip, mono: true },
                              { label: 'MAC Address', value: host.mac, mono: true },
                              { label: 'Hostname', value: host.hostname, mono: false },
                              { label: 'Vendor', value: host.vendor, mono: false },
                              { label: 'OS Hint', value: host.osHint, mono: false },
                              { label: 'Latency', value: `${host.pingMs}ms`, mono: true },
                              { label: 'Open Ports', value: host.openPorts.join(', '), mono: true },
                              { label: 'First Seen', value: new Date(host.firstSeen).toLocaleTimeString(), mono: false },
                            ].map(({ label, value, mono }) => (
                              <div key={label} className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.05]">
                                <div className="text-xs text-slate-500 mb-0.5">{label}</div>
                                <div className={`text-xs text-slate-200 ${mono ? 'font-mono' : ''} truncate`}>{value}</div>
                              </div>
                            ))}
                          </div>
                          <div className="mt-3 flex justify-end">
                            <Button size="sm" icon={<Plus size={13} />}
                              onClick={() => {
                                toggleSelect(host.id);
                                setExpandedHost(null);
                              }}>
                              {selected.has(host.id) ? 'Remove from selection' : 'Add to selection'}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}

          {!scanning && discovered.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 gap-4 rounded-2xl border-2 border-dashed border-white/[0.07]">
              <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
                <Radar size={26} className="text-slate-600" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-slate-400">No scan results yet</p>
                <p className="text-xs text-slate-600 mt-1">Configure the target subnet and click Start Scan</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── DHCP LEASES ─────────────────────────────────────────────────── */}
      {activeTab === 'dhcp' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <Network size={15} className="text-slate-400" />
                    DHCP Lease Table
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Devices that have received an IP from your DHCP server — likely PXE boot candidates
                  </p>
                </div>
                <Button variant="secondary" icon={<RefreshCw size={14} />} onClick={loadDhcpLeases}>
                  {dhcpLeases.length > 0 ? 'Refresh' : 'Load Leases'}
                </Button>
              </div>
            </CardHeader>
            {dhcpLeases.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.05]">
                      <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">MAC Address</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">IP</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Hostname</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider hidden md:table-cell">Vendor</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider hidden lg:table-cell">Lease Expires</th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.03]">
                    {dhcpLeases.map(lease => {
                      const expiry = new Date(lease.leaseExpiry);
                      const expired = expiry < new Date();
                      const expiringSoon = !expired && expiry < new Date(Date.now() + 3600_000);
                      return (
                        <tr key={lease.mac} className={`hover:bg-white/[0.02] transition-colors ${lease.alreadyAdded ? 'opacity-50' : ''}`}>
                          <td className="px-5 py-3.5">
                            <code className="text-xs text-slate-300 bg-white/[0.05] px-1.5 py-0.5 rounded-md font-mono">{lease.mac}</code>
                          </td>
                          <td className="px-5 py-3.5">
                            <code className="text-xs font-mono text-slate-200">{lease.ip}</code>
                          </td>
                          <td className="px-5 py-3.5 text-sm text-slate-300">{lease.hostname}</td>
                          <td className="px-5 py-3.5 text-xs text-slate-500 hidden md:table-cell">{lease.vendor}</td>
                          <td className="px-5 py-3.5 hidden lg:table-cell">
                            <span className={`text-xs ${expired ? 'text-red-400' : expiringSoon ? 'text-yellow-400' : 'text-slate-500'}`}>
                              {expired ? '⚠ Expired' : expiry.toLocaleString()}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            {lease.alreadyAdded ? (
                              <span className="text-xs text-emerald-400 flex items-center justify-end gap-1">
                                <CheckCircle size={11} /> In inventory
                              </span>
                            ) : (
                              <Button size="sm" icon={<Plus size={12} />} onClick={() => importDhcpLease(lease)}>
                                Import
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <CardBody>
                <div className="flex flex-col items-center justify-center h-32 gap-3 text-slate-600">
                  <Network size={24} />
                  <p className="text-sm">Click "Load Leases" to fetch DHCP lease data</p>
                  <p className="text-xs text-slate-700">In production this would read from your DHCP server's lease file</p>
                </div>
              </CardBody>
            )}
          </Card>

          {/* DHCP config hint */}
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <HardDrive size={15} className="text-slate-400" />
                DHCP Server Configuration
              </h3>
            </CardHeader>
            <CardBody>
              <p className="text-xs text-slate-400 mb-3">
                For PXE boot to work, your DHCP server must return these extra options when a client requests with PXE vendor class:
              </p>
              <pre className="text-xs text-emerald-400/90 bg-black/40 p-4 rounded-xl border border-white/[0.06] font-mono leading-relaxed overflow-x-auto">{`# ISC DHCP (dhcpd.conf)
next-server 10.0.0.1;          # TFTP server IP
filename "pxelinux.0";         # BIOS boot file

# UEFI PXE (class-based)
if exists user-class and option user-class = "iPXE" {
  filename "http://10.0.0.1/boot.ipxe";
} elsif option arch = 00:07 {
  filename "grubx64.efi";      # UEFI x86_64
} else {
  filename "pxelinux.0";       # Legacy BIOS
}`}</pre>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Wake-on-LAN section */}
      <Card>
        <CardHeader>
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Zap size={15} className="text-yellow-400" />
            Wake-on-LAN
          </h3>
        </CardHeader>
        <CardBody>
          <p className="text-xs text-slate-400 mb-4">
            Power on servers remotely by sending a magic packet to their MAC address. The server must support WoL and be connected to power.
          </p>
          {servers.length === 0 ? (
            <p className="text-xs text-slate-600">No servers in inventory yet.</p>
          ) : (
            <div className="space-y-2">
              {servers.slice(0, 8).map(server => (
                <div key={server.id} className="flex items-center gap-4 p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:border-white/[0.09] transition-all">
                  <Server size={14} className="text-slate-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-200 font-medium truncate">{server.hostname}</div>
                    <code className="text-xs text-slate-500 font-mono">{server.macAddress}</code>
                  </div>
                  <StatusBadge status={server.status} />
                  <button
                    disabled={server.status === 'deploying'}
                    onClick={() => {
                      toast.success(`Magic packet sent to ${server.macAddress}`, { icon: '⚡' });
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-yellow-400 border border-yellow-500/30 bg-yellow-500/10 hover:bg-yellow-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    <Zap size={12} />
                    Wake
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
