import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Package,
  ShoppingBag,
  Truck,
  ArrowRight,
  X,
  Building2,
  Users,
  Settings,
  Store,
  LayoutDashboard
} from 'lucide-react';
import { dbService } from '../services/db';
import type { ERPModuleTab } from './Sidebar';

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tab: ERPModuleTab, searchFilter?: string) => void;
}

interface ItemResult {
  id: string;
  sku: string;
  name: string;
  category: string;
  selling_price: number;
}

interface POResult {
  id: string;
  po_number: string;
  supplier_name: string;
  status: string;
  total_amount: number;
}

interface ShipmentResult {
  id: string;
  shipment_number: string;
  customer_name: string;
  destination_city: string;
  status: string;
  courier_name: string;
}

interface NavAction {
  id: string;
  label: string;
  tab: ERPModuleTab;
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  description: string;
}

const NAV_ACTIONS: NavAction[] = [
  { id: 'nav-dashboard', label: 'Dashboard Overview', tab: 'dashboard', icon: LayoutDashboard, description: 'KPI Metrics & Executive Analytics' },
  { id: 'nav-showroom', label: 'Showroom & POS', tab: 'showroom', icon: Store, description: 'Walk-in Retail Sales & Counter Chit Receipt' },
  { id: 'nav-inventory', label: 'Inventory & Stock', tab: 'inventory', icon: Package, description: 'SKU Balances, Batch Tracking & Stock Valuation' },
  { id: 'nav-procurement', label: 'Procurement & POs', tab: 'procurement', icon: ShoppingBag, description: 'Purchase Orders & GRN Inspection' },
  { id: 'nav-logistics', label: 'Logistics & Shipments', tab: 'logistics', icon: Truck, description: 'Outbound Carrier Tracking & RTO Disposition' },
  { id: 'nav-warehouses', label: 'Warehouses & Bins', tab: 'warehouses', icon: Building2, description: 'Facilities, Bin Hierarchy & Stock Transfers' },
  { id: 'nav-suppliers', label: 'Suppliers Directory', tab: 'suppliers', icon: Users, description: 'Vendor Directory & Lead Times' },
  { id: 'nav-settings', label: 'Settings & System', tab: 'settings', icon: Settings, description: 'Theme Modes & SQLite Persistence' },
];

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onNavigate
}) => {
  const [query, setQuery] = useState<string>('');
  const [items, setItems] = useState<ItemResult[]>([]);
  const [pos, setPos] = useState<POResult[]>([]);
  const [shipments, setShipments] = useState<ShipmentResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input whenever opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Execute Search across SQLite tables
  useEffect(() => {
    if (!isOpen) return;

    const trimmed = query.trim();
    if (!trimmed) {
      setItems([]);
      setPos([]);
      setShipments([]);
      return;
    }

    let isSubscribed = true;
    const searchDb = async () => {
      try {
        const likeParam = `%${trimmed}%`;

        // 1. Search Items / SKUs
        const itemRows = await dbService.query<ItemResult>(
          `SELECT id, sku, name, category, selling_price 
           FROM items 
           WHERE sku LIKE ? OR name LIKE ? OR category LIKE ? 
           ORDER BY sku ASC LIMIT 5;`,
          [likeParam, likeParam, likeParam]
        );

        // 2. Search Purchase Orders
        const poRows = await dbService.query<POResult>(
          `SELECT po.id, po.po_number, COALESCE(s.name, 'Unknown Vendor') as supplier_name, po.status, po.total_amount
           FROM purchase_orders po
           LEFT JOIN suppliers s ON po.supplier_id = s.id
           WHERE po.po_number LIKE ? OR s.name LIKE ?
           ORDER BY po.order_date DESC LIMIT 5;`,
          [likeParam, likeParam]
        );

        // 3. Search Shipments
        const shipmentRows = await dbService.query<ShipmentResult>(
          `SELECT id, shipment_number, customer_name, destination_city, status, courier_name
           FROM shipments
           WHERE shipment_number LIKE ? OR customer_name LIKE ? OR destination_city LIKE ?
           ORDER BY created_at DESC LIMIT 5;`,
          [likeParam, likeParam, likeParam]
        );

        if (isSubscribed) {
          setItems(itemRows || []);
          setPos(poRows || []);
          setShipments(shipmentRows || []);
          setSelectedIndex(0);
        }
      } catch (err) {
        console.warn('CommandPalette search error:', err);
      }
    };

    searchDb();
    return () => {
      isSubscribed = false;
    };
  }, [query, isOpen]);

  // Filtered Nav Actions
  const filteredNavActions = NAV_ACTIONS.filter((act) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return act.label.toLowerCase().includes(q) || act.description.toLowerCase().includes(q);
  });

  // Flattened results for keyboard navigation
  const flatResults = [
    ...filteredNavActions.map((a) => ({ type: 'nav' as const, data: a })),
    ...items.map((i) => ({ type: 'item' as const, data: i })),
    ...pos.map((p) => ({ type: 'po' as const, data: p })),
    ...shipments.map((s) => ({ type: 'shipment' as const, data: s }))
  ];

  const handleSelectResult = (index: number) => {
    const item = flatResults[index];
    if (!item) return;

    if (item.type === 'nav') {
      onNavigate(item.data.tab);
    } else if (item.type === 'item') {
      onNavigate('inventory', item.data.sku);
    } else if (item.type === 'po') {
      onNavigate('procurement', item.data.po_number);
    } else if (item.type === 'shipment') {
      onNavigate('logistics', item.data.shipment_number);
    }
    onClose();
  };

  // Keyboard navigation inside modal
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, flatResults.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + flatResults.length) % Math.max(1, flatResults.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleSelectResult(selectedIndex);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  let currentIndex = 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="erp-card w-full max-w-2xl bg-[var(--bg-secondary)] border border-[var(--border-color)] shadow-2xl rounded-xl overflow-hidden flex flex-col max-h-[75vh]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--border-color)] bg-[var(--bg-primary)]">
          <Search size={18} className="text-[var(--text-dim)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a product SKU, PO#, customer, carrier, or view name..."
            className="flex-1 bg-transparent border-none outline-none text-sm text-[var(--text-main)] placeholder-[var(--text-dim)]"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 rounded text-[var(--text-dim)] hover:text-[var(--text-main)]"
            >
              <X size={15} />
            </button>
          )}
          <kbd className="hidden sm:inline-block text-[10px] font-mono px-1.5 py-0.5 rounded border border-[var(--border-color)] bg-[var(--bg-tertiary)] text-[var(--text-dim)]">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-3">
          {/* 1. Products / Items */}
          {items.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[11px] font-bold text-[var(--text-dim)] uppercase tracking-wider flex items-center gap-1.5">
                <Package size={13} style={{ color: 'var(--accent-primary)' }} />
                <span>Products & SKUs ({items.length})</span>
              </div>
              <div className="mt-1 space-y-0.5">
                {items.map((it) => {
                  const idx = currentIndex++;
                  const isSelected = selectedIndex === idx;
                  return (
                    <div
                      key={it.id}
                      onClick={() => handleSelectResult(idx)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-[var(--accent-primary)] text-white'
                          : 'hover:bg-[var(--bg-hover)] text-[var(--text-main)]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`font-mono text-xs font-bold px-1.5 py-0.5 rounded ${
                          isSelected ? 'bg-white/20 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--accent-primary)]'
                        }`}>
                          {it.sku}
                        </span>
                        <span className="text-xs truncate font-medium">{it.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded border ${
                          isSelected ? 'border-white/30 text-white/80' : 'border-[var(--border-color)] text-[var(--text-dim)]'
                        }`}>
                          {it.category}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 font-mono text-xs">
                        <span>${(it.selling_price || 0).toFixed(2)}</span>
                        <ArrowRight size={13} className={isSelected ? 'text-white' : 'text-[var(--text-dim)]'} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2. Purchase Orders */}
          {pos.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[11px] font-bold text-[var(--text-dim)] uppercase tracking-wider flex items-center gap-1.5">
                <ShoppingBag size={13} style={{ color: 'var(--amber)' }} />
                <span>Purchase Orders ({pos.length})</span>
              </div>
              <div className="mt-1 space-y-0.5">
                {pos.map((po) => {
                  const idx = currentIndex++;
                  const isSelected = selectedIndex === idx;
                  return (
                    <div
                      key={po.id}
                      onClick={() => handleSelectResult(idx)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-[var(--accent-primary)] text-white'
                          : 'hover:bg-[var(--bg-hover)] text-[var(--text-main)]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`font-mono text-xs font-bold px-1.5 py-0.5 rounded ${
                          isSelected ? 'bg-white/20 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--amber)]'
                        }`}>
                          {po.po_number}
                        </span>
                        <span className="text-xs truncate font-medium">{po.supplier_name}</span>
                        <span className={`text-[10px] uppercase font-bold px-1.5 py-0.2 rounded ${
                          isSelected ? 'bg-white/20 text-white' : 'badge-warning'
                        }`}>
                          {po.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 font-mono text-xs">
                        <span>${(po.total_amount || 0).toFixed(2)}</span>
                        <ArrowRight size={13} className={isSelected ? 'text-white' : 'text-[var(--text-dim)]'} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. Shipments */}
          {shipments.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[11px] font-bold text-[var(--text-dim)] uppercase tracking-wider flex items-center gap-1.5">
                <Truck size={13} style={{ color: 'var(--cyan)' }} />
                <span>Shipments & Logistics ({shipments.length})</span>
              </div>
              <div className="mt-1 space-y-0.5">
                {shipments.map((shp) => {
                  const idx = currentIndex++;
                  const isSelected = selectedIndex === idx;
                  return (
                    <div
                      key={shp.id}
                      onClick={() => handleSelectResult(idx)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-[var(--accent-primary)] text-white'
                          : 'hover:bg-[var(--bg-hover)] text-[var(--text-main)]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`font-mono text-xs font-bold px-1.5 py-0.5 rounded ${
                          isSelected ? 'bg-white/20 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--cyan)]'
                        }`}>
                          {shp.shipment_number}
                        </span>
                        <span className="text-xs truncate font-medium">{shp.customer_name} ({shp.destination_city})</span>
                        <span className={`text-[10px] uppercase font-bold px-1.5 py-0.2 rounded ${
                          isSelected ? 'bg-white/20 text-white' : 'badge-info'
                        }`}>
                          {shp.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-[11px] opacity-80">{shp.courier_name}</span>
                        <ArrowRight size={13} className={isSelected ? 'text-white' : 'text-[var(--text-dim)]'} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. Quick Module Navigation */}
          {filteredNavActions.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[11px] font-bold text-[var(--text-dim)] uppercase tracking-wider flex items-center gap-1.5">
                <ArrowRight size={13} className="text-[var(--text-dim)]" />
                <span>Jump to Workspace Module</span>
              </div>
              <div className="mt-1 space-y-0.5">
                {filteredNavActions.map((act) => {
                  const idx = currentIndex++;
                  const isSelected = selectedIndex === idx;
                  const Icon = act.icon;
                  return (
                    <div
                      key={act.id}
                      onClick={() => handleSelectResult(idx)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-[var(--accent-primary)] text-white'
                          : 'hover:bg-[var(--bg-hover)] text-[var(--text-main)]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`p-1.5 rounded-md ${
                          isSelected ? 'bg-white/20 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--accent-primary)]'
                        }`}>
                          <Icon size={14} />
                        </div>
                        <div>
                          <div className="text-xs font-semibold">{act.label}</div>
                          <div className={`text-[10px] ${isSelected ? 'text-white/80' : 'text-[var(--text-dim)]'}`}>
                            {act.description}
                          </div>
                        </div>
                      </div>
                      <span className={`text-[11px] font-mono ${isSelected ? 'text-white/90' : 'text-[var(--text-dim)]'}`}>
                        Go ↵
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {flatResults.length === 0 && (
            <div className="text-center py-8 text-xs text-[var(--text-dim)]">
              No matching products, POs, shipments, or modules found for "{query}".
            </div>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2 border-t border-[var(--border-color)] bg-[var(--bg-primary)] flex items-center justify-between text-[11px] text-[var(--text-dim)]">
          <div className="flex items-center gap-3">
            <span><kbd className="px-1 py-0.5 font-mono rounded border border-[var(--border-color)] bg-[var(--bg-card)]">↑</kbd> <kbd className="px-1 py-0.5 font-mono rounded border border-[var(--border-color)] bg-[var(--bg-card)]">↓</kbd> Navigate</span>
            <span><kbd className="px-1.5 py-0.5 font-mono rounded border border-[var(--border-color)] bg-[var(--bg-card)]">↵</kbd> Select</span>
            <span><kbd className="px-1.5 py-0.5 font-mono rounded border border-[var(--border-color)] bg-[var(--bg-card)]">Esc</kbd> Close</span>
          </div>
          <span className="font-semibold text-[var(--accent-primary)]">Probaho Universal Search</span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
