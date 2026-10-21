import { DatabaseSync } from 'node:sqlite';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ERP_SCHEMA_DDL } from './schema.ts';

export interface IDatabaseService {
  initialize(): Promise<void>;
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  execute(sql: string, params?: any[]): Promise<{ rowsAffected: number; lastInsertRowId: number }>;
  transaction<T>(fn: (tx: any) => Promise<T>): Promise<T>;
  exportDatabaseBlob(): Promise<Uint8Array>;
  importDatabaseBlob(bytes: Uint8Array): Promise<void>;
  exportJsonSnapshot(): Promise<string>;
  importJsonSnapshot(jsonStr: string): Promise<void>;
  close(): void;
}

export interface JsonSnapshotPayload {
  metadata: {
    app: string;
    version: string;
    exportedAt: string;
    checksum: string;
  };
  tables: Record<string, any[]>;
}

export class TestDatabaseService implements IDatabaseService {
  private db: DatabaseSync;
  private dbPath: string;

  constructor(dbPath: string = ':memory:') {
    this.dbPath = dbPath;
    this.db = new DatabaseSync(dbPath);
    // Enable WAL mode and foreign keys for transactional integrity
    this.db.exec('PRAGMA foreign_keys = ON;');
  }

  public async initialize(): Promise<void> {
    this.db.exec(ERP_SCHEMA_DDL);
  }

  public async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const sanitized = params.map(p => (p === undefined ? null : p));
    const stmt = this.db.prepare(sql);
    return stmt.all(...sanitized) as T[];
  }

  public async execute(sql: string, params: any[] = []): Promise<{ rowsAffected: number; lastInsertRowId: number }> {
    const sanitized = params.map(p => (p === undefined ? null : p));
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...sanitized);
    return {
      rowsAffected: Number(result.changes),
      lastInsertRowId: Number(result.lastInsertRowid)
    };
  }

  public async transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    this.db.exec('BEGIN IMMEDIATE TRANSACTION;');
    try {
      const res = await fn(this);
      this.db.exec('COMMIT;');
      return res;
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  public async exportJsonSnapshot(): Promise<string> {
    const tableNames = [
      'system_settings',
      'suppliers',
      'items',
      'warehouses',
      'warehouse_locations',
      'item_batches',
      'inventory_stock',
      'purchase_orders',
      'purchase_order_items',
      'goods_receipts',
      'goods_receipt_items',
      'stock_transfers',
      'stock_transfer_items',
      'couriers',
      'shipments',
      'shipment_items',
      'inventory_transactions',
      'audit_logs'
    ];

    const tables: Record<string, any[]> = {};
    for (const tbl of tableNames) {
      const rows = this.db.prepare(`SELECT * FROM ${tbl}`).all();
      tables[tbl] = rows;
    }

    const payloadData = JSON.stringify(tables);
    const checksum = crypto.createHash('sha256').update(payloadData).digest('hex');

    const snapshot: JsonSnapshotPayload = {
      metadata: {
        app: 'Probaho ERP',
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        checksum
      },
      tables
    };

    return JSON.stringify(snapshot, null, 2);
  }

  public async importJsonSnapshot(jsonStr: string): Promise<void> {
    const snapshot: JsonSnapshotPayload = JSON.parse(jsonStr);
    if (!snapshot.metadata || !snapshot.metadata.checksum || !snapshot.tables) {
      throw new Error('Invalid JSON snapshot format');
    }

    // Verify SHA-256 Checksum
    const rawTables = JSON.stringify(snapshot.tables);
    const computedHash = crypto.createHash('sha256').update(rawTables).digest('hex');
    if (computedHash !== snapshot.metadata.checksum) {
      throw new Error(`Integrity check failed: checksum mismatch (expected ${snapshot.metadata.checksum}, calculated ${computedHash})`);
    }

    // Restore tables inside atomic transaction
    this.db.exec('BEGIN IMMEDIATE TRANSACTION;');
    try {
      // Disable foreign keys temporarily during bulk table wipe and re-insertion
      this.db.exec('PRAGMA foreign_keys = OFF;');

      for (const [tbl, rows] of Object.entries(snapshot.tables)) {
        this.db.exec(`DELETE FROM ${tbl};`);
        if (rows && rows.length > 0) {
          const keys = Object.keys(rows[0]);
          const cols = keys.join(', ');
          const placeholders = keys.map(() => '?').join(', ');
          const insertStmt = this.db.prepare(`INSERT INTO ${tbl} (${cols}) VALUES (${placeholders});`);
          for (const row of rows) {
            const values = keys.map(k => row[k]);
            insertStmt.run(...values);
          }
        }
      }

      this.db.exec('PRAGMA foreign_keys = ON;');
      this.db.exec('COMMIT;');
    } catch (err) {
      this.db.exec('ROLLBACK;');
      this.db.exec('PRAGMA foreign_keys = ON;');
      throw err;
    }
  }

  public async exportDatabaseBlob(): Promise<Uint8Array> {
    if (this.dbPath === ':memory:') {
      // For in-memory DB, serialize via temp disk file export
      const tmpPath = path.join(process.cwd(), `tmp-export-${Date.now()}-${Math.random().toString(36).substring(7)}.db`);
      this.db.exec(`VACUUM INTO '${tmpPath.replace(/\\/g, '/')}';`);
      const bytes = fs.readFileSync(tmpPath);
      fs.unlinkSync(tmpPath);
      return new Uint8Array(bytes);
    } else {
      const bytes = fs.readFileSync(this.dbPath);
      return new Uint8Array(bytes);
    }
  }

  public async importDatabaseBlob(bytes: Uint8Array): Promise<void> {
    // Write bytes to temp file, verify integrity, then restore
    const tmpPath = path.join(process.cwd(), `tmp-import-${Date.now()}-${Math.random().toString(36).substring(7)}.db`);
    fs.writeFileSync(tmpPath, Buffer.from(bytes));

    try {
      const checkDb = new DatabaseSync(tmpPath);
      const integrity = checkDb.prepare('PRAGMA integrity_check;').all();
      checkDb.close();
      if (!integrity || (integrity[0] as any).integrity_check !== 'ok') {
        throw new Error('Database blob failed SQLite integrity check');
      }

      // Close current DB and reload
      this.db.close();
      if (this.dbPath === ':memory:') {
        // Memory DB restored by reading from file
        this.db = new DatabaseSync(tmpPath);
        this.dbPath = tmpPath;
      } else {
        fs.copyFileSync(tmpPath, this.dbPath);
        this.db = new DatabaseSync(this.dbPath);
        fs.unlinkSync(tmpPath);
      }
      this.db.exec('PRAGMA foreign_keys = ON;');
    } catch (err) {
      if (fs.existsSync(tmpPath)) {
        try { fs.unlinkSync(tmpPath); } catch {}
      }
      throw err;
    }
  }

  public close(): void {
    try {
      this.db.close();
    } catch {}
    if (this.dbPath && this.dbPath !== ':memory:' && path.basename(this.dbPath).startsWith('tmp-')) {
      try {
        if (fs.existsSync(this.dbPath)) {
          fs.unlinkSync(this.dbPath);
        }
      } catch {}
    }
  }

  public getRawDb(): DatabaseSync {
    return this.db;
  }
}
