-- ============================================================================
-- PROBAHO ERP: COMPLETE RELATIONAL DATABASE DDL SCHEMA (16 TABLES)
-- Engine: SQLite 3 (sql.js WebAssembly / native SQLite 3 compatible)
-- PRAGMA Mode: Foreign Keys Enforced + Write-Ahead Logging
-- ============================================================================

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- ----------------------------------------------------------------------------
-- 1. SYSTEM SETTINGS & METADATA
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general',
    description TEXT,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Default system settings initialization
INSERT OR IGNORE INTO system_settings (key, value, category, description) VALUES
('company_name', 'Probaho Supply Chain Ltd.', 'company', 'Registered enterprise company name'),
('default_currency', 'USD', 'finance', 'Default operating currency (USD, BDT, EUR, GBP)'),
('default_valuation_method', 'MOVING_AVERAGE', 'inventory', 'Default stock valuation: MOVING_AVERAGE or FIFO'),
('negative_inventory_allowed', '0', 'inventory', '0 = Strict prevent negative stock, 1 = Allow backorders'),
('schema_version', '1.0.0', 'system', 'Database schema migration version');

-- ----------------------------------------------------------------------------
-- 2. VENDORS & SUPPLIERS
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 3. ITEMS & PRODUCT CATALOG
-- ----------------------------------------------------------------------------
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
CREATE INDEX IF NOT EXISTS idx_items_category ON items (category);

-- ----------------------------------------------------------------------------
-- 4. MULTI-WAREHOUSE INFRASTRUCTURE
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 5. WAREHOUSE LOCATIONS & BINS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS warehouse_locations (
    id TEXT PRIMARY KEY,
    warehouse_id TEXT NOT NULL,
    zone TEXT NOT NULL,
    aisle TEXT NOT NULL,
    rack TEXT NOT NULL,
    shelf TEXT NOT NULL,
    bin_code TEXT NOT NULL,
    max_weight_kg REAL CHECK (max_weight_kg IS NULL OR max_weight_kg > 0.0),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (warehouse_id) REFERENCES warehouses (id) ON DELETE RESTRICT,
    UNIQUE (warehouse_id, bin_code)
);

CREATE INDEX IF NOT EXISTS idx_locations_wh_bin ON warehouse_locations (warehouse_id, bin_code);

-- ----------------------------------------------------------------------------
-- 6. ITEM BATCHES & LOT TRACKING
-- ----------------------------------------------------------------------------
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
CREATE INDEX IF NOT EXISTS idx_batches_status ON item_batches (status);

-- ----------------------------------------------------------------------------
-- 7. REAL-TIME INVENTORY STOCK LEVELS
-- ----------------------------------------------------------------------------
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
CREATE INDEX IF NOT EXISTS idx_stock_batch ON inventory_stock (batch_id);

-- ----------------------------------------------------------------------------
-- 8. PURCHASE ORDERS & PROCUREMENT
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 9. PURCHASE ORDER LINE ITEMS
-- ----------------------------------------------------------------------------
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
CREATE INDEX IF NOT EXISTS idx_po_items_itemid ON purchase_order_items (item_id);

-- ----------------------------------------------------------------------------
-- 10. GOODS RECEIPTS & AUDITABLE INSPECTIONS
-- ----------------------------------------------------------------------------
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

CREATE INDEX IF NOT EXISTS idx_gr_receipt_no ON goods_receipts (receipt_number);
CREATE INDEX IF NOT EXISTS idx_gr_po ON goods_receipts (po_id);

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

CREATE INDEX IF NOT EXISTS idx_gr_items_rid ON goods_receipt_items (receipt_id);

-- ----------------------------------------------------------------------------
-- 11. INTER-WAREHOUSE STOCK TRANSFERS
-- ----------------------------------------------------------------------------
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

CREATE INDEX IF NOT EXISTS idx_transfer_items_tid ON stock_transfer_items (transfer_id);

-- ----------------------------------------------------------------------------
-- 12. COURIERS & CARRIERS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS couriers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    service_type TEXT NOT NULL DEFAULT 'Standard',
    contact_phone TEXT NOT NULL,
    tracking_url_template TEXT,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ----------------------------------------------------------------------------
-- 13. FULFILLMENT & OUTBOUND LOGISTICS TRACKING
-- ----------------------------------------------------------------------------
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
CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments (status);

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

CREATE INDEX IF NOT EXISTS idx_shipment_items_sid ON shipment_items (shipment_id);

-- ----------------------------------------------------------------------------
-- 14. INVENTORY TRANSACTION LEDGER (IMMUTABLE DOUBLE-ENTRY AUDIT TRAIL)
-- ----------------------------------------------------------------------------
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
CREATE INDEX IF NOT EXISTS idx_inv_tx_time ON inventory_transactions (transaction_timestamp);

-- ----------------------------------------------------------------------------
-- 15. APPLICATION AUDIT LOGS
-- ----------------------------------------------------------------------------
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

CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs (timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs (entity_type, entity_id);

-- ----------------------------------------------------------------------------
-- 16. BACKUP & RESTORE HISTORY
-- ----------------------------------------------------------------------------
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

CREATE INDEX IF NOT EXISTS idx_backup_time ON backup_history (created_at);
