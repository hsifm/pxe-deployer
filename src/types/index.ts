export type OSFamily = 'debian' | 'rhel' | 'windows';
export type OSArch = 'x86_64' | 'aarch64';
export type ConfigType = 'preseed' | 'kickstart' | 'autounattend' | 'cloud-init';
export type CommandStage = 'pre-install' | 'post-install' | 'first-boot';
export type CommandType = 'bash' | 'python' | 'powershell';
export type DeploymentStatus = 'pending' | 'deploying' | 'completed' | 'failed' | 'idle';
export type AgentType = 'puppet' | 'chef' | 'ansible' | 'salt' | 'custom';
export type NetworkMode = 'dhcp' | 'static';
export type PackageFormat = 'deb' | 'rpm' | 'msi' | 'exe' | 'tar.gz' | 'zip' | 'whl' | 'other';

export interface PackageFile {
  id: string;
  name: string;
  filename: string;
  size: number;
  format: PackageFormat;
  /** null = compatible with any OS family */
  osFamily: OSFamily | null;
  description: string;
  uploadedAt: string;
}

export interface OSProfile {
  id: string;
  name: string;
  version: string;
  codename?: string;
  family: OSFamily;
  arch: OSArch;
  color: string;
  icon: string;
  description: string;
  kernelArgs: string[];
  isoPath?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NetworkConfig {
  mode: NetworkMode;
  hostnameTemplate: string;
  domain: string;
  dnsServers: string[];
  ntpServers: string[];
  ipAddress?: string;
  subnet?: string;
  gateway?: string;
}

export interface PartitionConfig {
  scheme: 'auto' | 'lvm' | 'custom';
  bootDisk: string;
  efiSize: string;
  bootSize: string;
  swapSize: string;
  rootSize: string;
  useEFI: boolean;
  customLayout?: string;
}

export interface Command {
  id: string;
  name: string;
  description: string;
  type: CommandType;
  stage: CommandStage;
  runAs: string;
  content: string;
  order: number;
  enabled: boolean;
}

export interface Agent {
  id: string;
  name: string;
  type: AgentType;
  enabled: boolean;
  version: string;
  serverUrl: string;
  config: string;
}

export interface DeploymentConfig {
  id: string;
  osProfileId: string;
  name: string;
  description: string;
  isDefault: boolean;
  configType: ConfigType;
  network: NetworkConfig;
  partitions: PartitionConfig;
  locale: string;
  timezone: string;
  keyboard: string;
  rootPassword: string;
  adminUser: string;
  adminPassword: string;
  packages: string[];
  packageGroups: string[];
  /** IDs of uploaded PackageFile objects attached to this config */
  packageFiles: string[];
  commands: Command[];
  agents: Agent[];
  createdAt: string;
  updatedAt: string;
}

export interface Server {
  id: string;
  hostname: string;
  macAddress: string;
  ipAddress: string;
  osProfileId: string;
  configurationId: string;
  goldImageId?: string;         // which gold image standard to apply post-deploy
  status: DeploymentStatus;
  notes: string;
  tags: string[];
  cpuModel: string;
  ramGB: number;
  diskGB: number;
  lastDeployedAt?: string;
  goldImageAppliedAt?: string;  // timestamp of last gold image application
  createdAt: string;
}

export interface Deployment {
  id: string;
  serverId: string;
  serverHostname: string;
  osProfileId: string;
  configurationId: string;
  status: DeploymentStatus;
  startedAt: string;
  completedAt?: string;
  duration?: number;
  logs: string[];
}

export interface BootMenuEntry {
  id: string;
  label: string;
  osProfileId: string;
  configurationId: string;
  isDefault: boolean;
  kernelArgs: string;
  order: number;
}

// ─── Gold Image / OS Standard ─────────────────────────────────────────────────

export type GoldImageOsTarget = OSFamily | 'all';

/** A single package repository entry (apt, yum/dnf, or Chocolatey) */
export interface GoldImageRepo {
  id: string;
  label: string;           // e.g. "Local Ubuntu 24.04 Mirror"
  baseUrl: string;         // http://10.0.0.5/ubuntu  or  http://10.0.0.5/rocky/9/BaseOS/x86_64/os/

  // Debian/Ubuntu apt-specific
  suite?: string;          // e.g. noble, jammy, bookworm
  components?: string;     // e.g. "main restricted universe multiverse"

  // RHEL/Rocky yum/dnf-specific
  gpgCheck: boolean;       // enable signature verification
  gpgKeyUrl?: string;      // http://10.0.0.5/keys/RPM-GPG-KEY or apt signed-by key URL
}

export interface GoldImageHardening {
  disableRootSSH: boolean;
  sshKeyAuthOnly: boolean;
  disableEmptyPasswords: boolean;
  enableFirewall: boolean;
  firewallAllowPorts: string[];       // e.g. ["22","80","443"]
  disableServices: string[];          // e.g. ["cups","avahi-daemon"]
  enableFail2ban: boolean;
  enableAuditd: boolean;
  disableUSBStorage: boolean;
  setPasswordPolicy: boolean;
  passwordMinLength: number;
  passwordMaxAge: number;             // days
  enableAutoUpdates: boolean;
}

export interface GoldImage {
  id: string;
  name: string;
  description: string;
  osTarget: GoldImageOsTarget;        // which OS family this applies to

  // System identity
  hostnameTemplate: string;           // e.g. "{{role}}-{{seq}}" or leave blank
  domain: string;
  timezone: string;
  locale: string;

  // Network
  dnsServers: string[];
  ntpServers: string[];
  searchDomains: string[];

  // Network interface configuration
  networkMode: 'dhcp' | 'static';
  staticAddress?: string;        // CIDR: e.g. "10.0.0.100/24"
  staticGateway?: string;        // e.g. "10.0.0.1"
  networkInterface?: string;     // e.g. "eth0" — auto-detect if blank

  // Security hardening
  hardening: GoldImageHardening;

  // User & access management
  sshAuthorizedKeys: string[];        // public keys to add to authorized_keys

  // Package baseline
  packagesToInstall: string[];
  packagesToRemove: string[];

  // Package repositories (offline/local mirror support)
  repos: GoldImageRepo[];
  replaceDefaultRepos: boolean;   // disable all default apt/yum repos first

  // Custom post-install script (bash or PS)
  postInstallScript: string;

  createdAt: string;
  updatedAt: string;
}

export interface InfraSettings {
  tftpServer: string;
  tftpRoot: string;
  dhcpServer: string;
  dhcpInterface: string;
  fileServer: string;
  fileServerType: 'http' | 'nfs' | 'smb';
  nfsRoot: string;
  httpPort: number;
  pxeMenuTimeout: number;
  pxeMenuBackground: string;
  /** URL of the pxe-deployer backend API, e.g. http://192.168.1.10:3001 */
  apiEndpoint: string;
}
