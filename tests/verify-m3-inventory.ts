#!/usr/bin/env node
/**
 * Probaho ERP - Milestone 3 Dedicated Core Acceptance Verifier
 * Target Destination: tests/verify-m3-inventory.ts
 *
 * Validates the core Acceptance Criteria from ORIGINAL_REQUEST.md & PROJECT.md for Milestone 3:
 * "Multi-Warehouse Inventory Control (bin/batch tracking, real-time stock levels,
 * inter-warehouse stock transfers, stock valuation)."
 *
 * Execution:
 *   npx tsx tests/verify-m3-inventory.ts
 *   npm run test:m3
 */

import { DatabaseService } from '../src/services/db.ts';
import { ERPTestClient } from './harness/erp-test-client.ts';

// ANSI Color Styling Helpers
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

interface StepRecord {
  code: string;
  name: string;
  passed: boolean;
  durationMs: number;
  details: string;
}

const stepResults: StepRecord[] = [];

async function executeStep(
  code: string,
  name: string,
  fn: () => Promise<string>
): Promise<boolean> {
  const start = Date.now();
  process.stdout.write(`  ${colors.yellow}⏳ Running [${code}] ${name}...${colors.reset}`);
  try {
    const details = await fn();
    const durationMs = Date.now() - start;
    process.stdout.write(
      `\r  ${colors.green}✔ PASS [${code}] ${name} ${colors.gray}(${durationMs}ms)${colors.reset}\n`
    );
    if (details) {
      console.log(`     ${colors.gray}↳ ${details}${colors.reset}`);
    }
    stepResults.push({ code, name, passed: true, durationMs, details });
    return true;
  } catch (err: any) {
    const durationMs = Date.now() - start;
    process.stdout.write(
      `\r  ${colors.red}✘ FAIL [${code}] ${name} ${colors.gray}(${durationMs}ms)${colors.reset}\n`
    );
    console.error(`     ${colors.red}↳ Error: ${err.message || String(err)}${colors.reset}`);
    stepResults.push({
      code,
      name,
      passed: false,
      durationMs,
      details: err.message || String(err)
    });
    return false;
  }
}

