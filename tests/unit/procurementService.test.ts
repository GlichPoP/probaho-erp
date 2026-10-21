/**
 * Unit & Integration Test Suite for ProcurementService
 * Target File: tests/unit/procurementService.test.ts
 * Milestone 2 - Suppliers & Procurement Core Domain
 *
 * Test Matrix:
 * - TC-PROC-01: Create product catalog item with comprehensive attributes and defaults
 * - TC-PROC-02: Enforce UNIQUE constraint on SKU and barcode
 * - TC-PROC-03: Validate numeric constraints on items (negative prices and max stock < min stock)
 * - TC-PROC-04: Create PO with multiple line items, calculating subtotals, tax, and total amount
 * - TC-PROC-05: Reject PO creation with empty line items or non-positive quantities
 * - TC-PROC-06: Reject PO creation when supplier or warehouse do not exist
 * - TC-PROC-07: Transition PO through approval gates (draft -> pending_approval -> approved -> ordered)
 * - TC-PROC-08: Strictly reject invalid status jumps (e.g. draft directly to ordered or received)
 * - TC-PROC-09: Allow cancellation of draft/pending/approved, but block cancellation after goods receipt
 * - TC-PROC-10: Advance PO status to partially_received on partial delivery and increment stock
 * - TC-PROC-11: Advance PO status to received when remaining items are fulfilled
 * - TC-PROC-12: Quality inspection with damaged items (log rejected quantity and reason without adding damaged units to stock)
 * - TC-PROC-13: Strictly reject over-delivery beyond PO remaining ordered quantity during GRN inspection
 * - TC-PROC-14: Reject receiving goods against un-ordered purchase orders (draft or approved)
 */

import { describe, it, expect, beforeEach, runSuites } from '../harness/test-runner.ts';
import { TestDatabaseService } from '../harness/test-db.ts';
import { ProcurementService } from '../../src/services/procurementService.ts';

let db: TestDatabaseService;
let service: ProcurementService;

let supplier: any;
let warehouse: any;
let binA: any;
let binB: any;
let item1: any;
let item2: any;

