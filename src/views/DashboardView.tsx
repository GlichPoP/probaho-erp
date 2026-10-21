import React, { useState, useEffect } from 'react';
import {
  Boxes,
  ShoppingBag,
  Truck,
  TrendingUp,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Building2,
  Package
} from 'lucide-react';
import { dbService } from '../services/db';

interface DashboardStats {
  totalItems: number;
  totalStockUnits: number;
  totalValuation: number;
  pendingPOs: number;
  activeShipments: number;
  lowStockItemsCount: number;
}

interface RecentMovement {
  id: string;
  transaction_timestamp: string;
  transaction_type: string;
  item_sku?: string;
  item_name?: string;
  quantity_change: number;
  warehouse_name?: string;
}

interface LowStockAlert {
  id: string;
  sku: string;
  name: string;
  quantity_on_hand: number;
  safety_stock: number;
  unit_of_measure: string;
}

export const DashboardView: React.FC<{ onNavigate?: (tab: string) => void }> = ({ onNavigate }) => {
  const [stats, setStats] = useState<DashboardStats>({
    totalItems: 0,
    totalStockUnits: 0,
    totalValuation: 0,
    pendingPOs: 0,
    activeShipments: 0,
    lowStockItemsCount: 0
  });

  const [recentMovements, setRecentMovements] = useState<RecentMovement[]>([]);
  const [lowStockAlerts, setLowStockAlerts] = useState<LowStockAlert[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const loadDashboardData = async () => {
    try {
      setIsLoading(true);
      await dbService.initialize();

      // 1. Stats Queries
      const [itemsCount] = await dbService.query<{ count: number }>("SELECT COUNT(*) as count FROM items;");
      const [stockUnits] = await dbService.query<{ sum: number }>("SELECT SUM(quantity_on_hand) as sum FROM inventory_stock;");
      const [posCount] = await dbService.query<{ count: number }>("SELECT COUNT(*) as count FROM purchase_orders WHERE status NOT IN ('received', 'cancelled');");
      const [shipmentsCount] = await dbService.query<{ count: number }>("SELECT COUNT(*) as count FROM shipments WHERE status NOT IN ('delivered', 'cancelled', 'rto_delivered', 'rto_received');");

      // Valuation: sum of (quantity_on_hand * COALESCE(b.unit_cost, i.cost_price))
      const [valuation] = await dbService.query<{ val: number }>(`
        SELECT SUM(s.quantity_on_hand * COALESCE(b.unit_cost, i.cost_price)) as val 
        FROM inventory_stock s 
        JOIN items i ON s.item_id = i.id
        LEFT JOIN item_batches b ON s.batch_id = b.id;
      `);

      // 2. Recent Transactions
      const txs = await dbService.query<any>(`
        SELECT t.id, t.transaction_timestamp, t.transaction_type, t.quantity_change,
               i.sku as item_sku, i.name as item_name, w.name as warehouse_name
        FROM inventory_transactions t
        LEFT JOIN items i ON t.item_id = i.id
        LEFT JOIN warehouses w ON t.warehouse_id = w.id
        ORDER BY t.transaction_timestamp DESC
        LIMIT 6;
      `);

      // 3. Low Stock Alerts
      const alerts = await dbService.query<any>(`
        SELECT i.id, i.sku, i.name, i.safety_stock, i.unit_of_measure,
               COALESCE(SUM(s.quantity_on_hand), 0) as quantity_on_hand
        FROM items i
        LEFT JOIN inventory_stock s ON i.id = s.item_id
        GROUP BY i.id
        HAVING quantity_on_hand <= i.safety_stock
        LIMIT 5;
      `);

      setStats({
        totalItems: itemsCount?.count || 0,
        totalStockUnits: stockUnits?.sum || 0,
        totalValuation: valuation?.val || 0,
        pendingPOs: posCount?.count || 0,
        activeShipments: shipmentsCount?.count || 0,
        lowStockItemsCount: alerts.length
      });

      setRecentMovements(txs);
      setLowStockAlerts(alerts);
    } catch (err) {
      console.warn('Dashboard load error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-main)]">
            Supply Chain Command Center
          </h1>
          <p className="text-xs text-[var(--text-muted)]">
            Real-time multi-warehouse operations, inventory valuation, and procurement status.
          </p>
        </div>
        <button
          onClick={loadDashboardData}
          disabled={isLoading}
          className="btn btn-secondary self-start sm:self-auto"
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Valuation */}
        <div className="erp-card p-4 hover-lift">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-dim)] uppercase">Inventory Valuation</span>
            <div className="p-2 rounded-lg bg-[var(--accent-glow)] text-[var(--accent-primary)]">
              <TrendingUp size={18} />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold font-mono text-[var(--text-main)]">
              ${stats.totalValuation.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="block text-[11px] text-[var(--text-muted)] mt-0.5">
              Across {stats.totalStockUnits.toLocaleString()} units on hand
            </span>
          </div>
        </div>

        {/* Total SKUs */}
        <div className="erp-card p-4 hover-lift">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-dim)] uppercase">Catalog SKUs</span>
            <div className="p-2 rounded-lg bg-[var(--cyan-bg)] text-[var(--cyan)]">
              <Boxes size={18} />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold font-mono text-[var(--text-main)]">
              {stats.totalItems} Active Items
            </span>
            <span className="block text-[11px] text-[var(--text-muted)] mt-0.5">
              Multi-category items & trims
            </span>
          </div>
        </div>

        {/* Pending POs */}
        <div className="erp-card p-4 hover-lift">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-dim)] uppercase">Procurement Workflow</span>
            <div className="p-2 rounded-lg bg-[var(--amber-bg)] text-[var(--amber)]">
              <ShoppingBag size={18} />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold font-mono text-[var(--text-main)]">
              {stats.pendingPOs} Active POs
            </span>
            <span className="block text-[11px] text-[var(--text-muted)] mt-0.5">
              Ordered & in-transit receipts
            </span>
          </div>
        </div>

        {/* Outbound Logistics */}
        <div className="erp-card p-4 hover-lift">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-dim)] uppercase">Outbound Fulfillment</span>
            <div className="p-2 rounded-lg bg-[var(--emerald-bg)] text-[var(--emerald)]">
              <Truck size={18} />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold font-mono text-[var(--text-main)]">
              {stats.activeShipments} Shipments
            </span>
            <span className="block text-[11px] text-[var(--text-muted)] mt-0.5">
              Dispatched & in delivery route
            </span>
          </div>
        </div>
      </div>

      {/* Main Grid: Recent Ledger Movements + Stock Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Double-Entry Movement Ledger */}
        <div className="lg:col-span-2 erp-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--border-color)' }}>
            <div>
              <h2 className="text-sm font-bold text-[var(--text-main)]">Recent Stock Movements</h2>
              <p className="text-[11px] text-[var(--text-muted)]">Live double-entry inventory audit trail</p>
            </div>
            {onNavigate && (
              <button
                onClick={() => onNavigate('inventory')}
                className="text-xs font-semibold text-[var(--accent-primary)] hover:underline"
              >
                View All Movements →
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Action / Type</th>
                  <th>Item / SKU</th>
                  <th>Warehouse</th>
                  <th className="text-right">Qty Change</th>
                </tr>
              </thead>
              <tbody>
                {recentMovements.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-6 text-[var(--text-dim)] text-xs">
                      No stock transactions recorded yet.
                    </td>
                  </tr>
                ) : (
                  recentMovements.map((tx) => (
                    <tr key={tx.id}>
                      <td className="text-xs font-mono text-[var(--text-dim)] whitespace-nowrap">
                        {tx.transaction_timestamp.slice(0, 16).replace('T', ' ')}
                      </td>
                      <td>
                        <span className={`badge ${tx.quantity_change >= 0 ? 'badge-success' : 'badge-danger'}`}>
                          {tx.transaction_type}
                        </span>
                      </td>
                      <td>
                        <div className="flex flex-col">
                          <span className="font-semibold text-xs text-[var(--text-main)]">{tx.item_name || 'Item'}</span>
                          <span className="chip-mono text-[10px] w-fit">{tx.item_sku}</span>
                        </div>
                      </td>
                      <td className="text-xs text-[var(--text-muted)]">
                        {tx.warehouse_name || 'Central DC'}
                      </td>
                      <td className="text-right font-mono font-bold text-xs">
                        <span className={`inline-flex items-center gap-0.5 ${tx.quantity_change >= 0 ? 'text-[var(--emerald)]' : 'text-[var(--ruby)]'}`}>
                          {tx.quantity_change >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                          {tx.quantity_change > 0 ? `+${tx.quantity_change}` : tx.quantity_change}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right 1 Col: Quick Actions & Low Stock Watchlist */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <div className="erp-card p-5 space-y-3">
            <h2 className="text-sm font-bold text-[var(--text-main)]">Quick Actions</h2>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => onNavigate && onNavigate('procurement')}
                className="btn btn-secondary justify-start text-xs"
              >
                <ShoppingBag size={15} style={{ color: 'var(--amber)' }} />
                <span>Issue Purchase Order</span>
              </button>
              <button
                onClick={() => onNavigate && onNavigate('inventory')}
                className="btn btn-secondary justify-start text-xs"
              >
                <Package size={15} style={{ color: 'var(--accent-primary)' }} />
                <span>Initiate Stock Transfer</span>
              </button>
              <button
                onClick={() => onNavigate && onNavigate('logistics')}
                className="btn btn-secondary justify-start text-xs"
              >
                <Truck size={15} style={{ color: 'var(--cyan)' }} />
                <span>Dispatch Outbound Shipment</span>
              </button>
              <button
                onClick={() => onNavigate && onNavigate('settings')}
                className="btn btn-secondary justify-start text-xs"
              >
                <Building2 size={15} style={{ color: 'var(--emerald)' }} />
                <span>Backup SQLite Database</span>
              </button>
            </div>
          </div>

          {/* Low Stock Alerts */}
          <div className="erp-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-[var(--text-main)] flex items-center gap-1.5">
                <AlertTriangle size={15} style={{ color: 'var(--ruby)' }} />
                <span>Stock Alert Watchlist</span>
              </h2>
              <span className="badge badge-danger">{lowStockAlerts.length}</span>
            </div>

            {lowStockAlerts.length === 0 ? (
              <p className="text-xs text-[var(--text-dim)] py-2">
                All inventory levels are safely above reorder thresholds.
              </p>
            ) : (
              <div className="space-y-2">
                {lowStockAlerts.map((it) => (
                  <div
                    key={it.id}
                    className="p-2.5 rounded-lg border bg-[var(--bg-secondary)] flex items-center justify-between"
                    style={{ borderColor: 'var(--border-color)' }}
                  >
                    <div>
                      <p className="text-xs font-semibold text-[var(--text-main)]">{it.name}</p>
                      <span className="chip-mono text-[10px]">{it.sku}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold font-mono text-[var(--ruby)]">
                        {it.quantity_on_hand} {it.unit_of_measure}
                      </span>
                      <span className="block text-[10px] text-[var(--text-dim)]">
                        Min: {it.safety_stock}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardView;
