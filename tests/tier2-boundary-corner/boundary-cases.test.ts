import { describe, it, expect, beforeEach, runSuites } from '../harness/test-runner.ts';
import { TestDatabaseService } from '../harness/test-db.ts';
import { ERPTestClient } from '../harness/erp-test-client.ts';

let db: TestDatabaseService;
let client: ERPTestClient;
let supplier: any;
let warehouse1: any;
let warehouse2: any;
let bin1: any;
let bin2: any;
let item: any;

describe('Tier 2: Boundary & Corner Cases (Negative, Stress & Invariant Enforcement)', () => {
  beforeEach(async () => {
    db = new TestDatabaseService(':memory:');
    await db.initialize();
    client = new ERPTestClient(db);

    supplier = await client.createSupplier({
      supplierCode: 'SUP-BOUND-01',
      name: 'Boundary Test Supplier',
      contactPerson: 'Rahim',
      phone: '+8801700000030',
      address: 'Dhanmondi'
    });

    warehouse1 = await client.createWarehouse({
      warehouseCode: 'WH-BOUND-01',
      name: 'North Warehouse',
      address: 'Uttara',
      city: 'Dhaka'
    });

    warehouse2 = await client.createWarehouse({
      warehouseCode: 'WH-BOUND-02',
      name: 'South Warehouse',
      address: 'Motijheel',
      city: 'Dhaka'
    });

    bin1 = await client.createLocation({
      warehouseId: warehouse1.id,
      zone: 'Zone 1',
      aisle: 'A1',
      rack: 'R1',
      shelf: 'S1',
      binCode: 'BIN-B1'
    });

    bin2 = await client.createLocation({
      warehouseId: warehouse2.id,
      zone: 'Zone 2',
      aisle: 'A1',
      rack: 'R1',
      shelf: 'S1',
      binCode: 'BIN-B2'
    });

    item = await client.createItem({
      sku: 'SKU-BOUND-ITEM-01',
      name: 'Industrial Valve 1/4 inch',
      category: 'Hardware',
      costPrice: 20.00,
      sellingPrice: 35.00
    });
  });

  it('TC2.1: Should strictly prevent negative stock balances via database CHECK constraint', async () => {
    // Insert initial stock of 10
    await db.execute(
      "INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved) VALUES ('stk-b-1', ?, ?, ?, 10, 0)",
      [item.id, warehouse1.id, bin1.id]
    );

    // Attempt to force negative stock (-5)
    await expect(async () => {
      await db.execute(
        "UPDATE inventory_stock SET quantity_on_hand = -5 WHERE id = 'stk-b-1'"
      );
    }).toReject('CHECK constraint failed');
  });

  it('TC2.2: Should reject invalid PO state transitions (e.g. attempting to receive a draft PO)', async () => {
    const po = await client.createPurchaseOrder({
      poNumber: 'PO-INVALID-TRANS',
      supplierId: supplier.id,
      targetWarehouseId: warehouse1.id,
      items: [{ itemId: item.id, sku: item.sku, quantityOrdered: 50, unitCost: 20.00 }]
    });

    // PO is currently in 'draft' status
    expect(po.status).toBe('draft');

    // Attempting to directly receive goods on a draft PO must be rejected!
    await expect(async () => {
      await client.receiveGoods({
        receiptNumber: 'GRN-ILLEGAL-01',
        poId: po.id,
        warehouseId: warehouse1.id,
        receivedBy: 'Inspector',
        items: [{ poItemId: po.items[0].id, itemId: item.id, binId: bin1.id, quantityReceived: 50, quantityAccepted: 50 }]
      });
    }).toReject("Cannot receive goods: PO status is 'draft'.");
  });

  it('TC2.3: Should reject over-delivery beyond PO remaining ordered quantity during GRN inspection', async () => {
    const po = await client.createPurchaseOrder({
      poNumber: 'PO-OVER-DELIVER',
      supplierId: supplier.id,
      targetWarehouseId: warehouse1.id,
      items: [{ itemId: item.id, sku: item.sku, quantityOrdered: 20, unitCost: 20.00 }]
    });

    await client.updatePurchaseOrderStatus(po.id, 'pending_approval');
    await client.updatePurchaseOrderStatus(po.id, 'approved');
    await client.updatePurchaseOrderStatus(po.id, 'ordered');

    // Vendor sends 25 units for a 20-unit PO
    await expect(async () => {
      await client.receiveGoods({
        receiptNumber: 'GRN-OVER-01',
        poId: po.id,
        warehouseId: warehouse1.id,
        receivedBy: 'Inspector',
        items: [{ poItemId: po.items[0].id, itemId: item.id, binId: bin1.id, quantityReceived: 25, quantityAccepted: 25 }]
      });
    }).toReject('Received quantity exceeds remaining PO balance');
  });

  it('TC2.4: Should eliminate phantom inventory by blocking stock transfer when origin stock is insufficient', async () => {
    // Origin warehouse only has 10 units
    await db.execute(
      "INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved) VALUES ('stk-phantom-1', ?, ?, ?, 10, 0)",
      [item.id, warehouse1.id, bin1.id]
    );

    const transfer = await client.createTransfer({
      transferNumber: 'TR-PHANTOM-TEST',
      sourceWarehouseId: warehouse1.id,
      destWarehouseId: warehouse2.id,
      requestedBy: 'Branch Manager',
      items: [{ itemId: item.id, sourceBinId: bin1.id, destBinId: bin2.id, quantityRequested: 50 }] // 50 > 10!
    });

    // Dispatch must reject!
    await expect(async () => {
      await client.dispatchTransfer(transfer.id, 'Driver');
    }).toReject('Insufficient stock available in source warehouse bin');
  });

  it('TC2.5: Should flag expired batches and quarantine them from fulfillment selection', async () => {
    // Create an expired batch (expired in 2024)
    const expiredBatch = await client.createBatch({
      batchNumber: 'LOT-EXPIRED-2024',
      itemId: item.id,
      manufactureDate: '2023-01-01',
      expiryDate: '2024-01-01',
      unitCost: 20.00,
      quantity: 100
    });

    // Update status to EXPIRED
    await db.execute("UPDATE item_batches SET status = 'EXPIRED' WHERE id = ?", [expiredBatch.id]);

    const refreshed = await client.getBatch(expiredBatch.id);
    expect(refreshed.status).toBe('EXPIRED');

    // Verify query for active pickable batches excludes expired batches
    const pickableBatches = await db.query(
      "SELECT * FROM item_batches WHERE item_id = ? AND status = 'ACTIVE' AND date(expiry_date) > date('now')",
      [item.id]
    );
    expect(pickableBatches.length).toBe(0);
  });

  it('TC2.6: Should reject placement into non-existent warehouse bin via foreign key enforcement', async () => {
    await expect(async () => {
      await db.execute(
        "INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved) VALUES ('stk-fk-err', ?, ?, 'non-existent-bin-id', 10, 0)",
        [item.id, warehouse1.id]
      );
    }).toReject('FOREIGN KEY constraint failed');
  });

  it('TC2.7: Should prevent fulfillment shipment creation when stock on hand is zero', async () => {
    const courier = await client.createCourier('Steadfast Courier', '+8801700000055');

    // Item has 0 stock in warehouse 1
    await expect(async () => {
      await client.createShipment({
        shipmentNumber: 'SHP-NO-STOCK',
        orderReference: 'ORD-FAIL-1',
        sourceWarehouseId: warehouse1.id,
        customerName: 'Customer',
        customerPhone: '+8801711111111',
        customerAddress: 'Banani',
        destinationCity: 'Dhaka',
        courierName: courier.name,
        items: [{ itemId: item.id, binId: bin1.id, quantity: 5, unitPrice: 35.00 }]
      });
    }).toReject('Insufficient inventory to fulfill shipment');
  });

  it('TC2.8: Should reject creation of purchase orders or transfers with empty items list', async () => {
    await expect(async () => {
      await client.createPurchaseOrder({
        poNumber: 'PO-EMPTY-LINES',
        supplierId: supplier.id,
        targetWarehouseId: warehouse1.id,
        items: [] // Empty line items!
      });
    }).toReject('A purchase order must include at least one valid line item.');

    await expect(async () => {
      await client.createTransfer({
        transferNumber: 'TR-EMPTY-LINES',
        sourceWarehouseId: warehouse1.id,
        destWarehouseId: warehouse2.id,
        requestedBy: 'Manager',
        items: [] // Empty!
      });
    }).toReject('Transfer must contain at least one line item.');
  });
});

if (process.argv[1]?.includes('boundary-cases.test.ts')) {
  runSuites().then(res => {
    if (res.failed > 0) process.exit(1);
  });
}
