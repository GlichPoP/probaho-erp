import React, { useState, useEffect } from 'react';
import { Minus, Square, Copy, X, Database, ShieldCheck, Box } from 'lucide-react';
import { ProbahoLogo } from './ProbahoLogo';

interface TitleBarProps {
  appName?: string;
  activeWarehouseName?: string;
  dbStatus?: 'connected' | 'syncing' | 'error';
}

export const TitleBar: React.FC<TitleBarProps> = ({
  appName = 'Probaho ERP',
  activeWarehouseName = 'Main Central DC',
  dbStatus = 'connected'
}) => {
  const [isMaximized, setIsMaximized] = useState<boolean>(false);

  useEffect(() => {
    const api = (window as any).api || (window as any).electronAPI;
    if (api && api.onWindowMaximizedChange) {
      api.onWindowMaximizedChange((maximized: boolean) => {
        setIsMaximized(maximized);
      });
    }
  }, []);

  const handleMinimize = () => {
    const api = (window as any).api || (window as any).electronAPI;
    if (api?.minimizeWindow) {
      api.minimizeWindow();
    }
  };

  const handleMaximize = () => {
    const api = (window as any).api || (window as any).electronAPI;
    if (api?.maximizeWindow) {
      api.maximizeWindow();
      setIsMaximized(!isMaximized);
    }
  };

  const handleClose = () => {
    const api = (window as any).api || (window as any).electronAPI;
    if (api?.closeWindow) {
      api.closeWindow();
    }
  };

  return (
    <header
      className="electron-drag-region flex items-center justify-between border-b select-none z-50"
      style={{
        height: '36px',
        backgroundColor: 'var(--titlebar-bg)',
        borderColor: 'var(--titlebar-border)',
        color: 'var(--titlebar-text)',
        fontSize: '0.78rem'
      }}
    >
      {/* Left: Application Logo & Name (Very Top-Left Corner) */}
      <div className="flex items-center gap-2 px-3">
        <ProbahoLogo size={18} />
        <span className="font-semibold tracking-wide">{appName}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-dim)' }}>
          v1.0.0
        </span>
      </div>

      {/* Center: System Liveness & Operational Status Badges */}
      <div className="flex items-center gap-4 electron-no-drag">
        {/* Offline Badge */}
        <div
          className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium"
          style={{ backgroundColor: 'var(--emerald-bg)', color: 'var(--emerald)', border: '1px solid var(--emerald-border)' }}
          title="Running 100% locally with embedded SQLite 3. No cloud latency or remote telemetry."
        >
          <ShieldCheck size={12} />
          <span>100% Offline Engine</span>
        </div>

        {/* Database Status Indicator */}
        <div
          className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium"
          style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)', border: '1px solid var(--border-color)' }}
          title="SQLite WebAssembly with atomic WAL file persistence"
        >
          <Database size={12} style={{ color: dbStatus === 'connected' ? 'var(--emerald)' : 'var(--amber)' }} />
          <span>SQLite 3 (WAL Synced)</span>
        </div>

        {/* Active Warehouse Indicator */}
        <div
          className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium"
          style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)', border: '1px solid var(--border-color)' }}
        >
          <Box size={12} style={{ color: 'var(--accent-primary)' }} />
          <span>DC: <strong>{activeWarehouseName}</strong></span>
        </div>
      </div>

      {/* Right: Window Control Action Buttons */}
      <div className="flex items-center h-full electron-no-drag">
        <button
          onClick={handleMinimize}
          className="h-full px-3.5 flex items-center justify-center transition-colors"
          style={{ color: 'var(--titlebar-text)' }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--titlebar-btn-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          title="Minimize Window"
        >
          <Minus size={13} />
        </button>

        <button
          onClick={handleMaximize}
          className="h-full px-3.5 flex items-center justify-center transition-colors"
          style={{ color: 'var(--titlebar-text)' }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--titlebar-btn-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          title={isMaximized ? "Restore Window" : "Maximize Window"}
        >
          {isMaximized ? <Copy size={11} className="rotate-180" /> : <Square size={11} />}
        </button>

        <button
          onClick={handleClose}
          className="h-full px-3.5 flex items-center justify-center transition-colors"
          style={{ color: 'var(--titlebar-text)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--titlebar-close-hover)';
            e.currentTarget.style.color = '#FFFFFF';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = 'var(--titlebar-text)';
          }}
          title="Close Application"
        >
          <X size={14} />
        </button>
      </div>
    </header>
  );
};

export default TitleBar;
