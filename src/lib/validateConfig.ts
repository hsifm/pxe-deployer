import { DeploymentConfig, OSProfile, PackageFile } from '../types';

export type ValidationLevel = 'pass' | 'warn' | 'fail';
export type ValidationCategory = 'general' | 'network' | 'disk' | 'packages' | 'commands' | 'agents';

export interface ValidationCheck {
  id: string;
  category: ValidationCategory;
  level: ValidationLevel;
  title: string;
  detail?: string;
}

const IP_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
const NETMASK_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
const SIZE_RE = /^\d+(\.\d+)?(M|G|T|MB|GB|TB|%FREE|K|KB)$/i;

function isValidIp(s: string): boolean {
  return IP_RE.test(s) && s.split('.').every(o => Number(o) <= 255);
}

function isValidSize(s: string): boolean {
  return SIZE_RE.test(s) || s === '100%FREE' || s === '0';
}

export function validateConfig(
  cfg: DeploymentConfig,
  profile: OSProfile,
  allPackageFiles: PackageFile[],
): ValidationCheck[] {
  const checks: ValidationCheck[] = [];
  const isWindows = profile.family === 'windows';
  const isLinux = !isWindows;

  // ─── GENERAL ──────────────────────────────────────────────────────────────

  checks.push({
    id: 'gen-name',
    category: 'general',
    level: cfg.name.trim() ? 'pass' : 'fail',
    title: 'Configuration name',
    detail: cfg.name.trim() ? undefined : 'A configuration name is required.',
  });

  checks.push({
    id: 'gen-admin-user',
    category: 'general',
    level: cfg.adminUser.trim() ? 'pass' : 'fail',
    title: 'Admin user',
    detail: cfg.adminUser.trim() ? undefined : 'Admin username is required.',
  });

  checks.push({
    id: 'gen-admin-pass',
    category: 'general',
    level: cfg.adminPassword ? 'pass' : 'warn',
    title: 'Admin password',
    detail: cfg.adminPassword ? undefined : 'No admin password set — the account may be locked or use an empty password.',
  });

  if (isLinux) {
    checks.push({
      id: 'gen-root-pass',
      category: 'general',
      level: cfg.rootPassword ? 'pass' : 'warn',
      title: 'Root password',
      detail: cfg.rootPassword ? undefined : 'No root password set. Ensure SSH key auth is configured, or root login will be disabled.',
    });
  }

  checks.push({
    id: 'gen-locale',
    category: 'general',
    level: cfg.locale.trim() ? 'pass' : 'warn',
    title: 'Locale',
    detail: cfg.locale.trim() ? undefined : 'No locale set — installer may use a default that differs from your region.',
  });

  checks.push({
    id: 'gen-timezone',
    category: 'general',
    level: cfg.timezone.trim() ? 'pass' : 'warn',
    title: 'Timezone',
    detail: cfg.timezone.trim() ? undefined : 'No timezone set.',
  });

  // ─── NETWORK ──────────────────────────────────────────────────────────────

  checks.push({
    id: 'net-hostname',
    category: 'network',
    level: cfg.network.hostnameTemplate.trim() ? 'pass' : 'fail',
    title: 'Hostname template',
    detail: cfg.network.hostnameTemplate.trim() ? undefined : 'A hostname template is required.',
  });

  if (cfg.network.mode === 'static') {
    const ip = cfg.network.ipAddress ?? '';
    checks.push({
      id: 'net-ip',
      category: 'network',
      level: isValidIp(ip) ? 'pass' : 'fail',
      title: 'Static IP address',
      detail: isValidIp(ip) ? undefined : `"${ip || '(empty)'}" is not a valid IPv4 address.`,
    });

    const gw = cfg.network.gateway ?? '';
    checks.push({
      id: 'net-gw',
      category: 'network',
      level: isValidIp(gw) ? 'pass' : 'fail',
      title: 'Gateway',
      detail: isValidIp(gw) ? undefined : `"${gw || '(empty)'}" is not a valid gateway IP.`,
    });

    const mask = cfg.network.subnet ?? '';
    checks.push({
      id: 'net-mask',
      category: 'network',
      level: NETMASK_RE.test(mask) ? 'pass' : 'fail',
      title: 'Subnet mask',
      detail: NETMASK_RE.test(mask) ? undefined : `"${mask || '(empty)'}" is not a valid subnet mask.`,
    });
  }

  const badDns = cfg.network.dnsServers.filter(d => d.trim() && !isValidIp(d.trim()));
  checks.push({
    id: 'net-dns',
    category: 'network',
    level: cfg.network.dnsServers.filter(Boolean).length === 0 ? 'warn'
      : badDns.length > 0 ? 'fail' : 'pass',
    title: 'DNS servers',
    detail: badDns.length > 0
      ? `Invalid DNS entries: ${badDns.join(', ')}`
      : cfg.network.dnsServers.filter(Boolean).length === 0
        ? 'No DNS servers configured — name resolution may fail.'
        : undefined,
  });

  // ─── DISK ────────────────────────────────────────────────────────────────

  checks.push({
    id: 'disk-bootdisk',
    category: 'disk',
    level: cfg.partitions.bootDisk.trim() ? 'pass' : 'fail',
    title: 'Boot disk',
    detail: cfg.partitions.bootDisk.trim() ? undefined : 'Boot disk path is required (e.g. /dev/sda).',
  });

  if (cfg.partitions.useEFI) {
    checks.push({
      id: 'disk-efi',
      category: 'disk',
      level: isValidSize(cfg.partitions.efiSize) ? 'pass' : 'warn',
      title: 'EFI partition size',
      detail: isValidSize(cfg.partitions.efiSize) ? undefined : `"${cfg.partitions.efiSize}" doesn't look like a valid partition size.`,
    });
  }

  checks.push({
    id: 'disk-root',
    category: 'disk',
    level: isValidSize(cfg.partitions.rootSize) ? 'pass' : 'warn',
    title: 'Root partition size',
    detail: isValidSize(cfg.partitions.rootSize) ? undefined : `"${cfg.partitions.rootSize}" doesn't look like a valid size.`,
  });

  // ─── PACKAGES ─────────────────────────────────────────────────────────────

  // Attached package file format vs OS family compatibility
  const attachedFiles = allPackageFiles.filter(f => cfg.packageFiles.includes(f.id));

  const mismatchedFiles = attachedFiles.filter(f => f.osFamily !== null && f.osFamily !== profile.family);
  if (mismatchedFiles.length > 0) {
    mismatchedFiles.forEach(f => {
      checks.push({
        id: `pkg-file-mismatch-${f.id}`,
        category: 'packages',
        level: 'fail',
        title: `Package format mismatch: ${f.filename}`,
        detail: `"${f.filename}" is a ${f.format} package (${f.osFamily}) but this configuration targets ${profile.family} (${profile.name} ${profile.version}).`,
      });
    });
  } else if (attachedFiles.length > 0) {
    checks.push({
      id: 'pkg-files-ok',
      category: 'packages',
      level: 'pass',
      title: `${attachedFiles.length} package file(s) attached`,
      detail: attachedFiles.map(f => f.filename).join(', '),
    });
  }

  // Warn if deb/rpm package names used on wrong OS
  if (profile.family === 'rhel') {
    const debOnly = cfg.packages.filter(p => /^(apt|dpkg|libapt|python3-apt)/.test(p));
    if (debOnly.length) {
      checks.push({
        id: 'pkg-deb-on-rhel',
        category: 'packages',
        level: 'warn',
        title: 'Debian-specific packages on RHEL',
        detail: `These packages are Debian-only and won't install: ${debOnly.join(', ')}`,
      });
    }
  }

  if (profile.family === 'debian') {
    const rhelOnly = cfg.packages.filter(p => /^(yum|dnf|rpm|epel)/.test(p));
    if (rhelOnly.length) {
      checks.push({
        id: 'pkg-rpm-on-deb',
        category: 'packages',
        level: 'warn',
        title: 'RHEL-specific packages on Debian',
        detail: `These packages are RHEL-only and won't install: ${rhelOnly.join(', ')}`,
      });
    }
  }

  if (isWindows && cfg.packages.length > 0) {
    checks.push({
      id: 'pkg-names-on-windows',
      category: 'packages',
      level: 'warn',
      title: 'Package names on Windows',
      detail: 'Package names are not used by Windows autounattend. Use attached package files (.msi/.exe) or PowerShell commands instead.',
    });
  }

  // ─── COMMANDS ─────────────────────────────────────────────────────────────

  cfg.commands.filter(c => c.enabled).forEach(cmd => {
    // PowerShell on Linux
    if (cmd.type === 'powershell' && isLinux) {
      checks.push({
        id: `cmd-ps-linux-${cmd.id}`,
        category: 'commands',
        level: 'fail',
        title: `Command "${cmd.name || cmd.id}": PowerShell on Linux`,
        detail: 'PowerShell scripts require Windows. Change type to bash or python.',
      });
    }

    // bash/python on Windows
    if ((cmd.type === 'bash' || cmd.type === 'python') && isWindows) {
      checks.push({
        id: `cmd-bash-win-${cmd.id}`,
        category: 'commands',
        level: 'warn',
        title: `Command "${cmd.name || cmd.id}": ${cmd.type} on Windows`,
        detail: 'bash/python scripts require additional tooling on Windows (WSL, Git Bash, Python install). Use PowerShell for native Windows automation.',
      });
    }

    // Empty content
    if (!cmd.content.trim()) {
      checks.push({
        id: `cmd-empty-${cmd.id}`,
        category: 'commands',
        level: 'warn',
        title: `Command "${cmd.name || cmd.id}": empty script`,
        detail: 'This command has no script content and will have no effect.',
      });
    }

    // pre-install bash should have shebang
    if (cmd.type === 'bash' && cmd.content.trim() && !cmd.content.trim().startsWith('#!')) {
      checks.push({
        id: `cmd-shebang-${cmd.id}`,
        category: 'commands',
        level: 'warn',
        title: `Command "${cmd.name || cmd.id}": missing shebang`,
        detail: 'Bash scripts should start with #!/bin/bash for reliable execution.',
      });
    }
  });

  if (cfg.commands.filter(c => c.enabled).length === 0) {
    checks.push({
      id: 'cmd-none',
      category: 'commands',
      level: 'pass',
      title: 'No commands configured',
      detail: 'No post-install or first-boot scripts.',
    });
  }

  // ─── AGENTS ──────────────────────────────────────────────────────────────

  const enabledAgents = cfg.agents.filter(a => a.enabled);

  enabledAgents.forEach(agent => {
    const needsUrl = ['puppet', 'chef', 'ansible', 'salt'].includes(agent.type);
    if (needsUrl && !agent.serverUrl.trim()) {
      checks.push({
        id: `agent-url-${agent.id}`,
        category: 'agents',
        level: 'warn',
        title: `Agent "${agent.name}": no server URL`,
        detail: `${agent.type} agents typically require a server URL to register against.`,
      });
    }

    if (isWindows && agent.type === 'ansible') {
      checks.push({
        id: `agent-ansible-win-${agent.id}`,
        category: 'agents',
        level: 'warn',
        title: `Agent "${agent.name}": Ansible on Windows`,
        detail: 'Ansible requires WinRM to be configured. Ensure your first-boot commands enable WinRM.',
      });
    }
  });

  if (enabledAgents.length === 0 && cfg.agents.length > 0) {
    checks.push({
      id: 'agents-all-disabled',
      category: 'agents',
      level: 'warn',
      title: 'All agents disabled',
      detail: 'You have agents configured but all are disabled.',
    });
  }

  return checks;
}

export function summarize(checks: ValidationCheck[]): { pass: number; warn: number; fail: number } {
  return {
    pass: checks.filter(c => c.level === 'pass').length,
    warn: checks.filter(c => c.level === 'warn').length,
    fail: checks.filter(c => c.level === 'fail').length,
  };
}
