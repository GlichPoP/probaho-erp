import React from 'react';
import {
  LayoutDashboard,
  Users,
  ShoppingBag,
  Boxes,
  Building2,
  Truck,
  Settings,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Database,
  Store
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export type ERPModuleTab = 'dashboard' | 'showroom' | 'suppliers' | 'procurement' | 'inventory' | 'warehouses' | 'logistics' | 'settings';

export interface SidebarProps {
  activeTab: ERPModuleTab;
  onTabChange: (tab: ERPModuleTab) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  allowedTabs?: string[];
  companyName?: string;
  companyLogoUrl?: string;
  onOpenCompanySettings?: () => void;
  counts?: {
    lowStock?: number;
    pendingPOs?: number;
    activeShipments?: number;
  };
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  isCollapsed,
  onToggleCollapse,
  allowedTabs,
  companyName,
  companyLogoUrl,
  onOpenCompanySettings,
  counts = { lowStock: 0, pendingPOs: 0, activeShipments: 0 }
}) => {
  const { theme, toggleTheme } = useTheme();

  const navItems = [
    {
      id: 'dashboard' as ERPModuleTab,
      label: 'Dashboard',
      icon: LayoutDashboard,
      description: 'Operations KPI Overview'
    },
    {
      id: 'showroom' as ERPModuleTab,
      label: 'Showroom / POS',
      icon: Store,
      description: 'Walk-in Counter Sales & Receipt Chit'
    },
    {
      id: 'suppliers' as ERPModuleTab,
      label: 'Suppliers',
      icon: Users,
      description: 'Vendor Directory & Lead Times'
    },
    {
      id: 'procurement' as ERPModuleTab,
      label: 'Procurement',
      icon: ShoppingBag,
      badge: counts.pendingPOs && counts.pendingPOs > 0 ? counts.pendingPOs : undefined,
      badgeType: 'badge-warning',
      description: 'Purchase Orders & GRN Inspection'
    },
    {
      id: 'inventory' as ERPModuleTab,
      label: 'Inventory & Stock',
      icon: Boxes,
      badge: counts.lowStock && counts.lowStock > 0 ? counts.lowStock : undefined,
      badgeType: 'badge-danger',
      description: 'Stock Balances, Batches & Adjustments'
    },
    {
      id: 'warehouses' as ERPModuleTab,
      label: 'Warehouses & Bins',
      icon: Building2,
      description: 'Facilities, Bin Hierarchy & In-Transit Transfers'
    },
    {
      id: 'logistics' as ERPModuleTab,
      label: 'Logistics & Fulfillment',
      icon: Truck,
      badge: counts.activeShipments && counts.activeShipments > 0 ? counts.activeShipments : undefined,
      badgeType: 'badge-info',
      description: 'Shipments, Carrier Tracking & RTO'
    },
    {
      id: 'settings' as ERPModuleTab,
      label: 'System & Backup',
      icon: Settings,
      description: 'Themes, SQLite Backup/Restore'
    }
  ];

  return (
    <aside
      className="flex flex-col border-r h-full transition-all duration-200 select-none z-30"
      style={{
        width: isCollapsed ? '68px' : '250px',
        backgroundColor: 'var(--bg-secondary)',
        borderColor: 'var(--border-color)'
      }}
    >
      {/* Company Brand & Collapse Header (Directly beneath TitleBar) */}
      <div
        className="flex items-center justify-between px-3 border-b"
        style={{ height: '60px', borderColor: 'var(--border-color)' }}
      >
        {!isCollapsed && (
          <div
            onClick={onOpenCompanySettings}
            className={`flex items-center gap-2.5 min-w-0 flex-1 ${onOpenCompanySettings ? 'cursor-pointer hover:opacity-85 transition-opacity' : ''}`}
            title={onOpenCompanySettings ? `${companyName || 'Company Profile'} • Click to customize logo & name in Settings` : undefined}
          >
            {companyLogoUrl ? (
              <img
                src={companyLogoUrl}
                alt={companyName || 'Company Logo'}
                className="w-8 h-8 rounded-lg object-contain bg-white/5 border border-slate-700/50 p-0.5 shadow-sm select-none shrink-0"
              />
            ) : (
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shadow-sm shrink-0 border select-none"
                style={{
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  borderColor: 'rgba(16, 185, 129, 0.35)',
                  color: '#10B981'
                }}
              >
                {(companyName || 'P').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex flex-col min-w-0 flex-1">
              <span className="font-bold text-xs tracking-tight text-[var(--text-main)] truncate" title={companyName}>
                {companyName || 'Probaho Supply Chain Ltd.'}
              </span>
              <span className="text-[10px] text-[var(--text-dim)] truncate">
                Enterprise Workspace
              </span>
            </div>
          </div>
        )}
        {isCollapsed && (
          <div
            onClick={onOpenCompanySettings}
            className={`mx-auto ${onOpenCompanySettings ? 'cursor-pointer hover:opacity-85 transition-opacity' : ''}`}
            title={companyName || 'Company Profile'}
          >
            {companyLogoUrl ? (
              <img
                src={companyLogoUrl}
                alt={companyName || 'Company Logo'}
                className="w-7 h-7 rounded-lg object-contain bg-white/5 border border-slate-700/50 p-0.5 select-none"
              />
            ) : (
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs border select-none"
                style={{
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  borderColor: 'rgba(16, 185, 129, 0.35)',
                  color: '#10B981'
                }}
              >
                {(companyName || 'P').charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        )}
        <button
          onClick={onToggleCollapse}
          className="p-1.5 rounded hover-lift flex items-center justify-center transition-colors shrink-0"
          style={{
            backgroundColor: 'var(--bg-hover)',
            color: 'var(--text-muted)',
            border: '1px solid var(--border-color)',
            margin: isCollapsed ? '0 auto' : '0'
          }}
          title={isCollapsed ? 'Expand Sidebar (Ctrl+B)' : 'Collapse Sidebar (Ctrl+B)'}
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {navItems
          .filter((item) => !allowedTabs || allowedTabs.length === 0 || allowedTabs.includes(item.id))
          .map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                isActive
                  ? 'font-semibold shadow-sm'
                  : 'hover:bg-[var(--bg-hover)] text-[var(--text-muted)]'
              }`}
              style={{
                backgroundColor: isActive ? 'var(--bg-card)' : 'transparent',
                color: isActive ? 'var(--accent-primary)' : undefined,
                border: isActive ? '1px solid var(--border-color)' : '1px solid transparent'
              }}
              title={isCollapsed ? `${item.label} — ${item.description}` : undefined}
            >
              <Icon
                size={19}
                style={{
                  color: isActive ? 'var(--accent-primary)' : 'var(--text-dim)',
                  flexShrink: 0
                }}
              />
              {!isCollapsed && (
                <div className="flex-1 flex items-center justify-between min-w-0">
                  <span className="truncate text-[0.84rem]">{item.label}</span>
                  {item.badge !== undefined && (
                    <span className={`badge ${item.badgeType || 'badge-primary'} ml-2`}>
                      {item.badge}
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom Utility Controls */}
      <div
        className="p-2 border-t flex flex-col gap-1.5"
        style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-primary)' }}
      >
        {/* Theme Toggle Button */}
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
          title={`Current Theme: ${theme.toUpperCase()} (Click to toggle)`}
        >
          {theme === 'light' ? (
            <Sun size={17} style={{ color: 'var(--amber)' }} />
          ) : (
            <Moon size={17} style={{ color: 'var(--accent-primary)' }} />
          )}
          {!isCollapsed && (
            <span className="text-xs font-medium capitalize">
              Theme: {theme}
            </span>
          )}
        </button>

        {/* Quick Database Backup Action */}
        <button
          onClick={() => onTabChange('settings')}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
          title="SQLite Database Health & Backup"
        >
          <Database size={17} style={{ color: 'var(--emerald)' }} />
          {!isCollapsed && (
            <span className="text-xs font-medium">
              Database Sync
            </span>
          )}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
