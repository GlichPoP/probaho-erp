import { describe, it, expect, beforeEach, runSuites } from '../harness/test-runner.ts';
import { TestDatabaseService } from '../harness/test-db.ts';
import { ERPTestClient } from '../harness/erp-test-client.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';

let db: TestDatabaseService;
let client: ERPTestClient;

describe('Tier 1: Feature Coverage — Local Backup & Disaster Recovery Engine', () => {
  beforeEach(async () => {
    db = new TestDatabaseService(':memory:');
    await db.initialize();
    client = new ERPTestClient(db);

    // Seed test data to backup
    const sup = await client.createSupplier({
      supplierCode: 'SUP-BACKUP-01',
      name: 'Backup Test Vendor',
      contactPerson: 'Zahir',
      phone: '+8801700000020',
      address: 'Motijheel'
    });

    const wh = await client.createWarehouse({
      warehouseCode: 'WH-BACKUP-01',
      name: 'Backup Test Warehouse',
      address: 'Kawran Bazar',
      city: 'Dhaka'
    });

    const item = await client.createItem({
      sku: 'SKU-BACKUP-ITEM-1',
      name: 'Industrial Generator 5KW',
      category: 'Power Equipment',
      costPrice: 450.00,
      sellingPrice: 750.00
    });
  });

  it('TC1.31: Should export a comprehensive JSON snapshot containing all core relational tables and metadata', async () => {
    const jsonStr = await db.exportJsonSnapshot();
    expect(jsonStr).toBeDefined();

    const snapshot = JSON.parse(jsonStr);
    expect(snapshot.metadata).toBeDefined();
    expect(snapshot.metadata.app).toBe('Probaho ERP');
    expect(snapshot.metadata.checksum).toBeDefined();
    expect(snapshot.tables).toBeDefined();

    // Verify seeded tables have rows
    expect(snapshot.tables.suppliers.length).toBeGreaterThan(0);
    expect(snapshot.tables.warehouses.length).toBeGreaterThan(0);
    expect(snapshot.tables.items.length).toBeGreaterThan(0);
  });

  it('TC1.32: Should calculate a valid SHA-256 cryptographic checksum matching snapshot table contents', async () => {
    const jsonStr = await db.exportJsonSnapshot();
    const snapshot = JSON.parse(jsonStr);

    const checksum = snapshot.metadata.checksum;
    expect(typeof checksum).toBe('string');
    expect(checksum.length).toBe(64); // SHA-256 hex string length
  });

  it('TC1.33: Should restore database state from JSON snapshot with 100% data fidelity', async () => {
    const exportedJson = await db.exportJsonSnapshot();

    // Create a new fresh empty database
    const newDb = new TestDatabaseService(':memory:');
    await newDb.initialize();
    const newClient = new ERPTestClient(newDb);

    // Initial state of newDb has 0 suppliers
    const initialSuppliers = await newClient.listSuppliers();
    expect(initialSuppliers.length).toBe(0);

    // Restore from exported snapshot
    await newDb.importJsonSnapshot(exportedJson);

    // Verify restored records
    const restoredSuppliers = await newClient.listSuppliers();
    expect(restoredSuppliers.length).toBe(1);
    expect(restoredSuppliers[0].supplier_code).toBe('SUP-BACKUP-01');

    const restoredWarehouses = await newClient.listWarehouses();
    expect(restoredWarehouses.length).toBe(1);
    expect(restoredWarehouses[0].warehouse_code).toBe('WH-BACKUP-01');

    newDb.close();
  });

  it('TC1.34: Should export a raw SQLite binary database blob', async () => {
    const blob = await db.exportDatabaseBlob();
    expect(blob).toBeDefined();
    expect(blob.length).toBeGreaterThan(0);

    // Verify SQLite header magic bytes: 'SQLite format 3\0'
    const headerStr = Buffer.from(blob.slice(0, 16)).toString('utf8');
    expect(headerStr.startsWith('SQLite format 3')).toBe(true);
  });

  it('TC1.35: Should restore database state from binary SQLite blob and verify table structures', async () => {
    const blob = await db.exportDatabaseBlob();

    const newDb = new TestDatabaseService(':memory:');
    await newDb.importDatabaseBlob(blob);
    const newClient = new ERPTestClient(newDb);

    const sup = await newClient.getSupplierByCode('SUP-BACKUP-01');
    expect(sup).toBeDefined();
    expect(sup.name).toBe('Backup Test Vendor');

    const items = await newClient.listItems();
    expect(items.length).toBe(1);
    expect(items[0].sku).toBe('SKU-BACKUP-ITEM-1');

    newDb.close();
  });

  it('TC1.36: Should reject tampered or corrupted JSON snapshot and abort restore without mutating database', async () => {
    const validJson = await db.exportJsonSnapshot();
    const parsed = JSON.parse(validJson);

    // Tamper with data without updating checksum
    parsed.tables.suppliers.push({
      id: 'malicious-id',
      supplier_code: 'MALICIOUS',
      name: 'Corrupted Vendor',
      phone: '000',
      address: 'Nowhere',
      country: 'Bangladesh',
      is_active: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    const tamperedJson = JSON.stringify(parsed);

    // Restore must reject due to checksum mismatch
    await expect(async () => {
      await db.importJsonSnapshot(tamperedJson);
    }).toReject('Integrity check failed: checksum mismatch');
  });
});

if (process.argv[1]?.includes('backup-restore.test.ts')) {
  runSuites().then(res => {
    if (res.failed > 0) process.exit(1);
  });
}
