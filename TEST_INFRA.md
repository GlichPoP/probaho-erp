# Probaho ERP — Test Infrastructure Specification (TEST_INFRA.md)

## 1. Overview & Test Philosophy

Probaho ERP is an offline-first, mission-critical desktop supply chain management suite. Because supply chain systems govern physical assets, financial costs, and logistics contracts, testing must adhere to strict principles:

1. **Requirements-Driven & Opaque-Box**:
   Tests are derived directly from the authoritative specifications in `ORIGINAL_REQUEST.md` and `PROJECT.md`. The test suite treats the application as a black/opaque box, validating inputs, observable state changes, relational database invariants, and output responses without relying on private implementation quirks.

2. **Zero-Flake & 100% Deterministic**:
   No reliance on external cloud endpoints, network latencies, or arbitrary wall-clock timers. Tests run entirely in-process or via deterministic local SQLite engines with atomic transaction isolation.

3. **Hermetic Test Isolation**:
   Every test suite creates and tears down its own fresh in-memory or temporary disk database instance. No test depends on the side effects or execution order of preceding tests.

4. **Progressive Testability & Zero-Dependency Execution**:
   The test framework is designed to run seamlessly in modern Node.js environments (v22+ / v24+ with native TypeScript support via `--experimental-strip-types` and `node:sqlite`, or via `tsx` / `vitest`). It verifies domain contracts and database invariants independently of the Electron GUI rendering layer.

5. **Defense-in-Depth & Non-Negative Inventory Invariants**:
   Every stock movement must obey double-entry accounting rules (`inventory_transactions`), maintain atomic consistency across crashes, and enforce non-negative stock balance invariants (`quantity_on_hand >= 0`).

---

## 2. Test Architecture & Tier Taxonomy

The test suite is structured into four progressive tiers plus a standalone headless CLI verification tool:

```
probaho-erp/
├── TEST_INFRA.md                   # This document
├── TEST_READY.md                   # Readiness publication manifest
├── tests/
│   ├── harness/                    # Test database engine, schemas, and ERP test client
│   │   ├── test-db.ts              # SQLite test harness & transaction runner
│   │   ├── schema.ts               # Relational DDL for 16 core entities
│   │   └── erp-test-client.ts      # Domain contract client wrapping all operations
│   ├── tier1-feature-coverage/     # Core functional requirements (>=5 per feature)
│   │   ├── suppliers.test.ts       # Vendor directory, contact profiles, lead time & rating
│   │   ├── purchase-orders.test.ts # PO authoring, status lifecycle, GRN receiving
│   │   ├── inventory.test.ts       # Multi-warehouse, bins, batches, stock levels, valuation
│   │   ├── transfers.test.ts       # Stock transfer workflow, in-transit isolation, reconciliation
│   │   ├── shipments.test.ts       # Courier directory, outbound dispatch, tracking, RTO
│   │   └── backup-restore.test.ts  # Dual-format backup (JSON snapshot & SQLite binary)
│   ├── tier2-boundary-corner/      # Boundary & adversarial edge cases
│   │   └── boundary-cases.test.ts  # Zero/negative stock, invalid transitions, expired lots
│   ├── tier3-cross-feature/        # Cross-domain multi-step integration flows
│   │   └── cross-lifecycle.test.ts # PO -> Stock -> Transfer -> Dispatch -> RTO restock
│   ├── tier4-enterprise-workloads/ # High-concurrency & persistence reload
│   │   └── enterprise-scenarios.test.ts # High-throughput batch operations & disk reload
│   └── verify-erp-core.ts          # Standalone acceptance criteria CLI verification script
```

### Tier Descriptions:

- **Tier 1: Feature Coverage (Unit / Subsystem Contract)**
  - Validates all primary happy-paths and business logic for each core entity: Suppliers, Purchase Orders, Warehouses & Bins, Item Batches, Inventory Balances & Valuation, Stock Transfers, Couriers & Shipments, and Backup/Restore.
  - Requirement: At least 5 distinct test cases per feature. Actual coverage: 6+ test cases per feature (36+ Tier 1 tests total).

- **Tier 2: Boundary & Corner Cases (Negative & Adversarial)**
  - Exercises error handling, edge conditions, invalid state transitions, zero/negative stock enforcement, duplicate key collisions, expired batch quarantine, missing bins, and phantom inventory prevention.

- **Tier 3: Cross-Feature Combinations (Integration Workflows)**
  - Traces full multi-hop supply chain cycles spanning multiple business domains:
    1. Supplier creation and PO issuance.
    2. Quality inspection and GRN acceptance into primary warehouse.
    3. Inter-warehouse transfer dispatch and in-transit isolation.
    4. Destination receipt and discrepancy reconciliation.
    5. Outbound customer shipment creation, reservation, and courier dispatch.
    6. Delivery exception, Return-to-Origin (RTO) intake, and restocking into inventory.
    7. Complete audit trail validation showing 100% balance reconciliation.

