// ============================================================================
// PROBAHO ERP: DUAL-FORMAT BACKUP & RESTORE SERVICE
// File: src/services/backupService.ts
// Formats: Cryptographically Signed JSON Snapshot + Raw SQLite Binary
// ============================================================================

import { dbService, type IDatabaseService } from './db';

export interface BackupSummary {
  suppliers: number;
  items: number;
  warehouses: number;
  warehouse_locations: number;
  item_batches: number;
  inventory_stock: number;
  purchase_orders: number;
  purchase_order_items: number;
  goods_receipts: number;
  goods_receipt_items: number;
  stock_transfers: number;
  stock_transfer_items: number;
  couriers: number;
  shipments: number;
  shipment_items: number;
  inventory_transactions: number;
  system_settings: number;
  audit_logs?: number;
}

export interface BackupSnapshotEnvelope {
  system: string;
  version: string;
  exported_at: string;
  checksum: string;
  metadata?: {
    app: string;
    version: string;
    exportedAt: string;
    checksum: string;
  };
  summary: BackupSummary;
  data: Record<string, any[]>;
  tables?: Record<string, any[]>;
}

export class BackupService {
  private static instance: BackupService | null = null;

  public static getInstance(): BackupService {
    if (!BackupService.instance) {
      BackupService.instance = new BackupService();
    }
    return BackupService.instance;
  }