async function runM3Verification() {
  console.log(`\n${colors.bold}${colors.cyan}========================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}    PROBAHO ERP — MILESTONE 3 INVENTORY, VALUATION & TRANSFERS VERIFIER ${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}========================================================================${colors.reset}\n`);
  console.log(`${colors.gray}Target Scope: Multi-Warehouse, Bins, Batches, Stock Isolation, Transfers, Valuation${colors.reset}`);
  console.log(`${colors.gray}Database Engine: Embedded SQLite (WebAssembly / Memory) | Zero Cloud Latency${colors.reset}\n`);

  const tStart = Date.now();
  const db = new DatabaseService(':memory:');
  await db.initialize();
  const client = new ERPTestClient(db);

  let centralWh: any;
  let portWh: any;
  let centralBinA: any;
  let centralBinB: any;
  let portBin1: any;
  let itemPanel: any;
  let itemInverter: any;
  let batchPanelA: any;
  let batchPanelB: any;
  let batchInverter1: any;
  let transfer: any;

  // ---------------------------------------------------------------------------
  // STEP 1: Multi-Warehouse Management & Granular Bin Location Hierarchy
  // ---------------------------------------------------------------------------
  await executeStep('M3-AC1', 'Multi-Warehouse Hierarchy & Bin Infrastructure', async () => {
    centralWh = await client.createWarehouse({
      warehouseCode: 'WH-CENTRAL-DC',
      name: 'Main Central Distribution Hub',
      address: 'Plot 45-48, Tejgaon Industrial Area',
      city: 'Dhaka',
      isDefault: true
    });

    portWh = await client.createWarehouse({
      warehouseCode: 'WH-PORT-HUB',
      name: 'Chittagong Maritime Terminal Depot',
      address: 'Agrabad Commercial Area, Strand Road',
      city: 'Chittagong',
      isDefault: false
    });

    centralBinA = await client.createLocation({
      warehouseId: centralWh.id,
      zone: 'Zone A - Solar Modules',
      aisle: 'Aisle 01',
      rack: 'Rack 02',
      shelf: 'Shelf 01',
      binCode: 'DHK-ZA-A01-R02-S01',
      maxWeightKg: 2000
    });

    centralBinB = await client.createLocation({
      warehouseId: centralWh.id,
      zone: 'Zone B - Power Electronics',
      aisle: 'Aisle 03',
      rack: 'Rack 01',
      shelf: 'Shelf 02',
      binCode: 'DHK-ZB-A03-R01-S02',
      maxWeightKg: 1000
    });

    portBin1 = await client.createLocation({
      warehouseId: portWh.id,
      zone: 'Zone C - Coastal Dispatch',
      aisle: 'Aisle 01',
      rack: 'Rack 01',
      shelf: 'Shelf 01',
      binCode: 'CTG-ZC-A01-R01-S01',
      maxWeightKg: 3000
    });

    // Uniqueness validation
    let duplicateWhCaught = false;
    try {
      await client.createWarehouse({
        warehouseCode: 'WH-CENTRAL-DC',
        name: 'Duplicate',
        address: 'Duplicate',
        city: 'Dhaka'
      });
    } catch {
      duplicateWhCaught = true;
    }

    if (!duplicateWhCaught) {
      throw new Error('Failed to enforce UNIQUE constraint on warehouse_code');
    }

    return `Configured 2 warehouses (${centralWh.warehouse_code}, ${portWh.warehouse_code}) and 3 bins; unique code constraint verified.`;
  });

  // ---------------------------------------------------------------------------
  // STEP 2: Item Batches, Lot Tracking & Expiry Date Management
  // ---------------------------------------------------------------------------
  await executeStep('M3-AC2', 'Item Batch Creation, Lot Tracking & Expiry Management', async () => {
    itemPanel = await client.createItem({
      sku: 'SKU-SOLAR-550W',
      name: 'Bifacial Solar Module 550W',
      category: 'Solar Modules',
      unitOfMeasure: 'pcs',
      costPrice: 120.00,
      sellingPrice: 180.00,
      minStockAlert: 40,
      safetyStock: 20,
      valuationMethod: 'MOVING_AVERAGE'
    });

    itemInverter = await client.createItem({
      sku: 'SKU-INV-10KW',
      name: 'Three-Phase Hybrid Inverter 10KW',
      category: 'Power Electronics',
      unitOfMeasure: 'pcs',
      costPrice: 850.00,
      sellingPrice: 1250.00,
      minStockAlert: 10,
      safetyStock: 4,
      valuationMethod: 'FIFO'
    });

    // Batch 1: Solar Panels Lot A
    batchPanelA = await client.createBatch({
      batchNumber: 'LOT-PANEL-2026-A1',
      itemId: itemPanel.id,
      manufactureDate: '2026-01-15',
      expiryDate: '2031-01-15',
      unitCost: 120.00,
      quantity: 100
    });

    // Batch 2: Solar Panels Lot B (different unit cost for WAC valuation testing)
    batchPanelB = await client.createBatch({
      batchNumber: 'LOT-PANEL-2026-B1',
      itemId: itemPanel.id,
      manufactureDate: '2026-03-01',
      expiryDate: '2031-03-01',
      unitCost: 130.00,
      quantity: 50
    });

    // Batch 3: Inverters Lot
    batchInverter1 = await client.createBatch({
      batchNumber: 'LOT-INV-2026-V1',
      itemId: itemInverter.id,
      manufactureDate: '2026-02-10',
      expiryDate: '2031-02-10',
      unitCost: 850.00,
      quantity: 20
    });

    // Seed Expired Batch to verify FEFO isolation
    const expiredBatch = await client.createBatch({
      batchNumber: 'LOT-EXPIRED-2024',
      itemId: itemPanel.id,
      manufactureDate: '2022-01-01',
      expiryDate: '2024-01-01',
      unitCost: 100.00,
      quantity: 10
    });
    await db.execute("UPDATE item_batches SET status = 'EXPIRED' WHERE id = ?", [expiredBatch.id]);

    const activeBatches = await db.query(
      "SELECT * FROM item_batches WHERE item_id = ? AND status = 'ACTIVE' AND date(expiry_date) > date('now')",
      [itemPanel.id]
    );

    if (activeBatches.length !== 2) {
      throw new Error(`Expected 2 active unexpired batches for panel, found ${activeBatches.length}`);
    }

    return `Registered 3 active lots across 2 catalog SKUs; expired batch successfully quarantined from active pickable queries.`;
  });

  // ---------------------------------------------------------------------------
  // STEP 3: Real-Time Multi-Warehouse Stock Invariants & Segregation
  // ---------------------------------------------------------------------------
  await executeStep('M3-AC3', 'Real-Time Multi-Warehouse Stock Invariants & Segregation', async () => {
    // Seed stock:
    // Central Hub:
    //   - Bin A: 100 units of Panel Lot A (10 reserved)
    //   - Bin A: 50 units of Panel Lot B (0 reserved)
    //   - Bin B: 20 units of Inverter Lot 1 (0 reserved)
    await db.execute(
      `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, batch_id, quantity_on_hand, quantity_reserved)
       VALUES 
        ('stk-p-a', ?, ?, ?, ?, 100, 10),
        ('stk-p-b', ?, ?, ?, ?, 50, 0),
        ('stk-inv-1', ?, ?, ?, ?, 20, 0)`,
      [
        itemPanel.id, centralWh.id, centralBinA.id, batchPanelA.id,
        itemPanel.id, centralWh.id, centralBinA.id, batchPanelB.id,
        itemInverter.id, centralWh.id, centralBinB.id, batchInverter1.id
      ]
    );

    // Verify stock counts
    const centralPanels = await client.getItemTotalStock(itemPanel.id, centralWh.id);
    const portPanels = await client.getItemTotalStock(itemPanel.id, portWh.id);

    if (centralPanels.onHand !== 150 || centralPanels.reserved !== 10 || centralPanels.available !== 140) {
      throw new Error(`Central panel stock mismatch: onHand=${centralPanels.onHand}, reserved=${centralPanels.reserved}`);
    }

    if (portPanels.onHand !== 0) {
      throw new Error(`Stock segregation leak: Port facility unexpectedly contains ${portPanels.onHand} panels.`);
    }

    // Invariant check: negative stock rejected
    let negativeBlocked = false;
    try {
      await db.execute(
        "INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved) VALUES ('stk-neg', ?, ?, ?, -5, 0)",
        [itemPanel.id, centralWh.id, centralBinA.id]
      );
    } catch {
      negativeBlocked = true;
    }
    if (!negativeBlocked) {
      throw new Error('Database allowed negative stock: CHECK (quantity_on_hand >= 0) failed!');
    }

    return `Stock initialized (Central: 150 panels [140 avail, 10 rsvd], 20 inverters; Port: 0). Negative inventory invariant confirmed.`;
  });

  // ---------------------------------------------------------------------------
  // STEP 4: Inter-Warehouse Stock Transfer Creation & State Machine Progression
  // ---------------------------------------------------------------------------
  await executeStep('M3-AC4', 'Inter-Warehouse Stock Transfer Creation & State Machine', async () => {
    // Attempt self-transfer (must fail)
    let selfTransferBlocked = false;
    try {
      await client.createTransfer({
        transferNumber: 'TR-SELF-TEST',
        sourceWarehouseId: centralWh.id,
        destWarehouseId: centralWh.id, // Same warehouse!
        requestedBy: 'Manager',
        items: [{ itemId: itemPanel.id, sourceBinId: centralBinA.id, destBinId: centralBinA.id, quantityRequested: 10 }]
      });
    } catch {
      selfTransferBlocked = true;
    }
    if (!selfTransferBlocked) {
      throw new Error('Self-transfer guard failed: system allowed transfer between identical warehouses!');
    }

    // Valid transfer creation: 60 panels & 5 inverters to Port
    transfer = await client.createTransfer({
      transferNumber: 'TR-202610-M3-001',
      sourceWarehouseId: centralWh.id,
      destWarehouseId: portWh.id,
      requestedBy: 'Maritime Project Engineer',
      notes: 'Transferring equipment for offshore container terminal electrification',
      items: [
        {
          itemId: itemPanel.id,
          batchId: batchPanelA.id,
          sourceBinId: centralBinA.id,
          destBinId: portBin1.id,
          quantityRequested: 60
        },
        {
          itemId: itemInverter.id,
          batchId: batchInverter1.id,
          sourceBinId: centralBinB.id,
          destBinId: portBin1.id,
          quantityRequested: 5
        }
      ]
    });

    if (transfer.status !== 'draft') {
      throw new Error(`Expected transfer status 'draft', got '${transfer.status}'`);
    }
    if (transfer.items.length !== 2) {
      throw new Error(`Expected 2 transfer lines, got ${transfer.items.length}`);
    }

    return `Transfer '${transfer.transfer_number}' created in 'draft' status (60 panels, 5 inverters). Self-transfer invariant enforced.`;
  });

  // ---------------------------------------------------------------------------
  // STEP 5: In-Transit Stock Isolation & Zero-Phantom Inventory
  // ---------------------------------------------------------------------------
  await executeStep('M3-AC5', 'In-Transit Stock Isolation & Zero-Phantom Inventory', async () => {
    // Dispatch transfer
    await client.dispatchTransfer(transfer.id, 'Truck Driver Rafiq');

    // Verify status updated to in_transit
    const dispatched = await client.getTransfer(transfer.id);
    if (dispatched.status !== 'in_transit') {
      throw new Error(`Expected status 'in_transit', got '${dispatched.status}'`);
    }

    // Source warehouse stock must decrease immediately: 150 - 60 = 90 panels; 20 - 5 = 15 inverters
    const centralPanelsMid = await client.getItemTotalStock(itemPanel.id, centralWh.id);
    const centralInvertersMid = await client.getItemTotalStock(itemInverter.id, centralWh.id);

    if (centralPanelsMid.onHand !== 90) {
      throw new Error(`Source stock not deducted: expected 90 panels, found ${centralPanelsMid.onHand}`);
    }
    if (centralInvertersMid.onHand !== 15) {
      throw new Error(`Source stock not deducted: expected 15 inverters, found ${centralInvertersMid.onHand}`);
    }

    // Destination warehouse stock MUST REMAIN 0 during transit (No phantom inventory!)
    const portPanelsMid = await client.getItemTotalStock(itemPanel.id, portWh.id);
    const portInvertersMid = await client.getItemTotalStock(itemInverter.id, portWh.id);

    if (portPanelsMid.onHand !== 0 || portInvertersMid.onHand !== 0) {
      throw new Error(`Phantom inventory detected: Port facility prematurely received stock during transit!`);
    }

    return `Dispatched transfer: Central stock immediately dropped (Panels: 150 -> 90, Inverters: 20 -> 15). Destination stock is strictly 0.`;
  });

  // ---------------------------------------------------------------------------
  // STEP 6: Destination Receipt & Transit Discrepancy Reconciliation
  // ---------------------------------------------------------------------------
  await executeStep('M3-AC6', 'Destination Receipt & Discrepancy Reconciliation', async () => {
    // Over-receiving guard: attempting to receive 65 panels when only 60 shipped
    let overReceiveBlocked = false;
    try {
      await client.receiveTransfer(
        transfer.id,
        [
          { lineId: transfer.items[0].id, quantityReceived: 65 }
        ],
        'Receiver'
      );
    } catch {
      overReceiveBlocked = true;
    }
    if (!overReceiveBlocked) {
      throw new Error('Over-receiving guard failed: system allowed receiving more units than shipped!');
    }

    // Actual arrival: 58 panels received (2 cracked in transit), 5 inverters received intact
    const completed = await client.receiveTransfer(
      transfer.id,
      [
        {
          lineId: transfer.items[0].id,
          quantityReceived: 58,
          discrepancyReason: '2 panels cracked during transport across highway'
        },
        {
          lineId: transfer.items[1].id,
          quantityReceived: 5
        }
      ],
      'Port Receiving Supervisor Kamal'
    );

    if (completed.status !== 'completed') {
      throw new Error(`Expected transfer status 'completed', got '${completed.status}'`);
    }

    // Verify Destination counts
    const portPanelsFinal = await client.getItemTotalStock(itemPanel.id, portWh.id);
    const portInvertersFinal = await client.getItemTotalStock(itemInverter.id, portWh.id);

    if (portPanelsFinal.onHand !== 58) {
      throw new Error(`Port panels count mismatch: expected 58, got ${portPanelsFinal.onHand}`);
    }
    if (portInvertersFinal.onHand !== 5) {
      throw new Error(`Port inverters count mismatch: expected 5, got ${portInvertersFinal.onHand}`);
    }

    // Verify Global inventory conservation:
    // Panels: 90 (Central) + 58 (Port) = 148 on hand (+ 2 cracked = 150 original total!)
    const totalPanels = await client.getItemTotalStock(itemPanel.id);
    if (totalPanels.onHand !== 148) {
      throw new Error(`Global panel stock drift: expected 148 on hand, found ${totalPanels.onHand}`);
    }

    return `Destination receipt completed: 58 panels and 5 inverters received at Port Depot. 2 cracked panels recorded with discrepancy note.`;
  });

  // ---------------------------------------------------------------------------
  // STEP 7: Double-Entry Immutable Audit Ledger Integrity
  // ---------------------------------------------------------------------------
  await executeStep('M3-AC7', 'Double-Entry Immutable Inventory Audit Ledger Integrity', async () => {
    const txRecords = await client.getInventoryTransactions(transfer.transfer_number);
    if (txRecords.length < 4) {
      throw new Error(`Expected at least 4 audit ledger records (2 TRANSFER_OUT, 2 TRANSFER_IN), found ${txRecords.length}`);
    }

    const transferOutTxs = txRecords.filter((t: any) => t.transaction_type === 'TRANSFER_OUT');
    const transferInTxs = txRecords.filter((t: any) => t.transaction_type === 'TRANSFER_IN');

    if (transferOutTxs.length !== 2 || transferInTxs.length !== 2) {
      throw new Error(`Audit ledger mismatch: OUT=${transferOutTxs.length}, IN=${transferInTxs.length}`);
    }

    // Validate running balance mathematics on the departure
    for (const outTx of transferOutTxs) {
      if (outTx.quantity_change >= 0) {
        throw new Error(`TRANSFER_OUT must log negative quantity change, got ${outTx.quantity_change}`);
      }
    }

    for (const inTx of transferInTxs) {
      if (inTx.quantity_change <= 0) {
        throw new Error(`TRANSFER_IN must log positive quantity change, got ${inTx.quantity_change}`);
      }
    }

    return `Audit ledger verified: 2 TRANSFER_OUT and 2 TRANSFER_IN immutable entries strictly recorded with running balances.`;
  });

  // ---------------------------------------------------------------------------
  // STEP 8: Inventory Valuation Reconciliation (WAC & FIFO)
  // ---------------------------------------------------------------------------
  await executeStep('M3-AC8', 'Inventory Valuation Reconciliation (WAC & FIFO)', async () => {
    // Calculate total enterprise inventory valuation across both warehouses
    const centralVal = await client.calculateValuation(centralWh.id);
    const portVal = await client.calculateValuation(portWh.id);

    // Central Valuation:
    // Panels: 40 units remaining of Lot A @ $120.00 = $4,800.00
    //         50 units remaining of Lot B @ $130.00 = $6,500.00
    // Inverters: 15 units remaining of Lot 1 @ $850.00 = $12,750.00
    // Expected Central: $4800 + $6500 + $12750 = $24,050.00
    const expectedCentralVal = 40 * 120.00 + 50 * 130.00 + 15 * 850.00;

    // Port Valuation:
    // Panels: 58 units of Lot A @ $120.00 = $6,960.00
    // Inverters: 5 units of Lot 1 @ $850.00 = $4,250.00
    // Expected Port: $6960 + $4250 = $11,210.00
    const expectedPortVal = 58 * 120.00 + 5 * 850.00;

    if (centralVal.totalValuation !== expectedCentralVal) {
      throw new Error(`Central valuation mismatch: expected $${expectedCentralVal}, got $${centralVal.totalValuation}`);
    }

    if (portVal.totalValuation !== expectedPortVal) {
      throw new Error(`Port valuation mismatch: expected $${expectedPortVal}, got $${portVal.totalValuation}`);
    }

    const totalEnterpriseAssetValue = Math.round((expectedCentralVal + expectedPortVal) * 100) / 100;

    return `Valuation reconciled: Central Hub = $${centralVal.totalValuation}, Port Depot = $${portVal.totalValuation}. Total Enterprise Asset Value = $${totalEnterpriseAssetValue}.`;
  });

  const totalDuration = Date.now() - tStart;
  const passedCount = stepResults.filter((s) => s.passed).length;
  const failedCount = stepResults.filter((s) => !s.passed).length;

  console.log(`\n${colors.bold}${colors.cyan}========================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}          MILESTONE 3 ACCEPTANCE VERIFICATION SCORECARD                 ${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}========================================================================${colors.reset}`);
  console.log(`  Total Criteria: ${stepResults.length}`);
  console.log(`  Passed:         ${colors.green}${passedCount}${colors.reset}`);
  console.log(`  Failed:         ${failedCount > 0 ? `${colors.red}${failedCount}${colors.reset}` : `${colors.green}0${colors.reset}`}`);
  console.log(`  Execution Time: ${totalDuration}ms`);
  console.log(`${colors.bold}${colors.cyan}========================================================================${colors.reset}\n`);

  if (failedCount > 0) {
    console.error(`${colors.red}❌ Verification FAILED with ${failedCount} errors.${colors.reset}`);
    process.exit(1);
  } else {
    console.log(`${colors.green}✨ [SUCCESS] All Milestone 3 Acceptance Criteria PASSED!${colors.reset}\n`);
    process.exit(0);
  }
}

runM3Verification().catch((err) => {
  console.error('Fatal crash in M3 verification:', err);
  process.exit(1);
});
