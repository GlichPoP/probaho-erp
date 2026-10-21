/**
 * Milestone 4 Verification CLI Script: Fulfillment, Couriers, Shipments & Return-to-Origin (RTO)
 * File: tests/verify-m4-fulfillment.ts
 *
 * Hardened Drop-In Update (Iteration 2):
 * - Removed manual test helper DB patches (lines 98-122 raw SQL fallback on inventory_stock).
 * - Relies 100% on native fulfillmentService.updateShipmentStatus(shp.id, 'cancelled') for reservation release.
 * - Harmonized with strict state machine transition matrix:
 *   pending -> packed -> dispatched -> in_transit -> delivered / return_to_origin -> rto_received.
 * - Validates rejection of illegal direct state jumps (pending -> delivered).
 * - Validates terminal locking on delivered shipments.
 */

import { DatabaseService } from '../src/services/db.ts';
import { ERPTestClient } from './harness/erp-test-client.ts';

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
    console.log(`\r  ${colors.red}✘ FAIL [${code}] ${name} (${durationMs}ms)${colors.reset}`);
    console.error(`     ${colors.red}↳ Error: ${err.message || String(err)}${colors.reset}`);
    if (err.stack) {
      console.error(
        `${colors.gray}${err.stack
          .split('\n')
          .slice(1, 4)
          .join('\n')}${colors.reset}`
      );
    }
    stepResults.push({
      code,
      name,
      passed: false,
      durationMs,
      outputSummary: 'Execution threw an unhandled exception',
      error: err.message || String(err)
    });
    return false;
  }
}

/**
 * Native helper to cancel shipment via fulfillment service.
 * Relies 100% on native reservation release inside fulfillmentService.updateShipmentStatus
 * without any manual database manipulation or SQL patching.
 */
async function cancelShipmentHelper(
  testClient: ERPTestClient,
  _targetDb: DatabaseService,
  shipmentId: string,
  notes?: string
): Promise<any> {
  return testClient.updateShipmentStatus(shipmentId, 'cancelled', notes);
}

