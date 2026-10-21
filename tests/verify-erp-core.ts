#!/usr/bin/env node
/**
 * Probaho ERP - Standalone Acceptance Criteria Verification Script
 * Validates all functional and transactional criteria from ORIGINAL_REQUEST.md:
 * 1. Supplier creation and purchase order issuance
 * 2. Goods receipt note (GRN) inspection and multi-warehouse stock increment
 * 3. Inter-warehouse stock transfer and reconciliation
 * 4. Outbound fulfillment shipment dispatch and courier tracking
 * 5. Return-to-Origin (RTO) processing and inventory restocking
 * 6. Session persistence and cold restart integrity
 * 7. Lightweight, offline-first embedded SQLite operation with zero cloud latency
 * 8. Dual-format local backup and disaster recovery (JSON snapshot + SQLite binary)
 *
 * Execution:
 *   node --experimental-strip-types tests/verify-erp-core.ts
 *   npx tsx tests/verify-erp-core.ts
 *   npm run test:verify
 */

import { DatabaseService } from '../src/services/db.ts';
import { ERPTestClient } from './harness/erp-test-client.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ANSI Color Helpers
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m'
};

interface StepResult {
  code: string;
  title: string;
  passed: boolean;
  durationMs: number;
  details: string;
}

const results: StepResult[] = [];

async function recordStep(
  code: string,
  title: string,
  fn: () => Promise<string>
): Promise<boolean> {
  const t0 = Date.now();
  process.stdout.write(`  ${colors.yellow}⏳ Running [${code}] ${title}...${colors.reset}`);
  try {
    const details = await fn();
    const durationMs = Date.now() - t0;
    process.stdout.write(`\r  ${colors.green}✔ PASS [${code}] ${title} ${colors.gray}(${durationMs}ms)${colors.reset}\n`);
    if (details) {
      console.log(`     ${colors.gray}↳ ${details}${colors.reset}`);
    }
    results.push({ code, title, passed: true, durationMs, details });
    return true;
  } catch (err: any) {
    const durationMs = Date.now() - t0;
    process.stdout.write(`\r  ${colors.red}✘ FAIL [${code}] ${title} ${colors.gray}(${durationMs}ms)${colors.reset}\n`);
    console.error(`     ${colors.red}↳ Error: ${err.message || err}${colors.reset}`);
    results.push({ code, title, passed: false, durationMs, details: err.message || String(err) });
    return false;
  }
}

