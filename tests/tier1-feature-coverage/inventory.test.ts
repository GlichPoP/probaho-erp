import { describe, it, expect, beforeEach, runSuites } from '../harness/test-runner.ts';
import { TestDatabaseService } from '../harness/test-db.ts';
import { ERPTestClient } from '../harness/erp-test-client.ts';

let db: TestDatabaseService;
let client: ERPTestClient;

describe('Tier 1: Feature Coverage — Multi-Warehouse Inventory, Bins, Batches & Valuation', () => {
  beforeEach(async () => {
    db = new TestDatabaseService(':memory:');
    await db.initialize();
    client = new ERPTestClient(db);
  });

  it('TC1.13: Should configure multi-facility warehouses and granular bin locations with composite bin codes', async () => {
    const wh1 = await client.createWarehouse({
      warehouseCode: 'WH-DHAKA-CENTRAL',
      name: 'Dhaka Central Hub',
      address: 'Tejgaon Industrial Area',
      city: 'Dhaka',
      isDefault: true
    });

    const wh2 = await client.createWarehouse({
      warehouseCode: 'WH-CTG-PORT',
      name: 'Chittagong Port Facility',
      address: 'Agrabad C/A',
      city: 'Chittagong'
    });

    expect(wh1.warehouse_code).toBe('WH-DHAKA-CENTRAL');
    expect(wh2.warehouse_code).toBe('WH-CTG-PORT');

    // Create bins inside Dhaka Central Hub
    const bin1 = await client.createLocation({
      warehouseId: wh1.id,
      zone: 'Zone A - Fast Moving',
      aisle: 'Aisle 01',
      rack: 'Rack 02',
      shelf: 'Shelf 03',
      binCode: 'DHK-ZA-A01-R02-S03',
      maxWeightKg: 500
    });

    const bin2 = await client.createLocation({
      warehouseId: wh1.id,
      zone: 'Zone B - Bulk Pallets',
      aisle: 'Aisle 04',
      rack: 'Rack 01',
      shelf: 'Shelf 01',
      binCode: 'DHK-ZB-A04-R01-S01',
      maxWeightKg: 2000
    });

    expect(bin1.bin_code).toBe('DHK-ZA-A01-R02-S03');
    expect(bin2.max_weight_kg).toBe(2000);
  });

  it('TC1.14: Should register and track item batches with lot numbers and expiration dates', async () => {
    const item = await client.createItem({
      sku: 'SKU-PHARMA-CAPSULE-500',
      name: 'Amoxicillin 500mg Raw Material',
      category: 'Pharmaceutical',
      costPrice: 42.00,
      sellingPrice: 70.00
    });

    const batch = await client.createBatch({
      batchNumber: 'LOT-AMX-2026-X1',
      itemId: item.id,
      manufactureDate: '2026-01-10',
      expiryDate: '2028-01-10',
      unitCost: 40.00,
      quantity: 500
    });

    expect(batch.batch_number).toBe('LOT-AMX-2026-X1');
    expect(batch.initial_quantity).toBe(500);
    expect(batch.current_quantity).toBe(500);
    expect(batch.status).toBe('ACTIVE');
  });

  it('TC1.15: Should maintain real-time inventory balances across Item x Warehouse x Bin x Batch matrix', async () => {
    const wh = await client.createWarehouse({
      warehouseCode: 'WH-TEST-MATRIX',
      name: 'Matrix Warehouse',
      address: 'Road 5',
      city: 'Gazipur'
    });

    const bin1 = await client.createLocation({
      warehouseId: wh.id,
      zone: 'Z1',
      aisle: 'A1',
      rack: 'R1',
      shelf: 'S1',
      binCode: 'BIN-M1'
    });

    const bin2 = await client.createLocation({
      warehouseId: wh.id,
      zone: 'Z1',
      aisle: 'A1',
      rack: 'R1',
      shelf: 'S2',
      binCode: 'BIN-M2'
    });

    const item = await client.createItem({
      sku: 'SKU-MATRIX-TEST',
      name: 'Industrial Valve 1/2 inch',
      category: 'Plumbing',
      costPrice: 12.00,
      sellingPrice: 20.00
    });

    // Populate bin 1 with 150 units, bin 2 with 75 units
    await db.execute(
      `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved)
       VALUES ('stk-1', ?, ?, ?, 150, 20), ('stk-2', ?, ?, ?, 75, 0)`,
      [item.id, wh.id, bin1.id, item.id, wh.id, bin2.id]
    );

    const b1Stock = await client.getStockLevel(item.id, wh.id, bin1.id);
    expect(b1Stock.quantity_on_hand).toBe(150);
    expect(b1Stock.quantity_reserved).toBe(20);

    const b2Stock = await client.getStockLevel(item.id, wh.id, bin2.id);
    expect(b2Stock.quantity_on_hand).toBe(75);

    // Aggregate warehouse level stock
    const totals = await client.getItemTotalStock(item.id, wh.id);
    expect(totals.onHand).toBe(225); // 150 + 75
    expect(totals.reserved).toBe(20);
    expect(totals.available).toBe(205); // 225 - 20
  });

  it('TC1.16: Should record double-entry audit ledger entries with running balance on stock receipt', async () => {
    const sup = await client.createSupplier({
      supplierCode: 'SUP-INV-01',
      name: 'Steel Co',
      contactPerson: 'Manager',
      phone: '+8801700000010',
      address: 'Demra'
    });

    const wh = await client.createWarehouse({
      warehouseCode: 'WH-INV-01',
      name: 'Receiving Depot',
      address: 'Demra Ghat',
      city: 'Dhaka'
    });

    const bin = await client.createLocation({
      warehouseId: wh.id,
      zone: 'Receiving Dock',
      aisle: 'Dock 1',
      rack: 'R1',
      shelf: 'S1',
      binCode: 'DOCK-01'
    });

    const item = await client.createItem({
      sku: 'SKU-STEEL-ROD-10MM',
      name: 'Deformed Steel Rod 10mm',
      category: 'Construction',
      costPrice: 85.00,
      sellingPrice: 110.00
    });

    const po = await client.createPurchaseOrder({
      poNumber: 'PO-AUDIT-TEST-01',
      supplierId: sup.id,
      targetWarehouseId: wh.id,
      items: [{ itemId: item.id, sku: item.sku, quantityOrdered: 50, unitCost: 85.00 }]
    });

    await client.updatePurchaseOrderStatus(po.id, 'pending_approval');
    await client.updatePurchaseOrderStatus(po.id, 'approved');
    await client.updatePurchaseOrderStatus(po.id, 'ordered');

    await client.receiveGoods({
      receiptNumber: 'GRN-AUDIT-01',
      poId: po.id,
      warehouseId: wh.id,
      receivedBy: 'Staff Kabir',
      items: [{
        poItemId: po.items[0].id,
        itemId: item.id,
        binId: bin.id,
        quantityReceived: 50,
        quantityAccepted: 50,
        unitCost: 85.00
      }]
    });

    const auditLogs = await client.getInventoryTransactions(po.id);
    expect(auditLogs.length).toBe(1);
    expect(auditLogs[0].transaction_type).toBe('PO_RECEIPT');
    expect(auditLogs[0].quantity_change).toBe(50);
    expect(auditLogs[0].running_balance_after).toBe(50);
    expect(auditLogs[0].user_id).toBe('Staff Kabir');
  });

  it('TC1.17: Should compute inventory valuation accurately using Weighted Moving Average Cost (WAC)', async () => {
    const wh = await client.createWarehouse({
      warehouseCode: 'WH-VALUATION',
      name: 'Valuation Test Hub',
      address: 'Airport Road',
      city: 'Dhaka'
    });

    const bin = await client.createLocation({
      warehouseId: wh.id,
      zone: 'Zone V',
      aisle: 'A1',
      rack: 'R1',
      shelf: 'S1',
      binCode: 'BIN-V1'
    });

    const itemA = await client.createItem({
      sku: 'SKU-VAL-ITEM-A',
      name: 'Item A',
      category: 'Electronics',
      costPrice: 100.00,
      sellingPrice: 150.00
    });

    const itemB = await client.createItem({
      sku: 'SKU-VAL-ITEM-B',
      name: 'Item B',
      category: 'Electronics',
      costPrice: 50.00,
      sellingPrice: 80.00
    });

    // Stock item A: 10 units @ 100 = 1000
    await db.execute(
      "INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved) VALUES ('stk-val-1', ?, ?, ?, 10, 0)",
      [itemA.id, wh.id, bin.id]
    );

    // Stock item B: 20 units @ 50 = 1000
    await db.execute(
      "INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved) VALUES ('stk-val-2', ?, ?, ?, 20, 0)",
      [itemB.id, wh.id, bin.id]
    );

    const valuation = await client.calculateValuation(wh.id);
    expect(valuation.totalUnits).toBe(30); // 10 + 20
    expect(valuation.totalValuation).toBe(2000.00); // 1000 + 1000
  });

  it('TC1.18: Should detect reorder point thresholds and safety stock alerts', async () => {
    const wh = await client.createWarehouse({
      warehouseCode: 'WH-ALERT',
      name: 'Alert Test Hub',
      address: 'Tongi',
      city: 'Gazipur'
    });

    const bin = await client.createLocation({
      warehouseId: wh.id,
      zone: 'Z1',
      aisle: 'A1',
      rack: 'R1',
      shelf: 'S1',
      binCode: 'BIN-ALERT'
    });

    const item = await client.createItem({
      sku: 'SKU-LOW-STOCK-ALERT',
      name: 'Lubricant Oil 5L',
      category: 'Automotive',
      costPrice: 25.00,
      sellingPrice: 40.00,
      minStockAlert: 20,
      safetyStock: 5
    });

    // Stock with 12 units (below minStockAlert: 20)
    await db.execute(
      "INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved) VALUES ('stk-alert-1', ?, ?, ?, 12, 0)",
      [item.id, wh.id, bin.id]
    );

    // Query low stock items
    const lowStockItems = await db.query(`
      SELECT i.sku, i.name, i.min_stock_alert, SUM(s.quantity_on_hand) as current_stock
      FROM items i
      JOIN inventory_stock s ON i.id = s.item_id
      GROUP BY i.id
      HAVING current_stock <= i.min_stock_alert
    `);

    expect(lowStockItems.length).toBe(1);
    expect(lowStockItems[0].sku).toBe('SKU-LOW-STOCK-ALERT');
    expect(lowStockItems[0].current_stock).toBe(12);
  });
});

if (process.argv[1]?.includes('inventory.test.ts')) {
  runSuites().then(res => {
    if (res.failed > 0) process.exit(1);
  });
}
