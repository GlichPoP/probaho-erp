// ============================================================================
// PROBAHO ERP: SQLITE WEBASSEMBLY PERSISTENCE SERVICE
// File: src/services/db.ts
// Engine: sql.js (WebAssembly) with Debounced Disk Synchronization
// ============================================================================

import type { Database as SqlJsDatabase, SqlJsStatic } from 'sql.js';
import { initialSeedScript } from '../database/seeds';

export interface IDatabaseService {
  initialize(): Promise<void>;
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  execute(sql: string, params?: any[]): Promise<{ rowsAffected: number; lastInsertRowId: number }>;
  transaction<T>(fn: (tx: IDatabaseService) => Promise<T>): Promise<T>;
  exportDatabaseBlob(): Promise<Uint8Array>;
  importDatabaseBlob(bytes: Uint8Array): Promise<void>;
  exportJsonSnapshot(): Promise<string>;
  importJsonSnapshot(jsonStr: string): Promise<void>;
  flush(): Promise<void>;
  isReady(): boolean;
  close(): Promise<void>;
  resetToSeedData(): Promise<void>;
}

export const ERP_SCHEMA_DDL = `
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- 1. System Settings & Configurations
CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general',
    description TEXT,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT OR IGNORE INTO system_settings (key, value, category, description) VALUES
('company_name', 'Probaho Supply Chain Ltd.', 'company', 'Registered company name'),
('default_currency', 'USD', 'finance', 'Default operating currency (USD, BDT, EUR, GBP)'),
('default_valuation_method', 'MOVING_AVERAGE', 'inventory', 'Default stock valuation: MOVING_AVERAGE or FIFO'),
('schema_version', '1.0.0', 'system', 'Database schema version');

-- 2. Vendors & Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
    id TEXT PRIMARY KEY,
    supplier_code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    contact_person TEXT,
    email TEXT,
    phone TEXT NOT NULL,
    address TEXT NOT NULL,
    city TEXT,
    country TEXT NOT NULL DEFAULT 'Bangladesh',
    tax_id TEXT,
    payment_terms_days INTEGER NOT NULL DEFAULT 30 CHECK (payment_terms_days >= 0),
    lead_time_days INTEGER NOT NULL DEFAULT 7 CHECK (lead_time_days >= 0),
    rating REAL NOT NULL DEFAULT 5.0 CHECK (rating >= 0.0 AND rating <= 5.0),
    performance_score REAL NOT NULL DEFAULT 100.0 CHECK (performance_score >= 0.0 AND performance_score <= 100.0),
    total_pos_issued INTEGER NOT NULL DEFAULT 0 CHECK (total_pos_issued >= 0),
    total_pos_fulfilled INTEGER NOT NULL DEFAULT 0 CHECK (total_pos_fulfilled >= 0),
    notes TEXT,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_suppliers_code ON suppliers (supplier_code);
CREATE INDEX IF NOT EXISTS idx_suppliers_active ON suppliers (is_active);

-- 3. Products & Items Catalog
CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    sku TEXT NOT NULL UNIQUE,
    barcode TEXT UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    unit_of_measure TEXT NOT NULL DEFAULT 'pcs',
    cost_price REAL NOT NULL DEFAULT 0.0 CHECK (cost_price >= 0.0),
    selling_price REAL NOT NULL DEFAULT 0.0 CHECK (selling_price >= 0.0),
    valuation_method TEXT NOT NULL DEFAULT 'MOVING_AVERAGE' CHECK (valuation_method IN ('MOVING_AVERAGE', 'FIFO')),
    min_stock_alert INTEGER NOT NULL DEFAULT 10 CHECK (min_stock_alert >= 0),
    safety_stock INTEGER NOT NULL DEFAULT 5 CHECK (safety_stock >= 0),
    max_stock INTEGER NOT NULL DEFAULT 1000 CHECK (max_stock >= min_stock_alert),
    weight_kg REAL DEFAULT 0.0 CHECK (weight_kg >= 0.0),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_items_sku ON items (sku);
CREATE INDEX IF NOT EXISTS idx_items_barcode ON items (barcode);

-- 4. Multi-Warehouse Facilities
CREATE TABLE IF NOT EXISTS warehouses (
    id TEXT PRIMARY KEY,
    warehouse_code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    district TEXT,
    contact_person TEXT,
    contact_phone TEXT,
    is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_warehouses_code ON warehouses (warehouse_code);

-- 5. Warehouse Locations & Bins
CREATE TABLE IF NOT EXISTS warehouse_locations (
    id TEXT PRIMARY KEY,
    warehouse_id TEXT NOT NULL,
    zone TEXT NOT NULL,
    aisle TEXT NOT NULL,
    rack TEXT NOT NULL,
    shelf TEXT NOT NULL,
    bin_code TEXT NOT NULL,
    max_weight_kg REAL,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (warehouse_id) REFERENCES warehouses (id) ON DELETE RESTRICT,
    UNIQUE (warehouse_id, bin_code)
);

CREATE INDEX IF NOT EXISTS idx_locations_wh_bin ON warehouse_locations (warehouse_id, bin_code);

-- 6. Batches & Lot Tracking
CREATE TABLE IF NOT EXISTS item_batches (
    id TEXT PRIMARY KEY,
    batch_number TEXT NOT NULL,
    item_id TEXT NOT NULL,
    supplier_id TEXT,
    manufacture_date TEXT,
    expiry_date TEXT,
    unit_cost REAL NOT NULL CHECK (unit_cost >= 0.0),
    initial_quantity INTEGER NOT NULL CHECK (initial_quantity >= 0),
    current_quantity INTEGER NOT NULL CHECK (current_quantity >= 0),
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'QUARANTINED', 'DEPLETED')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE RESTRICT,
    FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE SET NULL,
    UNIQUE (item_id, batch_number)
);

CREATE INDEX IF NOT EXISTS idx_batches_item ON item_batches (item_id);
CREATE INDEX IF NOT EXISTS idx_batches_expiry ON item_batches (expiry_date);

-- 7. Real-Time Inventory Stock Matrix
CREATE TABLE IF NOT EXISTS inventory_stock (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    warehouse_id TEXT NOT NULL,
    bin_id TEXT,
    batch_id TEXT,
    quantity_on_hand INTEGER NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
    quantity_reserved INTEGER NOT NULL DEFAULT 0 CHECK (quantity_reserved >= 0),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE RESTRICT,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses (id) ON DELETE RESTRICT,
    FOREIGN KEY (bin_id) REFERENCES warehouse_locations (id) ON DELETE RESTRICT,
    FOREIGN KEY (batch_id) REFERENCES item_batches (id) ON DELETE RESTRICT,
    CHECK (quantity_reserved <= quantity_on_hand),
    UNIQUE (item_id, warehouse_id, bin_id, batch_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_item_wh ON inventory_stock (item_id, warehouse_id);

-- 8. Purchase Orders (Procurement)
CREATE TABLE IF NOT EXISTS purchase_orders (
    id TEXT PRIMARY KEY,
    po_number TEXT NOT NULL UNIQUE,
    supplier_id TEXT NOT NULL,
    target_warehouse_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft', 
        'pending_approval', 
        'approved', 
        'ordered', 
        'partially_received', 
        'received', 
        'cancelled'
    )),
    order_date TEXT NOT NULL,
    expected_delivery_date TEXT,
    actual_delivery_date TEXT,
    subtotal REAL NOT NULL DEFAULT 0.0 CHECK (subtotal >= 0.0),
    tax_amount REAL NOT NULL DEFAULT 0.0 CHECK (tax_amount >= 0.0),
    shipping_cost REAL NOT NULL DEFAULT 0.0 CHECK (shipping_cost >= 0.0),
    total_amount REAL NOT NULL DEFAULT 0.0 CHECK (total_amount >= 0.0),
    payment_terms TEXT,
    notes TEXT,
    inspection_notes TEXT,
    created_by TEXT NOT NULL DEFAULT 'system',
    approved_by TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE RESTRICT,
    FOREIGN KEY (target_warehouse_id) REFERENCES warehouses (id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_pos_number ON purchase_orders (po_number);
CREATE INDEX IF NOT EXISTS idx_pos_supplier ON purchase_orders (supplier_id);
CREATE INDEX IF NOT EXISTS idx_pos_status ON purchase_orders (status);

-- 9. Purchase Order Items
CREATE TABLE IF NOT EXISTS purchase_order_items (
    id TEXT PRIMARY KEY,
    po_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    sku TEXT NOT NULL,
    quantity_ordered INTEGER NOT NULL CHECK (quantity_ordered > 0),
    quantity_received INTEGER NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
    quantity_rejected INTEGER NOT NULL DEFAULT 0 CHECK (quantity_rejected >= 0),
    unit_cost REAL NOT NULL CHECK (unit_cost >= 0.0),
    subtotal REAL NOT NULL CHECK (subtotal >= 0.0),
    tax_rate REAL NOT NULL DEFAULT 0.0 CHECK (tax_rate >= 0.0),
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (po_id) REFERENCES purchase_orders (id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE RESTRICT,
    CHECK (quantity_received + quantity_rejected <= quantity_ordered)
);

CREATE INDEX IF NOT EXISTS idx_po_items_poid ON purchase_order_items (po_id);

-- 10. Goods Receipts & Inspection Notes
CREATE TABLE IF NOT EXISTS goods_receipts (
    id TEXT PRIMARY KEY,
    receipt_number TEXT NOT NULL UNIQUE,
    po_id TEXT NOT NULL,
    warehouse_id TEXT NOT NULL,
    received_by TEXT NOT NULL,
    receipt_date TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    inspection_passed INTEGER NOT NULL DEFAULT 1 CHECK (inspection_passed IN (0, 1)),
    inspection_notes TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (po_id) REFERENCES purchase_orders (id) ON DELETE RESTRICT,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses (id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS goods_receipt_items (
    id TEXT PRIMARY KEY,
    receipt_id TEXT NOT NULL,
    po_item_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    batch_id TEXT,
    bin_id TEXT,
    quantity_accepted INTEGER NOT NULL CHECK (quantity_accepted >= 0),
    quantity_rejected INTEGER NOT NULL DEFAULT 0 CHECK (quantity_rejected >= 0),
    rejection_reason TEXT,
    unit_cost REAL NOT NULL CHECK (unit_cost >= 0.0),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (receipt_id) REFERENCES goods_receipts (id) ON DELETE CASCADE,
    FOREIGN KEY (po_item_id) REFERENCES purchase_order_items (id) ON DELETE RESTRICT,
    FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE RESTRICT,
    FOREIGN KEY (batch_id) REFERENCES item_batches (id) ON DELETE RESTRICT,
    FOREIGN KEY (bin_id) REFERENCES warehouse_locations (id) ON DELETE RESTRICT
);

-- 11. Inter-Warehouse Stock Transfers
CREATE TABLE IF NOT EXISTS stock_transfers (
    id TEXT PRIMARY KEY,
    transfer_number TEXT NOT NULL UNIQUE,
    source_warehouse_id TEXT NOT NULL,
    dest_warehouse_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft', 
        'requested', 
        'in_transit', 
        'completed', 
        'received', 
        'cancelled'
    )),
    requested_by TEXT NOT NULL,
    approved_by TEXT,
    carrier_name TEXT,
    tracking_number TEXT,
    shipped_date TEXT,
    received_date TEXT,
    notes TEXT,
    receiving_notes TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (source_warehouse_id) REFERENCES warehouses (id) ON DELETE RESTRICT,
    FOREIGN KEY (dest_warehouse_id) REFERENCES warehouses (id) ON DELETE RESTRICT,
    CHECK (source_warehouse_id != dest_warehouse_id)
);

CREATE INDEX IF NOT EXISTS idx_transfers_num ON stock_transfers (transfer_number);
CREATE INDEX IF NOT EXISTS idx_transfers_status ON stock_transfers (status);

CREATE TABLE IF NOT EXISTS stock_transfer_items (
    id TEXT PRIMARY KEY,
    transfer_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    batch_id TEXT,
    source_bin_id TEXT,
    dest_bin_id TEXT,
    quantity_requested INTEGER NOT NULL CHECK (quantity_requested > 0),
    quantity_shipped INTEGER NOT NULL DEFAULT 0 CHECK (quantity_shipped >= 0),
    quantity_received INTEGER NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
    discrepancy_reason TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (transfer_id) REFERENCES stock_transfers (id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE RESTRICT,
    FOREIGN KEY (batch_id) REFERENCES item_batches (id) ON DELETE RESTRICT,
    FOREIGN KEY (source_bin_id) REFERENCES warehouse_locations (id) ON DELETE RESTRICT,
    FOREIGN KEY (dest_bin_id) REFERENCES warehouse_locations (id) ON DELETE RESTRICT,
    CHECK (quantity_shipped <= quantity_requested),
    CHECK (quantity_received <= quantity_shipped)
);

-- 12. Couriers & Carriers
CREATE TABLE IF NOT EXISTS couriers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    service_type TEXT NOT NULL DEFAULT 'Standard',
    contact_phone TEXT NOT NULL,
    tracking_url_template TEXT,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 13. Shipments & Outbound Fulfillment
CREATE TABLE IF NOT EXISTS shipments (
    id TEXT PRIMARY KEY,
    shipment_number TEXT NOT NULL UNIQUE,
    order_reference TEXT NOT NULL,
    source_warehouse_id TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_address TEXT NOT NULL,
    destination_city TEXT NOT NULL,
    destination_district TEXT,
    courier_id TEXT,
    courier_name TEXT NOT NULL,
    tracking_number TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 
        'packed', 
        'dispatched', 
        'in_transit', 
        'delivered', 
        'return_to_origin', 
        'rto_received', 
        'rto_delivered', 
        'cancelled'
    )),
    declared_value REAL NOT NULL DEFAULT 0.0 CHECK (declared_value >= 0.0),
    cod_amount REAL NOT NULL DEFAULT 0.0 CHECK (cod_amount >= 0.0),
    shipping_fee REAL NOT NULL DEFAULT 0.0 CHECK (shipping_fee >= 0.0),
    dispatched_at TEXT,
    delivered_at TEXT,
    rto_initiated_at TEXT,
    rto_received_at TEXT,
    rto_reason TEXT,
    rto_disposition TEXT CHECK (rto_disposition IS NULL OR rto_disposition IN ('restocked', 'damaged_writeoff')),
    notes TEXT,
    created_by TEXT NOT NULL DEFAULT 'system',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (source_warehouse_id) REFERENCES warehouses (id) ON DELETE RESTRICT,
    FOREIGN KEY (courier_id) REFERENCES couriers (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_shipments_num ON shipments (shipment_number);
CREATE INDEX IF NOT EXISTS idx_shipments_tracking ON shipments (tracking_number);

CREATE TABLE IF NOT EXISTS shipment_items (
    id TEXT PRIMARY KEY,
    shipment_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    batch_id TEXT,
    bin_id TEXT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price REAL NOT NULL DEFAULT 0.0 CHECK (unit_price >= 0.0),
    total_price REAL NOT NULL DEFAULT 0.0 CHECK (total_price >= 0.0),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (shipment_id) REFERENCES shipments (id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE RESTRICT,
    FOREIGN KEY (batch_id) REFERENCES item_batches (id) ON DELETE RESTRICT,
    FOREIGN KEY (bin_id) REFERENCES warehouse_locations (id) ON DELETE RESTRICT
);

-- 14. Inventory Audit Ledger (Immutable Double-Entry Movement Ledger)
CREATE TABLE IF NOT EXISTS inventory_transactions (
    id TEXT PRIMARY KEY,
    transaction_timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    transaction_type TEXT NOT NULL CHECK (transaction_type IN (
        'PO_RECEIPT', 
        'TRANSFER_OUT', 
        'TRANSFER_IN', 
        'FULFILLMENT_PICK', 
        'RETURN_RESTOCK', 
        'ADJUSTMENT_WRITE_OFF', 
        'CYCLE_COUNT_ADJUSTMENT'
    )),
    reference_type TEXT NOT NULL CHECK (reference_type IN ('PO', 'TRANSFER', 'SHIPMENT', 'ADJUSTMENT')),
    reference_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    warehouse_id TEXT NOT NULL,
    bin_id TEXT,
    batch_id TEXT,
    quantity_change INTEGER NOT NULL,
    unit_cost REAL NOT NULL DEFAULT 0.0 CHECK (unit_cost >= 0.0),
    running_balance_after INTEGER NOT NULL CHECK (running_balance_after >= 0),
    user_id TEXT NOT NULL DEFAULT 'system',
    notes TEXT,
    FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE RESTRICT,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses (id) ON DELETE RESTRICT,
    FOREIGN KEY (bin_id) REFERENCES warehouse_locations (id) ON DELETE RESTRICT,
    FOREIGN KEY (batch_id) REFERENCES item_batches (id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_inv_tx_item_wh ON inventory_transactions (item_id, warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inv_tx_ref ON inventory_transactions (reference_type, reference_id);

-- 15. Application Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    user_id TEXT NOT NULL DEFAULT 'system',
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    old_values_json TEXT,
    new_values_json TEXT,
    details TEXT,
    ip_or_terminal TEXT DEFAULT 'localhost',
    notes TEXT
);

-- 16. Backup & Restore History
CREATE TABLE IF NOT EXISTS backup_history (
    id TEXT PRIMARY KEY,
    backup_filename TEXT NOT NULL,
    backup_format TEXT NOT NULL CHECK (backup_format IN ('JSON_SNAPSHOT', 'SQLITE_BINARY')),
    file_size_bytes INTEGER NOT NULL CHECK (file_size_bytes >= 0),
    table_counts_json TEXT NOT NULL,
    sha256_checksum TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED', 'FAILED', 'VERIFIED')),
    created_by TEXT NOT NULL DEFAULT 'admin',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 17. User Accounts & Role-Based Access Control (RBAC)
CREATE TABLE IF NOT EXISTS user_accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    email_or_phone TEXT,
    role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('master', 'employee', 'manager', 'cashier', 'warehouse_staff', 'logistics')),
    password_hash TEXT,
    pin_code TEXT,
    designation TEXT,
    allowed_tabs TEXT NOT NULL DEFAULT '["dashboard","showroom","inventory","suppliers","procurement","transfers","fulfillment","settings"]',
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_by TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    last_active_at TEXT
);
`;

