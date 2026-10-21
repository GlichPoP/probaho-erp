/**
 * ============================================================================
 * PROBAHO ERP: TIER 5 ADVERSARIAL DOMAIN HARDENING SUITE
 * File: tests/challenger/m6-tier5-domain-adversarial.ts
 *
 * Challenger Agent: challenger_m6_1
 * Milestone: M6 - Final E2E Verification & Tier 5 Adversarial Coverage Hardening
 *
 * Purpose:
 * White-box empirical challenge against all core ERP domain services:
 * - src/services/db.ts
 * - src/services/supplierService.ts
 * - src/services/procurementService.ts
 * - src/services/inventoryService.ts
 * - src/services/transferService.ts
 * - src/services/fulfillmentService.ts
 * - src/services/backupService.ts
 *
 * Test Categories:
 * 1. Numerical Boundaries & Valuations (0 cost price, extreme scales, WAC multi-tier precision, non-negative invariants)
 * 2. State Machine Invariants & Terminal Gate Locking (Illegal status jumps, retroactive GRNs, double approvals, terminal state locking)
 * 3. Multi-Entity Relational Integrity & Concurrency Stress (Mass conservation, parallel shipment reservations, double-dispatch guard, double-RTO guard, double-receive guard)
 * 4. Unicode, Multi-Language & Relational Collision Resistance (UTF-8 multi-byte Bengali scripts, uniqueness constraints, FK restrict rules)
 * 5. Batch Expiry Quarantine, Stock Floor & Disaster Recovery (FEFO picking exclusion, reserved stock floor protection, checksum tamper rollback, corrupted SQLite binary rejection)
 * ============================================================================
 */

import { DatabaseService } from '../../src/services/db.ts';
import { SupplierService } from '../../src/services/supplierService.ts';
import { ProcurementService } from '../../src/services/procurementService.ts';
import { InventoryService } from '../../src/services/inventoryService.ts';
import { TransferService } from '../../src/services/transferService.ts';
import { FulfillmentService } from '../../src/services/fulfillmentService.ts';
import { BackupService } from '../../src/services/backupService.ts';
import { ERPTestClient } from '../harness/erp-test-client.ts';

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
  blue: '\x1b[34m'
};

interface ProbeResult {
  id: string;
  category: string;
  name: string;
  passed: boolean;
  durationMs: number;
  details: string;
}

const probeResults: ProbeResult[] = [];

async function runProbe(
  id: string,
  category: string,
  name: string,
  fn: () => Promise<string>
): Promise<boolean> {
  const start = Date.now();
  process.stdout.write(`  ⏳ Running [${id}] ${name}...`);
  try {
    const details = await fn();
    const durationMs = Date.now() - start;
    console.log(`\r  ${colors.green}✔ PASS [${id}] ${name} (${durationMs}ms)${colors.reset}`);
    console.log(`     ${colors.gray}↳ ${details}${colors.reset}`);
    probeResults.push({ id, category, name, passed: true, durationMs, details });
    return true;
  } catch (err: any) {
    const durationMs = Date.now() - start;
    console.log(`\r  ${colors.red}✘ FAIL [${id}] ${name} (${durationMs}ms)${colors.reset}`);
    console.log(`     ${colors.red}↳ Error: ${err.message || String(err)}${colors.reset}`);
    if (err.stack) {
      console.log(`     ${colors.gray}${err.stack.split('\n').slice(1, 4).join('\n     ')}${colors.reset}`);
    }
    probeResults.push({ id, category, name, passed: false, durationMs, details: err.message || String(err) });
    return false;
  }
}

async function createFreshIsolatedEnvironment() {
  const db = new DatabaseService(':memory:');
  await db.initialize();
  const supplierSvc = new SupplierService();
  const procurementSvc = new ProcurementService();
  const inventorySvc = new InventoryService();
  const transferSvc = new TransferService();
  const fulfillmentSvc = new FulfillmentService();
  const backupSvc = new BackupService();
  const client = new ERPTestClient(db);

  return {
    db,
    supplierSvc,
    procurementSvc,
    inventorySvc,
    transferSvc,
    fulfillmentSvc,
    backupSvc,
    client
  };
}

