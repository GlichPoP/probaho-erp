/**
 * Unit Test Suite for SupplierService
 * Target File: tests/unit/supplierService.test.ts
 * Milestone 2 - Suppliers & Procurement Core Domain
 *
 * Test Matrix:
 * - TC-SUP-01: Create supplier with full profile and valid defaults
 * - TC-SUP-02: Apply system defaults for optional fields (terms, lead time, rating, score)
 * - TC-SUP-03: Query supplier by ID and unique supplier code
 * - TC-SUP-04: Filter suppliers (activeOnly, keyword search, sortBy, sortOrder, pagination)
 * - TC-SUP-05: Partial profile attribute updates
 * - TC-SUP-06: Performance tracking (rating 0-5, lead-time days, performance score 0-100)
 * - TC-SUP-07: Hard delete supplier when no foreign references exist
 * - TC-SUP-08: Soft delete (deactivate) supplier when referenced by POs/batches
 * - TC-SUP-09: Reject forced hard deletion when foreign key references exist
 * - TC-SUP-10: Enforce UNIQUE constraint on supplier code
 * - TC-SUP-11: Validate constraints (rating range, non-negative terms, mandatory fields)
 * - TC-SUP-12: Aggregate supplier metrics (total POs, fulfillment rate, total spend)
 */

import { describe, it, expect, beforeEach, runSuites } from '../harness/test-runner.ts';
import { TestDatabaseService } from '../harness/test-db.ts';
import { SupplierService } from '../../src/services/supplierService.ts';

let db: TestDatabaseService;
let service: SupplierService;

