import { describe, it, expect, beforeEach, runSuites } from '../harness/test-runner.ts';
import { TestDatabaseService } from '../harness/test-db.ts';
import { ERPTestClient } from '../harness/erp-test-client.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Tier 4: Real-World Enterprise Workload Scenarios & Session Persistence', () => {
  it('TC4.1: Should simulate high-throughput distributor supply chain execution with multi-supplier, multi-warehouse batch operations', async () => {
    const db = new TestDatabaseService(':memory:');
    await db.initialize();
    const client = new ERPTestClient(db);

    // 1. Onboard 5 Suppliers
    const suppliers: any[] = [];
    for (let i = 1; i <= 5; i++) {
      const sup = await client.createSupplier({
        supplierCode: `SUP-DIST-${i}`,
        name: `Distributor Vendor ${i} Ltd`,
        contactPerson: `Contact Person ${i}`,
        phone: `+880170000010${i}`,
        address: `Industrial Sector ${i}`,
        leadTimeDays: 5 + i
      });
      suppliers.push(sup);
    }
    expect(suppliers).toHaveLength(5);

    // 2. Provision 3 Regional Warehouses
    const wh1 = await client.createWarehouse({
      warehouseCode: 'WH-CENTRAL-DIST',
      name: 'Central Hub',
      address: 'Tejgaon',
      city: 'Dhaka',
      isDefault: true
    });
    const wh2 = await client.createWarehouse({
      warehouseCode: 'WH-PORT-DIST',
      name: 'Port Hub',
      address: 'Agrabad',
      city: 'Chittagong'
    });
    const wh3 = await client.createWarehouse({
      warehouseCode: 'WH-NORTH-DIST',
      name: 'North Hub',
      address: 'Bogra Road',
      city: 'Rajshahi'
    });

    // Provision bins
    const bin1 = await client.createLocation({ warehouseId: wh1.id, zone: 'Z1', aisle: 'A1', rack: 'R1', shelf: 'S1', binCode: 'BIN-W1-01' });
    const bin2 = await client.createLocation({ warehouseId: wh2.id, zone: 'Z2', aisle: 'A2', rack: 'R1', shelf: 'S1', binCode: 'BIN-W2-01' });
    const bin3 = await client.createLocation({ warehouseId: wh3.id, zone: 'Z3', aisle: 'A3', rack: 'R1', shelf: 'S1', binCode: 'BIN-W3-01' });

    // 3. Register 10 SKUs across categories
    const items: any[] = [];
    for (let i = 1; i <= 10; i++) {
      const itm = await client.createItem({
        sku: `SKU-PROD-${1000 + i}`,
        name: `Heavy Duty Component ${i}`,
        category: i % 2 === 0 ? 'Mechanical' : 'Electrical',
        costPrice: 20.00 + (i * 5),
        sellingPrice: 35.00 + (i * 8)
      });
      items.push(itm);
    }
    expect(items).toHaveLength(10);

    // 4. Issue 5 POs (each ordering 2 distinct SKUs for 100 units each = 200 units per PO)
    for (let p = 0; p < 5; p++) {
      const sup = suppliers[p];
      const itemA = items[p * 2];
      const itemB = items[p * 2 + 1];

      const po = await client.createPurchaseOrder({
        poNumber: `PO-DIST-BATCH-${p + 1}`,
        supplierId: sup.id,
        targetWarehouseId: wh1.id,
        items: [
          { itemId: itemA.id, sku: itemA.sku, quantityOrdered: 100, unitCost: itemA.cost_price },
          { itemId: itemB.id, sku: itemB.sku, quantityOrdered: 100, unitCost: itemB.cost_price }
        ]
      });

      await client.updatePurchaseOrderStatus(po.id, 'pending_approval');
      await client.updatePurchaseOrderStatus(po.id, 'approved');
      await client.updatePurchaseOrderStatus(po.id, 'ordered');

      // Full goods receipt for each PO into Central Hub
      await client.receiveGoods({
        receiptNumber: `GRN-DIST-${p + 1}`,
        poId: po.id,
        warehouseId: wh1.id,
        receivedBy: `Receiving Team ${p + 1}`,
        items: [
          { poItemId: po.items[0].id, itemId: itemA.id, binId: bin1.id, quantityReceived: 100, quantityAccepted: 100, unitCost: itemA.cost_price },
          { poItemId: po.items[1].id, itemId: itemB.id, binId: bin1.id, quantityReceived: 100, quantityAccepted: 100, unitCost: itemB.cost_price }
        ]
      });
    }

    // Verify Central Hub holds 5 * 200 = 1000 total units
    const centralValuation = await client.calculateValuation(wh1.id);
    expect(centralValuation.totalUnits).toBe(1000);

    // 5. Execute 5 Inter-Warehouse Transfers from Central Hub to Port Hub and North Hub
    for (let t = 0; t < 5; t++) {
      const itm = items[t];
      const targetWh = t % 2 === 0 ? wh2 : wh3;
      const targetBin = t % 2 === 0 ? bin2 : bin3;

      const tr = await client.createTransfer({
        transferNumber: `TR-DIST-BULK-${t + 1}`,
        sourceWarehouseId: wh1.id,
        destWarehouseId: targetWh.id,
        requestedBy: 'Hub Replenishment Engine',
        items: [{ itemId: itm.id, sourceBinId: bin1.id, destBinId: targetBin.id, quantityRequested: 30 }]
      });

      await client.dispatchTransfer(tr.id);
      await client.receiveTransfer(tr.id, [{ lineId: tr.items[0].id, quantityReceived: 30 }]);
    }

    // Total system stock must still be exactly 1000 units
    const allValuation = await client.calculateValuation();
    expect(allValuation.totalUnits).toBe(1000);

    // 6. Execute 10 Outbound Customer Shipments
    const courier = await client.createCourier('Distributor Fleet', '+8801800000000');
    for (let s = 0; s < 10; s++) {
      const itm = items[s];
      // Draw 10 units from Central Hub
      const shp = await client.createShipment({
        shipmentNumber: `SHP-DIST-CUST-${s + 1}`,
        orderReference: `ORD-BULK-SALE-${s + 1}`,
        sourceWarehouseId: wh1.id,
        customerName: `Commercial Client ${s + 1}`,
        customerPhone: `+880170000099${s}`,
        customerAddress: `Client Site ${s + 1}`,
        destinationCity: 'Dhaka',
        courierName: courier.name,
        items: [{ itemId: itm.id, binId: bin1.id, quantity: 10, unitPrice: itm.selling_price }]
      });

      await client.dispatchShipment(shp.id, `TRACK-DIST-${s + 1}`);
      await client.updateShipmentStatus(shp.id, 'in_transit');
      await client.updateShipmentStatus(shp.id, 'delivered');
    }

    // After 10 shipments of 10 units = 100 units dispatched, total stock drops to 900
    const finalValuation = await client.calculateValuation();
    expect(finalValuation.totalUnits).toBe(900);

    db.close();
  });

  it('TC4.2: Should verify session persistence & cold restart: data created during session persists and reloads correctly', async () => {
    const diskDbPath = path.join(process.cwd(), `test-session-persistence-${Date.now()}.db`);

    // --- SESSION 1: Startup, perform work, then terminate ---
    {
      const sessionDb = new TestDatabaseService(diskDbPath);
      await sessionDb.initialize();
      const sessionClient = new ERPTestClient(sessionDb);

      // Create persistent records
      const sup = await sessionClient.createSupplier({
        supplierCode: 'SUP-PERSIST-01',
        name: 'Persistent Heavy Industries Ltd',
        contactPerson: 'Sabbir Ahmed',
        phone: '+8801711999888',
        address: 'Bogra Industrial Estate',
        city: 'Bogra'
      });

      const wh = await sessionClient.createWarehouse({
        warehouseCode: 'WH-PERSIST-01',
        name: 'Persistent Distribution Hub',
        address: 'Rangpur Road',
        city: 'Bogra'
      });

      const bin = await sessionClient.createLocation({
        warehouseId: wh.id,
        zone: 'Zone A',
        aisle: 'A1',
        rack: 'R1',
        shelf: 'S1',
        binCode: 'BIN-PERSIST-01'
      });

      const item = await sessionClient.createItem({
        sku: 'SKU-PERSIST-TURBINE-01',
        name: 'Industrial Water Turbine 500W',
        category: 'Heavy Machinery',
        costPrice: 1200.00,
        sellingPrice: 1950.00
      });

      const po = await sessionClient.createPurchaseOrder({
        poNumber: 'PO-PERSIST-SESSION-01',
        supplierId: sup.id,
        targetWarehouseId: wh.id,
        items: [{ itemId: item.id, sku: item.sku, quantityOrdered: 25, unitCost: 1200.00 }]
      });

      await sessionClient.updatePurchaseOrderStatus(po.id, 'pending_approval');
      await sessionClient.updatePurchaseOrderStatus(po.id, 'approved');
      await sessionClient.updatePurchaseOrderStatus(po.id, 'ordered');

      await sessionClient.receiveGoods({
        receiptNumber: 'GRN-PERSIST-01',
        poId: po.id,
        warehouseId: wh.id,
        receivedBy: 'Chief Inspector',
        items: [{
          poItemId: po.items[0].id,
          itemId: item.id,
          batchNumber: 'LOT-TURBINE-2026',
          binId: bin.id,
          quantityReceived: 25,
          quantityAccepted: 25,
          unitCost: 1200.00
        }]
      });

      // Verify Session 1 stock
      const s1Stock = await sessionClient.getItemTotalStock(item.id, wh.id);
      expect(s1Stock.onHand).toBe(25);

      // Simulate application shutdown / process exit
      sessionDb.close();
    }

    // --- SESSION 2: Cold restart after app termination ---
    {
      expect(fs.existsSync(diskDbPath)).toBe(true);

      const restartedDb = new TestDatabaseService(diskDbPath);
      const restartedClient = new ERPTestClient(restartedDb);

      // Verify supplier was persisted
      const reloadedSup = await restartedClient.getSupplierByCode('SUP-PERSIST-01');
      expect(reloadedSup).toBeDefined();
      expect(reloadedSup.name).toBe('Persistent Heavy Industries Ltd');

      // Verify PO and line items were persisted
      const reloadedPos = await restartedDb.query("SELECT * FROM purchase_orders WHERE po_number = 'PO-PERSIST-SESSION-01'");
      expect(reloadedPos.length).toBe(1);
      expect(reloadedPos[0].status).toBe('received');

      // Verify stock level was preserved
      const items = await restartedDb.query("SELECT id FROM items WHERE sku = 'SKU-PERSIST-TURBINE-01'");
      const s2Stock = await restartedClient.getItemTotalStock(items[0].id);
      expect(s2Stock.onHand).toBe(25);

      // Verify audit logs were persisted
      const logs = await restartedClient.getInventoryTransactions(reloadedPos[0].id);
      expect(logs.length).toBe(1);
      expect(logs[0].transaction_type).toBe('PO_RECEIPT');
      expect(logs[0].running_balance_after).toBe(25);

      restartedDb.close();
      try { fs.unlinkSync(diskDbPath); } catch {}
    }
  });

  it('TC4.3: Should verify ACID transaction rollback on mid-operation failure without leaving partial state', async () => {
    const db = new TestDatabaseService(':memory:');
    await db.initialize();
    const client = new ERPTestClient(db);

    const sup = await client.createSupplier({
      supplierCode: 'SUP-ROLLBACK',
      name: 'Rollback Test Vendor',
      contactPerson: 'Zubair',
      phone: '+8801700000077',
      address: 'Dhaka'
    });

    const initialSuppliers = await client.listSuppliers();
    expect(initialSuppliers.length).toBe(1);

    // Attempt a transaction where step 1 succeeds, but step 2 causes a fatal error
    await expect(async () => {
      await db.transaction(async () => {
        // Step 1: Insert supplier 2
        await db.execute(
          "INSERT INTO suppliers (id, supplier_code, name, contact_person, phone, address) VALUES ('sup-rb-2', 'SUP-RB-2', 'Temp Vendor', 'X', '123', 'Y')"
        );

        // Step 2: Fatal error (violating foreign key or duplicate key)
        await db.execute(
          "INSERT INTO suppliers (id, supplier_code, name, contact_person, phone, address) VALUES ('sup-rb-3', 'SUP-RB-2', 'Duplicate Vendor', 'Z', '456', 'W')" // Duplicate supplier_code!
        );
      });
    }).toReject('UNIQUE constraint failed');

    // Confirm that supplier 2 was rolled back and is NOT in the database!
    const postRollbackSuppliers = await client.listSuppliers();
    expect(postRollbackSuppliers.length).toBe(1);
    expect(postRollbackSuppliers[0].supplier_code).toBe('SUP-ROLLBACK');

    db.close();
  });

  it('TC4.4: Should verify complete disaster recovery: export JSON snapshot and restore on fresh instance with 100% schema and data integrity', async () => {
    const db1 = new TestDatabaseService(':memory:');
    await db1.initialize();
    const client1 = new ERPTestClient(db1);

    // Seed data
    const sup = await client1.createSupplier({ supplierCode: 'SUP-DR-1', name: 'DR Supplier', contactPerson: 'Officer', phone: '+8801700000066', address: 'Gazipur' });
    const wh = await client1.createWarehouse({ warehouseCode: 'WH-DR-1', name: 'DR Warehouse', address: 'Tongi', city: 'Gazipur' });
    const bin = await client1.createLocation({ warehouseId: wh.id, zone: 'Z1', aisle: 'A1', rack: 'R1', shelf: 'S1', binCode: 'BIN-DR-1' });
    const item = await client1.createItem({ sku: 'SKU-DR-ITEM', name: 'DR Item', category: 'Medical', costPrice: 30.00, sellingPrice: 50.00 });

    const snapshot = await db1.exportJsonSnapshot();
    db1.close();

    // Fresh instance
    const db2 = new TestDatabaseService(':memory:');
    await db2.initialize();
    await db2.importJsonSnapshot(snapshot);

    const client2 = new ERPTestClient(db2);
    const restoredSup = await client2.getSupplierByCode('SUP-DR-1');
    expect(restoredSup).toBeDefined();
    expect(restoredSup.name).toBe('DR Supplier');

    const restoredItems = await client2.listItems();
    expect(restoredItems.length).toBe(1);
    expect(restoredItems[0].sku).toBe('SKU-DR-ITEM');

    db2.close();
  });
});

if (process.argv[1]?.includes('enterprise-scenarios.test.ts')) {
  runSuites().then(res => {
    if (res.failed > 0) process.exit(1);
  });
}
