import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { Toaster } from 'react-hot-toast';
import { store, persistor } from './store';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout/Layout';
import Dashboard from './pages/Dashboard';
import OSProfiles from './pages/OSProfiles';
import OSDetail from './pages/OSDetail';
import ConfigurationEditor from './pages/ConfigurationEditor';
import ServerInventory from './pages/ServerInventory';
import NetworkDiscovery from './pages/NetworkDiscovery';
import DeploymentHistory from './pages/DeploymentHistory';
import GoldImage from './pages/GoldImage';
import BootMenu from './pages/BootMenu';
import Settings from './pages/Settings';
import DeployWizard from './pages/DeployWizard';

function LoadingFallback() {
  return (
    <div className="flex h-screen items-center justify-center bg-[#080810]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect width="20" height="8" x="2" y="2" rx="2" ry="2"/>
            <rect width="20" height="8" x="2" y="14" rx="2" ry="2"/>
            <line x1="6" x2="6.01" y1="6" y2="6"/>
            <line x1="6" x2="6.01" y1="18" y2="18"/>
          </svg>
        </div>
        <div className="w-32 h-1 bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full bg-blue-600 rounded-full animate-pulse" style={{ width: '60%' }} />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
    <Provider store={store}>
      <PersistGate loading={<LoadingFallback />} persistor={persistor}>
        <Toaster
          position="bottom-right"
          toastOptions={{
            duration: 3500,
            style: {
              background: 'rgba(19,19,31,0.95)',
              color: '#e2e8f0',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '12px',
              backdropFilter: 'blur(16px)',
              fontSize: '13px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            },
            success: {
              iconTheme: { primary: '#10b981', secondary: '#052e16' },
            },
            error: {
              iconTheme: { primary: '#ef4444', secondary: '#1f0707' },
            },
          }}
        />
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/os-profiles" element={<OSProfiles />} />
              <Route path="/os-profiles/:id" element={<OSDetail />} />
              <Route path="/os-profiles/:osId/config/:configId" element={<ConfigurationEditor />} />
              <Route path="/servers" element={<ServerInventory />} />
              <Route path="/deploy" element={<DeployWizard />} />
              <Route path="/discovery" element={<NetworkDiscovery />} />
              <Route path="/deployments" element={<DeploymentHistory />} />
              <Route path="/gold-image" element={<GoldImage />} />
              <Route path="/boot-menu" element={<BootMenu />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </PersistGate>
    </Provider>
    </ErrorBoundary>
  );
}
