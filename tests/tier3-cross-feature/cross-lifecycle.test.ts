import { describe, it, expect, beforeEach, runSuites } from '../harness/test-runner.ts';
import { TestDatabaseService } from '../harness/test-db.ts';
import { ERPTestClient } from '../harness/erp-test-client.ts';

let db: TestDatabaseService;
let client: ERPTestClient;

describe('Tier 3: Cross-Feature Combinations & Full Supply Chain Lifecycles', () => {
  beforeEach(async () => {
    db = new TestDatabaseService(':memory:');
    await db.initialize();
    client = new ERPTestClient(db);
  });

  it('TC3.1: Should execute full end-to-end operational cycle: PO receipt -> stock increment -> transfer -> shipment dispatch -> RTO restock with audit trail', async () => {
    // 1. Supplier Setup
    const supplier = await client.createSupplier({
      supplierCode: 'SUP-E2E-01',
      name: 'Prime Industrial Components Ltd',
      contactPerson: 'Sultan Mahmud',
      phone: '+8801711223344',
      email: 'sales@primeindustrial.com',
      address: 'Plot 10, BSCIC Industrial Estate, Gazipur',
      city: 'Gazipur'
    });

    // 2. Warehouses and Bins Setup
    const centralWh = await client.createWarehouse({
      warehouseCode: 'WH-CENTRAL-HUB',
      name: 'Dhaka Central Logistics Hub',
      address: 'Hemayetpur, Savar',
      city: 'Dhaka',
      isDefault: true
    });

    const regionalWh = await client.createWarehouse({
      warehouseCode: 'WH-REGIONAL-HUB',
      name: 'Chittagong Regional Distribution Depot',
      address: 'Agrabad Access Road',
      city: 'Chittagong'
    });

    const centralBin = await client.createLocation({
      warehouseId: centralWh.id,
      zone: 'Zone Bulk',
      aisle: 'A1',
      rack: 'R1',
      shelf: 'S1',
      binCode: 'CEN-BULK-01'
    });

    const regionalBin = await client.createLocation({
      warehouseId: regionalWh.id,
      zone: 'Zone Pick',
      aisle: 'P1',
      rack: 'R1',
      shelf: 'S1',
      binCode: 'REG-PICK-01'
    });

    // 3. Product Catalog
    const product = await client.createItem({
      sku: 'SKU-INVERTER-3KW',
      name: 'Solar Hybrid Inverter 3KW',
      category: 'Renewable Energy',
      costPrice: 220.00,
      sellingPrice: 350.00
    });

    // 4. Procurement & PO Issuance (100 units @ 220)
    const po = await client.createPurchaseOrder({
      poNumber: 'PO-E2E-CYCLE-001',
      supplierId: supplier.id,
      targetWarehouseId: centralWh.id,
      items: [{ itemId: product.id, sku: product.sku, quantityOrdered: 100, unitCost: 220.00 }]
    });

    await client.updatePurchaseOrderStatus(po.id, 'pending_approval');
    await client.updatePurchaseOrderStatus(po.id, 'approved');
    await client.updatePurchaseOrderStatus(po.id, 'ordered');

    // 5. Goods Receipt Note (GRN) Inspection: 95 accepted, 5 rejected
    const grn = await client.receiveGoods({
      receiptNumber: 'GRN-E2E-001',
      poId: po.id,
      warehouseId: centralWh.id,
      receivedBy: 'Inspector Jabbar',
      inspectionNotes: '5 cartons damaged during vendor transport',
      items: [
        {
          poItemId: po.items[0].id,
          itemId: product.id,
          batchNumber: 'LOT-INV-2026-B1',
          expiryDate: '2030-12-31',
          binId: centralBin.id,
          quantityReceived: 100,
          quantityAccepted: 95,
          quantityRejected: 5,
          rejectionReason: 'Damaged Casing',
          unitCost: 220.00
        }
      ]
    });

    expect(grn.poStatus).toBe('partially_received');

    // Check Central Hub stock balance = 95
    const stockStage1 = await client.getItemTotalStock(product.id, centralWh.id);
    expect(stockStage1.onHand).toBe(95);

    // 6. Inter-Warehouse Transfer: 40 units from Central Hub to Regional Hub
    const transfer = await client.createTransfer({
      transferNumber: 'TR-E2E-TRANSFER-01',
      sourceWarehouseId: centralWh.id,
      destWarehouseId: regionalWh.id,
      requestedBy: 'Chittagong Hub Lead',
      items: [
        {
          itemId: product.id,
          sourceBinId: centralBin.id,
          destBinId: regionalBin.id,
          quantityRequested: 40
        }
      ]
    });

    // Dispatch transfer
    await client.dispatchTransfer(transfer.id, 'Driver Harun');

    // Central Hub stock drops from 95 to 55
    const stockStage2Central = await client.getItemTotalStock(product.id, centralWh.id);
    expect(stockStage2Central.onHand).toBe(55);

    // Regional Hub stock is still 0 while in-transit
    const stockStage2Regional = await client.getItemTotalStock(product.id, regionalWh.id);
    expect(stockStage2Regional.onHand).toBe(0);

    // Receive transfer at Regional Hub
    await client.receiveTransfer(
      transfer.id,
      [{ lineId: transfer.items[0].id, quantityReceived: 40 }],
      'Chittagong Receiving Clerk'
    );

    // Regional Hub stock now 40
    const stockStage3Regional = await client.getItemTotalStock(product.id, regionalWh.id);
    expect(stockStage3Regional.onHand).toBe(40);

    // Total system on-hand remains 55 + 40 = 95
    const totalSystemStock = await client.getItemTotalStock(product.id);
    expect(totalSystemStock.onHand).toBe(95);

    // 7. Outbound Customer Fulfillment: Ship 15 units from Regional Hub
    const courier = await client.createCourier('Steadfast Express', '+880961234567');
    const shipment = await client.createShipment({
      shipmentNumber: 'SHP-E2E-CUST-001',
      orderReference: 'ORD-SALES-771',
      sourceWarehouseId: regionalWh.id,
      customerName: 'Karnaphuli Trading Ltd',
      customerPhone: '+8801819998877',
      customerAddress: 'Jubilee Road',
      destinationCity: 'Chittagong',
      courierName: courier.name,
      items: [{ itemId: product.id, binId: regionalBin.id, quantity: 15, unitPrice: 350.00 }]
    });

    // Dispatch shipment
    await client.dispatchShipment(shipment.id, 'ST-TRK-77100');

    // Regional Hub stock drops to 40 - 15 = 25
    const stockStage4Regional = await client.getItemTotalStock(product.id, regionalWh.id);
    expect(stockStage4Regional.onHand).toBe(25);

    // 8. Delivery Exception -> Return-to-Origin (RTO)
    await client.updateShipmentStatus(shipment.id, 'in_transit');
    await client.updateShipmentStatus(shipment.id, 'return_to_origin', 'Customer business closed temporarily');

    // Staff inspects and restocks 15 units back into Regional Hub bin
    const rtoResult = await client.processRTO(shipment.id, 'restocked', regionalBin.id);
    expect(rtoResult.status).toBe('rto_received');
    expect(rtoResult.rto_disposition).toBe('restocked');

    // Regional Hub stock restored to 25 + 15 = 40!
    const stockFinalRegional = await client.getItemTotalStock(product.id, regionalWh.id);
    expect(stockFinalRegional.onHand).toBe(40);

    // Total system stock restored exactly to initial accepted 95 (55 + 40)!
    const finalSystemStock = await client.getItemTotalStock(product.id);
    expect(finalSystemStock.onHand).toBe(95);

    // 9. Complete Audit Trail Verification
    const auditLogs = await client.getInventoryTransactions();
    expect(auditLogs.length).toBe(5);

    const eventTypes = auditLogs.map((l: any) => l.transaction_type);
    expect(eventTypes).toContain('PO_RECEIPT');
    expect(eventTypes).toContain('TRANSFER_OUT');
    expect(eventTypes).toContain('TRANSFER_IN');
    expect(eventTypes).toContain('FULFILLMENT_PICK');
    expect(eventTypes).toContain('RETURN_RESTOCK');
  });

  it('TC3.2: Should handle multi-item cross-warehouse workflow with damaged RTO scrap write-off', async () => {
    const sup = await client.createSupplier({
      supplierCode: 'SUP-E2E-02',
      name: 'Electronics Import House',
      contactPerson: 'Monir',
      phone: '+8801711333333',
      address: 'Motijheel'
    });

    const wh = await client.createWarehouse({
      warehouseCode: 'WH-DEPOT-SCRAP',
      name: 'Scrap Test Hub',
      address: 'Tongi',
      city: 'Gazipur'
    });

    const bin = await client.createLocation({
      warehouseId: wh.id,
      zone: 'Zone 1',
      aisle: 'A1',
      rack: 'R1',
      shelf: 'S1',
      binCode: 'BIN-S1'
    });

    const item = await client.createItem({
      sku: 'SKU-GLASS-DISPLAY',
      name: 'LCD Display Unit 15 inch',
      category: 'Electronics',
      costPrice: 50.00,
      sellingPrice: 90.00
    });

    // Seed 30 units
    await db.execute(
      "INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved) VALUES ('stk-scrap-1', ?, ?, ?, 30, 0)",
      [item.id, wh.id, bin.id]
    );

    const courier = await client.createCourier('RedX Logistics', '+880961111222');
    const shipment = await client.createShipment({
      shipmentNumber: 'SHP-SCRAP-001',
      orderReference: 'ORD-SCRAP-1',
      sourceWarehouseId: wh.id,
      customerName: 'Buyer',
      customerPhone: '+8801700000088',
      customerAddress: 'Mirpur',
      destinationCity: 'Dhaka',
      courierName: courier.name,
      items: [{ itemId: item.id, binId: bin.id, quantity: 10, unitPrice: 90.00 }]
    });

    await client.dispatchShipment(shipment.id, 'REDX-TRACK-001');

    // Stock on hand drops from 30 to 20
    const stockAfterDispatch = await client.getItemTotalStock(item.id, wh.id);
    expect(stockAfterDispatch.onHand).toBe(20);

    // Courier reports parcel crushed during transit -> RTO
    await client.updateShipmentStatus(shipment.id, 'return_to_origin', 'Parcel crushed in road transit');

    // Process as damaged_writeoff
    const rtoScrap = await client.processRTO(shipment.id, 'damaged_writeoff');
    expect(rtoScrap.status).toBe('rto_received');
    expect(rtoScrap.rto_disposition).toBe('damaged_writeoff');

    // Stock on hand remains 20 (NOT restocked because goods are damaged)
    const stockFinal = await client.getItemTotalStock(item.id, wh.id);
    expect(stockFinal.onHand).toBe(20);

    // Verify scrap write-off audit entry
    const logs = await client.getInventoryTransactions(shipment.shipment_number);
    const writeOffLog = logs.find((l: any) => l.transaction_type === 'ADJUSTMENT_WRITE_OFF');
    expect(writeOffLog).toBeDefined();
  });

  it('TC3.3: Should handle split-batch goods receipt into multiple bins with partial transfers and shipments', async () => {
    const sup = await client.createSupplier({
      supplierCode: 'SUP-SPLIT-01',
      name: 'Split Batch Supplier',
      contactPerson: 'Arif',
      phone: '+8801700000077',
      address: 'Gazipur'
    });

    const wh1 = await client.createWarehouse({
      warehouseCode: 'WH-SPLIT-1',
      name: 'Hub Alpha',
      address: 'Tongi',
      city: 'Gazipur'
    });

    const wh2 = await client.createWarehouse({
      warehouseCode: 'WH-SPLIT-2',
      name: 'Hub Beta',
      address: 'Mymensingh Rd',
      city: 'Gazipur'
    });

    const binA = await client.createLocation({
      warehouseId: wh1.id,
      zone: 'Zone A',
      aisle: 'A1',
      rack: 'R1',
      shelf: 'S1',
      binCode: 'BIN-ALPHA-1'
    });

    const binB = await client.createLocation({
      warehouseId: wh2.id,
      zone: 'Zone B',
      aisle: 'B1',
      rack: 'R1',
      shelf: 'S1',
      binCode: 'BIN-BETA-1'
    });

    const item = await client.createItem({
      sku: 'SKU-SPLIT-CABLE',
      name: 'Cat6 Network Cable 305m',
      category: 'Networking',
      costPrice: 40.00,
      sellingPrice: 70.00
    });

    // PO for 50 units
    const po = await client.createPurchaseOrder({
      poNumber: 'PO-SPLIT-01',
      supplierId: sup.id,
      targetWarehouseId: wh1.id,
      items: [{ itemId: item.id, sku: item.sku, quantityOrdered: 50, unitCost: 40.00 }]
    });

    await client.updatePurchaseOrderStatus(po.id, 'pending_approval');
    await client.updatePurchaseOrderStatus(po.id, 'approved');
    await client.updatePurchaseOrderStatus(po.id, 'ordered');

    // Receive full 50
    await client.receiveGoods({
      receiptNumber: 'GRN-SPLIT-1',
      poId: po.id,
      warehouseId: wh1.id,
      receivedBy: 'Inspector',
      items: [{
        poItemId: po.items[0].id,
        itemId: item.id,
        batchNumber: 'LOT-CABLE-01',
        binId: binA.id,
        quantityReceived: 50,
        quantityAccepted: 50
      }]
    });

    // Transfer 20 to Hub Beta
    const transfer = await client.createTransfer({
      transferNumber: 'TR-SPLIT-01',
      sourceWarehouseId: wh1.id,
      destWarehouseId: wh2.id,
      requestedBy: 'Beta Manager',
      items: [{ itemId: item.id, sourceBinId: binA.id, destBinId: binB.id, quantityRequested: 20 }]
    });

    await client.dispatchTransfer(transfer.id);
    await client.receiveTransfer(transfer.id, [{ lineId: transfer.items[0].id, quantityReceived: 20 }]);

    // Hub Alpha has 30, Hub Beta has 20
    expect((await client.getItemTotalStock(item.id, wh1.id)).onHand).toBe(30);
    expect((await client.getItemTotalStock(item.id, wh2.id)).onHand).toBe(20);

    // Ship 10 from Hub Beta
    const courier = await client.createCourier('Paperfly', '+880960000000');
    const shipment = await client.createShipment({
      shipmentNumber: 'SHP-SPLIT-01',
      orderReference: 'ORD-SPLIT-1',
      sourceWarehouseId: wh2.id,
      customerName: 'IT Firm',
      customerPhone: '+8801800000000',
      customerAddress: 'City Center',
      destinationCity: 'Gazipur',
      courierName: courier.name,
      items: [{ itemId: item.id, binId: binB.id, quantity: 10, unitPrice: 70.00 }]
    });

    await client.dispatchShipment(shipment.id, 'FLY-TRK-01');

    // Hub Beta now has 10 on hand
    expect((await client.getItemTotalStock(item.id, wh2.id)).onHand).toBe(10);
    // Total system has 30 (Alpha) + 10 (Beta) = 40
    expect((await client.getItemTotalStock(item.id)).onHand).toBe(40);
  });

  it('TC3.4: Should update inventory valuation across multiple receipts at differing cost points', async () => {
    const sup = await client.createSupplier({
      supplierCode: 'SUP-VAL-02',
      name: 'Dynamic Cost Supplier',
      contactPerson: 'Tariq',
      phone: '+8801700000099',
      address: 'Dhaka'
    });

    const wh = await client.createWarehouse({
      warehouseCode: 'WH-VAL-TEST',
      name: 'Valuation Tracking Hub',
      address: 'Savar',
      city: 'Dhaka'
    });

    const bin = await client.createLocation({
      warehouseId: wh.id,
      zone: 'Zone V',
      aisle: 'V1',
      rack: 'R1',
      shelf: 'S1',
      binCode: 'BIN-V-TRACK'
    });

    const item = await client.createItem({
      sku: 'SKU-DYNAMIC-VAL',
      name: 'Copper Wire 100m',
      category: 'Electrical',
      costPrice: 50.00,
      sellingPrice: 90.00
    });

    // PO 1: 10 units @ 50 = 500
    const po1 = await client.createPurchaseOrder({
      poNumber: 'PO-VAL-1',
      supplierId: sup.id,
      targetWarehouseId: wh.id,
      items: [{ itemId: item.id, sku: item.sku, quantityOrdered: 10, unitCost: 50.00 }]
    });
    await client.updatePurchaseOrderStatus(po1.id, 'pending_approval');
    await client.updatePurchaseOrderStatus(po1.id, 'approved');
    await client.updatePurchaseOrderStatus(po1.id, 'ordered');
    await client.receiveGoods({
      receiptNumber: 'GRN-VAL-1',
      poId: po1.id,
      warehouseId: wh.id,
      receivedBy: 'Inspector',
      items: [{ poItemId: po1.items[0].id, itemId: item.id, batchNumber: 'LOT-C-50', binId: bin.id, quantityReceived: 10, quantityAccepted: 10, unitCost: 50.00 }]
    });

    // Valuation = 10 * 50 = 500
    let val1 = await client.calculateValuation(wh.id);
    expect(val1.totalUnits).toBe(10);
    expect(val1.totalValuation).toBe(500.00);

    // PO 2: 20 units @ 65 = 1300
    const po2 = await client.createPurchaseOrder({
      poNumber: 'PO-VAL-2',
      supplierId: sup.id,
      targetWarehouseId: wh.id,
      items: [{ itemId: item.id, sku: item.sku, quantityOrdered: 20, unitCost: 65.00 }]
    });
    await client.updatePurchaseOrderStatus(po2.id, 'pending_approval');
    await client.updatePurchaseOrderStatus(po2.id, 'approved');
    await client.updatePurchaseOrderStatus(po2.id, 'ordered');
    await client.receiveGoods({
      receiptNumber: 'GRN-VAL-2',
      poId: po2.id,
      warehouseId: wh.id,
      receivedBy: 'Inspector',
      items: [{ poItemId: po2.items[0].id, itemId: item.id, batchNumber: 'LOT-C-65', binId: bin.id, quantityReceived: 20, quantityAccepted: 20, unitCost: 65.00 }]
    });

    // Total units = 30, Total valuation = 500 + 1300 = 1800.00
    let val2 = await client.calculateValuation(wh.id);
    expect(val2.totalUnits).toBe(30);
    expect(val2.totalValuation).toBe(1800.00);
  });
});

if (process.argv[1]?.includes('cross-lifecycle.test.ts')) {
  runSuites().then(res => {
    if (res.failed > 0) process.exit(1);
  });
}
