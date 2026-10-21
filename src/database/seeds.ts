// ============================================================================
// PROBAHO ERP: INITIAL SEED DATASET
// File: src/database/seeds.ts
// Populates representative warehouses, bins, suppliers, SKUs, and stock
// ============================================================================

import type { IDatabaseService } from '../services/db';

export async function initialSeedScript(db: IDatabaseService): Promise<void> {
  // Check if database is already seeded
  const existingWarehouses = await db.query("SELECT COUNT(*) as count FROM warehouses;");
  if (existingWarehouses.length > 0 && Number(existingWarehouses[0].count) > 0) {
    return; // Already seeded
  }

  await db.transaction(async (tx) => {
    // ------------------------------------------------------------------------
    // 1. Warehouses (3 Facilities)
    // ------------------------------------------------------------------------
    const warehouses = [
      {
        id: 'wh-central-dc',
        warehouse_code: 'WH-CENTRAL',
        name: 'Main Central Distribution Center',
        address: 'Plot 45-48, Tejgaon Industrial Area',
        city: 'Dhaka',
        district: 'Dhaka',
        contact_person: 'Anisur Rahman (Operations Director)',
        contact_phone: '+880 1711-889900',
        is_default: 1,
      },
      {
        id: 'wh-north-depot',
        warehouse_code: 'WH-NORTH',
        name: 'North Regional Depot',
        address: 'Bishwa Road, Banani Mor',
        city: 'Bogura',
        district: 'Bogura',
        contact_person: 'Mokhlesur Rahman (Depot Manager)',
        contact_phone: '+880 1819-776655',
        is_default: 0,
      },
      {
        id: 'wh-port-terminal',
        warehouse_code: 'WH-PORT',
        name: 'Chittagong Port Terminal Hub',
        address: 'Agrabad Commercial Area, Strand Road',
        city: 'Chittagong',
        district: 'Chittagong',
        contact_person: 'Kaiser Hamid (Maritime Logistics)',
        contact_phone: '+880 1912-334455',
        is_default: 0,
      },
    ];

    for (const w of warehouses) {
      await tx.execute(
        `INSERT INTO warehouses (id, warehouse_code, name, address, city, district, contact_person, contact_phone, is_default, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1);`,
        [w.id, w.warehouse_code, w.name, w.address, w.city, w.district, w.contact_person, w.contact_phone, w.is_default]
      );
    }

    // ------------------------------------------------------------------------
    // 2. Warehouse Locations & Bins (7 Bins)
    // ------------------------------------------------------------------------
    const bins = [
      {
        id: 'bin-ctr-01',
        warehouse_id: 'wh-central-dc',
        zone: 'Zone A - Receiving & Fast Pick',
        aisle: 'Aisle 01',
        rack: 'Rack 01',
        shelf: 'Shelf 01',
        bin_code: 'WH-CTR-ZA-A01-R01-B01',
        max_weight_kg: 500.0,
      },
      {
        id: 'bin-ctr-02',
        warehouse_id: 'wh-central-dc',
        zone: 'Zone A - Receiving & Fast Pick',
        aisle: 'Aisle 01',
        rack: 'Rack 01',
        shelf: 'Shelf 02',
        bin_code: 'WH-CTR-ZA-A01-R01-B02',
        max_weight_kg: 500.0,
      },
      {
        id: 'bin-ctr-03',
        warehouse_id: 'wh-central-dc',
        zone: 'Zone B - Bulk Pallet Storage',
        aisle: 'Aisle 04',
        rack: 'Rack 02',
        shelf: 'Shelf 01',
        bin_code: 'WH-CTR-ZB-A04-R02-B01',
        max_weight_kg: 2000.0,
      },
      {
        id: 'bin-ctr-04',
        warehouse_id: 'wh-central-dc',
        zone: 'Zone C - Secure Small Trims',
        aisle: 'Aisle 08',
        rack: 'Rack 01',
        shelf: 'Shelf 03',
        bin_code: 'WH-CTR-ZC-A08-R01-B03',
        max_weight_kg: 100.0,
      },
      {
        id: 'bin-nrd-01',
        warehouse_id: 'wh-north-depot',
        zone: 'Zone A - Retail Replenishment',
        aisle: 'Aisle 01',
        rack: 'Rack 01',
        shelf: 'Shelf 01',
        bin_code: 'WH-NRD-ZA-A01-R01-B01',
        max_weight_kg: 750.0,
      },
      {
        id: 'bin-nrd-02',
        warehouse_id: 'wh-north-depot',
        zone: 'Zone A - Retail Replenishment',
        aisle: 'Aisle 01',
        rack: 'Rack 02',
        shelf: 'Shelf 01',
        bin_code: 'WH-NRD-ZA-A01-R02-B01',
        max_weight_kg: 750.0,
      },
      {
        id: 'bin-prt-01',
        warehouse_id: 'wh-port-terminal',
        zone: 'Zone A - Maritime Container Inflow',
        aisle: 'Aisle 01',
        rack: 'Rack 01',
        shelf: 'Shelf 01',
        bin_code: 'WH-PRT-ZA-DOCK-B01',
        max_weight_kg: 5000.0,
      },
    ];

    for (const b of bins) {
      await tx.execute(
        `INSERT INTO warehouse_locations (id, warehouse_id, zone, aisle, rack, shelf, bin_code, max_weight_kg, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1);`,
        [b.id, b.warehouse_id, b.zone, b.aisle, b.rack, b.shelf, b.bin_code, b.max_weight_kg]
      );
    }

    // ------------------------------------------------------------------------
    // 3. Suppliers (4 Strategic Partners)
    // ------------------------------------------------------------------------
    const suppliers = [
      {
        id: 'sup-bengal-textile',
        supplier_code: 'SUP-TEX-001',
        name: 'Bengal Textile & Weaving Mills Ltd.',
        contact_person: 'Md. Rafiqul Islam',
        email: 'orders@bengaltextile.com',
        phone: '+880 1711-200101',
        address: 'Plot 12-14, Savar EPZ Industrial Zone',
        city: 'Dhaka',
        country: 'Bangladesh',
        tax_id: 'TIN-99482019-BGD',
        payment_terms_days: 30,
        lead_time_days: 5,
        rating: 4.8,
        performance_score: 96.0,
      },
      {
        id: 'sup-universal-pkg',
        supplier_code: 'SUP-PKG-002',
        name: 'Universal Packaging & Corrugated Cartons',
        contact_person: 'Farhana Sultana',
        email: 'sales@universalpackaging.bd',
        phone: '+880 1819-300202',
        address: 'BSCIC Industrial Estate, Tongi',
        city: 'Gazipur',
        country: 'Bangladesh',
        tax_id: 'TIN-48201928-BGD',
        payment_terms_days: 15,
        lead_time_days: 3,
        rating: 4.9,
        performance_score: 98.0,
      },
      {
        id: 'sup-dhaka-fasteners',
        supplier_code: 'SUP-ACC-003',
        name: 'Dhaka Precision Fasteners & Trims',
        contact_person: 'Kamal Hossain',
        email: 'info@dhakafasteners.com',
        phone: '+880 1912-400303',
        address: '42 Dholairpar High Road',
        city: 'Dhaka',
        country: 'Bangladesh',
        tax_id: 'TIN-33291048-BGD',
        payment_terms_days: 30,
        lead_time_days: 7,
        rating: 4.5,
        performance_score: 90.0,
      },
      {
        id: 'sup-apex-global',
        supplier_code: 'SUP-IMP-004',
        name: 'Apex Global Synthetic Blends & Spares',
        contact_person: 'Tanvir Ahmed',
        email: 'procure@apexglobal.com.bd',
        phone: '+880 1611-500404',
        address: 'Sector 3, CEPZ Road',
        city: 'Chittagong',
        country: 'Bangladesh',
        tax_id: 'TIN-11928374-BGD',
        payment_terms_days: 45,
        lead_time_days: 14,
        rating: 4.6,
        performance_score: 92.0,
      },
    ];

    for (const s of suppliers) {
      await tx.execute(
        `INSERT INTO suppliers (id, supplier_code, name, contact_person, email, phone, address, city, country, tax_id, payment_terms_days, lead_time_days, rating, performance_score, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1);`,
        [s.id, s.supplier_code, s.name, s.contact_person, s.email, s.phone, s.address, s.city, s.country, s.tax_id, s.payment_terms_days, s.lead_time_days, s.rating, s.performance_score]
      );
    }

    // ------------------------------------------------------------------------
    // 4. Items & Product Catalog (6 SKUs)
    // ------------------------------------------------------------------------
    const items = [
      {
        id: 'item-yarn-100',
        sku: 'SKU-CTN-WHT-100',
        barcode: '8941001001',
        name: 'Premium Combed Cotton Yarn 100m Spool',
        description: 'High-tensile combed ring-spun cotton yarn for luxury knitwear.',
        category: 'Raw Materials',
        unit_of_measure: 'spool',
        cost_price: 12.50,
        selling_price: 22.00,
        valuation_method: 'MOVING_AVERAGE',
        min_stock_alert: 25,
        safety_stock: 15,
        max_stock: 500,
        weight_kg: 0.45,
      },
      {
        id: 'item-box-med',
        sku: 'SKU-BOX-MED-050',
        barcode: '8941002002',
        name: 'Standard Corrugated Shipping Carton (M)',
        description: '3-ply recyclable export-grade packaging box (12x10x8 inch).',
        category: 'Packaging',
        unit_of_measure: 'box',
        cost_price: 0.85,
        selling_price: 1.90,
        valuation_method: 'MOVING_AVERAGE',
        min_stock_alert: 100,
        safety_stock: 50,
        max_stock: 2000,
        weight_kg: 0.20,
      },
      {
        id: 'item-polo-navy-l',
        sku: 'SKU-POLO-NAVY-L',
        barcode: '8941003003',
        name: 'Executive Pique Polo Shirt - Navy (L)',
        description: '220 GSM breathable organic pique cotton polo with ribbed collar.',
        category: 'Finished Goods',
        unit_of_measure: 'pcs',
        cost_price: 8.50,
        selling_price: 24.00,
        valuation_method: 'FIFO',
        min_stock_alert: 20,
        safety_stock: 10,
        max_stock: 400,
        weight_kg: 0.30,
      },
      {
        id: 'item-polo-blk-m',
        sku: 'SKU-POLO-BLK-M',
        barcode: '8941004004',
        name: 'Executive Pique Polo Shirt - Black (M)',
        description: '220 GSM breathable organic pique cotton polo with ribbed collar.',
        category: 'Finished Goods',
        unit_of_measure: 'pcs',
        cost_price: 8.50,
        selling_price: 24.00,
        valuation_method: 'FIFO',
        min_stock_alert: 20,
        safety_stock: 10,
        max_stock: 400,
        weight_kg: 0.28,
      },
      {
        id: 'item-dnm-32',
        sku: 'SKU-DNM-JNS-32',
        barcode: '8941005005',
        name: 'Heavy-Duty Denim Work Jeans (32/32)',
        description: '14.5 oz selvage denim with reinforced triple-stitched bar tacks.',
        category: 'Finished Goods',
        unit_of_measure: 'pcs',
        cost_price: 14.00,
        selling_price: 38.00,
        valuation_method: 'MOVING_AVERAGE',
        min_stock_alert: 15,
        safety_stock: 8,
        max_stock: 250,
        weight_kg: 0.75,
      },
      {
        id: 'item-zip-50',
        sku: 'SKU-ZIP-MET-50',
        barcode: '8941006006',
        name: 'Heavy-Duty Antique Brass Zippers 50cm',
        description: '#5 metal teeth non-lock slider for jackets and workwear.',
        category: 'Accessories',
        unit_of_measure: 'pcs',
        cost_price: 0.45,
        selling_price: 1.20,
        valuation_method: 'MOVING_AVERAGE',
        min_stock_alert: 50,
        safety_stock: 20,
        max_stock: 1000,
        weight_kg: 0.05,
      },
    ];

    for (const it of items) {
      await tx.execute(
        `INSERT INTO items (id, sku, barcode, name, description, category, unit_of_measure, cost_price, selling_price, valuation_method, min_stock_alert, safety_stock, max_stock, weight_kg, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1);`,
        [it.id, it.sku, it.barcode, it.name, it.description, it.category, it.unit_of_measure, it.cost_price, it.selling_price, it.valuation_method, it.min_stock_alert, it.safety_stock, it.max_stock, it.weight_kg]
      );
    }

    // ------------------------------------------------------------------------
    // 5. Item Batches (6 Active Batches)
    // ------------------------------------------------------------------------
    const batches = [
      {
        id: 'batch-yarn-01',
        batch_number: 'LOT-2026-YARN-001',
        item_id: 'item-yarn-100',
        supplier_id: 'sup-bengal-textile',
        manufacture_date: '2026-09-01',
        expiry_date: '2029-09-01',
        unit_cost: 12.50,
        initial_quantity: 200,
        current_quantity: 200,
      },
      {
        id: 'batch-box-01',
        batch_number: 'LOT-2026-BOX-001',
        item_id: 'item-box-med',
        supplier_id: 'sup-universal-pkg',
        manufacture_date: '2026-09-10',
        expiry_date: '2031-09-10',
        unit_cost: 0.85,
        initial_quantity: 800,
        current_quantity: 800,
      },
      {
        id: 'batch-polo-navy-01',
        batch_number: 'LOT-2026-POLO-N01',
        item_id: 'item-polo-navy-l',
        supplier_id: 'sup-bengal-textile',
        manufacture_date: '2026-08-15',
        expiry_date: null,
        unit_cost: 8.50,
        initial_quantity: 120,
        current_quantity: 120,
      },
      {
        id: 'batch-polo-blk-01',
        batch_number: 'LOT-2026-POLO-B01',
        item_id: 'item-polo-blk-m',
        supplier_id: 'sup-bengal-textile',
        manufacture_date: '2026-08-20',
        expiry_date: null,
        unit_cost: 8.50,
        initial_quantity: 90,
        current_quantity: 90,
      },
      {
        id: 'batch-dnm-01',
        batch_number: 'LOT-2026-DNM-001',
        item_id: 'item-dnm-32',
        supplier_id: 'sup-bengal-textile',
        manufacture_date: '2026-09-05',
        expiry_date: null,
        unit_cost: 14.00,
        initial_quantity: 75,
        current_quantity: 75,
      },
      {
        id: 'batch-zip-01',
        batch_number: 'LOT-2026-ZIP-001',
        item_id: 'item-zip-50',
        supplier_id: 'sup-dhaka-fasteners',
        manufacture_date: '2026-07-01',
        expiry_date: null,
        unit_cost: 0.45,
        initial_quantity: 400,
        current_quantity: 400,
      },
    ];

    for (const bt of batches) {
      await tx.execute(
        `INSERT INTO item_batches (id, batch_number, item_id, supplier_id, manufacture_date, expiry_date, unit_cost, initial_quantity, current_quantity, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE');`,
        [bt.id, bt.batch_number, bt.item_id, bt.supplier_id, bt.manufacture_date, bt.expiry_date, bt.unit_cost, bt.initial_quantity, bt.current_quantity]
      );
    }

    // ------------------------------------------------------------------------
    // 6. Inventory Stock (Allocated into Warehouse Bins)
    // ------------------------------------------------------------------------
    const stockAllocations = [
      {
        id: 'stk-yarn-ctr',
        item_id: 'item-yarn-100',
        warehouse_id: 'wh-central-dc',
        bin_id: 'bin-ctr-03',
        batch_id: 'batch-yarn-01',
        quantity: 200,
      },
      {
        id: 'stk-box-ctr',
        item_id: 'item-box-med',
        warehouse_id: 'wh-central-dc',
        bin_id: 'bin-ctr-03',
        batch_id: 'batch-box-01',
        quantity: 800,
      },
      {
        id: 'stk-polo-navy-ctr',
        item_id: 'item-polo-navy-l',
        warehouse_id: 'wh-central-dc',
        bin_id: 'bin-ctr-01',
        batch_id: 'batch-polo-navy-01',
        quantity: 120,
      },
      {
        id: 'stk-polo-blk-ctr',
        item_id: 'item-polo-blk-m',
        warehouse_id: 'wh-central-dc',
        bin_id: 'bin-ctr-01',
        batch_id: 'batch-polo-blk-01',
        quantity: 90,
      },
      {
        id: 'stk-dnm-ctr',
        item_id: 'item-dnm-32',
        warehouse_id: 'wh-central-dc',
        bin_id: 'bin-ctr-02',
        batch_id: 'batch-dnm-01',
        quantity: 75,
      },
      {
        id: 'stk-zip-ctr',
        item_id: 'item-zip-50',
        warehouse_id: 'wh-central-dc',
        bin_id: 'bin-ctr-04',
        batch_id: 'batch-zip-01',
        quantity: 400,
      },
    ];

    for (const stk of stockAllocations) {
      await tx.execute(
        `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, batch_id, quantity_on_hand, quantity_reserved)
         VALUES (?, ?, ?, ?, ?, ?, 0);`,
        [stk.id, stk.item_id, stk.warehouse_id, stk.bin_id, stk.batch_id, stk.quantity]
      );
    }

    // ------------------------------------------------------------------------
    // 7. Couriers & Carriers
    // ------------------------------------------------------------------------
    const couriers = [
      {
        id: 'courier-pathao',
        name: 'Pathao Logistics',
        service_type: 'Express Parcel',
        contact_phone: '+880 9610-001234',
        tracking_url_template: 'https://pathao.com/track/{tracking_number}',
      },
      {
        id: 'courier-steadfast',
        name: 'Steadfast Courier',
        service_type: 'Nationwide Delivery',
        contact_phone: '+880 9678-045045',
        tracking_url_template: 'https://steadfast.com.bd/t/{tracking_number}',
      },
      {
        id: 'courier-redx',
        name: 'REDX Delivery Network',
        service_type: 'Express Doorstep',
        contact_phone: '+880 9612-223344',
        tracking_url_template: 'https://redx.com.bd/track?trackingId={tracking_number}',
      },
      {
        id: 'courier-sa-paribahan',
        name: 'SA Paribahan Parcel Service',
        service_type: 'Bulk Cargo & Regional Hub',
        contact_phone: '+880 2-9334455',
        tracking_url_template: null,
      },
    ];

    for (const c of couriers) {
      await tx.execute(
        `INSERT INTO couriers (id, name, service_type, contact_phone, tracking_url_template, is_active)
         VALUES (?, ?, ?, ?, ?, 1);`,
        [c.id, c.name, c.service_type, c.contact_phone, c.tracking_url_template]
      );
    }

    // ------------------------------------------------------------------------
    // 8. Double-Entry Audit Ledger Transactions (Balancing Initial Stock)
    // ------------------------------------------------------------------------
    const initialTxs = [
      {
        id: 'tx-init-01',
        item_id: 'item-yarn-100',
        bin_id: 'bin-ctr-03',
        batch_id: 'batch-yarn-01',
        qty: 200,
        cost: 12.50,
      },
      {
        id: 'tx-init-02',
        item_id: 'item-box-med',
        bin_id: 'bin-ctr-03',
        batch_id: 'batch-box-01',
        qty: 800,
        cost: 0.85,
      },
      {
        id: 'tx-init-03',
        item_id: 'item-polo-navy-l',
        bin_id: 'bin-ctr-01',
        batch_id: 'batch-polo-navy-01',
        qty: 120,
        cost: 8.50,
      },
      {
        id: 'tx-init-04',
        item_id: 'item-polo-blk-m',
        bin_id: 'bin-ctr-01',
        batch_id: 'batch-polo-blk-01',
        qty: 90,
        cost: 8.50,
      },
      {
        id: 'tx-init-05',
        item_id: 'item-dnm-32',
        bin_id: 'bin-ctr-02',
        batch_id: 'batch-dnm-01',
        qty: 75,
        cost: 14.00,
      },
      {
        id: 'tx-init-06',
        item_id: 'item-zip-50',
        bin_id: 'bin-ctr-04',
        batch_id: 'batch-zip-01',
        qty: 400,
        cost: 0.45,
      },
    ];

    for (const txRecord of initialTxs) {
      await tx.execute(
        `INSERT INTO inventory_transactions (id, transaction_timestamp, transaction_type, reference_type, reference_id, item_id, warehouse_id, bin_id, batch_id, quantity_change, unit_cost, running_balance_after, user_id, notes)
         VALUES (?, (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), 'CYCLE_COUNT_ADJUSTMENT', 'ADJUSTMENT', 'SEED-INIT', ?, 'wh-central-dc', ?, ?, ?, ?, ?, 'system', 'Initial opening warehouse balance');`,
        [txRecord.id, txRecord.item_id, txRecord.bin_id, txRecord.batch_id, txRecord.qty, txRecord.cost, txRecord.qty]
      );
    }

    // ------------------------------------------------------------------------
    // 9. Sample Purchase Order & Received Goods Note
    // ------------------------------------------------------------------------
    await tx.execute(
      `INSERT INTO purchase_orders (id, po_number, supplier_id, target_warehouse_id, status, order_date, expected_delivery_date, actual_delivery_date, subtotal, tax_amount, shipping_cost, total_amount, payment_terms, notes, created_by, approved_by)
       VALUES (?, ?, ?, ?, 'received', '2026-09-01', '2026-09-06', '2026-09-06', 2500.0, 0.0, 50.0, 2550.0, 'Net 30', 'Opening warehouse delivery PO', 'system', 'Anisur Rahman');`,
      ['po-2026-0001', 'PO-2026-0001', 'sup-bengal-textile', 'wh-central-dc']
    );

    await tx.execute(
      `INSERT INTO purchase_order_items (id, po_id, item_id, sku, quantity_ordered, quantity_received, quantity_rejected, unit_cost, subtotal)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?);`,
      ['poi-2026-0001', 'po-2026-0001', 'item-yarn-100', 'SKU-CTN-WHT-100', 200, 200, 12.50, 2500.0]
    );

    await tx.execute(
      `INSERT INTO goods_receipts (id, receipt_number, po_id, warehouse_id, received_by, receipt_date, inspection_passed, inspection_notes)
       VALUES (?, ?, ?, ?, ?, '2026-09-06', 1, 'Quality inspection verified. Zero defects detected.');`,
      ['grn-2026-0001', 'GRN-2026-0001', 'po-2026-0001', 'wh-central-dc', 'Anisur Rahman']
    );

    await tx.execute(
      `INSERT INTO goods_receipt_items (id, receipt_id, po_item_id, item_id, batch_id, bin_id, quantity_accepted, quantity_rejected, unit_cost)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?);`,
      ['gri-2026-0001', 'grn-2026-0001', 'poi-2026-0001', 'item-yarn-100', 'batch-yarn-01', 'bin-ctr-03', 200, 12.50]
    );

    // ------------------------------------------------------------------------
    // 10. Sample Stock Transfer (Central DC -> North Depot in Requested State)
    // ------------------------------------------------------------------------
    await tx.execute(
      `INSERT INTO stock_transfers (id, transfer_number, source_warehouse_id, dest_warehouse_id, status, requested_by, notes)
       VALUES (?, ?, ?, ?, 'requested', 'Mokhlesur Rahman', 'Stock replenishment for Northern retail distribution hub');`,
      ['tr-2026-0001', 'TR-2026-0001', 'wh-central-dc', 'wh-north-depot']
    );

    await tx.execute(
      `INSERT INTO stock_transfer_items (id, transfer_id, item_id, batch_id, source_bin_id, dest_bin_id, quantity_requested, quantity_shipped, quantity_received)
       VALUES (?, ?, ?, ?, ?, ?, 25, 0, 0);`,
      ['tri-2026-0001', 'tr-2026-0001', 'item-polo-navy-l', 'batch-polo-navy-01', 'bin-ctr-01', 'bin-nrd-01']
    );

    // ------------------------------------------------------------------------
    // 11. Sample Outbound Shipment (Packed Status)
    // ------------------------------------------------------------------------
    await tx.execute(
      `INSERT INTO shipments (id, shipment_number, order_reference, source_warehouse_id, customer_name, customer_phone, customer_address, destination_city, courier_id, courier_name, tracking_number, status, declared_value, cod_amount, shipping_fee, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'packed', 120.0, 120.0, 4.50, 'Packed and staged for afternoon courier handover');`,
      [
        'sh-2026-0001',
        'SH-2026-0001',
        'SO-2026-8812',
        'wh-central-dc',
        'Rahim Garments & Lifestyle Ltd.',
        '+880 1819-998877',
        'House 12, Road 4, Sector 7, Uttara',
        'Dhaka',
        'courier-pathao',
        'Pathao Logistics',
        'PTH-8839210-BD',
      ]
    );

    await tx.execute(
      `INSERT INTO shipment_items (id, shipment_id, item_id, batch_id, bin_id, quantity, unit_price, total_price)
       VALUES (?, ?, ?, ?, ?, 5, 24.00, 120.00);`,
      ['shi-2026-0001', 'sh-2026-0001', 'item-polo-navy-l', 'batch-polo-navy-01', 'bin-ctr-01']
    );
  });
}