- **Tier 4: Real-World Enterprise Workload Scenarios (Stress & Persistence)**
  - Simulates high-throughput distribution operations with dozens of concurrent suppliers, products, purchase orders, transfers, and shipments.
  - Verifies session persistence across simulated application restarts by serializing state to disk, closing the connection, reloading, and confirming data fidelity.

- **Standalone Acceptance Verifier (`tests/verify-erp-core.ts`)**
  - Standalone script with zero external runtime dependencies that exercises all acceptance criteria from `ORIGINAL_REQUEST.md` and exits 0 on success.

---

## 3. Database Schema & Invariants

The test harness provisions the complete normalized 16-table relational schema:
1. `system_settings`: System configurations, default currency, and schema version.
2. `suppliers`: Vendor profiles, contact details, lead-time tracking, and rating.
3. `items`: SKU catalog, barcode, UOM, cost and selling prices, valuation method.
4. `warehouses`: Multi-facility warehouse definitions.
5. `warehouse_locations`: Hierarchical storage bins (zone, aisle, rack, shelf, bin_code).
6. `item_batches`: Lot tracking with manufacturing and expiry dates.
7. `inventory_stock`: Real-time stock matrix (item x warehouse x bin x batch).
8. `purchase_orders`: Procurement headers and workflow states.
9. `purchase_order_items`: Line items with ordered, received, and rejected quantities.
10. `goods_receipts`: Inspection receipt headers.
11. `goods_receipt_items`: Line inspection, accepted/rejected counts, batch allocation.
12. `stock_transfers`: Inter-warehouse movement headers with in-transit tracking.
13. `stock_transfer_items`: Line transfer items and discrepancy tracking.
14. `shipments`: Outbound fulfillment parcels, courier assignment, and tracking.
15. `shipment_items`: Line items reserved and dispatched per shipment.
16. `inventory_transactions`: Immutable double-entry audit ledger.

### Relational & Business Invariants:
- `quantity_on_hand >= 0`: Non-negative stock enforced by CHECK constraint and transaction logic.
- `quantity_reserved <= quantity_on_hand`: Over-reservation prohibited.
- `source_warehouse_id != dest_warehouse_id`: Self-transfers prohibited.
- `in_transit` state locks inventory away from both origin and destination available balances.
- Transactions wrap all multi-table mutations atomically (`BEGIN IMMEDIATE ... COMMIT`).

---

## 4. Execution Commands

### Running the Standalone Verification Script:
```powershell
# Native Node.js execution (Node v22+ / v24+ with experimental strip types)
node --experimental-strip-types tests/verify-erp-core.ts

# Or using tsx
npx tsx tests/verify-erp-core.ts

# Or via npm script (once package.json scripts are wired)
npm run test:verify
```

### Running Test Suites:
```powershell
# Run individual test files
node --experimental-strip-types tests/tier1-feature-coverage/suppliers.test.ts
node --experimental-strip-types tests/tier1-feature-coverage/purchase-orders.test.ts
node --experimental-strip-types tests/tier1-feature-coverage/inventory.test.ts
node --experimental-strip-types tests/tier1-feature-coverage/transfers.test.ts
node --experimental-strip-types tests/tier1-feature-coverage/shipments.test.ts
node --experimental-strip-types tests/tier1-feature-coverage/backup-restore.test.ts
node --experimental-strip-types tests/tier2-boundary-corner/boundary-cases.test.ts
node --experimental-strip-types tests/tier3-cross-feature/cross-lifecycle.test.ts
node --experimental-strip-types tests/tier4-enterprise-workloads/enterprise-scenarios.test.ts

# Run all test suites runner
node --experimental-strip-types tests/run-all-tests.ts
```

---

## 5. Acceptance Criteria Traceability

| Acceptance Criterion | Verification Anchor | Test Target |
|----------------------|---------------------|-------------|
| Creating a supplier and issuing a purchase order | R1.1, R1.2 | `suppliers.test.ts`, `purchase-orders.test.ts`, `verify-erp-core.ts` (AC1) |
| Receiving goods against a PO and incrementing multi-warehouse inventory | R1.2, R1.3 | `inventory.test.ts`, `purchase-orders.test.ts`, `verify-erp-core.ts` (AC2) |
| Initiating an inter-warehouse stock transfer and reconciling stock counts | R1.3 | `transfers.test.ts`, `verify-erp-core.ts` (AC3) |
| Creating an outbound shipment and tracking dispatch/fulfillment states | R1.4 | `shipments.test.ts`, `verify-erp-core.ts` (AC4) |
| Return-to-Origin (RTO) processing and inventory restocking | R1.4 | `shipments.test.ts`, `cross-lifecycle.test.ts`, `verify-erp-core.ts` (AC5) |
| Data created during a session persists and reloads correctly after restart | R2 | `backup-restore.test.ts`, `enterprise-scenarios.test.ts`, `verify-erp-core.ts` (AC6) |
| Lightweight, offline-first embedded SQLite operation with zero cloud latency | R2 | `test-db.ts`, all suites |
| Dual-format local backup and restore (JSON snapshot + SQLite binary) | R2 | `backup-restore.test.ts`, `verify-erp-core.ts` (AC8) |
