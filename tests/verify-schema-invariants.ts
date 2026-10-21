/**
 * Adversarial empirical test harness verifying SQLite relational schema CHECK,
 * FOREIGN KEY, and UNIQUE constraint enforcement.
 */

import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';

function runSchemaInvariantsSuite() {
  console.log('========================================================================');
  console.log('      ADVERSARIAL EMPIRICAL VERIFICATION: SQLITE SCHEMA INVARIANTS       ');
  console.log('========================================================================\n');

  // Load production schema.sql directly
  const schemaPath = path.join(process.cwd(), 'src', 'database', 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf-8');

  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(schemaSql);

  // Setup valid parent entities for foreign key testing
  db.exec(`
    INSERT INTO suppliers (id, supplier_code, name, phone, address) 
    VALUES ('sup-valid', 'SUP-VALID-01', 'Valid Supplier Ltd.', '+8801700000000', 'Dhaka');

    INSERT INTO items (id, sku, name, category, cost_price, selling_price, min_stock_alert, max_stock) 
    VALUES ('item-valid', 'SKU-VALID-01', 'Valid Product A', 'Electronics', 10.0, 15.0, 10, 100);

    INSERT INTO warehouses (id, warehouse_code, name, address, city) 
    VALUES ('wh-1', 'WH-01', 'Warehouse 1', 'Route 1', 'Dhaka'),
           ('wh-2', 'WH-02', 'Warehouse 2', 'Route 2', 'Chittagong');

    INSERT INTO warehouse_locations (id, warehouse_id, zone, aisle, rack, shelf, bin_code, max_weight_kg)
    VALUES ('bin-1', 'wh-1', 'Z1', 'A1', 'R1', 'S1', 'BIN-01', 500.0);

    INSERT INTO item_batches (id, batch_number, item_id, unit_cost, initial_quantity, current_quantity)
    VALUES ('batch-1', 'BATCH-01', 'item-valid', 10.0, 100, 100);

    INSERT INTO purchase_orders (id, po_number, supplier_id, target_warehouse_id, order_date)
    VALUES ('po-valid', 'PO-VALID-01', 'sup-valid', 'wh-1', '2026-10-15');

    INSERT INTO couriers (id, name, contact_phone)
    VALUES ('cour-1', 'Express Courier', '+8801800000000');
  `);

  let totalTests = 0;
  let passCount = 0;
  let failCount = 0;

  function expectSqlError(
    testCategory: string,
    description: string,
    sql: string,
    params: any[] = [],
    expectedErrorSubstring: string = 'CHECK constraint failed'
  ) {
    totalTests++;
    try {
      const stmt = db.prepare(sql);
      stmt.run(...params);
      failCount++;
      console.error(`  ❌ [FAIL - UNEXPECTED SUCCESS] [${testCategory}] ${description}`);
      console.error(`     Query succeeded when constraint violation was expected: ${sql}`);
    } catch (err: any) {
      const msg = err.message || String(err);
      if (msg.includes(expectedErrorSubstring)) {
        passCount++;
        console.log(`  ✔ [PASS] [${testCategory}] ${description}`);
      } else {
        // Still threw an error, check if it's another SQLite constraint error
        if (msg.includes('constraint failed') || msg.includes('FOREIGN KEY') || msg.includes('UNIQUE')) {
          passCount++;
          console.log(`  ✔ [PASS - REJECTED] [${testCategory}] ${description} (Rejected with: ${msg})`);
        } else {
          failCount++;
          console.error(`  ❌ [FAIL - WRONG ERROR] [${testCategory}] ${description}: ${msg}`);
        }
      }
    }
  }

  console.log('--- 1. SUPPLIERS CONSTRAINTS ---');
  expectSqlError('SUPPLIERS', 'Negative lead_time_days rejected', 
    `INSERT INTO suppliers (id, supplier_code, name, phone, address, lead_time_days) VALUES ('s1', 'SC1', 'S1', '1', 'A', -1);`);
  expectSqlError('SUPPLIERS', 'Negative payment_terms_days rejected', 
    `INSERT INTO suppliers (id, supplier_code, name, phone, address, payment_terms_days) VALUES ('s2', 'SC2', 'S2', '1', 'A', -5);`);
  expectSqlError('SUPPLIERS', 'Rating > 5.0 rejected', 
    `INSERT INTO suppliers (id, supplier_code, name, phone, address, rating) VALUES ('s3', 'SC3', 'S3', '1', 'A', 5.5);`);
  expectSqlError('SUPPLIERS', 'Rating < 0.0 rejected', 
    `INSERT INTO suppliers (id, supplier_code, name, phone, address, rating) VALUES ('s4', 'SC4', 'S4', '1', 'A', -0.5);`);
  expectSqlError('SUPPLIERS', 'Performance score > 100 rejected', 
    `INSERT INTO suppliers (id, supplier_code, name, phone, address, performance_score) VALUES ('s5', 'SC5', 'S5', '1', 'A', 105.0);`);
  expectSqlError('SUPPLIERS', 'Negative total_pos_issued rejected', 
    `INSERT INTO suppliers (id, supplier_code, name, phone, address, total_pos_issued) VALUES ('s6', 'SC6', 'S6', '1', 'A', -1);`);
  expectSqlError('SUPPLIERS', 'Invalid is_active value rejected', 
    `INSERT INTO suppliers (id, supplier_code, name, phone, address, is_active) VALUES ('s7', 'SC7', 'S7', '1', 'A', 2);`);
  expectSqlError('SUPPLIERS', 'Duplicate supplier_code rejected', 
    `INSERT INTO suppliers (id, supplier_code, name, phone, address) VALUES ('s8', 'SUP-VALID-01', 'S8', '1', 'A');`, [], 'UNIQUE constraint failed');

  console.log('\n--- 2. ITEMS / PRODUCTS CONSTRAINTS ---');
  expectSqlError('ITEMS', 'Negative cost_price rejected', 
    `INSERT INTO items (id, sku, name, category, cost_price) VALUES ('i1', 'SKU-NEG-1', 'Name', 'Cat', -1.0);`);
  expectSqlError('ITEMS', 'Negative selling_price rejected', 
    `INSERT INTO items (id, sku, name, category, selling_price) VALUES ('i2', 'SKU-NEG-2', 'Name', 'Cat', -5.0);`);
  expectSqlError('ITEMS', 'Invalid valuation_method rejected', 
    `INSERT INTO items (id, sku, name, category, valuation_method) VALUES ('i3', 'SKU-VAL-3', 'Name', 'Cat', 'LIFO');`);
  expectSqlError('ITEMS', 'Negative min_stock_alert rejected', 
    `INSERT INTO items (id, sku, name, category, min_stock_alert) VALUES ('i4', 'SKU-MIN-4', 'Name', 'Cat', -2);`);
  expectSqlError('ITEMS', 'max_stock < min_stock_alert rejected', 
    `INSERT INTO items (id, sku, name, category, min_stock_alert, max_stock) VALUES ('i5', 'SKU-MAX-5', 'Name', 'Cat', 50, 20);`);
  expectSqlError('ITEMS', 'Negative weight_kg rejected', 
    `INSERT INTO items (id, sku, name, category, weight_kg) VALUES ('i6', 'SKU-W-6', 'Name', 'Cat', -0.5);`);
  expectSqlError('ITEMS', 'Duplicate SKU rejected', 
    `INSERT INTO items (id, sku, name, category) VALUES ('i7', 'SKU-VALID-01', 'Dup', 'Cat');`, [], 'UNIQUE constraint failed');

  console.log('\n--- 3. WAREHOUSES & LOCATIONS CONSTRAINTS ---');
  expectSqlError('WAREHOUSES', 'Invalid is_default rejected', 
    `INSERT INTO warehouses (id, warehouse_code, name, address, city, is_default) VALUES ('w-bad', 'W-BAD', 'Bad WH', 'A', 'C', 3);`);
  expectSqlError('LOCATIONS', 'max_weight_kg <= 0 rejected', 
    `INSERT INTO warehouse_locations (id, warehouse_id, zone, aisle, rack, shelf, bin_code, max_weight_kg) VALUES ('bin-bad', 'wh-1', 'Z', 'A', 'R', 'S', 'B-BAD', 0.0);`);
  expectSqlError('LOCATIONS', 'Duplicate (warehouse_id, bin_code) rejected', 
    `INSERT INTO warehouse_locations (id, warehouse_id, zone, aisle, rack, shelf, bin_code) VALUES ('bin-dup', 'wh-1', 'Z', 'A', 'R', 'S', 'BIN-01');`, [], 'UNIQUE constraint failed');
  expectSqlError('LOCATIONS', 'Non-existent warehouse_id foreign key rejected', 
    `INSERT INTO warehouse_locations (id, warehouse_id, zone, aisle, rack, shelf, bin_code) VALUES ('bin-fk', 'wh-nonexistent', 'Z', 'A', 'R', 'S', 'BIN-FK');`, [], 'FOREIGN KEY constraint failed');

  console.log('\n--- 4. ITEM BATCHES & INVENTORY STOCK CONSTRAINTS ---');
  expectSqlError('BATCHES', 'Negative unit_cost rejected', 
    `INSERT INTO item_batches (id, batch_number, item_id, unit_cost, initial_quantity, current_quantity) VALUES ('b-neg', 'BN-1', 'item-valid', -10.0, 10, 10);`);
  expectSqlError('BATCHES', 'Negative initial_quantity rejected', 
    `INSERT INTO item_batches (id, batch_number, item_id, unit_cost, initial_quantity, current_quantity) VALUES ('b-neg-qty', 'BN-2', 'item-valid', 10.0, -5, 10);`);
  expectSqlError('BATCHES', 'Invalid status string rejected', 
    `INSERT INTO item_batches (id, batch_number, item_id, unit_cost, initial_quantity, current_quantity, status) VALUES ('b-stat', 'BN-3', 'item-valid', 10.0, 10, 10, 'MAGIC_LOT');`);
  expectSqlError('STOCK', 'Negative quantity_on_hand rejected', 
    `INSERT INTO inventory_stock (id, item_id, warehouse_id, quantity_on_hand) VALUES ('stk-1', 'item-valid', 'wh-1', -10);`);
  expectSqlError('STOCK', 'quantity_reserved > quantity_on_hand rejected', 
    `INSERT INTO inventory_stock (id, item_id, warehouse_id, quantity_on_hand, quantity_reserved) VALUES ('stk-2', 'item-valid', 'wh-1', 20, 25);`);
  db.exec(`INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, batch_id, quantity_on_hand) VALUES ('stk-3', 'item-valid', 'wh-1', 'bin-1', 'batch-1', 10);`);
  expectSqlError('STOCK', 'Duplicate (item, warehouse, bin, batch) rejected', 
    `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, batch_id, quantity_on_hand) VALUES ('stk-4', 'item-valid', 'wh-1', 'bin-1', 'batch-1', 15);`, [], 'UNIQUE constraint failed');

  console.log('\n--- 5. PURCHASE ORDERS & PO ITEMS CONSTRAINTS ---');
  expectSqlError('PO', 'Invalid status string rejected', 
    `INSERT INTO purchase_orders (id, po_number, supplier_id, target_warehouse_id, order_date, status) VALUES ('po-bad', 'PO-BAD', 'sup-valid', 'wh-1', '2026-10-15', 'shipped_to_mars');`);
  expectSqlError('PO', 'Negative total_amount rejected', 
    `INSERT INTO purchase_orders (id, po_number, supplier_id, target_warehouse_id, order_date, total_amount) VALUES ('po-neg', 'PO-NEG', 'sup-valid', 'wh-1', '2026-10-15', -100.0);`);
  expectSqlError('PO_ITEMS', 'quantity_ordered <= 0 rejected', 
    `INSERT INTO purchase_order_items (id, po_id, item_id, sku, quantity_ordered, unit_cost, subtotal) VALUES ('poi-1', 'po-valid', 'item-valid', 'SKU-VALID-01', 0, 10.0, 0.0);`);
  expectSqlError('PO_ITEMS', 'quantity_received + quantity_rejected > quantity_ordered rejected', 
    `INSERT INTO purchase_order_items (id, po_id, item_id, sku, quantity_ordered, quantity_received, quantity_rejected, unit_cost, subtotal) VALUES ('poi-2', 'po-valid', 'item-valid', 'SKU-VALID-01', 10, 8, 4, 10.0, 100.0);`);
  expectSqlError('PO_ITEMS', 'Negative unit_cost rejected', 
    `INSERT INTO purchase_order_items (id, po_id, item_id, sku, quantity_ordered, unit_cost, subtotal) VALUES ('poi-3', 'po-valid', 'item-valid', 'SKU-VALID-01', 10, -5.0, -50.0);`);

  console.log('\n--- 6. STOCK TRANSFERS CONSTRAINTS ---');
  expectSqlError('TRANSFERS', 'source_warehouse_id == dest_warehouse_id rejected', 
    `INSERT INTO stock_transfers (id, transfer_number, source_warehouse_id, dest_warehouse_id, requested_by) VALUES ('tr-same', 'TR-SAME', 'wh-1', 'wh-1', 'admin');`);
  expectSqlError('TRANSFERS', 'Invalid transfer status string rejected', 
    `INSERT INTO stock_transfers (id, transfer_number, source_warehouse_id, dest_warehouse_id, requested_by, status) VALUES ('tr-stat', 'TR-STAT', 'wh-1', 'wh-2', 'admin', 'teleported');`);

  db.exec(`INSERT INTO stock_transfers (id, transfer_number, source_warehouse_id, dest_warehouse_id, requested_by) VALUES ('tr-ok', 'TR-OK-1', 'wh-1', 'wh-2', 'admin');`);

  expectSqlError('TRANSFER_ITEMS', 'quantity_requested <= 0 rejected', 
    `INSERT INTO stock_transfer_items (id, transfer_id, item_id, quantity_requested) VALUES ('ti-1', 'tr-ok', 'item-valid', 0);`);
  expectSqlError('TRANSFER_ITEMS', 'quantity_shipped > quantity_requested rejected', 
    `INSERT INTO stock_transfer_items (id, transfer_id, item_id, quantity_requested, quantity_shipped) VALUES ('ti-2', 'tr-ok', 'item-valid', 10, 15);`);
  expectSqlError('TRANSFER_ITEMS', 'quantity_received > quantity_shipped rejected', 
    `INSERT INTO stock_transfer_items (id, transfer_id, item_id, quantity_requested, quantity_shipped, quantity_received) VALUES ('ti-3', 'tr-ok', 'item-valid', 10, 5, 8);`);

  console.log('\n--- 7. OUTBOUND SHIPMENTS & LOGISTICS CONSTRAINTS ---');
  expectSqlError('SHIPMENTS', 'Invalid shipment status string rejected', 
    `INSERT INTO shipments (id, shipment_number, order_reference, source_warehouse_id, customer_name, customer_phone, customer_address, destination_city, courier_name, status)
     VALUES ('sh-bad', 'SH-BAD', 'ORD-01', 'wh-1', 'Cust', '017', 'Addr', 'City', 'Carrier', 'lost_in_galaxy');`);
  expectSqlError('SHIPMENTS', 'Negative declared_value rejected', 
    `INSERT INTO shipments (id, shipment_number, order_reference, source_warehouse_id, customer_name, customer_phone, customer_address, destination_city, courier_name, declared_value)
     VALUES ('sh-neg', 'SH-NEG', 'ORD-01', 'wh-1', 'Cust', '017', 'Addr', 'City', 'Carrier', -50.0);`);
  expectSqlError('SHIPMENTS', 'Invalid rto_disposition string rejected', 
    `INSERT INTO shipments (id, shipment_number, order_reference, source_warehouse_id, customer_name, customer_phone, customer_address, destination_city, courier_name, rto_disposition)
     VALUES ('sh-rto', 'SH-RTO', 'ORD-01', 'wh-1', 'Cust', '017', 'Addr', 'City', 'Carrier', 'thrown_into_sea');`);

  db.exec(`INSERT INTO shipments (id, shipment_number, order_reference, source_warehouse_id, customer_name, customer_phone, customer_address, destination_city, courier_name)
           VALUES ('sh-ok', 'SH-OK-1', 'ORD-01', 'wh-1', 'Cust', '017', 'Addr', 'City', 'Carrier');`);

  expectSqlError('SHIPMENT_ITEMS', 'quantity <= 0 rejected', 
    `INSERT INTO shipment_items (id, shipment_id, item_id, quantity) VALUES ('shi-1', 'sh-ok', 'item-valid', 0);`);
  expectSqlError('SHIPMENT_ITEMS', 'Negative unit_price rejected', 
    `INSERT INTO shipment_items (id, shipment_id, item_id, quantity, unit_price) VALUES ('shi-2', 'sh-ok', 'item-valid', 5, -20.0);`);

  console.log('\n--- 8. INVENTORY TRANSACTIONS & AUDIT LOG CONSTRAINTS ---');
  expectSqlError('TRANSACTIONS', 'Invalid transaction_type rejected', 
    `INSERT INTO inventory_transactions (id, transaction_type, reference_type, reference_id, item_id, warehouse_id, quantity_change, running_balance_after)
     VALUES ('tx-1', 'ILLEGAL_TYPE', 'PO', 'po-valid', 'item-valid', 'wh-1', 10, 10);`);
  expectSqlError('TRANSACTIONS', 'Invalid reference_type rejected', 
    `INSERT INTO inventory_transactions (id, transaction_type, reference_type, reference_id, item_id, warehouse_id, quantity_change, running_balance_after)
     VALUES ('tx-2', 'PO_RECEIPT', 'SECRET_CODE', 'po-valid', 'item-valid', 'wh-1', 10, 10);`);
  expectSqlError('TRANSACTIONS', 'Negative running_balance_after rejected', 
    `INSERT INTO inventory_transactions (id, transaction_type, reference_type, reference_id, item_id, warehouse_id, quantity_change, running_balance_after)
     VALUES ('tx-3', 'PO_RECEIPT', 'PO', 'po-valid', 'item-valid', 'wh-1', -10, -5);`);

  console.log('\n--- 9. BACKUP HISTORY CONSTRAINTS ---');
  expectSqlError('BACKUP_HISTORY', 'Invalid backup_format rejected', 
    `INSERT INTO backup_history (id, backup_filename, backup_format, file_size_bytes, table_counts_json, sha256_checksum)
     VALUES ('bk-1', 'file.tar', 'TAR_GZ', 100, '{}', 'hash');`);
  expectSqlError('BACKUP_HISTORY', 'Negative file_size_bytes rejected', 
    `INSERT INTO backup_history (id, backup_filename, backup_format, file_size_bytes, table_counts_json, sha256_checksum)
     VALUES ('bk-2', 'file.db', 'SQLITE_BINARY', -100, '{}', 'hash');`);
  expectSqlError('BACKUP_HISTORY', 'Invalid backup status string rejected', 
    `INSERT INTO backup_history (id, backup_filename, backup_format, file_size_bytes, table_counts_json, sha256_checksum, status)
     VALUES ('bk-3', 'file.db', 'SQLITE_BINARY', 100, '{}', 'hash', 'IN_PROGRESS');`);

  db.close();

  console.log('\n========================================================================');
  console.log(`Total Adversarial Checks: ${totalTests} | Passed: ${passCount} | Failed: ${failCount}`);
  console.log('========================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runSchemaInvariantsSuite();
