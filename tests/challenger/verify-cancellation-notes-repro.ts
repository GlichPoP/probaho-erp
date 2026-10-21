import { DatabaseService } from '../../src/services/db.ts';
import { TransferService } from '../../src/services/transferService.ts';

async function test() {
  const db = new DatabaseService(':memory:');
  await db.initialize();
  const tr = TransferService.getInstance();
  await db.execute("INSERT INTO warehouses (id, warehouse_code, name, address, city, is_default, is_active) VALUES ('w1', 'W1', 'N1', 'A1', 'C1', 1, 1), ('w2', 'W2', 'N2', 'A2', 'C2', 0, 1)");
  await db.execute("INSERT INTO items (id, sku, name, category, cost_price, selling_price, is_active) VALUES ('i1', 'S1', 'N1', 'C1', 10, 20, 1)");
  const created = await tr.createTransfer({
    transferNumber: 'TR-TEST',
    sourceWarehouseId: 'w1',
    destWarehouseId: 'w2',
    notes: 'Has existing notes',
    items: [{ itemId: 'i1', quantityRequested: 5 }]
  }, db);

  await tr.cancelTransfer(created.id, 'Cancel Reason', 'Tester', db);
  const res = await tr.getTransferById(created.id, db);
  console.log('CANCEL STATUS:', res?.status);
  console.log('NOTES:', JSON.stringify(res?.notes));
}

test().catch(e => {
  console.error('FAILED:', e);
  process.exit(1);
});