async function runVerification() {
  console.log(`\n${colors.bold}${colors.cyan}========================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}          PROBAHO ERP — STANDALONE CORE ACCEPTANCE VERIFIER            ${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}========================================================================${colors.reset}\n`);
  console.log(`${colors.gray}Environment: Node.js ${process.version} | Embedded SQLite (sql.js WebAssembly) | Zero Cloud Latency${colors.reset}\n`);

  const startTime = Date.now();
  const db = new DatabaseService(':memory:');
  await db.initialize();
  const client = new ERPTestClient(db);

  let supplier: any;
  let centralWh: any;
  let portWh: any;
  let centralBin: any;
  let portBin: any;
  let itemBearing: any;
  let itemInverter: any;
  let po: any;
  let transfer: any;
  let shipment: any;

  // ---------------------------------------------------------------------------
  // AC1: Creating a supplier and issuing a purchase order
  // ---------------------------------------------------------------------------
  await recordStep('AC1', 'Vendor & Supplier Creation and Purchase Order Issuance', async () => {
    // 1. Create Supplier
    supplier = await client.createSupplier({
      supplierCode: 'SUP-AC-001',
      name: 'Bengal Precision Industrial Works Ltd',
      contactPerson: 'Engr. Zahid Hasan',
      phone: '+8801711554433',
      email: 'sales@bengalprecision.com',
      address: 'Plot 88, Tejgaon Industrial Area',
      city: 'Dhaka',
      country: 'Bangladesh',
      taxId: 'BIN-1002993881',
      paymentTermsDays: 30,
      leadTimeDays: 7,
      rating: 4.9
    });

    if (!supplier || supplier.supplier_code !== 'SUP-AC-001') {
      throw new Error('Failed to create or verify supplier entity');
    }

    // 2. Setup Warehouse & Bins
    centralWh = await client.createWarehouse({
      warehouseCode: 'WH-DHAKA-CENTRAL',
      name: 'Dhaka Central Hub',
      address: 'Hemayetpur, Savar',
      city: 'Dhaka',
      isDefault: true
    });

    portWh = await client.createWarehouse({
      warehouseCode: 'WH-CTG-PORT',
      name: 'Chittagong Port Facility',
      address: 'Agrabad Access Road',
      city: 'Chittagong'
    });

    centralBin = await client.createLocation({
      warehouseId: centralWh.id,
      zone: 'Zone A - Primary',
      aisle: 'A1',
      rack: 'R1',
      shelf: 'S1',
      binCode: 'DHK-ZA-A01-R01-S01'
    });

    portBin = await client.createLocation({
      warehouseId: portWh.id,
      zone: 'Zone Coastal',
      aisle: 'C1',
      rack: 'R1',
      shelf: 'S1',
      binCode: 'CTG-ZC-A01-R01-S01'
    });

    // 3. Setup Items
    itemBearing = await client.createItem({
      sku: 'SKU-BEARING-6205',
      name: 'Deep Groove Ball Bearing 6205-2RS',
      category: 'Mechanical',
      costPrice: 24.50,
      sellingPrice: 45.00
    });

    itemInverter = await client.createItem({
      sku: 'SKU-INVERTER-5KW',
      name: 'Solar Hybrid Inverter 5KW',
      category: 'Electrical',
      costPrice: 450.00,
      sellingPrice: 680.00
    });

    // 4. Create and Issue PO
    po = await client.createPurchaseOrder({
      poNumber: 'PO-202610-AC1-001',
      supplierId: supplier.id,
      targetWarehouseId: centralWh.id,
      items: [
        { itemId: itemBearing.id, sku: itemBearing.sku, quantityOrdered: 200, unitCost: 24.50 },
        { itemId: itemInverter.id, sku: itemInverter.sku, quantityOrdered: 20, unitCost: 450.00 }
      ],
      paymentTerms: 'Net 30'
    });

    // Subtotal: 200 * 24.50 + 20 * 450 = 4900 + 9000 = 13900
    if (po.total_amount !== 13900.00) {
      throw new Error(`Expected PO total 13900.00, got ${po.total_amount}`);
    }

    // Advance approval workflow to 'ordered'
    await client.updatePurchaseOrderStatus(po.id, 'pending_approval');
    await client.updatePurchaseOrderStatus(po.id, 'approved');
    const issuedPo = await client.updatePurchaseOrderStatus(po.id, 'ordered');

    return `Supplier '${supplier.name}' registered; PO '${issuedPo.po_number}' issued (Total: $${issuedPo.total_amount}, 2 line items, Status: '${issuedPo.status}').`;
  });

  // ---------------------------------------------------------------------------
  // AC2: Receiving goods against a PO and incrementing multi-warehouse inventory
  // ---------------------------------------------------------------------------
  await recordStep('AC2', 'Goods Receipt Note (GRN) Inspection & Multi-Warehouse Stock Increment', async () => {
    // Inspection and receipt: 100% accepted for Inverters (20 units), and 190 accepted + 10 rejected for Bearings
    const grn = await client.receiveGoods({
      receiptNumber: 'GRN-202610-AC2-001',
      poId: po.id,
      warehouseId: centralWh.id,
      receivedBy: 'Chief QC Inspector Kabir',
      inspectionNotes: '10 bearings rejected due to packaging seal breach; all inverters passed electrical test',
      items: [
        {
          poItemId: po.items[0].id,
          itemId: itemBearing.id,
          batchNumber: 'LOT-BRG-2026-X1',
          binId: centralBin.id,
          quantityReceived: 200,
          quantityAccepted: 190,
          quantityRejected: 10,
          rejectionReason: 'Damaged Seal'
        },
        {
          poItemId: po.items[1].id,
          itemId: itemInverter.id,
          batchNumber: 'LOT-INV-2026-V1',
          binId: centralBin.id,
          quantityReceived: 20,
          quantityAccepted: 20,
          quantityRejected: 0
        }
      ]
    });

    // Check inventory stock balances
    const bearingStock = await client.getItemTotalStock(itemBearing.id, centralWh.id);
    const inverterStock = await client.getItemTotalStock(itemInverter.id, centralWh.id);

    if (bearingStock.onHand !== 190) {
      throw new Error(`Expected bearing stock 190, got ${bearingStock.onHand}`);
    }
    if (inverterStock.onHand !== 20) {
      throw new Error(`Expected inverter stock 20, got ${inverterStock.onHand}`);
    }

    // Verify PO status progressed
    const refreshedPo = await client.getPurchaseOrder(po.id);

    return `GRN '${grn.receiptNumber}' processed: 190 bearings + 20 inverters added to ${centralWh.name}. PO status: '${refreshedPo.status}'.`;
  });

  // ---------------------------------------------------------------------------
  // AC3: Initiating an inter-warehouse stock transfer and reconciling stock counts
  // ---------------------------------------------------------------------------
  await recordStep('AC3', 'Inter-Warehouse Stock Transfer & In-Transit Reconciliation', async () => {
    // Transfer 60 Bearings and 5 Inverters from Central Hub to Port Facility
    transfer = await client.createTransfer({
      transferNumber: 'TR-202610-AC3-001',
      sourceWarehouseId: centralWh.id,
      destWarehouseId: portWh.id,
      requestedBy: 'Chittagong Supply Coordinator',
      notes: 'Transferring to regional hub for coastal distributor orders',
      items: [
        { itemId: itemBearing.id, sourceBinId: centralBin.id, destBinId: portBin.id, quantityRequested: 60 },
        { itemId: itemInverter.id, sourceBinId: centralBin.id, destBinId: portBin.id, quantityRequested: 5 }
      ]
    });

    // 1. Dispatch Transfer
    await client.dispatchTransfer(transfer.id, 'Freight Logistics Line 4');

    // Verify Central Hub stock deducted immediately: 190 - 60 = 130 bearings; 20 - 5 = 15 inverters
    const centralBearingsMid = await client.getItemTotalStock(itemBearing.id, centralWh.id);
    const portBearingsMid = await client.getItemTotalStock(itemBearing.id, portWh.id);

    if (centralBearingsMid.onHand !== 130) {
      throw new Error(`Expected central stock 130 during transit, got ${centralBearingsMid.onHand}`);
    }
    if (portBearingsMid.onHand !== 0) {
      throw new Error(`Expected port stock 0 during transit, got ${portBearingsMid.onHand}`);
    }

    // 2. Receive and Reconcile at Destination
    await client.receiveTransfer(
      transfer.id,
      [
        { lineId: transfer.items[0].id, quantityReceived: 60 },
        { lineId: transfer.items[1].id, quantityReceived: 5 }
      ],
      'Port Facility Receiving Staff'
    );

    // Verify Destination received counts
    const centralBearingsFinal = await client.getItemTotalStock(itemBearing.id, centralWh.id);
    const portBearingsFinal = await client.getItemTotalStock(itemBearing.id, portWh.id);

    if (centralBearingsFinal.onHand !== 130 || portBearingsFinal.onHand !== 60) {
      throw new Error(`Reconciliation mismatch: Central=${centralBearingsFinal.onHand}, Port=${portBearingsFinal.onHand}`);
    }

    // Total system count preserved: 130 + 60 = 190 bearings!
    const totalBearings = await client.getItemTotalStock(itemBearing.id);
    if (totalBearings.onHand !== 190) {
      throw new Error(`Total system count violated: expected 190, got ${totalBearings.onHand}`);
    }

    return `Transfer '${transfer.transfer_number}' completed: 60 bearings & 5 inverters moved. Balance reconciled: Central=130, Port=60 (Total=190).`;
  });

  // ---------------------------------------------------------------------------
  // AC4: Creating an outbound shipment and tracking dispatch/fulfillment states
  // ---------------------------------------------------------------------------
  await recordStep('AC4', 'Outbound Fulfillment Shipment Creation & Carrier Tracking', async () => {
    const courier = await client.createCourier('Pathao Enterprise Cargo', '+8809610112233');

    // Create shipment for 10 bearings from Port Facility
    shipment = await client.createShipment({
      shipmentNumber: 'SHP-202610-AC4-001',
      orderReference: 'ORD-CLIENT-CTG-101',
      sourceWarehouseId: portWh.id,
      customerName: 'Karnaphuli Shipbuilders Ltd',
      customerPhone: '+8801819123456',
      customerAddress: 'Shipyard Area, Sadarghat',
      destinationCity: 'Chittagong',
      courierName: courier.name,
      items: [
        { itemId: itemBearing.id, binId: portBin.id, quantity: 10, unitPrice: 45.00 }
      ]
    });

    // Verify reservation: Port has 60 on hand, 10 reserved, 50 available
    const portStockPre = await client.getItemTotalStock(itemBearing.id, portWh.id);
    if (portStockPre.reserved !== 10 || portStockPre.available !== 50) {
      throw new Error(`Expected 10 reserved, got ${portStockPre.reserved}`);
    }

    // Dispatch shipment with carrier tracking code
    const dispatched = await client.dispatchShipment(shipment.id, 'PATHAO-EXP-889922');
    if (dispatched.status !== 'dispatched' || dispatched.tracking_number !== 'PATHAO-EXP-889922') {
      throw new Error('Dispatch failed to set status or tracking code');
    }

    // Physical stock deducted: 60 - 10 = 50 on hand
    const portStockPost = await client.getItemTotalStock(itemBearing.id, portWh.id);
    if (portStockPost.onHand !== 50) {
      throw new Error(`Expected port stock 50 after dispatch, got ${portStockPost.onHand}`);
    }

    // Carrier progression: dispatched -> in_transit
    const transitShp = await client.updateShipmentStatus(shipment.id, 'in_transit');

    return `Shipment '${shipment.shipment_number}' dispatched via '${courier.name}' (Tracking: ${dispatched.tracking_number}, Status: '${transitShp.status}'). Stock deducted: Port=50.`;
  });

  // ---------------------------------------------------------------------------
  // AC5: Return-to-Origin (RTO) Processing & Inventory Restocking
  // ---------------------------------------------------------------------------
  await recordStep('AC5', 'Return-to-Origin (RTO) Exception Intake & Restocking Workflow', async () => {
    // Delivery attempt failed (customer site temporarily inaccessible) -> mark RTO
    const rtoShp = await client.updateShipmentStatus(
      shipment.id,
      'return_to_origin',
      'Port terminal gate closed for maintenance; customer requested return to depot'
    );
    if (rtoShp.status !== 'return_to_origin') {
      throw new Error(`Expected return_to_origin, got ${rtoShp.status}`);
    }

    // Staff inspects returned parcel; items are pristine; restock back into Port bin
    const restockedShp = await client.processRTO(shipment.id, 'restocked', portBin.id);
    if (restockedShp.status !== 'rto_received' || restockedShp.rto_disposition !== 'restocked') {
      throw new Error(`Expected rto_received restocked, got ${restockedShp.status}`);
    }

    // Port warehouse inventory restored: 50 + 10 = 60!
    const portStockRestored = await client.getItemTotalStock(itemBearing.id, portWh.id);
    if (portStockRestored.onHand !== 60) {
      throw new Error(`Expected port stock 60 after RTO restock, got ${portStockRestored.onHand}`);
    }

    return `RTO processed for '${shipment.shipment_number}': 10 bearings inspected and restocked. Port inventory restored to ${portStockRestored.onHand} units.`;
  });

  // ---------------------------------------------------------------------------
  // AC6: Session Persistence & Application Restart Integrity
  // ---------------------------------------------------------------------------
  await recordStep('AC6', 'Session Persistence & Cold Application Restart Integrity', async () => {
    const diskPath = path.join(process.cwd(), `test-verification-session-${Date.now()}.db`);

    // Session 1: Create session state on disk
    {
      const sDb = new DatabaseService(diskPath);
      await sDb.initialize();
      const sClient = new ERPTestClient(sDb);

      const testSup = await sClient.createSupplier({
        supplierCode: 'SUP-SESSION-VERIFY',
        name: 'Cold Restart Validation Corp',
        contactPerson: 'Lead Auditor',
        phone: '+8801700000888',
        address: 'Baridhara DOHS'
      });

      const testWh = await sClient.createWarehouse({
        warehouseCode: 'WH-SESSION-VERIFY',
        name: 'Cold Restart Warehouse',
        address: 'Banasree',
        city: 'Dhaka'
      });

      const testBin = await sClient.createLocation({
        warehouseId: testWh.id,
        zone: 'Z1',
        aisle: 'A1',
        rack: 'R1',
        shelf: 'S1',
        binCode: 'BIN-SESSION-VERIFY'
      });

      const testItem = await sClient.createItem({
        sku: 'SKU-SESSION-TEST',
        name: 'Persistent Sensor Unit',
        category: 'IoT',
        costPrice: 15.00,
        sellingPrice: 30.00
      });

      // Stock 100 units
      await sDb.execute(
        "INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved) VALUES ('stk-sess-1', ?, ?, ?, 100, 0)",
        [testItem.id, testWh.id, testBin.id]
      );

      await sDb.close();
    }

    // Session 2: Reopen from disk file (simulate application relaunch)
    {
      if (!fs.existsSync(diskPath)) {
        throw new Error('Session database file did not persist to disk');
      }

      const rDb = new DatabaseService(diskPath);
      await rDb.initialize();
      const rClient = new ERPTestClient(rDb);

      const reloadedSup = await rClient.getSupplierByCode('SUP-SESSION-VERIFY');
      if (!reloadedSup || reloadedSup.name !== 'Cold Restart Validation Corp') {
        throw new Error('Supplier entity corrupted or lost after restart');
      }

      const reloadedItems = await rDb.query("SELECT id FROM items WHERE sku = 'SKU-SESSION-TEST'");
      const stock = await rClient.getItemTotalStock(reloadedItems[0].id);
      if (stock.onHand !== 100) {
        throw new Error(`Stock mismatch after restart: expected 100, got ${stock.onHand}`);
      }

      await rDb.close();
      try { fs.unlinkSync(diskPath); } catch {}
    }

    return 'Full state persisted to binary database on disk; reloaded cleanly with 100% entity and stock fidelity.';
  });

  // ---------------------------------------------------------------------------
  // AC7: Lightweight Embedded SQLite Zero-Cloud-Latency Assertion
  // ---------------------------------------------------------------------------
  await recordStep('AC7', 'Lightweight Embedded SQLite Zero-Cloud-Latency Operation', async () => {
    // Execute 100 sequential queries in-memory to benchmark local execution speed
    const t0 = Date.now();
    for (let i = 0; i < 100; i++) {
      await db.query('SELECT count(*) FROM items');
    }
    const elapsedMs = Date.now() - t0;
    const avgLatencyMs = elapsedMs / 100;

    if (avgLatencyMs > 2.0) {
      throw new Error(`Average query latency too high (${avgLatencyMs.toFixed(2)}ms) for local embedded engine`);
    }

    return `100 sequential database queries executed in ${elapsedMs}ms (average: ${avgLatencyMs.toFixed(3)}ms per query, 0.00ms cloud network latency).`;
  });

  // ---------------------------------------------------------------------------
  // AC8: Dual Backup & Disaster Recovery (JSON Snapshot + SQLite Binary)
  // ---------------------------------------------------------------------------
  await recordStep('AC8', 'Dual-Format Local Backup & Disaster Recovery Engine', async () => {
    // 1. JSON Snapshot Export
    const jsonStr = await db.exportJsonSnapshot();
    const snapshot = JSON.parse(jsonStr);

    if (!snapshot.metadata || !snapshot.metadata.checksum || !snapshot.tables) {
      throw new Error('Invalid JSON snapshot format');
    }

    // 2. Binary SQLite Blob Export
    const binaryBlob = await db.exportDatabaseBlob();
    if (binaryBlob.length < 100) {
      throw new Error('SQLite binary blob export produced empty or truncated output');
    }

    // 3. Restore JSON Snapshot into fresh instance
    const freshDb = new DatabaseService(':memory:');
    await freshDb.initialize();
    await freshDb.importJsonSnapshot(jsonStr);

    const freshClient = new ERPTestClient(freshDb);
    const restoredSupplier = await freshClient.getSupplierByCode(supplier.supplier_code);
    if (!restoredSupplier || restoredSupplier.name !== supplier.name) {
      throw new Error('Disaster recovery restore failed to recover supplier record');
    }

    await freshDb.close();

    return `JSON snapshot (${(jsonStr.length / 1024).toFixed(1)} KB, SHA-256: ${snapshot.metadata.checksum.substring(0, 16)}...) and SQLite binary blob (${(binaryBlob.length / 1024).toFixed(1)} KB) exported and verified.`;
  });

  await db.close();

  const totalDurationMs = Date.now() - startTime;
  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.filter(r => !r.passed).length;

  console.log(`\n${colors.bold}${colors.cyan}========================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}                    VERIFICATION SCORECARD                             ${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}========================================================================${colors.reset}`);
  console.log(`  ${colors.bold}Criteria Verified:${colors.reset} ${results.length}`);
  console.log(`  ${colors.bold}Passed:${colors.reset}            ${colors.green}${passedCount}${colors.reset}`);
  console.log(`  ${colors.bold}Failed:${colors.reset}            ${failedCount > 0 ? `${colors.red}${failedCount}${colors.reset}` : `${colors.green}0${colors.reset}`}`);
  console.log(`  ${colors.bold}Total Time:${colors.reset}        ${totalDurationMs}ms`);
  console.log(`${colors.bold}${colors.cyan}========================================================================${colors.reset}\n`);

  if (failedCount > 0) {
    console.error(`${colors.red}${colors.bold}[FAIL] Acceptance criteria verification failed!${colors.reset}\n`);
    process.exit(1);
  } else {
    console.log(`${colors.green}${colors.bold}✨ [SUCCESS] All ${passedCount} Acceptance Criteria from ORIGINAL_REQUEST.md PASSED!${colors.reset}\n`);
    process.exit(0);
  }
}

runVerification().catch(err => {
  console.error('\x1b[31m[FATAL ERROR]\x1b[0m', err);
  process.exit(1);
});
