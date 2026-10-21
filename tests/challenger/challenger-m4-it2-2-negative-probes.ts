/**
 * Comprehensive Empirical Negative Edge Case Probes for Milestone 4 Fulfillment State Machine
 * File: tests/challenger/challenger-m4-it2-2-negative-probes.ts
 *
 * Authored by: challenger_m4_it2_2
 * Scope:
 * 1. Direct jumps across non-adjacent state machine nodes (pending -> delivered, packed -> delivered, dispatched -> delivered)
 * 2. Whitespace-only tracking numbers on dispatch ("   ", "", "\t", "\n")
 * 3. Re-dispatch prevention on return_to_origin, rto_received, and rto_delivered
 * 4. Terminal locking invariants for delivered, cancelled, rto_received, rto_delivered
 * 5. Warehouse boundary validation on RTO restock target bins
 */

import { DatabaseService } from '../../src/services/db.ts';
import { ERPTestClient } from '../harness/erp-test-client.ts';
import { FulfillmentService } from '../../src/services/fulfillmentService.ts';

interface ProbeResult {
  name: string;
  category: string;
  passed: boolean;
  observed: string;
  expected: string;
}

async function runNegativeProbes() {
  console.log('========================================================================');
  console.log('  PROBAHO ERP — EMPIRICAL NEGATIVE PROBES: M4 STATE MACHINE INVARIANTS  ');
  console.log('========================================================================\n');

  const db = new DatabaseService(':memory:');
  await db.initialize();
  const client = new ERPTestClient(db);
  const fs = FulfillmentService.getInstance();

  const results: ProbeResult[] = [];

  function record(probe: ProbeResult) {
    results.push(probe);
    const symbol = probe.passed ? '✔ PASS' : '❌ FAIL';
    console.log(`${symbol} [${probe.category}] ${probe.name}`);
    console.log(`       Observed: ${probe.observed}`);
    if (!probe.passed) {
      console.error(`       Expected: ${probe.expected}`);
    }
  }

  // Common Setup
  const wh = await client.createWarehouse({
    warehouseCode: 'WH-NEG-01',
    name: 'Chittagong Central Hub',
    address: 'Agrabad C/A',
    city: 'Chittagong',
    isDefault: true
  });

  const foreignWh = await client.createWarehouse({
    warehouseCode: 'WH-NEG-02',
    name: 'Dhaka Regional Hub',
    address: 'Tejgaon',
    city: 'Dhaka',
    isDefault: false
  });

  const binMain = await client.createLocation({
    warehouseId: wh.id,
    zone: 'Zone A',
    aisle: 'A1',
    rack: 'R1',
    shelf: 'S1',
    binCode: 'CTG-BIN-01'
  });

  const binForeign = await client.createLocation({
    warehouseId: foreignWh.id,
    zone: 'Zone D',
    aisle: 'D1',
    rack: 'R1',
    shelf: 'S1',
    binCode: 'DHK-BIN-01'
  });

  const item1 = await client.createItem({
    sku: 'SKU-NEG-ITEM-1',
    name: 'Industrial Valve 2-inch',
    category: 'Hardware',
    costPrice: 45.0,
    sellingPrice: 90.0
  });

  const courier = await client.createCourier('Express Cargo Ltd', '+8801811223344', 'Standard');

  // Seed initial stock
  await db.execute(
    'INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, quantity_on_hand, quantity_reserved) VALUES (?, ?, ?, ?, 200, 0)',
    ['stk-neg-01', item1.id, wh.id, binMain.id]
  );

  console.log('Setup completed. Initial stock: 200 onHand, 0 reserved in binMain.\n');

  // =========================================================================
  // CATEGORY 1: Illegal Direct State Machine Jumps
  // =========================================================================
  console.log('--- CATEGORY 1: Illegal State Machine Jumps ---');

  // Probe 1.1: pending -> delivered
  const shp1 = await client.createShipment({
    shipmentNumber: 'SHP-JUMP-P2D',
    orderReference: 'ORD-JUMP-1',
    sourceWarehouseId: wh.id,
    customerName: 'Jump Corp',
    customerPhone: '+8801700000001',
    customerAddress: 'Jubilee Road',
    destinationCity: 'Chittagong',
    courierName: courier.name,
    items: [{ itemId: item1.id, binId: binMain.id, quantity: 10, unitPrice: 90.0 }]
  });

  let p2dBlocked = false;
  let p2dMsg = '';
  try {
    await fs.updateShipmentStatus(shp1.id, 'delivered', undefined, 'system', db);
  } catch (err: any) {
    p2dBlocked = true;
    p2dMsg = err.message;
  }
  const stock1 = await client.getItemTotalStock(item1.id, wh.id);
  const shp1After = await client.getShipment(shp1.id);
  record({
    name: 'Direct jump pending -> delivered',
    category: 'STATE_JUMP',
    passed: p2dBlocked && shp1After.status === 'pending' && stock1.onHand === 200 && stock1.reserved === 10,
    observed: `Blocked: ${p2dBlocked}, Status: ${shp1After.status}, Stock: onHand=${stock1.onHand}, reserved=${stock1.reserved}, Error: "${p2dMsg}"`,
    expected: 'Rejected with Invalid state transition, status pending, stock reserved intact'
  });

  // Probe 1.2: pending -> in_transit
  let p2tBlocked = false;
  let p2tMsg = '';
  try {
    await fs.updateShipmentStatus(shp1.id, 'in_transit', undefined, 'system', db);
  } catch (err: any) {
    p2tBlocked = true;
    p2tMsg = err.message;
  }
  record({
    name: 'Direct jump pending -> in_transit',
    category: 'STATE_JUMP',
    passed: p2tBlocked,
    observed: `Blocked: ${p2tBlocked}, Error: "${p2tMsg}"`,
    expected: 'Rejected with Invalid state transition'
  });

  // Probe 1.3: pending -> return_to_origin
  let p2rBlocked = false;
  let p2rMsg = '';
  try {
    await fs.updateShipmentStatus(shp1.id, 'return_to_origin', undefined, 'system', db);
  } catch (err: any) {
    p2rBlocked = true;
    p2rMsg = err.message;
  }
  record({
    name: 'Direct jump pending -> return_to_origin',
    category: 'STATE_JUMP',
    passed: p2rBlocked,
    observed: `Blocked: ${p2rBlocked}, Error: "${p2rMsg}"`,
    expected: 'Rejected with Invalid state transition'
  });

  // Probe 1.4: packed -> delivered
  await fs.updateShipmentStatus(shp1.id, 'packed', undefined, 'system', db);
  let pak2dBlocked = false;
  let pak2dMsg = '';
  try {
    await fs.updateShipmentStatus(shp1.id, 'delivered', undefined, 'system', db);
  } catch (err: any) {
    pak2dBlocked = true;
    pak2dMsg = err.message;
  }
  record({
    name: 'Direct jump packed -> delivered',
    category: 'STATE_JUMP',
    passed: pak2dBlocked,
    observed: `Blocked: ${pak2dBlocked}, Error: "${pak2dMsg}"`,
    expected: 'Rejected with Invalid state transition'
  });

  // Probe 1.5: dispatched -> delivered (must pass through in_transit first)
  await fs.dispatchShipment(shp1.id, 'TRK-JUMP-01', 'system', db);
  let disp2dBlocked = false;
  let disp2dMsg = '';
  try {
    await fs.updateShipmentStatus(shp1.id, 'delivered', undefined, 'system', db);
  } catch (err: any) {
    disp2dBlocked = true;
    disp2dMsg = err.message;
  }
  record({
    name: 'Direct jump dispatched -> delivered (skipping in_transit)',
    category: 'STATE_JUMP',
    passed: disp2dBlocked,
    observed: `Blocked: ${disp2dBlocked}, Error: "${disp2dMsg}"`,
    expected: 'Rejected with Invalid state transition'
  });

  // Clean up shp1 by taking it to delivered properly
  await fs.updateShipmentStatus(shp1.id, 'in_transit', undefined, 'system', db);
  await fs.updateShipmentStatus(shp1.id, 'delivered', undefined, 'system', db);

  // =========================================================================
  // CATEGORY 2: Whitespace-Only Tracking Numbers on Dispatch
  // =========================================================================
  console.log('\n--- CATEGORY 2: Whitespace-Only Tracking Numbers ---');

  const shpWs = await client.createShipment({
    shipmentNumber: 'SHP-WS-GUARD',
    orderReference: 'ORD-WS-1',
    sourceWarehouseId: wh.id,
    customerName: 'Whitespace Corp',
    customerPhone: '+8801700000002',
    customerAddress: 'Khatungonj',
    destinationCity: 'Chittagong',
    courierName: courier.name,
    items: [{ itemId: item1.id, binId: binMain.id, quantity: 5, unitPrice: 90.0 }]
  });

  const stockBeforeWs = await client.getItemTotalStock(item1.id, wh.id);

  // Probe 2.1: Spaces string "   "
  let wsSpacesBlocked = false;
  let wsSpacesErr = '';
  try {
    await fs.dispatchShipment(shpWs.id, '   ', 'system', db);
  } catch (err: any) {
    wsSpacesBlocked = true;
    wsSpacesErr = err.message;
  }
  record({
    name: 'Dispatch with space-only tracking number ("   ")',
    category: 'WHITESPACE_TRACKING',
    passed: wsSpacesBlocked && wsSpacesErr.includes('mandatory'),
    observed: `Blocked: ${wsSpacesBlocked}, Error: "${wsSpacesErr}"`,
    expected: 'Rejected with mandatory tracking ID error'
  });

  // Probe 2.2: Empty string ""
  let wsEmptyBlocked = false;
  let wsEmptyErr = '';
  try {
    await fs.dispatchShipment(shpWs.id, '', 'system', db);
  } catch (err: any) {
    wsEmptyBlocked = true;
    wsEmptyErr = err.message;
  }
  record({
    name: 'Dispatch with empty tracking number ("")',
    category: 'WHITESPACE_TRACKING',
    passed: wsEmptyBlocked && wsEmptyErr.includes('mandatory'),
    observed: `Blocked: ${wsEmptyBlocked}, Error: "${wsEmptyErr}"`,
    expected: 'Rejected with mandatory tracking ID error'
  });

  // Probe 2.3: Tabs & Newlines "\t  \n  "
  let wsTabsBlocked = false;
  let wsTabsErr = '';
  try {
    await fs.dispatchShipment(shpWs.id, '\t  \n  ', 'system', db);
  } catch (err: any) {
    wsTabsBlocked = true;
    wsTabsErr = err.message;
  }
  record({
    name: 'Dispatch with tab/newline whitespace tracking number ("\\t  \\n  ")',
    category: 'WHITESPACE_TRACKING',
    passed: wsTabsBlocked && wsTabsErr.includes('mandatory'),
    observed: `Blocked: ${wsTabsBlocked}, Error: "${wsTabsErr}"`,
    expected: 'Rejected with mandatory tracking ID error'
  });

  // Verify stock unchanged after whitespace rejections
  const stockAfterWs = await client.getItemTotalStock(item1.id, wh.id);
  const shpWsAfter = await client.getShipment(shpWs.id);
  record({
    name: 'Stock conservation after rejected whitespace dispatches',
    category: 'WHITESPACE_TRACKING',
    passed: shpWsAfter.status === 'pending' && stockAfterWs.onHand === stockBeforeWs.onHand && stockAfterWs.reserved === stockBeforeWs.reserved,
    observed: `Status: ${shpWsAfter.status}, onHand: ${stockAfterWs.onHand}, reserved: ${stockAfterWs.reserved}`,
    expected: 'No stock deducted or reserved released'
  });

  // Now dispatch shpWs properly with valid tracking number for downstream tests
  await fs.dispatchShipment(shpWs.id, 'TRK-VALID-WS', 'system', db);
  await fs.updateShipmentStatus(shpWs.id, 'in_transit', undefined, 'system', db);
  await fs.updateShipmentStatus(shpWs.id, 'delivered', undefined, 'system', db);

  // =========================================================================
  // CATEGORY 3: Re-Dispatch Prevention on RTO States
  // =========================================================================
  console.log('\n--- CATEGORY 3: Re-Dispatch Prevention on RTO States ---');

  const shpRto = await client.createShipment({
    shipmentNumber: 'SHP-RTO-REDISP',
    orderReference: 'ORD-RTO-1',
    sourceWarehouseId: wh.id,
    customerName: 'RTO Customer',
    customerPhone: '+8801700000003',
    customerAddress: 'Nasirabad',
    destinationCity: 'Chittagong',
    courierName: courier.name,
    items: [{ itemId: item1.id, binId: binMain.id, quantity: 8, unitPrice: 90.0 }]
  });

  await fs.dispatchShipment(shpRto.id, 'TRK-RTO-INIT', 'system', db);
  await fs.updateShipmentStatus(shpRto.id, 'in_transit', undefined, 'system', db);
  await fs.updateShipmentStatus(shpRto.id, 'return_to_origin', 'Address unknown', 'system', db);

  const stockBeforeRtoRedispatch = await client.getItemTotalStock(item1.id, wh.id);

  // Probe 3.1: Attempt dispatch while in return_to_origin
  let rtoRedispatchBlocked = false;
  let rtoRedispatchErr = '';
  try {
    await fs.dispatchShipment(shpRto.id, 'TRK-RTO-ILLEGAL', 'system', db);
  } catch (err: any) {
    rtoRedispatchBlocked = true;
    rtoRedispatchErr = err.message;
  }
  record({
    name: 'Re-dispatch attempt while in return_to_origin',
    category: 'RTO_REDISPATCH',
    passed: rtoRedispatchBlocked && rtoRedispatchErr.includes("expected 'pending' or 'packed'"),
    observed: `Blocked: ${rtoRedispatchBlocked}, Error: "${rtoRedispatchErr}"`,
    expected: "Rejected with expected 'pending' or 'packed'"
  });

  // Probe 3.2: Complete RTO and attempt dispatch while in rto_received
  await fs.processRTO(shpRto.id, 'restocked', binMain.id, 'system', db);

  let rtoRecvRedispatchBlocked = false;
  let rtoRecvRedispatchErr = '';
  try {
    await fs.dispatchShipment(shpRto.id, 'TRK-RTO-RECV-ILLEGAL', 'system', db);
  } catch (err: any) {
    rtoRecvRedispatchBlocked = true;
    rtoRecvRedispatchErr = err.message;
  }
  record({
    name: 'Re-dispatch attempt while in rto_received',
    category: 'RTO_REDISPATCH',
    passed: rtoRecvRedispatchBlocked && rtoRecvRedispatchErr.includes("expected 'pending' or 'packed'"),
    observed: `Blocked: ${rtoRecvRedispatchBlocked}, Error: "${rtoRecvRedispatchErr}"`,
    expected: "Rejected with expected 'pending' or 'packed'"
  });

  // Verify stock was not re-deducted
  const stockAfterRtoRedispatch = await client.getItemTotalStock(item1.id, wh.id);
  record({
    name: 'Physical stock unchanged after blocked RTO re-dispatch calls',
    category: 'RTO_REDISPATCH',
    passed: stockAfterRtoRedispatch.onHand === stockBeforeRtoRedispatch.onHand + 8, // Pristine restock added 8
    observed: `onHand: ${stockAfterRtoRedispatch.onHand} (restocked once from ${stockBeforeRtoRedispatch.onHand})`,
    expected: 'Stock restored once, no secondary deduction'
  });

  // =========================================================================
  // CATEGORY 4: Terminal Locking Invariants
  // =========================================================================
  console.log('\n--- CATEGORY 4: Terminal State Locking Invariants ---');

  // Terminal State 1: DELIVERED
  console.log('  Testing terminal state: delivered');
  const nonTerminalTargets: Array<'pending' | 'packed' | 'dispatched' | 'in_transit' | 'return_to_origin' | 'cancelled'> = [
    'pending', 'packed', 'dispatched', 'in_transit', 'return_to_origin', 'cancelled'
  ];

  for (const target of nonTerminalTargets) {
    let delivMutationBlocked = false;
    let delivMutationErr = '';
    try {
      await fs.updateShipmentStatus(shp1.id, target, undefined, 'system', db);
    } catch (err: any) {
      delivMutationBlocked = true;
      delivMutationErr = err.message;
    }
    record({
      name: `Delivered terminal: attempt transition to '${target}'`,
      category: 'TERMINAL_DELIVERED',
      passed: delivMutationBlocked && delivMutationErr.includes("terminal 'delivered' status"),
      observed: `Blocked: ${delivMutationBlocked}, Error: "${delivMutationErr}"`,
      expected: "Rejected with terminal 'delivered' status"
    });
  }

  // Also verify dispatch and processRTO on delivered
  let delivDispBlocked = false;
  try {
    await fs.dispatchShipment(shp1.id, 'TRK-DELV-AGAIN', 'system', db);
  } catch (err: any) {
    delivDispBlocked = true;
  }
  record({
    name: 'Delivered terminal: attempt dispatchShipment',
    category: 'TERMINAL_DELIVERED',
    passed: delivDispBlocked,
    observed: `Blocked: ${delivDispBlocked}`,
    expected: 'Rejected'
  });

  let delivRtoBlocked = false;
  try {
    await fs.processRTO(shp1.id, 'restocked', binMain.id, 'system', db);
  } catch (err: any) {
    delivRtoBlocked = true;
  }
  record({
    name: 'Delivered terminal: attempt processRTO',
    category: 'TERMINAL_DELIVERED',
    passed: delivRtoBlocked,
    observed: `Blocked: ${delivRtoBlocked}`,
    expected: 'Rejected'
  });

  // Terminal State 2: CANCELLED
  console.log('\n  Testing terminal state: cancelled');
  const shpCancel = await client.createShipment({
    shipmentNumber: 'SHP-TERM-CANCEL',
    orderReference: 'ORD-CANCEL-1',
    sourceWarehouseId: wh.id,
    customerName: 'Cancel Customer',
    customerPhone: '+8801700000004',
    customerAddress: 'Agrabad',
    destinationCity: 'Chittagong',
    courierName: courier.name,
    items: [{ itemId: item1.id, binId: binMain.id, quantity: 6, unitPrice: 90.0 }]
  });

  await fs.updateShipmentStatus(shpCancel.id, 'cancelled', 'User cancelled order', 'system', db);

  const targetsFromCancel: Array<'pending' | 'packed' | 'dispatched' | 'in_transit' | 'delivered' | 'return_to_origin'> = [
    'pending', 'packed', 'dispatched', 'in_transit', 'delivered', 'return_to_origin'
  ];

  for (const target of targetsFromCancel) {
    let cancelMutationBlocked = false;
    let cancelMutationErr = '';
    try {
      await fs.updateShipmentStatus(shpCancel.id, target, undefined, 'system', db);
    } catch (err: any) {
      cancelMutationBlocked = true;
      cancelMutationErr = err.message;
    }
    record({
      name: `Cancelled terminal: attempt transition to '${target}'`,
      category: 'TERMINAL_CANCELLED',
      passed: cancelMutationBlocked && cancelMutationErr.includes('already cancelled'),
      observed: `Blocked: ${cancelMutationBlocked}, Error: "${cancelMutationErr}"`,
      expected: 'Rejected with already cancelled'
    });
  }

  let cancelDispBlocked = false;
  try {
    await fs.dispatchShipment(shpCancel.id, 'TRK-CANC-DISP', 'system', db);
  } catch (err: any) {
    cancelDispBlocked = true;
  }
  record({
    name: 'Cancelled terminal: attempt dispatchShipment',
    category: 'TERMINAL_CANCELLED',
    passed: cancelDispBlocked,
    observed: `Blocked: ${cancelDispBlocked}`,
    expected: 'Rejected'
  });

  let cancelRtoBlocked = false;
  try {
    await fs.processRTO(shpCancel.id, 'restocked', binMain.id, 'system', db);
  } catch (err: any) {
    cancelRtoBlocked = true;
  }
  record({
    name: 'Cancelled terminal: attempt processRTO',
    category: 'TERMINAL_CANCELLED',
    passed: cancelRtoBlocked,
    observed: `Blocked: ${cancelRtoBlocked}`,
    expected: 'Rejected'
  });

  // Terminal State 3: RTO_RECEIVED
  console.log('\n  Testing terminal state: rto_received');
  // shpRto is already in 'rto_received'
  const targetsFromRtoRecv: Array<'pending' | 'packed' | 'dispatched' | 'in_transit' | 'delivered' | 'return_to_origin' | 'cancelled'> = [
    'pending', 'packed', 'dispatched', 'in_transit', 'delivered', 'return_to_origin', 'cancelled'
  ];

  for (const target of targetsFromRtoRecv) {
    let rtoRecvMutationBlocked = false;
    let rtoRecvMutationErr = '';
    try {
      await fs.updateShipmentStatus(shpRto.id, target, undefined, 'system', db);
    } catch (err: any) {
      rtoRecvMutationBlocked = true;
      rtoRecvMutationErr = err.message;
    }
    record({
      name: `RTO_Received terminal: attempt transition to '${target}'`,
      category: 'TERMINAL_RTO_RECEIVED',
      passed: rtoRecvMutationBlocked && rtoRecvMutationErr.includes("terminal 'rto_received' status"),
      observed: `Blocked: ${rtoRecvMutationBlocked}, Error: "${rtoRecvMutationErr}"`,
      expected: "Rejected with terminal 'rto_received' status"
    });
  }

  // Second processRTO call on rto_received
  let dupRtoBlocked = false;
  let dupRtoErr = '';
  try {
    await fs.processRTO(shpRto.id, 'restocked', binMain.id, 'system', db);
  } catch (err: any) {
    dupRtoBlocked = true;
    dupRtoErr = err.message;
  }
  record({
    name: 'RTO_Received terminal: duplicate processRTO call',
    category: 'TERMINAL_RTO_RECEIVED',
    passed: dupRtoBlocked && dupRtoErr.includes("expected 'return_to_origin'"),
    observed: `Blocked: ${dupRtoBlocked}, Error: "${dupRtoErr}"`,
    expected: "Rejected with expected 'return_to_origin'"
  });

  // Terminal State 4: RTO_DELIVERED (synthetic check)
  console.log('\n  Testing terminal state: rto_delivered');
  const shpRtoDelv = await client.createShipment({
    shipmentNumber: 'SHP-TERM-RTODELV',
    orderReference: 'ORD-RTODELV-1',
    sourceWarehouseId: wh.id,
    customerName: 'RTO Delivered Corp',
    customerPhone: '+8801700000005',
    customerAddress: 'Agrabad',
    destinationCity: 'Chittagong',
    courierName: courier.name,
    items: [{ itemId: item1.id, binId: binMain.id, quantity: 2, unitPrice: 90.0 }]
  });

  // Directly set status to rto_delivered in DB to test the guard
  await db.execute("UPDATE shipments SET status = 'rto_delivered' WHERE id = ?", [shpRtoDelv.id]);

  let rtoDelvMutationBlocked = false;
  let rtoDelvMutationErr = '';
  try {
    await fs.updateShipmentStatus(shpRtoDelv.id, 'in_transit', undefined, 'system', db);
  } catch (err: any) {
    rtoDelvMutationBlocked = true;
    rtoDelvMutationErr = err.message;
  }
  record({
    name: "RTO_Delivered terminal: attempt transition to 'in_transit'",
    category: 'TERMINAL_RTO_DELIVERED',
    passed: rtoDelvMutationBlocked && rtoDelvMutationErr.includes("terminal 'rto_delivered' status"),
    observed: `Blocked: ${rtoDelvMutationBlocked}, Error: "${rtoDelvMutationErr}"`,
    expected: "Rejected with terminal 'rto_delivered' status"
  });

  let rtoDelvDispBlocked = false;
  try {
    await fs.dispatchShipment(shpRtoDelv.id, 'TRK-RTODELV-DISP', 'system', db);
  } catch (err: any) {
    rtoDelvDispBlocked = true;
  }
  record({
    name: 'RTO_Delivered terminal: attempt dispatchShipment',
    category: 'TERMINAL_RTO_DELIVERED',
    passed: rtoDelvDispBlocked,
    observed: `Blocked: ${rtoDelvDispBlocked}`,
    expected: 'Rejected'
  });

  let rtoDelvRtoBlocked = false;
  try {
    await fs.processRTO(shpRtoDelv.id, 'restocked', binMain.id, 'system', db);
  } catch (err: any) {
    rtoDelvRtoBlocked = true;
  }
  record({
    name: 'RTO_Delivered terminal: attempt processRTO',
    category: 'TERMINAL_RTO_DELIVERED',
    passed: rtoDelvRtoBlocked,
    observed: `Blocked: ${rtoDelvRtoBlocked}`,
    expected: 'Rejected'
  });

  // =========================================================================
  // CATEGORY 5: Warehouse Boundary Guard on RTO Restock
  // =========================================================================
  console.log('\n--- CATEGORY 5: Warehouse Boundary Guard on RTO Restock ---');
  const shpRtoWh = await client.createShipment({
    shipmentNumber: 'SHP-RTO-WH-BOUNDARY',
    orderReference: 'ORD-WH-BND-1',
    sourceWarehouseId: wh.id,
    customerName: 'Foreign Restock Corp',
    customerPhone: '+8801700000006',
    customerAddress: 'Agrabad',
    destinationCity: 'Chittagong',
    courierName: courier.name,
    items: [{ itemId: item1.id, binId: binMain.id, quantity: 4, unitPrice: 90.0 }]
  });

  await fs.dispatchShipment(shpRtoWh.id, 'TRK-WH-BND', 'system', db);
  await fs.updateShipmentStatus(shpRtoWh.id, 'in_transit', undefined, 'system', db);
  await fs.updateShipmentStatus(shpRtoWh.id, 'return_to_origin', 'Customer absent', 'system', db);

  let foreignBinBlocked = false;
  let foreignBinErr = '';
  try {
    // Attempt to restock into binForeign belonging to foreignWh
    await fs.processRTO(shpRtoWh.id, 'restocked', binForeign.id, 'system', db);
  } catch (err: any) {
    foreignBinBlocked = true;
    foreignBinErr = err.message;
  }
  record({
    name: 'RTO restock targeting a bin from a different warehouse',
    category: 'WAREHOUSE_BOUNDARY',
    passed: foreignBinBlocked && foreignBinErr.includes('does not belong to warehouse'),
    observed: `Blocked: ${foreignBinBlocked}, Error: "${foreignBinErr}"`,
    expected: 'Rejected with Destination bin does not belong to warehouse'
  });

  // =========================================================================
  // SUMMARY SCORECARD
  // =========================================================================
  console.log('\n========================================================================');
  console.log('                 EMPIRICAL NEGATIVE PROBE SCORECARD                     ');
  console.log('========================================================================');
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`Total Probes Executed: ${total}`);
  console.log(`Passed Probes:         ${passed}`);
  console.log(`Failed Probes:         ${failed}`);
  console.log('========================================================================');

  if (failed > 0) {
    console.error(`\n❌ EMPIRICAL CHALLENGE SUCCEEDED (Found ${failed} defects in state machine)`);
    process.exit(1);
  } else {
    console.log('\n✅ ALL NEGATIVE PROBES RESISTED: State machine transition matrix, terminal locking,');
    console.log('   whitespace tracking guards, and RTO invariants are 100% EMPIRICALLY CONFIRMED.');
    process.exit(0);
  }
}

runNegativeProbes().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