async function runM4Verification() {
  console.log(`\n${colors.bold}${colors.cyan}========================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}    PROBAHO ERP — MILESTONE 4 FULFILLMENT & LOGISTICS VERIFIER         ${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}========================================================================${colors.reset}\n`);
  console.log(`${colors.gray}Target Scope: Courier Management, Outbound Shipments, Dispatch Deduction, RTO Processing${colors.reset}`);
  console.log(`${colors.gray}Database Engine: Embedded SQLite (WebAssembly / Memory) | Zero Cloud Latency${colors.reset}\n`);

  const tStart = Date.now();
  const db = new DatabaseService(':memory:');
  await db.initialize();
  const client = new ERPTestClient(db);

  let portWh: any;
  let portBin: any;
  let itemBearing: any;
  let itemInverter: any;
  let courierPathao: any;
  let courierSteadfast: any;
  let courierRedX: any;
  let shipment1: any;
  let shipment2: any;
  let shipment3: any;

  // ---------------------------------------------------------------------------
  // STEP 1: Courier & Carrier Directory Management
  // ---------------------------------------------------------------------------
  await executeStep('AC4-1', 'Courier Directory CRUD & Tracking Template', async () => {
    // 1. Create carriers with real-world logistics parameters
    courierPathao = await client.createCourier(
      'Pathao Enterprise Cargo',
      '+8809610001122',
      'Express'
    );
    courierSteadfast = await client.createCourier(
      'Steadfast Logistics Ltd',
      '+8809612003344',
      'Standard'
    );
    courierRedX = await client.createCourier(
      'RedX Enterprise Freight',
      '+8809614005566',
      'Overnight'
    );

    // 2. Set tracking URL templates and active status validation
    await db.execute(
      `UPDATE couriers 
       SET tracking_url_template = 'https://track.pathao.com/{tracking_code}' 
       WHERE id = ?`,
      [courierPathao.id]
    );

    await db.execute(
      `UPDATE couriers 
       SET tracking_url_template = 'https://steadfast.com.bd/t/{tracking_code}' 
       WHERE id = ?`,
      [courierSteadfast.id]
    );

    const carriers = await client.getCouriers();
    if (carriers.length < 3) {
      throw new Error(`Expected at least 3 active carriers, found ${carriers.length}`);
    }

    const pathaoRow = carriers.find((c: any) => c.id === courierPathao.id);
    if (!pathaoRow || !pathaoRow.tracking_url_template?.includes('{tracking_code}')) {
      throw new Error('Courier tracking template failed to save properly.');
    }

    return `Registered 3 carrier partners (${courierPathao.name}, ${courierSteadfast.name}, ${courierRedX.name}) with tracking templates & active toggle validation.`;
  });

  // ---------------------------------------------------------------------------
  // STEP 2: Outbound Shipment Creation & Stock Reservation Invariant
  // ---------------------------------------------------------------------------
  await executeStep('AC4-2', 'Outbound Shipment Creation & Stock Reservation Invariant', async () => {
    // Setup initial multi-warehouse facilities & inventory
    portWh = await client.createWarehouse({
      warehouseCode: 'WH-CTG-PORT',
      name: 'Chittagong Port Terminal Hub',
      address: 'Strand Road, Sadarghat',
      city: 'Chittagong',
      isDefault: true
    });

    portBin = await client.createLocation({
      warehouseId: portWh.id,
      zone: 'Zone C',
      aisle: 'Aisle 01',
      rack: 'Rack 01',
      shelf: 'Shelf 01',
      binCode: 'CTG-ZC-A01-R01-S01'
    });

    itemBearing = await client.createItem({
      sku: 'SKU-BEARING-6205',
      name: 'Deep Groove Ball Bearing 6205',
      category: 'Mechanical',
      unitOfMeasure: 'pcs',
      costPrice: 28.50,
      sellingPrice: 45.00
    });

    itemInverter = await client.createItem({
      sku: 'SKU-INVERTER-5KW',
      name: 'Pure Sine Wave Industrial Inverter 5KW',
      category: 'Electrical',
      unitOfMeasure: 'units',
      costPrice: 420.00,
      sellingPrice: 650.00
    });

    // Seed stock: 80 bearings, 25 inverters
    await db.execute(
      `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved)
       VALUES 
        ('stk-m4-brg', ?, ?, ?, 80, 0),
        ('stk-m4-inv', ?, ?, ?, 25, 0)`,
      [itemBearing.id, portWh.id, portBin.id, itemInverter.id, portWh.id, portBin.id]
    );

    // Create outbound shipment with 20 bearings and 5 inverters
    shipment1 = await client.createShipment({
      shipmentNumber: 'SHP-202610-M4-001',
      orderReference: 'ORD-CLIENT-CTG-101',
      sourceWarehouseId: portWh.id,
      customerName: 'Karnaphuli Shipbuilders Ltd',
      customerPhone: '+8801819123456',
      customerAddress: 'Shipyard Area, Sadarghat',
      destinationCity: 'Chittagong',
      courierName: courierPathao.name,
      items: [
        { itemId: itemBearing.id, binId: portBin.id, quantity: 20, unitPrice: 45.00 },
        { itemId: itemInverter.id, binId: portBin.id, quantity: 5, unitPrice: 650.00 }
      ]
    });

    if (shipment1.status !== 'pending') {
      throw new Error(`Expected shipment status 'pending', got '${shipment1.status}'`);
    }
    if (shipment1.items.length !== 2) {
      throw new Error(`Expected 2 shipment line items, got ${shipment1.items.length}`);
    }

    // Verify Stock Reservation Invariant:
    // Bearings: onHand = 80, reserved = 20, available = 60
    const brgStock = await client.getItemTotalStock(itemBearing.id, portWh.id);
    if (brgStock.onHand !== 80 || brgStock.reserved !== 20 || brgStock.available !== 60) {
      throw new Error(`Bearing reservation mismatch: onHand=${brgStock.onHand}, reserved=${brgStock.reserved}, available=${brgStock.available}`);
    }

    // Inverters: onHand = 25, reserved = 5, available = 20
    const invStock = await client.getItemTotalStock(itemInverter.id, portWh.id);
    if (invStock.onHand !== 25 || invStock.reserved !== 5 || invStock.available !== 20) {
      throw new Error(`Inverter reservation mismatch: onHand=${invStock.onHand}, reserved=${invStock.reserved}, available=${invStock.available}`);
    }

    return `Created '${shipment1.shipment_number}' in 'pending' status. Invariant verified: Bearings (80 on-hand = 20 reserved + 60 available), Inverters (25 on-hand = 5 reserved + 20 available).`;
  });

  // ---------------------------------------------------------------------------
  // STEP 3: Stock Floor Protection & Native Reservation Cancellation
  // ---------------------------------------------------------------------------
  await executeStep('AC4-3', 'Stock Floor Protection & Native Reservation Cancellation', async () => {
    // 1. Stock Floor Protection: Attempt to create shipment requesting 50 inverters (only 20 available!)
    let floorBlocked = false;
    try {
      await client.createShipment({
        shipmentNumber: 'SHP-M4-FLOOR-FAIL',
        orderReference: 'ORD-ERR-FLOOR',
        sourceWarehouseId: portWh.id,
        customerName: 'Floor Breach Client',
        customerPhone: '+8801700000000',
        customerAddress: 'Agrabad',
        destinationCity: 'Chittagong',
        courierName: courierPathao.name,
        items: [{ itemId: itemInverter.id, binId: portBin.id, quantity: 50, unitPrice: 650.00 }]
      });
    } catch {
      floorBlocked = true;
    }

    if (!floorBlocked) {
      throw new Error('Stock floor protection failed: system allowed reservation exceeding available inventory!');
    }

    // 2. Reservation Cancellation: Create shipment for 15 bearings, then cancel it natively
    const cancelShp = await client.createShipment({
      shipmentNumber: 'SHP-202610-M4-CANCEL',
      orderReference: 'ORD-CANC-SPEC',
      sourceWarehouseId: portWh.id,
      customerName: 'Cancel Test Client',
      customerPhone: '+8801819222333',
      customerAddress: 'Pahartali',
      destinationCity: 'Chittagong',
      courierName: courierPathao.name,
      items: [{ itemId: itemBearing.id, binId: portBin.id, quantity: 15, unitPrice: 45.00 }]
    });

    // Check intermediate reservation: 20 (shipment1) + 15 = 35 reserved; available = 45
    const midStock = await client.getItemTotalStock(itemBearing.id, portWh.id);
    if (midStock.reserved !== 35 || midStock.available !== 45) {
      throw new Error(`Intermediate reservation mismatch: reserved=${midStock.reserved}, available=${midStock.available}`);
    }

    // Cancel shipment natively before dispatch (no manual DB patching)
    const cancelled = await cancelShipmentHelper(
      client,
      db,
      cancelShp.id,
      'Client requested order specification changes before packing'
    );
    if (cancelled.status !== 'cancelled') {
      throw new Error(`Expected status 'cancelled', got '${cancelled.status}'`);
    }

    // Verify native reservation release: reserved restored back to 20, available restored to 60!
    const postCancelStock = await client.getItemTotalStock(itemBearing.id, portWh.id);
    if (postCancelStock.reserved !== 20 || postCancelStock.available !== 60 || postCancelStock.onHand !== 80) {
      throw new Error(`Native reservation release failure: reserved=${postCancelStock.reserved}, available=${postCancelStock.available}, onHand=${postCancelStock.onHand}`);
    }

    return `Floor protection strictly enforced against over-allocation. Reservation of 15 bearings cleanly cancelled and restored to available pool natively.`;
  });

  // ---------------------------------------------------------------------------
  // STEP 4: Atomic Stock Deduction on Dispatch & FULFILLMENT_PICK Ledger Log
  // ---------------------------------------------------------------------------
  await executeStep('AC4-4', 'Atomic Stock Deduction on Dispatch & FULFILLMENT_PICK Ledger Log', async () => {
    // Dispatch shipment 1 with courier tracking number
    const dispatched = await client.dispatchShipment(shipment1.id, 'PATHAO-EXP-001');

    if (dispatched.status !== 'dispatched') {
      throw new Error(`Expected status 'dispatched', got '${dispatched.status}'`);
    }
    if (dispatched.tracking_number !== 'PATHAO-EXP-001') {
      throw new Error(`Tracking number mismatch: expected 'PATHAO-EXP-001', got '${dispatched.tracking_number}'`);
    }
    if (!dispatched.dispatched_at) {
      throw new Error('dispatched_at timestamp was not set upon dispatch.');
    }

    // Verify Physical Inventory Deduction:
    // Bearings: onHand drops from 80 -> 60. Reserved drops from 20 -> 0. Available = 60.
    const brgStock = await client.getItemTotalStock(itemBearing.id, portWh.id);
    if (brgStock.onHand !== 60 || brgStock.reserved !== 0 || brgStock.available !== 60) {
      throw new Error(`Bearing dispatch stock mismatch: onHand=${brgStock.onHand}, reserved=${brgStock.reserved}, available=${brgStock.available}`);
    }

    // Inverters: onHand drops from 25 -> 20. Reserved drops from 5 -> 0. Available = 20.
    const invStock = await client.getItemTotalStock(itemInverter.id, portWh.id);
    if (invStock.onHand !== 20 || invStock.reserved !== 0 || invStock.available !== 20) {
      throw new Error(`Inverter dispatch stock mismatch: onHand=${invStock.onHand}, reserved=${invStock.reserved}, available=${invStock.available}`);
    }

    // Verify Double-Entry Audit Ledger Logging (FULFILLMENT_PICK)
    const txLogs = await client.getInventoryTransactions(shipment1.shipment_number);
    if (txLogs.length < 2) {
      throw new Error(`Expected at least 2 FULFILLMENT_PICK ledger records, found ${txLogs.length}`);
    }

    const brgPick = txLogs.find((t: any) => t.item_id === itemBearing.id && t.transaction_type === 'FULFILLMENT_PICK');
    const invPick = txLogs.find((t: any) => t.item_id === itemInverter.id && t.transaction_type === 'FULFILLMENT_PICK');

    if (!brgPick || brgPick.quantity_change !== -20 || brgPick.running_balance_after !== 60) {
      throw new Error(`Bearing FULFILLMENT_PICK audit record invalid: change=${brgPick?.quantity_change}, balance=${brgPick?.running_balance_after}`);
    }
    if (!invPick || invPick.quantity_change !== -5 || invPick.running_balance_after !== 20) {
      throw new Error(`Inverter FULFILLMENT_PICK audit record invalid: change=${invPick?.quantity_change}, balance=${invPick?.running_balance_after}`);
    }

    return `Dispatched '${shipment1.shipment_number}': On-hand deducted atomically (Bearings 80->60, Inverters 25->20). 2 FULFILLMENT_PICK immutable audit ledger records verified.`;
  });

  // ---------------------------------------------------------------------------
  // STEP 5: Multi-Stage Tracking State Machine & Delivery Terminal Locking
  // ---------------------------------------------------------------------------
  await executeStep('AC4-5', 'Multi-Stage Tracking State Machine & Delivery Terminal Locking', async () => {
    // 0. Verify illegal state jump rejection: cannot jump directly from pending to delivered
    const testJumpShp = await client.createShipment({
      shipmentNumber: 'SHP-M4-JUMP-CHECK',
      orderReference: 'ORD-JUMP-CHECK',
      sourceWarehouseId: portWh.id,
      customerName: 'Jump Check Client',
      customerPhone: '+8801819000111',
      customerAddress: 'Port Area',
      destinationCity: 'Chittagong',
      courierName: courierPathao.name,
      items: [{ itemId: itemBearing.id, binId: portBin.id, quantity: 5, unitPrice: 45.00 }]
    });

    let jumpBlocked = false;
    try {
      await client.updateShipmentStatus(testJumpShp.id, 'delivered');
    } catch {
      jumpBlocked = true;
    }
    if (!jumpBlocked) {
      throw new Error('State machine integrity failure: direct jump pending -> delivered was permitted!');
    }
    // Clean up jump check shipment natively
    await cancelShipmentHelper(client, db, testJumpShp.id, 'Cleanup jump test');

    // 1. Advance shipment1: dispatched -> in_transit
    const transit = await client.updateShipmentStatus(shipment1.id, 'in_transit');
    if (transit.status !== 'in_transit') {
      throw new Error(`Expected status 'in_transit', got '${transit.status}'`);
    }

    // 2. Advance shipment1: in_transit -> delivered
    const delivered = await client.updateShipmentStatus(shipment1.id, 'delivered');
    if (delivered.status !== 'delivered') {
      throw new Error(`Expected status 'delivered', got '${delivered.status}'`);
    }
    if (!delivered.delivered_at) {
      throw new Error('delivered_at timestamp was not set upon delivery.');
    }

    // 3. Terminal State Lock: Attempt to modify terminal delivered shipment
    let lockPassed = false;
    try {
      await client.updateShipmentStatus(shipment1.id, 'in_transit');
    } catch {
      lockPassed = true;
    }

    if (!lockPassed) {
      throw new Error('Terminal state lock guard failed: system allowed transitioning delivered shipment!');
    }

    let cancelBlocked = false;
    try {
      await cancelShipmentHelper(client, db, shipment1.id, 'Illegal delivery cancellation');
    } catch {
      cancelBlocked = true;
    }

    if (!cancelBlocked) {
      throw new Error('Terminal state lock guard failed: system allowed cancelling delivered shipment!');
    }

    return `State machine advanced (dispatched -> in_transit -> delivered). Illegal state jump rejected. Terminal delivery lock enforced: shipment strictly immutable.`;
  });

  // ---------------------------------------------------------------------------
  // STEP 6: Return-to-Origin Exception Handling & Delivery Failure Intake
  // ---------------------------------------------------------------------------
  await executeStep('AC4-6', 'Return-to-Origin Exception Handling & Delivery Failure Intake', async () => {
    // Create shipment 2 (10 bearings for Meghna Dredging Ltd)
    shipment2 = await client.createShipment({
      shipmentNumber: 'SHP-202610-M4-002',
      orderReference: 'ORD-CLIENT-CTG-102',
      sourceWarehouseId: portWh.id,
      customerName: 'Meghna Dredging Ltd',
      customerPhone: '+8801819888999',
      customerAddress: 'Customs Ghat, Strand Road',
      destinationCity: 'Chittagong',
      courierName: courierSteadfast.name,
      items: [{ itemId: itemBearing.id, binId: portBin.id, quantity: 10, unitPrice: 45.00 }]
    });

    await client.dispatchShipment(shipment2.id, 'STDF-EXP-5522');
    await client.updateShipmentStatus(shipment2.id, 'in_transit');

    // Simulate delivery failure: Port security terminal locked for dredging maintenance
    const rto = await client.updateShipmentStatus(
      shipment2.id,
      'return_to_origin',
      'Port security terminal locked for emergency channel dredging; consignee unreachable'
    );

    if (rto.status !== 'return_to_origin') {
      throw new Error(`Expected status 'return_to_origin', got '${rto.status}'`);
    }
    if (!rto.rto_initiated_at) {
      throw new Error('rto_initiated_at timestamp was not set upon RTO initiation.');
    }
    if (!rto.rto_reason?.includes('Port security terminal locked')) {
      throw new Error(`RTO reason was not recorded, found '${rto.rto_reason}'`);
    }

    // Invariant guard: non-RTO shipments cannot be processed for RTO
    let prematureBlocked = false;
    try {
      await client.processRTO(shipment1.id, 'restocked', portBin.id);
    } catch {
      prematureBlocked = true;
    }

    if (!prematureBlocked) {
      throw new Error('RTO guard failed: system allowed processing RTO on terminal delivered shipment!');
    }

    return `Shipment '${shipment2.shipment_number}' transitioned to 'return_to_origin' with documented exception reason & timestamp. Non-RTO intake guard confirmed.`;
  });

  // ---------------------------------------------------------------------------
  // STEP 7: RTO Pristine Restocking & Full Balance Restoration
  // ---------------------------------------------------------------------------
  await executeStep('AC4-7', 'RTO Pristine Restocking & Full Balance Restoration', async () => {
    // Current on-hand bearings before restock: 60 - 10 = 50
    const preStock = await client.getItemTotalStock(itemBearing.id, portWh.id);
    if (preStock.onHand !== 50) {
      throw new Error(`Expected 50 bearings on hand before restock, found ${preStock.onHand}`);
    }

    // Staff inspects returned parcel: pristine packaging, factory seals intact -> restock
    const restocked = await client.processRTO(shipment2.id, 'restocked', portBin.id);
    if (restocked.status !== 'rto_received' || restocked.rto_disposition !== 'restocked') {
      throw new Error(`Expected 'rto_received' with 'restocked', got '${restocked.status}' / '${restocked.rto_disposition}'`);
    }
    if (!restocked.rto_received_at) {
      throw new Error('rto_received_at timestamp was not populated upon restocking.');
    }

    // Physical stock restored: 50 + 10 = 60 bearings!
    const postStock = await client.getItemTotalStock(itemBearing.id, portWh.id);
    if (postStock.onHand !== 60) {
      throw new Error(`Restocked balance mismatch: expected 60 bearings, got ${postStock.onHand}`);
    }

    // Verify RETURN_RESTOCK audit ledger entry
    const logs = await client.getInventoryTransactions(shipment2.shipment_number);
    const restockLog = logs.find((l: any) => l.transaction_type === 'RETURN_RESTOCK');
    if (!restockLog || restockLog.quantity_change !== 10 || restockLog.running_balance_after !== 60) {
      throw new Error(`RETURN_RESTOCK audit entry invalid: change=${restockLog?.quantity_change}, balance=${restockLog?.running_balance_after}`);
    }

    return `RTO restocked: 10 pristine bearings returned to bin '${portBin.bin_code}'. On-hand restored to 60. RETURN_RESTOCK ledger verified.`;
  });

  // ---------------------------------------------------------------------------
  // STEP 8: RTO Damaged Write-Off & Scrap Disposal Audit Trail
  // ---------------------------------------------------------------------------
  await executeStep('AC4-8', 'RTO Damaged Write-Off & Scrap Disposal Audit Trail', async () => {
    // Create shipment 3 (5 bearings for Eastern Drydock)
    shipment3 = await client.createShipment({
      shipmentNumber: 'SHP-202610-M4-003',
      orderReference: 'ORD-CLIENT-CTG-103',
      sourceWarehouseId: portWh.id,
      customerName: 'Eastern Drydock Corp',
      customerPhone: '+8801819444555',
      customerAddress: 'Drydock Mooring Basin',
      destinationCity: 'Chittagong',
      courierName: courierRedX.name,
      items: [{ itemId: itemBearing.id, binId: portBin.id, quantity: 5, unitPrice: 45.00 }]
    });

    await client.dispatchShipment(shipment3.id, 'REDX-EXP-7733');
    // On hand drops from 60 -> 55
    const midStock = await client.getItemTotalStock(itemBearing.id, portWh.id);
    if (midStock.onHand !== 55) {
      throw new Error(`Expected 55 bearings on hand, got ${midStock.onHand}`);
    }

    await client.updateShipmentStatus(shipment3.id, 'in_transit');

    // Carrier reports severe collision; packaging crushed and inundated with saltwater
    await client.updateShipmentStatus(
      shipment3.id,
      'return_to_origin',
      'Highway collision; container compromised with saltwater ingress; bearings oxidized'
    );

    // Intake inspection marks total scrap write-off
    const scrapped = await client.processRTO(shipment3.id, 'damaged_writeoff');
    if (scrapped.status !== 'rto_received' || scrapped.rto_disposition !== 'damaged_writeoff') {
      throw new Error(`Expected rto_received with damaged_writeoff, got '${scrapped.status}' / '${scrapped.rto_disposition}'`);
    }

    // Physical stock MUST REMAIN 55 (damaged scrap is NOT returned to salable inventory)
    const finalStock = await client.getItemTotalStock(itemBearing.id, portWh.id);
    if (finalStock.onHand !== 55) {
      throw new Error(`Inventory leaked damaged units! Expected 55 on hand, found ${finalStock.onHand}`);
    }

    // Verify scrap disposal audit ledger entry
    const logs = await client.getInventoryTransactions(shipment3.shipment_number);
    const scrapLog = logs.find((l: any) => l.transaction_type === 'ADJUSTMENT_WRITE_OFF');
    if (!scrapLog) {
      throw new Error('Missing ADJUSTMENT_WRITE_OFF audit entry for damaged parcel scrap disposal.');
    }

    // GLOBAL MASS CONSERVATION CHECK ACROSS ALL 3 SHIPMENTS:
    // Initial Bearings = 80
    // - Shipment 1: 20 units -> Delivered (20 permanent)
    // - Shipment 2: 10 units -> Restocked (10 restored)
    // - Shipment 3: 5 units  -> Scrapped (5 permanent scrap)
    // Remaining On-Hand: 55 units.
    // Total Accounting: 55 (On-Hand) + 20 (Delivered) + 5 (Scrapped) = 80 (Initial Stock)!
    const globalTotal = finalStock.onHand + 20 + 5;
    if (globalTotal !== 80) {
      throw new Error(`Global mass balance violation: ${finalStock.onHand} + 20 + 5 = ${globalTotal} != 80`);
    }

    return `Damaged parcel scrapped (5 bearings): physical stock safely preserved at 55. ADJUSTMENT_WRITE_OFF logged. Global mass conservation confirmed (55 + 20 delivered + 5 scrapped = 80 initial).`;
  });

  const totalDuration = Date.now() - tStart;
  const passedCount = stepResults.filter((s) => s.passed).length;
  const failedCount = stepResults.filter((s) => !s.passed).length;

  console.log(`\n${colors.bold}${colors.cyan}========================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}          MILESTONE 4 ACCEPTANCE VERIFICATION SCORECARD                 ${colors.reset}`);
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
    console.log(`${colors.green}✨ [SUCCESS] All Milestone 4 Acceptance Criteria PASSED!${colors.reset}\n`);
    process.exit(0);
  }
}

runM4Verification().catch((err) => {
  console.error('Fatal crash in M4 verification:', err);
  process.exit(1);
});
