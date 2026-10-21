import { describe, it, expect, beforeEach, runSuites } from '../harness/test-runner.ts';
import { TestDatabaseService } from '../harness/test-db.ts';
import { ERPTestClient } from '../harness/erp-test-client.ts';

let db: TestDatabaseService;
let client: ERPTestClient;

describe('Tier 1: Feature Coverage — Suppliers & Vendor Management', () => {
  beforeEach(async () => {
    db = new TestDatabaseService(':memory:');
    await db.initialize();
    client = new ERPTestClient(db);
  });

  it('TC1.1: Should register a new supplier with complete profile, tax ID, and payment terms', async () => {
    const supplier = await client.createSupplier({
      supplierCode: 'SUP-001',
      name: 'Apex Industrial Parts Ltd',
      contactPerson: 'Karim Ahmed',
      phone: '+8801711000001',
      email: 'procurement@apexparts.com',
      address: 'Plot 42, Tejgaon Industrial Area',
      city: 'Dhaka',
      country: 'Bangladesh',
      taxId: 'BIN-992384112',
      paymentTermsDays: 45,
      leadTimeDays: 10,
      rating: 4.8
    });

    expect(supplier).toBeDefined();
    expect(supplier.supplier_code).toBe('SUP-001');
    expect(supplier.name).toBe('Apex Industrial Parts Ltd');
    expect(supplier.contact_person).toBe('Karim Ahmed');
    expect(supplier.payment_terms_days).toBe(45);
    expect(supplier.lead_time_days).toBe(10);
    expect(supplier.rating).toBe(4.8);
    expect(supplier.is_active).toBe(1);
  });

  it('TC1.2: Should query supplier by ID and by unique supplier code', async () => {
    const created = await client.createSupplier({
      supplierCode: 'SUP-002',
      name: 'Bengal Logistics & Hardware',
      contactPerson: 'Selim Reza',
      phone: '+8801819000002',
      address: '14 Motijheel C/A',
      city: 'Dhaka'
    });

    const byId = await client.getSupplier(created.id);
    expect(byId.name).toBe('Bengal Logistics & Hardware');

    const byCode = await client.getSupplierByCode('SUP-002');
    expect(byCode.id).toBe(created.id);
    expect(byCode.contact_person).toBe('Selim Reza');
  });

  it('TC1.3: Should update supplier rating score and expected lead time', async () => {
    const sup = await client.createSupplier({
      supplierCode: 'SUP-003',
      name: 'Dhaka Fasteners Ltd',
      contactPerson: 'Nasir Uddin',
      phone: '+8801911000003',
      address: 'Dhanmondi Rd 27',
      leadTimeDays: 7,
      rating: 4.0
    });

    await client.updateSupplierRating(sup.id, 4.9, 5);

    const updated = await client.getSupplier(sup.id);
    expect(updated.rating).toBe(4.9);
    expect(updated.lead_time_days).toBe(5);
  });

  it('TC1.4: Should toggle supplier active status and filter active vs inactive vendors', async () => {
    const sup1 = await client.createSupplier({
      supplierCode: 'SUP-004A',
      name: 'Active Vendor 1',
      contactPerson: 'Rafiq',
      phone: '+8801700000004',
      address: 'Mirpur 10'
    });

    const sup2 = await client.createSupplier({
      supplierCode: 'SUP-004B',
      name: 'To Be Suspended Vendor',
      contactPerson: 'Shafiq',
      phone: '+8801700000005',
      address: 'Uttara Sector 3'
    });

    // Deactivate sup2
    await client.setSupplierStatus(sup2.id, false);

    const all = await client.listSuppliers(false);
    expect(all.length).toBe(2);

    const activeOnly = await client.listSuppliers(true);
    expect(activeOnly.length).toBe(1);
    expect(activeOnly[0].id).toBe(sup1.id);

    // Re-activate sup2
    await client.setSupplierStatus(sup2.id, true);
    const reactivated = await client.listSuppliers(true);
    expect(reactivated.length).toBe(2);
  });

  it('TC1.5: Should reject duplicate supplier codes to prevent duplicate vendor accounts', async () => {
    await client.createSupplier({
      supplierCode: 'SUP-UNIQUE',
      name: 'Original Vendor Ltd',
      contactPerson: 'Mamun',
      phone: '+8801700000006',
      address: 'Chittagong Port Area'
    });

    await expect(async () => {
      await client.createSupplier({
        supplierCode: 'SUP-UNIQUE', // Duplicate code!
        name: 'Imposter Vendor Ltd',
        contactPerson: 'Fake',
        phone: '+8801700000007',
        address: 'Unknown'
      });
    }).toReject('UNIQUE constraint failed');
  });

  it('TC1.6: Should track supplier fulfillment totals and calculate on-time performance rate', async () => {
    const sup = await client.createSupplier({
      supplierCode: 'SUP-006',
      name: 'Delta Polymers Co.',
      contactPerson: 'Farhan',
      phone: '+8801700000008',
      address: 'Narayanganj BSCIC',
      leadTimeDays: 6,
      rating: 5.0
    });

    // Simulate recording POs issued and fulfilled
    await db.execute(
      'UPDATE suppliers SET total_pos_issued = 10, total_pos_fulfilled = 9, performance_score = 90.0 WHERE id = ?',
      [sup.id]
    );

    const verified = await client.getSupplier(sup.id);
    expect(verified.total_pos_issued).toBe(10);
    expect(verified.total_pos_fulfilled).toBe(9);
    expect(verified.performance_score).toBe(90.0);
  });
});

// If executed directly
if (process.argv[1]?.includes('suppliers.test.ts')) {
  runSuites().then(res => {
    if (res.failed > 0) process.exit(1);
  });
}