async function runAllTier5Probes() {
  console.log(`\n${colors.bold}${colors.cyan}========================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}    PROBAHO ERP — TIER 5 ADVERSARIAL DOMAIN HARDENING TEST SUITE        ${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}========================================================================${colors.reset}`);
  console.log(`${colors.gray}Target: White-Box Code Path Gap Analysis across 7 Core Services${colors.reset}`);
  console.log(`${colors.gray}Database: In-Memory Embedded SQLite (sql.js WASM) with Zero Network Latency${colors.reset}\n`);

  // ==========================================================================
  // SUITE 1: NUMERICAL BOUNDARIES & VALUATIONS
  // ==========================================================================
  console.log(`${colors.bold}${colors.yellow}▶ Suite 1: Numerical Boundaries, Extreme Valuations & WAC Precision${colors.reset}`);

  await runProbe(
    'T5-P1.1',
    'Numerical Boundaries',
    'Zero Cost Price Catalog Item, Purchase Order & GRN Receipt Flow',
    async () => {
      const { db, procurementSvc, inventorySvc, client } = await createFreshIsolatedEnvironment();

      const wh = await client.createWarehouse({
        warehouseCode: 'WH-ZERO-01',
        name: 'Zero Cost Test Warehouse',
        address: 'Dhaka',
        city: 'Dhaka'
      });

      const sup = await client.createSupplier({
        supplierCode: 'SUP-ZERO-01',
        name: 'Promotional Free Goods Vendor',
        contactPerson: 'Promotions Manager',
        phone: '+8801700000001',
        address: 'Dhaka'
      });

      const item = await procurementSvc.createItem(
        {
          sku: 'SKU-PROMO-FREE-01',
          name: 'Free Promotional Sample Catalog Item',
          category: 'Promotions',
          costPrice: 0.0,
          sellingPrice: 0.0,
          valuationMethod: 'MOVING_AVERAGE'
        },
        db
      );

      // Create PO with 0.00 unit cost
      const po = await procurementSvc.createPurchaseOrder(
        {
          poNumber: 'PO-ZERO-COST-001',
          supplierId: sup.id,
          targetWarehouseId: wh.id,
          items: [{ itemId: item.id, quantityOrdered: 200, unitCost: 0.0 }]
        },
        db
      );

      if (po.total_amount !== 0.0) {
        throw new Error(`Expected PO total_amount 0.0, got ${po.total_amount}`);
      }

      await procurementSvc.updatePOStatus(po.id, 'pending_approval', 'test', db);
      await procurementSvc.updatePOStatus(po.id, 'approved', 'manager', db);
      await procurementSvc.updatePOStatus(po.id, 'ordered', 'buyer', db);

      // Receive GRN at $0.00 unit cost
      const grnRes = await procurementSvc.receiveGoodsAgainstPO(
        {
          poId: po.id,
          warehouseId: wh.id,
          receivedBy: 'QC Inspector',
          items: [{ poItemId: po.items[0].id, quantityAccepted: 200, unitCost: 0.0 }]
        },
        db
      );

      // Verify stock level and valuation
      const valReport = await inventorySvc.calculateValuation(wh.id, db);
      const itemVal = await inventorySvc.getItemValuation(item.id, wh.id, db);

      if (!itemVal) throw new Error('Item valuation record not found');
      if (itemVal.quantity !== 200) throw new Error(`Expected quantity 200, got ${itemVal.quantity}`);
      if (itemVal.item_total_value !== 0.0) throw new Error(`Expected item_total_value 0.0, got ${itemVal.item_total_value}`);
      if (itemVal.weighted_average_cost !== 0.0) throw new Error(`Expected WAC 0.0, got ${itemVal.weighted_average_cost}`);
      if (Number.isNaN(itemVal.weighted_average_cost) || !Number.isFinite(itemVal.weighted_average_cost)) {
        throw new Error('WAC calculation produced NaN or Infinity on zero cost price!');
      }

      return `Zero cost price handled cleanly: 200 promo units received, valuation=$0.00, WAC=$0.00 (no NaN/div-by-zero).`;
    }
  );

  await runProbe(
    'T5-P1.2',
    'Numerical Boundaries',
    'Extreme Financial Valuation Scale ($3.75B) & IEEE 754 Precision',
    async () => {
      const { db, procurementSvc, inventorySvc, client } = await createFreshIsolatedEnvironment();

      const wh = await client.createWarehouse({
        warehouseCode: 'WH-BILLION-01',
        name: 'High-Value Asset Warehouse',
        address: 'Chittagong High Tech',
        city: 'Chittagong'
      });

      const sup = await client.createSupplier({
        supplierCode: 'SUP-AERO-01',
        name: 'Aerospace Components International',
        contactPerson: 'Lead Engineer',
        phone: '+8801700000002',
        address: 'Chittagong'
      });

      const unitCost = 1500000.75; // $1.5M per unit
      const qty = 2500;
      const expectedTotal = 3750001875.00; // $3.75 Billion

      const item = await procurementSvc.createItem(
        {
          sku: 'SKU-TURBINE-XL',
          name: 'Heavy Industrial Gas Turbine Assembly',
          category: 'Heavy Machinery',
          costPrice: unitCost,
          sellingPrice: unitCost * 1.3,
          valuationMethod: 'MOVING_AVERAGE'
        },
        db
      );

      const po = await procurementSvc.createPurchaseOrder(
        {
          poNumber: 'PO-AERO-2026-001',
          supplierId: sup.id,
          targetWarehouseId: wh.id,
          items: [{ itemId: item.id, quantityOrdered: qty, unitCost }]
        },
        db
      );

      if (Math.abs(po.total_amount - expectedTotal) > 0.01) {
        throw new Error(`PO total expected ${expectedTotal}, got ${po.total_amount}`);
      }

      await procurementSvc.updatePOStatus(po.id, 'pending_approval', 'test', db);
      await procurementSvc.updatePOStatus(po.id, 'approved', 'cfo', db);
      await procurementSvc.updatePOStatus(po.id, 'ordered', 'director', db);

      await procurementSvc.receiveGoodsAgainstPO(
        {
          poId: po.id,
          warehouseId: wh.id,
          receivedBy: 'Chief Inspector',
          items: [{ poItemId: po.items[0].id, quantityAccepted: qty, unitCost }]
        },
        db
      );

      const valReport = await inventorySvc.calculateValuation(wh.id, db);
      const itemVal = await inventorySvc.getItemValuation(item.id, wh.id, db);

      if (Math.abs(valReport.totalValuation - expectedTotal) > 0.01) {
        throw new Error(`Total valuation expected ${expectedTotal}, got ${valReport.totalValuation}`);
      }
      if (Math.abs(itemVal!.weighted_average_cost - unitCost) > 0.01) {
        throw new Error(`WAC expected ${unitCost}, got ${itemVal!.weighted_average_cost}`);
      }

      return `Extreme valuation verified: 2,500 units @ $1,500,000.75 yielded exact $3,750,001,875.00 valuation without precision drift.`;
    }
  );

  await runProbe(
    'T5-P1.3',
    'Numerical Boundaries',
    'Multi-Tier Weighted Moving Average Cost (WAC) Exact Fractional Rounding',
    async () => {
      const { db, procurementSvc, inventorySvc, client } = await createFreshIsolatedEnvironment();

      const wh = await client.createWarehouse({
        warehouseCode: 'WH-WAC-PREC',
        name: 'Precision Testing Hub',
        address: 'Dhaka',
        city: 'Dhaka'
      });

      const sup = await client.createSupplier({
        supplierCode: 'SUP-WAC-01',
        name: 'Precision Chemical Inflows',
        contactPerson: 'Chemist',
        phone: '+8801700000003',
        address: 'Dhaka'
      });

      const item = await procurementSvc.createItem(
        {
          sku: 'SKU-CHEM-SOLVENT',
          name: 'Industrial Reagent Solvent Grade A',
          category: 'Chemicals',
          costPrice: 10.0,
          sellingPrice: 40.0,
          valuationMethod: 'MOVING_AVERAGE'
        },
        db
      );

      // Inflow 1: 7 units @ $11.13 = $77.91
      // Inflow 2: 13 units @ $19.47 = $253.11
      // Inflow 3: 29 units @ $31.85 = $923.65
      // Total: 49 units, total cost = $1,254.67
      // Expected WAC = 1254.67 / 49 = 25.60551... -> 25.61

      const createAndReceivePO = async (poNum: string, qty: number, unitCost: number, batchNum: string) => {
        const po = await procurementSvc.createPurchaseOrder(
          {
            poNumber: poNum,
            supplierId: sup.id,
            targetWarehouseId: wh.id,
            items: [{ itemId: item.id, quantityOrdered: qty, unitCost }]
          },
          db
        );
        await procurementSvc.updatePOStatus(po.id, 'pending_approval', 'test', db);
        await procurementSvc.updatePOStatus(po.id, 'approved', 'manager', db);
        await procurementSvc.updatePOStatus(po.id, 'ordered', 'buyer', db);
        await procurementSvc.receiveGoodsAgainstPO(
          {
            poId: po.id,
            warehouseId: wh.id,
            receivedBy: 'QC',
            items: [{
              poItemId: po.items[0].id,
              quantityAccepted: qty,
              unitCost,
              batchNumber: batchNum
            }]
          },
          db
        );
      };

      await createAndReceivePO('PO-WAC-1', 7, 11.13, 'LOT-WAC-1');
      await createAndReceivePO('PO-WAC-2', 13, 19.47, 'LOT-WAC-2');
      await createAndReceivePO('PO-WAC-3', 29, 31.85, 'LOT-WAC-3');

      const itemVal = await inventorySvc.getItemValuation(item.id, wh.id, db);
      if (!itemVal) throw new Error('Valuation record not found');

      if (itemVal.quantity !== 49) {
        throw new Error(`Expected quantity 49, got ${itemVal.quantity}`);
      }
      if (Math.abs(itemVal.item_total_value - 1254.67) > 0.05) {
        throw new Error(`Expected item_total_value ~1254.67, got ${itemVal.item_total_value}`);
      }
      if (Math.abs(itemVal.weighted_average_cost - 25.61) > 0.02) {
        throw new Error(`Expected WAC ~25.61, got ${itemVal.weighted_average_cost}`);
      }

      return `Multi-tier WAC validated: 49 units across 3 receipts ($11.13, $19.47, $31.85) yielded WAC=$25.61, total=$1,254.67.`;
    }
  );

  await runProbe(
    'T5-P1.4',
    'Numerical Boundaries',
    'Strict Negative Cost, Price and Rating Boundary Invariant Rejections',
    async () => {
      const { db, procurementSvc, supplierSvc } = await createFreshIsolatedEnvironment();

      let negativeCostItemRejected = false;
      try {
        await procurementSvc.createItem(
          {
            sku: 'SKU-NEG-COST',
            name: 'Negative Cost Product',
            category: 'Hardware',
            costPrice: -0.01,
            sellingPrice: 10.0
          },
          db
        );
      } catch (err: any) {
        negativeCostItemRejected = err.message.includes('Cost price cannot be negative');
      }

      let negativeSellingPriceRejected = false;
      try {
        await procurementSvc.createItem(
          {
            sku: 'SKU-NEG-SELL',
            name: 'Negative Sell Product',
            category: 'Hardware',
            costPrice: 10.0,
            sellingPrice: -5.0
          },
          db
        );
      } catch (err: any) {
        negativeSellingPriceRejected = err.message.includes('Selling price cannot be negative');
      }

      let invalidRatingRejected = false;
      try {
        await supplierSvc.createSupplier(
          {
            supplierCode: 'SUP-BAD-RATE',
            name: 'Invalid Rating Supplier',
            phone: '+8801700000000',
            address: 'Dhaka',
            rating: 5.5
          },
          db
        );
      } catch (err: any) {
        invalidRatingRejected = err.message.includes('between 0.0 and 5.0');
      }

      let negativeTermsRejected = false;
      try {
        await supplierSvc.createSupplier(
          {
            supplierCode: 'SUP-BAD-TERMS',
            name: 'Negative Terms Supplier',
            phone: '+8801700000000',
            address: 'Dhaka',
            paymentTermsDays: -10
          },
          db
        );
      } catch (err: any) {
        negativeTermsRejected = err.message.includes('cannot be negative');
      }

      if (!negativeCostItemRejected || !negativeSellingPriceRejected || !invalidRatingRejected || !negativeTermsRejected) {
        throw new Error(
          `Validation gap: costPriceRej=${negativeCostItemRejected}, sellPriceRej=${negativeSellingPriceRejected}, ratingRej=${invalidRatingRejected}, termsRej=${negativeTermsRejected}`
        );
      }

      return 'All negative/out-of-range numerical invariants strictly rejected (costPrice, sellingPrice, rating, paymentTerms).';
    }
  );

  // ==========================================================================
  // SUITE 2: STATE MACHINE INVARIANTS & TERMINAL GATE LOCKING
  // ==========================================================================
  console.log(`\n${colors.bold}${colors.yellow}▶ Suite 2: State Machine Invariants, Terminal Gate Locking & Illegal Transitions${colors.reset}`);

  await runProbe(
    'T5-P2.1',
    'State Machine Invariants',
    'Purchase Order Workflow Transition Matrix & Double Approval Prevention',
    async () => {
      const { db, procurementSvc, client } = await createFreshIsolatedEnvironment();

      const wh = await client.createWarehouse({
        warehouseCode: 'WH-PO-STATE',
        name: 'State Machine Warehouse',
        address: 'Dhaka',
        city: 'Dhaka'
      });

      const sup = await client.createSupplier({
        supplierCode: 'SUP-PO-STATE',
        name: 'State Vendor',
        contactPerson: 'Manager',
        phone: '+8801700000010',
        address: 'Dhaka'
      });

      const item = await client.createItem({
        sku: 'SKU-PO-STATE-01',
        name: 'State Machine Test Item',
        category: 'Test',
        costPrice: 50.0,
        sellingPrice: 90.0
      });

      const po = await procurementSvc.createPurchaseOrder(
        {
          poNumber: 'PO-SM-001',
          supplierId: sup.id,
          targetWarehouseId: wh.id,
          items: [{ itemId: item.id, quantityOrdered: 50, unitCost: 50.0 }]
        },
        db
      );

      // 1. Illegal jump: draft -> received directly
      let draftToReceivedRejected = false;
      try {
        await procurementSvc.updatePOStatus(po.id, 'received', 'hacker', db);
      } catch (err: any) {
        draftToReceivedRejected = err.message.includes('Invalid state transition');
      }

      // 2. Illegal jump: draft -> ordered directly (bypassing approval)
      let draftToOrderedRejected = false;
      try {
        await procurementSvc.updatePOStatus(po.id, 'ordered', 'hacker', db);
      } catch (err: any) {
        draftToOrderedRejected = err.message.includes('Invalid state transition');
      }

      // 3. Move to pending_approval -> approved
      await procurementSvc.updatePOStatus(po.id, 'pending_approval', 'author', db);
      await procurementSvc.updatePOStatus(po.id, 'approved', 'approver1', db);

      // 4. Double approval attempt: approved -> approved
      let doubleApprovalRejected = false;
      try {
        await procurementSvc.updatePOStatus(po.id, 'approved', 'approver2', db);
      } catch (err: any) {
        doubleApprovalRejected = err.message.includes('Invalid state transition');
      }

      // 5. Illegal jump: approved -> received directly
      let approvedToReceivedRejected = false;
      try {
        await procurementSvc.updatePOStatus(po.id, 'received', 'receiver', db);
      } catch (err: any) {
        approvedToReceivedRejected = err.message.includes('Invalid state transition');
      }

      // 6. Move approved -> ordered
      await procurementSvc.updatePOStatus(po.id, 'ordered', 'buyer', db);

      // 7. Receive goods completely
      await procurementSvc.receiveGoodsAgainstPO(
        {
          poId: po.id,
          warehouseId: wh.id,
          receivedBy: 'QC',
          items: [{ poItemId: po.items[0].id, quantityAccepted: 50, unitCost: 50.0 }]
        },
        db
      );

      // PO should now be 'received'
      const refreshedPO = await procurementSvc.getPurchaseOrderById(po.id, db);
      if (refreshedPO?.status !== 'received') {
        throw new Error(`Expected PO status 'received', got '${refreshedPO?.status}'`);
      }

      // 8. Attempt cancellation after terminal received status
      let receivedToCancelledRejected = false;
      try {
        await procurementSvc.updatePOStatus(po.id, 'cancelled', 'canceller', db);
      } catch (err: any) {
        receivedToCancelledRejected = err.message.includes('goods receipt has already been registered') ||
                                      err.message.includes('Invalid state transition');
      }

      if (!draftToReceivedRejected || !draftToOrderedRejected || !doubleApprovalRejected ||
          !approvedToReceivedRejected || !receivedToCancelledRejected) {
        throw new Error(
          `State machine violation allowed: draftRec=${draftToReceivedRejected}, draftOrd=${draftToOrderedRejected}, dblApp=${doubleApprovalRejected}, appRec=${approvedToReceivedRejected}, recCancel=${receivedToCancelledRejected}`
        );
      }

      return 'PO state machine verified: 5 illegal transition paths strictly blocked, double-approval rejected, terminal received lock enforced.';
    }
  );

  await runProbe(
    'T5-P2.2',
    'State Machine Invariants',
    'Retroactive Goods Receipt (GRN) Invariant Guards Against Non-Ordered States',
    async () => {
      const { db, procurementSvc, client } = await createFreshIsolatedEnvironment();

      const wh = await client.createWarehouse({
        warehouseCode: 'WH-GRN-GUARD',
        name: 'GRN Guard Warehouse',
        address: 'Dhaka',
        city: 'Dhaka'
      });

      const sup = await client.createSupplier({
        supplierCode: 'SUP-GRN-GUARD',
        name: 'GRN Guard Vendor',
        contactPerson: 'Vendor Rep',
        phone: '+8801700000011',
        address: 'Dhaka'
      });

      const item = await client.createItem({
        sku: 'SKU-GRN-GUARD',
        name: 'Guard Item',
        category: 'Test',
        costPrice: 40.0,
        sellingPrice: 70.0
      });

      // Draft PO
      const poDraft = await procurementSvc.createPurchaseOrder(
        {
          poNumber: 'PO-DRAFT-GRN',
          supplierId: sup.id,
          targetWarehouseId: wh.id,
          items: [{ itemId: item.id, quantityOrdered: 20, unitCost: 40.0 }]
        },
        db
      );

      let draftGrnRejected = false;
      try {
        await procurementSvc.receiveGoodsAgainstPO(
          {
            poId: poDraft.id,
            warehouseId: wh.id,
            receivedBy: 'Inspector',
            items: [{ poItemId: poDraft.items[0].id, quantityAccepted: 20, unitCost: 40.0 }]
          },
          db
        );
      } catch (err: any) {
        draftGrnRejected = err.message.includes("PO status is 'draft'");
      }

      // Move to pending_approval
      await procurementSvc.updatePOStatus(poDraft.id, 'pending_approval', 'user', db);
      let pendingGrnRejected = false;
      try {
        await procurementSvc.receiveGoodsAgainstPO(
          {
            poId: poDraft.id,
            warehouseId: wh.id,
            receivedBy: 'Inspector',
            items: [{ poItemId: poDraft.items[0].id, quantityAccepted: 20, unitCost: 40.0 }]
          },
          db
        );
      } catch (err: any) {
        pendingGrnRejected = err.message.includes("PO status is 'pending_approval'");
      }

      // Move to approved (not yet ordered)
      await procurementSvc.updatePOStatus(poDraft.id, 'approved', 'manager', db);
      let approvedGrnRejected = false;
      try {
        await procurementSvc.receiveGoodsAgainstPO(
          {
            poId: poDraft.id,
            warehouseId: wh.id,
            receivedBy: 'Inspector',
            items: [{ poItemId: poDraft.items[0].id, quantityAccepted: 20, unitCost: 40.0 }]
          },
          db
        );
      } catch (err: any) {
        approvedGrnRejected = err.message.includes("PO status is 'approved'");
      }

      // Cancel the approved PO
      await procurementSvc.updatePOStatus(poDraft.id, 'cancelled', 'buyer', db);
      let cancelledGrnRejected = false;
      try {
        await procurementSvc.receiveGoodsAgainstPO(
          {
            poId: poDraft.id,
            warehouseId: wh.id,
            receivedBy: 'Inspector',
            items: [{ poItemId: poDraft.items[0].id, quantityAccepted: 20, unitCost: 40.0 }]
          },
          db
        );
      } catch (err: any) {
        cancelledGrnRejected = err.message.includes("PO status is 'cancelled'");
      }

      if (!draftGrnRejected || !pendingGrnRejected || !approvedGrnRejected || !cancelledGrnRejected) {
        throw new Error(
          `Retroactive GRN guard failure: draft=${draftGrnRejected}, pending=${pendingGrnRejected}, approved=${approvedGrnRejected}, cancelled=${cancelledGrnRejected}`
        );
      }

      return 'Retroactive GRN attempts strictly blocked on draft, pending_approval, approved, and cancelled purchase orders.';
    }
  );

  await runProbe(
    'T5-P2.3',
    'State Machine Invariants',
    'Inter-Warehouse Stock Transfer State Transitions & Physical Transit Guards',
    async () => {
      const { db, inventorySvc, transferSvc, client } = await createFreshIsolatedEnvironment();

      const whSrc = await client.createWarehouse({
        warehouseCode: 'WH-TR-SRC',
        name: 'Origin Transfer Hub',
        address: 'Dhaka',
        city: 'Dhaka'
      });

      const whDest = await client.createWarehouse({
        warehouseCode: 'WH-TR-DEST',
        name: 'Destination Transfer Depot',
        address: 'Chittagong',
        city: 'Chittagong'
      });

      const item = await client.createItem({
        sku: 'SKU-TR-PROBE',
        name: 'Transfer Item Probe',
        category: 'Test',
        costPrice: 20.0,
        sellingPrice: 40.0
      });

      // Seed stock at origin
      await inventorySvc.adjustStock(
        {
          itemId: item.id,
          warehouseId: whSrc.id,
          adjustmentType: 'NEW_BALANCE',
          quantity: 100,
          reason: 'CYCLE_COUNT_ADJUSTMENT'
        },
        db
      );

      const transfer = await transferSvc.createTransfer(
        {
          sourceWarehouseId: whSrc.id,
          destWarehouseId: whDest.id,
          requestedBy: 'Logistics Planner',
          items: [{ itemId: item.id, quantityRequested: 30 }]
        },
        db
      );

      // 1. Illegal transition: draft -> completed directly
      let draftToCompletedRejected = false;
      try {
        await transferSvc.updateTransferStatus(transfer.id, 'completed', 'admin', undefined, db);
      } catch (err: any) {
        draftToCompletedRejected = err.message.includes('Invalid state transition');
      }

      // 2. Dispatch transfer into in_transit
      await transferSvc.dispatchTransfer(transfer.id, 'Driver Jamal', db);

      // 3. Illegal transition: in_transit -> cancelled (cannot cancel goods while on the truck)
      let inTransitToCancelledRejected = false;
      try {
        await transferSvc.cancelTransfer(transfer.id, 'Cancel during transit', 'admin', db);
      } catch (err: any) {
        inTransitToCancelledRejected = err.message.includes('already in transit');
      }

      // 4. Double dispatch attempt
      let doubleDispatchRejected = false;
      try {
        await transferSvc.dispatchTransfer(transfer.id, 'Driver Second', db);
      } catch (err: any) {
        doubleDispatchRejected = err.message.includes("status is 'in_transit'");
      }

      // 5. Complete transfer at destination
      await transferSvc.receiveTransfer(
        transfer.id,
        [{ lineId: transfer.items[0].id, quantityReceived: 30 }],
        'Depot Receiver',
        db
      );

      // 6. Reverse completed transfer: completed -> in_transit
      let completedToInTransitRejected = false;
      try {
        await transferSvc.updateTransferStatus(transfer.id, 'in_transit', 'admin', undefined, db);
      } catch (err: any) {
        completedToInTransitRejected = err.message.includes('Invalid state transition');
      }

      if (!draftToCompletedRejected || !inTransitToCancelledRejected || !doubleDispatchRejected || !completedToInTransitRejected) {
        throw new Error(
          `Transfer state machine gap: draftComp=${draftToCompletedRejected}, inTransitCancel=${inTransitToCancelledRejected}, dblDispatch=${doubleDispatchRejected}, compInTransit=${completedToInTransitRejected}`
        );
      }

      return 'Stock transfer state machine strictly guards in-transit isolation, blocks cancellation mid-transit, and locks completed transfers.';
    }
  );

  await runProbe(
    'T5-P2.4',
    'State Machine Invariants',
    'Fulfillment Shipment Terminal Gate Locking (Delivered, Cancelled, RTO)',
    async () => {
      const { db, fulfillmentSvc, client, inventorySvc } = await createFreshIsolatedEnvironment();

      const wh = await client.createWarehouse({
        warehouseCode: 'WH-SHP-STATE',
        name: 'Shipment State Warehouse',
        address: 'Dhaka',
        city: 'Dhaka'
      });

      const item = await client.createItem({
        sku: 'SKU-SHP-STATE',
        name: 'Shipment State Item',
        category: 'Test',
        costPrice: 30.0,
        sellingPrice: 60.0
      });

      const courier = await client.createCourier('Express Courier', '+8801700000099', 'Express');

      await inventorySvc.adjustStock(
        {
          itemId: item.id,
          warehouseId: wh.id,
          adjustmentType: 'NEW_BALANCE',
          quantity: 50,
          reason: 'CYCLE_COUNT_ADJUSTMENT'
        },
        db
      );

      const shipment = await fulfillmentSvc.createShipment(
        {
          sourceWarehouseId: wh.id,
          orderReference: 'ORD-TERM-001',
          customerName: 'Terminal Customer',
          customerPhone: '+8801811111111',
          customerAddress: 'Banani, Dhaka',
          destinationCity: 'Dhaka',
          courierId: courier.id,
          courierName: courier.name,
          items: [{ itemId: item.id, quantity: 10, unitPrice: 60.0 }]
        },
        db
      );

      // 1. Illegal jump: pending -> delivered directly
      let pendingToDeliveredRejected = false;
      try {
        await fulfillmentSvc.updateShipmentStatus(shipment.id, 'delivered', undefined, 'user', db);
      } catch (err: any) {
        pendingToDeliveredRejected = err.message.includes('Invalid state transition');
      }

      // 2. Dispatch shipment (moves to dispatched)
      await fulfillmentSvc.dispatchShipment(shipment.id, 'TRACK-VALID-100', 'dispatcher', db);

      // 3. Move dispatched -> in_transit -> delivered
      await fulfillmentSvc.updateShipmentStatus(shipment.id, 'in_transit', 'On the road', 'courier', db);
      await fulfillmentSvc.updateShipmentStatus(shipment.id, 'delivered', 'Signed by customer', 'courier', db);

      // 4. Illegal mutation from terminal 'delivered': delivered -> return_to_origin
      let deliveredToRtoRejected = false;
      try {
        await fulfillmentSvc.updateShipmentStatus(shipment.id, 'return_to_origin', 'Retroactive RTO', 'user', db);
      } catch (err: any) {
        deliveredToRtoRejected = err.message.includes("terminal 'delivered' status");
      }

      // 5. Illegal mutation: delivered -> dispatched (re-dispatch delivered order)
      let deliveredToDispatchedRejected = false;
      try {
        await fulfillmentSvc.dispatchShipment(shipment.id, 'TRACK-RE-DISPATCH', 'user', db);
      } catch (err: any) {
        deliveredToDispatchedRejected = err.message.includes("terminal 'delivered' status");
      }

      if (!pendingToDeliveredRejected || !deliveredToRtoRejected || !deliveredToDispatchedRejected) {
        throw new Error(
          `Terminal gate violation allowed: pendDeliv=${pendingToDeliveredRejected}, delivRto=${deliveredToRtoRejected}, delivDisp=${deliveredToDispatchedRejected}`
        );
      }

      return 'Terminal delivery locking enforced: delivered shipments are 100% immutable and protected against re-dispatch or retroactive RTO.';
    }
  );

  // ==========================================================================
  // SUITE 3: MULTI-ENTITY RELATIONAL INTEGRITY & CONCURRENCY
  // ==========================================================================
  console.log(`\n${colors.bold}${colors.yellow}▶ Suite 3: Multi-Entity Relational Integrity, Stock Conservation & Concurrency Stress${colors.reset}`);

  await runProbe(
    'T5-P3.1',
    'Relational Integrity & Conservation',
    'Inter-Warehouse Mass Conservation Across Transit Discrepancy & Audit Trail',
    async () => {
      const { db, inventorySvc, transferSvc, client } = await createFreshIsolatedEnvironment();

      const whA = await client.createWarehouse({
        warehouseCode: 'WH-ALPHA',
        name: 'Warehouse Alpha (Dhaka)',
        address: 'Tejgaon',
        city: 'Dhaka'
      });

      const whB = await client.createWarehouse({
        warehouseCode: 'WH-BETA',
        name: 'Warehouse Beta (Chittagong)',
        address: 'Agrabad',
        city: 'Chittagong'
      });

      const item = await client.createItem({
        sku: 'SKU-CONSERVE-01',
        name: 'Mass Conservation Test Bearings',
        category: 'Mechanical',
        costPrice: 75.0,
        sellingPrice: 120.0
      });

      // Initial Stock at Warehouse A: 100 units
      await inventorySvc.adjustStock(
        {
          itemId: item.id,
          warehouseId: whA.id,
          adjustmentType: 'NEW_BALANCE',
          quantity: 100,
          reason: 'CYCLE_COUNT_ADJUSTMENT'
        },
        db
      );

      // Transfer 40 units from Alpha to Beta
      const transfer = await transferSvc.createTransfer(
        {
          sourceWarehouseId: whA.id,
          destWarehouseId: whB.id,
          requestedBy: 'Supply Coordinator',
          items: [{ itemId: item.id, quantityRequested: 40 }]
        },
        db
      );

      // Dispatch 40 units -> in_transit
      await transferSvc.dispatchTransfer(transfer.id, 'Truck Driver 1', db);

      // Verify in-transit isolation: Alpha=60, Beta=0, Total Physical=60
      const stockA_transit = await client.getItemTotalStock(item.id, whA.id);
      const stockB_transit = await client.getItemTotalStock(item.id, whB.id);
      if (stockA_transit.onHand !== 60) throw new Error(`Alpha stock in transit expected 60, got ${stockA_transit.onHand}`);
      if (stockB_transit.onHand !== 0) throw new Error(`Beta stock in transit expected 0, got ${stockB_transit.onHand}`);

      // Receive 36 units at Beta, 4 units broken in transit
      await transferSvc.receiveTransfer(
        transfer.id,
        [{
          lineId: transfer.items[0].id,
          quantityReceived: 36,
          discrepancyReason: '4 units shattered during monsoon transport'
        }],
        'Beta Receiving Officer',
        db
      );

      // Final stock verification
      const stockA_final = await client.getItemTotalStock(item.id, whA.id);
      const stockB_final = await client.getItemTotalStock(item.id, whB.id);

      if (stockA_final.onHand !== 60) throw new Error(`Alpha final stock expected 60, got ${stockA_final.onHand}`);
      if (stockB_final.onHand !== 36) throw new Error(`Beta final stock expected 36, got ${stockB_final.onHand}`);

      const totalPhysical = stockA_final.onHand + stockB_final.onHand;
      if (totalPhysical !== 96) throw new Error(`Total physical stock expected 96, got ${totalPhysical}`);

      // Verify double-entry ledger entries
      const auditRows = await db.query<any>(
        'SELECT transaction_type, quantity_change, running_balance_after FROM inventory_transactions WHERE item_id = ? ORDER BY transaction_timestamp ASC',
        [item.id]
      );

      const transferOut = auditRows.find((r) => r.transaction_type === 'TRANSFER_OUT');
      const transferIn = auditRows.find((r) => r.transaction_type === 'TRANSFER_IN');

      if (!transferOut || transferOut.quantity_change !== -40) {
        throw new Error(`Invalid TRANSFER_OUT audit entry: ${JSON.stringify(transferOut)}`);
      }
      if (!transferIn || transferIn.quantity_change !== 36) {
        throw new Error(`Invalid TRANSFER_IN audit entry: ${JSON.stringify(transferIn)}`);
      }

      return `Global conservation verified: 100 initial = 60 (Alpha) + 36 (Beta) + 4 (discrepancy transit loss) with double-entry ledger reconciliation.`;
    }
  );

  await runProbe(
    'T5-P3.2',
    'Relational Integrity & Concurrency',
    'Concurrent Parallel Shipment Reservation Under Limited Stock (10 Parallel Workers)',
    async () => {
      const { db, inventorySvc, fulfillmentSvc, client } = await createFreshIsolatedEnvironment();

      const wh = await client.createWarehouse({
        warehouseCode: 'WH-RACE-01',
        name: 'Concurrent Race Warehouse',
        address: 'Dhaka Hub',
        city: 'Dhaka'
      });

      const item = await client.createItem({
        sku: 'SKU-RACE-ITEM',
        name: 'High-Demand Flash Sale Item',
        category: 'Consumer Goods',
        costPrice: 25.0,
        sellingPrice: 50.0
      });

      const courier = await client.createCourier('Rapid Delivery', '+8801700000088', 'Express');

      // Exactly 50 units on hand
      await inventorySvc.adjustStock(
        {
          itemId: item.id,
          warehouseId: wh.id,
          adjustmentType: 'NEW_BALANCE',
          quantity: 50,
          reason: 'CYCLE_COUNT_ADJUSTMENT'
        },
        db
      );

      // 10 concurrent parallel requests competing for 10 units each
      // Total demand = 100 units, available = 50 units. Exactly 5 must succeed, 5 must reject.
      const parallelTasks = Array.from({ length: 10 }, (_, i) => {
        return fulfillmentSvc
          .createShipment(
            {
              sourceWarehouseId: wh.id,
              orderReference: `ORD-RACE-${i + 1}`,
              customerName: `Customer ${i + 1}`,
              customerPhone: `+88017000000${i}`,
              customerAddress: `Address ${i}`,
              destinationCity: 'Dhaka',
              courierId: courier.id,
              courierName: courier.name,
              items: [{ itemId: item.id, quantity: 10, unitPrice: 50.0 }]
            },
            db
          )
          .then(() => ({ success: true, index: i }))
          .catch((err) => ({ success: false, index: i, error: err.message }));
      });

      const results = await Promise.all(parallelTasks);
      const successes = results.filter((r) => r.success);
      const failures = results.filter((r) => !r.success);

      if (successes.length !== 5 || failures.length !== 5) {
        throw new Error(
          `Concurrency race breach: expected exactly 5 successes and 5 failures, got ${successes.length} successes and ${failures.length} failures!`
        );
      }

      // Check stock state
      const finalStock = await client.getItemTotalStock(item.id, wh.id);
      if (finalStock.onHand !== 50) throw new Error(`On-hand should be 50, got ${finalStock.onHand}`);
      if (finalStock.reserved !== 50) throw new Error(`Reserved should be 50, got ${finalStock.reserved}`);
      if (finalStock.available !== 0) throw new Error(`Available should be 0, got ${finalStock.available}`);

      return `Parallel reservation lock verified: 10 concurrent requests for 50 total stock resulted in exactly 5 successes and 5 rejections with 0 stock drift.`;
    }
  );

  await runProbe(
    'T5-P3.3',
    'Relational Integrity & Concurrency',
    'Concurrent Double-Dispatch Race Prevention on Outbound Shipment',
    async () => {
      const { db, inventorySvc, fulfillmentSvc, client } = await createFreshIsolatedEnvironment();

      const wh = await client.createWarehouse({
        warehouseCode: 'WH-DISP-RACE',
        name: 'Dispatch Race Warehouse',
        address: 'Dhaka',
        city: 'Dhaka'
      });

      const item = await client.createItem({
        sku: 'SKU-DISP-RACE',
        name: 'Dispatch Race Item',
        category: 'Test',
        costPrice: 50.0,
        sellingPrice: 100.0
      });

      const courier = await client.createCourier('Express Delivery', '+8801700000089', 'Express');

      await inventorySvc.adjustStock(
        {
          itemId: item.id,
          warehouseId: wh.id,
          adjustmentType: 'NEW_BALANCE',
          quantity: 100,
          reason: 'CYCLE_COUNT_ADJUSTMENT'
        },
        db
      );

      const shipment = await fulfillmentSvc.createShipment(
        {
          sourceWarehouseId: wh.id,
          orderReference: 'ORD-DISP-001',
          customerName: 'Customer Race',
          customerPhone: '+8801700000099',
          customerAddress: 'Gulshan, Dhaka',
          destinationCity: 'Dhaka',
          courierId: courier.id,
          courierName: courier.name,
          items: [{ itemId: item.id, quantity: 20, unitPrice: 100.0 }]
        },
        db
      );

      // Launch 5 parallel un-awaited dispatchShipment calls on the exact same shipment
      const dispatchTasks = Array.from({ length: 5 }, (_, i) => {
        return fulfillmentSvc
          .dispatchShipment(shipment.id, `TRACK-RACE-${i + 1}`, `dispatcher-${i + 1}`, db)
          .then(() => ({ success: true, worker: i + 1 }))
          .catch((err) => ({ success: false, worker: i + 1, error: err.message }));
      });

      const dispatchResults = await Promise.all(dispatchTasks);
      const successes = dispatchResults.filter((r) => r.success);
      const failures = dispatchResults.filter((r) => !r.success);

      if (successes.length !== 1) {
        throw new Error(`Double-dispatch race failure: expected exactly 1 dispatch to succeed, but ${successes.length} succeeded!`);
      }
      if (failures.length !== 4) {
        throw new Error(`Expected 4 failed duplicate dispatches, got ${failures.length}`);
      }

      // Check stock deduction: 100 - 20 = 80
      const stock = await client.getItemTotalStock(item.id, wh.id);
      if (stock.onHand !== 80) {
        throw new Error(`Stock on-hand expected 80, got ${stock.onHand} (possible double deduction!)`);
      }
      if (stock.reserved !== 0) {
        throw new Error(`Stock reserved expected 0, got ${stock.reserved}`);
      }

      // Verify audit transactions: exactly 1 FULFILLMENT_PICK
      const auditRows = await db.query<any>(
        "SELECT COUNT(*) as count FROM inventory_transactions WHERE reference_id = ? AND transaction_type = 'FULFILLMENT_PICK'",
        [shipment.shipment_number]
      );
      if (auditRows[0].count !== 1) {
        throw new Error(`Audit ledger has ${auditRows[0].count} FULFILLMENT_PICK entries, expected 1!`);
      }

      return `Atomic dispatch guard verified: 5 simultaneous dispatch attempts resulted in exactly 1 success, 4 rejections, and single 20-unit deduction (80 on-hand).`;
    }
  );

  await runProbe(
    'T5-P3.4',
    'Relational Integrity & Concurrency',
    'Concurrent Double Return-to-Origin (RTO) Restock Race Prevention',
    async () => {
      const { db, inventorySvc, fulfillmentSvc, client } = await createFreshIsolatedEnvironment();

      const wh = await client.createWarehouse({
        warehouseCode: 'WH-RTO-RACE',
        name: 'RTO Race Warehouse',
        address: 'Dhaka',
        city: 'Dhaka'
      });

      const item = await client.createItem({
        sku: 'SKU-RTO-RACE',
        name: 'RTO Race Item',
        category: 'Test',
        costPrice: 40.0,
        sellingPrice: 80.0
      });

      const courier = await client.createCourier('RTO Courier', '+8801700000077', 'Express');

      await inventorySvc.adjustStock(
        {
          itemId: item.id,
          warehouseId: wh.id,
          adjustmentType: 'NEW_BALANCE',
          quantity: 50,
          reason: 'CYCLE_COUNT_ADJUSTMENT'
        },
        db
      );

      const shipment = await fulfillmentSvc.createShipment(
        {
          sourceWarehouseId: wh.id,
          orderReference: 'ORD-RTO-001',
          customerName: 'Customer RTO',
          customerPhone: '+8801700000078',
          customerAddress: 'Uttara, Dhaka',
          destinationCity: 'Dhaka',
          courierId: courier.id,
          courierName: courier.name,
          items: [{ itemId: item.id, quantity: 15, unitPrice: 80.0 }]
        },
        db
      );

      await fulfillmentSvc.dispatchShipment(shipment.id, 'TRACK-RTO-001', 'dispatcher', db);
      await fulfillmentSvc.updateShipmentStatus(shipment.id, 'in_transit', 'Out for delivery', 'courier', db);
      await fulfillmentSvc.updateShipmentStatus(shipment.id, 'return_to_origin', 'Address not found', 'courier', db);

      // On-hand after dispatch: 50 - 15 = 35
      const stockPreRto = await client.getItemTotalStock(item.id, wh.id);
      if (stockPreRto.onHand !== 35) throw new Error(`Stock pre-RTO expected 35, got ${stockPreRto.onHand}`);

      // Launch 5 parallel un-awaited processRTO calls
      const rtoTasks = Array.from({ length: 5 }, (_, i) => {
        return fulfillmentSvc
          .processRTO(shipment.id, 'restocked', undefined, `rto-worker-${i + 1}`, db)
          .then(() => ({ success: true, worker: i + 1 }))
          .catch((err) => ({ success: false, worker: i + 1, error: err.message }));
      });

      const rtoResults = await Promise.all(rtoTasks);
      const successes = rtoResults.filter((r) => r.success);
      const failures = rtoResults.filter((r) => !r.success);

      if (successes.length !== 1) {
        throw new Error(`Double-RTO race failure: expected exactly 1 RTO restock to succeed, got ${successes.length}!`);
      }
      if (failures.length !== 4) {
        throw new Error(`Expected 4 failed duplicate RTO restocks, got ${failures.length}`);
      }

      // Check stock: should be exactly 35 + 15 = 50 (NOT 35 + 5*15 = 110)
      const stockPostRto = await client.getItemTotalStock(item.id, wh.id);
      if (stockPostRto.onHand !== 50) {
        throw new Error(`Stock post-RTO expected 50, got ${stockPostRto.onHand} (duplicate restock detected!)`);
      }

      return `Atomic RTO guard verified: 5 concurrent RTO restock attempts resulted in exactly 1 success, restoring physical stock to 50 without phantom additions.`;
    }
  );

  await runProbe(
    'T5-P3.5',
    'Relational Integrity & Concurrency',
    'Concurrent Double Stock Transfer Arrival Receipt Prevention',
    async () => {
      const { db, inventorySvc, transferSvc, client } = await createFreshIsolatedEnvironment();

      const whA = await client.createWarehouse({
        warehouseCode: 'WH-TR-CONC-A',
        name: 'Origin Hub',
        address: 'Dhaka',
        city: 'Dhaka'
      });

      const whB = await client.createWarehouse({
        warehouseCode: 'WH-TR-CONC-B',
        name: 'Destination Hub',
        address: 'Sylhet',
        city: 'Sylhet'
      });

      const item = await client.createItem({
        sku: 'SKU-TR-CONC',
        name: 'Transfer Concurrency Item',
        category: 'Test',
        costPrice: 100.0,
        sellingPrice: 200.0
      });

      await inventorySvc.adjustStock(
        {
          itemId: item.id,
          warehouseId: whA.id,
          adjustmentType: 'NEW_BALANCE',
          quantity: 50,
          reason: 'CYCLE_COUNT_ADJUSTMENT'
        },
        db
      );

      const transfer = await transferSvc.createTransfer(
        {
          sourceWarehouseId: whA.id,
          destWarehouseId: whB.id,
          requestedBy: 'Coordinator',
          items: [{ itemId: item.id, quantityRequested: 25 }]
        },
        db
      );

      await transferSvc.dispatchTransfer(transfer.id, 'Driver', db);

      // Launch 5 simultaneous un-awaited receiveTransfer calls
      const receiveTasks = Array.from({ length: 5 }, (_, i) => {
        return transferSvc
          .receiveTransfer(
            transfer.id,
            [{ lineId: transfer.items[0].id, quantityReceived: 25 }],
            `receiver-${i + 1}`,
            db
          )
          .then(() => ({ success: true, worker: i + 1 }))
          .catch((err) => ({ success: false, worker: i + 1, error: err.message }));
      });

      const results = await Promise.all(receiveTasks);
      const successes = results.filter((r) => r.success);
      const failures = results.filter((r) => !r.success);

      if (successes.length !== 1) {
        throw new Error(`Double-transfer receive failure: expected 1 success, got ${successes.length}!`);
      }
      if (failures.length !== 4) {
        throw new Error(`Expected 4 rejections, got ${failures.length}`);
      }

      // Check destination stock: should be exactly 25, NOT 125
      const stockDest = await client.getItemTotalStock(item.id, whB.id);
      if (stockDest.onHand !== 25) {
        throw new Error(`Destination stock expected 25, got ${stockDest.onHand} (duplicate receiving detected!)`);
      }

      return `Atomic transfer receipt verified: 5 concurrent receiving calls resulted in exactly 1 arrival receipt and 25 destination units.`;
    }
  );

  // ==========================================================================
  // SUITE 4: UNICODE, MULTI-LANGUAGE & RELATIONAL COLLISION RESISTANCE
  // ==========================================================================
  console.log(`\n${colors.bold}${colors.yellow}▶ Suite 4: Unicode, Multi-Language Script Support & Relational Collision Resistance${colors.reset}`);

  await runProbe(
    'T5-P4.1',
    'Unicode & Character Encoding',
    'Full Multi-Byte UTF-8 Bengali Script Relational Lifecycle & Keyword Search',
    async () => {
      const { db, supplierSvc, procurementSvc, client } = await createFreshIsolatedEnvironment();

      const whBengali = await client.createWarehouse({
        warehouseCode: 'গুদাম-ঢাকা-০১',
        name: 'ঢাকা কেন্দ্রীয় সরবরাহ ও বণ্টন কেন্দ্র',
        address: 'প্লট নং ১০, তেজগাঁও শিল্প এলাকা',
        city: 'ঢাকা'
      });

      const supBengali = await supplierSvc.createSupplier(
        {
          supplierCode: 'সরবরাহকারী-বসুন্ধরা-০১',
          name: 'মেসার্স বসুন্ধরা ইন্ড্রাস্ট্রিয়াল ট্রেডিং কর্পোরেশন লি.',
          contactPerson: 'ইঞ্জিনিয়ার তানভীর আহমেদ চৌধুরী',
          phone: '+৮৮০১৭০০০০০০৯৯',
          email: 'tanvir@bosundhara-group.bd',
          address: 'বসুন্ধরা আবাসিক এলাকা, ঢাকা',
          city: 'ঢাকা',
          taxId: 'ট্যাক্স-বিডি-১২৩৪৫৬৭৮'
        },
        db
      );

      const itemBengali = await procurementSvc.createItem(
        {
          sku: 'যন্ত্রাংশ-বিয়ারিং-৬২০৪-প্রিমিয়াম',
          name: 'উচ্চ ক্ষমতাসম্পন্ন ডাবল-সিল্ড বল বিয়ারিং',
          description: 'ভারী শিল্প কারখানার রোলিং মিল ও বৈদ্যুতিক মোটরের জন্য বিশেষ গ্রেড',
          category: 'ভারী শিল্প যন্ত্রাংশ',
          costPrice: 450.50,
          sellingPrice: 720.00,
          unitOfMeasure: 'পিস'
        },
        db
      );

      // Verify retrieval by ID with exact Unicode string preservation
      const fetchedSup = await supplierSvc.getSupplierById(supBengali.id, db);
      if (fetchedSup?.name !== 'মেসার্স বসুন্ধরা ইন্ড্রাস্ট্রিয়াল ট্রেডিং কর্পোরেশন লি.') {
        throw new Error(`Supplier name corrupted: got "${fetchedSup?.name}"`);
      }
      if (fetchedSup?.tax_id !== 'ট্যাক্স-বিডি-১২৩৪৫৬৭৮') {
        throw new Error(`Supplier tax ID corrupted: got "${fetchedSup?.tax_id}"`);
      }

      // Keyword search in Bengali
      const searchRes = await supplierSvc.getAllSuppliers({ search: 'বসুন্ধরা' }, db);
      if (searchRes.length !== 1 || searchRes[0].id !== supBengali.id) {
        throw new Error(`Bengali keyword search failed: expected 1 result for 'বসুন্ধরা', got ${searchRes.length}`);
      }

      // Issue PO and receive GRN with Bengali identifiers
      const po = await procurementSvc.createPurchaseOrder(
        {
          poNumber: 'ক্রয়-আদেশ-২০২৬-১০০১',
          supplierId: supBengali.id,
          targetWarehouseId: whBengali.id,
          items: [{ itemId: itemBengali.id, quantityOrdered: 40, unitCost: 450.50 }]
        },
        db
      );

      await procurementSvc.updatePOStatus(po.id, 'pending_approval', 'তানভীর', db);
      await procurementSvc.updatePOStatus(po.id, 'approved', 'ব্যবস্থাপক', db);
      await procurementSvc.updatePOStatus(po.id, 'ordered', 'ক্রয় কর্মকর্তা', db);

      const grnRes = await procurementSvc.receiveGoodsAgainstPO(
        {
          poId: po.id,
          warehouseId: whBengali.id,
          receivedBy: 'পরিদর্শক মো: কামরুল হাসান',
          inspectionNotes: 'পণ্য গুণগত মান নিশ্চিত করা হয়েছে। কোনো ত্রুটি নেই।',
          items: [{
            poItemId: po.items[0].id,
            quantityAccepted: 40,
            unitCost: 450.50,
            batchNumber: 'ব্যাচ-২০২৬-আলফা-১'
          }]
        },
        db
      );

      const stock = await client.getItemTotalStock(itemBengali.id, whBengali.id);
      if (stock.onHand !== 40) throw new Error(`Expected Bengali stock on-hand 40, got ${stock.onHand}`);

      return 'Full multi-byte UTF-8 Bengali lifecycle validated: 100% fidelity across supplier, item SKU, warehouse, PO, and GRN without character corruption.';
    }
  );

  await runProbe(
    'T5-P4.2',
    'Unicode & Character Encoding',
    'Unique Business Key Collision Resistance (Supplier, Item SKU, Warehouse, Bin)',
    async () => {
      const { db, supplierSvc, procurementSvc, client } = await createFreshIsolatedEnvironment();

      const wh = await client.createWarehouse({
        warehouseCode: 'WH-COLLIDE-01',
        name: 'Collision Warehouse',
        address: 'Dhaka',
        city: 'Dhaka'
      });

      // 1. Duplicate Supplier Code
      await supplierSvc.createSupplier(
        {
          supplierCode: 'SUP-UNIQUE-KEY-01',
          name: 'First Vendor',
          phone: '+8801700000001',
          address: 'Dhaka'
        },
        db
      );

      let dupSupplierRejected = false;
      try {
        await supplierSvc.createSupplier(
          {
            supplierCode: 'SUP-UNIQUE-KEY-01',
            name: 'Duplicate Vendor',
            phone: '+8801700000002',
            address: 'Dhaka'
          },
          db
        );
      } catch (err: any) {
        dupSupplierRejected = true;
      }

      // 2. Duplicate Item SKU
      await procurementSvc.createItem(
        {
          sku: 'SKU-UNIQUE-KEY-01',
          name: 'First Item',
          category: 'Hardware',
          costPrice: 10.0,
          sellingPrice: 20.0
        },
        db
      );

      let dupSkuRejected = false;
      try {
        await procurementSvc.createItem(
          {
            sku: 'SKU-UNIQUE-KEY-01',
            name: 'Duplicate Item',
            category: 'Hardware',
            costPrice: 15.0,
            sellingPrice: 30.0
          },
          db
        );
      } catch (err: any) {
        dupSkuRejected = true;
      }

      // 3. Duplicate Warehouse Code
      let dupWhRejected = false;
      try {
        await client.createWarehouse({
          warehouseCode: 'WH-COLLIDE-01',
          name: 'Second Collision Warehouse',
          address: 'Dhaka',
          city: 'Dhaka'
        });
      } catch (err: any) {
        dupWhRejected = true;
      }

      // 4. Duplicate Bin Code in Same Warehouse
      await client.createLocation({
        warehouseId: wh.id,
        zone: 'Zone 1',
        aisle: 'A1',
        rack: 'R1',
        shelf: 'S1',
        binCode: 'BIN-UNIQUE-01'
      });

      let dupBinRejected = false;
      try {
        await client.createLocation({
          warehouseId: wh.id,
          zone: 'Zone 2',
          aisle: 'A2',
          rack: 'R2',
          shelf: 'S2',
          binCode: 'BIN-UNIQUE-01'
        });
      } catch (err: any) {
        dupBinRejected = true;
      }

      if (!dupSupplierRejected || !dupSkuRejected || !dupWhRejected || !dupBinRejected) {
        throw new Error(
          `Unique key collision gap: sup=${dupSupplierRejected}, sku=${dupSkuRejected}, wh=${dupWhRejected}, bin=${dupBinRejected}`
        );
      }

      return 'Unique key constraints strictly enforced across suppliers, items, warehouses, and bin locations.';
    }
  );

  await runProbe(
    'T5-P4.3',
    'Unicode & Character Encoding',
    'Self-Transfer Invariant & Foreign Key Delete Restrict Rules',
    async () => {
      const { db, supplierSvc, inventorySvc, transferSvc, client } = await createFreshIsolatedEnvironment();

      const wh = await client.createWarehouse({
        warehouseCode: 'WH-FK-RESTRICT',
        name: 'FK Test Warehouse',
        address: 'Dhaka',
        city: 'Dhaka',
        isDefault: true
      });

      const sup = await client.createSupplier({
        supplierCode: 'SUP-FK-TEST',
        name: 'FK Test Supplier',
        contactPerson: 'Rep',
        phone: '+8801700000001',
        address: 'Dhaka'
      });

      const item = await client.createItem({
        sku: 'SKU-FK-TEST',
        name: 'FK Test Item',
        category: 'Test',
        costPrice: 20.0,
        sellingPrice: 40.0
      });

      // 1. Self-Transfer Check: Source == Destination
      let selfTransferRejected = false;
      try {
        await transferSvc.createTransfer(
          {
            sourceWarehouseId: wh.id,
            destWarehouseId: wh.id,
            requestedBy: 'Test',
            items: [{ itemId: item.id, quantityRequested: 5 }]
          },
          db
        );
      } catch (err: any) {
        selfTransferRejected = err.message.includes('cannot be identical');
      }

      // 2. Default warehouse deletion block
      let defaultWhDeleteRejected = false;
      try {
        await inventorySvc.deleteWarehouse(wh.id, db);
      } catch (err: any) {
        defaultWhDeleteRejected = err.message.includes('Cannot delete or deactivate the default warehouse');
      }

      // 3. Supplier with purchase orders: safe soft-delete fallback
      const po = await client.createPurchaseOrder({
        poNumber: 'PO-FK-001',
        supplierId: sup.id,
        targetWarehouseId: wh.id,
        items: [{ itemId: item.id, sku: item.sku, quantityOrdered: 10, unitCost: 20.0 }]
      });

      const delResult = await supplierSvc.deleteSupplier(sup.id, { force: false }, db);
      if (!delResult.softDeleted) {
        throw new Error('Supplier with active PO should have been soft-deleted, but was not!');
      }

      const refreshedSup = await supplierSvc.getSupplierById(sup.id, db);
      if (refreshedSup?.is_active !== 0) {
        throw new Error('Soft-deleted supplier should have is_active = 0');
      }

      if (!selfTransferRejected || !defaultWhDeleteRejected) {
        throw new Error(
          `Constraint failure: selfTransfer=${selfTransferRejected}, defaultWhDelete=${defaultWhDeleteRejected}`
        );
      }

      return 'Self-transfers blocked, default warehouse deletion prevented, and supplier referential integrity preserved via safe soft-delete.';
    }
  );

  // ==========================================================================
  // SUITE 5: BATCH EXPIRY QUARANTINE, STOCK FLOOR & DISASTER RECOVERY
  // ==========================================================================
  console.log(`\n${colors.bold}${colors.yellow}▶ Suite 5: Batch Expiry Quarantine, Reserved Floor & Disaster Recovery Boundaries${colors.reset}`);

  await runProbe(
    'T5-P5.1',
    'Quarantine & Expiration',
    'FEFO Picking Algorithm Strictly Excludes Expired and Quarantined Batches',
    async () => {
      const { db, inventorySvc, client } = await createFreshIsolatedEnvironment();

      const wh = await client.createWarehouse({
        warehouseCode: 'WH-FEFO-01',
        name: 'FEFO Test Warehouse',
        address: 'Dhaka',
        city: 'Dhaka'
      });

      const item = await client.createItem({
        sku: 'SKU-PHARMA-01',
        name: 'Temperature-Sensitive Medicine',
        category: 'Pharmaceuticals',
        costPrice: 50.0,
        sellingPrice: 100.0
      });

      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const in7Days = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
      const in60Days = new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0];

      // Batch 1: Expired yesterday (50 units)
      const bExpired = await inventorySvc.createBatch(
        {
          batchNumber: 'LOT-EXPIRED-YEST',
          itemId: item.id,
          expiryDate: yesterday,
          unitCost: 50.0,
          quantity: 50,
          status: 'ACTIVE'
        },
        db
      );

      // Batch 2: Quarantined lot (50 units)
      const bQuarantined = await inventorySvc.createBatch(
        {
          batchNumber: 'LOT-QUARANTINED',
          itemId: item.id,
          expiryDate: in60Days,
          unitCost: 50.0,
          quantity: 50,
          status: 'QUARANTINED'
        },
        db
      );

      // Batch 3: Active, expires in 7 days (15 units)
      const bExp7 = await inventorySvc.createBatch(
        {
          batchNumber: 'LOT-EXP-7DAYS',
          itemId: item.id,
          expiryDate: in7Days,
          unitCost: 50.0,
          quantity: 15,
          status: 'ACTIVE'
        },
        db
      );

      // Batch 4: Active, expires in 60 days (40 units)
      const bExp60 = await inventorySvc.createBatch(
        {
          batchNumber: 'LOT-EXP-60DAYS',
          itemId: item.id,
          expiryDate: in60Days,
          unitCost: 50.0,
          quantity: 40,
          status: 'ACTIVE'
        },
        db
      );

      // Seed physical stock rows for each batch
      const insertStock = async (bId: string, qty: number) => {
        await db.execute(
          `INSERT INTO inventory_stock (id, item_id, warehouse_id, batch_id, quantity_on_hand, quantity_reserved)
           VALUES (?, ?, ?, ?, ?, 0)`,
          [`stk-${bId}`, item.id, wh.id, bId, qty]
        );
      };

      await insertStock(bExpired.id, 50);
      await insertStock(bQuarantined.id, 50);
      await insertStock(bExp7.id, 15);
      await insertStock(bExp60.id, 40);

      // Request FEFO picking of 25 units
      const allocations = await inventorySvc.getAvailableBatchesForPicking(item.id, wh.id, 25, 'FEFO', db);

      // Total allocated should be 25
      const totalAllocated = allocations.reduce((acc, a) => acc + a.allocatedQuantity, 0);
      if (totalAllocated !== 25) {
        throw new Error(`Expected total allocation 25, got ${totalAllocated}`);
      }

      // Check that expired and quarantined batches were completely excluded
      const allocatedExpired = allocations.find((a) => a.batchId === bExpired.id);
      const allocatedQuarantined = allocations.find((a) => a.batchId === bQuarantined.id);

      if (allocatedExpired) {
        throw new Error(`CRITICAL: Expired batch was allocated: ${JSON.stringify(allocatedExpired)}`);
      }
      if (allocatedQuarantined) {
        throw new Error(`CRITICAL: Quarantined batch was allocated: ${JSON.stringify(allocatedQuarantined)}`);
      }

      // Verify FEFO order: 15 from 7-day lot first, then 10 from 60-day lot
      if (allocations[0].batchId !== bExp7.id || allocations[0].allocatedQuantity !== 15) {
        throw new Error(`FEFO priority failure on first layer: ${JSON.stringify(allocations[0])}`);
      }
      if (allocations[1].batchId !== bExp60.id || allocations[1].allocatedQuantity !== 10) {
        throw new Error(`FEFO priority failure on second layer: ${JSON.stringify(allocations[1])}`);
      }

      return 'FEFO picking verified: Expired (yesterday) and quarantined lots strictly excluded; 15 units picked from 7-day lot and 10 from 60-day lot.';
    }
  );

  await runProbe(
    'T5-P5.2',
    'Reserved Floor Protection',
    'Inventory Reserved Stock Floor Protection Against Negative Available Balance',
    async () => {
      const { db, inventorySvc, client } = await createFreshIsolatedEnvironment();

      const wh = await client.createWarehouse({
        warehouseCode: 'WH-FLOOR-01',
        name: 'Floor Protection Warehouse',
        address: 'Dhaka',
        city: 'Dhaka'
      });

      const item = await client.createItem({
        sku: 'SKU-FLOOR-01',
        name: 'Floor Protection Item',
        category: 'Test',
        costPrice: 20.0,
        sellingPrice: 40.0
      });

      // 50 units on hand
      await inventorySvc.adjustStock(
        {
          itemId: item.id,
          warehouseId: wh.id,
          adjustmentType: 'NEW_BALANCE',
          quantity: 50,
          reason: 'CYCLE_COUNT_ADJUSTMENT'
        },
        db
      );

      // Reserve 30 units (e.g. from an unfulfilled shipment)
      await db.execute(
        'UPDATE inventory_stock SET quantity_reserved = 30 WHERE item_id = ? AND warehouse_id = ?',
        [item.id, wh.id]
      );

      // Attempt 1: Adjust on-hand stock down to 20 (less than quantity_reserved 30)
      // SQLite CHECK (quantity_reserved <= quantity_on_hand) must trigger and reject!
      let subReservedAdjustmentRejected = false;
      try {
        await inventorySvc.adjustStock(
          {
            itemId: item.id,
            warehouseId: wh.id,
            adjustmentType: 'NEW_BALANCE',
            quantity: 20, // 20 on hand < 30 reserved -> violates invariant!
            reason: 'CYCLE_COUNT_ADJUSTMENT'
          },
          db
        );
      } catch (err: any) {
        subReservedAdjustmentRejected = true;
      }

      // Attempt 2: Negative on-hand delta (reduce by 60 when 50 on-hand)
      let negativeBalanceRejected = false;
      try {
        await inventorySvc.adjustStock(
          {
            itemId: item.id,
            warehouseId: wh.id,
            adjustmentType: 'DELTA',
            quantity: -60,
            reason: 'ADJUSTMENT_WRITE_OFF'
          },
          db
        );
      } catch (err: any) {
        negativeBalanceRejected = err.message.includes('cannot be negative');
      }

      if (!subReservedAdjustmentRejected || !negativeBalanceRejected) {
        throw new Error(
          `Floor protection failure: subReservedRej=${subReservedAdjustmentRejected}, negBalRej=${negativeBalanceRejected}`
        );
      }

      // Confirm stock remains 50 on-hand, 30 reserved
      const stock = await client.getItemTotalStock(item.id, wh.id);
      if (stock.onHand !== 50 || stock.reserved !== 30) {
        throw new Error(`Stock state corrupted: ${JSON.stringify(stock)}`);
      }

      return 'Floor protection verified: adjustments violating quantity_reserved <= quantity_on_hand or negative stock strictly blocked.';
    }
  );

  await runProbe(
    'T5-P5.3',
    'Disaster Recovery',
    'JSON Backup Snapshot Checksum Tamper Defense & Pre-Restore Rollback Safety',
    async () => {
      const { db, backupSvc, client, inventorySvc } = await createFreshIsolatedEnvironment();

      const wh = await client.createWarehouse({
        warehouseCode: 'WH-BACKUP-01',
        name: 'Disaster Recovery Hub',
        address: 'Dhaka',
        city: 'Dhaka'
      });

      const item = await client.createItem({
        sku: 'SKU-BACKUP-01',
        name: 'Disaster Recovery Item',
        category: 'Test',
        costPrice: 50.0,
        sellingPrice: 100.0
      });

      await inventorySvc.adjustStock(
        {
          itemId: item.id,
          warehouseId: wh.id,
          adjustmentType: 'NEW_BALANCE',
          quantity: 120,
          reason: 'CYCLE_COUNT_ADJUSTMENT'
        },
        db
      );

      // Export authentic snapshot
      const cleanJson = await backupSvc.exportJsonSnapshot(db);

      // Parse and tamper with the data payload (change quantity from 120 to 9999)
      const parsed = JSON.parse(cleanJson);
      parsed.data.inventory_stock[0].quantity_on_hand = 9999;
      const tamperedJson = JSON.stringify(parsed);

      let tamperRejected = false;
      try {
        await backupSvc.importJsonSnapshot(tamperedJson, db);
      } catch (err: any) {
        tamperRejected = err.message.includes('Checksum mismatch') || err.message.includes('Corrupted backup');
      }

      if (!tamperRejected) {
        throw new Error('Tampered JSON backup snapshot was accepted without checksum error!');
      }

      // Verify that active database was safely preserved with original 120 units
      const stock = await client.getItemTotalStock(item.id, wh.id);
      if (stock.onHand !== 120) {
        throw new Error(`Database corrupted after rejected restore: expected 120 units, got ${stock.onHand}`);
      }

      return 'Disaster recovery verified: SHA-256 tamper defense triggered, unauthorized mutation rejected, and active database safely rolled back to 120 units.';
    }
  );

  await runProbe(
    'T5-P5.4',
    'Disaster Recovery',
    'Raw SQLite Binary Blob Header Signature & Corrupted Stream Rejection',
    async () => {
      const { db, backupSvc, client, inventorySvc } = await createFreshIsolatedEnvironment();

      const wh = await client.createWarehouse({
        warehouseCode: 'WH-BIN-01',
        name: 'Binary Recovery Warehouse',
        address: 'Dhaka',
        city: 'Dhaka'
      });

      const item = await client.createItem({
        sku: 'SKU-BIN-01',
        name: 'Binary Recovery Item',
        category: 'Test',
        costPrice: 80.0,
        sellingPrice: 150.0
      });

      await inventorySvc.adjustStock(
        {
          itemId: item.id,
          warehouseId: wh.id,
          adjustmentType: 'NEW_BALANCE',
          quantity: 75,
          reason: 'CYCLE_COUNT_ADJUSTMENT'
        },
        db
      );

      // Export authentic binary blob
      const validBlob = await backupSvc.exportBinaryBlob(db);

      // 1. Corrupt magic bytes header: replace "SQLite format 3" with "CORRUPTED BYTES"
      const corruptedHeaderBlob = new Uint8Array(validBlob);
      const badHeader = new TextEncoder().encode('CORRUPTED BYTES');
      corruptedHeaderBlob.set(badHeader, 0);

      let headerRejection = false;
      try {
        await backupSvc.importBinaryBlob(corruptedHeaderBlob, db);
      } catch (err: any) {
        headerRejection = err.message.includes('missing header signature');
      }

      if (!headerRejection) {
        throw new Error('Corrupted SQLite binary header was accepted without rejection!');
      }

      // 2. Corrupt internal pages (mutate bytes 100..140 to break page 1 b-tree header and PRAGMA integrity_check)
      const corruptedPageBlob = new Uint8Array(validBlob);
      for (let i = 100; i < 140; i++) {
        corruptedPageBlob[i] = 0x00;
      }

      let integrityRejection = false;
      try {
        await backupSvc.importBinaryBlob(corruptedPageBlob, db);
      } catch (err: any) {
        integrityRejection = true;
      }

      if (!integrityRejection) {
        throw new Error('Corrupted internal pages were accepted without integrity failure!');
      }

      // Verify active state remains 75 units intact
      const stock = await client.getItemTotalStock(item.id, wh.id);
      if (stock.onHand !== 75) {
        throw new Error(`Database corrupted after rejected binary import: expected 75, got ${stock.onHand}`);
      }

      return 'Binary SQLite blob verified: Invalid header magic bytes and page corruption strictly rejected; active database preserved with zero data corruption.';
    }
  );

  // ==========================================================================
  // FINAL SCORECARD & SUMMARY
  // ==========================================================================
  console.log(`\n${colors.bold}${colors.cyan}========================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}          TIER 5 ADVERSARIAL DOMAIN SCORECARD                          ${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}========================================================================${colors.reset}`);

  const totalProbes = probeResults.length;
  const passedProbes = probeResults.filter((p) => p.passed).length;
  const failedProbes = totalProbes - passedProbes;
  const totalDuration = probeResults.reduce((acc, p) => acc + p.durationMs, 0);

  console.log(`  Total Probes Executed: ${totalProbes}`);
  console.log(`  Passed Probes:         ${colors.green}${passedProbes}${colors.reset}`);
  console.log(`  Failed Probes:         ${failedProbes > 0 ? colors.red + failedProbes : colors.green + '0'}${colors.reset}`);
  console.log(`  Total Time:            ${totalDuration}ms`);
  console.log(`${colors.bold}${colors.cyan}========================================================================${colors.reset}\n`);

  if (failedProbes > 0) {
    console.log(`${colors.red}${colors.bold}✘ [FAIL] ${failedProbes} Tier 5 Adversarial probe(s) failed!${colors.reset}`);
    process.exit(1);
  } else {
    console.log(`${colors.green}${colors.bold}✨ [SUCCESS] All ${totalProbes} Tier 5 Adversarial probes PASSED with 100% domain robustness!${colors.reset}\n`);
    process.exit(0);
  }
}

// Execute immediately when run directly
runAllTier5Probes().catch((err) => {
  console.error('Fatal test harness execution error:', err);
  process.exit(1);
});
