/**
 * Writes per-MAC GRUB2 EFI config files to the TFTP root.
 *
 * File path convention (matches grub-efi automatic discovery):
 *   <tftp-root>/grub/grub.cfg-01-<mac-hyphenated>
 *
 * e.g. /srv/pxe/tftp/grub/grub.cfg-01-aa-bb-cc-dd-ee-ff
 */
import fs from 'fs';
import path from 'path';
import { normaliseMac } from './deployStore';

const PXE_ROOT = process.env.PXE_ROOT ?? '/srv/pxe';
const TFTP_ROOT = path.join(PXE_ROOT, 'tftp');
const GRUB_DIR  = path.join(TFTP_ROOT, 'grub');

/** OS profile id → directory name under /http/images/ */
const OS_IMAGE_DIR: Record<string, string> = {
  'ubuntu-22-04': 'ubuntu-22.04',
  'ubuntu-24-04': 'ubuntu-24.04',
  'debian-12':    'debian-12',
  'rocky-9':      'rocky-9',
  'windows-2025': 'windows-2025',
};

/** Kernel arg sets per OS family */
const KERNEL_ARGS: Record<string, string> = {
  debian:  'auto=true priority=critical net.ifnames=0 biosdevname=0 quiet ---',
  rhel:    'quiet net.ifnames=0 biosdevname=0',
  windows: '', // Windows uses chainloading, not kernel args
};

export interface GrubWriteOptions {
  mac: string;        // any format — will be normalised
  hostname: string;
  osProfileId: string;
  osFamily: 'debian' | 'rhel' | 'windows';
  osName: string;
  apiHost: string;    // e.g. 192.168.1.10
  extraKernelArgs?: string;
}

function ensureGrubDir(): void {
  if (!fs.existsSync(GRUB_DIR)) fs.mkdirSync(GRUB_DIR, { recursive: true });
}

function grubConfigPath(mac: string): string {
  return path.join(GRUB_DIR, `grub.cfg-01-${normaliseMac(mac)}`);
}

export function writeInstallConfig(opts: GrubWriteOptions): void {
  ensureGrubDir();

  const mac     = normaliseMac(opts.mac);
  const imgDir  = OS_IMAGE_DIR[opts.osProfileId] ?? opts.osProfileId;
  const imgHost = opts.apiHost;  // files served from pxe-files on port 80

  let content: string;

  if (opts.osFamily === 'windows') {
    // Windows: chainload WinPE EFI
    content = `# PXE Deployer — ${opts.osName} — ${opts.hostname}
# MAC: ${mac}
set timeout=5
set default=0

insmod all_video
insmod net
insmod efinet
insmod http

menuentry "Install ${opts.osName} — ${opts.hostname}" {
  chainloader (http,${imgHost})/images/${imgDir}/bootmgr.efi
}
`;
  } else {
    // Linux — kernel + initrd via HTTP
    const baseArgs = KERNEL_ARGS[opts.osFamily] ?? '';
    const cfgUrl   = `http://${imgHost}/configs/${mac}.cfg`;
    const ksParam  = opts.osFamily === 'rhel'
      ? `inst.repo=http://${imgHost}/images/${imgDir}/ inst.ks=${cfgUrl}`
      : `url=${cfgUrl}`;
    const initrd   = opts.osFamily === 'rhel' ? 'initrd.img' : 'initrd';
    const extra    = opts.extraKernelArgs ? ` ${opts.extraKernelArgs}` : '';

    content = `# PXE Deployer — ${opts.osName} — ${opts.hostname}
# MAC: ${mac}
set timeout=5
set default=0

insmod all_video
insmod net
insmod efinet
insmod http

menuentry "Install ${opts.osName} — ${opts.hostname}" {
  set gfxpayload=keep
  linux  (http,${imgHost})/images/${imgDir}/vmlinuz \\
    ${ksParam} \\
    ${baseArgs}${extra}
  initrd (http,${imgHost})/images/${imgDir}/${initrd}
}
`;
  }

  fs.writeFileSync(grubConfigPath(opts.mac), content, 'utf8');
}

/** After install completes, rewrite to local-boot so server won't loop. */
export function writeLocalBootConfig(mac: string): void {
  ensureGrubDir();
  const content = `# PXE Deployer — local boot (install complete)
set timeout=3
set default=0

menuentry "Boot from local disk" {
  exit
}
`;
  fs.writeFileSync(grubConfigPath(mac), content, 'utf8');
}

/** Remove per-MAC GRUB config entirely (falls back to grub-default.cfg). */
export function removeGrubConfig(mac: string): void {
  const p = grubConfigPath(mac);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}
