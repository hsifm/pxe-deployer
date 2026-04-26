import { GoldImage, OSFamily } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const indent = (text: string, spaces = 2) =>
  text.split('\n').map(l => (l.trim() ? ' '.repeat(spaces) + l : l)).join('\n');

const yamlList = (items: string[], prefix = '      - ') =>
  items.map(i => `${prefix}"${i}"`).join('\n');

const now = () => new Date().toISOString().split('.')[0] + 'Z';

// ─── Ansible playbook ─────────────────────────────────────────────────────────

export function generateAnsible(g: GoldImage, family: OSFamily | 'all'): string {
  const isDebian  = family === 'debian' || family === 'all';
  const isRhel    = family === 'rhel'   || family === 'all';
  const isWindows = family === 'windows';
  const pkgMgr    = isDebian ? 'apt' : isRhel ? 'dnf' : 'win_chocolatey';

  const tasks: string[] = [];

  // ── Identity ──────────────────────────────────────────────────────────────
  tasks.push(`  # ── System Identity ──────────────────────────────────────────────────────`);

  if (!isWindows) {
    tasks.push(`  - name: Set timezone
    community.general.timezone:
      name: "${g.timezone}"`);

    tasks.push(`  - name: Set locale
    ansible.builtin.command: localectl set-locale LANG="${g.locale}"
    changed_when: false`);
  } else {
    tasks.push(`  - name: Set timezone
    ansible.windows.win_timezone:
      timezone: "${g.timezone}"`);
  }

  // ── Network Interface ─────────────────────────────────────────────────────
  const netMode = g.networkMode ?? 'dhcp';
  const iface = g.networkInterface || '{{ ansible_default_ipv4.interface }}';
  const dnsAddrs = g.dnsServers.length > 0 ? g.dnsServers.map(d => `"${d}"`).join(', ') : null;
  const searchList = g.searchDomains.length > 0 ? g.searchDomains.map(d => `"${d}"`).join(', ') : null;

  if (!isWindows) {
    tasks.push(`  # ── Network Interface ────────────────────────────────────────────────────`);

    if (netMode === 'static' && g.staticAddress) {
      const netplanContent = [
        `        network:`,
        `          version: 2`,
        `          renderer: networkd`,
        `          ethernets:`,
        `            ${g.networkInterface || '{{ ansible_default_ipv4.interface }}'}:`,
        `              dhcp4: no`,
        `              addresses: ["${g.staticAddress}"]`,
        ...(g.staticGateway ? [
          `              routes:`,
          `                - to: default`,
          `                  via: ${g.staticGateway}`,
        ] : []),
        ...(dnsAddrs ? [
          `              nameservers:`,
          `                addresses: [${dnsAddrs}]`,
          ...(searchList ? [`                search: [${searchList}]`] : []),
        ] : []),
      ].join('\n');

      if (isDebian) {
        tasks.push(`  - name: Configure static IP via netplan
    ansible.builtin.copy:
      dest: /etc/netplan/99-gold-image.yaml
      owner: root
      group: root
      mode: '0600'
      content: |
${netplanContent}
    notify: Apply netplan`);
      }

      if (isRhel) {
        const dnsNmcli = g.dnsServers.length > 0 ? `\\\n        ipv4.dns "${g.dnsServers.join(' ')}"` : '';
        const searchNmcli = g.searchDomains.length > 0 ? `\\\n        ipv4.dns-search "${g.searchDomains.join(' ')}"` : '';
        const gwNmcli = g.staticGateway ? `\\\n        ipv4.gateway "${g.staticGateway}"` : '';
        tasks.push(`  - name: Configure static IP via NetworkManager
    ansible.builtin.shell: |
      IFACE="${iface}"
      CON=$(nmcli -t -f NAME,DEVICE con show | awk -F: -v i="$IFACE" '$2==i{print $1}' | head -1)
      [ -z "$CON" ] && CON=$(nmcli -t -f NAME con show --active | head -1)
      nmcli con mod "$CON" \\
        ipv4.method manual \\
        ipv4.addresses "${g.staticAddress}"${gwNmcli}${dnsNmcli}${searchNmcli}
      nmcli con up "$CON" || true
    changed_when: true`);
      }

      if (family === 'all') {
        // already pushed both above with no when; wrap with when:
        // remove the last two tasks and re-add with when:
        const rheTask = tasks.pop()!;
        const debTask = tasks.pop()!;
        tasks.push(debTask.replace(/\n    notify: Apply netplan/, '\n    when: ansible_os_family == "Debian"\n    notify: Apply netplan'));
        tasks.push(rheTask + `\n    when: ansible_os_family == "RedHat"`);
      }
    } else {
      // DHCP — just ensure interface is set to DHCP in netplan / NM
      if (isDebian) {
        const netplanDhcp = [
          `        network:`,
          `          version: 2`,
          `          ethernets:`,
          `            ${g.networkInterface || '{{ ansible_default_ipv4.interface }}'}:`,
          `              dhcp4: yes`,
        ].join('\n');
        tasks.push(`  - name: Ensure DHCP is configured via netplan
    ansible.builtin.copy:
      dest: /etc/netplan/99-gold-image.yaml
      owner: root
      group: root
      mode: '0600'
      content: |
${netplanDhcp}
    notify: Apply netplan`);
      }
      if (isRhel) {
        tasks.push(`  - name: Ensure NetworkManager is running (DHCP)
    ansible.builtin.service:
      name: NetworkManager
      state: started
      enabled: yes`);
      }
      if (family === 'all') {
        const nmTask = tasks.pop()!;
        const npTask = tasks.pop()!;
        tasks.push(npTask.replace(/\n    notify: Apply netplan/, '\n    when: ansible_os_family == "Debian"\n    notify: Apply netplan'));
        tasks.push(nmTask + `\n    when: ansible_os_family == "RedHat"`);
      }
    }
  } else {
    // Windows static IP
    if (netMode === 'static' && g.staticAddress) {
      const [winIP, winPrefix] = g.staticAddress.split('/');
      const winMask = winPrefix ? `(([uint32]0xFFFFFFFF) -shl (32 - ${winPrefix})) -band 0xFFFFFFFF` : '255.255.255.0';
      tasks.push(`  # ── Network Interface ────────────────────────────────────────────────────`);
      tasks.push(`  - name: Configure static IP (Windows)
    ansible.windows.win_shell: |
      $adapter = Get-NetAdapter | Where-Object {$_.Status -eq 'Up'} | Select-Object -First 1
      New-NetIPAddress -InterfaceIndex $adapter.ifIndex -IPAddress "${winIP}" -PrefixLength ${winPrefix || '24'}${g.staticGateway ? ` -DefaultGateway "${g.staticGateway}"` : ''} -ErrorAction SilentlyContinue
    args:
      executable: powershell`);
    }
  }

  // handler for netplan is registered in handlers section below

  // ── DNS / resolv.conf ─────────────────────────────────────────────────────
  if (g.dnsServers.length > 0) {
    tasks.push(`  # ── DNS ──────────────────────────────────────────────────────────────────`);
    if (!isWindows) {
      const resolvLines = [
        ...g.searchDomains.map(d => `search ${d}`),
        ...g.dnsServers.map(s => `nameserver ${s}`),
      ].join('\\n');
      tasks.push(`  - name: Configure /etc/resolv.conf
    ansible.builtin.copy:
      dest: /etc/resolv.conf
      content: "${resolvLines}\\n"
      owner: root
      group: root
      mode: '0644'`);
    } else {
      tasks.push(`  - name: Set DNS servers (PowerShell)
    ansible.windows.win_shell: |
      $adapter = Get-NetAdapter | Where-Object {$_.Status -eq 'Up'} | Select-Object -First 1
      Set-DnsClientServerAddress -InterfaceIndex $adapter.ifIndex -ServerAddresses (${g.dnsServers.map(s => `'${s}'`).join(',')})
    args:
      executable: powershell`);
    }
  }

  // ── NTP ───────────────────────────────────────────────────────────────────
  if (g.ntpServers.length > 0) {
    tasks.push(`  # ── NTP ──────────────────────────────────────────────────────────────────`);
    if (!isWindows) {
      tasks.push(`  - name: Install chrony
    ansible.builtin.package:
      name: chrony
      state: present`);

      const ntpConf = g.ntpServers
        .map(s => `pool ${s} iburst`)
        .join('\\n');
      tasks.push(`  - name: Configure NTP servers in chrony.conf
    ansible.builtin.lineinfile:
      path: /etc/chrony.conf
      regexp: "^pool "
      line: "${ntpConf}"
      state: present
    notify: Restart chrony`);

      tasks.push(`  - name: Enable and start chrony
    ansible.builtin.service:
      name: chronyd
      state: started
      enabled: yes`);
    } else {
      tasks.push(`  - name: Configure NTP server
    ansible.windows.win_shell: |
      w32tm /config /manualpeerlist:"${g.ntpServers[0]}" /syncfromflags:manual /reliable:YES /update
      Restart-Service w32tm
    args:
      executable: powershell`);
    }
  }

  // ── Repositories ──────────────────────────────────────────────────────────
  const repos = g.repos ?? [];
  if (repos.length > 0 || g.replaceDefaultRepos) {
    tasks.push(`  # ── Package Repositories ────────────────────────────────────────────────`);

    if (g.replaceDefaultRepos && isDebian) {
      tasks.push(`  - name: Remove default apt sources.list
    ansible.builtin.file:
      path: /etc/apt/sources.list
      state: absent`);
      tasks.push(`  - name: Remove default apt sources.list.d entries
    ansible.builtin.shell: rm -f /etc/apt/sources.list.d/*.list /etc/apt/sources.list.d/*.sources
    changed_when: false`);
    }

    if (g.replaceDefaultRepos && isRhel) {
      tasks.push(`  - name: Disable all default yum/dnf repos
    ansible.builtin.shell: |
      find /etc/yum.repos.d/ -name "*.repo" -exec sed -i 's/^enabled=1/enabled=0/' {} \\;
    changed_when: false`);
    }

    repos.filter(r => !isWindows).forEach(repo => {
      if (isDebian) {
        const suite = repo.suite || 'noble';
        const components = repo.components || 'main';
        tasks.push(`  - name: Add apt repository "${repo.label}"
    ansible.builtin.apt_repository:
      repo: "deb ${repo.baseUrl} ${suite} ${components}"
      state: present
      filename: "${repo.label.toLowerCase().replace(/\s+/g, '-')}"
      update_cache: yes${repo.gpgKeyUrl ? `
  - name: Import GPG key for "${repo.label}"
    ansible.builtin.apt_key:
      url: "${repo.gpgKeyUrl}"
      state: present` : ''}`);
      } else if (isRhel) {
        const repoId = repo.label.toLowerCase().replace(/\s+/g, '-');
        tasks.push(`  - name: Add yum repository "${repo.label}"
    ansible.builtin.yum_repository:
      name: "${repoId}"
      description: "${repo.label}"
      baseurl: "${repo.baseUrl}"
      enabled: yes
      gpgcheck: ${repo.gpgCheck ? 'yes' : 'no'}${repo.gpgKeyUrl ? `
      gpgkey: "${repo.gpgKeyUrl}"` : ''}`);
      }
    });

    repos.filter(() => isWindows).forEach(repo => {
      tasks.push(`  - name: Add Chocolatey source "${repo.label}"
    chocolatey.chocolatey.win_chocolatey_source:
      name: "${repo.label.toLowerCase().replace(/\s+/g, '-')}"
      source: "${repo.baseUrl}"
      state: present`);
    });

    if (g.replaceDefaultRepos && isWindows) {
      tasks.push(`  - name: Disable default Chocolatey community source
    chocolatey.chocolatey.win_chocolatey_source:
      name: chocolatey
      state: disabled`);
    }
  }

  // ── Packages ──────────────────────────────────────────────────────────────
  if (g.packagesToInstall.length > 0) {
    tasks.push(`  # ── Package Baseline ─────────────────────────────────────────────────────`);
    if (!isWindows) {
      tasks.push(`  - name: Install baseline packages
    ansible.builtin.package:
      name:
${g.packagesToInstall.map(p => `        - ${p}`).join('\n')}
      state: present`);
    } else {
      tasks.push(`  - name: Install baseline packages (Chocolatey)
    chocolatey.chocolatey.win_chocolatey:
      name:
${g.packagesToInstall.map(p => `        - ${p}`).join('\n')}
      state: present`);
    }
  }

  if (g.packagesToRemove.length > 0 && !isWindows) {
    tasks.push(`  - name: Remove unwanted packages
    ansible.builtin.package:
      name:
${g.packagesToRemove.map(p => `        - ${p}`).join('\n')}
      state: absent`);
  }

  // ── SSH Hardening ─────────────────────────────────────────────────────────
  if (!isWindows) {
    tasks.push(`  # ── SSH Hardening ────────────────────────────────────────────────────────`);
    const sshSettings: [string, string][] = [];

    if (g.hardening.disableRootSSH)
      sshSettings.push(['PermitRootLogin', 'no']);
    if (g.hardening.sshKeyAuthOnly)
      sshSettings.push(['PasswordAuthentication', 'no']);
    if (g.hardening.disableEmptyPasswords)
      sshSettings.push(['PermitEmptyPasswords', 'no']);
    sshSettings.push(['X11Forwarding', 'no']);
    sshSettings.push(['MaxAuthTries', '3']);
    sshSettings.push(['ClientAliveInterval', '300']);
    sshSettings.push(['ClientAliveCountMax', '2']);

    sshSettings.forEach(([key, val]) => {
      tasks.push(`  - name: SSH hardening - ${key}
    ansible.builtin.lineinfile:
      path: /etc/ssh/sshd_config
      regexp: "^#?${key}"
      line: "${key} ${val}"
      state: present
    notify: Restart sshd`);
    });
  }

  // ── Firewall ──────────────────────────────────────────────────────────────
  if (g.hardening.enableFirewall) {
    tasks.push(`  # ── Firewall ─────────────────────────────────────────────────────────────`);
    if (isDebian) {
      tasks.push(`  - name: Install UFW
    ansible.builtin.apt:
      name: ufw
      state: present`);
      tasks.push(`  - name: UFW - deny all incoming by default
    community.general.ufw:
      default: deny
      direction: incoming`);
      g.hardening.firewallAllowPorts.forEach(port => {
        tasks.push(`  - name: UFW - allow port ${port}
    community.general.ufw:
      rule: allow
      port: "${port}"
      proto: tcp`);
      });
      tasks.push(`  - name: UFW - enable
    community.general.ufw:
      state: enabled`);
    } else if (isRhel) {
      tasks.push(`  - name: Enable firewalld
    ansible.builtin.service:
      name: firewalld
      state: started
      enabled: yes`);
      g.hardening.firewallAllowPorts.forEach(port => {
        tasks.push(`  - name: firewalld - allow port ${port}/tcp
    ansible.posix.firewalld:
      port: ${port}/tcp
      permanent: yes
      state: enabled
      immediate: yes`);
      });
    } else if (isWindows) {
      g.hardening.firewallAllowPorts.forEach(port => {
        tasks.push(`  - name: Windows Firewall - allow port ${port}
    ansible.windows.win_firewall_rule:
      name: "Allow port ${port}"
      localport: ${port}
      action: allow
      direction: in
      protocol: tcp
      state: present
      enabled: yes`);
      });
    }
  }

  // ── Services to disable ───────────────────────────────────────────────────
  if (g.hardening.disableServices.length > 0 && !isWindows) {
    tasks.push(`  # ── Disable Unused Services ──────────────────────────────────────────────`);
    tasks.push(`  - name: Disable unused services
    ansible.builtin.service:
      name: "{{ item }}"
      state: stopped
      enabled: no
    loop:
${g.hardening.disableServices.map(s => `      - ${s}`).join('\n')}
    ignore_errors: yes`);
  }

  // ── fail2ban ──────────────────────────────────────────────────────────────
  if (g.hardening.enableFail2ban && !isWindows) {
    tasks.push(`  # ── Fail2ban ─────────────────────────────────────────────────────────────`);
    tasks.push(`  - name: Install fail2ban
    ansible.builtin.package:
      name: fail2ban
      state: present`);
    tasks.push(`  - name: Configure fail2ban SSH jail
    ansible.builtin.copy:
      dest: /etc/fail2ban/jail.d/sshd.conf
      content: |
        [sshd]
        enabled  = true
        maxretry = 5
        bantime  = 3600
        findtime = 600
    notify: Restart fail2ban`);
    tasks.push(`  - name: Enable and start fail2ban
    ansible.builtin.service:
      name: fail2ban
      state: started
      enabled: yes`);
  }

  // ── auditd ────────────────────────────────────────────────────────────────
  if (g.hardening.enableAuditd && !isWindows) {
    tasks.push(`  - name: Enable auditd
    ansible.builtin.service:
      name: auditd
      state: started
      enabled: yes`);
  }

  // ── Password policy ───────────────────────────────────────────────────────
  if (g.hardening.setPasswordPolicy && !isWindows) {
    tasks.push(`  # ── Password Policy ──────────────────────────────────────────────────────`);
    tasks.push(`  - name: Set password maximum age (${g.hardening.passwordMaxAge} days)
    ansible.builtin.lineinfile:
      path: /etc/login.defs
      regexp: "^PASS_MAX_DAYS"
      line: "PASS_MAX_DAYS   ${g.hardening.passwordMaxAge}"`);
    tasks.push(`  - name: Set password minimum length (${g.hardening.passwordMinLength} chars)
    ansible.builtin.lineinfile:
      path: /etc/login.defs
      regexp: "^PASS_MIN_LEN"
      line: "PASS_MIN_LEN    ${g.hardening.passwordMinLength}"`);

    if (isDebian) {
      tasks.push(`  - name: Install libpam-pwquality
    ansible.builtin.apt:
      name: libpam-pwquality
      state: present`);
      tasks.push(`  - name: Configure pwquality
    ansible.builtin.lineinfile:
      path: /etc/security/pwquality.conf
      regexp: "^# ?minlen"
      line: "minlen = ${g.hardening.passwordMinLength}"`);
    }
  }

  // ── USB Storage ───────────────────────────────────────────────────────────
  if (g.hardening.disableUSBStorage && !isWindows) {
    tasks.push(`  # ── USB Storage ──────────────────────────────────────────────────────────`);
    tasks.push(`  - name: Disable USB storage module
    ansible.builtin.copy:
      dest: /etc/modprobe.d/usb-storage.conf
      content: "install usb-storage /bin/true\\n"
      mode: '0644'`);
  }

  // ── Auto updates ──────────────────────────────────────────────────────────
  if (g.hardening.enableAutoUpdates && isDebian) {
    tasks.push(`  # ── Automatic Security Updates ───────────────────────────────────────────`);
    tasks.push(`  - name: Install unattended-upgrades
    ansible.builtin.apt:
      name: unattended-upgrades
      state: present`);
    tasks.push(`  - name: Enable unattended-upgrades
    ansible.builtin.command: dpkg-reconfigure -plow unattended-upgrades
    changed_when: false`);
  }

  // ── SSH Authorized Keys ───────────────────────────────────────────────────
  if (g.sshAuthorizedKeys.length > 0 && !isWindows) {
    tasks.push(`  # ── SSH Authorized Keys ──────────────────────────────────────────────────`);
    g.sshAuthorizedKeys.forEach((key, i) => {
      tasks.push(`  - name: Add SSH authorized key ${i + 1}
    ansible.posix.authorized_key:
      user: root
      state: present
      key: "${key}"`);
    });
  }

  // ── Custom script ─────────────────────────────────────────────────────────
  const scriptLines = g.postInstallScript.trim().split('\n').filter(l => l && !l.startsWith('#'));
  if (scriptLines.length > 0) {
    tasks.push(`  # ── Custom Post-Install Script ───────────────────────────────────────────`);
    tasks.push(`  - name: Run custom post-install commands
    ansible.builtin.shell: |
${scriptLines.map(l => `      ${l}`).join('\n')}
    args:
      executable: ${isWindows ? 'powershell' : '/bin/bash'}
    changed_when: false`);
  }

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handlers: string[] = [];
  if (!isWindows) {
    if (isDebian || String(family) === 'all') {
      handlers.push(`  - name: Apply netplan
    ansible.builtin.command: netplan apply
    changed_when: true`);
    }
    handlers.push(`  - name: Restart sshd
    ansible.builtin.service:
      name: sshd
      state: restarted`);
    if (g.ntpServers.length > 0) {
      handlers.push(`  - name: Restart chrony
    ansible.builtin.service:
      name: chronyd
      state: restarted`);
    }
    if (g.hardening.enableFail2ban) {
      handlers.push(`  - name: Restart fail2ban
    ansible.builtin.service:
      name: fail2ban
      state: restarted`);
    }
  }

  return `---
# ============================================================
# Gold Image Playbook: ${g.name}
# Generated by PXE Deployer — ${now()}
# OS Target: ${g.osTarget} | Timezone: ${g.timezone}
# ============================================================

- name: "${g.name} — OS Standard Baseline"
  hosts: all
  become: yes
  gather_facts: yes

  vars:
    gold_image_version: "${g.name}"
    gold_image_applied: "{{ ansible_date_time.iso8601 }}"

  tasks:
${tasks.join('\n\n')}
${handlers.length > 0 ? `
  handlers:
${handlers.join('\n\n')}` : ''}
`;
}

