#!/usr/bin/env node
/**
 * Probaho ERP - Milestone 2 Adversarial Stress & Negative Boundary Probe Suite
 * Target: tests/adversarial-m2-negative-invariants.ts
 *
 * EMPIRICAL CHALLENGER: challenger_m2_2
 *
 * Objectives:
 * 1. Over-delivery attempts: receiving more items than ordered (single, multi-batch, rejected counts, and DB check constraint).
 * 2. Premature goods receipt: receiving goods against `draft`, `pending_approval`, `approved`, `cancelled`, and `received` POs.
 * 3. Illegal cancellation: attempting to cancel a PO that has registered goods receipt (partial or full, accepted or rejected).
 * 4. Empty PO creation: attempting to create a PO with 0 items, negative quantity, negative unit cost, missing foreign keys.
 * 5. Duplicate vendor codes: attempting to insert conflicting supplier_code records and duplicate SKU/bin records.
 * 6. Extreme numerical inputs: negative quantities, negative lead times, out-of-range ratings (>5.0 or <0.0), invalid stocks.
 */

import { DatabaseService } from '../src/services/db.ts';
import { SupplierService } from '../src/services/supplierService.ts';
import { ProcurementService } from '../src/services/procurementService.ts';
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

interface ProbeResult {
  category: string;
  probeId: string;
  name: string;
  passed: boolean;
  expectedBehavior: string;
  observedError?: string;
  durationMs: number;
}

const probeResults: ProbeResult[] = [];

async function runNegativeProbe(
  category: string,
  probeId: string,
  name: string,
  expectedBehavior: string,
  fn: () => Promise<void>
): Promise<boolean> {
  const start = Date.now();
  let caughtError: Error | null = null;

  try {
    await fn();
  } catch (err: any) {
    caughtError = err;
  }

  const durationMs = Date.now() - start;

  if (caughtError) {
    // Probe succeeded because the invalid operation was rejected
    const errorSnippet = caughtError.message || String(caughtError);
    console.log(`  ${colors.green}✔ REJECTED [${probeId}] ${name}${colors.reset} ${colors.gray}(${durationMs}ms)${colors.reset}`);
    console.log(`     ${colors.gray}Expected rejection: ${expectedBehavior}${colors.reset}`);
    console.log(`     ${colors.cyan}Observed error:     ${errorSnippet}${colors.reset}`);
    probeResults.push({
      category,
      probeId,
      name,
      passed: true,
      expectedBehavior,
      observedError: errorSnippet,
      durationMs
    });
    return true;
  } else {
    // Probe failed because the invalid operation unexpectedly SUCCEEDED!
    console.error(`  ${colors.red}✘ UNEXPECTED SUCCESS (BUG FOUND!) [${probeId}] ${name}${colors.reset}`);
    console.error(`     ${colors.red}CRITICAL INVARIANT BREACH: The operation was expected to fail with "${expectedBehavior}", but succeeded without throwing!${colors.reset}`);
    probeResults.push({
      category,
      probeId,
      name,
      passed: false,
      expectedBehavior,
      observedError: 'NONE (Operation succeeded unexpectedly)',
      durationMs
    });
    return false;
  }
}

