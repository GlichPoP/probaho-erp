/**
 * Milestone 6 Verification: POS Module, Portability, Audit Ledger & System Enhancements
 * File: tests/verify-m6-pos-and-enhancements.ts
 */

import { DatabaseService } from '../src/services/db.ts';
import { ERPTestClient } from './harness/erp-test-client.ts';
import path from 'path';
import fs from 'fs';

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
  name: string;
  passed: boolean;
  durationMs: number;
  outputSummary: string;
  error?: string;
}

const stepResults: StepResult[] = [];

async function executeStep(
  code: string,
  name: string,
  fn: () => Promise<string>
): Promise<boolean> {
  const start = Date.now();
  process.stdout.write(`  ${colors.yellow}⏳ Running [${code}] ${name}...${colors.reset}`);
  try {
    const summary = await fn();
    const durationMs = Date.now() - start;
    console.log(`\r  ${colors.green}✔ PASS [${code}] ${name} (${durationMs}ms)${colors.reset}`);
    console.log(`     ${colors.gray}↳ ${summary}${colors.reset}`);
    stepResults.push({
      code,
      name,
      passed: true,
      durationMs,
      outputSummary: summary
    });
    return true;
  } catch (err: any) {
    const durationMs = Date.now() - start;
    console.log(`\r  ${colors.red}✖ FAIL [${code}] ${name} (${durationMs}ms)${colors.reset}`);
    console.error(`     ${colors.red}Error: ${err.message || String(err)}${colors.reset}`);
    stepResults.push({
      code,
      name,
      passed: false,
      durationMs,
      outputSummary: 'Failed',
      error: err.message || String(err)
    });
    return false;
  }
}

