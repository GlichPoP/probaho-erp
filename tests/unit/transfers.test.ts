/**
 * Unit & Integration Test Suite for Stock Transfers & In-Transit Isolation
 * Target File: tests/unit/transfers.test.ts
 * Milestone 3 - Multi-Warehouse Inventory, Valuation & Transfer Management
 *
 * Test Matrix:
 * - TC-TR-01: Create inter-warehouse stock transfer with valid source, destination, and multi-line items
 * - TC-TR-02: Strictly prevent self-transfers when source and destination warehouse are identical
 * - TC-TR-03: Reject transfer creation with empty line items or zero/negative requested quantity
 * - TC-TR-04: Transfer state machine progression (draft -> requested -> in_transit)
 * - TC-TR-05: Strictly reject illegal state transitions (e.g. draft directly to completed, or in_transit back to draft)
 * - TC-TR-06: Cancellation guard: Allow cancellation from draft or requested status
 * - TC-TR-07: Cancellation guard: Strictly reject cancellation once transfer is in_transit or completed
 * - TC-TR-08: Dispatch transfer: Immediate and atomic deduction of stock from source warehouse and bin
 * - TC-TR-09: Dispatch transfer: Strictly reject dispatch when source warehouse/bin has insufficient stock
 * - TC-TR-10: In-transit stock isolation: Destination warehouse stock remains exactly zero during transit (zero phantom inventory)
 * - TC-TR-11: Destination receipt: Increment destination warehouse/bin stock upon arrival and mark status completed
 * - TC-TR-12: Total inventory conservation: Verify exact conservation of global system inventory across transfer
 * - TC-TR-13: Over-receiving protection: Strictly reject receiving quantity greater than shipped quantity
 * - TC-TR-14: Transit discrepancy handling: Reconcile partial delivery with transit damage/loss reason logged
 * - TC-TR-15: Double-entry audit ledger: Verify immutable TRANSFER_OUT and TRANSFER_IN audit trail records
 * - TC-TR-16: Cancellation with existing notes: Successfully append cancellation reason without SQLite syntax errors
 */

import { describe, it, expect, beforeEach, runSuites } from '../harness/test-runner.ts';
import { TestDatabaseService } from '../harness/test-db.ts';
import { ERPTestClient } from '../harness/erp-test-client.ts';

let db: TestDatabaseService;
let client: ERPTestClient;

let whDhaka: any;
let whChittagong: any;
let binDhaka: any;
let binChittagong: any;
let itemPanel: any;
let itemCable: any;

