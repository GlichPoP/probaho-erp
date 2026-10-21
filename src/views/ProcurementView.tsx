// ============================================================================
// PROBAHO ERP: PROCUREMENT & PURCHASE ORDERS VIEW
// File: src/views/ProcurementView.tsx (Proposed Specification for Milestone 2)
// High-Contrast Theme Compliant, Offline-First SQLite Powered
// ============================================================================

import React, { useState, useEffect, useMemo } from 'react';
import {
  ShoppingBag,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  Truck,
  ArrowRight,
  Package,
  Boxes,
  FileText,
  DollarSign,
  Calendar,
  Building2,
  Warehouse as WarehouseIcon,
  Eye,
  Trash2,
  X,
  RefreshCw,
  XCircle,
  Check,
  ChevronRight,
  ClipboardCheck,
  ShieldAlert,
  Layers,
  Printer
} from 'lucide-react';
import { PrintVoucherModal, type VoucherType } from '../components/PrintVoucherModal';
import { dbService, type IDatabaseService } from '../services/db';
import type {
  PurchaseOrder,
  PurchaseOrderItem,
  GoodsReceipt,
  GoodsReceiptItem,
  Supplier,
  Warehouse,
  WarehouseLocation,
  Item,
  POStatus
} from '../types/erp';

interface ExtendedPO extends PurchaseOrder {
  supplier_name?: string;
  supplier_code?: string;
  warehouse_name?: string;
  warehouse_code?: string;
  items_count?: number;
}

interface NewPOLineItem {
  itemId: string;
  sku: string;
  name: string;
  unitOfMeasure: string;
  quantityOrdered: number;
  unitCost: number;
  taxRate: number;
}

interface GRNLineInspection {
  poItemId: string;
  itemId: string;
  sku: string;
  name: string;
  quantityOrdered: number;
  quantityAlreadyReceived: number;
  quantityRemaining: number;
  quantityAccepted: number;
  quantityRejected: number;
  rejectionReason: string;
  binId: string;
  batchNumber: string;
  expiryDate: string;
  unitCost: number;
}

export interface ProcurementViewProps {
  initialSearchQuery?: string;
}

