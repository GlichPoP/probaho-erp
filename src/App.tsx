import React, { useState, useEffect } from 'react';
import { TitleBar } from './components/TitleBar';
import { Sidebar, type ERPModuleTab } from './components/Sidebar';
import { Header } from './components/Header';
import { SettingsView } from './views/SettingsView';
import { DashboardView } from './views/DashboardView';
import { SuppliersView } from './views/SuppliersView';
import { ProcurementView } from './views/ProcurementView';
import { InventoryView } from './views/InventoryView';
import { WarehousesView } from './views/WarehousesView';
import { LogisticsView } from './views/LogisticsView';
import { ShowroomView } from './views/ShowroomView';
import { CommandPalette } from './components/CommandPalette';
import { LoginScreen } from './components/auth/LoginScreen';
import { authService, type UserAccount } from './services/authService';
import { dbService } from './services/db';

export const App: React.FC = () => {
  // Authentication & Session State
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);

  const [activeTab, setActiveTab] = useState<ERPModuleTab>('dashboard');
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      return localStorage.getItem('probaho_sidebar_collapsed') === 'true';
    }
    return false;
  });

  const [activeWarehouseId, setActiveWarehouseId] = useState<string>('wh-central-dc');
  const [warehouses, setWarehouses] = useState<Array<{ id: string; name: string; code: string }>>([
    { id: 'wh-central-dc', name: 'Main Central DC', code: 'WH-CENTRAL' },
    { id: 'wh-north-depot', name: 'North Regional Depot', code: 'WH-NORTH' },
    { id: 'wh-port-terminal', name: 'Chittagong Port Terminal', code: 'WH-PORT' },
  ]);

  const [counts, setCounts] = useState<{ lowStock: number; pendingPOs: number; activeShipments: number }>({
    lowStock: 0,
    pendingPOs: 1,
    activeShipments: 1
  });

  const [companyProfile, setCompanyProfile] = useState<{ name: string; logoUrl: string }>({
    name: 'Probaho Supply Chain Ltd.',
    logoUrl: ''
  });

  const loadCompanyProfile = async () => {
    try {
      await dbService.initialize();
      const rows = await dbService.query<{ key: string; value: string }>(
        "SELECT key, value FROM system_settings WHERE key IN ('company_name', 'company_logo');"
      );
      const map = new Map<string, string>();
      rows.forEach((r) => map.set(r.key, r.value));
      setCompanyProfile({
        name: map.get('company_name') || 'Probaho Supply Chain Ltd.',
        logoUrl: map.get('company_logo') || ''
      });
    } catch (err) {
      console.warn('Could not load company profile in App:', err);
    }
  };

  // Check auth session on startup
  useEffect(() => {
    const checkSession = async () => {
      try {
        await dbService.initialize();

        const restoredUser = await authService.restoreSession();
        if (restoredUser) {
          setCurrentUser(restoredUser);
          setIsAuthenticated(true);
          if (restoredUser.role !== 'master' && restoredUser.allowed_tabs && restoredUser.allowed_tabs.length > 0) {
            if (!restoredUser.allowed_tabs.includes(activeTab)) {
              setActiveTab(restoredUser.allowed_tabs[0] as ERPModuleTab);
            }
          }
          setIsAuthChecking(false);
          return;
        }

        const isConfigured = await authService.isMasterConfigured();
        if (!isConfigured) {
          setIsAuthenticated(false);
          setIsAuthChecking(false);
          return;
        }

        setIsAuthenticated(false);
      } catch (err) {
        console.warn('Session check warning:', err);
        setIsAuthenticated(false);
      } finally {
        setIsAuthChecking(false);
      }
    };
    checkSession();
  }, []);

  // Refresh counts helper
  const refreshBadgeCounts = async () => {
    try {
      const lowStockRes = await dbService.query<{ count: number }>(`
        SELECT COUNT(*) as count FROM (
          SELECT i.id 
          FROM items i 
          LEFT JOIN inventory_stock s ON i.id = s.item_id 
          GROUP BY i.id 
          HAVING COALESCE(SUM(s.quantity_on_hand), 0) <= i.min_stock_alert
        );
      `);
      const pendingPosRes = await dbService.query<{ count: number }>(`
        SELECT COUNT(*) as count FROM purchase_orders WHERE status IN ('draft', 'pending_approval');
      `);
      const shipmentsRes = await dbService.query<{ count: number }>(`
        SELECT COUNT(*) as count FROM shipments WHERE status IN ('pending', 'packed', 'dispatched', 'in_transit');
      `);

      setCounts({
        lowStock: Number(lowStockRes[0]?.count || 0),
        pendingPOs: Number(pendingPosRes[0]?.count || 0),
        activeShipments: Number(shipmentsRes[0]?.count || 0)
      });
    } catch (err) {
      console.warn('Error refreshing badge counts:', err);
    }
  };

  // Initialize SQLite database on boot and load operational state
  useEffect(() => {
    const initDb = async () => {
      try {
        await dbService.initialize();
        const loadedWarehouses = await dbService.query<{ id: string; name: string; warehouse_code: string }>(
          "SELECT id, name, warehouse_code FROM warehouses WHERE is_active = 1 ORDER BY is_default DESC, name ASC;"
        );
        if (loadedWarehouses && loadedWarehouses.length > 0) {
          setWarehouses(loadedWarehouses.map((w: { id: string; name: string; warehouse_code: string }) => ({ id: w.id, name: w.name, code: w.warehouse_code })));
        }

        await refreshBadgeCounts();
        await loadCompanyProfile();
      } catch (err) {
        console.warn('Database initialization warning:', err);
      }
    };
    initDb();
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('probaho_sidebar_collapsed', String(isSidebarCollapsed));
    }
  }, [isSidebarCollapsed]);

  // Global hotkeys (Ctrl+B to toggle sidebar, Ctrl+K for command search)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setIsSidebarCollapsed((prev) => !prev);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleLogout = () => {
    authService.logout();
    setCurrentUser(null);
    setIsAuthenticated(false);
  };

  const handleLoginSuccess = (user: UserAccount, keepLoggedIn: boolean) => {
    authService.setCurrentUser(user, keepLoggedIn);
    setCurrentUser(user);
    setIsAuthenticated(true);
    if (user.role !== 'master' && user.allowed_tabs && user.allowed_tabs.length > 0) {
      if (!user.allowed_tabs.includes(activeTab)) {
        setActiveTab(user.allowed_tabs[0] as ERPModuleTab);
      }
    }
  };

  const [searchFilters, setSearchFilters] = useState<{ inventory?: string; procurement?: string; logistics?: string }>({});

  const activeWarehouse = warehouses.find((w) => w.id === activeWarehouseId) || warehouses[0];

  // 1. Loading Splash Screen during session verification
  if (isAuthChecking) {
    return (
      <div className="flex flex-col items-center justify-center h-screen w-screen bg-slate-900 text-slate-100 select-none">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 p-2 shadow-xl shadow-emerald-500/20 mb-4 animate-pulse">
          <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <path d="M14 8 H26 C33 8 38 12.5 38 19 C38 25.5 33 30 26 30 H22 V40 H14 V8 Z" fill="#FFFFFF" opacity="0.96" />
            <path d="M22 15 H26 C29 15 31 16.8 31 19 C31 21.2 29 23 26 23 H22 V15 Z" fill="#059669" />
            <path d="M12 28 C18 28 22 33 26 33 C30 33 34 29 40 29" stroke="#6EE7B7" strokeWidth="3.2" strokeLinecap="round" />
          </svg>
        </div>
        <div className="text-sm font-semibold text-white tracking-wide">Starting Probaho ERP...</div>
        <div className="text-xs text-slate-400 mt-1">Verifying encrypted SQLite WASM environment</div>
      </div>
    );
  }

  // 2. Authentication Screen (Master Setup / Login)
  if (!isAuthenticated) {
    return (
      <div className="flex flex-col h-screen w-screen overflow-hidden bg-[var(--bg-primary)]">
        <TitleBar appName="Probaho ERP" activeWarehouseName="Authentication Gate" dbStatus="connected" />
        <div className="flex-1 overflow-auto flex items-center justify-center">
          <LoginScreen onLoginSuccess={handleLoginSuccess} />
        </div>
      </div>
    );
  }

  // 3. Main Authenticated Application Workspace
  const allowedTabs = currentUser?.role === 'master' ? undefined : currentUser?.allowed_tabs;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[var(--bg-primary)]">
      {/* 1. Custom Frameless Electron TitleBar */}
      <TitleBar
        appName="Probaho ERP"
        activeWarehouseName={activeWarehouse?.name}
        dbStatus="connected"
      />

      {/* 2. Main Workspace Body: Sidebar + View Content */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
          allowedTabs={allowedTabs}
          counts={counts}
          companyName={companyProfile.name}
          companyLogoUrl={companyProfile.logoUrl}
          onOpenCompanySettings={() => setActiveTab('settings')}
        />

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Top Header */}
          <Header
            activeWarehouseId={activeWarehouseId}
            warehouses={warehouses}
            onSelectWarehouse={(id: string | number) => setActiveWarehouseId(String(id))}
            onOpenCommandSearch={() => setIsCommandPaletteOpen(true)}
            currentUser={currentUser}
            onLogout={handleLogout}
            onNavigateToStaff={() => setActiveTab('settings')}
          />

          {/* View Container */}
          <main className="flex-1 overflow-y-auto p-6">
            {activeTab === 'dashboard' && (
              <DashboardView onNavigate={(tab: ERPModuleTab | string) => setActiveTab(tab as ERPModuleTab)} />
            )}

            {activeTab === 'showroom' && (
              <ShowroomView onRefreshCounts={refreshBadgeCounts} />
            )}

            {activeTab === 'suppliers' && (
              <SuppliersView />
            )}

            {activeTab === 'procurement' && (
              <ProcurementView initialSearchQuery={searchFilters.procurement} />
            )}

            {activeTab === 'inventory' && (
              <InventoryView
                onNavigateToWarehouses={() => setActiveTab('warehouses')}
                initialSearchQuery={searchFilters.inventory}
              />
            )}

            {activeTab === 'warehouses' && (
              <WarehousesView onNavigateToInventory={() => setActiveTab('inventory')} />
            )}

            {activeTab === 'logistics' && (
              <LogisticsView
                activeWarehouseId={activeWarehouseId}
                onRefreshCounts={refreshBadgeCounts}
                initialSearchQuery={searchFilters.logistics}
              />
            )}

            {activeTab === 'settings' && (
              <SettingsView
                currentUser={currentUser}
                onRefreshAll={() => {
                  console.log('Refreshed ERP workspace state');
                  refreshBadgeCounts();
                  loadCompanyProfile();
                }}
              />
            )}
          </main>
        </div>
      </div>

      {/* Universal Command Palette (Ctrl+K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onNavigate={(tab, searchFilter) => {
          setActiveTab(tab);
          if (searchFilter) {
            setSearchFilters((prev) => ({ ...prev, [tab]: searchFilter }));
          }
        }}
      />
    </div>
  );
};

export default App;