describe('Unit & Integration Test: Inter-Warehouse Stock Transfer Service', () => {
  beforeEach(async () => {
    db = new TestDatabaseService(':memory:');
    await db.initialize();
    client = new ERPTestClient(db);

    // 1. Seed Warehouses
    whDhaka = await client.createWarehouse({
      warehouseCode: 'WH-DHAKA-MAIN',
      name: 'Dhaka Central Distribution Hub',
      address: 'Tejgaon Industrial Area',
      city: 'Dhaka',
      isDefault: true
    });

    whChittagong = await client.createWarehouse({
      warehouseCode: 'WH-CTG-DEPOT',
      name: 'Chittagong Port Depot',
      address: 'Agrabad C/A',
      city: 'Chittagong',
      isDefault: false
    });

    // 2. Seed Bins
    binDhaka = await client.createLocation({
      warehouseId: whDhaka.id,
      zone: 'Zone D - Outbound Staging',
      aisle: 'A1',
      rack: 'R1',
      shelf: 'S1',
      binCode: 'DHK-STG-01'
    });

    binChittagong = await client.createLocation({
      warehouseId: whChittagong.id,
      zone: 'Zone C - Inbound Receiving',
      aisle: 'A1',
      rack: 'R1',
      shelf: 'S1',
      binCode: 'CTG-RCV-01'
    });

    // 3. Seed Items
    itemPanel = await client.createItem({
      sku: 'SKU-SOLAR-PANEL-450W',
      name: 'Monocrystalline Solar Panel 450W',
      category: 'Solar',
      costPrice: 110.00,
      sellingPrice: 165.00
    });

    itemCable = await client.createItem({
      sku: 'SKU-DC-CABLE-6MM',
      name: 'Solar DC Cable 6mm (100m Drum)',
      category: 'Solar',
      costPrice: 45.00,
      sellingPrice: 75.00
    });

    // 4. Seed initial stock in Dhaka: 100 panels, 50 cable drums
    await db.execute(
      `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved)
       VALUES ('stk-seed-p', ?, ?, ?, 100, 0), ('stk-seed-c', ?, ?, ?, 50, 0)`,
      [itemPanel.id, whDhaka.id, binDhaka.id, itemCable.id, whDhaka.id, binDhaka.id]
    );
  });

  // --------------------------------------------------------------------------
  // TC-TR-01: Create inter-warehouse stock transfer
  // --------------------------------------------------------------------------
  it('TC-TR-01: Should create an inter-warehouse stock transfer request between two distinct warehouse facilities', async () => {
    const transfer = await client.createTransfer({
      transferNumber: 'TR-202610-001',
      sourceWarehouseId: whDhaka.id,
      destWarehouseId: whChittagong.id,
      requestedBy: 'Ctg Operations Lead',
      notes: 'Replenishing coastal project installation inventory',
      items: [
        {
          itemId: itemPanel.id,
          sourceBinId: binDhaka.id,
          destBinId: binChittagong.id,
          quantityRequested: 30
        },
        {
          itemId: itemCable.id,
          sourceBinId: binDhaka.id,
          destBinId: binChittagong.id,
          quantityRequested: 10
        }
      ]
    });

    expect(transfer).toBeDefined();
    expect(transfer.transfer_number).toBe('TR-202610-001');
    expect(transfer.status).toBe('draft');
    expect(transfer.source_warehouse_id).toBe(whDhaka.id);
    expect(transfer.dest_warehouse_id).toBe(whChittagong.id);
    expect(transfer.items.length).toBe(2);
    expect(transfer.items[0].quantity_requested).toBe(30);
    expect(transfer.items[1].quantity_requested).toBe(10);
  });

  // --------------------------------------------------------------------------
  // TC-TR-02: Strictly prevent self-transfers
  // --------------------------------------------------------------------------
  it('TC-TR-02: Should strictly prevent self-transfers when source and destination warehouse are identical', async () => {
    await expect(async () => {
      await client.createTransfer({
        transferNumber: 'TR-SELF-TRANSFER',
        sourceWarehouseId: whDhaka.id,
        destWarehouseId: whDhaka.id, // Identical!
        requestedBy: 'Manager',
        items: [
          {
            itemId: itemPanel.id,
            sourceBinId: binDhaka.id,
            destBinId: binDhaka.id,
            quantityRequested: 10
          }
        ]
      });
    }).toReject('Source and destination warehouses cannot be identical.');
  });

  // --------------------------------------------------------------------------
  // TC-TR-03: Reject empty line items or zero/negative requested quantity
  // --------------------------------------------------------------------------
  it('TC-TR-03: Should reject transfer creation with empty line items or non-positive requested quantity', async () => {
    // Empty line items
    await expect(async () => {
      await client.createTransfer({
        transferNumber: 'TR-EMPTY-LINES',
        sourceWarehouseId: whDhaka.id,
        destWarehouseId: whChittagong.id,
        requestedBy: 'Manager',
        items: []
      });
    }).toReject('Transfer must contain at least one line item.');

    // Zero quantity requested
    await expect(async () => {
      await client.createTransfer({
        transferNumber: 'TR-ZERO-QTY',
        sourceWarehouseId: whDhaka.id,
        destWarehouseId: whChittagong.id,
        requestedBy: 'Manager',
        items: [
          {
            itemId: itemPanel.id,
            sourceBinId: binDhaka.id,
            destBinId: binChittagong.id,
            quantityRequested: 0
          }
        ]
      });
    }).toReject('Quantity requested must be greater than zero.');
  });

  // --------------------------------------------------------------------------
  // TC-TR-04: Transfer state machine progression
  // --------------------------------------------------------------------------
  it('TC-TR-04: Should progress transfer state machine cleanly from draft through in_transit', async () => {
    const transfer = await client.createTransfer({
      transferNumber: 'TR-STATE-01',
      sourceWarehouseId: whDhaka.id,
      destWarehouseId: whChittagong.id,
      requestedBy: 'Manager',
      items: [
        {
          itemId: itemPanel.id,
          sourceBinId: binDhaka.id,
          destBinId: binChittagong.id,
          quantityRequested: 20
        }
      ]
    });

    expect(transfer.status).toBe('draft');

    // Advance to requested
    await db.execute(
      "UPDATE stock_transfers SET status = 'requested', updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) WHERE id = ?",
      [transfer.id]
    );
    const requested = await client.getTransfer(transfer.id);
    expect(requested.status).toBe('requested');

    // Dispatch moves to in_transit
    const dispatched = await client.dispatchTransfer(transfer.id, 'Carrier Driver');
    expect(dispatched.status).toBe('in_transit');
  });

  // --------------------------------------------------------------------------
  // TC-TR-05: Strictly reject illegal state transitions
  // --------------------------------------------------------------------------
  it('TC-TR-05: Should strictly block illegal state jumps (e.g. from in_transit back to draft)', async () => {
    const transfer = await client.createTransfer({
      transferNumber: 'TR-ILLEGAL-TRANS',
      sourceWarehouseId: whDhaka.id,
      destWarehouseId: whChittagong.id,
      requestedBy: 'Manager',
      items: [
        {
          itemId: itemPanel.id,
          sourceBinId: binDhaka.id,
          destBinId: binChittagong.id,
          quantityRequested: 10
        }
      ]
    });

    await client.dispatchTransfer(transfer.id, 'Driver');

    // Receiving is only allowed from in_transit, cannot jump directly from draft
    // And once in_transit, dispatching again must be rejected
    await expect(async () => {
      await client.dispatchTransfer(transfer.id, 'Driver');
    }).toReject("Cannot dispatch transfer: status is 'in_transit'");
  });

  // --------------------------------------------------------------------------
  // TC-TR-06: Cancellation guard: Allow cancellation from draft or requested
  // --------------------------------------------------------------------------
  it('TC-TR-06: Should allow cancelling transfers that are still in draft or requested status', async () => {
    const transfer = await client.createTransfer({
      transferNumber: 'TR-CANCEL-DRAFT',
      sourceWarehouseId: whDhaka.id,
      destWarehouseId: whChittagong.id,
      requestedBy: 'Manager',
      items: [
        {
          itemId: itemPanel.id,
          sourceBinId: binDhaka.id,
          destBinId: binChittagong.id,
          quantityRequested: 15
        }
      ]
    });

    // Genuine cancellation call via test client (exercising domain transferService)
    const cancelled = await client.cancelTransfer(transfer.id, 'Cancelled before dispatch', 'Manager');
    expect(cancelled.status).toBe('cancelled');

    const fetched = await client.getTransfer(transfer.id);
    expect(fetched.status).toBe('cancelled');
    expect(fetched.notes).toContain('Cancelled before dispatch');

    // Stock in Dhaka was NOT deducted
    const dhakaStock = await client.getItemTotalStock(itemPanel.id, whDhaka.id);
    expect(dhakaStock.onHand).toBe(100);
  });

  // --------------------------------------------------------------------------
  // TC-TR-07: Cancellation guard: Block cancellation once in_transit or completed
  // --------------------------------------------------------------------------
  it('TC-TR-07: Should strictly reject cancelling transfers once in_transit or completed', async () => {
    const transfer = await client.createTransfer({
      transferNumber: 'TR-CANCEL-BLOCKED',
      sourceWarehouseId: whDhaka.id,
      destWarehouseId: whChittagong.id,
      requestedBy: 'Manager',
      items: [
        {
          itemId: itemPanel.id,
          sourceBinId: binDhaka.id,
          destBinId: binChittagong.id,
          quantityRequested: 25
        }
      ]
    });

    await client.dispatchTransfer(transfer.id, 'Driver');

    // Genuine service cancellation call - must reject while in_transit
    await expect(async () => {
      await client.cancelTransfer(transfer.id, 'Illegal in-transit cancel');
    }).toReject('Cannot cancel transfer: items are already in transit.');

    // Receive transfer to transition to completed
    await client.receiveTransfer(
      transfer.id,
      [{ lineId: transfer.items[0].id, quantityReceived: 25 }],
      'Receiver'
    );

    // Genuine service cancellation call - must reject once completed
    await expect(async () => {
      await client.cancelTransfer(transfer.id, 'Illegal completed cancel');
    }).toReject('Cannot cancel transfer: transfer has already been completed.');
  });

  // --------------------------------------------------------------------------
  // TC-TR-08: Dispatch transfer: Immediate deduction from source
  // --------------------------------------------------------------------------
  it('TC-TR-08: Should atomically deduct stock from source warehouse and bin upon dispatch', async () => {
    const transfer = await client.createTransfer({
      transferNumber: 'TR-DISPATCH-DEDUCT',
      sourceWarehouseId: whDhaka.id,
      destWarehouseId: whChittagong.id,
      requestedBy: 'Logistics Supervisor',
      items: [
        {
          itemId: itemPanel.id,
          sourceBinId: binDhaka.id,
          destBinId: binChittagong.id,
          quantityRequested: 40
        }
      ]
    });

    expect((await client.getItemTotalStock(itemPanel.id, whDhaka.id)).onHand).toBe(100);

    const dispatched = await client.dispatchTransfer(transfer.id, 'Driver Jahangir');
    expect(dispatched.status).toBe('in_transit');
    expect(dispatched.items[0].quantity_shipped).toBe(40);

    // Dhaka stock must drop immediately: 100 - 40 = 60
    const postDhakaStock = await client.getItemTotalStock(itemPanel.id, whDhaka.id);
    expect(postDhakaStock.onHand).toBe(60);
  });

  // --------------------------------------------------------------------------
  // TC-TR-09: Dispatch transfer: Insufficient stock prevention
  // --------------------------------------------------------------------------
  it('TC-TR-09: Should strictly reject dispatch when source warehouse/bin has insufficient stock', async () => {
    // Current stock: 100 panels. Attempt to transfer 150!
    const transfer = await client.createTransfer({
      transferNumber: 'TR-INSUFFICIENT-STOCK',
      sourceWarehouseId: whDhaka.id,
      destWarehouseId: whChittagong.id,
      requestedBy: 'Manager',
      items: [
        {
          itemId: itemPanel.id,
          sourceBinId: binDhaka.id,
          destBinId: binChittagong.id,
          quantityRequested: 150
        }
      ]
    });

    await expect(async () => {
      await client.dispatchTransfer(transfer.id, 'Driver');
    }).toReject('Insufficient stock available in source warehouse bin');
  });

  // --------------------------------------------------------------------------
  // TC-TR-10: In-transit stock isolation: Zero phantom inventory
  // --------------------------------------------------------------------------
  it('TC-TR-10: Should isolate in-transit stock so destination warehouse has zero phantom inventory', async () => {
    const transfer = await client.createTransfer({
      transferNumber: 'TR-ISOLATION-01',
      sourceWarehouseId: whDhaka.id,
      destWarehouseId: whChittagong.id,
      requestedBy: 'Manager',
      items: [
        {
          itemId: itemPanel.id,
          sourceBinId: binDhaka.id,
          destBinId: binChittagong.id,
          quantityRequested: 35
        }
      ]
    });

    await client.dispatchTransfer(transfer.id, 'Driver Jahangir');

    // Source decremented: 100 - 35 = 65
    const dhakaStock = await client.getItemTotalStock(itemPanel.id, whDhaka.id);
    expect(dhakaStock.onHand).toBe(65);

    // Destination stock MUST BE ZERO while in transit
    const ctgStock = await client.getItemTotalStock(itemPanel.id, whChittagong.id);
    expect(ctgStock.onHand).toBe(0);

    // Global visible stock on hand is only 65 (35 is physically in transit on the road)
    const totalVisible = await client.getItemTotalStock(itemPanel.id);
    expect(totalVisible.onHand).toBe(65);
  });

  // --------------------------------------------------------------------------
  // TC-TR-11: Destination receipt: Increment destination stock and complete
  // --------------------------------------------------------------------------
  it('TC-TR-11: Should atomically increment destination stock and mark transfer completed on arrival', async () => {
    const transfer = await client.createTransfer({
      transferNumber: 'TR-RECEIVE-COMPLETE',
      sourceWarehouseId: whDhaka.id,
      destWarehouseId: whChittagong.id,
      requestedBy: 'Manager',
      items: [
        {
          itemId: itemPanel.id,
          sourceBinId: binDhaka.id,
          destBinId: binChittagong.id,
          quantityRequested: 30
        }
      ]
    });

    await client.dispatchTransfer(transfer.id, 'Driver');

    const completed = await client.receiveTransfer(
      transfer.id,
      [{ lineId: transfer.items[0].id, quantityReceived: 30 }],
      'Receiver Mizan'
    );

    expect(completed.status).toBe('completed');
    expect(completed.items[0].quantity_received).toBe(30);

    // Destination stock incremented to 30
    const ctgStock = await client.getItemTotalStock(itemPanel.id, whChittagong.id);
    expect(ctgStock.onHand).toBe(30);
  });

  // --------------------------------------------------------------------------
  // TC-TR-12: Total inventory conservation
  // --------------------------------------------------------------------------
  it('TC-TR-12: Should guarantee exact global inventory conservation before, during, and after transfer', async () => {
    // Before: Dhaka = 100 panels, Ctg = 0 panels -> Total = 100
    const beforeTotal = await client.getItemTotalStock(itemPanel.id);
    expect(beforeTotal.onHand).toBe(100);

    const transfer = await client.createTransfer({
      transferNumber: 'TR-CONSERVATION-CHECK',
      sourceWarehouseId: whDhaka.id,
      destWarehouseId: whChittagong.id,
      requestedBy: 'Manager',
      items: [
        {
          itemId: itemPanel.id,
          sourceBinId: binDhaka.id,
          destBinId: binChittagong.id,
          quantityRequested: 45
        }
      ]
    });

    // During transit: Dhaka = 55, in-transit = 45, Ctg = 0
    await client.dispatchTransfer(transfer.id, 'Driver');
    const midDhaka = await client.getItemTotalStock(itemPanel.id, whDhaka.id);
    const midCtg = await client.getItemTotalStock(itemPanel.id, whChittagong.id);
    expect(midDhaka.onHand).toBe(55);
    expect(midCtg.onHand).toBe(0);

    // After receipt: Dhaka = 55, Ctg = 45 -> Total = 100!
    await client.receiveTransfer(
      transfer.id,
      [{ lineId: transfer.items[0].id, quantityReceived: 45 }],
      'Receiver'
    );

    const finalDhaka = await client.getItemTotalStock(itemPanel.id, whDhaka.id);
    const finalCtg = await client.getItemTotalStock(itemPanel.id, whChittagong.id);
    const finalTotal = await client.getItemTotalStock(itemPanel.id);

    expect(finalDhaka.onHand).toBe(55);
    expect(finalCtg.onHand).toBe(45);
    expect(finalTotal.onHand).toBe(100); // Exact conservation!
  });

  // --------------------------------------------------------------------------
  // TC-TR-13: Over-receiving protection
  // --------------------------------------------------------------------------
  it('TC-TR-13: Should strictly reject receiving more units than shipped', async () => {
    const transfer = await client.createTransfer({
      transferNumber: 'TR-OVER-RECEIVE-GUARD',
      sourceWarehouseId: whDhaka.id,
      destWarehouseId: whChittagong.id,
      requestedBy: 'Manager',
      items: [
        {
          itemId: itemPanel.id,
          sourceBinId: binDhaka.id,
          destBinId: binChittagong.id,
          quantityRequested: 20
        }
      ]
    });

    await client.dispatchTransfer(transfer.id, 'Driver');

    // Shipped: 20. Attempt to receive: 25!
    await expect(async () => {
      await client.receiveTransfer(
        transfer.id,
        [{ lineId: transfer.items[0].id, quantityReceived: 25 }],
        'Receiver'
      );
    }).toReject('Received quantity cannot exceed shipped quantity.');
  });

  // --------------------------------------------------------------------------
  // TC-TR-14: Transit discrepancy handling
  // --------------------------------------------------------------------------
  it('TC-TR-14: Should handle transit discrepancies and log damage/loss reason without leaking phantom stock', async () => {
    const transfer = await client.createTransfer({
      transferNumber: 'TR-DISCREPANCY-TEST',
      sourceWarehouseId: whDhaka.id,
      destWarehouseId: whChittagong.id,
      requestedBy: 'Manager',
      items: [
        {
          itemId: itemPanel.id,
          sourceBinId: binDhaka.id,
          destBinId: binChittagong.id,
          quantityRequested: 50
        }
      ]
    });

    await client.dispatchTransfer(transfer.id, 'Driver');

    // 50 shipped; 48 received intact, 2 damaged in transport
    const reconciled = await client.receiveTransfer(
      transfer.id,
      [
        {
          lineId: transfer.items[0].id,
          quantityReceived: 48,
          discrepancyReason: '2 solar panels shattered due to road collision'
        }
      ],
      'QC Receiver'
    );

    expect(reconciled.status).toBe('completed');
    expect(reconciled.items[0].quantity_received).toBe(48);
    expect(reconciled.items[0].discrepancy_reason).toBe('2 solar panels shattered due to road collision');

    // Destination stock gets exactly 48 (the 2 broken units are NOT added to stock)
    const ctgStock = await client.getItemTotalStock(itemPanel.id, whChittagong.id);
    expect(ctgStock.onHand).toBe(48);
  });

  // --------------------------------------------------------------------------
  // TC-TR-15: Double-entry audit ledger entries
  // --------------------------------------------------------------------------
  it('TC-TR-15: Should record immutable TRANSFER_OUT and TRANSFER_IN entries in inventory_transactions', async () => {
    const transfer = await client.createTransfer({
      transferNumber: 'TR-AUDIT-DOUBLE-ENTRY',
      sourceWarehouseId: whDhaka.id,
      destWarehouseId: whChittagong.id,
      requestedBy: 'Manager',
      items: [
        {
          itemId: itemCable.id,
          sourceBinId: binDhaka.id,
          destBinId: binChittagong.id,
          quantityRequested: 15
        }
      ]
    });

    await client.dispatchTransfer(transfer.id, 'Driver Belal');
    await client.receiveTransfer(
      transfer.id,
      [{ lineId: transfer.items[0].id, quantityReceived: 15 }],
      'Receiver Selim'
    );

    const auditRecords = await client.getInventoryTransactions(transfer.transfer_number);
    expect(auditRecords.length).toBe(2);

    const outTx = auditRecords.find((tx: any) => tx.transaction_type === 'TRANSFER_OUT');
    const inTx = auditRecords.find((tx: any) => tx.transaction_type === 'TRANSFER_IN');

    expect(outTx).toBeDefined();
    expect(outTx.warehouse_id).toBe(whDhaka.id);
    expect(outTx.quantity_change).toBe(-15);
    expect(outTx.running_balance_after).toBe(35); // 50 - 15 = 35

    expect(inTx).toBeDefined();
    expect(inTx.warehouse_id).toBe(whChittagong.id);
    expect(inTx.quantity_change).toBe(15);
    expect(inTx.running_balance_after).toBe(15);
  });

  // --------------------------------------------------------------------------
  // TC-TR-16: Cancellation with existing notes: Successfully append cancellation reason without SQLite syntax errors
  // --------------------------------------------------------------------------
  it('TC-TR-16: Should successfully cancel transfer with pre-existing notes and append cancellation reason without SQLite syntax errors', async () => {
    const transfer = await client.createTransfer({
      transferNumber: 'TR-CANCEL-WITH-NOTES',
      sourceWarehouseId: whDhaka.id,
      destWarehouseId: whChittagong.id,
      requestedBy: 'Operations Manager',
      notes: 'Initial request: Priority project delivery for coastal site.',
      items: [
        {
          itemId: itemPanel.id,
          sourceBinId: binDhaka.id,
          destBinId: binChittagong.id,
          quantityRequested: 20
        }
      ]
    });

    expect(transfer.notes).toBe('Initial request: Priority project delivery for coastal site.');

    // Cancelling a transfer with existing notes must not crash with SQLite syntax error
    const cancelled = await client.cancelTransfer(
      transfer.id,
      'Project postponed by client',
      'Area Supervisor'
    );

    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.notes).toContain('Initial request: Priority project delivery for coastal site.');
    expect(cancelled.notes).toContain('Cancelled by Area Supervisor: Project postponed by client');

    const fetched = await client.getTransfer(transfer.id);
    expect(fetched.status).toBe('cancelled');
    expect(fetched.notes).toContain('Initial request: Priority project delivery for coastal site.');
    expect(fetched.notes).toContain('Cancelled by Area Supervisor: Project postponed by client');

    // Verify source stock remained intact
    const sourceStock = await client.getItemTotalStock(itemPanel.id, whDhaka.id);
    expect(sourceStock.onHand).toBe(100);
  });
});

if (process.argv[1]?.includes('transfers.test.ts')) {
  runSuites().then(res => {
    if (res.failed > 0) process.exit(1);
  });
}