async function runEmpiricalSuite() {
  console.log(`\n${colors.bold}${colors.magenta}========================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.magenta}   PROBAHO ERP — M2 EMPIRICAL ADVERSARIAL STRESS & INVARIANT PROBE      ${colors.reset}`);
  console.log(`${colors.bold}${colors.magenta}   Agent: challenger_m2_2 | Negative Boundary Invariant Verification   ${colors.reset}`);
  console.log(`${colors.bold}${colors.magenta}========================================================================${colors.reset}\n`);

  const db = new DatabaseService(':memory:');
  await db.initialize();

  const supplierService = SupplierService.getInstance();
  const procurementService = ProcurementService.getInstance();
  const client = new ERPTestClient(db);

  // Setup valid baseline entities
  console.log(`${colors.gray}--- Seeding baseline valid entities ---${colors.reset}`);
  const baseSupplier = await supplierService.createSupplier(
    {
      supplierCode: 'SUP-ADV-BASE-01',
      name: 'Baseline Adversarial Supply Co',
      phone: '+8801700112233',
      address: '12 Test Lane, Tejgaon',
      city: 'Dhaka',
      rating: 4.8,
      leadTimeDays: 5,
      paymentTermsDays: 30
    },
    db
  );

  const baseWh = await client.createWarehouse({
    warehouseCode: 'WH-ADV-BASE',
    name: 'Adversarial Test Hub',
    address: 'Warehouse Block 9, Tongi',
    city: 'Gazipur'
  });

  const baseBin = await client.createLocation({
    warehouseId: baseWh.id,
    zone: 'Z-PROBE',
    aisle: 'A1',
    rack: 'R1',
    shelf: 'S1',
    binCode: 'BIN-ADV-01'
  });

  const baseItemA = await procurementService.createItem(
    {
      sku: 'SKU-ADV-BEARING',
      name: 'Adversarial Heavy Duty Bearing',
      category: 'Mechanical',
      costPrice: 45.0,
      sellingPrice: 75.0,
      minStockAlert: 10,
      maxStock: 500
    },
    db
  );

  const baseItemB = await procurementService.createItem(
    {
      sku: 'SKU-ADV-VALVE',
      name: 'Adversarial High Pressure Valve',
      category: 'Pneumatics',
      costPrice: 120.0,
      sellingPrice: 190.0,
      minStockAlert: 5,
      maxStock: 200
    },
    db
  );

  console.log(`${colors.green}Baseline setup complete: Supplier=${baseSupplier.supplier_code}, WH=${baseWh.warehouse_code}, Items=[${baseItemA.sku}, ${baseItemB.sku}]${colors.reset}\n`);

  // ==========================================================================
  // SECTION 1: OVER-DELIVERY PROBES
  // ==========================================================================
  console.log(`${colors.bold}${colors.yellow}1. ATTACK VECTOR: OVER-DELIVERY ATTEMPTS${colors.reset}`);

  // Create an ordered PO with 20 bearings and 10 valves
  const poForOverDelivery = await procurementService.createPurchaseOrder(
    {
      poNumber: 'PO-ADV-OD-001',
      supplierId: baseSupplier.id,
      targetWarehouseId: baseWh.id,
      items: [
        { itemId: baseItemA.id, sku: baseItemA.sku, quantityOrdered: 20, unitCost: 45.0 },
        { itemId: baseItemB.id, sku: baseItemB.sku, quantityOrdered: 10, unitCost: 120.0 }
      ]
    },
    db
  );
  await procurementService.updatePOStatus(poForOverDelivery.id, 'pending_approval', 'test', db);
  await procurementService.updatePOStatus(poForOverDelivery.id, 'approved', 'admin', db);
  await procurementService.updatePOStatus(poForOverDelivery.id, 'ordered', 'buyer', db);

  await runNegativeProbe(
    'Over-Delivery',
    'OD-01',
    'Single GRN excessive quantity (> ordered)',
    'Should reject receiving 25 units when only 20 ordered',
    async () => {
      await procurementService.receiveGoodsAgainstPO(
        {
          poId: poForOverDelivery.id,
          warehouseId: baseWh.id,
          receivedBy: 'Adversarial Inspector',
          items: [
            {
              poItemId: poForOverDelivery.items[0].id,
              itemId: baseItemA.id,
              binId: baseBin.id,
              quantityAccepted: 25,
              quantityRejected: 0
            }
          ]
        },
        db
      );
    }
  );

  // Receive partial 15 units legitimately
  await procurementService.receiveGoodsAgainstPO(
    {
      poId: poForOverDelivery.id,
      warehouseId: baseWh.id,
      receivedBy: 'Adversarial Inspector',
      items: [
        {
          poItemId: poForOverDelivery.items[0].id,
          itemId: baseItemA.id,
          binId: baseBin.id,
          quantityAccepted: 15,
          quantityRejected: 0
        }
      ]
    },
    db
  );

  await runNegativeProbe(
    'Over-Delivery',
    'OD-02',
    'Cumulative cross-GRN excessive quantity (15 received + 6 attempted > 20)',
    'Should reject receiving 6 units when only 5 remaining',
    async () => {
      await procurementService.receiveGoodsAgainstPO(
        {
          poId: poForOverDelivery.id,
          warehouseId: baseWh.id,
          receivedBy: 'Adversarial Inspector',
          items: [
            {
              poItemId: poForOverDelivery.items[0].id,
              itemId: baseItemA.id,
              binId: baseBin.id,
              quantityAccepted: 6,
              quantityRejected: 0
            }
          ]
        },
        db
      );
    }
  );

  await runNegativeProbe(
    'Over-Delivery',
    'OD-03',
    'Over-delivery via combined accepted + rejected quantity exceeding balance',
    'Should reject 3 accepted + 5 rejected when only 5 remaining',
    async () => {
      await procurementService.receiveGoodsAgainstPO(
        {
          poId: poForOverDelivery.id,
          warehouseId: baseWh.id,
          receivedBy: 'Adversarial Inspector',
          items: [
            {
              poItemId: poForOverDelivery.items[0].id,
              itemId: baseItemA.id,
              binId: baseBin.id,
              quantityAccepted: 3,
              quantityRejected: 5
            }
          ]
        },
        db
      );
    }
  );

  await runNegativeProbe(
    'Over-Delivery',
    'OD-04',
    'Direct SQLite CHECK constraint enforcement on purchase_order_items',
    'Should reject direct SQL UPDATE setting quantity_received > quantity_ordered',
    async () => {
      await db.execute(
        'UPDATE purchase_order_items SET quantity_received = 999 WHERE id = ?',
        [poForOverDelivery.items[0].id]
      );
    }
  );

  // ==========================================================================
  // SECTION 2: PREMATURE GOODS RECEIPT PROBES
  // ==========================================================================
  console.log(`\n${colors.bold}${colors.yellow}2. ATTACK VECTOR: PREMATURE GOODS RECEIPT ATTEMPTS${colors.reset}`);

  // Create a PO in draft
  const draftPO = await procurementService.createPurchaseOrder(
    {
      poNumber: 'PO-ADV-DRAFT-001',
      supplierId: baseSupplier.id,
      targetWarehouseId: baseWh.id,
      items: [{ itemId: baseItemA.id, sku: baseItemA.sku, quantityOrdered: 50, unitCost: 45.0 }]
    },
    db
  );

  await runNegativeProbe(
    'Premature Receipt',
    'PR-01',
    'Receive goods against a DRAFT purchase order',
    'Should reject GRN against PO in draft status',
    async () => {
      await procurementService.receiveGoodsAgainstPO(
        {
          poId: draftPO.id,
          warehouseId: baseWh.id,
          receivedBy: 'Premature Inspector',
          items: [
            {
              poItemId: draftPO.items[0].id,
              itemId: baseItemA.id,
              binId: baseBin.id,
              quantityAccepted: 10
            }
          ]
        },
        db
      );
    }
  );

  // Move to pending_approval
  await procurementService.updatePOStatus(draftPO.id, 'pending_approval', 'test', db);

  await runNegativeProbe(
    'Premature Receipt',
    'PR-02',
    'Receive goods against a PENDING_APPROVAL purchase order',
    'Should reject GRN against PO in pending_approval status',
    async () => {
      await procurementService.receiveGoodsAgainstPO(
        {
          poId: draftPO.id,
          warehouseId: baseWh.id,
          receivedBy: 'Premature Inspector',
          items: [
            {
              poItemId: draftPO.items[0].id,
              itemId: baseItemA.id,
              binId: baseBin.id,
              quantityAccepted: 10
            }
          ]
        },
        db
      );
    }
  );

  // Move to approved
  await procurementService.updatePOStatus(draftPO.id, 'approved', 'manager', db);

  await runNegativeProbe(
    'Premature Receipt',
    'PR-03',
    'Receive goods against an APPROVED (but not yet ordered) purchase order',
    'Should reject GRN against PO in approved status before order dispatch',
    async () => {
      await procurementService.receiveGoodsAgainstPO(
        {
          poId: draftPO.id,
          warehouseId: baseWh.id,
          receivedBy: 'Premature Inspector',
          items: [
            {
              poItemId: draftPO.items[0].id,
              itemId: baseItemA.id,
              binId: baseBin.id,
              quantityAccepted: 10
            }
          ]
        },
        db
      );
    }
  );

  // Cancel the draftPO
  await procurementService.updatePOStatus(draftPO.id, 'cancelled', 'admin', db);

  await runNegativeProbe(
    'Premature Receipt',
    'PR-04',
    'Receive goods against a CANCELLED purchase order',
    'Should reject GRN against cancelled PO',
    async () => {
      await procurementService.receiveGoodsAgainstPO(
        {
          poId: draftPO.id,
          warehouseId: baseWh.id,
          receivedBy: 'Premature Inspector',
          items: [
            {
              poItemId: draftPO.items[0].id,
              itemId: baseItemA.id,
              binId: baseBin.id,
              quantityAccepted: 10
            }
          ]
        },
        db
      );
    }
  );

  await runNegativeProbe(
    'Premature Receipt',
    'PR-05',
    'Receive goods against a non-existent PO ID',
    'Should throw error when PO does not exist',
    async () => {
      await procurementService.receiveGoodsAgainstPO(
        {
          poId: 'po-non-existent-99999',
          warehouseId: baseWh.id,
          receivedBy: 'Ghost Inspector',
          items: [
            {
              poItemId: 'poi-ghost-1',
              itemId: baseItemA.id,
              quantityAccepted: 5
            }
          ]
        },
        db
      );
    }
  );

  // ==========================================================================
  // SECTION 3: ILLEGAL CANCELLATION PROBES
  // ==========================================================================
  console.log(`\n${colors.bold}${colors.yellow}3. ATTACK VECTOR: ILLEGAL CANCELLATION ATTEMPTS${colors.reset}`);

  // Test 3.1: Cancelling PO that has registered accepted receipt
  await runNegativeProbe(
    'Illegal Cancellation',
    'IC-01',
    'Cancel PO with registered partial receipt (accepted goods)',
    'Should reject cancelling PO that has accepted items',
    async () => {
      await procurementService.updatePOStatus(poForOverDelivery.id, 'cancelled', 'unauthorized', db);
    }
  );

  // Test 3.2: Cancelling PO that has registered rejected goods (damages logged)
  const poDamagedOnly = await procurementService.createPurchaseOrder(
    {
      poNumber: 'PO-ADV-DMG-001',
      supplierId: baseSupplier.id,
      targetWarehouseId: baseWh.id,
      items: [{ itemId: baseItemA.id, sku: baseItemA.sku, quantityOrdered: 10, unitCost: 45.0 }]
    },
    db
  );
  await procurementService.updatePOStatus(poDamagedOnly.id, 'pending_approval', 'test', db);
  await procurementService.updatePOStatus(poDamagedOnly.id, 'approved', 'admin', db);
  await procurementService.updatePOStatus(poDamagedOnly.id, 'ordered', 'buyer', db);

  // Receive with 0 accepted, 2 rejected (damaged)
  await procurementService.receiveGoodsAgainstPO(
    {
      poId: poDamagedOnly.id,
      warehouseId: baseWh.id,
      receivedBy: 'QC Inspector',
      items: [
        {
          poItemId: poDamagedOnly.items[0].id,
          itemId: baseItemA.id,
          quantityAccepted: 0,
          quantityRejected: 2,
          rejectionReason: 'Broken in transit'
        }
      ]
    },
    db
  );

  await runNegativeProbe(
    'Illegal Cancellation',
    'IC-02',
    'Cancel PO that registered rejected/damaged items',
    'Should reject cancelling PO that has logged inspection activity',
    async () => {
      await procurementService.updatePOStatus(poDamagedOnly.id, 'cancelled', 'bad_actor', db);
    }
  );

  // Test 3.3: Invalid status jump: from ordered directly to received without GRN
  await runNegativeProbe(
    'Illegal Cancellation',
    'IC-03',
    'Illegal transition bypass: jump ordered -> draft',
    'Should reject backward transition from ordered to draft',
    async () => {
      // Create new clean ordered PO
      const cleanPO = await procurementService.createPurchaseOrder(
        {
          poNumber: 'PO-ADV-CLEAN-001',
          supplierId: baseSupplier.id,
          targetWarehouseId: baseWh.id,
          items: [{ itemId: baseItemA.id, sku: baseItemA.sku, quantityOrdered: 5, unitCost: 45.0 }]
        },
        db
      );
      await procurementService.updatePOStatus(cleanPO.id, 'pending_approval', 'test', db);
      await procurementService.updatePOStatus(cleanPO.id, 'approved', 'admin', db);
      await procurementService.updatePOStatus(cleanPO.id, 'ordered', 'buyer', db);

      // Attempt to jump back to draft
      await procurementService.updatePOStatus(cleanPO.id, 'draft', 'hacker', db);
    }
  );

  // ==========================================================================
  // SECTION 4: EMPTY PO & LINE ITEM QUANTITY PROBES
  // ==========================================================================
  console.log(`\n${colors.bold}${colors.yellow}4. ATTACK VECTOR: EMPTY PO & LINE ITEM INTEGRITY${colors.reset}`);

  await runNegativeProbe(
    'Empty PO & Items',
    'PO-01',
    'Create PO with empty line items array []',
    'Should reject PO creation without items',
    async () => {
      await procurementService.createPurchaseOrder(
        {
          poNumber: 'PO-ADV-EMPTY-001',
          supplierId: baseSupplier.id,
          targetWarehouseId: baseWh.id,
          items: []
        },
        db
      );
    }
  );

  await runNegativeProbe(
    'Empty PO & Items',
    'PO-02',
    'Create PO with line item quantity = 0',
    'Should reject line item with zero quantity',
    async () => {
      await procurementService.createPurchaseOrder(
        {
          poNumber: 'PO-ADV-ZERO-001',
          supplierId: baseSupplier.id,
          targetWarehouseId: baseWh.id,
          items: [{ itemId: baseItemA.id, sku: baseItemA.sku, quantityOrdered: 0, unitCost: 45.0 }]
        },
        db
      );
    }
  );

  await runNegativeProbe(
    'Empty PO & Items',
    'PO-03',
    'Create PO with line item negative quantity (-10)',
    'Should reject line item with negative quantity',
    async () => {
      await procurementService.createPurchaseOrder(
        {
          poNumber: 'PO-ADV-NEG-001',
          supplierId: baseSupplier.id,
          targetWarehouseId: baseWh.id,
          items: [{ itemId: baseItemA.id, sku: baseItemA.sku, quantityOrdered: -10, unitCost: 45.0 }]
        },
        db
      );
    }
  );

  await runNegativeProbe(
    'Empty PO & Items',
    'PO-04',
    'Create PO with negative unit cost (-45.00)',
    'Should reject negative unit cost',
    async () => {
      await procurementService.createPurchaseOrder(
        {
          poNumber: 'PO-ADV-NEG-COST-001',
          supplierId: baseSupplier.id,
          targetWarehouseId: baseWh.id,
          items: [{ itemId: baseItemA.id, sku: baseItemA.sku, quantityOrdered: 5, unitCost: -45.0 }]
        },
        db
      );
    }
  );

  await runNegativeProbe(
    'Empty PO & Items',
    'PO-05',
    'Create PO with missing / non-existent supplierId',
    'Should reject PO with invalid supplier foreign key',
    async () => {
      await procurementService.createPurchaseOrder(
        {
          poNumber: 'PO-ADV-BAD-SUP-001',
          supplierId: 'sup-non-existent-999',
          targetWarehouseId: baseWh.id,
          items: [{ itemId: baseItemA.id, sku: baseItemA.sku, quantityOrdered: 5, unitCost: 45.0 }]
        },
        db
      );
    }
  );

  await runNegativeProbe(
    'Empty PO & Items',
    'PO-06',
    'Direct SQLite CHECK constraint: insert purchase_order_items with quantity_ordered = 0',
    'Should fail DB CHECK (quantity_ordered > 0)',
    async () => {
      await db.execute(
        `INSERT INTO purchase_order_items (
          id, po_id, item_id, sku, quantity_ordered, quantity_received, quantity_rejected, unit_cost, subtotal
        ) VALUES ('poi-adv-illegal-0', '${poForOverDelivery.id}', '${baseItemA.id}', '${baseItemA.sku}', 0, 0, 0, 45.0, 0.0)`
      );
    }
  );

  // ==========================================================================
  // SECTION 5: DUPLICATE VENDOR CODES & KEY UNIQUENESS PROBES
  // ==========================================================================
  console.log(`\n${colors.bold}${colors.yellow}5. ATTACK VECTOR: DUPLICATE VENDOR CODES & KEY UNIQUENESS${colors.reset}`);

  await runNegativeProbe(
    'Duplicate Keys',
    'DUP-01',
    'Register supplier with duplicate supplier_code',
    'Should reject inserting supplier with conflicting supplier_code',
    async () => {
      await supplierService.createSupplier(
        {
          supplierCode: baseSupplier.supplier_code, // Identical code
          name: 'Conflicting Imposter Supplier Ltd',
          phone: '+8801999999999',
          address: '44 Illegal Way, Dhaka'
        },
        db
      );
    }
  );

  await runNegativeProbe(
    'Duplicate Keys',
    'DUP-02',
    'Update supplier code to clash with another existing supplier',
    'Should reject update producing duplicate supplier_code',
    async () => {
      // First create a second supplier
      const secondSupplier = await supplierService.createSupplier(
        {
          supplierCode: 'SUP-ADV-SECOND-02',
          name: 'Second Legit Supplier',
          phone: '+8801777777777',
          address: '77 Clean Street, Chittagong'
        },
        db
      );

      // Attempt to update its code to match baseSupplier's code
      await supplierService.updateSupplier(
        secondSupplier.id,
        {
          supplierCode: baseSupplier.supplier_code
        },
        db
      );
    }
  );

  await runNegativeProbe(
    'Duplicate Keys',
    'DUP-03',
    'Register supplier with blank / whitespace-only supplier_code',
    'Should reject empty supplier_code',
    async () => {
      await supplierService.createSupplier(
        {
          supplierCode: '   ',
          name: 'Blank Code Supplier',
          phone: '+8801888888888',
          address: '88 Void Ave'
        },
        db
      );
    }
  );

  await runNegativeProbe(
    'Duplicate Keys',
    'DUP-04',
    'Create product catalog item with duplicate SKU',
    'Should reject item with conflicting unique SKU',
    async () => {
      await procurementService.createItem(
        {
          sku: baseItemA.sku, // Conflicting SKU
          name: 'Clone Item',
          category: 'Mechanical',
          costPrice: 10.0,
          sellingPrice: 20.0
        },
        db
      );
    }
  );

  await runNegativeProbe(
    'Duplicate Keys',
    'DUP-05',
    'Create warehouse location with duplicate (warehouse_id, bin_code)',
    'Should reject duplicate bin_code within same warehouse',
    async () => {
      await client.createLocation({
        warehouseId: baseWh.id,
        zone: 'Z-PROBE',
        aisle: 'A1',
        rack: 'R1',
        shelf: 'S1',
        binCode: baseBin.bin_code // Conflicting bin code
      });
    }
  );

  // ==========================================================================
  // SECTION 6: EXTREME NUMERICAL INPUTS & OUT-OF-RANGE BOUNDARIES
  // ==========================================================================
  console.log(`\n${colors.bold}${colors.yellow}6. ATTACK VECTOR: EXTREME NUMERICAL INPUTS & BOUNDARY VIOLATIONS${colors.reset}`);

  await runNegativeProbe(
    'Extreme Numbers',
    'NUM-01',
    'Supplier with negative lead time (leadTimeDays: -5)',
    'Should reject negative lead time',
    async () => {
      await supplierService.createSupplier(
        {
          supplierCode: 'SUP-ADV-NEG-LEAD',
          name: 'Negative Lead Time Supplier',
          phone: '+8801555555555',
          address: '99 Time Warp St',
          leadTimeDays: -5
        },
        db
      );
    }
  );

  await runNegativeProbe(
    'Extreme Numbers',
    'NUM-02',
    'Supplier with negative payment terms (paymentTermsDays: -15)',
    'Should reject negative payment terms',
    async () => {
      await supplierService.createSupplier(
        {
          supplierCode: 'SUP-ADV-NEG-TERMS',
          name: 'Negative Terms Supplier',
          phone: '+8801555555555',
          address: '99 Negative Terms Way',
          paymentTermsDays: -15
        },
        db
      );
    }
  );

  await runNegativeProbe(
    'Extreme Numbers',
    'NUM-03',
    'Supplier with rating > 5.0 (rating: 6.5)',
    'Should reject rating greater than 5.0',
    async () => {
      await supplierService.createSupplier(
        {
          supplierCode: 'SUP-ADV-HIGH-RATE',
          name: 'Super High Rating Supplier',
          phone: '+8801555555555',
          address: '77 Over the Moon',
          rating: 6.5
        },
        db
      );
    }
  );

  await runNegativeProbe(
    'Extreme Numbers',
    'NUM-04',
    'Supplier with rating < 0.0 (rating: -0.5)',
    'Should reject rating less than 0.0',
    async () => {
      await supplierService.createSupplier(
        {
          supplierCode: 'SUP-ADV-NEG-RATE',
          name: 'Sub-Zero Rating Supplier',
          phone: '+8801555555555',
          address: '0 Absolute Zero Way',
          rating: -0.5
        },
        db
      );
    }
  );

  await runNegativeProbe(
    'Extreme Numbers',
    'NUM-05',
    'Direct SQLite CHECK constraint: insert supplier with rating = 99.0',
    'Should fail DB CHECK (rating >= 0.0 AND rating <= 5.0)',
    async () => {
      await db.execute(
        `INSERT INTO suppliers (
          id, supplier_code, name, phone, address, rating
        ) VALUES ('sup-adv-sql-99', 'SUP-SQL-99', 'SQL Injected Rate', '017', 'Addr', 99.0)`
      );
    }
  );

  await runNegativeProbe(
    'Extreme Numbers',
    'NUM-06',
    'Catalog item with negative cost price (costPrice: -25.00)',
    'Should reject negative cost price',
    async () => {
      await procurementService.createItem(
        {
          sku: 'SKU-ADV-NEG-COST',
          name: 'Negative Cost Widget',
          category: 'Misc',
          costPrice: -25.0,
          sellingPrice: 10.0
        },
        db
      );
    }
  );

  await runNegativeProbe(
    'Extreme Numbers',
    'NUM-07',
    'Catalog item with negative selling price (sellingPrice: -100.00)',
    'Should reject negative selling price',
    async () => {
      await procurementService.createItem(
        {
          sku: 'SKU-ADV-NEG-SELL',
          name: 'Negative Selling Widget',
          category: 'Misc',
          costPrice: 10.0,
          sellingPrice: -100.0
        },
        db
      );
    }
  );

  await runNegativeProbe(
    'Extreme Numbers',
    'NUM-08',
    'Catalog item maxStock < minStockAlert (min: 100, max: 20)',
    'Should reject max stock less than min stock alert',
    async () => {
      await procurementService.createItem(
        {
          sku: 'SKU-ADV-INVERT-STOCK',
          name: 'Inverted Stock Widget',
          category: 'Misc',
          costPrice: 10.0,
          sellingPrice: 20.0,
          minStockAlert: 100,
          maxStock: 20
        },
        db
      );
    }
  );

  await runNegativeProbe(
    'Extreme Numbers',
    'NUM-09',
    'Goods receipt with negative quantity accepted (-5)',
    'Should reject negative accepted quantity in GRN',
    async () => {
      await procurementService.receiveGoodsAgainstPO(
        {
          poId: poForOverDelivery.id,
          warehouseId: baseWh.id,
          receivedBy: 'Adversarial Inspector',
          items: [
            {
              poItemId: poForOverDelivery.items[1].id,
              itemId: baseItemB.id,
              binId: baseBin.id,
              quantityAccepted: -5,
              quantityRejected: 0
            }
          ]
        },
        db
      );
    }
  );

  await runNegativeProbe(
    'Extreme Numbers',
    'NUM-10',
    'Goods receipt with negative quantity rejected (-2)',
    'Should reject negative rejected quantity in GRN',
    async () => {
      await procurementService.receiveGoodsAgainstPO(
        {
          poId: poForOverDelivery.id,
          warehouseId: baseWh.id,
          receivedBy: 'Adversarial Inspector',
          items: [
            {
              poItemId: poForOverDelivery.items[1].id,
              itemId: baseItemB.id,
              binId: baseBin.id,
              quantityAccepted: 2,
              quantityRejected: -2
            }
          ]
        },
        db
      );
    }
  );

  // ==========================================================================
  // FINAL SCORECARD & VERDICT
  // ==========================================================================
  console.log(`\n${colors.bold}${colors.magenta}========================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.magenta}      ADVERSARIAL STRESS & NEGATIVE PROBE VERIFICATION SUMMARY          ${colors.reset}`);
  console.log(`${colors.bold}${colors.magenta}========================================================================${colors.reset}`);

  const totalProbes = probeResults.length;
  const passedProbes = probeResults.filter((p) => p.passed).length;
  const failedProbes = probeResults.filter((p) => !p.passed).length;

  console.log(`  Total Adversarial Probes: ${totalProbes}`);
  console.log(`  Properly Rejected (PASS): ${colors.green}${passedProbes}${colors.reset}`);
  console.log(`  Unexpectedly Accepted (FAIL): ${failedProbes > 0 ? colors.red + failedProbes + colors.reset : colors.green + '0' + colors.reset}`);
  console.log(`========================================================================`);

  // Breakdown by category
  const categories = [...new Set(probeResults.map((p) => p.category))];
  for (const cat of categories) {
    const catProbes = probeResults.filter((p) => p.category === cat);
    const catPassed = catProbes.filter((p) => p.passed).length;
    console.log(`  • ${cat.padEnd(25)}: ${catPassed}/${catProbes.length} properly blocked`);
  }
  console.log(`========================================================================\n`);

  if (failedProbes > 0) {
    console.error(`${colors.bold}${colors.red}❌ CHALLENGE FAILED: ${failedProbes} illegal operations bypassed system defenses!${colors.reset}\n`);
    process.exit(1);
  } else {
    console.log(`${colors.bold}${colors.green}✨ VERDICT: CONFIRMED — All ${totalProbes} adversarial probes were rejected with zero bypasses!${colors.reset}\n`);
    process.exit(0);
  }
}

runEmpiricalSuite().catch((err) => {
  console.error('Fatal execution error in adversarial probe suite:', err);
  process.exit(1);
});