describe('Unit Test: SupplierService (Vendor Management & Tracking)', () => {
  beforeEach(async () => {
    db = new TestDatabaseService(':memory:');
    await db.initialize();
    service = new SupplierService();
  });

  it('TC-SUP-01: Should create a supplier with complete profile and valid defaults', async () => {
    const created = await service.createSupplier(
      {
        supplierCode: 'SUP-TEST-001',
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
        rating: 4.8,
        notes: 'Primary mechanical supplier'
      },
      db
    );

    expect(created).toBeDefined();
    expect(created.supplier_code).toBe('SUP-TEST-001');
    expect(created.name).toBe('Apex Industrial Parts Ltd');
    expect(created.contact_person).toBe('Karim Ahmed');
    expect(created.phone).toBe('+8801711000001');
    expect(created.email).toBe('procurement@apexparts.com');
    expect(created.address).toBe('Plot 42, Tejgaon Industrial Area');
    expect(created.city).toBe('Dhaka');
    expect(created.country).toBe('Bangladesh');
    expect(created.tax_id).toBe('BIN-992384112');
    expect(created.payment_terms_days).toBe(45);
    expect(created.lead_time_days).toBe(10);
    expect(created.rating).toBe(4.8);
    expect(created.performance_score).toBe(100.0);
    expect(created.is_active).toBe(1);
    expect(created.notes).toBe('Primary mechanical supplier');
  });

  it('TC-SUP-02: Should apply sensible enterprise defaults when optional fields are omitted', async () => {
    const created = await service.createSupplier(
      {
        supplierCode: 'SUP-DEFAULT-01',
        name: 'Bengal Fasteners Co.',
        phone: '+8801819000002',
        address: '14 Motijheel C/A'
      },
      db
    );

    expect(created.supplier_code).toBe('SUP-DEFAULT-01');
    expect(created.name).toBe('Bengal Fasteners Co.');
    expect(created.city).toBe('Dhaka');
    expect(created.country).toBe('Bangladesh');
    expect(created.contact_person).toBeNull();
    expect(created.email).toBeNull();
    expect(created.tax_id).toBeNull();
    expect(created.payment_terms_days).toBe(30);
    expect(created.lead_time_days).toBe(7);
    expect(created.rating).toBe(5.0);
    expect(created.performance_score).toBe(100.0);
    expect(created.total_pos_issued).toBe(0);
    expect(created.total_pos_fulfilled).toBe(0);
    expect(created.is_active).toBe(1);
  });

  it('TC-SUP-03: Should query supplier by ID and by unique supplier code', async () => {
    const created = await service.createSupplier(
      {
        supplierCode: 'SUP-SEARCH-01',
        name: 'Dhaka Hardware & Metals',
        contactPerson: 'Selim Reza',
        phone: '+8801911000003',
        address: 'Dhanmondi Rd 27'
      },
      db
    );

    const byId = await service.getSupplierById(created.id, db);
    expect(byId).toBeDefined();
    expect(byId?.id).toBe(created.id);
    expect(byId?.name).toBe('Dhaka Hardware & Metals');

    const byCode = await service.getSupplierByCode('SUP-SEARCH-01', db);
    expect(byCode).toBeDefined();
    expect(byCode?.id).toBe(created.id);
    expect(byCode?.contact_person).toBe('Selim Reza');

    const notFound = await service.getSupplierById('non-existent-id', db);
    expect(notFound).toBeNull();

    const notFoundCode = await service.getSupplierByCode('SUP-NON-EXISTENT', db);
    expect(notFoundCode).toBeNull();
  });

  it('TC-SUP-04: Should filter suppliers by active status, search keywords, and sort orders', async () => {
    await service.createSupplier(
      {
        supplierCode: 'SUP-A1',
        name: 'Alpha Pneumatics Ltd',
        contactPerson: 'Ali Khan',
        phone: '+8801700000010',
        address: 'Gazipur',
        city: 'Gazipur',
        rating: 4.2
      },
      db
    );

    const supB = await service.createSupplier(
      {
        supplierCode: 'SUP-B2',
        name: 'Beta Bearings Corp',
        contactPerson: 'Bashir Ahmed',
        phone: '+8801700000020',
        address: 'Chittagong Port',
        city: 'Chittagong',
        rating: 4.9
      },
      db
    );

    const supC = await service.createSupplier(
      {
        supplierCode: 'SUP-C3',
        name: 'Gamma Lubricants',
        contactPerson: 'Gias Uddin',
        phone: '+8801700000030',
        address: 'Dhaka',
        city: 'Dhaka',
        rating: 3.8
      },
      db
    );

    await service.setSupplierStatus(supB.id, false, db);

    const all = await service.getAllSuppliers({}, db);
    expect(all.length).toBe(3);

    const active = await service.getAllSuppliers({ activeOnly: true }, db);
    expect(active.length).toBe(2);
    expect(active.some(s => s.id === supB.id)).toBe(false);

    const chittagong = await service.getAllSuppliers({ search: 'Chittagong' }, db);
    expect(chittagong.length).toBe(1);
    expect(chittagong[0].id).toBe(supB.id);

    const ali = await service.getAllSuppliers({ search: 'Ali' }, db);
    expect(ali.length).toBe(1);
    expect(ali[0].name).toBe('Alpha Pneumatics Ltd');

    const sortedRating = await service.getAllSuppliers({ sortBy: 'rating', sortOrder: 'DESC' }, db);
    expect(sortedRating[0].supplier_code).toBe('SUP-B2');
    expect(sortedRating[2].supplier_code).toBe('SUP-C3');

    const paged = await service.getAllSuppliers({ limit: 2, offset: 0 }, db);
    expect(paged.length).toBe(2);
  });

  it('TC-SUP-05: Should partially update supplier profile attributes', async () => {
    const created = await service.createSupplier(
      {
        supplierCode: 'SUP-UPDATE-01',
        name: 'Initial Name Ltd',
        phone: '+8801700000040',
        address: 'Old Address'
      },
      db
    );

    const updated = await service.updateSupplier(
      created.id,
      {
        name: 'Updated Enterprise Ltd',
        contactPerson: 'New Manager',
        phone: '+8801700000049',
        address: 'New Factory Zone',
        paymentTermsDays: 60,
        leadTimeDays: 14,
        notes: 'Upgraded credit terms'
      },
      db
    );

    expect(updated.name).toBe('Updated Enterprise Ltd');
    expect(updated.contact_person).toBe('New Manager');
    expect(updated.phone).toBe('+8801700000049');
    expect(updated.address).toBe('New Factory Zone');
    expect(updated.payment_terms_days).toBe(60);
    expect(updated.lead_time_days).toBe(14);
    expect(updated.notes).toBe('Upgraded credit terms');
  });

  it('TC-SUP-06: Should update supplier star rating and lead time performance tracking', async () => {
    const created = await service.createSupplier(
      {
        supplierCode: 'SUP-PERF-01',
        name: 'Speedy Components Co.',
        phone: '+8801700000050',
        address: 'Gazipur BSCIC',
        rating: 4.0,
        leadTimeDays: 10
      },
      db
    );

    const updated = await service.updateSupplierPerformance(created.id, 4.9, 5, 98.5, db);
    expect(updated.rating).toBe(4.9);
    expect(updated.lead_time_days).toBe(5);
    expect(updated.performance_score).toBe(98.5);

    const refreshed = await service.getSupplierById(created.id, db);
    expect(refreshed?.rating).toBe(4.9);
    expect(refreshed?.lead_time_days).toBe(5);
    expect(refreshed?.performance_score).toBe(98.5);
  });

  it('TC-SUP-07: Should hard-delete supplier when no foreign references exist', async () => {
    const created = await service.createSupplier(
      {
        supplierCode: 'SUP-DEL-01',
        name: 'Temporary Supplier',
        phone: '+8801700000060',
        address: 'Dhaka'
      },
      db
    );

    const result = await service.deleteSupplier(created.id, {}, db);
    expect(result.success).toBe(true);
    expect(result.softDeleted).toBe(false);

    const check = await service.getSupplierById(created.id, db);
    expect(check).toBeNull();
  });

  it('TC-SUP-08: Should automatically soft-delete (deactivate) supplier when purchase orders reference it', async () => {
    const sup = await service.createSupplier(
      {
        supplierCode: 'SUP-FK-01',
        name: 'Critical Vendor Ltd',
        phone: '+8801700000070',
        address: 'Narayanganj'
      },
      db
    );

    await db.execute(
      "INSERT INTO warehouses (id, warehouse_code, name, address, city) VALUES ('wh-sup-test', 'WH-S1', 'Hub', 'Dhaka', 'Dhaka')"
    );
    await db.execute(
      "INSERT INTO purchase_orders (id, po_number, supplier_id, target_warehouse_id, status, order_date, subtotal, total_amount) VALUES ('po-sup-test', 'PO-SUP-01', ?, 'wh-sup-test', 'draft', '2026-10-15', 500, 500)",
      [sup.id]
    );

    const result = await service.deleteSupplier(sup.id, {}, db);
    expect(result.success).toBe(true);
    expect(result.softDeleted).toBe(true);

    const refreshed = await service.getSupplierById(sup.id, db);
    expect(refreshed).toBeDefined();
    expect(refreshed?.is_active).toBe(0);
  });

  it('TC-SUP-09: Should reject forced hard deletion when purchase orders reference the supplier', async () => {
    const sup = await service.createSupplier(
      {
        supplierCode: 'SUP-FK-FORCE-01',
        name: 'Force Delete Test Vendor',
        phone: '+8801700000075',
        address: 'Narayanganj'
      },
      db
    );

    await db.execute(
      "INSERT INTO warehouses (id, warehouse_code, name, address, city) VALUES ('wh-sup-test2', 'WH-S2', 'Hub 2', 'Dhaka', 'Dhaka')"
    );
    await db.execute(
      "INSERT INTO purchase_orders (id, po_number, supplier_id, target_warehouse_id, status, order_date, subtotal, total_amount) VALUES ('po-sup-test2', 'PO-SUP-02', ?, 'wh-sup-test2', 'draft', '2026-10-15', 500, 500)",
      [sup.id]
    );

    await expect(async () => {
      await service.deleteSupplier(sup.id, { force: true }, db);
    }).toReject('Cannot hard delete supplier');
  });

  it('TC-SUP-10: Should reject duplicate supplier codes to preserve unique vendor identities', async () => {
    await service.createSupplier(
      {
        supplierCode: 'SUP-UNIQUE-TEST',
        name: 'First Vendor',
        phone: '+8801700000080',
        address: 'Dhaka'
      },
      db
    );

    await expect(async () => {
      await service.createSupplier(
        {
          supplierCode: 'SUP-UNIQUE-TEST',
          name: 'Second Vendor',
          phone: '+8801700000081',
          address: 'Chittagong'
        },
        db
      );
    }).toReject('UNIQUE constraint failed');
  });

  it('TC-SUP-11: Should validate rating bounds (0.0 <= rating <= 5.0) and payment terms (>= 0)', async () => {
    await expect(async () => {
      await service.createSupplier(
        {
          supplierCode: 'SUP-BAD-RATING-1',
          name: 'Invalid Rating',
          phone: '+8801700000090',
          address: 'Dhaka',
          rating: 6.0
        },
        db
      );
    }).toReject('Supplier rating must be between 0.0 and 5.0');

    await expect(async () => {
      await service.createSupplier(
        {
          supplierCode: 'SUP-BAD-RATING-2',
          name: 'Negative Rating',
          phone: '+8801700000091',
          address: 'Dhaka',
          rating: -1.0
        },
        db
      );
    }).toReject('Supplier rating must be between 0.0 and 5.0');

    await expect(async () => {
      await service.createSupplier(
        {
          supplierCode: 'SUP-BAD-TERMS',
          name: 'Negative Terms',
          phone: '+8801700000092',
          address: 'Dhaka',
          paymentTermsDays: -5
        },
        db
      );
    }).toReject('Payment terms days cannot be negative');

    await expect(async () => {
      await service.createSupplier(
        {
          supplierCode: 'SUP-EMPTY-NAME',
          name: '   ',
          phone: '+8801700000093',
          address: 'Dhaka'
        },
        db
      );
    }).toReject('Supplier name is mandatory');
  });

  it('TC-SUP-12: Should calculate supplier fulfillment rates and cumulative spend correctly', async () => {
    const sup = await service.createSupplier(
      {
        supplierCode: 'SUP-STATS-01',
        name: 'Delta Plastics Ltd',
        phone: '+8801700000100',
        address: 'Tongi BSCIC'
      },
      db
    );

    await db.execute(
      "INSERT INTO warehouses (id, warehouse_code, name, address, city) VALUES ('wh-stats-1', 'WH-ST1', 'Main Hub', 'Dhaka', 'Dhaka')"
    );

    await db.execute(
      "INSERT INTO purchase_orders (id, po_number, supplier_id, target_warehouse_id, status, order_date, total_amount) VALUES ('po-st-1', 'PO-ST-1', ?, 'wh-stats-1', 'received', '2026-10-01', 1200)",
      [sup.id]
    );
    await db.execute(
      "INSERT INTO purchase_orders (id, po_number, supplier_id, target_warehouse_id, status, order_date, total_amount) VALUES ('po-st-2', 'PO-ST-2', ?, 'wh-stats-1', 'received', '2026-10-05', 800)",
      [sup.id]
    );
    await db.execute(
      "INSERT INTO purchase_orders (id, po_number, supplier_id, target_warehouse_id, status, order_date, total_amount) VALUES ('po-st-3', 'PO-ST-3', ?, 'wh-stats-1', 'ordered', '2026-10-10', 1500)",
      [sup.id]
    );

    const stats = await service.getSupplierStats(sup.id, db);
    expect(stats.totalPosIssued).toBe(3);
    expect(stats.totalPosFulfilled).toBe(2);
    expect(stats.activePosCount).toBe(1);
    expect(stats.totalSpend).toBe(3500);
    expect(stats.fulfillmentRate).toBe(66.7);
  });
});

if (process.argv[1]?.includes('supplierService.test.ts')) {
  runSuites().then(res => {
    if (res.failed > 0) process.exit(1);
  });
}