describe('Unit & Integration Test: ProcurementService (POs & Goods Receipts)', () => {
  beforeEach(async () => {
    db = new TestDatabaseService(':memory:');
    await db.initialize();
    service = new ProcurementService();

    // 1. Seed base supplier
    await db.execute(
      `INSERT INTO suppliers (
        id, supplier_code, name, contact_person, phone, address, city, country,
        payment_terms_days, lead_time_days, rating, performance_score, total_pos_issued, total_pos_fulfilled, is_active
      ) VALUES ('sup-test-01', 'SUP-M2-001', 'Prime Global Industrial Ltd', 'Zakir Hossain', '+8801722000001', 'Gazipur Industrial Belt', 'Gazipur', 'Bangladesh', 30, 7, 5.0, 100.0, 0, 0, 1)`
    );
    const supRows = await db.query('SELECT * FROM suppliers WHERE id = ?', ['sup-test-01']);
    supplier = supRows[0];

    // 2. Seed base warehouse and locations/bins
    await db.execute(
      `INSERT INTO warehouses (
        id, warehouse_code, name, address, city, is_default, is_active
      ) VALUES ('wh-test-01', 'WH-CENTRAL', 'Central Distribution Hub', 'Hemayetpur, Savar', 'Dhaka', 1, 1)`
    );
    const whRows = await db.query('SELECT * FROM warehouses WHERE id = ?', ['wh-test-01']);
    warehouse = whRows[0];

    await db.execute(
      `INSERT INTO warehouse_locations (
        id, warehouse_id, zone, aisle, rack, shelf, bin_code, is_active
      ) VALUES ('bin-test-01', 'wh-test-01', 'Zone A', 'A1', 'R1', 'S1', 'WH-C-A1-R1-S1', 1)`
    );
    const binRows = await db.query('SELECT * FROM warehouse_locations WHERE id = ?', ['bin-test-01']);
    binA = binRows[0];

    await db.execute(
      `INSERT INTO warehouse_locations (
        id, warehouse_id, zone, aisle, rack, shelf, bin_code, is_active
      ) VALUES ('bin-test-02', 'wh-test-01', 'Zone B', 'B1', 'R1', 'S1', 'WH-C-B1-R1-S1', 1)`
    );
    const binBRows = await db.query('SELECT * FROM warehouse_locations WHERE id = ?', ['bin-test-02']);
    binB = binBRows[0];

    // 3. Seed base items
    item1 = await service.createItem(
      {
        sku: 'SKU-BEARING-20MM',
        barcode: 'BAR-8899001',
        name: 'Precision Steel Bearings 20mm',
        category: 'Mechanical',
        unitOfMeasure: 'pcs',
        costPrice: 15.00,
        sellingPrice: 28.00,
        minStockAlert: 20,
        safetyStock: 10,
        maxStock: 500
      },
      db
    );

    item2 = await service.createItem(
      {
        sku: 'SKU-ORING-50MM',
        barcode: 'BAR-8899002',
        name: 'Industrial Rubber O-Ring 50mm',
        category: 'Hardware',
        unitOfMeasure: 'pcs',
        costPrice: 3.50,
        sellingPrice: 7.00,
        minStockAlert: 50,
        safetyStock: 25,
        maxStock: 2000
      },
      db
    );
  });

  // ===========================================================================
  // SECTION 1: PRODUCT & SKU CATALOG CRUD & VALIDATIONS
  // ===========================================================================
  it('TC-PROC-01: Should create product catalog item with comprehensive attributes and defaults', async () => {
    const item = await service.createItem(
      {
        sku: 'SKU-MOTOR-1HP',
        name: 'Electric Induction Motor 1HP',
        category: 'Electrical',
        costPrice: 120.00,
        sellingPrice: 195.00
      },
      db
    );

    expect(item).toBeDefined();
    expect(item.sku).toBe('SKU-MOTOR-1HP');
    expect(item.name).toBe('Electric Induction Motor 1HP');
    expect(item.category).toBe('Electrical');
    expect(item.cost_price).toBe(120.00);
    expect(item.selling_price).toBe(195.00);
    expect(item.unit_of_measure).toBe('pcs');
    expect(item.valuation_method).toBe('MOVING_AVERAGE');
    expect(item.min_stock_alert).toBe(10);
    expect(item.safety_stock).toBe(5);
    expect(item.max_stock).toBe(1000);
    expect(item.is_active).toBe(1);
  });

  it('TC-PROC-02: Should reject duplicate SKU or barcode to ensure catalog uniqueness', async () => {
    await expect(async () => {
      await service.createItem(
        {
          sku: 'SKU-BEARING-20MM',
          name: 'Duplicate Bearing',
          category: 'Mechanical',
          costPrice: 15.00,
          sellingPrice: 25.00
        },
        db
      );
    }).toReject('UNIQUE constraint failed');

    await expect(async () => {
      await service.createItem(
        {
          sku: 'SKU-NEW-DIFF',
          barcode: 'BAR-8899001',
          name: 'Duplicate Barcode Item',
          category: 'Hardware',
          costPrice: 10.00,
          sellingPrice: 20.00
        },
        db
      );
    }).toReject('UNIQUE constraint failed');
  });

  it('TC-PROC-03: Should validate numeric constraints on items (negative prices and max stock < min stock)', async () => {
    await expect(async () => {
      await service.createItem(
        {
          sku: 'SKU-NEG-COST',
          name: 'Negative Cost',
          category: 'Test',
          costPrice: -10.00,
          sellingPrice: 20.00
        },
        db
      );
    }).toReject('Cost price cannot be negative');

    await expect(async () => {
      await service.createItem(
        {
          sku: 'SKU-BAD-STOCKS',
          name: 'Bad Stock Bounds',
          category: 'Test',
          costPrice: 10.00,
          sellingPrice: 20.00,
          minStockAlert: 100,
          maxStock: 50
        },
        db
      );
    }).toReject('cannot be less than min stock alert');
  });

  // ===========================================================================
  // SECTION 2: PURCHASE ORDER CREATION & FINANCIAL CALCULATIONS
  // ===========================================================================
  it('TC-PROC-04: Should create PO with multiple line items, calculating subtotals, tax, and total amount', async () => {
    const po = await service.createPurchaseOrder(
      {
        poNumber: 'PO-202610-001',
        supplierId: supplier.id,
        targetWarehouseId: warehouse.id,
        paymentTerms: 'Net 45',
        shippingCost: 50.00,
        notes: 'Monthly replenishment order',
        items: [
          {
            itemId: item1.id,
            quantityOrdered: 100,
            unitCost: 15.00,
            taxRate: 5.0
          },
          {
            itemId: item2.id,
            quantityOrdered: 400,
            unitCost: 3.50,
            taxRate: 0.0
          }
        ]
      },
      db
    );

    expect(po).toBeDefined();
    expect(po.po_number).toBe('PO-202610-001');
    expect(po.status).toBe('draft');
    expect(po.items).toHaveLength(2);

    expect(po.subtotal).toBe(2900.00);
    expect(po.tax_amount).toBe(75.00);
    expect(po.shipping_cost).toBe(50.00);
    expect(po.total_amount).toBe(3025.00);
  });

  it('TC-PROC-05: Should reject PO creation with empty line items or non-positive quantities', async () => {
    await expect(async () => {
      await service.createPurchaseOrder(
        {
          poNumber: 'PO-EMPTY',
          supplierId: supplier.id,
          targetWarehouseId: warehouse.id,
          items: []
        },
        db
      );
    }).toReject('A purchase order must include at least one valid line item');

    await expect(async () => {
      await service.createPurchaseOrder(
        {
          poNumber: 'PO-ZERO-QTY',
          supplierId: supplier.id,
          targetWarehouseId: warehouse.id,
          items: [{ itemId: item1.id, quantityOrdered: 0, unitCost: 15.00 }]
        },
        db
      );
    }).toReject('Quantity ordered must be greater than zero');

    await expect(async () => {
      await service.createPurchaseOrder(
        {
          poNumber: 'PO-NEG-COST',
          supplierId: supplier.id,
          targetWarehouseId: warehouse.id,
          items: [{ itemId: item1.id, quantityOrdered: 10, unitCost: -5.00 }]
        },
        db
      );
    }).toReject('Unit cost cannot be negative');
  });

  it('TC-PROC-06: Should reject PO creation when supplier or warehouse do not exist', async () => {
    await expect(async () => {
      await service.createPurchaseOrder(
        {
          poNumber: 'PO-NO-SUP',
          supplierId: 'non-existent-supplier-id',
          targetWarehouseId: warehouse.id,
          items: [{ itemId: item1.id, quantityOrdered: 10, unitCost: 15.00 }]
        },
        db
      );
    }).toReject('Supplier with ID non-existent-supplier-id not found');

    await expect(async () => {
      await service.createPurchaseOrder(
        {
          poNumber: 'PO-NO-WH',
          supplierId: supplier.id,
          targetWarehouseId: 'non-existent-warehouse-id',
          items: [{ itemId: item1.id, quantityOrdered: 10, unitCost: 15.00 }]
        },
        db
      );
    }).toReject('Target warehouse with ID non-existent-warehouse-id not found');
  });

  // ===========================================================================
  // SECTION 3: PURCHASE ORDER STATUS WORKFLOW STATE MACHINE
  // ===========================================================================
  it('TC-PROC-07: Should transition PO status through sequential approval gates (draft -> pending_approval -> approved -> ordered)', async () => {
    const po = await service.createPurchaseOrder(
      {
        poNumber: 'PO-STATE-01',
        supplierId: supplier.id,
        targetWarehouseId: warehouse.id,
        items: [{ itemId: item1.id, quantityOrdered: 50, unitCost: 15.00 }]
      },
      db
    );

    expect(po.status).toBe('draft');

    const s1 = await service.updatePOStatus(po.id, 'pending_approval', 'clerk', db);
    expect(s1.status).toBe('pending_approval');

    const s2 = await service.updatePOStatus(po.id, 'approved', 'manager_tariq', db);
    expect(s2.status).toBe('approved');
    expect(s2.approved_by).toBe('manager_tariq');

    const s3 = await service.updatePOStatus(po.id, 'ordered', 'purchaser', db);
    expect(s3.status).toBe('ordered');

    const supRefreshed = await db.query<{ total_pos_issued: number }>('SELECT total_pos_issued FROM suppliers WHERE id = ?', [supplier.id]);
    expect(supRefreshed[0].total_pos_issued).toBe(1);
  });

  it('TC-PROC-08: Should strictly reject invalid status jumps (e.g. draft directly to ordered or received)', async () => {
    const po = await service.createPurchaseOrder(
      {
        poNumber: 'PO-ILLEGAL-JUMP',
        supplierId: supplier.id,
        targetWarehouseId: warehouse.id,
        items: [{ itemId: item1.id, quantityOrdered: 50, unitCost: 15.00 }]
      },
      db
    );

    await expect(async () => {
      await service.updatePOStatus(po.id, 'ordered', undefined, db);
    }).toReject("cannot move PO from 'draft' to 'ordered'");

    await expect(async () => {
      await service.updatePOStatus(po.id, 'received', undefined, db);
    }).toReject("cannot move PO from 'draft' to 'received'");

    await expect(async () => {
      await service.updatePOStatus(po.id, 'partially_received', undefined, db);
    }).toReject("cannot move PO from 'draft' to 'partially_received'");
  });

  it('TC-PROC-09: Should allow cancellation of draft, pending, or approved PO, but strictly block cancellation after goods receipt', async () => {
    const po1 = await service.createPurchaseOrder(
      {
        poNumber: 'PO-CANCEL-DRAFT',
        supplierId: supplier.id,
        targetWarehouseId: warehouse.id,
        items: [{ itemId: item1.id, quantityOrdered: 10, unitCost: 15.00 }]
      },
      db
    );
    const c1 = await service.updatePOStatus(po1.id, 'cancelled', undefined, db);
    expect(c1.status).toBe('cancelled');

    const po2 = await service.createPurchaseOrder(
      {
        poNumber: 'PO-CANCEL-APPROVED',
        supplierId: supplier.id,
        targetWarehouseId: warehouse.id,
        items: [{ itemId: item1.id, quantityOrdered: 10, unitCost: 15.00 }]
      },
      db
    );
    await service.updatePOStatus(po2.id, 'pending_approval', undefined, db);
    await service.updatePOStatus(po2.id, 'approved', undefined, db);
    const c2 = await service.updatePOStatus(po2.id, 'cancelled', undefined, db);
    expect(c2.status).toBe('cancelled');

    const po3 = await service.createPurchaseOrder(
      {
        poNumber: 'PO-CANCEL-BLOCKED',
        supplierId: supplier.id,
        targetWarehouseId: warehouse.id,
        items: [{ itemId: item1.id, quantityOrdered: 50, unitCost: 15.00 }]
      },
      db
    );
    await service.updatePOStatus(po3.id, 'pending_approval', undefined, db);
    await service.updatePOStatus(po3.id, 'approved', undefined, db);
    await service.updatePOStatus(po3.id, 'ordered', undefined, db);

    await service.receiveGoodsAgainstPO(
      {
        purchaseOrderId: po3.id,
        warehouseId: warehouse.id,
        receivedBy: 'Inspector Jabbar',
        items: [
          {
            poItemId: po3.items[0].id,
            itemId: item1.id,
            binId: binA.id,
            quantityAccepted: 10
          }
        ]
      },
      db
    );

    await expect(async () => {
      await service.updatePOStatus(po3.id, 'cancelled', undefined, db);
    }).toReject('Cannot cancel purchase order: goods receipt has already been registered');
  });

  // ===========================================================================
  // SECTION 4: GOODS RECEIPT NOTE (GRN) INSPECTION & ATOMIC STOCK INCREMENTS
  // ===========================================================================
  it('TC-PROC-10: Should advance PO status to partially_received on partial delivery and increment stock', async () => {
    const po = await service.createPurchaseOrder(
      {
        poNumber: 'PO-GRN-PARTIAL',
        supplierId: supplier.id,
        targetWarehouseId: warehouse.id,
        items: [{ itemId: item1.id, quantityOrdered: 100, unitCost: 15.00 }]
      },
      db
    );

    await service.updatePOStatus(po.id, 'pending_approval', undefined, db);
    await service.updatePOStatus(po.id, 'approved', undefined, db);
    await service.updatePOStatus(po.id, 'ordered', undefined, db);

    const receipt = await service.receiveGoodsAgainstPO(
      {
        receiptNumber: 'GRN-202610-P1',
        purchaseOrderId: po.id,
        warehouseId: warehouse.id,
        receivedBy: 'Inspector Jabbar',
        inspectionNotes: 'Initial consignment, 40 bearings verified in good order',
        items: [
          {
            poItemId: po.items[0].id,
            itemId: item1.id,
            binId: binA.id,
            quantityAccepted: 40,
            unitCost: 15.00
          }
        ]
      },
      db
    );

    expect(receipt.poStatus).toBe('partially_received');
    expect(receipt.receiptNumber).toBe('GRN-202610-P1');

    const updatedPo = await service.getPurchaseOrderById(po.id, db);
    expect(updatedPo?.status).toBe('partially_received');
    expect(updatedPo?.items[0].quantity_received).toBe(40);

    const stockRows = await db.query<{ quantity_on_hand: number }>(
      'SELECT quantity_on_hand FROM inventory_stock WHERE item_id = ? AND warehouse_id = ? AND bin_id = ?',
      [item1.id, warehouse.id, binA.id]
    );
    expect(stockRows[0].quantity_on_hand).toBe(40);

    const ledger = await db.query<any>(
      "SELECT * FROM inventory_transactions WHERE transaction_type = 'PO_RECEIPT' AND item_id = ?",
      [item1.id]
    );
    expect(ledger.length).toBe(1);
    expect(ledger[0].quantity_change).toBe(40);
    expect(ledger[0].running_balance_after).toBe(40);
  });

  it('TC-PROC-11: Should advance PO status to received when remaining items are delivered', async () => {
    const po = await service.createPurchaseOrder(
      {
        poNumber: 'PO-GRN-COMPLETE',
        supplierId: supplier.id,
        targetWarehouseId: warehouse.id,
        items: [{ itemId: item1.id, quantityOrdered: 100, unitCost: 15.00 }]
      },
      db
    );

    await service.updatePOStatus(po.id, 'pending_approval', undefined, db);
    await service.updatePOStatus(po.id, 'approved', undefined, db);
    await service.updatePOStatus(po.id, 'ordered', undefined, db);

    await service.receiveGoodsAgainstPO(
      {
        purchaseOrderId: po.id,
        warehouseId: warehouse.id,
        receivedBy: 'Inspector Jabbar',
        items: [{ poItemId: po.items[0].id, itemId: item1.id, binId: binA.id, quantityAccepted: 40 }]
      },
      db
    );

    const receipt2 = await service.receiveGoodsAgainstPO(
      {
        purchaseOrderId: po.id,
        warehouseId: warehouse.id,
        receivedBy: 'Inspector Jabbar',
        items: [{ poItemId: po.items[0].id, itemId: item1.id, binId: binA.id, quantityAccepted: 60 }]
      },
      db
    );

    expect(receipt2.poStatus).toBe('received');

    const completedPo = await service.getPurchaseOrderById(po.id, db);
    expect(completedPo?.status).toBe('received');
    expect(completedPo?.items[0].quantity_received).toBe(100);

    const stockRows = await db.query<{ quantity_on_hand: number }>(
      'SELECT quantity_on_hand FROM inventory_stock WHERE item_id = ? AND warehouse_id = ? AND bin_id = ?',
      [item1.id, warehouse.id, binA.id]
    );
    expect(stockRows[0].quantity_on_hand).toBe(100);

    const supRows = await db.query<{ total_pos_fulfilled: number; performance_score: number }>(
      'SELECT total_pos_fulfilled, performance_score FROM suppliers WHERE id = ?',
      [supplier.id]
    );
    expect(supRows[0].total_pos_fulfilled).toBe(1);
    expect(supRows[0].performance_score).toBe(100.0);
  });

  it('TC-PROC-12: Should handle quality inspection with damaged items (log rejected quantity and reason without adding damaged units to stock)', async () => {
    const po = await service.createPurchaseOrder(
      {
        poNumber: 'PO-GRN-INSPECT-DAMAGED',
        supplierId: supplier.id,
        targetWarehouseId: warehouse.id,
        items: [{ itemId: item1.id, quantityOrdered: 100, unitCost: 15.00 }]
      },
      db
    );

    await service.updatePOStatus(po.id, 'pending_approval', undefined, db);
    await service.updatePOStatus(po.id, 'approved', undefined, db);
    await service.updatePOStatus(po.id, 'ordered', undefined, db);

    const receipt = await service.receiveGoodsAgainstPO(
      {
        receiptNumber: 'GRN-INSPECT-01',
        purchaseOrderId: po.id,
        warehouseId: warehouse.id,
        receivedBy: 'Lead QA Engineer Kamal',
        inspectionNotes: 'Batch LOT-STEEL-2026A inspected. 8 units rejected due to water damage during transit.',
        items: [
          {
            poItemId: po.items[0].id,
            itemId: item1.id,
            binId: binA.id,
            batchNumber: 'LOT-STEEL-2026A',
            expiryDate: '2028-12-31',
            quantityAccepted: 92,
            quantityRejected: 8,
            rejectionReason: 'Surface oxidation & rust'
          }
        ]
      },
      db
    );

    expect(receipt.receiptNumber).toBe('GRN-INSPECT-01');

    const grnItems = await db.query<any>(
      'SELECT * FROM goods_receipt_items WHERE receipt_id = ?',
      [receipt.grnId]
    );
    expect(grnItems.length).toBe(1);
    expect(grnItems[0].quantity_accepted).toBe(92);
    expect(grnItems[0].quantity_rejected).toBe(8);
    expect(grnItems[0].rejection_reason).toBe('Surface oxidation & rust');

    const poItem = await db.query<any>('SELECT * FROM purchase_order_items WHERE id = ?', [po.items[0].id]);
    expect(poItem[0].quantity_received).toBe(92);
    expect(poItem[0].quantity_rejected).toBe(8);

    const stock = await db.query<any>(
      'SELECT quantity_on_hand FROM inventory_stock WHERE item_id = ? AND warehouse_id = ? AND bin_id = ?',
      [item1.id, warehouse.id, binA.id]
    );
    expect(stock[0].quantity_on_hand).toBe(92);

    const batch = await db.query<any>('SELECT * FROM item_batches WHERE batch_number = ?', ['LOT-STEEL-2026A']);
    expect(batch[0].initial_quantity).toBe(92);
    expect(batch[0].current_quantity).toBe(92);
  });

  it('TC-PROC-13: Should strictly reject over-delivery beyond PO remaining ordered quantity during GRN inspection', async () => {
    const po = await service.createPurchaseOrder(
      {
        poNumber: 'PO-OVER-DELIVER-TEST',
        supplierId: supplier.id,
        targetWarehouseId: warehouse.id,
        items: [{ itemId: item1.id, quantityOrdered: 20, unitCost: 15.00 }]
      },
      db
    );

    await service.updatePOStatus(po.id, 'pending_approval', undefined, db);
    await service.updatePOStatus(po.id, 'approved', undefined, db);
    await service.updatePOStatus(po.id, 'ordered', undefined, db);

    await expect(async () => {
      await service.receiveGoodsAgainstPO(
        {
          purchaseOrderId: po.id,
          warehouseId: warehouse.id,
          receivedBy: 'Inspector',
          items: [
            {
              poItemId: po.items[0].id,
              itemId: item1.id,
              binId: binA.id,
              quantityAccepted: 25
            }
          ]
        },
        db
      );
    }).toReject('Received quantity exceeds remaining PO balance');
  });

  it('TC-PROC-14: Should reject receiving goods against un-ordered purchase orders (draft or approved)', async () => {
    const po = await service.createPurchaseOrder(
      {
        poNumber: 'PO-DRAFT-RECEIPT',
        supplierId: supplier.id,
        targetWarehouseId: warehouse.id,
        items: [{ itemId: item1.id, quantityOrdered: 10, unitCost: 15.00 }]
      },
      db
    );

    await expect(async () => {
      await service.receiveGoodsAgainstPO(
        {
          purchaseOrderId: po.id,
          warehouseId: warehouse.id,
          receivedBy: 'Inspector',
          items: [{ poItemId: po.items[0].id, itemId: item1.id, binId: binA.id, quantityAccepted: 10 }]
        },
        db
      );
    }).toReject("Cannot receive goods: PO status is 'draft'");
  });
});

if (process.argv[1]?.includes('procurementService.test.ts')) {
  runSuites().then(res => {
    if (res.failed > 0) process.exit(1);
  });
}
