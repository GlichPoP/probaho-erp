#!/usr/bin/env node
/**
 * Probaho ERP - Milestone 2 Dedicated Core Acceptance Verifier
 * Target Destination: tests/verify-m2-procurement.ts
 *
 * Validates the core Acceptance Criteria from ORIGINAL_REQUEST.md:
 * "Creating a supplier and issuing a purchase order; receiving goods against a PO"
 *
 * Execution:
 *   npx tsx tests/verify-m2-procurement.ts
 *   npm test
 */

import { DatabaseService } from '../src/services/db.ts';
import { ERPTestClient } from './harness/erp-test-client.ts';

// ANSI Styling Helpers
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
    process.stdout.write(`\r  ${colors.green}✔ PASS [${code}] ${name} ${colors.gray}(${durationMs}ms)${colors.reset}\n`);
    if (details) {
      console.log(`     ${colors.gray}↳ ${details}${colors.reset}`);
    }
    stepResults.push({ code, name, passed: true, durationMs, details });
    return true;
  } catch (err: any) {
    const durationMs = Date.now() - start;
    process.stdout.write(`\r  ${colors.red}✘ FAIL [${code}] ${name} ${colors.gray}(${durationMs}ms)${colors.reset}\n`);
    console.error(`     ${colors.red}↳ Error: ${err.message || String(err)}${colors.reset}`);
    stepResults.push({ code, name, passed: false, durationMs, details: err.message || String(err) });
    return false;
  }
}

