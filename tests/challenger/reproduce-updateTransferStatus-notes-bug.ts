import { DatabaseService } from '../../src/services/db.ts';
import { TransferService } from '../../src/services/transferService.ts';

async function reproduce() {
  console.log('=== EMPIRICAL REPRODUCTION: updateTransferStatus with notes ===');
  const db = new DatabaseService(':memory:');
  await db.initialize();
  const tr = TransferService.getInstance();

  await db.execute(
    `INSERT INTO warehouses (id, warehouse_code, name, address, city, is_default, is_active)
     VALUES ('w1', 'W1', 'Warehouse 1', 'Address 1', 'City 1', 1, 1),
            ('w2', 'W2', 'Warehouse 2', 'Address 2', 'City 2', 0, 1)`
  );
  await db.execute(
    `INSERT INTO items (id, sku, name, category, cost_price, selling_price, is_active)
     VALUES ('i1', 'SKU-1', 'Item 1', 'General', 10, 20, 1)`
  );

  const created = await tr.createTransfer(
    {
      transferNumber: 'TR-BUG-REPRO',
      sourceWarehouseId: 'w1',
      destWarehouseId: 'w2',
      notes: 'Initial transfer note',
      items: [{ itemId: 'i1', quantityRequested: 5 }]
    },
    db
  );

  console.log('1. Initial Transfer State:', { id: created.id, status: created.status, notes: created.notes });

  // Call updateTransferStatus with new status 'requested' and a note
  console.log('2. Calling updateTransferStatus with notes: "Status update note"');
  const updated = await tr.updateTransferStatus(
    created.id,
    'requested',
    'Manager',
    'Status update note',
    db
  );

  console.log('3. Result returned by updateTransferStatus:', {
    id: updated.id,
    status: updated.status,
    notes: updated.notes
  });

  // Query raw database directly
  const rawRows = await db.query<any>('SELECT id, status, notes, updated_at FROM stock_transfers WHERE id = ?', [created.id]);
  console.log('4. Raw Database Row:', rawRows[0]);

  if (rawRows[0].status !== 'requested') {
    console.error('\n❌ [BUG CONFIRMED]: Transfer status was NOT updated to "requested"! Current status is still "' + rawRows[0].status + '".');
    console.error('Reason: SQL placeholder mismatch in transferService.ts:488-490.');
    console.error('Line 488 defines TWO "?" placeholders, but line 489 pushes only ONE parameter to params array.');
    console.error('This causes WHERE id = ? to receive undefined/NULL, silently updating 0 rows.\n');
    process.exit(1);
  } else {
    console.log('✅ Transfer status updated successfully.');
  }
}

reproduce().catch((err) => {
  console.error('REPRODUCTION CRASHED:', err);
  process.exit(1);
});