export const ProcurementView: React.FC<ProcurementViewProps> = ({ initialSearchQuery }) => {
  const [purchaseOrders, setPurchaseOrders] = useState<ExtendedPO[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [catalogItems, setCatalogItems] = useState<Item[]>([]);
  const [warehouseLocations, setWarehouseLocations] = useState<WarehouseLocation[]>([]);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>(initialSearchQuery || '');

  useEffect(() => {
    if (initialSearchQuery !== undefined) {
      setSearchQuery(initialSearchQuery);
    }
  }, [initialSearchQuery]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [warehouseFilter, setWarehouseFilter] = useState<string>('all');

  // Modals & Drawers State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [isGRNModalOpen, setIsGRNModalOpen] = useState<boolean>(false);
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState<boolean>(false);

  // Selected entities
  const [selectedPO, setSelectedPO] = useState<ExtendedPO | null>(null);
  const [poDetailsItems, setPoDetailsItems] = useState<PurchaseOrderItem[]>([]);
  const [poDetailsReceipts, setPoDetailsReceipts] = useState<any[]>([]);

  // Print Voucher Modal State
  const [printModalState, setPrintModalState] = useState<{
    isOpen: boolean;
    type: VoucherType;
    data: any;
  }>({
    isOpen: false,
    type: 'po_slip',
    data: null
  });

  // Notification Toast
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Form State: Create PO
  const [newPOHeader, setNewPOHeader] = useState({
    po_number: '',
    supplier_id: '',
    target_warehouse_id: '',
    order_date: new Date().toISOString().slice(0, 10),
    expected_delivery_date: '',
    payment_terms: 'Net 30',
    shipping_cost: 0,
    notes: ''
  });

  const [newLineItems, setNewLineItems] = useState<NewPOLineItem[]>([]);
  const [createFormErrors, setCreateFormErrors] = useState<Record<string, string>>({});

  // Form State: Goods Receipt Note (GRN)
  const [grnTargetPO, setGrnTargetPO] = useState<ExtendedPO | null>(null);
  const [grnHeader, setGrnHeader] = useState({
    receipt_number: '',
    receipt_date: new Date().toISOString().slice(0, 10),
    received_by: 'Warehouse Receiving Director',
    inspection_passed: 1,
    inspection_notes: 'Visual and mechanical count verified. Packaging clean and intact.'
  });
  const [grnLineInspections, setGrnLineInspections] = useState<GRNLineInspection[]>([]);

  const showToast = (type: 'success' | 'error' | 'info', text: string) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 4000);
  };

  // Load All Procurement Data from SQLite
  const loadProcurementData = async () => {
    try {
      setIsLoading(true);
      await dbService.initialize();

      // 1. Purchase Orders with joined details
      const pos = await dbService.query<ExtendedPO>(`
        SELECT 
          po.*,
          s.name as supplier_name,
          s.supplier_code as supplier_code,
          w.name as warehouse_name,
          w.warehouse_code as warehouse_code,
          (SELECT COUNT(*) FROM purchase_order_items poi WHERE poi.po_id = po.id) as items_count
        FROM purchase_orders po
        LEFT JOIN suppliers s ON po.supplier_id = s.id
        LEFT JOIN warehouses w ON po.target_warehouse_id = w.id
        ORDER BY po.order_date DESC, po.created_at DESC;
      `);
      setPurchaseOrders(pos);

      // 2. Suppliers
      const supRows = await dbService.query<Supplier>(
        `SELECT * FROM suppliers WHERE is_active = 1 ORDER BY name ASC;`
      );
      setSuppliers(supRows);

      // 3. Warehouses
      const whRows = await dbService.query<Warehouse>(
        `SELECT * FROM warehouses WHERE is_active = 1 ORDER BY name ASC;`
      );
      setWarehouses(whRows);

      // 4. Catalog Items
      const itRows = await dbService.query<Item>(
        `SELECT * FROM items WHERE is_active = 1 ORDER BY name ASC;`
      );
      setCatalogItems(itRows);

      // 5. Warehouse Bins
      const binRows = await dbService.query<WarehouseLocation>(
        `SELECT * FROM warehouse_locations WHERE is_active = 1 ORDER BY bin_code ASC;`
      );
      setWarehouseLocations(binRows);
    } catch (err: any) {
      console.error('Procurement load error:', err);
      showToast('error', `Failed to load procurement data: ${err.message || String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProcurementData();
  }, []);

  // Compute KPI Summary Stats
  const kpiStats = useMemo(() => {
    const total = purchaseOrders.length;
    const pending = purchaseOrders.filter((po) => po.status === 'draft' || po.status === 'pending_approval').length;
    const ordered = purchaseOrders.filter((po) => po.status === 'ordered' || po.status === 'partially_received').length;
    const totalSpend = purchaseOrders
      .filter((po) => po.status !== 'cancelled')
      .reduce((sum, po) => sum + (po.total_amount || 0), 0);

    return {
      totalPOs: total,
      pendingPOs: pending,
      orderedPOs: ordered,
      totalSpend: Math.round(totalSpend * 100) / 100
    };
  }, [purchaseOrders]);

  // Filtered Purchase Orders
  const filteredPOs = useMemo(() => {
    return purchaseOrders.filter((po) => {
      if (statusFilter !== 'all' && po.status !== statusFilter) return false;
      if (warehouseFilter !== 'all' && po.target_warehouse_id !== warehouseFilter) return false;

      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matchNumber = po.po_number.toLowerCase().includes(q);
        const matchSupplier = (po.supplier_name || '').toLowerCase().includes(q);
        const matchCode = (po.supplier_code || '').toLowerCase().includes(q);
        return matchNumber || matchSupplier || matchCode;
      }
      return true;
    });
  }, [purchaseOrders, statusFilter, warehouseFilter, searchQuery]);

  // Open Create PO Modal
  const handleOpenCreateModal = () => {
    const nextSeq = purchaseOrders.length + 1;
    const autoNumber = `PO-2026-${String(nextSeq).padStart(4, '0')}`;
    const defaultWh = warehouses.find((w) => w.is_default === 1)?.id || warehouses[0]?.id || '';
    const defaultSup = suppliers[0]?.id || '';

    let defaultExpectedDate = '';
    if (suppliers[0]?.lead_time_days) {
      const d = new Date();
      d.setDate(d.getDate() + (suppliers[0].lead_time_days || 7));
      defaultExpectedDate = d.toISOString().slice(0, 10);
    }

    setNewPOHeader({
      po_number: autoNumber,
      supplier_id: defaultSup,
      target_warehouse_id: defaultWh,
      order_date: new Date().toISOString().slice(0, 10),
      expected_delivery_date: defaultExpectedDate,
      payment_terms: 'Net 30',
      shipping_cost: 0,
      notes: ''
    });

    // Seed 1 default line item if catalog available
    if (catalogItems.length > 0) {
      setNewLineItems([
        {
          itemId: catalogItems[0].id,
          sku: catalogItems[0].sku,
          name: catalogItems[0].name,
          unitOfMeasure: catalogItems[0].unit_of_measure,
          quantityOrdered: 50,
          unitCost: catalogItems[0].cost_price,
          taxRate: 0
        }
      ]);
    } else {
      setNewLineItems([]);
    }

    setCreateFormErrors({});
    setIsCreateModalOpen(true);
  };

  // Dynamic Line Item Adder handlers
  const handleAddLineItem = () => {
    if (catalogItems.length === 0) return;
    const first = catalogItems[0];
    setNewLineItems([
      ...newLineItems,
      {
        itemId: first.id,
        sku: first.sku,
        name: first.name,
        unitOfMeasure: first.unit_of_measure,
        quantityOrdered: 10,
        unitCost: first.cost_price,
        taxRate: 0
      }
    ]);
  };

  const handleRemoveLineItem = (index: number) => {
    setNewLineItems(newLineItems.filter((_, i) => i !== index));
  };

  const handleLineItemChange = (index: number, field: keyof NewPOLineItem, value: any) => {
    const updated = [...newLineItems];
    if (field === 'itemId') {
      const it = catalogItems.find((c) => c.id === value);
      if (it) {
        updated[index].itemId = it.id;
        updated[index].sku = it.sku;
        updated[index].name = it.name;
        updated[index].unitOfMeasure = it.unit_of_measure;
        updated[index].unitCost = it.cost_price;
      }
    } else {
      (updated[index] as any)[field] = value;
    }
    setNewLineItems(updated);
  };

  // Calculate Subtotal, Tax, and Grand Total for New PO
  const newPOCalculations = useMemo(() => {
    let subtotal = 0;
    let taxAmount = 0;

    for (const item of newLineItems) {
      const lineSubtotal = (item.quantityOrdered || 0) * (item.unitCost || 0);
      const lineTax = lineSubtotal * ((item.taxRate || 0) / 100);
      subtotal += lineSubtotal;
      taxAmount += lineTax;
    }

    const shipping = Number(newPOHeader.shipping_cost) || 0;
    const totalAmount = subtotal + taxAmount + shipping;

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      taxAmount: Math.round(taxAmount * 100) / 100,
      shipping: Math.round(shipping * 100) / 100,
      totalAmount: Math.round(totalAmount * 100) / 100
    };
  }, [newLineItems, newPOHeader.shipping_cost]);

  // Validate PO Creation
  const validateCreatePO = (): boolean => {
    const errors: Record<string, string> = {};

    if (!newPOHeader.po_number.trim()) {
      errors.po_number = 'Purchase Order number is required.';
    } else {
      const exists = purchaseOrders.some(
        (po) => po.po_number.toLowerCase() === newPOHeader.po_number.trim().toLowerCase()
      );
      if (exists) errors.po_number = 'Purchase Order number must be unique.';
    }

    if (!newPOHeader.supplier_id) {
      errors.supplier_id = 'Please select a vendor / supplier.';
    }

    if (!newPOHeader.target_warehouse_id) {
      errors.target_warehouse_id = 'Please select a destination receiving warehouse.';
    }

    if (newLineItems.length === 0) {
      errors.items = 'At least one line item must be added to the purchase order.';
    } else {
      for (let i = 0; i < newLineItems.length; i++) {
        const item = newLineItems[i];
        if (!item.itemId) {
          errors[`item_${i}`] = 'Please select a valid catalog item.';
        }
        if (item.quantityOrdered <= 0) {
          errors[`item_${i}`] = 'Quantity ordered must be greater than zero.';
        }
        if (item.unitCost < 0) {
          errors[`item_${i}`] = 'Unit cost cannot be negative.';
        }
      }
    }

    setCreateFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Submit New PO
  const handleCreatePurchaseOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateCreatePO()) return;

    try {
      const poId = `po-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      await dbService.transaction(async (tx: IDatabaseService) => {
        // 1. Insert PO Header (status: 'draft')
        await tx.execute(
          `INSERT INTO purchase_orders (
            id, po_number, supplier_id, target_warehouse_id, status, order_date,
            expected_delivery_date, subtotal, tax_amount, shipping_cost, total_amount,
            payment_terms, notes, created_by
          ) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, 'Operations Manager');`,
          [
            poId,
            newPOHeader.po_number.trim().toUpperCase(),
            newPOHeader.supplier_id,
            newPOHeader.target_warehouse_id,
            newPOHeader.order_date,
            newPOHeader.expected_delivery_date || null,
            newPOCalculations.subtotal,
            newPOCalculations.taxAmount,
            newPOCalculations.shipping,
            newPOCalculations.totalAmount,
            newPOHeader.payment_terms || 'Net 30',
            newPOHeader.notes.trim() || null
          ]
        );

        // 2. Insert PO Line Items
        for (const line of newLineItems) {
          const lineId = `poi-${Date.now()}-${Math.random().toString(36).substring(7)}`;
          const lineSubtotal = (line.quantityOrdered || 0) * (line.unitCost || 0);

          await tx.execute(
            `INSERT INTO purchase_order_items (
              id, po_id, item_id, sku, quantity_ordered, quantity_received, quantity_rejected,
              unit_cost, subtotal, tax_rate
            ) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?);`,
            [
              lineId,
              poId,
              line.itemId,
              line.sku,
              Number(line.quantityOrdered),
              Number(line.unitCost),
              lineSubtotal,
              Number(line.taxRate || 0)
            ]
          );
        }

        // 3. Increment supplier total_pos_issued
        await tx.execute(
          `UPDATE suppliers 
           SET total_pos_issued = total_pos_issued + 1, updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
           WHERE id = ?;`,
          [newPOHeader.supplier_id]
        );
      });

      showToast('success', `Purchase Order "${newPOHeader.po_number}" created as Draft.`);
      setIsCreateModalOpen(false);
      await loadProcurementData();
    } catch (err: any) {
      console.error('Create PO error:', err);
      showToast('error', `Failed to create purchase order: ${err.message || String(err)}`);
    }
  };

  // State Transition Action (Approve, Order, Cancel)
  const handleTransitionStatus = async (po: ExtendedPO, nextStatus: POStatus) => {
    try {
      // Check cancellation guard
      if (nextStatus === 'cancelled') {
        const items = await dbService.query<PurchaseOrderItem>(
          `SELECT * FROM purchase_order_items WHERE po_id = ?;`,
          [po.id]
        );
        const hasReceipts = items.some((i) => i.quantity_received > 0 || i.quantity_rejected > 0);
        if (hasReceipts) {
          showToast('error', 'Cannot cancel purchase order: goods receipt has already been registered.');
          return;
        }
      }

      await dbService.execute(
        `UPDATE purchase_orders 
         SET status = ?, 
             approved_by = CASE WHEN ? = 'approved' THEN 'Procurement Director' ELSE approved_by END,
             updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         WHERE id = ?;`,
        [nextStatus, nextStatus, po.id]
      );

      const statusLabels: Record<string, string> = {
        pending_approval: 'Submitted for Approval',
        approved: 'Approved',
        ordered: 'Transmitted & Ordered',
        cancelled: 'Cancelled'
      };

      showToast('success', `PO "${po.po_number}" transitioned to ${statusLabels[nextStatus] || nextStatus}.`);
      await loadProcurementData();

      if (selectedPO && selectedPO.id === po.id) {
        setSelectedPO({ ...selectedPO, status: nextStatus });
      }
    } catch (err: any) {
      console.error('Transition error:', err);
      showToast('error', `Failed to update status: ${err.message || String(err)}`);
    }
  };

  // Open Goods Receipt Note (GRN) Modal
  const handleOpenGRNModal = async (po: ExtendedPO) => {
    try {
      setGrnTargetPO(po);

      const items = await dbService.query<any>(`
        SELECT poi.*, i.name as item_name
        FROM purchase_order_items poi
        JOIN items i ON poi.item_id = i.id
        WHERE poi.po_id = ?;
      `, [po.id]);

      // Filter available warehouse bins for target warehouse
      const targetBins = warehouseLocations.filter((b) => b.warehouse_id === po.target_warehouse_id);
      const defaultBin = targetBins[0]?.id || warehouseLocations[0]?.id || '';

      const lines: GRNLineInspection[] = items.map((pi: any) => {
        const remaining = Math.max(0, pi.quantity_ordered - (pi.quantity_received || 0));
        return {
          poItemId: pi.id,
          itemId: pi.item_id,
          sku: pi.sku,
          name: pi.item_name,
          quantityOrdered: pi.quantity_ordered,
          quantityAlreadyReceived: pi.quantity_received || 0,
          quantityRemaining: remaining,
          quantityAccepted: remaining, // default receive remaining
          quantityRejected: 0,
          rejectionReason: '',
          binId: defaultBin,
          batchNumber: `LOT-${new Date().getFullYear()}-${pi.sku.slice(-4)}-${Math.floor(100 + Math.random() * 900)}`,
          expiryDate: '',
          unitCost: pi.unit_cost
        };
      });

      const nextGrnSeq = Math.floor(1000 + Math.random() * 9000);
      setGrnHeader({
        receipt_number: `GRN-2026-${nextGrnSeq}`,
        receipt_date: new Date().toISOString().slice(0, 10),
        received_by: 'Warehouse Receiving Director',
        inspection_passed: 1,
        inspection_notes: 'Dock inspection verified. Standard packaging integrity intact.'
      });

      setGrnLineInspections(lines);
      setIsGRNModalOpen(true);
    } catch (err: any) {
      console.error('Open GRN error:', err);
      showToast('error', `Could not prepare Goods Receipt: ${err.message || String(err)}`);
    }
  };

  // Submit Goods Receipt Note (GRN) & Atomic Increment
  const handleSubmitGRN = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!grnTargetPO) return;

    // Validate quantities
    let totalAccepted = 0;
    let totalRejected = 0;

    for (const line of grnLineInspections) {
      if (line.quantityAccepted < 0 || line.quantityRejected < 0) {
        showToast('error', 'Quantities cannot be negative.');
        return;
      }
      if (line.quantityAccepted + line.quantityRejected > line.quantityRemaining) {
        showToast('error', `Received + Rejected exceeds remaining order balance for SKU ${line.sku}.`);
        return;
      }
      totalAccepted += line.quantityAccepted;
      totalRejected += line.quantityRejected;
    }

    if (totalAccepted === 0 && totalRejected === 0) {
      showToast('error', 'Must receive or reject at least 1 unit to register a Goods Receipt.');
      return;
    }

    try {
      const grnId = `grn-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      await dbService.transaction(async (tx: IDatabaseService) => {
        // 1. Insert Goods Receipt Note Header
        await tx.execute(
          `INSERT INTO goods_receipts (
            id, receipt_number, po_id, warehouse_id, received_by, receipt_date,
            inspection_passed, inspection_notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            grnId,
            grnHeader.receipt_number.trim().toUpperCase(),
            grnTargetPO.id,
            grnTargetPO.target_warehouse_id,
            grnHeader.received_by.trim(),
            grnHeader.receipt_date,
            grnHeader.inspection_passed,
            grnHeader.inspection_notes.trim() || null
          ]
        );

        // 2. Process each line item
        for (const line of grnLineInspections) {
          if (line.quantityAccepted === 0 && line.quantityRejected === 0) continue;

          // 2a. Batch record creation or update
          let batchId: string | null = null;
          if (line.batchNumber.trim() && line.quantityAccepted > 0) {
            const existingBatch = await tx.query<any>(
              `SELECT id FROM item_batches WHERE item_id = ? AND batch_number = ?;`,
              [line.itemId, line.batchNumber.trim()]
            );

            if (existingBatch[0]) {
              batchId = existingBatch[0].id;
              await tx.execute(
                `UPDATE item_batches 
                 SET current_quantity = current_quantity + ?, updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                 WHERE id = ?;`,
                [line.quantityAccepted, batchId]
              );
            } else {
              batchId = `batch-${Date.now()}-${Math.random().toString(36).substring(7)}`;
              await tx.execute(
                `INSERT INTO item_batches (
                  id, batch_number, item_id, supplier_id, expiry_date, unit_cost,
                  initial_quantity, current_quantity, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE');`,
                [
                  batchId,
                  line.batchNumber.trim(),
                  line.itemId,
                  grnTargetPO.supplier_id,
                  line.expiryDate || null,
                  line.unitCost,
                  line.quantityAccepted,
                  line.quantityAccepted
                ]
              );
            }
          }

          // 2b. Insert Goods Receipt Line Item
          const grnItemId = `gri-${Date.now()}-${Math.random().toString(36).substring(7)}`;
          await tx.execute(
            `INSERT INTO goods_receipt_items (
              id, receipt_id, po_item_id, item_id, batch_id, bin_id,
              quantity_accepted, quantity_rejected, rejection_reason, unit_cost
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            [
              grnItemId,
              grnId,
              line.poItemId,
              line.itemId,
              batchId,
              line.binId || null,
              line.quantityAccepted,
              line.quantityRejected,
              line.rejectionReason.trim() || null,
              line.unitCost
            ]
          );

          // 2c. Atomic Inventory Stock Increment (only for accepted goods)
          if (line.quantityAccepted > 0 && line.binId) {
            const existingStock = await tx.query<any>(
              `SELECT id, quantity_on_hand FROM inventory_stock 
               WHERE item_id = ? AND warehouse_id = ? AND bin_id = ? AND (batch_id = ? OR (batch_id IS NULL AND ? IS NULL));`,
              [line.itemId, grnTargetPO.target_warehouse_id, line.binId, batchId, batchId]
            );

            let newBalance = line.quantityAccepted;
            if (existingStock[0]) {
              newBalance = existingStock[0].quantity_on_hand + line.quantityAccepted;
              await tx.execute(
                `UPDATE inventory_stock 
                 SET quantity_on_hand = quantity_on_hand + ?, updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                 WHERE id = ?;`,
                [line.quantityAccepted, existingStock[0].id]
              );
            } else {
              const stockId = `stk-${Date.now()}-${Math.random().toString(36).substring(7)}`;
              await tx.execute(
                `INSERT INTO inventory_stock (
                  id, item_id, warehouse_id, bin_id, batch_id, quantity_on_hand, quantity_reserved
                ) VALUES (?, ?, ?, ?, ?, ?, 0);`,
                [stockId, line.itemId, grnTargetPO.target_warehouse_id, line.binId, batchId, line.quantityAccepted]
              );
            }

            // 2d. Double-Entry Audit Ledger Entry
            const auditId = `tx-po-${Date.now()}-${Math.random().toString(36).substring(7)}`;
            await tx.execute(
              `INSERT INTO inventory_transactions (
                id, transaction_timestamp, transaction_type, reference_type, reference_id,
                item_id, warehouse_id, bin_id, batch_id, quantity_change, unit_cost,
                running_balance_after, user_id, notes
              ) VALUES (?, (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), 'PO_RECEIPT', 'PO', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Goods Receipt Note Inspection Accepted');`,
              [
                auditId,
                grnTargetPO.id,
                line.itemId,
                grnTargetPO.target_warehouse_id,
                line.binId,
                batchId,
                line.quantityAccepted,
                line.unitCost,
                newBalance,
                grnHeader.received_by
              ]
            );
          }

          // 2e. Update PO Line Item cumulative counts
          await tx.execute(
            `UPDATE purchase_order_items
             SET quantity_received = quantity_received + ?,
                 quantity_rejected = quantity_rejected + ?,
                 updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
             WHERE id = ?;`,
            [line.quantityAccepted, line.quantityRejected, line.poItemId]
          );
        }

        // 3. Automatic Status Progression check
        const poItems = await tx.query<PurchaseOrderItem>(
          `SELECT quantity_ordered, quantity_received FROM purchase_order_items WHERE po_id = ?;`,
          [grnTargetPO.id]
        );

        const allFullyReceived = poItems.every((pi: PurchaseOrderItem) => pi.quantity_received >= pi.quantity_ordered);
        const nextPOStatus: POStatus = allFullyReceived ? 'received' : 'partially_received';

        await tx.execute(
          `UPDATE purchase_orders 
           SET status = ?, 
               actual_delivery_date = CASE WHEN ? = 'received' THEN (strftime('%Y-%m-%d', 'now')) ELSE actual_delivery_date END,
               updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
           WHERE id = ?;`,
          [nextPOStatus, nextPOStatus, grnTargetPO.id]
        );

        // 4. Update supplier total_pos_fulfilled if fully received
        if (nextPOStatus === 'received') {
          await tx.execute(
            `UPDATE suppliers 
             SET total_pos_fulfilled = total_pos_fulfilled + 1, updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
             WHERE id = ?;`,
            [grnTargetPO.supplier_id]
          );
        }
      });

      showToast('success', `GRN "${grnHeader.receipt_number}" recorded. Inventory incremented.`);
      setIsGRNModalOpen(false);
      await loadProcurementData();
    } catch (err: any) {
      console.error('Submit GRN error:', err);
      showToast('error', `Failed to record Goods Receipt: ${err.message || String(err)}`);
    }
  };

  // Open PO Detail Drawer
  const handleOpenDetailDrawer = async (po: ExtendedPO) => {
    try {
      setSelectedPO(po);

      // Fetch Items
      const items = await dbService.query<any>(`
        SELECT poi.*, i.name as item_name
        FROM purchase_order_items poi
        JOIN items i ON poi.item_id = i.id
        WHERE poi.po_id = ?;
      `, [po.id]);
      setPoDetailsItems(items);

      // Fetch Goods Receipts
      const receipts = await dbService.query<any>(`
        SELECT gr.*,
          (SELECT COUNT(*) FROM goods_receipt_items gri WHERE gri.receipt_id = gr.id) as received_item_count,
          (SELECT SUM(quantity_accepted) FROM goods_receipt_items gri WHERE gri.receipt_id = gr.id) as total_accepted,
          (SELECT SUM(quantity_rejected) FROM goods_receipt_items gri WHERE gri.receipt_id = gr.id) as total_rejected
        FROM goods_receipts gr
        WHERE gr.po_id = ?
        ORDER BY gr.receipt_date DESC;
      `, [po.id]);
      setPoDetailsReceipts(receipts);

      setIsDetailDrawerOpen(true);
    } catch (err: any) {
      console.error('Load PO details error:', err);
      showToast('error', `Could not open PO details: ${err.message || String(err)}`);
    }
  };

  // Status Badge Helper
  const renderStatusBadge = (status: POStatus) => {
    switch (status) {
      case 'draft':
        return (
          <span className="badge badge-info">
            <span className="status-dot bg-[var(--text-dim)]" />
            Draft
          </span>
        );
      case 'pending_approval':
        return (
          <span className="badge badge-warning">
            <Clock size={12} />
            Pending Approval
          </span>
        );
      case 'approved':
        return (
          <span className="badge badge-info">
            <Check size={12} />
            Approved
          </span>
        );
      case 'ordered':
        return (
          <span className="badge badge-primary">
            <Truck size={12} />
            Ordered / In Transit
          </span>
        );
      case 'partially_received':
        return (
          <span className="badge badge-warning">
            <Boxes size={12} />
            Partially Received
          </span>
        );
      case 'received':
        return (
          <span className="badge badge-success">
            <CheckCircle2 size={12} />
            Fully Received
          </span>
        );
      case 'cancelled':
        return (
          <span className="badge badge-danger">
            <XCircle size={12} />
            Cancelled
          </span>
        );
      default:
        return <span className="badge">{status}</span>;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* 1. Header Banner & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-main)] flex items-center gap-2">
            <ShoppingBag className="text-[var(--accent-primary)]" size={26} />
            Procurement & Purchase Orders
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Create purchase orders, manage approval workflows, track vendor shipments, and execute Goods Receipt (GRN) inspections.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadProcurementData}
            disabled={isLoading}
            className="btn btn-secondary"
            title="Reload purchase orders"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
          <button
            onClick={handleOpenCreateModal}
            className="btn btn-primary"
          >
            <Plus size={16} />
            <span>Create Purchase Order</span>
          </button>
        </div>
      </div>

      {/* Notification Toast */}
      {notification && (
        <div
          className={`p-3 rounded-lg border text-xs flex items-center justify-between transition-all duration-200 ${
            notification.type === 'success'
              ? 'bg-[var(--emerald-bg)] border-[var(--emerald-border)] text-[var(--emerald)]'
              : notification.type === 'error'
              ? 'bg-[var(--ruby-bg)] border-[var(--ruby-border)] text-[var(--ruby)]'
              : 'bg-[var(--cyan-bg)] border-[var(--cyan-border)] text-[var(--cyan)]'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' && <CheckCircle2 size={16} />}
            {notification.type === 'error' && <AlertCircle size={16} />}
            {notification.type === 'info' && <Truck size={16} />}
            <span className="font-medium">{notification.text}</span>
          </div>
          <button onClick={() => setNotification(null)} className="opacity-75 hover:opacity-100">
            <X size={14} />
          </button>
        </div>
      )}

      {/* 2. KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Purchase Orders */}
        <div className="erp-card p-4 hover-lift">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-dim)] uppercase">Total Purchase Orders</span>
            <div className="p-2 rounded-lg bg-[var(--accent-glow)] text-[var(--accent-primary)]">
              <FileText size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-[var(--text-main)]">
              {kpiStats.totalPOs}
            </div>
            <div className="text-xs text-[var(--text-muted)] mt-1">
              All registered orders across warehouses
            </div>
          </div>
        </div>

        {/* Pending Approval / Draft */}
        <div className="erp-card p-4 hover-lift">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-dim)] uppercase">Pending Approval / Draft</span>
            <div className="p-2 rounded-lg bg-[var(--amber-bg)] text-[var(--amber)]">
              <Clock size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-[var(--amber)]">
              {kpiStats.pendingPOs}
            </div>
            <div className="text-xs text-[var(--text-muted)] mt-1">
              Awaiting management authorization
            </div>
          </div>
        </div>

        {/* Ordered & In Receipt */}
        <div className="erp-card p-4 hover-lift">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-dim)] uppercase">Ordered & In-Transit</span>
            <div className="p-2 rounded-lg bg-[var(--cyan-bg)] text-[var(--cyan)]">
              <Truck size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-[var(--cyan)]">
              {kpiStats.orderedPOs}
            </div>
            <div className="text-xs text-[var(--text-muted)] mt-1">
              Ready for Goods Receipt Note (GRN)
            </div>
          </div>
        </div>

        {/* Total Spend */}
        <div className="erp-card p-4 hover-lift">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-dim)] uppercase">Procurement Spend</span>
            <div className="p-2 rounded-lg bg-[var(--emerald-bg)] text-[var(--emerald)]">
              <DollarSign size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-[var(--text-main)]">
              ${kpiStats.totalSpend.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-[var(--emerald)] mt-1 font-semibold">
              Active operating commitments
            </div>
          </div>
        </div>
      </div>

      {/* 3. Search & Filter Bar */}
      <div className="erp-card p-4 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Bar */}
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-dim)]" />
            <input
              type="text"
              placeholder="Search by PO number (e.g. PO-2026-0001) or supplier name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field pl-9 pr-8"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-dim)] hover:text-[var(--text-main)]"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Warehouse Dropdown Filter */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 border border-[var(--border-color)] rounded-lg px-2.5 py-1.5 bg-[var(--bg-primary)]">
              <WarehouseIcon size={14} className="text-[var(--text-dim)]" />
              <select
                value={warehouseFilter}
                onChange={(e) => setWarehouseFilter(e.target.value)}
                className="bg-transparent text-xs text-[var(--text-main)] border-none outline-none cursor-pointer"
              >
                <option value="all">All Destination Warehouses</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.warehouse_code})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Status Pills */}
        <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-[var(--border-color)]">
          <span className="text-xs font-semibold text-[var(--text-dim)] mr-1">Status:</span>
          {[
            { id: 'all', label: 'All POs', count: purchaseOrders.length },
            { id: 'draft', label: 'Draft', count: purchaseOrders.filter((p) => p.status === 'draft').length },
            { id: 'pending_approval', label: 'Pending Approval', count: purchaseOrders.filter((p) => p.status === 'pending_approval').length },
            { id: 'approved', label: 'Approved', count: purchaseOrders.filter((p) => p.status === 'approved').length },
            { id: 'ordered', label: 'Ordered', count: purchaseOrders.filter((p) => p.status === 'ordered').length },
            { id: 'partially_received', label: 'Partial', count: purchaseOrders.filter((p) => p.status === 'partially_received').length },
            { id: 'received', label: 'Received', count: purchaseOrders.filter((p) => p.status === 'received').length },
            { id: 'cancelled', label: 'Cancelled', count: purchaseOrders.filter((p) => p.status === 'cancelled').length }
          ].map((pill) => (
            <button
              key={pill.id}
              onClick={() => setStatusFilter(pill.id)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                statusFilter === pill.id
                  ? 'bg-[var(--accent-primary)] text-white shadow-sm font-semibold'
                  : 'bg-[var(--bg-primary)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)]'
              }`}
            >
              {pill.label} ({pill.count})
            </button>
          ))}
        </div>
      </div>

      {/* 4. Purchase Orders Interactive Table */}
      <div className="erp-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr>
                <th>PO Number</th>
                <th>Supplier</th>
                <th>Target Facility</th>
                <th>Order Date</th>
                <th>Expected Delivery</th>
                <th>Items</th>
                <th>Total Value</th>
                <th>Workflow Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-[var(--text-dim)]">
                    <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-[var(--accent-primary)]" />
                    <span>Loading purchase orders from embedded SQLite engine...</span>
                  </td>
                </tr>
              ) : filteredPOs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-[var(--text-dim)]">
                    <ShoppingBag size={32} className="mx-auto mb-2 opacity-40" />
                    <p className="text-sm font-medium">No purchase orders found matching current filters.</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Create a purchase order or adjust filters.</p>
                  </td>
                </tr>
              ) : (
                filteredPOs.map((po) => {
                  return (
                    <tr key={po.id} className="group">
                      {/* PO Number */}
                      <td>
                        <button
                          onClick={() => handleOpenDetailDrawer(po)}
                          className="chip-mono font-bold text-[var(--accent-primary)] hover:underline flex items-center gap-1"
                        >
                          {po.po_number}
                        </button>
                      </td>

                      {/* Supplier */}
                      <td>
                        <div className="font-semibold text-[var(--text-main)] group-hover:text-[var(--accent-primary)] transition-colors">
                          {po.supplier_name || 'Unknown Supplier'}
                        </div>
                        {po.supplier_code && (
                          <div className="text-[11px] font-mono text-[var(--text-dim)]">
                            {po.supplier_code}
                          </div>
                        )}
                      </td>

                      {/* Target Warehouse */}
                      <td>
                        <div className="text-xs text-[var(--text-main)] font-medium">
                          {po.warehouse_name || 'Main Facility'}
                        </div>
                        {po.warehouse_code && (
                          <div className="text-[10px] text-[var(--text-dim)] font-mono">
                            {po.warehouse_code}
                          </div>
                        )}
                      </td>

                      {/* Order Date */}
                      <td>
                        <div className="text-xs text-[var(--text-main)] font-mono">
                          {po.order_date ? po.order_date.slice(0, 10) : 'N/A'}
                        </div>
                      </td>

                      {/* Expected Delivery */}
                      <td>
                        <div className="text-xs text-[var(--text-main)] font-mono flex items-center gap-1">
                          <Calendar size={12} className="text-[var(--text-dim)]" />
                          <span>{po.expected_delivery_date ? po.expected_delivery_date.slice(0, 10) : 'Immediate'}</span>
                        </div>
                      </td>

                      {/* Items Count */}
                      <td>
                        <span className="text-xs font-semibold text-[var(--text-muted)] px-2 py-0.5 rounded bg-[var(--bg-hover)] border border-[var(--border-color)]">
                          {po.items_count ?? 1} SKUs
                        </span>
                      </td>

                      {/* Total Value */}
                      <td>
                        <span className="font-mono font-bold text-sm text-[var(--text-main)]">
                          ${(po.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </td>

                      {/* Workflow Status */}
                      <td>
                        {renderStatusBadge(po.status)}
                      </td>

                      {/* Progression & View Actions */}
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Workflow status progression button */}
                          {po.status === 'draft' && (
                            <button
                              onClick={() => handleTransitionStatus(po, 'pending_approval')}
                              className="btn btn-secondary text-xs px-2.5 py-1"
                              title="Submit for management approval"
                            >
                              <span>Submit</span>
                            </button>
                          )}

                          {po.status === 'pending_approval' && (
                            <button
                              onClick={() => handleTransitionStatus(po, 'approved')}
                              className="btn btn-success text-xs px-2.5 py-1"
                              title="Approve purchase order"
                            >
                              <Check size={13} />
                              <span>Approve</span>
                            </button>
                          )}

                          {po.status === 'approved' && (
                            <button
                              onClick={() => handleTransitionStatus(po, 'ordered')}
                              className="btn btn-primary text-xs px-2.5 py-1"
                              title="Mark as ordered & transmitted to supplier"
                            >
                              <Truck size={13} />
                              <span>Order</span>
                            </button>
                          )}

                          {(po.status === 'ordered' || po.status === 'partially_received') && (
                            <button
                              onClick={() => handleOpenGRNModal(po)}
                              className="btn btn-primary text-xs px-2.5 py-1"
                              title="Receive Goods / Inspection GRN"
                            >
                              <Boxes size={13} />
                              <span>Receive Goods</span>
                            </button>
                          )}

                          {/* Detail Drawer trigger */}
                          <button
                            onClick={() => handleOpenDetailDrawer(po)}
                            className="p-1.5 rounded-md hover:bg-[var(--bg-hover)] text-[var(--text-dim)] hover:text-[var(--text-main)] transition-colors"
                            title="View PO History & Line Items"
                          >
                            <Eye size={15} />
                          </button>

                          {/* Cancellation button for non-terminal states */}
                          {['draft', 'pending_approval', 'approved', 'ordered'].includes(po.status) && (
                            <button
                              onClick={() => handleTransitionStatus(po, 'cancelled')}
                              className="p-1.5 rounded-md hover:bg-[var(--ruby-bg)] text-[var(--text-dim)] hover:text-[var(--ruby)] transition-colors"
                              title="Cancel Purchase Order"
                            >
                              <XCircle size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Create Purchase Order Modal with Dynamic Line Item Adder */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="erp-card w-full max-w-4xl bg-[var(--bg-secondary)] border border-[var(--border-color)] shadow-2xl rounded-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] bg-[var(--bg-primary)]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-[var(--accent-glow)] text-[var(--accent-primary)]">
                  <Plus size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[var(--text-main)]">
                    Create New Purchase Order
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    Issue an offline purchase order, specify line items, and set delivery SLA targets.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 rounded-md text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body Form */}
            <form onSubmit={handleCreatePurchaseOrder} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
              {/* Header Fields: PO Number, Supplier, Warehouse */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    PO Number *
                  </label>
                  <input
                    type="text"
                    value={newPOHeader.po_number}
                    onChange={(e) => setNewPOHeader({ ...newPOHeader, po_number: e.target.value.toUpperCase() })}
                    placeholder="PO-2026-0001"
                    className={`input-field font-mono uppercase ${createFormErrors.po_number ? 'border-[var(--ruby)]' : ''}`}
                  />
                  {createFormErrors.po_number && (
                    <span className="text-[11px] text-[var(--ruby)] mt-1 block">{createFormErrors.po_number}</span>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    Select Vendor / Supplier *
                  </label>
                  <select
                    value={newPOHeader.supplier_id}
                    onChange={(e) => {
                      const supId = e.target.value;
                      const sup = suppliers.find((s) => s.id === supId);
                      let expDate = newPOHeader.expected_delivery_date;
                      if (sup?.lead_time_days) {
                        const d = new Date(newPOHeader.order_date || new Date());
                        d.setDate(d.getDate() + sup.lead_time_days);
                        expDate = d.toISOString().slice(0, 10);
                      }
                      setNewPOHeader({
                        ...newPOHeader,
                        supplier_id: supId,
                        expected_delivery_date: expDate
                      });
                    }}
                    className={`input-field ${createFormErrors.supplier_id ? 'border-[var(--ruby)]' : ''}`}
                  >
                    <option value="">-- Choose Supplier --</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.supplier_code}) - Lead: {s.lead_time_days ?? 7}d
                      </option>
                    ))}
                  </select>
                  {createFormErrors.supplier_id && (
                    <span className="text-[11px] text-[var(--ruby)] mt-1 block">{createFormErrors.supplier_id}</span>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    Target Destination Facility *
                  </label>
                  <select
                    value={newPOHeader.target_warehouse_id}
                    onChange={(e) => setNewPOHeader({ ...newPOHeader, target_warehouse_id: e.target.value })}
                    className={`input-field ${createFormErrors.target_warehouse_id ? 'border-[var(--ruby)]' : ''}`}
                  >
                    <option value="">-- Choose Warehouse --</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({w.warehouse_code})
                      </option>
                    ))}
                  </select>
                  {createFormErrors.target_warehouse_id && (
                    <span className="text-[11px] text-[var(--ruby)] mt-1 block">{createFormErrors.target_warehouse_id}</span>
                  )}
                </div>
              </div>

              {/* Row 2: Dates and Payment Terms */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    Order Issue Date
                  </label>
                  <input
                    type="date"
                    value={newPOHeader.order_date}
                    onChange={(e) => setNewPOHeader({ ...newPOHeader, order_date: e.target.value })}
                    className="input-field font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    Expected Dock Delivery Date
                  </label>
                  <input
                    type="date"
                    value={newPOHeader.expected_delivery_date}
                    onChange={(e) => setNewPOHeader({ ...newPOHeader, expected_delivery_date: e.target.value })}
                    className="input-field font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    Payment Terms
                  </label>
                  <input
                    type="text"
                    value={newPOHeader.payment_terms}
                    onChange={(e) => setNewPOHeader({ ...newPOHeader, payment_terms: e.target.value })}
                    placeholder="Net 30, COD, LC"
                    className="input-field"
                  />
                </div>
              </div>

              {/* Dynamic Line Item Adder Section */}
              <div className="border border-[var(--border-color)] rounded-lg p-4 bg-[var(--bg-primary)] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Boxes size={16} className="text-[var(--accent-primary)]" />
                    <span className="text-xs font-bold text-[var(--text-main)] uppercase tracking-wider">
                      Purchase Order Line Items ({newLineItems.length})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddLineItem}
                    className="btn btn-secondary text-xs px-2.5 py-1"
                  >
                    <Plus size={14} />
                    <span>Add Item Row</span>
                  </button>
                </div>

                {createFormErrors.items && (
                  <div className="p-2 rounded bg-[var(--ruby-bg)] border border-[var(--ruby-border)] text-xs text-[var(--ruby)] font-medium">
                    {createFormErrors.items}
                  </div>
                )}

                {/* Line Items Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--border-color)] text-[var(--text-dim)] font-semibold uppercase">
                        <th className="py-2 px-2 w-[40%]">Catalog Product / SKU</th>
                        <th className="py-2 px-2 w-[15%]">Quantity</th>
                        <th className="py-2 px-2 w-[18%]">Unit Price ($)</th>
                        <th className="py-2 px-2 w-[12%]">Tax %</th>
                        <th className="py-2 px-2 w-[15%] text-right">Line Total</th>
                        <th className="py-2 px-1 w-[40px] text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-color)]">
                      {newLineItems.map((item, idx) => {
                        const lineSubtotal = (item.quantityOrdered || 0) * (item.unitCost || 0);
                        const lineTax = lineSubtotal * ((item.taxRate || 0) / 100);
                        const lineTotal = lineSubtotal + lineTax;

                        return (
                          <tr key={idx} className="bg-[var(--bg-secondary)]">
                            {/* Product Selector */}
                            <td className="p-2">
                              <select
                                value={item.itemId}
                                onChange={(e) => handleLineItemChange(idx, 'itemId', e.target.value)}
                                className="input-field text-xs py-1"
                              >
                                {catalogItems.map((cat) => (
                                  <option key={cat.id} value={cat.id}>
                                    {cat.sku} - {cat.name} (${cat.cost_price.toFixed(2)})
                                  </option>
                                ))}
                              </select>
                            </td>

                            {/* Quantity */}
                            <td className="p-2">
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  min={1}
                                  value={item.quantityOrdered}
                                  onChange={(e) => handleLineItemChange(idx, 'quantityOrdered', parseInt(e.target.value) || 0)}
                                  className="input-field font-mono text-xs py-1 w-full"
                                />
                                <span className="text-[10px] text-[var(--text-dim)]">{item.unitOfMeasure}</span>
                              </div>
                            </td>

                            {/* Unit Cost */}
                            <td className="p-2">
                              <input
                                type="number"
                                step={0.01}
                                min={0}
                                value={item.unitCost}
                                onChange={(e) => handleLineItemChange(idx, 'unitCost', parseFloat(e.target.value) || 0)}
                                className="input-field font-mono text-xs py-1 w-full"
                              />
                            </td>

                            {/* Tax Rate % */}
                            <td className="p-2">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={item.taxRate}
                                onChange={(e) => handleLineItemChange(idx, 'taxRate', parseFloat(e.target.value) || 0)}
                                className="input-field font-mono text-xs py-1 w-full"
                              />
                            </td>

                            {/* Line Total */}
                            <td className="p-2 text-right font-mono font-semibold text-[var(--text-main)]">
                              ${lineTotal.toFixed(2)}
                            </td>

                            {/* Remove Row */}
                            <td className="p-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveLineItem(idx)}
                                className="text-[var(--text-dim)] hover:text-[var(--ruby)] p-1 rounded"
                                title="Remove line item"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Financial Summary & Shipping Calculation */}
                <div className="pt-3 border-t border-[var(--border-color)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="w-full sm:w-1/2">
                    <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                      Shipping / Logistics Freight Cost ($)
                    </label>
                    <input
                      type="number"
                      step={0.01}
                      min={0}
                      value={newPOHeader.shipping_cost}
                      onChange={(e) => setNewPOHeader({ ...newPOHeader, shipping_cost: parseFloat(e.target.value) || 0 })}
                      className="input-field font-mono text-xs w-full sm:w-48"
                    />
                  </div>

                  <div className="w-full sm:w-1/2 bg-[var(--bg-secondary)] p-3 rounded-lg border border-[var(--border-color)] space-y-1.5 text-xs">
                    <div className="flex justify-between text-[var(--text-dim)]">
                      <span>Items Subtotal:</span>
                      <span className="font-mono text-[var(--text-main)]">${newPOCalculations.subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-[var(--text-dim)]">
                      <span>Estimated Tax:</span>
                      <span className="font-mono text-[var(--text-main)]">${newPOCalculations.taxAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-[var(--text-dim)]">
                      <span>Shipping / Freight:</span>
                      <span className="font-mono text-[var(--text-main)]">${newPOCalculations.shipping.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-sm text-[var(--text-main)] pt-1.5 border-t border-[var(--border-color)]">
                      <span>Grand Total:</span>
                      <span className="font-mono text-[var(--accent-primary)]">${newPOCalculations.totalAmount.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                  Purchase Order Notes & Special Instructions
                </label>
                <textarea
                  rows={2}
                  value={newPOHeader.notes}
                  onChange={(e) => setNewPOHeader({ ...newPOHeader, notes: e.target.value })}
                  placeholder="Gate pass instructions, dock receiving windows, pallet specifications..."
                  className="input-field"
                />
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--border-color)]">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  <Check size={16} />
                  <span>Generate Purchase Order</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Goods Receipt Note (GRN) Inspection Modal */}
      {isGRNModalOpen && grnTargetPO && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="erp-card w-full max-w-4xl bg-[var(--bg-secondary)] border border-[var(--border-color)] shadow-2xl rounded-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* GRN Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] bg-[var(--bg-primary)]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-[var(--emerald-bg)] text-[var(--emerald)]">
                  <ClipboardCheck size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[var(--text-main)]">
                    Goods Receipt Note (GRN) & QA Inspection
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    Receive goods against <span className="font-mono font-bold">{grnTargetPO.po_number}</span> from{' '}
                    <span className="font-semibold">{grnTargetPO.supplier_name}</span> into destination warehouse.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsGRNModalOpen(false)}
                className="p-1 rounded-md text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]"
              >
                <X size={18} />
              </button>
            </div>

            {/* GRN Body Form */}
            <form onSubmit={handleSubmitGRN} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
              {/* Receipt Metadata */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-3.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)]">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    Receipt Number
                  </label>
                  <input
                    type="text"
                    value={grnHeader.receipt_number}
                    onChange={(e) => setGrnHeader({ ...grnHeader, receipt_number: e.target.value.toUpperCase() })}
                    className="input-field font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    Receipt Date
                  </label>
                  <input
                    type="date"
                    value={grnHeader.receipt_date}
                    onChange={(e) => setGrnHeader({ ...grnHeader, receipt_date: e.target.value })}
                    className="input-field font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    Receiving Officer
                  </label>
                  <input
                    type="text"
                    value={grnHeader.received_by}
                    onChange={(e) => setGrnHeader({ ...grnHeader, received_by: e.target.value })}
                    className="input-field"
                  />
                </div>
              </div>

              {/* Line Items Receiving & Inspection */}
              <div className="space-y-3">
                <div className="text-xs font-bold text-[var(--text-main)] uppercase tracking-wider flex items-center justify-between">
                  <span>Line Items Inspection & Quality Verification</span>
                  <span className="text-[11px] text-[var(--text-dim)]">Atomic inventory increment on receipt</span>
                </div>

                <div className="space-y-3">
                  {grnLineInspections.map((line, idx) => {
                    const targetBins = warehouseLocations.filter(
                      (b) => b.warehouse_id === grnTargetPO.target_warehouse_id
                    );

                    return (
                      <div
                        key={line.poItemId}
                        className="p-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] space-y-3"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border-color)] pb-2">
                          <div>
                            <span className="chip-mono font-bold text-xs">{line.sku}</span>
                            <span className="ml-2 font-semibold text-xs text-[var(--text-main)]">{line.name}</span>
                          </div>
                          <div className="text-xs text-[var(--text-dim)] flex items-center gap-3">
                            <span>Ordered: <strong className="text-[var(--text-main)]">{line.quantityOrdered}</strong></span>
                            <span>Already Received: <strong className="text-[var(--emerald)]">{line.quantityAlreadyReceived}</strong></span>
                            <span>Remaining: <strong className="text-[var(--accent-primary)]">{line.quantityRemaining}</strong></span>
                          </div>
                        </div>

                        {/* Quantity Inputs */}
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                          <div>
                            <label className="block font-semibold text-[var(--text-main)] mb-1">
                              Accepted Qty *
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={line.quantityRemaining}
                              value={line.quantityAccepted}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                const updated = [...grnLineInspections];
                                updated[idx].quantityAccepted = val;
                                setGrnLineInspections(updated);
                              }}
                              className="input-field font-mono font-bold text-[var(--emerald)]"
                            />
                            <span className="text-[10px] text-[var(--text-dim)]">Increments stock balance</span>
                          </div>

                          <div>
                            <label className="block font-semibold text-[var(--text-main)] mb-1">
                              Damaged / Rejected Qty
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={line.quantityRemaining - line.quantityAccepted}
                              value={line.quantityRejected}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                const updated = [...grnLineInspections];
                                updated[idx].quantityRejected = val;
                                setGrnLineInspections(updated);
                              }}
                              className="input-field font-mono font-bold text-[var(--ruby)]"
                            />
                            <span className="text-[10px] text-[var(--text-dim)]">Quarantined from inventory</span>
                          </div>

                          <div>
                            <label className="block font-semibold text-[var(--text-main)] mb-1">
                              Target Bin / Rack
                            </label>
                            <select
                              value={line.binId}
                              onChange={(e) => {
                                const updated = [...grnLineInspections];
                                updated[idx].binId = e.target.value;
                                setGrnLineInspections(updated);
                              }}
                              className="input-field text-xs py-1"
                            >
                              {targetBins.length > 0 ? (
                                targetBins.map((b) => (
                                  <option key={b.id} value={b.id}>
                                    {b.bin_code} ({b.zone})
                                  </option>
                                ))
                              ) : (
                                <option value="">No bins defined</option>
                              )}
                            </select>
                            <span className="text-[10px] text-[var(--text-dim)]">Warehouse location</span>
                          </div>

                          <div>
                            <label className="block font-semibold text-[var(--text-main)] mb-1">
                              Batch / Lot Number
                            </label>
                            <input
                              type="text"
                              value={line.batchNumber}
                              onChange={(e) => {
                                const updated = [...grnLineInspections];
                                updated[idx].batchNumber = e.target.value.toUpperCase();
                                setGrnLineInspections(updated);
                              }}
                              placeholder="LOT-2026-001"
                              className="input-field font-mono uppercase text-xs"
                            />
                            <span className="text-[10px] text-[var(--text-dim)]">Traceability batch</span>
                          </div>
                        </div>

                        {/* Rejection reason (if rejected > 0) */}
                        {line.quantityRejected > 0 && (
                          <div>
                            <label className="block text-xs font-semibold text-[var(--ruby)] mb-1">
                              Defect / Rejection Reason
                            </label>
                            <input
                              type="text"
                              value={line.rejectionReason}
                              onChange={(e) => {
                                const updated = [...grnLineInspections];
                                updated[idx].rejectionReason = e.target.value;
                                setGrnLineInspections(updated);
                              }}
                              placeholder="e.g. Moisture ingress, broken carton seal, crushed packaging"
                              className="input-field text-xs border-[var(--ruby-border)]"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Inspection Notes */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                  Overall Quality & Inspection Remarks
                </label>
                <textarea
                  rows={2}
                  value={grnHeader.inspection_notes}
                  onChange={(e) => setGrnHeader({ ...grnHeader, inspection_notes: e.target.value })}
                  placeholder="Record dock conditions, driver sign-off, or physical seal verification..."
                  className="input-field"
                />
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--border-color)]">
                <button
                  type="button"
                  onClick={() => setIsGRNModalOpen(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  <CheckCircle2 size={16} />
                  <span>Confirm Goods Receipt & Increment Stock</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. PO Detail Drawer / Modal */}
      {isDetailDrawerOpen && selectedPO && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-end">
          <div className="erp-card w-full max-w-2xl h-full bg-[var(--bg-secondary)] border-l border-[var(--border-color)] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] bg-[var(--bg-primary)]">
              <div>
                <div className="flex items-center gap-2">
                  <span className="chip-mono font-bold text-sm text-[var(--accent-primary)]">
                    {selectedPO.po_number}
                  </span>
                  {renderStatusBadge(selectedPO.status)}
                </div>
                <div className="text-xs text-[var(--text-muted)] mt-1">
                  Vendor: <strong>{selectedPO.supplier_name}</strong> | Target: <strong>{selectedPO.warehouse_name}</strong>
                </div>
              </div>
              <button
                onClick={() => setIsDetailDrawerOpen(false)}
                className="p-1 rounded-md text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]"
              >
                <X size={18} />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Status Stepper */}
              <div className="p-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)]">
                <div className="text-xs font-bold text-[var(--text-main)] uppercase tracking-wider mb-3">
                  Workflow Progression State
                </div>
                <div className="flex items-center justify-between text-xs font-semibold">
                  {[
                    { key: 'draft', label: '1. Draft' },
                    { key: 'pending_approval', label: '2. Pending' },
                    { key: 'approved', label: '3. Approved' },
                    { key: 'ordered', label: '4. Ordered' },
                    { key: 'received', label: '5. Received' }
                  ].map((step, idx) => {
                    const statusOrder = ['draft', 'pending_approval', 'approved', 'ordered', 'partially_received', 'received'];
                    const currentIdx = statusOrder.indexOf(selectedPO.status);
                    const stepIdx = statusOrder.indexOf(step.key);
                    const isReached = currentIdx >= stepIdx;

                    return (
                      <div key={step.key} className="flex flex-col items-center">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                            isReached
                              ? 'bg-[var(--emerald)] text-white'
                              : 'bg-[var(--bg-tertiary)] text-[var(--text-dim)]'
                          }`}
                        >
                          {isReached ? '✓' : idx + 1}
                        </div>
                        <span className={`text-[10px] mt-1 ${isReached ? 'text-[var(--text-main)] font-bold' : 'text-[var(--text-dim)]'}`}>
                          {step.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Order Metadata */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)]">
                  <span className="text-[var(--text-dim)] block">Order Issue Date:</span>
                  <span className="font-mono font-semibold text-[var(--text-main)]">
                    {selectedPO.order_date ? selectedPO.order_date.slice(0, 10) : 'N/A'}
                  </span>
                </div>
                <div className="p-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)]">
                  <span className="text-[var(--text-dim)] block">Expected Delivery:</span>
                  <span className="font-mono font-semibold text-[var(--text-main)]">
                    {selectedPO.expected_delivery_date ? selectedPO.expected_delivery_date.slice(0, 10) : 'Immediate'}
                  </span>
                </div>
                <div className="p-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)]">
                  <span className="text-[var(--text-dim)] block">Payment Terms:</span>
                  <span className="font-semibold text-[var(--text-main)]">{selectedPO.payment_terms || 'Net 30'}</span>
                </div>
                <div className="p-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)]">
                  <span className="text-[var(--text-dim)] block">Grand Total Value:</span>
                  <span className="font-mono font-bold text-sm text-[var(--accent-primary)]">
                    ${(selectedPO.total_amount || 0).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Ordered Items Table */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-[var(--text-main)] uppercase tracking-wider flex items-center justify-between">
                  <span>Ordered Line Items ({poDetailsItems.length})</span>
                </div>
                <div className="border border-[var(--border-color)] rounded-lg overflow-hidden">
                  <table className="erp-table text-xs">
                    <thead>
                      <tr>
                        <th>SKU & Product</th>
                        <th className="text-right">Ordered</th>
                        <th className="text-right">Received</th>
                        <th className="text-right">Unit Price</th>
                        <th className="text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {poDetailsItems.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <div className="font-mono font-bold text-[var(--accent-primary)]">{item.sku}</div>
                            <div className="text-[11px] text-[var(--text-dim)] truncate max-w-[150px]">
                              {(item as any).item_name || ''}
                            </div>
                          </td>
                          <td className="text-right font-mono">{item.quantity_ordered}</td>
                          <td className="text-right font-mono font-bold text-[var(--emerald)]">
                            {item.quantity_received}
                          </td>
                          <td className="text-right font-mono">${item.unit_cost.toFixed(2)}</td>
                          <td className="text-right font-mono font-bold">${item.subtotal.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Goods Receipt Logs */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-[var(--text-main)] uppercase tracking-wider flex items-center justify-between">
                  <span>Goods Receipt Inspection Logs ({poDetailsReceipts.length})</span>
                </div>
                {poDetailsReceipts.length === 0 ? (
                  <div className="p-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] text-center text-xs text-[var(--text-dim)]">
                    No Goods Receipt Notes have been issued against this PO yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {poDetailsReceipts.map((gr) => (
                      <div
                        key={gr.id}
                        className="p-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] space-y-1.5 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="chip-mono font-bold">{gr.receipt_number}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[var(--text-dim)]">{gr.receipt_date}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setPrintModalState({
                                  isOpen: true,
                                  type: 'grn_chit',
                                  data: {
                                    ...gr,
                                    po_number: selectedPO.po_number,
                                    supplier_name: selectedPO.supplier_name,
                                    items: poDetailsItems.map((it) => ({
                                      sku: it.sku,
                                      name: (it as any).item_name,
                                      quantity_accepted: gr.total_accepted || it.quantity_received,
                                      quantity_rejected: gr.total_rejected || 0,
                                      bin_code: selectedPO.warehouse_code || 'Central DC Bin',
                                      batch_number: 'LOT-' + (gr.receipt_number || '0000').slice(-4)
                                    }))
                                  }
                                });
                              }}
                              className="px-2 py-0.5 rounded border border-[var(--border-color)] hover:bg-[var(--bg-hover)] text-[11px] font-semibold flex items-center gap-1 text-[var(--text-main)]"
                            >
                              <Printer size={12} />
                              <span>Print Chit</span>
                            </button>
                          </div>
                        </div>
                        <div className="text-[var(--text-muted)]">
                          Inspector: <strong>{gr.received_by}</strong> | Accepted Units:{' '}
                          <strong className="text-[var(--emerald)]">{gr.total_accepted || 0}</strong> | Rejected:{' '}
                          <strong className="text-[var(--ruby)]">{gr.total_rejected || 0}</strong>
                        </div>
                        {gr.inspection_notes && (
                          <div className="text-[11px] text-[var(--text-dim)] italic">
                            "{gr.inspection_notes}"
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Drawer Footer Actions */}
            <div className="p-4 border-t border-[var(--border-color)] bg-[var(--bg-primary)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPrintModalState({
                      isOpen: true,
                      type: 'po_slip',
                      data: {
                        ...selectedPO,
                        items: poDetailsItems
                      }
                    });
                  }}
                  className="btn btn-secondary text-xs flex items-center gap-1.5"
                >
                  <Printer size={14} />
                  <span>Print PO Slip</span>
                </button>

                {(selectedPO.status === 'ordered' || selectedPO.status === 'partially_received') && (
                  <button
                    onClick={() => {
                      setIsDetailDrawerOpen(false);
                      handleOpenGRNModal(selectedPO);
                    }}
                    className="btn btn-primary text-xs"
                  >
                    <Boxes size={14} />
                    <span>Receive Goods (GRN)</span>
                  </button>
                )}
              </div>
              <button
                onClick={() => setIsDetailDrawerOpen(false)}
                className="btn btn-secondary text-xs"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print Voucher Modal */}
      <PrintVoucherModal
        isOpen={printModalState.isOpen}
        onClose={() => setPrintModalState((prev) => ({ ...prev, isOpen: false }))}
        type={printModalState.type}
        data={printModalState.data}
      />
    </div>
  );
};

export default ProcurementView;