// ─── Bash Script ──────────────────────────────────────────────────────────────

export function generateBash(g: GoldImage, family: string): string {
  const isDebian = family === 'debian' || family === 'all';
  const isRhel   = family === 'rhel';

  const sections: string[] = [];

  sections.push(`#!/usr/bin/env bash
# ============================================================
# Gold Image Script: ${g.name}
# Generated by PXE Deployer — ${now()}
# OS Target: ${g.osTarget}
# Run as root: sudo bash gold-image.sh
# ============================================================

set -euo pipefail

RED='\\033[0;31m'; GREEN='\\033[0;32m'; YELLOW='\\033[1;33m'; NC='\\033[0m'
ok()   { echo -e "  \${GREEN}✔ $*\${NC}"; }
warn() { echo -e "  \${YELLOW}⚠ $*\${NC}"; }
die()  { echo -e "  \${RED}✘ $*\${NC}"; exit 1; }

[[ \${EUID} -eq 0 ]] || die "Must run as root"
echo ""
echo "══════════════════════════════════════════════════════"
echo "  Gold Image: ${g.name}"
echo "══════════════════════════════════════════════════════"
`);

  // ── Detect OS ──────────────────────────────────────────────────────────────
  const bashRepos = g.repos ?? [];
  const hasBashRepos = bashRepos.length > 0 || g.replaceDefaultRepos;

  if (family === 'all') {
    sections.push(`# Detect package manager
if command -v apt-get >/dev/null 2>&1; then
  PKG_MANAGER="apt"
  PKG_INSTALL="apt-get install -y -qq"
  PKG_REMOVE="apt-get remove -y -qq"
elif command -v dnf >/dev/null 2>&1; then
  PKG_MANAGER="dnf"
  PKG_INSTALL="dnf install -y -q"
  PKG_REMOVE="dnf remove -y -q"
else
  PKG_MANAGER="yum"
  PKG_INSTALL="yum install -y -q"
  PKG_REMOVE="yum remove -y -q"
fi`);
  } else if (isDebian) {
    sections.push(`PKG_MANAGER="apt"
PKG_INSTALL="apt-get install -y -qq"
PKG_REMOVE="apt-get remove -y -qq"`);
  } else {
    sections.push(`PKG_MANAGER="dnf"
PKG_INSTALL="dnf install -y -q"
PKG_REMOVE="dnf remove -y -q"`);
  }

  // ── Repository configuration ───────────────────────────────────────────────
  if (hasBashRepos) {
    const repoLines: string[] = [];
    repoLines.push(`# ── Package Repositories ────────────────────────────────────────────────`);
    repoLines.push(`echo ""\necho "→ Configuring package repositories…"`);

    if (isDebian || family === 'all') {
      const debianBlock: string[] = [];
      if (g.replaceDefaultRepos) {
        debianBlock.push(`# Disable default repos
mv /etc/apt/sources.list /etc/apt/sources.list.bak 2>/dev/null || true
rm -f /etc/apt/sources.list.d/*.list /etc/apt/sources.list.d/*.sources 2>/dev/null || true
ok "Default apt sources disabled"`);
      }
      bashRepos.forEach(repo => {
        const suite = repo.suite || 'noble';
        const components = repo.components || 'main';
        const filename = repo.label.toLowerCase().replace(/\s+/g, '-');
        if (repo.gpgKeyUrl) {
          debianBlock.push(`# Import GPG key for ${repo.label}
curl -fsSL "${repo.gpgKeyUrl}" | gpg --dearmor -o /etc/apt/trusted.gpg.d/${filename}.gpg 2>/dev/null \\
  || warn "GPG key import failed for ${repo.label}"`);
        }
        debianBlock.push(`# Add apt repository: ${repo.label}
cat > /etc/apt/sources.list.d/${filename}.list << 'APTEOF'
deb ${repo.baseUrl} ${suite} ${components}
deb ${repo.baseUrl} ${suite}-updates ${components}
deb ${repo.baseUrl} ${suite}-security ${components}
APTEOF
ok "Repository added: ${repo.label} (${repo.baseUrl})"`);
      });
      if (debianBlock.length > 0) {
        if (family === 'all') {
          repoLines.push(`if [[ "$PKG_MANAGER" == "apt" ]]; then\n${debianBlock.map(b => b.split('\n').map(l => `  ${l}`).join('\n')).join('\n')}\nfi`);
        } else {
          repoLines.push(debianBlock.join('\n'));
        }
      }
    }

    if (isRhel || family === 'all') {
      const rhelBlock: string[] = [];
      if (g.replaceDefaultRepos) {
        rhelBlock.push(`# Disable all default yum/dnf repos
find /etc/yum.repos.d/ -name "*.repo" -exec sed -i 's/^enabled=1/enabled=0/' {} \\;
ok "Default yum/dnf repos disabled"`);
      }
      bashRepos.forEach(repo => {
        const repoId = repo.label.toLowerCase().replace(/\s+/g, '-');
        rhelBlock.push(`# Add yum repo: ${repo.label}
cat > /etc/yum.repos.d/${repoId}.repo << 'YUMEOF'
[${repoId}]
name=${repo.label}
baseurl=${repo.baseUrl}
enabled=1
gpgcheck=${repo.gpgCheck ? '1' : '0'}${repo.gpgKeyUrl ? `\ngpgkey=${repo.gpgKeyUrl}` : ''}
YUMEOF
ok "Repository added: ${repo.label}"`);
      });
      if (rhelBlock.length > 0) {
        if (family === 'all') {
          repoLines.push(`if [[ "$PKG_MANAGER" == "dnf" || "$PKG_MANAGER" == "yum" ]]; then\n${rhelBlock.map(b => b.split('\n').map(l => `  ${l}`).join('\n')).join('\n')}\nfi`);
        } else {
          repoLines.push(rhelBlock.join('\n'));
        }
      }
    }

    // Refresh after repo changes
    if (isDebian) {
      repoLines.push(`echo "→ Updating package lists after repo change…"\napt-get update -qq`);
    } else if (isRhel) {
      repoLines.push(`$PKG_INSTALL dnf-plugins-core -y 2>/dev/null || true\ndnf clean all -q 2>/dev/null || true`);
    } else {
      repoLines.push(`# Refresh package cache\nif [[ "$PKG_MANAGER" == "apt" ]]; then\n  apt-get update -qq\nelse\n  dnf clean all -q 2>/dev/null || true\nfi`);
    }

    sections.push(repoLines.join('\n'));
  } else if (isDebian) {
    // No custom repos — just run the standard update
    sections.push(`echo "Updating package lists…"\napt-get update -qq`);
  }

  // ── Identity ───────────────────────────────────────────────────────────────
  sections.push(`# ── System Identity ──────────────────────────────────────────────────────
echo ""
echo "→ Setting timezone and locale…"
timedatectl set-timezone "${g.timezone}" 2>/dev/null || warn "timedatectl not available"
localectl set-locale LANG="${g.locale}" 2>/dev/null  || warn "localectl not available"
ok "Timezone: ${g.timezone} / Locale: ${g.locale}"`);

  // ── Network Interface ─────────────────────────────────────────────────────
  const bashNetMode = g.networkMode ?? 'dhcp';
  if (bashNetMode === 'static' && g.staticAddress) {
    const bashIface = g.networkInterface || '"$(ip route | awk \'/default/{print $5;exit}\')"';
    const bashGw = g.staticGateway || '';
    const bashDns = g.dnsServers.join(' ');
    const bashSearch = g.searchDomains.join(' ');

    if (isDebian || family === 'all') {
      const netplanLines = [
        `network:`,
        `  version: 2`,
        `  renderer: networkd`,
        `  ethernets:`,
        `    ${g.networkInterface || 'ETH_IFACE'}:`,
        `      dhcp4: no`,
        `      addresses: ["${g.staticAddress}"]`,
        ...(bashGw ? [`      routes:\n        - to: default\n          via: ${bashGw}`] : []),
        ...(g.dnsServers.length > 0 ? [
          `      nameservers:`,
          `        addresses: [${g.dnsServers.map(d => `"${d}"`).join(', ')}]`,
          ...(g.searchDomains.length > 0 ? [`        search: [${g.searchDomains.map(d => `"${d}"`).join(', ')}]`] : []),
        ] : []),
      ].join('\n');

      const debianNetBlock = `# Configure static IP via netplan
ETH_IFACE=${g.networkInterface ? `"${g.networkInterface}"` : `$(ip route 2>/dev/null | awk '/default/{print $5;exit}')`}
mkdir -p /etc/netplan
cat > /etc/netplan/99-gold-image.yaml << NETPLAN
${netplanLines.replace('ETH_IFACE', '$ETH_IFACE')}
NETPLAN
chmod 600 /etc/netplan/99-gold-image.yaml
netplan apply 2>/dev/null || warn "netplan apply failed — reboot may be needed"
ok "Static IP configured: ${g.staticAddress}${bashGw ? ` gw ${bashGw}` : ''}"`;

      if (family === 'all') {
        sections.push(`# ── Network Interface (static IP) ────────────────────────────────────────
echo "→ Configuring static IP…"
if [[ "$PKG_MANAGER" == "apt" ]]; then
  ${debianNetBlock.split('\n').join('\n  ')}
elif [[ "$PKG_MANAGER" == "dnf" || "$PKG_MANAGER" == "yum" ]]; then
  # RHEL/Rocky — configure via nmcli
  NM_IFACE=$(ip route 2>/dev/null | awk '/default/{print $5;exit}')
  NM_CON=$(nmcli -t -f NAME,DEVICE con show 2>/dev/null | awk -F: -v i="$NM_IFACE" '$2==i{print $1}' | head -1)
  [ -z "$NM_CON" ] && NM_CON=$(nmcli -t -f NAME con show --active 2>/dev/null | head -1)
  nmcli con mod "$NM_CON" \\
    ipv4.method manual \\
    ipv4.addresses "${g.staticAddress}"${bashGw ? ` \\\n    ipv4.gateway "${bashGw}"` : ''}${bashDns ? ` \\\n    ipv4.dns "${bashDns}"` : ''}${bashSearch ? ` \\\n    ipv4.dns-search "${bashSearch}"` : ''} || warn "nmcli config failed"
  nmcli con up "$NM_CON" 2>/dev/null || warn "nmcli con up failed — reboot may apply changes"
  ok "Static IP configured: ${g.staticAddress}${bashGw ? ` gw ${bashGw}` : ''}"
fi`);
      } else {
        sections.push(`# ── Network Interface (static IP) ────────────────────────────────────────
echo "→ Configuring static IP…"
${debianNetBlock}`);
      }
    } else if (isRhel) {
      sections.push(`# ── Network Interface (static IP) ────────────────────────────────────────
echo "→ Configuring static IP via NetworkManager…"
NM_IFACE=${g.networkInterface ? `"${g.networkInterface}"` : '$(ip route 2>/dev/null | awk \'/default/{print $5;exit}\')'}
NM_CON=$(nmcli -t -f NAME,DEVICE con show 2>/dev/null | awk -F: -v i="$NM_IFACE" '$2==i{print $1}' | head -1)
[ -z "$NM_CON" ] && NM_CON=$(nmcli -t -f NAME con show --active 2>/dev/null | head -1)
nmcli con mod "$NM_CON" \\
  ipv4.method manual \\
  ipv4.addresses "${g.staticAddress}"${bashGw ? ` \\\n  ipv4.gateway "${bashGw}"` : ''}${bashDns ? ` \\\n  ipv4.dns "${bashDns}"` : ''}${bashSearch ? ` \\\n  ipv4.dns-search "${bashSearch}"` : ''} || warn "nmcli config failed"
nmcli con up "$NM_CON" 2>/dev/null || warn "nmcli con up failed — reboot may apply"
ok "Static IP configured: ${g.staticAddress}${bashGw ? ` gw ${bashGw}` : ''}"`);
    }
  }

  // ── DNS ────────────────────────────────────────────────────────────────────
  if (g.dnsServers.length > 0) {
    const resolvContent = [
      ...g.searchDomains.map(d => `search ${d}`),
      ...g.dnsServers.map(s => `nameserver ${s}`),
    ].join('\n');
    sections.push(`# ── DNS Configuration ────────────────────────────────────────────────────
echo "→ Configuring DNS…"
cat > /etc/resolv.conf << 'RESOLV'
${resolvContent}
RESOLV
ok "DNS servers: ${g.dnsServers.join(', ')}"`);
  }

  // ── NTP ────────────────────────────────────────────────────────────────────
  if (g.ntpServers.length > 0) {
    sections.push(`# ── NTP ──────────────────────────────────────────────────────────────────
echo "→ Configuring NTP…"
\${PKG_INSTALL} chrony
# Remove existing pool lines and add ours
sed -i '/^pool /d' /etc/chrony.conf 2>/dev/null || true
${g.ntpServers.map(s => `echo "pool ${s} iburst" >> /etc/chrony.conf`).join('\n')}
systemctl enable --now chronyd 2>/dev/null || systemctl enable --now chrony 2>/dev/null || true
ok "NTP servers: ${g.ntpServers.join(', ')}"`);
  }

  // ── Packages ──────────────────────────────────────────────────────────────
  if (g.packagesToInstall.length > 0) {
    sections.push(`# ── Package Baseline ─────────────────────────────────────────────────────
echo "→ Installing baseline packages…"
\${PKG_INSTALL} ${g.packagesToInstall.join(' ')}
ok "Installed: ${g.packagesToInstall.join(' ')}"`);
  }
  if (g.packagesToRemove.length > 0) {
    sections.push(`# ── Remove Unwanted Packages ─────────────────────────────────────────────
echo "→ Removing unwanted packages…"
\${PKG_REMOVE} ${g.packagesToRemove.join(' ')} 2>/dev/null || true
ok "Removed: ${g.packagesToRemove.join(' ')}"`);
  }

  // ── SSH Hardening ──────────────────────────────────────────────────────────
  sections.push(`# ── SSH Hardening ────────────────────────────────────────────────────────
echo "→ Hardening SSH…"
SSHD=/etc/ssh/sshd_config
backup_sshd() { cp \${SSHD} \${SSHD}.bak-\$(date +%Y%m%d) 2>/dev/null || true; }
backup_sshd
set_sshd() { sed -i "s|^#?\\${1}.*|\\${1} \\${2}|; t; \$a \\${1} \\${2}" \${SSHD} 2>/dev/null || echo "\\${1} \\${2}" >> \${SSHD}; }
${g.hardening.disableRootSSH ? 'set_sshd PermitRootLogin no' : ''}
${g.hardening.sshKeyAuthOnly ? 'set_sshd PasswordAuthentication no' : ''}
${g.hardening.disableEmptyPasswords ? 'set_sshd PermitEmptyPasswords no' : ''}
set_sshd X11Forwarding no
set_sshd MaxAuthTries 3
set_sshd ClientAliveInterval 300
set_sshd ClientAliveCountMax 2
systemctl restart sshd 2>/dev/null || systemctl restart ssh 2>/dev/null || true
ok "SSH hardened"`);

  // ── Firewall ──────────────────────────────────────────────────────────────
  if (g.hardening.enableFirewall) {
    if (isDebian || family === 'all') {
      sections.push(`# ── Firewall (UFW) ────────────────────────────────────────────────────────
echo "→ Configuring UFW firewall…"
\${PKG_INSTALL} ufw
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
${g.hardening.firewallAllowPorts.map(p => `ufw allow ${p}/tcp`).join('\n')}
ufw --force enable
ok "UFW enabled — allowed ports: ${g.hardening.firewallAllowPorts.join(', ')}"`);
    } else if (isRhel) {
      sections.push(`# ── Firewall (firewalld) ─────────────────────────────────────────────────
echo "→ Configuring firewalld…"
systemctl enable --now firewalld
${g.hardening.firewallAllowPorts.map(p => `firewall-cmd --permanent --add-port=${p}/tcp`).join('\n')}
firewall-cmd --reload
ok "firewalld enabled — allowed ports: ${g.hardening.firewallAllowPorts.join(', ')}"`);
    }
  }

  // ── Disable services ──────────────────────────────────────────────────────
  if (g.hardening.disableServices.length > 0) {
    sections.push(`# ── Disable Unused Services ──────────────────────────────────────────────
echo "→ Disabling unused services…"
${g.hardening.disableServices.map(s => `systemctl disable --now ${s} 2>/dev/null || true`).join('\n')}
ok "Disabled: ${g.hardening.disableServices.join(', ')}"`);
  }

  // ── fail2ban ──────────────────────────────────────────────────────────────
  if (g.hardening.enableFail2ban) {
    sections.push(`# ── fail2ban ─────────────────────────────────────────────────────────────
echo "→ Installing and configuring fail2ban…"
\${PKG_INSTALL} fail2ban
cat > /etc/fail2ban/jail.d/sshd.conf << 'F2B'
[sshd]
enabled  = true
maxretry = 5
bantime  = 3600
findtime = 600
F2B
systemctl enable --now fail2ban
ok "fail2ban configured"`);
  }

  // ── auditd ────────────────────────────────────────────────────────────────
  if (g.hardening.enableAuditd) {
    sections.push(`# ── Audit Daemon ──────────────────────────────────────────────────────────
echo "→ Enabling auditd…"
\${PKG_INSTALL} auditd 2>/dev/null || true
systemctl enable --now auditd
ok "auditd enabled"`);
  }

  // ── Password policy ───────────────────────────────────────────────────────
  if (g.hardening.setPasswordPolicy) {
    sections.push(`# ── Password Policy ──────────────────────────────────────────────────────
echo "→ Setting password policy…"
sed -i 's/^PASS_MAX_DAYS.*/PASS_MAX_DAYS   ${g.hardening.passwordMaxAge}/' /etc/login.defs
sed -i 's/^PASS_MIN_LEN.*/PASS_MIN_LEN    ${g.hardening.passwordMinLength}/'  /etc/login.defs
ok "Password: min_len=${g.hardening.passwordMinLength}, max_age=${g.hardening.passwordMaxAge}d"`);
  }

  // ── USB storage ───────────────────────────────────────────────────────────
  if (g.hardening.disableUSBStorage) {
    sections.push(`# ── Disable USB Storage ──────────────────────────────────────────────────
echo "→ Disabling USB storage…"
echo "install usb-storage /bin/true" > /etc/modprobe.d/usb-storage.conf
ok "USB storage disabled"`);
  }

  // ── Auto updates ──────────────────────────────────────────────────────────
  if (g.hardening.enableAutoUpdates && isDebian) {
    sections.push(`# ── Automatic Security Updates ───────────────────────────────────────────
echo "→ Enabling unattended-upgrades…"
\${PKG_INSTALL} unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades
ok "Automatic security updates enabled"`);
  }

  // ── SSH keys ──────────────────────────────────────────────────────────────
  if (g.sshAuthorizedKeys.length > 0) {
    sections.push(`# ── SSH Authorized Keys ──────────────────────────────────────────────────
echo "→ Adding SSH authorized keys…"
mkdir -p /root/.ssh
chmod 700 /root/.ssh
cat >> /root/.ssh/authorized_keys << 'SSHKEYS'
${g.sshAuthorizedKeys.join('\n')}
SSHKEYS
chmod 600 /root/.ssh/authorized_keys
ok "${g.sshAuthorizedKeys.length} SSH key(s) added to root"`);
  }

  // ── Custom script ─────────────────────────────────────────────────────────
  const customLines = g.postInstallScript.trim();
  if (customLines && !customLines.split('\n').every(l => !l.trim() || l.trim().startsWith('#'))) {
    sections.push(`# ── Custom Post-Install Script ───────────────────────────────────────────
echo "→ Running custom post-install script…"
${customLines}
ok "Custom script complete"`);
  }

  sections.push(`# ── Done ─────────────────────────────────────────────────────────────────
echo ""
echo -e "\${GREEN}══════════════════════════════════════════════════════\${NC}"
echo -e "\${GREEN}  ✔ Gold image applied: ${g.name}\${NC}"
echo -e "\${GREEN}══════════════════════════════════════════════════════\${NC}"
echo ""
`);

  return sections.join('\n\n');
}

