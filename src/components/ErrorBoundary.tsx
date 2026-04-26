import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface State { hasError: boolean; message: string }

export default class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // In production you'd send this to an error reporting service.
    // Using console.error is safe — it's not a secret and doesn't leak to the DOM.
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center p-6"
        style={{ background: '#07070f' }}>
        <div className="max-w-md w-full rounded-2xl p-8 space-y-5 text-center"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
            <AlertTriangle size={26} className="text-red-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Something went wrong</h2>
            <p className="text-sm text-slate-500 mt-1">An unexpected error occurred in the application.</p>
            {this.state.message && (
              <code className="mt-3 block text-xs text-red-400/80 bg-black/30 rounded-xl px-3 py-2 font-mono text-left break-all">
                {this.state.message}
              </code>
            )}
          </div>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-slate-200 transition-colors"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <RefreshCw size={14} />
            Reload application
          </button>
        </div>
      </div>
    );
  }
}
