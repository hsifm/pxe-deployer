import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Sidebar from './Sidebar';
import Header from './Header';
import OfflineIndicator from '../shared/OfflineIndicator';

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
};

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  return (
    <div className="flex h-screen overflow-hidden relative" style={{ background: '#07070f' }}>
      {/* Ambient background orbs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
        <div className="ambient-orb" style={{
          width: 700, height: 700,
          background: 'radial-gradient(circle, rgba(37,99,235,0.13) 0%, transparent 65%)',
          top: -280, left: -80,
          filter: 'blur(80px)',
        }} />
        <div className="ambient-orb" style={{
          width: 600, height: 600,
          background: 'radial-gradient(circle, rgba(124,58,237,0.10) 0%, transparent 65%)',
          bottom: -200, right: -80,
          filter: 'blur(80px)',
        }} />
        <div className="ambient-orb" style={{
          width: 350, height: 350,
          background: 'radial-gradient(circle, rgba(6,182,212,0.07) 0%, transparent 65%)',
          top: '45%', right: '22%',
          filter: 'blur(60px)',
        }} />
      </div>

      <div className="relative flex w-full h-full" style={{ zIndex: 1 }}>
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
        <div className="flex flex-col flex-1 overflow-hidden min-w-0">
          <Header />
          <main className="flex-1 overflow-y-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                className="p-5 min-h-full"
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>
      <OfflineIndicator />
    </div>
  );
}