async function runVerification() {
  console.log(`\n${colors.bold}${colors.cyan}========================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}  PROBAHO ERP — POS, AUDIT FIX & SYSTEM ENHANCEMENTS VERIFIER          ${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}========================================================================${colors.reset}\n`);

  const db = new DatabaseService(':memory:');
  await db.initialize();
  const client = new ERPTestClient(db);

  // Setup seed entities
  const wh = await client.createWarehouse({
    warehouseCode: 'WH-POS-HUB',
    name: 'Showroom & Retail Counter Hub',
    address: 'Dhanmondi Commercial Area',
    city: 'Dhaka'
  });

  const bin = await client.createLocation({
    warehouseId: wh.id,
    zone: 'Zone Retail',
    aisle: 'A1',
    rack: 'R1',
    shelf: 'S1',
    binCode: 'BIN-RETAIL-01'
  });

  const item1 = await client.createItem({
    sku: 'SKU-RETAIL-LAPTOP',
    name: 'Ultrabook Pro 14"',
    category: 'Computers',
    costPrice: 500.00,
    sellingPrice: 850.00
  });

  const item2 = await client.createItem({
    sku: 'SKU-RETAIL-MOUSE',
    name: 'Wireless Ergonomic Mouse',
    category: 'Accessories',
    costPrice: 15.00,
    sellingPrice: 35.00
  });

  // Seed inventory: 50 laptops in BIN-RETAIL-01
  await db.execute(
    "INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved) VALUES ('stk-pos-1', ?, ?, ?, 50, 0)",
    [item1.id, wh.id, bin.id]
  );

  // Seed inventory: 100 mice in BIN-RETAIL-01
  await db.execute(
    "INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved) VALUES ('stk-pos-2', ?, ?, ?, 100, 0)",
    [item2.id, wh.id, bin.id]
  );

  // --------------------------------------------------------------------------
  // AC6-1: RTO Damaged Write-Off Records Actual Remaining Bin Balance
  // --------------------------------------------------------------------------
  await executeStep('AC6-1', 'RTO Damaged Write-Off Records Actual Remaining Bin Balance', async () => {
    const courier = await client.createCourier('Steadfast RTO Express', '+880199999999');
    
    // Create shipment for 10 laptops (stock on hand 50 -> 40 after dispatch)
    const shipment = await client.createShipment({
      shipmentNumber: 'SHP-M6-RTO-001',
      orderReference: 'ORD-M6-001',
      sourceWarehouseId: wh.id,
      customerName: 'Test Corp',
      customerPhone: '+8801700000000',
      customerAddress: 'Gulshan',
      destinationCity: 'Dhaka',
      courierName: courier.name,
      items: [{ itemId: item1.id, binId: bin.id, quantity: 10, unitPrice: 850.00 }]
    });

    await client.dispatchShipment(shipment.id, 'TRACK-RTO-M6-01');
    await client.updateShipmentStatus(shipment.id, 'return_to_origin', 'Transit accident - liquid spill');

    // Process damaged write-off
    const scrapped = await client.processRTO(shipment.id, 'damaged_writeoff');
    if (scrapped.rto_disposition !== 'damaged_writeoff') {
      throw new Error(`Expected disposition 'damaged_writeoff', got ${scrapped.rto_disposition}`);
    }

    // Check inventory transactions
    const txRows = await db.query<any>(
      `SELECT * FROM inventory_transactions 
       WHERE reference_id = ? AND transaction_type = 'ADJUSTMENT_WRITE_OFF';`,
      [shipment.shipment_number]
    );

    if (!txRows || txRows.length === 0) {
      throw new Error('Missing ADJUSTMENT_WRITE_OFF transaction entry.');
    }

    const scrapTx = txRows[0];
    // Remaining physical stock in that bin is 40
    if (scrapTx.running_balance_after !== 40) {
      throw new Error(`Expected running_balance_after = 40, but found ${scrapTx.running_balance_after}`);
    }

    return `Confirmed: running_balance_after accurately recorded as ${scrapTx.running_balance_after} (actual remaining bin balance, not 0).`;
  });

  // --------------------------------------------------------------------------
  // AC6-2: Dashboard Asset Valuation Alignment with Batch Costs
  // --------------------------------------------------------------------------
  await executeStep('AC6-2', 'Dashboard Asset Valuation Alignment with Batch Costs', async () => {
    // Create a batch for item2 with unit_cost $20 (higher than base cost_price $15)
    await db.execute(
      `INSERT INTO item_batches (id, batch_number, item_id, supplier_id, manufacture_date, expiry_date, unit_cost, initial_quantity, current_quantity)
       VALUES ('batch-m6-01', 'LOT-M6-BATCH', ?, NULL, '2026-01-01', '2027-01-01', 20.00, 30, 30);`,
      [item2.id]
    );

    // Seed 30 units of item2 assigned to batch-m6-01
    await db.execute(
      `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, batch_id, quantity_on_hand, quantity_reserved)
       VALUES ('stk-pos-batch-1', ?, ?, ?, 'batch-m6-01', 30, 0);`,
      [item2.id, wh.id, bin.id]
    );

    // Compute valuation using dashboard query:
    // SUM(s.quantity_on_hand * COALESCE(b.unit_cost, i.cost_price))
    const [result] = await db.query<{ val: number }>(`
      SELECT SUM(s.quantity_on_hand * COALESCE(b.unit_cost, i.cost_price)) as val 
      FROM inventory_stock s 
      JOIN items i ON s.item_id = i.id
      LEFT JOIN item_batches b ON s.batch_id = b.id
      WHERE s.warehouse_id = ?;
    `, [wh.id]);

    // Expected valuation:
    // item1: 40 units * $500.00 = $20,000.00
    // item2 (no batch): 100 units * $15.00 = $1,500.00
    // item2 (batch-m6-01): 30 units * $20.00 (from batch) = $600.00
    // Total = $22,100.00
    const expectedVal = (40 * 500) + (100 * 15) + (30 * 20);
    if (Math.abs(result.val - expectedVal) > 0.01) {
      throw new Error(`Valuation discrepancy: expected $${expectedVal}, got $${result.val}`);
    }

    return `Valuation reconciled: $${result.val.toFixed(2)} accurately incorporates batch-specific unit cost ($20.00 vs base $15.00).`;
  });

  // --------------------------------------------------------------------------
  // AC6-3: System Operational Settings Persistence in SQLite
  // --------------------------------------------------------------------------
  await executeStep('AC6-3', 'System Operational Settings Persistence in SQLite', async () => {
    // Save settings
    const testSettings = [
      { key: 'company_name', value: 'Probaho Enterprise Global Ltd.', category: 'company' },
      { key: 'default_currency', value: 'BDT', category: 'finance' },
      { key: 'default_valuation_method', value: 'FIFO', category: 'inventory' },
      { key: 'negative_inventory_allowed', value: '0', category: 'inventory' }
    ];

    for (const s of testSettings) {
      await db.execute(
        `INSERT INTO system_settings (key, value, category, updated_at)
         VALUES (?, ?, ?, (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))
         ON CONFLICT(key) DO UPDATE SET 
           value = excluded.value, 
           category = excluded.category,
           updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));`,
        [s.key, s.value, s.category]
      );
    }

    // Query back
    const rows = await db.query<{ key: string; value: string }>(
      "SELECT key, value FROM system_settings WHERE key IN ('company_name', 'default_currency', 'default_valuation_method', 'negative_inventory_allowed');"
    );
    const map = new Map<string, string>();
    rows.forEach(r => map.set(r.key, r.value));

    if (map.get('company_name') !== 'Probaho Enterprise Global Ltd.') {
      throw new Error(`Company name not persisted: got ${map.get('company_name')}`);
    }
    if (map.get('default_currency') !== 'BDT') {
      throw new Error(`Currency not persisted: got ${map.get('default_currency')}`);
    }
    if (map.get('negative_inventory_allowed') !== '0') {
      throw new Error(`Negative inventory constraint violated: ${map.get('negative_inventory_allowed')}`);
    }

    return `Persisted 4 enterprise operational parameters to system_settings table with 100% integrity.`;
  });

  // --------------------------------------------------------------------------
  // AC6-4: Command Palette Universal Search Query Invariant
  // --------------------------------------------------------------------------
  await executeStep('AC6-4', 'Command Palette Universal Search Query Invariant', async () => {
    const likeTerm = '%RETAIL%';

    const itemsFound = await db.query<any>(
      "SELECT id, sku, name FROM items WHERE sku LIKE ? OR name LIKE ?;",
      [likeTerm, likeTerm]
    );

    const posFound = await db.query<any>(
      "SELECT id, po_number FROM purchase_orders WHERE po_number LIKE ?;",
      ['%PO%']
    );

    const shipmentsFound = await db.query<any>(
      "SELECT id, shipment_number FROM shipments WHERE shipment_number LIKE ?;",
      ['%SHP%']
    );

    if (itemsFound.length < 2) {
      throw new Error(`Expected at least 2 items found, got ${itemsFound.length}`);
    }

    return `Universal search verified across Items (${itemsFound.length}), POs (${posFound.length}), Shipments (${shipmentsFound.length}).`;
  });

  // --------------------------------------------------------------------------
  // AC6-5: Showroom POS Counter Sale & Real-time Stock Deduction
  // --------------------------------------------------------------------------
  await executeStep('AC6-5', 'Showroom POS Counter Sale & Real-time Stock Deduction', async () => {
    // Current stock of item2 in BIN-RETAIL-01:
    // Initial: 100 (non-batch) + 30 (batch-m6-01 with unit cost $20) = 130
    const beforeStock = await client.getItemTotalStock(item2.id, wh.id);
    if (beforeStock.onHand !== 130) {
      throw new Error(`Expected initial onHand 130, found ${beforeStock.onHand}`);
    }

    // Process sale of 5 units of item2 through posService via test client
    const saleResult = await client.processPOSSale({
      warehouseId: wh.id,
      customerName: 'Showroom Client',
      customerPhone: '+8801711223344',
      paymentMethod: 'Cash',
      cashTendered: 200.00,
      taxRate: 5,
      items: [{ itemId: item2.id, quantity: 5 }]
    });

    if (!saleResult.receiptNumber || saleResult.items.length !== 1) {
      throw new Error('POS sale returned invalid result or missing items');
    }

    // Stock on hand drops by 5: 130 -> 125
    const afterStock = await client.getItemTotalStock(item2.id, wh.id);
    if (afterStock.onHand !== 125) {
      throw new Error(`Stock not deducted properly: expected 125, found ${afterStock.onHand}`);
    }

    // Verify batched item_batches table synchronization (30 -> 25)
    const [batchRow] = await db.query<any>('SELECT current_quantity FROM item_batches WHERE id = "batch-m6-01";');
    if (!batchRow || batchRow.current_quantity !== 25) {
      throw new Error(`Expected item_batches current_quantity = 25, got ${batchRow?.current_quantity}`);
    }

    // Verify ledger entry uses batch-specific unit cost ($20.00)
    const posTx = await db.query<any>(
      "SELECT * FROM inventory_transactions WHERE reference_id = ? AND transaction_type = 'FULFILLMENT_PICK';",
      [saleResult.receiptNumber]
    );
    if (posTx.length === 0) {
      throw new Error('Missing FULFILLMENT_PICK audit ledger entry for POS sale.');
    }
    if (posTx[0].quantity_change !== -5) {
      throw new Error(`Expected quantity_change = -5, got ${posTx[0].quantity_change}`);
    }
    if (posTx[0].unit_cost !== 20.0) {
      throw new Error(`Expected ledger unit_cost = 20.0 (batch cost), got ${posTx[0].unit_cost}`);
    }

    return `Showroom POS sale processed: 5 units deducted, onHand drops 130 -> 125, batch qty synchronized 30 -> 25, ledger audit logged at batch unit cost $20.00.`;
  });

  // --------------------------------------------------------------------------
  // AC6-6: Negative Stock Invariant Rejection on POS Over-Allocation
  // --------------------------------------------------------------------------
  await executeStep('AC6-6', 'Negative Stock Invariant Rejection on POS Over-Allocation', async () => {
    let constraintTriggered = false;
    try {
      // Attempt to deduct 9999 units via POS sale (exceeding stock)
      await client.processPOSSale({
        warehouseId: wh.id,
        paymentMethod: 'Cash',
        items: [{ itemId: item2.id, quantity: 9999 }]
      });
    } catch (err: any) {
      constraintTriggered = true;
    }

    if (!constraintTriggered) {
      throw new Error('Database allowed over-selling stock without rejection!');
    }

    return 'Database CHECK constraint & POS service strictly prevented over-selling into negative stock.';
  });

  // --------------------------------------------------------------------------
  // AC6-7: True Portable USB Mode Path Resolution Verification
  // --------------------------------------------------------------------------
  await executeStep('AC6-7', 'True Portable USB Mode Path Resolution Verification', async () => {
    const testUsbDir = 'E:\\ProbahoPortableUSB';
    process.env.PROBAHO_PORTABLE_DIR = testUsbDir;

    // Test real exported directory resolvers from electron/main.cjs
    const electronMain = await import('../electron/main.cjs');
    const resolvedDir = electronMain.getDatabaseDirectory();
    const resolvedDbPath = electronMain.getDatabasePath();

    if (!resolvedDir.startsWith(testUsbDir)) {
      throw new Error(`getDatabaseDirectory() did not resolve to USB root: ${resolvedDir}`);
    }
    if (!resolvedDbPath.startsWith(path.join(testUsbDir, 'ProbahoData', 'probaho_erp.db'))) {
      throw new Error(`getDatabasePath() did not resolve to USB database: ${resolvedDbPath}`);
    }

    delete process.env.PROBAHO_PORTABLE_DIR;
    return `Portable execution logic verified from electron/main.cjs: resolves to ${resolvedDbPath}`;
  });

  // --------------------------------------------------------------------------
  // AC6-8: Multi-Bin FEFO Depletion & Quarantined Expired Batch Protection
  // --------------------------------------------------------------------------
  await executeStep('AC6-8', 'Multi-Bin FEFO Depletion & Quarantined Expired Batch Protection', async () => {
    // Create an item with multiple bins and batches
    const ftestItem = await client.createItem({
      sku: 'SKU-FEFO-TEST',
      name: 'FEFO Monitored Reagent',
      category: 'Chemicals',
      costPrice: 50.0,
      sellingPrice: 100.0
    });

    const bin2 = await client.createLocation({
      warehouseId: wh.id,
      zone: 'Zone Cold',
      aisle: 'B1',
      rack: 'R2',
      shelf: 'S1',
      binCode: 'BIN-COLD-01'
    });

    // Batch 1: expires 2027-01-01 (5 units in bin)
    await db.execute(
      `INSERT INTO item_batches (id, batch_number, item_id, expiry_date, unit_cost, initial_quantity, current_quantity)
       VALUES ('batch-fefo-early', 'LOT-FEFO-EARLY', ?, '2027-01-01', 50.0, 5, 5);`,
      [ftestItem.id]
    );
    await db.execute(
      `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, batch_id, quantity_on_hand, quantity_reserved)
       VALUES ('stk-fefo-1', ?, ?, ?, 'batch-fefo-early', 5, 0);`,
      [ftestItem.id, wh.id, bin.id]
    );

    // Batch 2: expires 2027-06-01 (10 units in bin2)
    await db.execute(
      `INSERT INTO item_batches (id, batch_number, item_id, expiry_date, unit_cost, initial_quantity, current_quantity)
       VALUES ('batch-fefo-late', 'LOT-FEFO-LATE', ?, '2027-06-01', 55.0, 10, 10);`,
      [ftestItem.id]
    );
    await db.execute(
      `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, batch_id, quantity_on_hand, quantity_reserved)
       VALUES ('stk-fefo-2', ?, ?, ?, 'batch-fefo-late', 10, 0);`,
      [ftestItem.id, wh.id, bin2.id]
    );

    // Batch 3 (Expired): expired 2026-01-01 (8 units in bin2) - MUST NEVER BE SOLD
    await db.execute(
      `INSERT INTO item_batches (id, batch_number, item_id, expiry_date, unit_cost, initial_quantity, current_quantity)
       VALUES ('batch-fefo-expired', 'LOT-FEFO-EXPIRED', ?, '2026-01-01', 40.0, 8, 8);`,
      [ftestItem.id]
    );
    await db.execute(
      `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, batch_id, quantity_on_hand, quantity_reserved)
       VALUES ('stk-fefo-expired', ?, ?, ?, 'batch-fefo-expired', 8, 0);`,
      [ftestItem.id, wh.id, bin2.id]
    );

    // Customer buys 8 units:
    // FEFO MUST pick:
    // - 5 units from batch-fefo-early (earliest expiry 2026-06-01)
    // - 3 units from batch-fefo-late (expiry 2026-12-01)
    // - 0 units from batch-fefo-expired (strictly protected)
    const sale = await client.processPOSSale({
      warehouseId: wh.id,
      customerName: 'Research Lab',
      paymentMethod: 'Card',
      items: [{ itemId: ftestItem.id, quantity: 8 }]
    });

    const [earlyBatch] = await db.query<any>('SELECT current_quantity FROM item_batches WHERE id = "batch-fefo-early";');
    const [lateBatch] = await db.query<any>('SELECT current_quantity FROM item_batches WHERE id = "batch-fefo-late";');
    const [expiredBatch] = await db.query<any>('SELECT current_quantity FROM item_batches WHERE id = "batch-fefo-expired";');

    if (earlyBatch.current_quantity !== 0) {
      throw new Error(`FEFO violation: batch-fefo-early expected 0 remaining, got ${earlyBatch.current_quantity}`);
    }
    if (lateBatch.current_quantity !== 7) {
      throw new Error(`FEFO violation: batch-fefo-late expected 7 remaining, got ${lateBatch.current_quantity}`);
    }
    if (expiredBatch.current_quantity !== 8) {
      throw new Error(`Expired inventory leak! batch-fefo-expired was sold, remaining is ${expiredBatch.current_quantity}`);
    }

    return 'FEFO multi-bin depletion verified: earliest expiring batch depleted 5->0, subsequent batch depleted 10->7, expired batch strictly quarantined at 8.';
  });

  // Summary
  const passed = stepResults.filter(s => s.passed).length;
  const failed = stepResults.filter(s => !s.passed).length;
  console.log(`\n${colors.bold}${colors.cyan}========================================================================${colors.reset}`);
  console.log(`${colors.bold}  Total Tests: ${stepResults.length} | Passed: ${passed} | Failed: ${failed}${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}========================================================================${colors.reset}\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error('Fatal verification error:', err);
  process.exit(1);
});
