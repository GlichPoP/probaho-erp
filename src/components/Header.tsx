import React, { useState } from 'react';
import { 
  Search, 
  MapPin, 
  CheckCircle2, 
  User, 
  Crown, 
  LogOut, 
  Shield, 
  ChevronDown, 
  KeyRound,
  Compass 
} from 'lucide-react';
import type { UserAccount } from '../services/authService';

export interface HeaderProps {
  activeWarehouseId: string | number;
  warehouses: Array<{ id: string | number; name: string; code?: string; warehouse_code?: string }>;
  onSelectWarehouse: (id: string | number) => void;
  onOpenCommandSearch?: () => void;
  currentUser?: UserAccount | null;
  onLogout?: () => void;
  onNavigateToStaff?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeWarehouseId,
  warehouses,
  onSelectWarehouse,
  onOpenCommandSearch,
  currentUser,
  onLogout,
  onNavigateToStaff
}) => {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const isMaster = currentUser?.role === 'master';
  const isGuest = currentUser?.username === 'guest' || currentUser?.id === 'usr-guest-preview';

  return (
    <header
      className="flex items-center justify-between px-6 border-b z-20 select-none"
      style={{
        height: '56px',
        backgroundColor: 'var(--bg-card)',
        borderColor: 'var(--border-color)'
      }}
    >
      {/* Search Input Trigger (Ctrl+K) */}
      <div className="flex items-center gap-3 w-72">
        <div
          onClick={onOpenCommandSearch}
          className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer hover-lift text-xs"
          style={{
            backgroundColor: 'var(--bg-primary)',
            borderColor: 'var(--border-color)',
            color: 'var(--text-dim)'
          }}
        >
          <Search size={14} />
          <span>Search SKUs, POs, Shipments...</span>
          <kbd
            className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded border"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
          >
            Ctrl+K
          </kbd>
        </div>
      </div>

      {/* Right Controls: Warehouse Selector, Sync Status & User Profile */}
      <div className="flex items-center gap-3.5">
        {/* Active Warehouse Dropdown */}
        <div className="flex items-center gap-2">
          <MapPin size={15} style={{ color: 'var(--accent-primary)' }} />
          <span className="text-xs font-medium text-[var(--text-muted)]">Operating DC:</span>
          <select
            value={activeWarehouseId}
            onChange={(e) => onSelectWarehouse(e.target.value)}
            className="px-2.5 py-1 text-xs font-semibold rounded-md border cursor-pointer outline-none"
            style={{
              backgroundColor: 'var(--bg-primary)',
              borderColor: 'var(--border-color)',
              color: 'var(--text-main)',
              width: 'auto'
            }}
          >
            {warehouses.map((wh) => (
              <option key={String(wh.id)} value={String(wh.id)}>
                {wh.name} ({wh.code || wh.warehouse_code || String(wh.id)})
              </option>
            ))}
          </select>
        </div>

        {/* Sync Status Badge */}
        <div
          className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
          style={{ backgroundColor: 'var(--emerald-bg)', color: 'var(--emerald)', border: '1px solid var(--emerald-border)' }}
        >
          <CheckCircle2 size={13} />
          <span>Offline WAL Active</span>
        </div>

        {/* Guest Preview Badge & Quick Exit */}
        {isGuest && (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
            style={{
              backgroundColor: 'rgba(245, 158, 11, 0.12)',
              color: '#f59e0b',
              border: '1px solid rgba(245, 158, 11, 0.3)'
            }}
          >
            <Compass size={13} />
            <span>Guest Preview</span>
          </div>
        )}

        {isGuest && onLogout && (
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors hover:bg-rose-500/10 hover:border-rose-500/30 hover:text-rose-400"
            style={{
              backgroundColor: 'var(--bg-primary)',
              borderColor: 'var(--border-color)',
              color: 'var(--text-muted)'
            }}
            title="Exit Guest Mode to Sign In or Setup Master ID"
          >
            <LogOut size={13} />
            <span className="hidden sm:inline">Exit Guest</span>
          </button>
        )}

        {/* Active User Badge & Session Dropdown */}
        {currentUser && (
          <div className="relative">
            <button
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="flex items-center gap-2 px-2.5 py-1 rounded-lg border hover:bg-slate-700/30 transition-all text-xs"
              style={{
                backgroundColor: 'var(--bg-primary)',
                borderColor: 'var(--border-color)'
              }}
            >
              <div className={`w-6 h-6 rounded-md flex items-center justify-center font-bold text-[11px] ${
                isMaster 
                  ? 'bg-amber-500/20 text-amber-400' 
                  : isGuest
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'bg-emerald-500/20 text-emerald-400'
              }`}>
                {isMaster ? <Crown size={13} /> : isGuest ? <Compass size={13} /> : currentUser.name.charAt(0).toUpperCase()}
              </div>

              <div className="text-left hidden sm:block">
                <div className="font-semibold leading-tight text-[11px] text-[var(--text-main)]">
                  {currentUser.name}
                </div>
                <div className="text-[9px] uppercase tracking-wider font-semibold text-[var(--accent-primary)]">
                  {isMaster ? 'Master Admin' : isGuest ? 'Guest Previewer' : (currentUser.designation || currentUser.role)}
                </div>
              </div>

              <ChevronDown size={12} className="text-slate-400" />
            </button>

            {/* Dropdown Menu */}
            {isUserMenuOpen && (
              <>
                <div 
                  className="fixed inset-0 z-30" 
                  onClick={() => setIsUserMenuOpen(false)} 
                />
                <div 
                  className="absolute right-0 mt-1.5 w-52 rounded-xl shadow-2xl border p-1.5 z-40 animate-in fade-in zoom-in-95 duration-150"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    borderColor: 'var(--border-color)'
                  }}
                >
                  <div className="px-3 py-2 border-b mb-1" style={{ borderColor: 'var(--border-color)' }}>
                    <div className="text-xs font-bold text-[var(--text-main)]">{currentUser.name}</div>
                    <div className="text-[10px] text-slate-400 font-mono">@{currentUser.username}</div>
                  </div>

                  {isMaster && onNavigateToStaff && (
                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        onNavigateToStaff();
                      }}
                      className="w-full text-left px-3 py-1.5 rounded-lg text-xs flex items-center gap-2 hover:bg-emerald-500/10 text-emerald-400 transition-colors"
                    >
                      <Shield size={14} />
                      <span>Manage Staff & Access</span>
                    </button>
                  )}

                  {onLogout && (
                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        onLogout();
                      }}
                      className="w-full text-left px-3 py-1.5 rounded-lg text-xs flex items-center gap-2 hover:bg-rose-500/10 text-rose-400 transition-colors"
                    >
                      <LogOut size={14} />
                      <span>{isGuest ? 'Exit Guest Mode / Sign In' : 'Switch User / Log Out'}</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
