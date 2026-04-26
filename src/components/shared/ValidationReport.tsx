import React from 'react';
import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import Modal from './Modal';
import { ValidationCheck, ValidationCategory, summarize } from '../../lib/validateConfig';

const CATEGORY_LABELS: Record<ValidationCategory, string> = {
  general: 'General',
  network: 'Network',
  disk: 'Disk & Partitions',
  packages: 'Packages',
  commands: 'Commands',
  agents: 'Agents',
};

const CATEGORY_ORDER: ValidationCategory[] = ['general', 'network', 'disk', 'packages', 'commands', 'agents'];

function LevelIcon({ level }: { level: ValidationCheck['level'] }) {
  if (level === 'pass') return <CheckCircle size={15} className="text-emerald-400 flex-shrink-0 mt-0.5" />;
  if (level === 'warn') return <AlertTriangle size={15} className="text-amber-400 flex-shrink-0 mt-0.5" />;
  return <XCircle size={15} className="text-red-400 flex-shrink-0 mt-0.5" />;
}

interface Props {
  open: boolean;
  onClose: () => void;
  checks: ValidationCheck[];
  configName: string;
  osName: string;
}

export default function ValidationReport({ open, onClose, checks, configName, osName }: Props) {
  const { pass, warn, fail } = summarize(checks);
  const overall: ValidationCheck['level'] = fail > 0 ? 'fail' : warn > 0 ? 'warn' : 'pass';

  const grouped = CATEGORY_ORDER.reduce<Record<ValidationCategory, ValidationCheck[]>>((acc, cat) => {
    acc[cat] = checks.filter(c => c.category === cat);
    return acc;
  }, {} as Record<ValidationCategory, ValidationCheck[]>);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Configuration Validation Report"
      subtitle={`${configName} → ${osName}`}
      size="lg"
    >

      {/* Summary bar */}
      <div className="flex items-center gap-4 p-3 bg-slate-800/60 rounded-lg border border-slate-700/60 mb-5">
        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${
          overall === 'pass' ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/40'
          : overall === 'warn' ? 'bg-amber-900/40 text-amber-300 border border-amber-700/40'
          : 'bg-red-900/40 text-red-300 border border-red-700/40'
        }`}>
          {overall === 'pass' ? <CheckCircle size={14} /> : overall === 'warn' ? <AlertTriangle size={14} /> : <XCircle size={14} />}
          {overall === 'pass' ? 'Ready to deploy' : overall === 'warn' ? 'Warnings' : 'Deployment blocked'}
        </div>
        <div className="flex items-center gap-3 text-sm ml-auto">
          <span className="flex items-center gap-1 text-emerald-400"><CheckCircle size={13} />{pass}</span>
          <span className="flex items-center gap-1 text-amber-400"><AlertTriangle size={13} />{warn}</span>
          <span className="flex items-center gap-1 text-red-400"><XCircle size={13} />{fail}</span>
        </div>
      </div>

      {/* Checks grouped by category */}
      <div className="space-y-4 max-h-[52vh] overflow-y-auto pr-1">
        {CATEGORY_ORDER.map(cat => {
          const catChecks = grouped[cat];
          if (catChecks.length === 0) return null;
          const catFail = catChecks.some(c => c.level === 'fail');
          const catWarn = catChecks.some(c => c.level === 'warn');
          return (
            <div key={cat}>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {CATEGORY_LABELS[cat]}
                </h3>
                {catFail && <XCircle size={11} className="text-red-400" />}
                {!catFail && catWarn && <AlertTriangle size={11} className="text-amber-400" />}
              </div>
              <div className="space-y-1">
                {catChecks.map(check => (
                  <div
                    key={check.id}
                    className={`flex gap-2.5 p-2.5 rounded-lg border text-sm ${
                      check.level === 'pass' ? 'bg-slate-800/30 border-slate-700/30'
                      : check.level === 'warn' ? 'bg-amber-900/10 border-amber-800/30'
                      : 'bg-red-900/10 border-red-800/30'
                    }`}
                  >
                    <LevelIcon level={check.level} />
                    <div className="min-w-0">
                      <div className="font-medium text-slate-200 text-xs">{check.title}</div>
                      {check.detail && (
                        <div className="text-xs text-slate-400 mt-0.5 leading-relaxed">{check.detail}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

    </Modal>
  );
}