export class DatabaseService implements IDatabaseService {
  private static instance: DatabaseService | null = null;
  private db: SqlJsDatabase | null = null;
  private SQL: SqlJsStatic | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private persistTimer: any = null;
  private persistDebounceMs = 200;
  private isPersisting = false;
  private txQueue: Promise<any> = Promise.resolve();
  private dbPath: string | null = null;

  public constructor(customDbPath?: string) {
    if (customDbPath) {
      this.dbPath = customDbPath;
    }
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  public isReady(): boolean {
    return this.initialized && this.db !== null;
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        await this.initSqlJsEngine();
        const existingBytes = await this.loadDatabaseBytes();

        if (existingBytes && existingBytes.length > 0) {
          try {
            this.db = new this.SQL!.Database(existingBytes);
            this.db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
            // Auto-migrate schema updates (such as user_accounts table)
            try {
              this.db.exec(`
                CREATE TABLE IF NOT EXISTS user_accounts (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    username TEXT NOT NULL UNIQUE,
                    email_or_phone TEXT,
                    role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('master', 'employee', 'manager', 'cashier', 'warehouse_staff', 'logistics')),
                    password_hash TEXT,
                    pin_code TEXT,
                    designation TEXT,
                    allowed_tabs TEXT NOT NULL DEFAULT '["dashboard","showroom","inventory","suppliers","procurement","transfers","fulfillment","settings"]',
                    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
                    created_by TEXT,
                    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                    last_active_at TEXT
                );
              `);
            } catch (migErr) {
              console.warn('[DatabaseService] User accounts migration notice:', migErr);
            }
            this.initialized = true;
          } catch (loadErr) {
            console.warn('[DatabaseService] Failed to load existing DB file, creating fresh database:', loadErr);
            this.db = new this.SQL!.Database();
            this.db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
            await this.applySchemaAndSeeds();
            await this.flush();
          }
        } else {
          this.db = new this.SQL!.Database();
          this.db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
          await this.applySchemaAndSeeds();
          await this.flush();
        }

        this.initialized = true;
      } catch (err) {
        this.initialized = false;
        this.initPromise = null;
        console.error('[DatabaseService] Failed to initialize database engine:', err);
        throw err;
      }
    })();

    return this.initPromise;
  }

  private async initSqlJsEngine(): Promise<void> {
    if (this.SQL) return;

    // Dynamic import to support both Node.js (Vitest / CLI) and Vite / Electron bundler
    const initSqlJsModule = await import('sql.js');
    const initSqlJs = initSqlJsModule.default || (initSqlJsModule as any);

    // 1. Electron Preload Bridge Priority: Direct in-memory WASM binary transfer
    const bridge = this.getElectronBridge();
    if (bridge && typeof bridge.getWasmBinary === 'function') {
      try {
        const bin = await bridge.getWasmBinary();
        if (bin && (bin.byteLength || bin.length)) {
          const wasmBinary = bin.buffer
            ? (bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer)
            : bin;
          this.SQL = await initSqlJs({ wasmBinary });
          return;
        }
      } catch (bridgeErr) {
        console.warn('[DatabaseService] Electron bridge getWasmBinary error, falling back:', bridgeErr);
      }
    }

    // 2. Node.js / CLI environment (Vitest / Test Runners)
    if (this.isNodeEnvironment()) {
      try {
        const path = await import('path');
        const fs = await import('fs');

        let wasmBuffer: Buffer | null = null;
        const candidatePaths = [
          path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
          path.join(process.cwd(), '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
          path.join(process.cwd(), 'public', 'sql-wasm.wasm'),
          path.join(process.cwd(), 'dist', 'sql-wasm.wasm'),
        ];

        for (const p of candidatePaths) {
          if (fs.existsSync(p)) {
            wasmBuffer = fs.readFileSync(p);
            break;
          }
        }

        const wasmBinary = wasmBuffer
          ? (wasmBuffer.buffer.slice(wasmBuffer.byteOffset, wasmBuffer.byteOffset + wasmBuffer.byteLength) as ArrayBuffer)
          : undefined;
        this.SQL = await initSqlJs(wasmBinary ? { wasmBinary } : {});
        return;
      } catch {
        this.SQL = await initSqlJs({});
        return;
      }
    }

    // 3. Browser / Fetch fallback with locateFile
    try {
      this.SQL = await initSqlJs({
        locateFile: (file: string) => `./${file}`
      });
    } catch (browserErr) {
      console.warn('[DatabaseService] Standard locateFile failed, attempting direct fetch of sql-wasm.wasm:', browserErr);
      try {
        const resp = await fetch('./sql-wasm.wasm');
        const arrayBuf = await resp.arrayBuffer();
        this.SQL = await initSqlJs({ wasmBinary: arrayBuf });
      } catch (finalErr) {
        console.error('[DatabaseService] Critical: could not initialize sql.js wasm:', finalErr);
        throw finalErr;
      }
    }
  }

  private isNodeEnvironment(): boolean {
    return (
      typeof window === 'undefined' ||
      (typeof process !== 'undefined' && Boolean(process.versions?.node) && !(window as any)?.api && !(window as any)?.electronAPI)
    );
  }

  private getElectronBridge(): any {
    if (typeof window !== 'undefined') {
      return (window as any).api || (window as any).electronAPI || null;
    }
    return null;
  }

  private async loadDatabaseBytes(): Promise<Uint8Array | null> {
    if (this.dbPath === ':memory:') {
      return null;
    }

    const bridge = this.getElectronBridge();

    // 1. Electron Desktop Environment via IPC (only when not using a custom test path)
    if (!this.dbPath && bridge && typeof bridge.dbLoad === 'function') {
      try {
        const result = await bridge.dbLoad();
        if (result && (result instanceof Uint8Array || ArrayBuffer.isView(result))) {
          return new Uint8Array(result.buffer || result, result.byteOffset || 0, result.byteLength);
        }
        if (result && Array.isArray(result)) {
          return new Uint8Array(result);
        }
      } catch (e) {
        console.warn('[DatabaseService] Electron IPC dbLoad returned error, falling back:', e);
      }
    }

    // 2. Headless Node.js Environment (Vitest tests & CLI verification script)
    if (this.isNodeEnvironment()) {
      try {
        const fs = await import('fs');
        const path = await import('path');
        const portableDir = process.env.PORTABLE_EXECUTABLE_DIR || process.env.PROBAHO_PORTABLE_DIR;
        const defaultDbPath = portableDir
          ? path.join(portableDir, 'ProbahoData', 'probaho_erp.db')
          : path.join(process.cwd(), 'probaho_erp.db');
        const targetPath = this.dbPath || process.env.PROBAHO_DB_PATH || defaultDbPath;
        if (targetPath !== ':memory:' && fs.existsSync(targetPath)) {
          const buf = fs.readFileSync(targetPath);
          return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
        }
      } catch (nodeErr) {
        console.warn('[DatabaseService] Node file read failed:', nodeErr);
      }
    }

    // 3. Browser Development Mode (Vite Preview / Dev without Electron)
    if (!this.dbPath && typeof window !== 'undefined' && window.localStorage) {
      const b64 = window.localStorage.getItem('PROBAHO_ERP_DB_SNAPSHOT');
      if (b64) {
        try {
          const binStr = atob(b64);
          const bytes = new Uint8Array(binStr.length);
          for (let i = 0; i < binStr.length; i++) {
            bytes[i] = binStr.charCodeAt(i);
          }
          return bytes;
        } catch {}
      }
    }

    return null;
  }

  public schedulePersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.flush().catch((err) => {
        console.error('[DatabaseService] Auto-persist error:', err);
      });
    }, this.persistDebounceMs);
  }

  public async flush(): Promise<void> {
    if (!this.db || this.isPersisting) return;
    if (this.dbPath === ':memory:') return;
    this.isPersisting = true;

    try {
      const bytes = this.db.export();
      const bridge = this.getElectronBridge();

      // 1. Electron IPC Persistence
      if (!this.dbPath && bridge && typeof bridge.dbSave === 'function') {
        await bridge.dbSave(bytes);
        return;
      }

      // 2. Node.js Persistence
      if (this.isNodeEnvironment()) {
        try {
          const fs = await import('fs');
          const path = await import('path');
          const portableDir = process.env.PORTABLE_EXECUTABLE_DIR || process.env.PROBAHO_PORTABLE_DIR;
          const defaultDbPath = portableDir
            ? path.join(portableDir, 'ProbahoData', 'probaho_erp.db')
            : path.join(process.cwd(), 'probaho_erp.db');
          const targetPath = this.dbPath || process.env.PROBAHO_DB_PATH || defaultDbPath;
          if (targetPath !== ':memory:') {
            const dir = path.dirname(targetPath);
            if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir, { recursive: true });
            }
            const tmpPath = `${targetPath}.tmp`;
            fs.writeFileSync(tmpPath, Buffer.from(bytes));
            fs.renameSync(tmpPath, targetPath);
            return;
          }
        } catch (nodeErr) {
          console.warn('[DatabaseService] Node write failed:', nodeErr);
        }
      }

      // 3. Browser Fallback Persistence
      if (!this.dbPath && typeof window !== 'undefined' && window.localStorage) {
        let binary = '';
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        window.localStorage.setItem('PROBAHO_ERP_DB_SNAPSHOT', btoa(binary));
      }
    } catch (err) {
      console.error('[DatabaseService] Failed to flush database to disk:', err);
      throw err;
    } finally {
      this.isPersisting = false;
    }
  }

  private async applySchemaAndSeeds(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    this.db.exec(ERP_SCHEMA_DDL);
    this.initialized = true;
    await initialSeedScript(this);
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized || !this.db) {
      await this.initialize();
    }
  }

  public async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    await this.ensureInitialized();
    const stmt = this.db!.prepare(sql);
    try {
      if (params && params.length > 0) {
        stmt.bind(params);
      }
      const rows: T[] = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as T);
      }
      return rows;
    } finally {
      stmt.free();
    }
  }

  public async execute(sql: string, params: any[] = []): Promise<{ rowsAffected: number; lastInsertRowId: number }> {
    await this.ensureInitialized();
    if (!params || params.length === 0) {
      this.db!.exec(sql);
      const rowsAffected = this.db!.getRowsModified();
      const lastIdRes = this.db!.exec("SELECT last_insert_rowid() AS id;");
      const lastInsertRowId =
        lastIdRes.length > 0 && lastIdRes[0].values.length > 0
          ? Number(lastIdRes[0].values[0][0])
          : 0;
      this.schedulePersist();
      return { rowsAffected, lastInsertRowId };
    } else {
      const stmt = this.db!.prepare(sql);
      try {
        stmt.bind(params);
        stmt.step();
        const rowsAffected = this.db!.getRowsModified();
        const lastIdRes = this.db!.exec("SELECT last_insert_rowid() AS id;");
        const lastInsertRowId =
          lastIdRes.length > 0 && lastIdRes[0].values.length > 0
            ? Number(lastIdRes[0].values[0][0])
            : 0;
        this.schedulePersist();
        return { rowsAffected, lastInsertRowId };
      } finally {
        stmt.free();
      }
    }
  }

  public async transaction<T>(fn: (tx: IDatabaseService) => Promise<T>): Promise<T> {
    await this.ensureInitialized();

    const executeTx = async (): Promise<T> => {
      const savepointName = `sp_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
      this.db!.exec(`SAVEPOINT ${savepointName};`);
      try {
        const result = await fn(this);
        this.db!.exec(`RELEASE SAVEPOINT ${savepointName};`);
        await this.flush();
        return result;
      } catch (err) {
        try {
          this.db!.exec(`ROLLBACK TO SAVEPOINT ${savepointName};`);
          this.db!.exec(`RELEASE SAVEPOINT ${savepointName};`);
        } catch (rbErr) {
          console.warn(`[DatabaseService] Rollback error for ${savepointName}:`, rbErr);
        }
        throw err;
      }
    };

    const nextOp = this.txQueue.then(executeTx, executeTx);
    this.txQueue = nextOp.catch(() => {});
    return nextOp;
  }

  public async exportDatabaseBlob(): Promise<Uint8Array> {
    await this.ensureInitialized();
    await this.flush();
    return this.db!.export();
  }

  public async importDatabaseBlob(bytes: Uint8Array): Promise<void> {
    await this.initSqlJsEngine();

    // Verify SQLite 3 header magic bytes: "SQLite format 3\000"
    const header = String.fromCharCode(...bytes.slice(0, 16));
    if (header !== 'SQLite format 3\0') {
      throw new Error('Invalid SQLite database binary file: missing header signature.');
    }

    const testDb = new this.SQL!.Database(bytes);
    const integrity = testDb.exec("PRAGMA integrity_check;");
    if (!integrity.length || integrity[0].values[0][0] !== 'ok') {
      testDb.close();
      throw new Error('Corrupted SQLite binary database: integrity check failed.');
    }
    testDb.close();

    if (this.db) {
      this.db.close();
    }
    this.db = new this.SQL!.Database(bytes);
    this.db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
    this.initialized = true;
    await this.flush();
  }

  public async exportJsonSnapshot(): Promise<string> {
    const { backupService } = await import('./backupService');
    return backupService.exportJsonSnapshot(this);
  }

  public async importJsonSnapshot(jsonStr: string): Promise<void> {
    const { backupService } = await import('./backupService');
    await backupService.importJsonSnapshot(jsonStr, this);
  }

  public async resetToSeedData(): Promise<void> {
    await this.ensureInitialized();
    if (this.db) {
      this.db.close();
    }
    this.db = new this.SQL!.Database();
    this.db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
    await this.applySchemaAndSeeds();
    await this.flush();
  }

  public async close(): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    if (this.db) {
      await this.flush();
      this.db.close();
      this.db = null;
    }
    this.initialized = false;
    this.initPromise = null;
  }
}

export const dbService = DatabaseService.getInstance();