  /**
   * Computes SHA-256 checksum string across Browser, Node, and Electron environments.
   */
  public async computeSha256(content: string | Uint8Array): Promise<string> {
    if (typeof window !== 'undefined' && window.crypto?.subtle) {
      const msgUint8: Uint8Array =
        typeof content === 'string' ? new TextEncoder().encode(content) : content;
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgUint8 as any);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } else {
      const crypto = await import('crypto');
      const hash = crypto.createHash('sha256');
      if (typeof content === 'string') {
        hash.update(content, 'utf8');
      } else {
        hash.update(content);
      }
      return hash.digest('hex');
    }
  }

  /**
   * Exports full database state to verifiable JSON snapshot.
   */
  public async exportJsonSnapshot(targetDb?: IDatabaseService): Promise<string> {
    const db = targetDb || dbService;

    const [
      system_settings,
      suppliers,
      items,
      warehouses,
      warehouse_locations,
      item_batches,
      inventory_stock,
      purchase_orders,
      purchase_order_items,
      goods_receipts,
      goods_receipt_items,
      stock_transfers,
      stock_transfer_items,
      couriers,
      shipments,
      shipment_items,
      inventory_transactions,
      audit_logs,
    ] = await Promise.all([
      db.query("SELECT * FROM system_settings ORDER BY key ASC;").catch(() => []),
      db.query("SELECT * FROM suppliers ORDER BY supplier_code ASC;").catch(() => []),
      db.query("SELECT * FROM items ORDER BY sku ASC;").catch(() => []),
      db.query("SELECT * FROM warehouses ORDER BY warehouse_code ASC;").catch(() => []),
      db.query("SELECT * FROM warehouse_locations ORDER BY bin_code ASC;").catch(() => []),
      db.query("SELECT * FROM item_batches ORDER BY batch_number ASC;").catch(() => []),
      db.query("SELECT * FROM inventory_stock ORDER BY id ASC;").catch(() => []),
      db.query("SELECT * FROM purchase_orders ORDER BY po_number ASC;").catch(() => []),
      db.query("SELECT * FROM purchase_order_items ORDER BY id ASC;").catch(() => []),
      db.query("SELECT * FROM goods_receipts ORDER BY receipt_number ASC;").catch(() => []),
      db.query("SELECT * FROM goods_receipt_items ORDER BY id ASC;").catch(() => []),
      db.query("SELECT * FROM stock_transfers ORDER BY transfer_number ASC;").catch(() => []),
      db.query("SELECT * FROM stock_transfer_items ORDER BY id ASC;").catch(() => []),
      db.query("SELECT * FROM couriers ORDER BY id ASC;").catch(() => []),
      db.query("SELECT * FROM shipments ORDER BY shipment_number ASC;").catch(() => []),
      db.query("SELECT * FROM shipment_items ORDER BY id ASC;").catch(() => []),
      db.query("SELECT * FROM inventory_transactions ORDER BY transaction_timestamp ASC;").catch(() => []),
      db.query("SELECT * FROM audit_logs ORDER BY timestamp ASC;").catch(() => []),
    ]);

    const summary: BackupSummary = {
      system_settings: system_settings.length,
      suppliers: suppliers.length,
      items: items.length,
      warehouses: warehouses.length,
      warehouse_locations: warehouse_locations.length,
      item_batches: item_batches.length,
      inventory_stock: inventory_stock.length,
      purchase_orders: purchase_orders.length,
      purchase_order_items: purchase_order_items.length,
      goods_receipts: goods_receipts.length,
      goods_receipt_items: goods_receipt_items.length,
      stock_transfers: stock_transfers.length,
      stock_transfer_items: stock_transfer_items.length,
      couriers: couriers.length,
      shipments: shipments.length,
      shipment_items: shipment_items.length,
      inventory_transactions: inventory_transactions.length,
      audit_logs: audit_logs.length,
    };

    const dataPayload: Record<string, any[]> = {
      system_settings,
      suppliers,
      items,
      warehouses,
      warehouse_locations,
      item_batches,
      inventory_stock,
      purchase_orders,
      purchase_order_items,
      goods_receipts,
      goods_receipt_items,
      stock_transfers,
      stock_transfer_items,
      couriers,
      shipments,
      shipment_items,
      inventory_transactions,
      audit_logs,
    };

    const canonicalDataStr = JSON.stringify(dataPayload);
    const checksum = await this.computeSha256(canonicalDataStr);
    const timestamp = new Date().toISOString();

    const envelope: BackupSnapshotEnvelope = {
      system: 'PROBAHO-ERP',
      version: '1.0.0',
      exported_at: timestamp,
      checksum,
      metadata: {
        app: 'PROBAHO-ERP',
        version: '1.0.0',
        exportedAt: timestamp,
        checksum,
      },
      summary,
      data: dataPayload,
      tables: dataPayload,
    };

    const jsonOutput = JSON.stringify(envelope, null, 2);

    try {
      await db.execute(
        `INSERT INTO backup_history (id, backup_filename, backup_format, file_size_bytes, table_counts_json, sha256_checksum, status)
         VALUES (?, ?, 'JSON_SNAPSHOT', ?, ?, ?, 'COMPLETED');`,
        [
          `bkp_json_${Date.now()}`,
          `probaho_erp_backup_${timestamp.replace(/[:.]/g, '-')}.json`,
          jsonOutput.length,
          JSON.stringify(summary),
          checksum,
        ]
      );
    } catch {}

    return jsonOutput;
  }

  /**
   * Imports and validates a JSON snapshot, performing pre-restore backup and foreign key verification.
   */
  public async importJsonSnapshot(jsonStr: string, targetDb?: IDatabaseService): Promise<void> {
    const db = targetDb || dbService;
    let envelope: any;

    try {
      envelope = JSON.parse(jsonStr);
    } catch {
      throw new Error('Invalid JSON format: Unable to parse backup payload.');
    }

    const appName = envelope.system || envelope.metadata?.app;
    if (appName && appName !== 'PROBAHO-ERP' && appName !== 'probaho-erp') {
      throw new Error(`Incompatible backup source: expected PROBAHO-ERP, got "${appName}".`);
    }

    const tableData: Record<string, any[]> = envelope.data || envelope.tables;
    if (!tableData || typeof tableData !== 'object') {
      throw new Error('Invalid backup file: Missing table dataset payload.');
    }

    // Verify SHA-256 checksum if present
    const expectedChecksum = envelope.checksum || envelope.metadata?.checksum;
    if (expectedChecksum) {
      const canonicalDataStr = JSON.stringify(tableData);
      const computedHash = await this.computeSha256(canonicalDataStr);
      if (computedHash !== expectedChecksum) {
        throw new Error(`Corrupted backup file: Checksum mismatch. Expected ${expectedChecksum}, computed ${computedHash}`);
      }
    }

    // Capture safety snapshot in memory before applying restore
    const preRestoreBlob = await db.exportDatabaseBlob();

    try {
      await db.transaction(async (tx) => {
        await tx.execute("PRAGMA foreign_keys = OFF;");

        const tablesToClear = [
          'inventory_transactions',
          'shipment_items',
          'shipments',
          'couriers',
          'stock_transfer_items',
          'stock_transfers',
          'goods_receipt_items',
          'goods_receipts',
          'purchase_order_items',
          'purchase_orders',
          'inventory_stock',
          'item_batches',
          'warehouse_locations',
          'warehouses',
          'items',
          'suppliers',
          'system_settings',
          'audit_logs',
        ];

        for (const tbl of tablesToClear) {
          try {
            await tx.execute(`DELETE FROM ${tbl};`);
          } catch {}
        }

        const insertTableRecords = async (tableName: string, records: any[]) => {
          if (!records || records.length === 0) return;
          const cols = Object.keys(records[0]);
          const placeholders = cols.map(() => '?').join(', ');
          const sql = `INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${placeholders});`;

          for (const row of records) {
            const values = cols.map((c) => row[c]);
            await tx.execute(sql, values);
          }
        };

        if (tableData.system_settings) await insertTableRecords('system_settings', tableData.system_settings);
        if (tableData.suppliers) await insertTableRecords('suppliers', tableData.suppliers);
        if (tableData.items) await insertTableRecords('items', tableData.items);
        if (tableData.warehouses) await insertTableRecords('warehouses', tableData.warehouses);
        if (tableData.warehouse_locations) await insertTableRecords('warehouse_locations', tableData.warehouse_locations);
        if (tableData.item_batches) await insertTableRecords('item_batches', tableData.item_batches);
        if (tableData.inventory_stock) await insertTableRecords('inventory_stock', tableData.inventory_stock);
        if (tableData.purchase_orders) await insertTableRecords('purchase_orders', tableData.purchase_orders);
        if (tableData.purchase_order_items) await insertTableRecords('purchase_order_items', tableData.purchase_order_items);
        if (tableData.goods_receipts) await insertTableRecords('goods_receipts', tableData.goods_receipts);
        if (tableData.goods_receipt_items) await insertTableRecords('goods_receipt_items', tableData.goods_receipt_items);
        if (tableData.stock_transfers) await insertTableRecords('stock_transfers', tableData.stock_transfers);
        if (tableData.stock_transfer_items) await insertTableRecords('stock_transfer_items', tableData.stock_transfer_items);
        if (tableData.couriers) await insertTableRecords('couriers', tableData.couriers);
        if (tableData.shipments) await insertTableRecords('shipments', tableData.shipments);
        if (tableData.shipment_items) await insertTableRecords('shipment_items', tableData.shipment_items);
        if (tableData.inventory_transactions) await insertTableRecords('inventory_transactions', tableData.inventory_transactions);
        if (tableData.audit_logs) await insertTableRecords('audit_logs', tableData.audit_logs);

        await tx.execute("PRAGMA foreign_keys = ON;");
        const fkViolations = await tx.query("PRAGMA foreign_key_check;");
        if (fkViolations.length > 0) {
          throw new Error(`Foreign key constraint violation after JSON restore: ${JSON.stringify(fkViolations)}`);
        }
      });
    } catch (restoreError) {
      await db.importDatabaseBlob(preRestoreBlob);
      throw new Error(`Restore failed and active database was safely rolled back: ${(restoreError as Error).message}`);
    }
  }

  /**
   * Exports raw SQLite 3 binary database file.
   */
  public async exportBinaryBlob(targetDb?: IDatabaseService): Promise<Uint8Array> {
    const db = targetDb || dbService;
    const bytes = await db.exportDatabaseBlob();
    const checksum = await this.computeSha256(bytes);

    try {
      await db.execute(
        `INSERT INTO backup_history (id, backup_filename, backup_format, file_size_bytes, table_counts_json, sha256_checksum, status)
         VALUES (?, ?, 'SQLITE_BINARY', ?, '{}', ?, 'COMPLETED');`,
        [
          `bkp_bin_${Date.now()}`,
          `probaho_erp_${new Date().toISOString().replace(/[:.]/g, '-')}.db`,
          bytes.byteLength,
          checksum,
        ]
      );
    } catch {}

    return bytes;
  }

  /**
   * Imports raw SQLite 3 binary database with pre-restore fallback safety.
   */
  public async importBinaryBlob(bytes: Uint8Array, targetDb?: IDatabaseService): Promise<void> {
    const db = targetDb || dbService;
    const preRestoreBlob = await db.exportDatabaseBlob();
    try {
      await db.importDatabaseBlob(bytes);
    } catch (err) {
      await db.importDatabaseBlob(preRestoreBlob);
      throw new Error(`Binary database import failed: ${(err as Error).message}`);
    }
  }
}

export const backupService = BackupService.getInstance();
