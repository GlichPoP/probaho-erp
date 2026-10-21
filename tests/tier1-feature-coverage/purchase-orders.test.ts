import { describe, it, expect, beforeEach, runSuites } from '../harness/test-runner.ts';
import { TestDatabaseService } from '../harness/test-db.ts';
import { ERPTestClient } from '../harness/erp-test-client.ts';

let db: TestDatabaseService;
let client: ERPTestClient;
let supplier: any;
let warehouse: any;
let binA: any;
let item1: any;
let item2: any;

describe('Tier 1: Feature Coverage — Purchase Orders & Procurement Workflows', () => {
  beforeEach(async () => {
    db = new TestDatabaseService(':memory:');
    await db.initialize();
    client = new ERPTestClient(db);

    supplier = await client.createSupplier({
      supplierCode: 'SUP-PO-01',
      name: 'Global Raw Materials Ltd',
      contactPerson: 'Zakir Hossain',
      phone: '+8801722000001',
      address: 'Gazipur Industrial Belt'
    });

    warehouse = await client.createWarehouse({
      warehouseCode: 'WH-CENTRAL',
      name: 'Central Distribution Hub',
      address: 'Hemayetpur, Savar',
      city: 'Dhaka',
      isDefault: true
    });

    binA = await client.createLocation({
      warehouseId: warehouse.id,
      zone: 'Zone A',
      aisle: 'A1',
      rack: 'R1',
      shelf: 'S1',
      binCode: 'WH-C-A1-R1-S1'
    });

    item1 = await client.createItem({
      sku: 'SKU-STEEL-BEARING-01',
      name: 'Precision Steel Bearings 20mm',
      category: 'Mechanical',
      costPrice: 15.50,
      sellingPrice: 28.00
    });

    item2 = await client.createItem({
      sku: 'SKU-RUBBER-SEAL-02',
      name: 'Industrial Rubber O-Ring 50mm',
      category: 'Hardware',
      costPrice: 3.20,
      sellingPrice: 7.50
    });
  });

  it('TC1.7: Should create purchase order with line items and auto-calculated financial totals', async () => {
    const po = await client.createPurchaseOrder({
      poNumber: 'PO-202610-001',
      supplierId: supplier.id,
      targetWarehouseId: warehouse.id,
      items: [
        { itemId: item1.id, sku: item1.sku, quantityOrdered: 100, unitCost: 15.00 },
        { itemId: item2.id, sku: item2.sku, quantityOrdered: 500, unitCost: 3.00 }
      ],
      paymentTerms: 'Net 30',
      notes: 'Urgent manufacturing order'
    });

    expect(po).toBeDefined();
    expect(po.po_number).toBe('PO-202610-001');
    expect(po.status).toBe('draft');
    expect(po.items).toHaveLength(2);

    // Subtotal: 100 * 15.00 + 500 * 3.00 = 1500 + 1500 = 3000
    expect(po.subtotal).toBe(3000.00);
    expect(po.total_amount).toBe(3000.00);
  });

  it('TC1.8: Should transition PO status through sequential approval gates (draft -> pending_approval -> approved -> ordered)', async () => {
    const po = await client.createPurchaseOrder({
      poNumber: 'PO-202610-002',
      supplierId: supplier.id,
      targetWarehouseId: warehouse.id,
      items: [{ itemId: item1.id, sku: item1.sku, quantityOrdered: 50, unitCost: 15.00 }]
    });

    expect(po.status).toBe('draft');

    const s1 = await client.updatePurchaseOrderStatus(po.id, 'pending_approval');
    expect(s1.status).toBe('pending_approval');

    const s2 = await client.updatePurchaseOrderStatus(po.id, 'approved');
    expect(s2.status).toBe('approved');

    const s3 = await client.updatePurchaseOrderStatus(po.id, 'ordered');
    expect(s3.status).toBe('ordered');
  });

  it('TC1.9: Should receive goods against PO via GRN with accepted/rejected inspection quantities', async () => {
    const po = await client.createPurchaseOrder({
      poNumber: 'PO-202610-003',
      supplierId: supplier.id,
      targetWarehouseId: warehouse.id,
      items: [{ itemId: item1.id, sku: item1.sku, quantityOrdered: 100, unitCost: 15.00 }]
    });

    await client.updatePurchaseOrderStatus(po.id, 'pending_approval');
    await client.updatePurchaseOrderStatus(po.id, 'approved');
    await client.updatePurchaseOrderStatus(po.id, 'ordered');

    // Deliver 100: 95 accepted, 5 rejected due to surface defect
    const grn = await client.receiveGoods({
      receiptNumber: 'GRN-202610-001',
      poId: po.id,
      warehouseId: warehouse.id,
      receivedBy: 'Inspector Jabbar',
      inspectionNotes: '5 units rusted upon arrival',
      items: [
        {
          poItemId: po.items[0].id,
          itemId: item1.id,
          batchNumber: 'LOT-STEEL-2026A',
          expiryDate: '2028-12-31',
          binId: binA.id,
          quantityReceived: 100,
          quantityAccepted: 95,
          quantityRejected: 5,
          rejectionReason: 'Surface Rust'
        }
      ]
    });

    expect(grn.receiptNumber).toBe('GRN-202610-001');

    // Verify PO items received & rejected counts
    const refreshedPo = await client.getPurchaseOrder(po.id);
    expect(refreshedPo.items[0].quantity_received).toBe(95);
    expect(refreshedPo.items[0].quantity_rejected).toBe(5);

    // Verify stock incremented by accepted quantity (95)
    const stock = await client.getStockLevel(item1.id, warehouse.id, binA.id);
    expect(stock.quantity_on_hand).toBe(95);
  });

  it('TC1.10: Should advance PO status to partially_received when partial delivery arrives', async () => {
    const po = await client.createPurchaseOrder({
      poNumber: 'PO-202610-004',
      supplierId: supplier.id,
      targetWarehouseId: warehouse.id,
      items: [{ itemId: item1.id, sku: item1.sku, quantityOrdered: 200, unitCost: 15.00 }]
    });

    await client.updatePurchaseOrderStatus(po.id, 'pending_approval');
    await client.updatePurchaseOrderStatus(po.id, 'approved');
    await client.updatePurchaseOrderStatus(po.id, 'ordered');

    // First delivery arrives: 80 units of 200
    const receipt = await client.receiveGoods({
      receiptNumber: 'GRN-202610-PART-1',
      poId: po.id,
      warehouseId: warehouse.id,
      receivedBy: 'Inspector Jabbar',
      items: [
        {
          poItemId: po.items[0].id,
          itemId: item1.id,
          binId: binA.id,
          quantityReceived: 80,
          quantityAccepted: 80
        }
      ]
    });

    expect(receipt.poStatus).toBe('partially_received');

    const updatedPo = await client.getPurchaseOrder(po.id);
    expect(updatedPo.status).toBe('partially_received');
    expect(updatedPo.items[0].quantity_received).toBe(80);
  });

  it('TC1.11: Should advance PO status to received when remaining items are fulfilled', async () => {
    const po = await client.createPurchaseOrder({
      poNumber: 'PO-202610-005',
      supplierId: supplier.id,
      targetWarehouseId: warehouse.id,
      items: [{ itemId: item1.id, sku: item1.sku, quantityOrdered: 100, unitCost: 15.00 }]
    });

    await client.updatePurchaseOrderStatus(po.id, 'pending_approval');
    await client.updatePurchaseOrderStatus(po.id, 'approved');
    await client.updatePurchaseOrderStatus(po.id, 'ordered');

    // Partial receipt 1: 40 units
    await client.receiveGoods({
      receiptNumber: 'GRN-202610-MULTI-1',
      poId: po.id,
      warehouseId: warehouse.id,
      receivedBy: 'Inspector Jabbar',
      items: [
        {
          poItemId: po.items[0].id,
          itemId: item1.id,
          binId: binA.id,
          quantityReceived: 40,
          quantityAccepted: 40
        }
      ]
    });

    // Partial receipt 2: remaining 60 units
    const receipt2 = await client.receiveGoods({
      receiptNumber: 'GRN-202610-MULTI-2',
      poId: po.id,
      warehouseId: warehouse.id,
      receivedBy: 'Inspector Jabbar',
      items: [
        {
          poItemId: po.items[0].id,
          itemId: item1.id,
          binId: binA.id,
          quantityReceived: 60,
          quantityAccepted: 60
        }
      ]
    });

    expect(receipt2.poStatus).toBe('received');

    const completedPo = await client.getPurchaseOrder(po.id);
    expect(completedPo.status).toBe('received');
    expect(completedPo.items[0].quantity_received).toBe(100);

    // Total stock in warehouse = 40 + 60 = 100
    const total = await client.getItemTotalStock(item1.id, warehouse.id);
    expect(total.onHand).toBe(100);
  });

  it('TC1.12: Should allow cancellation of draft or approved PO, but strictly block cancellation after goods receipt', async () => {
    // Draft cancellation
    const draftPo = await client.createPurchaseOrder({
      poNumber: 'PO-202610-CANCEL-1',
      supplierId: supplier.id,
      targetWarehouseId: warehouse.id,
      items: [{ itemId: item1.id, sku: item1.sku, quantityOrdered: 20, unitCost: 15.00 }]
    });
    const cancelled = await client.updatePurchaseOrderStatus(draftPo.id, 'cancelled');
    expect(cancelled.status).toBe('cancelled');

    // Cancellation blocked after receiving
    const poWithReceipt = await client.createPurchaseOrder({
      poNumber: 'PO-202610-CANCEL-2',
      supplierId: supplier.id,
      targetWarehouseId: warehouse.id,
      items: [{ itemId: item1.id, sku: item1.sku, quantityOrdered: 50, unitCost: 15.00 }]
    });
    await client.updatePurchaseOrderStatus(poWithReceipt.id, 'pending_approval');
    await client.updatePurchaseOrderStatus(poWithReceipt.id, 'approved');
    await client.updatePurchaseOrderStatus(poWithReceipt.id, 'ordered');

    await client.receiveGoods({
      receiptNumber: 'GRN-202610-CANCEL-TEST',
      poId: poWithReceipt.id,
      warehouseId: warehouse.id,
      receivedBy: 'Inspector Jabbar',
      items: [{ poItemId: poWithReceipt.items[0].id, itemId: item1.id, binId: binA.id, quantityReceived: 10, quantityAccepted: 10 }]
    });

    await expect(async () => {
      await client.updatePurchaseOrderStatus(poWithReceipt.id, 'cancelled');
    }).toReject('Cannot cancel purchase order: goods receipt has already been registered.');
  });
});

if (process.argv[1]?.includes('purchase-orders.test.ts')) {
  runSuites().then(res => {
    if (res.failed > 0) process.exit(1);
  });
}
