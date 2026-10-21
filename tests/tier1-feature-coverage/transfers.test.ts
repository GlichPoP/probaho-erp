import { describe, it, expect, beforeEach, runSuites } from '../harness/test-runner.ts';
import { TestDatabaseService } from '../harness/test-db.ts';
import { ERPTestClient } from '../harness/erp-test-client.ts';

let db: TestDatabaseService;
let client: ERPTestClient;
let whDhaka: any;
let whCtg: any;
let binDhaka: any;
let binCtg: any;
let item: any;

describe('Tier 1: Feature Coverage — Inter-Warehouse Stock Transfers', () => {
  beforeEach(async () => {
    db = new TestDatabaseService(':memory:');
    await db.initialize();
    client = new ERPTestClient(db);

    whDhaka = await client.createWarehouse({
      warehouseCode: 'WH-DHAKA-MAIN',
      name: 'Dhaka Main Hub',
      address: 'Tejgaon',
      city: 'Dhaka'
    });

    whCtg = await client.createWarehouse({
      warehouseCode: 'WH-CTG-DEPOT',
      name: 'Chittagong Distribution Depot',
      address: 'Agrabad',
      city: 'Chittagong'
    });

    binDhaka = await client.createLocation({
      warehouseId: whDhaka.id,
      zone: 'Zone D',
      aisle: 'A1',
      rack: 'R1',
      shelf: 'S1',
      binCode: 'DHK-BIN-01'
    });

    binCtg = await client.createLocation({
      warehouseId: whCtg.id,
      zone: 'Zone C',
      aisle: 'A1',
      rack: 'R1',
      shelf: 'S1',
      binCode: 'CTG-BIN-01'
    });

    item = await client.createItem({
      sku: 'SKU-LED-LIGHT-18W',
      name: 'LED Ceiling Panel 18W',
      category: 'Lighting',
      costPrice: 8.50,
      sellingPrice: 15.00
    });

    // Seed Dhaka with 200 units
    await db.execute(
      "INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved) VALUES ('stk-tr-seed', ?, ?, ?, 200, 0)",
      [item.id, whDhaka.id, binDhaka.id]
    );
  });

  it('TC1.19: Should create an inter-warehouse stock transfer request between two distinct warehouse facilities', async () => {
    const transfer = await client.createTransfer({
      transferNumber: 'TR-202610-001',
      sourceWarehouseId: whDhaka.id,
      destWarehouseId: whCtg.id,
      requestedBy: 'Ctg Branch Manager',
      notes: 'Replenishing coastal inventory',
      items: [
        {
          itemId: item.id,
          sourceBinId: binDhaka.id,
          destBinId: binCtg.id,
          quantityRequested: 50
        }
      ]
    });

    expect(transfer).toBeDefined();
    expect(transfer.transfer_number).toBe('TR-202610-001');
    expect(transfer.status).toBe('draft');
    expect(transfer.source_warehouse_id).toBe(whDhaka.id);
    expect(transfer.dest_warehouse_id).toBe(whCtg.id);
    expect(transfer.items).toHaveLength(1);
    expect(transfer.items[0].quantity_requested).toBe(50);
  });

  it('TC1.20: Should strictly prevent self-transfers when source and destination warehouse are identical', async () => {
    await expect(async () => {
      await client.createTransfer({
        transferNumber: 'TR-INVALID-SELF',
        sourceWarehouseId: whDhaka.id,
        destWarehouseId: whDhaka.id, // Identical!
        requestedBy: 'Manager',
        items: [
          {
            itemId: item.id,
            sourceBinId: binDhaka.id,
            destBinId: binDhaka.id,
            quantityRequested: 10
          }
        ]
      });
    }).toReject('Source and destination warehouses cannot be identical.');
  });

  it('TC1.21: Should dispatch transfer, atomically deducting from source and updating status to in_transit', async () => {
    const transfer = await client.createTransfer({
      transferNumber: 'TR-202610-002',
      sourceWarehouseId: whDhaka.id,
      destWarehouseId: whCtg.id,
      requestedBy: 'Logistics Officer',
      items: [
        {
          itemId: item.id,
          sourceBinId: binDhaka.id,
          destBinId: binCtg.id,
          quantityRequested: 60
        }
      ]
    });

    // Initial Dhaka stock is 200
    const initialDhaka = await client.getItemTotalStock(item.id, whDhaka.id);
    expect(initialDhaka.onHand).toBe(200);

    // Dispatch
    const dispatched = await client.dispatchTransfer(transfer.id, 'Truck Driver Harun');
    expect(dispatched.status).toBe('in_transit');
    expect(dispatched.items[0].quantity_shipped).toBe(60);

    // Dhaka stock must drop to 140
    const postDhaka = await client.getItemTotalStock(item.id, whDhaka.id);
    expect(postDhaka.onHand).toBe(140);

    // Verify audit log
    const auditLogs = await client.getInventoryTransactions(transfer.transfer_number);
    expect(auditLogs.length).toBe(1);
    expect(auditLogs[0].transaction_type).toBe('TRANSFER_OUT');
    expect(auditLogs[0].quantity_change).toBe(-60);
    expect(auditLogs[0].running_balance_after).toBe(140);
  });

  it('TC1.22: Should isolate in-transit stock so it is not visible at destination before arrival', async () => {
    const transfer = await client.createTransfer({
      transferNumber: 'TR-202610-003',
      sourceWarehouseId: whDhaka.id,
      destWarehouseId: whCtg.id,
      requestedBy: 'Logistics Officer',
      items: [
        {
          itemId: item.id,
          sourceBinId: binDhaka.id,
          destBinId: binCtg.id,
          quantityRequested: 40
        }
      ]
    });

    await client.dispatchTransfer(transfer.id, 'Driver Harun');

    // Dhaka stock is 200 - 40 = 160
    const dhakaStock = await client.getItemTotalStock(item.id, whDhaka.id);
    expect(dhakaStock.onHand).toBe(160);

    // Chittagong stock MUST be 0 while in-transit
    const ctgStock = await client.getItemTotalStock(item.id, whCtg.id);
    expect(ctgStock.onHand).toBe(0);
  });

  it('TC1.23: Should complete transfer upon receipt, atomically incrementing destination warehouse stock', async () => {
    const transfer = await client.createTransfer({
      transferNumber: 'TR-202610-004',
      sourceWarehouseId: whDhaka.id,
      destWarehouseId: whCtg.id,
      requestedBy: 'Logistics Officer',
      items: [
        {
          itemId: item.id,
          sourceBinId: binDhaka.id,
          destBinId: binCtg.id,
          quantityRequested: 50
        }
      ]
    });

    await client.dispatchTransfer(transfer.id, 'Driver Harun');

    // Receive full 50 at destination
    const completed = await client.receiveTransfer(
      transfer.id,
      [{ lineId: transfer.items[0].id, quantityReceived: 50 }],
      'Receiver Rubel'
    );

    expect(completed.status).toBe('completed');
    expect(completed.items[0].quantity_received).toBe(50);

    // Chittagong stock is now 50
    const ctgStock = await client.getItemTotalStock(item.id, whCtg.id);
    expect(ctgStock.onHand).toBe(50);

    // Total system stock = 150 (Dhaka) + 50 (Ctg) = 200 (Exact preservation of inventory!)
    const totalSystem = await client.getItemTotalStock(item.id);
    expect(totalSystem.onHand).toBe(200);
  });

  it('TC1.24: Should handle transit discrepancies when destination receives fewer units than shipped', async () => {
    const transfer = await client.createTransfer({
      transferNumber: 'TR-202610-DISCREPANCY',
      sourceWarehouseId: whDhaka.id,
      destWarehouseId: whCtg.id,
      requestedBy: 'Logistics Officer',
      items: [
        {
          itemId: item.id,
          sourceBinId: binDhaka.id,
          destBinId: binCtg.id,
          quantityRequested: 50
        }
      ]
    });

    await client.dispatchTransfer(transfer.id, 'Driver Harun');

    // 50 shipped, but only 47 received (3 broken in transit)
    const reconciled = await client.receiveTransfer(
      transfer.id,
      [{ lineId: transfer.items[0].id, quantityReceived: 47, discrepancyReason: '3 units broken during transport' }],
      'Receiver Rubel'
    );

    expect(reconciled.status).toBe('completed');
    expect(reconciled.items[0].quantity_received).toBe(47);
    expect(reconciled.items[0].discrepancy_reason).toBe('3 units broken during transport');

    // Chittagong receives only 47
    const ctgStock = await client.getItemTotalStock(item.id, whCtg.id);
    expect(ctgStock.onHand).toBe(47);
  });
});

if (process.argv[1]?.includes('transfers.test.ts')) {
  runSuites().then(res => {
    if (res.failed > 0) process.exit(1);
  });
}