// ─── PowerShell Script ────────────────────────────────────────────────────────

export function generatePowerShell(g: GoldImage): string {
  const sections: string[] = [];

  sections.push(`#Requires -RunAsAdministrator
# ============================================================
# Gold Image Script: ${g.name}
# Generated by PXE Deployer — ${now()}
# Run in PowerShell as Administrator
# ============================================================

$ErrorActionPreference = "Stop"
function Write-Step($msg) { Write-Host "  -> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "  ✔  $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  ⚠  $msg" -ForegroundColor Yellow }

Write-Host ""
Write-Host "======================================================" -ForegroundColor Blue
Write-Host "  Gold Image: ${g.name}" -ForegroundColor Blue
Write-Host "======================================================" -ForegroundColor Blue
`);

  // ── DNS ────────────────────────────────────────────────────────────────────
  if (g.dnsServers.length > 0) {
    sections.push(`# ── DNS Configuration ────────────────────────────────────────────────────
Write-Step "Configuring DNS…"
$adapters = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' }
foreach ($adapter in $adapters) {
    Set-DnsClientServerAddress -InterfaceIndex $adapter.ifIndex \`
        -ServerAddresses (${g.dnsServers.map(s => `'${s}'`).join(', ')})
}
Write-Ok "DNS servers: ${g.dnsServers.join(', ')}"`);
  }

  // ── NTP ────────────────────────────────────────────────────────────────────
  if (g.ntpServers.length > 0) {
    sections.push(`# ── NTP ──────────────────────────────────────────────────────────────────
Write-Step "Configuring NTP…"
w32tm /config /manualpeerlist:"${g.ntpServers[0]}" /syncfromflags:manual /reliable:YES /update | Out-Null
Restart-Service w32tm -Force
Write-Ok "NTP server: ${g.ntpServers[0]}"`);
  }

  // ── Timezone ───────────────────────────────────────────────────────────────
  sections.push(`# ── Timezone ─────────────────────────────────────────────────────────────
Write-Step "Setting timezone…"
Set-TimeZone -Id "${g.timezone}" -ErrorAction SilentlyContinue
Write-Ok "Timezone set to ${g.timezone}"`);

  // ── Firewall ──────────────────────────────────────────────────────────────
  if (g.hardening.enableFirewall) {
    sections.push(`# ── Windows Firewall ─────────────────────────────────────────────────────
Write-Step "Configuring Windows Firewall…"
Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled True
${g.hardening.firewallAllowPorts.map(p => `New-NetFirewallRule -DisplayName "Allow TCP ${p}" -Direction Inbound -Protocol TCP -LocalPort ${p} -Action Allow -ErrorAction SilentlyContinue`).join('\n')}
Write-Ok "Firewall enabled — allowed ports: ${g.hardening.firewallAllowPorts.join(', ')}"`);
  }

  // ── Disable services ──────────────────────────────────────────────────────
  if (g.hardening.disableServices.length > 0) {
    sections.push(`# ── Disable Unused Services ──────────────────────────────────────────────
Write-Step "Disabling unused services…"
$servicesToDisable = @(${g.hardening.disableServices.map(s => `'${s}'`).join(', ')})
foreach ($svc in $servicesToDisable) {
    try {
        Set-Service -Name $svc -StartupType Disabled -ErrorAction SilentlyContinue
        Stop-Service -Name $svc -Force -ErrorAction SilentlyContinue
        Write-Ok "Disabled: $svc"
    } catch { Write-Warn "Could not disable $svc (may not exist)" }
}
`);
  }

  // ── Password policy ───────────────────────────────────────────────────────
  if (g.hardening.setPasswordPolicy) {
    sections.push(`# ── Password Policy ──────────────────────────────────────────────────────
Write-Step "Setting password policy…"
net accounts /MAXPWAGE:${g.hardening.passwordMaxAge} /MINPWLEN:${g.hardening.passwordMinLength} | Out-Null
Write-Ok "Password: min_length=${g.hardening.passwordMinLength}, max_age=${g.hardening.passwordMaxAge} days"`);
  }

  // ── Disable empty passwords ───────────────────────────────────────────────
  if (g.hardening.disableEmptyPasswords) {
    sections.push(`# ── Disable Blank Passwords ──────────────────────────────────────────────
Write-Step "Disabling blank password accounts…"
Get-LocalUser | Where-Object { $_.PasswordRequired -eq $false -and $_.Enabled -eq $true } | ForEach-Object {
    Set-LocalUser -Name $_.Name -PasswordNeverExpires $false
    Write-Warn "Review account: $($_.Name)"
}`);
  }

  // ── Packages (Chocolatey) ─────────────────────────────────────────────────
  if (g.packagesToInstall.length > 0) {
    sections.push(`# ── Package Baseline (Chocolatey) ────────────────────────────────────────
Write-Step "Installing packages via Chocolatey…"
if (-not (Get-Command choco -ErrorAction SilentlyContinue)) {
    Write-Warn "Chocolatey not installed — skipping package install"
    Write-Warn "Install Chocolatey first: https://chocolatey.org/install"
} else {
    choco install ${g.packagesToInstall.join(' ')} -y --no-progress
    Write-Ok "Packages installed: ${g.packagesToInstall.join(', ')}"
}`);
  }

  // ── Custom script ─────────────────────────────────────────────────────────
  const customLines = g.postInstallScript.trim();
  if (customLines) {
    sections.push(`# ── Custom Post-Install Script ───────────────────────────────────────────
Write-Step "Running custom post-install script…"
${customLines}
Write-Ok "Custom script complete"`);
  }

  sections.push(`# ── Done ─────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "======================================================" -ForegroundColor Green
Write-Host "  ✔ Gold image applied: ${g.name}" -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Green
Write-Host ""
`);

  return sections.join('\n\n');
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function generateGoldImage(
  g: GoldImage,
  format: 'ansible' | 'bash' | 'powershell',
): string {
  const family = g.osTarget === 'all' ? 'all' : g.osTarget;
  switch (format) {
    case 'ansible':    return generateAnsible(g, family);
    case 'bash':       return generateBash(g, family === 'windows' ? 'debian' : family);
    case 'powershell': return generatePowerShell(g);
  }
}