async function runM2Verification() {
  console.log(`\n${colors.bold}${colors.cyan}========================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}    PROBAHO ERP — MILESTONE 2 PROCUREMENT & SUPPLIER ACCEPTANCE TEST    ${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}========================================================================${colors.reset}\n`);
  console.log(`${colors.gray}Target Scope: Supplier Management, PO State Machine, GRN Inspection, Stock Increment${colors.reset}`);
  console.log(`${colors.gray}Database Engine: Embedded SQLite (WebAssembly / Memory) | Zero Cloud Latency${colors.reset}\n`);

  const tStart = Date.now();
  const db = new DatabaseService(':memory:');
  await db.initialize();
  const client = new ERPTestClient(db);

  let supplier: any;
  let warehouse: any;
  let binA: any;
  let itemBearing: any;
  let itemInverter: any;
  let po: any;
  let grn1: any;
  let grn2: any;

  // ---------------------------------------------------------------------------
  // STEP 1: Supplier Directory Registration & Performance Metrics
  // ---------------------------------------------------------------------------
  await executeStep('M2-AC1', 'Supplier Directory Registration & Performance Tracking', async () => {
    supplier = await client.createSupplier({
      supplierCode: 'SUP-BENGAL-M2',
      name: 'Bengal Precision Industrial Works Ltd',
      contactPerson: 'Zakir Hossain',
      phone: '+8801722998877',
      email: 'sales@bengalprecision.com',
      address: 'Plot 104, BSCIC Industrial Area',
      city: 'Gazipur',
      country: 'Bangladesh',
      taxId: 'BIN-992384112',
      paymentTermsDays: 45,
      leadTimeDays: 7,
      rating: 4.9
    });

    if (!supplier || supplier.supplier_code !== 'SUP-BENGAL-M2') {
      throw new Error('Supplier creation failed or returned invalid record');
    }

    await client.updateSupplierRating(supplier.id, 5.0, 6);
    const refreshed = await client.getSupplier(supplier.id);
    if (refreshed.rating !== 5.0 || refreshed.lead_time_days !== 6) {
      throw new Error('Failed to update supplier rating or lead time');
    }

    return `Supplier '${supplier.name}' registered (Code: ${supplier.supplier_code}, Rating: ${refreshed.rating}/5.0, LeadTime: ${refreshed.lead_time_days} days).`;
  });

  // ---------------------------------------------------------------------------
  // STEP 2: Catalog Products & Warehouse Infrastructure Setup
  // ---------------------------------------------------------------------------
  await executeStep('M2-AC2', 'Product Catalog Items & Warehouse Bin Infrastructure', async () => {
    warehouse = await client.createWarehouse({
      warehouseCode: 'WH-DHAKA-CENTRAL',
      name: 'Dhaka Central Distribution Hub',
      address: 'Plot 12, Hemayetpur',
      city: 'Dhaka',
      isDefault: true
    });

    binA = await client.createLocation({
      warehouseId: warehouse.id,
      zone: 'Zone M',
      aisle: 'Aisle 01',
      rack: 'Rack 02',
      shelf: 'Shelf 03',
      binCode: 'WH-DH-M-A1-R2-S3'
    });

    itemBearing = await client.createItem({
      sku: 'SKU-BEARING-6205',
      name: 'Deep Groove Ball Bearing 6205-2RS',
      category: 'Mechanical',
      unitOfMeasure: 'pcs',
      costPrice: 18.50,
      sellingPrice: 32.00,
      minStockAlert: 20
    });

    itemInverter = await client.createItem({
      sku: 'SKU-VFD-INVERTER-3KW',
      name: 'Variable Frequency Drive Inverter 3.7kW',
      category: 'Electrical',
      unitOfMeasure: 'pcs',
      costPrice: 220.00,
      sellingPrice: 340.00,
      minStockAlert: 5
    });

    return `Warehouse '${warehouse.name}' with bin '${binA.bin_code}' and 2 items (${itemBearing.sku}, ${itemInverter.sku}) prepared.`;
  });

  // ---------------------------------------------------------------------------
  // STEP 3: Purchase Order Issuance with Financial Calculations
  // ---------------------------------------------------------------------------
  await executeStep('M2-AC3', 'Purchase Order Issuance with Multi-Line Items & Financial Totals', async () => {
    po = await client.createPurchaseOrder({
      poNumber: 'PO-202610-M2-001',
      supplierId: supplier.id,
      targetWarehouseId: warehouse.id,
      paymentTerms: 'Net 45',
      notes: 'Priority manufacturing procurement order',
      items: [
        { itemId: itemBearing.id, sku: itemBearing.sku, quantityOrdered: 100, unitCost: 18.50 },
        { itemId: itemInverter.id, sku: itemInverter.sku, quantityOrdered: 20, unitCost: 220.00 }
      ]
    });

    if (po.status !== 'draft') {
      throw new Error(`Expected PO status 'draft', got '${po.status}'`);
    }
    if (po.items.length !== 2) {
      throw new Error(`Expected 2 line items, got ${po.items.length}`);
    }

    const expectedSubtotal = 100 * 18.50 + 20 * 220.00;
    if (po.subtotal !== expectedSubtotal || po.total_amount !== expectedSubtotal) {
      throw new Error(`Subtotal mismatch: expected ${expectedSubtotal}, got ${po.subtotal}`);
    }

    return `PO '${po.po_number}' created in 'draft' status (Subtotal: $${po.subtotal}, Items: ${po.items.length}).`;
  });

  // ---------------------------------------------------------------------------
  // STEP 4: Purchase Order State Transition Workflow & Invariant Enforcement
  // ---------------------------------------------------------------------------
  await executeStep('M2-AC4', 'Purchase Order State Machine (draft -> pending_approval -> approved -> ordered)', async () => {
    const s1 = await client.updatePurchaseOrderStatus(po.id, 'pending_approval');
    if (s1.status !== 'pending_approval') throw new Error('Failed to move to pending_approval');

    const s2 = await client.updatePurchaseOrderStatus(po.id, 'approved');
    if (s2.status !== 'approved') throw new Error('Failed to move to approved');

    const s3 = await client.updatePurchaseOrderStatus(po.id, 'ordered');
    if (s3.status !== 'ordered') throw new Error('Failed to move to ordered');

    let rejectedAsExpected = false;
    try {
      await client.updatePurchaseOrderStatus(po.id, 'draft');
    } catch {
      rejectedAsExpected = true;
    }
    if (!rejectedAsExpected) {
      throw new Error('Security flaw: system allowed illegal state transition from ordered back to draft!');
    }

    return `PO successfully transitioned through approval gates to 'ordered'; illegal transition to 'draft' safely blocked.`;
  });

  // ---------------------------------------------------------------------------
  // STEP 5: Partial Goods Receipt Note (GRN) & PO Auto-Progression
  // ---------------------------------------------------------------------------
  await executeStep('M2-AC5', 'Partial Goods Receipt & Automatic Status Advance to partially_received', async () => {
    grn1 = await client.receiveGoods({
      receiptNumber: 'GRN-202610-M2-P1',
      poId: po.id,
      warehouseId: warehouse.id,
      receivedBy: 'Inspector Jabbar',
      inspectionNotes: 'First consignment 50% delivered; quality inspection verified.',
      items: [
        {
          poItemId: po.items[0].id,
          itemId: itemBearing.id,
          batchNumber: 'LOT-BRG-2026-01',
          expiryDate: '2028-12-31',
          binId: binA.id,
          quantityReceived: 50,
          quantityAccepted: 50
        },
        {
          poItemId: po.items[1].id,
          itemId: itemInverter.id,
          batchNumber: 'LOT-VFD-2026-01',
          expiryDate: '2029-06-30',
          binId: binA.id,
          quantityReceived: 10,
          quantityAccepted: 10
        }
      ]
    });

    if (grn1.poStatus !== 'partially_received') {
      throw new Error(`Expected PO status 'partially_received', got '${grn1.poStatus}'`);
    }

    const bearingStock = await client.getStockLevel(itemBearing.id, warehouse.id, binA.id);
    const inverterStock = await client.getStockLevel(itemInverter.id, warehouse.id, binA.id);

    if (bearingStock.quantity_on_hand !== 50 || inverterStock.quantity_on_hand !== 10) {
      throw new Error(`Inventory mismatch: expected (50, 10), got (${bearingStock?.quantity_on_hand}, ${inverterStock?.quantity_on_hand})`);
    }

    return `GRN '${grn1.receiptNumber}' processed: 50 bearings and 10 inverters received. PO status auto-advanced to 'partially_received'.`;
  });

  // ---------------------------------------------------------------------------
  // STEP 6: Quality Inspection with Damaged Items & Full PO Fulfillment
  // ---------------------------------------------------------------------------
  await executeStep('M2-AC6', 'Quality Inspection (Damaged Logging) & Final PO Completion to received', async () => {
    grn2 = await client.receiveGoods({
      receiptNumber: 'GRN-202610-M2-P2',
      poId: po.id,
      warehouseId: warehouse.id,
      receivedBy: 'Inspector Jabbar',
      inspectionNotes: 'Final consignment: 2 bearings rejected due to surface rust on outer ring.',
      items: [
        {
          poItemId: po.items[0].id,
          itemId: itemBearing.id,
          batchNumber: 'LOT-BRG-2026-02',
          binId: binA.id,
          quantityReceived: 50,
          quantityAccepted: 48,
          quantityRejected: 2,
          rejectionReason: 'Surface Rust'
        },
        {
          poItemId: po.items[1].id,
          itemId: itemInverter.id,
          batchNumber: 'LOT-VFD-2026-02',
          binId: binA.id,
          quantityReceived: 10,
          quantityAccepted: 10
        }
      ]
    });

    const refreshedPo = await client.getPurchaseOrder(po.id);
    const bearingLine = refreshedPo.items.find((i: any) => i.item_id === itemBearing.id);
    const inverterLine = refreshedPo.items.find((i: any) => i.item_id === itemInverter.id);

    if (bearingLine.quantity_received !== 98 || bearingLine.quantity_rejected !== 2) {
      throw new Error(`Bearing line counts incorrect: received=${bearingLine.quantity_received}, rejected=${bearingLine.quantity_rejected}`);
    }
    if (inverterLine.quantity_received !== 20) {
      throw new Error(`Inverter line counts incorrect: received=${inverterLine.quantity_received}`);
    }

    const finalBearingStock = await client.getItemTotalStock(itemBearing.id, warehouse.id);
    const finalInverterStock = await client.getItemTotalStock(itemInverter.id, warehouse.id);

    if (finalBearingStock.onHand !== 98) {
      throw new Error(`Damaged goods leak: expected 98 bearings in stock, found ${finalBearingStock.onHand}`);
    }
    if (finalInverterStock.onHand !== 20) {
      throw new Error(`Expected 20 inverters in stock, found ${finalInverterStock.onHand}`);
    }

    return `Final GRN processed: 2 damaged bearings logged with 'Surface Rust' rejection and quarantined. Stock verified (98 bearings, 20 inverters).`;
  });

  // ---------------------------------------------------------------------------
  // STEP 7: Over-Delivery & Cancellation Guard Invariant Checks
  // ---------------------------------------------------------------------------
  await executeStep('M2-AC7', 'Over-Delivery Protection & Cancellation Guard Enforcement', async () => {
    let overDeliveryBlocked = false;
    try {
      await client.receiveGoods({
        receiptNumber: 'GRN-ILLEGAL-OVER',
        poId: po.id,
        warehouseId: warehouse.id,
        receivedBy: 'Inspector',
        items: [
          {
            poItemId: po.items[0].id,
            itemId: itemBearing.id,
            binId: binA.id,
            quantityReceived: 5,
            quantityAccepted: 5
          }
        ]
      });
    } catch {
      overDeliveryBlocked = true;
    }
    if (!overDeliveryBlocked) {
      throw new Error('Over-delivery guard failed: system allowed receiving beyond ordered PO quantity!');
    }

    let cancelBlocked = false;
    try {
      await client.updatePurchaseOrderStatus(po.id, 'cancelled');
    } catch {
      cancelBlocked = true;
    }
    if (!cancelBlocked) {
      throw new Error('Cancellation guard failed: system allowed cancelling PO with registered goods receipts!');
    }

    return `Both over-delivery beyond ordered balance and cancellation of fulfilled PO were strictly rejected.`;
  });

  // ---------------------------------------------------------------------------
  // STEP 8: Immutable Audit Trail & Valuation Verification
  // ---------------------------------------------------------------------------
  await executeStep('M2-AC8', 'Double-Entry Audit Ledger & Inventory Valuation Reconciliation', async () => {
    const txRows = await db.query(
      "SELECT * FROM inventory_transactions WHERE reference_id = ? AND transaction_type = 'PO_RECEIPT'",
      [po.id]
    );
    if (txRows.length < 2) {
      throw new Error(`Expected at least 2 audit ledger entries for PO receipts, found ${txRows.length}`);
    }

    const valuation = await client.calculateValuation(warehouse.id);
    const expectedValue = 98 * 18.50 + 20 * 220.00;
    if (valuation.totalValuation !== expectedValue) {
      throw new Error(`Inventory valuation mismatch: expected $${expectedValue}, calculated $${valuation.totalValuation}`);
    }

    return `Audit trail verified (${txRows.length} transactions logged); inventory valuation reconciled to exact $${valuation.totalValuation}.`;
  });

  const totalDuration = Date.now() - tStart;
  const passedCount = stepResults.filter((s) => s.passed).length;
  const failedCount = stepResults.filter((s) => !s.passed).length;

  console.log(`\n${colors.bold}${colors.cyan}========================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}          MILESTONE 2 ACCEPTANCE VERIFICATION SCORECARD                 ${colors.reset}`);
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
    console.log(`${colors.green}✨ [SUCCESS] All Milestone 2 Acceptance Criteria PASSED!${colors.reset}\n`);
    process.exit(0);
  }
}

runM2Verification().catch((err) => {
  console.error('Fatal crash in M2 verification:', err);
  process.exit(1);
});
