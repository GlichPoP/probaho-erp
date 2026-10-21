// ============================================================================
// PROBAHO ERP: MULTI-WAREHOUSE INVENTORY & STOCK MANAGEMENT VIEW
// Proposed File: src/views/InventoryView.tsx (Milestone 3)
// Real-Time Stock, Bins, Batches, WAC/FIFO Valuation, Adjustments & Transfers
// High-Contrast Theme Compliant, Offline-First SQLite Powered
// ============================================================================

import React, { useState, useEffect, useMemo } from 'react';
import {
  Boxes,
  Search,
  Filter,
  ArrowUpDown,
  RefreshCw,
  Plus,
  ArrowRightLeft,
  Sliders,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  DollarSign,
  Package,
  Layers,
  MapPin,
  Calendar,
  X,
  Eye,
  Info,
  ShieldAlert,
  ChevronRight,
  TrendingDown,
  Building2,
  Check,
  FileText
} from 'lucide-react';
import { dbService } from '../services/db';
import type {
  Item,
  Warehouse,
  WarehouseLocation,
  ItemBatch,
  ValuationMethod
} from '../types/erp';

// Joined inventory row structure for high-density enterprise display
export interface InventoryStockRecord {
  stock_id: string;
  item_id: string;
  sku: string;
  barcode?: string;
  item_name: string;
  category: string;
  unit_of_measure: string;
  valuation_method: ValuationMethod;
  min_stock_alert: number;
  safety_stock: number;
  cost_price: number;
  selling_price: number;

  warehouse_id: string;
  warehouse_code: string;
  warehouse_name: string;

  bin_id?: string;
  bin_code?: string;
  bin_zone?: string;
  bin_aisle?: string;

  batch_id?: string;
  batch_number?: string;
  manufacture_date?: string;
  expiry_date?: string;
  batch_unit_cost?: number;

  quantity_on_hand: number;
  quantity_reserved: number;
  quantity_available: number;

  unit_cost: number;
  total_value: number;
  updated_at: string;
}

export interface InventoryKPISummary {
  totalStockUnits: number;
  activeSkusCount: number;
  totalAssetValuation: number;
  lowStockAlertsCount: number;
  expiringSoonBatchesCount: number;
}

export interface TransferWizardItem {
  itemId: string;
  sku: string;
  name: string;
  sourceBinId: string;
  destBinId: string;
  batchId?: string;
  batchNumber?: string;
  availableQuantity: number;
  transferQuantity: number;
}

export interface InventoryViewProps {
  onNavigateToWarehouses?: () => void;
  initialSearchQuery?: string;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  onNavigateToWarehouses,
  initialSearchQuery
}) => {
  // --------------------------------------------------------------------------
  // Core State
  // --------------------------------------------------------------------------
  const [stockRecords, setStockRecords] = useState<InventoryStockRecord[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseLocations, setWarehouseLocations] = useState<WarehouseLocation[]>([]);
  const [itemsCatalog, setItemsCatalog] = useState<Item[]>([]);
  const [batches, setBatches] = useState<ItemBatch[]>([]);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>(initialSearchQuery || '');

  useEffect(() => {
    if (initialSearchQuery !== undefined) {
      setSearchQuery(initialSearchQuery);
    }
  }, [initialSearchQuery]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStockStatus, setSelectedStockStatus] = useState<
    'all' | 'in_stock' | 'low_stock' | 'out_of_stock' | 'expiring_soon'
  >('all');
  const [selectedValuationMethod, setSelectedValuationMethod] = useState<string>('all');

  const [sortBy, setSortBy] = useState<'sku' | 'name' | 'quantity' | 'value' | 'expiry'>('sku');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Modals & Drawers
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState<boolean>(false);
  const [isTransferWizardOpen, setIsTransferWizardOpen] = useState<boolean>(false);
  const [selectedBatchDetail, setSelectedBatchDetail] = useState<{
    record: InventoryStockRecord;
    history: any[];
  } | null>(null);

  // Notification Toast
  const [notification, setNotification] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  const showToast = (type: 'success' | 'error' | 'info', text: string) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 4500);
  };

  // --------------------------------------------------------------------------
  // Form State: Stock Adjustment Modal
  // --------------------------------------------------------------------------
  const [adjustmentForm, setAdjustmentForm] = useState({
    itemId: '',
    warehouseId: '',
    binId: '',
    batchId: '',
    mode: 'cycle_count' as 'cycle_count' | 'direct_delta',
    physicalCount: 0,
    adjustmentDelta: 0,
    reason: 'CYCLE_COUNT_ADJUSTMENT' as 'CYCLE_COUNT_ADJUSTMENT' | 'ADJUSTMENT_WRITE_OFF',
    notes: 'Annual physical warehouse inventory reconciliation.'
  });
  const [adjustmentCurrentStock, setAdjustmentCurrentStock] = useState<number>(0);

  // --------------------------------------------------------------------------
  // Form State: Stock Transfer Wizard Modal
  // --------------------------------------------------------------------------
  const [transferHeader, setTransferHeader] = useState({
    transferNumber: '',
    sourceWarehouseId: '',
    destWarehouseId: '',
    requestedBy: 'Warehouse Operations Manager',
    notes: 'Stock replenishment transfer between distribution facilities.'
  });
  const [transferLines, setTransferLines] = useState<TransferWizardItem[]>([]);
  const [transferDraftLine, setTransferDraftLine] = useState({
    itemId: '',
    sourceBinId: '',
    destBinId: '',
    batchId: '',
    transferQuantity: 1
  });

  // --------------------------------------------------------------------------
  // Data Fetching: Load All Stock and Relational Metadata
  // --------------------------------------------------------------------------
  const loadInventoryData = async () => {
    try {
      setIsLoading(true);
      await dbService.initialize();

      // 1. Master Warehouses
      const whs = await dbService.query<Warehouse>(
        `SELECT * FROM warehouses WHERE is_active = 1 ORDER BY name ASC;`
      );
      setWarehouses(whs);

      // 2. Locations / Bins
      const locs = await dbService.query<WarehouseLocation>(
        `SELECT * FROM warehouse_locations WHERE is_active = 1 ORDER BY bin_code ASC;`
      );
      setWarehouseLocations(locs);

      // 3. Items Catalog
      const items = await dbService.query<Item>(
        `SELECT * FROM items WHERE is_active = 1 ORDER BY sku ASC;`
      );
      setItemsCatalog(items);

      // 4. Batches
      const batchRows = await dbService.query<ItemBatch>(
        `SELECT * FROM item_batches ORDER BY batch_number ASC;`
      );
      setBatches(batchRows);

      // 5. High-Density Joined Stock Records
      const stockRows = await dbService.query<any>(`
        SELECT 
          s.id AS stock_id,
          s.item_id,
          i.sku,
          i.barcode,
          i.name AS item_name,
          i.category,
          i.unit_of_measure,
          i.valuation_method,
          i.min_stock_alert,
          i.safety_stock,
          i.cost_price,
          i.selling_price,

          s.warehouse_id,
          w.warehouse_code,
          w.name AS warehouse_name,

          s.bin_id,
          l.bin_code,
          l.zone AS bin_zone,
          l.aisle AS bin_aisle,

          s.batch_id,
          b.batch_number,
          b.manufacture_date,
          b.expiry_date,
          b.unit_cost AS batch_unit_cost,

          s.quantity_on_hand,
          s.quantity_reserved,
          s.updated_at
        FROM inventory_stock s
        JOIN items i ON s.item_id = i.id
        JOIN warehouses w ON s.warehouse_id = w.id
        LEFT JOIN warehouse_locations l ON s.bin_id = l.id
        LEFT JOIN item_batches b ON s.batch_id = b.id
        ORDER BY i.sku ASC, w.warehouse_code ASC;
      `);

      const formatted: InventoryStockRecord[] = stockRows.map((row: any) => {
        const qOnHand = Number(row.quantity_on_hand || 0);
        const qReserved = Number(row.quantity_reserved || 0);
        const qAvailable = Math.max(0, qOnHand - qReserved);
        const unitCost = Number(row.batch_unit_cost ?? row.cost_price ?? 0);
        const totalValue = Math.round(qOnHand * unitCost * 100) / 100;

        return {
          stock_id: row.stock_id,
          item_id: row.item_id,
          sku: row.sku,
          barcode: row.barcode,
          item_name: row.item_name,
          category: row.category,
          unit_of_measure: row.unit_of_measure,
          valuation_method: row.valuation_method || 'MOVING_AVERAGE',
          min_stock_alert: Number(row.min_stock_alert || 10),
          safety_stock: Number(row.safety_stock || 5),
          cost_price: Number(row.cost_price || 0),
          selling_price: Number(row.selling_price || 0),

          warehouse_id: row.warehouse_id,
          warehouse_code: row.warehouse_code,
          warehouse_name: row.warehouse_name,

          bin_id: row.bin_id,
          bin_code: row.bin_code || 'UNASSIGNED',
          bin_zone: row.bin_zone,
          bin_aisle: row.bin_aisle,

          batch_id: row.batch_id,
          batch_number: row.batch_number || 'DEFAULT-LOT',
          manufacture_date: row.manufacture_date,
          expiry_date: row.expiry_date,
          batch_unit_cost: row.batch_unit_cost ? Number(row.batch_unit_cost) : undefined,

          quantity_on_hand: qOnHand,
          quantity_reserved: qReserved,
          quantity_available: qAvailable,

          unit_cost: unitCost,
          total_value: totalValue,
          updated_at: row.updated_at
        };
      });

      setStockRecords(formatted);
    } catch (err: any) {
      console.error('Failed to load inventory data:', err);
      showToast('error', `Failed to load inventory: ${err.message || String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadInventoryData();
  }, []);

  // --------------------------------------------------------------------------
  // Summary KPIs Computation
  // --------------------------------------------------------------------------
  const summaryKPIs: InventoryKPISummary = useMemo(() => {
    let totalStockUnits = 0;
    let totalAssetValuation = 0;
    const distinctItemIds = new Set<string>();
    const lowStockItemIds = new Set<string>();
    let expiringSoonCount = 0;

    const now = new Date();
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;

    for (const rec of stockRecords) {
      totalStockUnits += rec.quantity_on_hand;
      totalAssetValuation += rec.total_value;
      distinctItemIds.add(rec.item_id);

      if (rec.quantity_on_hand <= rec.min_stock_alert) {
        lowStockItemIds.add(rec.item_id);
      }

      if (rec.expiry_date) {
        const expDate = new Date(rec.expiry_date);
        const diff = expDate.getTime() - now.getTime();
        if (diff <= ninetyDaysMs && rec.quantity_on_hand > 0) {
          expiringSoonCount++;
        }
      }
    }

    return {
      totalStockUnits,
      activeSkusCount: distinctItemIds.size,
      totalAssetValuation: Math.round(totalAssetValuation * 100) / 100,
      lowStockAlertsCount: lowStockItemIds.size,
      expiringSoonBatchesCount: expiringSoonCount
    };
  }, [stockRecords]);

  // Unique categories list
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    itemsCatalog.forEach((i) => set.add(i.category));
    return Array.from(set).sort();
  }, [itemsCatalog]);

  // --------------------------------------------------------------------------
  // Filter & Sort Logic
  // --------------------------------------------------------------------------
  const filteredStock = useMemo(() => {
    const now = new Date();
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;

    return stockRecords
      .filter((rec) => {
        // Warehouse filter
        if (selectedWarehouseId !== 'all' && rec.warehouse_id !== selectedWarehouseId) {
          return false;
        }

        // Category filter
        if (selectedCategory !== 'all' && rec.category !== selectedCategory) {
          return false;
        }

        // Valuation method filter
        if (selectedValuationMethod !== 'all' && rec.valuation_method !== selectedValuationMethod) {
          return false;
        }

        // Stock status filter
        if (selectedStockStatus === 'in_stock' && rec.quantity_on_hand <= 0) return false;
        if (selectedStockStatus === 'low_stock' && rec.quantity_on_hand > rec.min_stock_alert) return false;
        if (selectedStockStatus === 'out_of_stock' && rec.quantity_on_hand > 0) return false;
        if (selectedStockStatus === 'expiring_soon') {
          if (!rec.expiry_date) return false;
          const exp = new Date(rec.expiry_date).getTime() - now.getTime();
          if (exp > ninetyDaysMs || rec.quantity_on_hand <= 0) return false;
        }

        // Text search
        if (searchQuery.trim() !== '') {
          const q = searchQuery.toLowerCase();
          const matchSku = rec.sku.toLowerCase().includes(q);
          const matchName = rec.item_name.toLowerCase().includes(q);
          const matchCat = rec.category.toLowerCase().includes(q);
          const matchWh = rec.warehouse_name.toLowerCase().includes(q) || rec.warehouse_code.toLowerCase().includes(q);
          const matchBin = (rec.bin_code || '').toLowerCase().includes(q);
          const matchBatch = (rec.batch_number || '').toLowerCase().includes(q);
          const matchBarcode = (rec.barcode || '').toLowerCase().includes(q);
          return matchSku || matchName || matchCat || matchWh || matchBin || matchBatch || matchBarcode;
        }

        return true;
      })
      .sort((a, b) => {
        let comp = 0;
        if (sortBy === 'sku') comp = a.sku.localeCompare(b.sku);
        else if (sortBy === 'name') comp = a.item_name.localeCompare(b.item_name);
        else if (sortBy === 'quantity') comp = a.quantity_on_hand - b.quantity_on_hand;
        else if (sortBy === 'value') comp = a.total_value - b.total_value;
        else if (sortBy === 'expiry') {
          const timeA = a.expiry_date ? new Date(a.expiry_date).getTime() : 9999999999999;
          const timeB = b.expiry_date ? new Date(b.expiry_date).getTime() : 9999999999999;
          comp = timeA - timeB;
        }

        return sortOrder === 'asc' ? comp : -comp;
      });
  }, [
    stockRecords,
    selectedWarehouseId,
    selectedCategory,
    selectedStockStatus,
    selectedValuationMethod,
    searchQuery,
    sortBy,
    sortOrder
  ]);

  // --------------------------------------------------------------------------
  // Open Stock Adjustment Modal
  // --------------------------------------------------------------------------
  const handleOpenAdjustmentModal = (prefillRecord?: InventoryStockRecord) => {
    const targetItem = prefillRecord?.item_id || (itemsCatalog[0]?.id || '');
    const targetWh = prefillRecord?.warehouse_id || (warehouses[0]?.id || '');
    const targetBin = prefillRecord?.bin_id || '';
    const targetBatch = prefillRecord?.batch_id || '';

    let currentQty = 0;
    if (prefillRecord) {
      currentQty = prefillRecord.quantity_on_hand;
    } else {
      const match = stockRecords.find(
        (r) => r.item_id === targetItem && r.warehouse_id === targetWh
      );
      currentQty = match ? match.quantity_on_hand : 0;
    }

    setAdjustmentForm({
      itemId: targetItem,
      warehouseId: targetWh,
      binId: targetBin,
      batchId: targetBatch,
      mode: 'cycle_count',
      physicalCount: currentQty,
      adjustmentDelta: 0,
      reason: 'CYCLE_COUNT_ADJUSTMENT',
      notes: 'Physical inventory audit reconciliation.'
    });
    setAdjustmentCurrentStock(currentQty);
    setIsAdjustmentModalOpen(true);
  };

  // Recalculate current stock when adjustment modal selection changes
  const handleAdjustmentItemOrLocationChange = (
    newItemId: string,
    newWhId: string,
    newBinId?: string,
    newBatchId?: string
  ) => {
    const match = stockRecords.find((r) => {
      const itemMatch = r.item_id === newItemId;
      const whMatch = r.warehouse_id === newWhId;
      const binMatch = !newBinId || r.bin_id === newBinId;
      const batchMatch = !newBatchId || r.batch_id === newBatchId;
      return itemMatch && whMatch && binMatch && batchMatch;
    });

    const current = match ? match.quantity_on_hand : 0;
    setAdjustmentCurrentStock(current);
    setAdjustmentForm((prev) => ({
      ...prev,
      itemId: newItemId,
      warehouseId: newWhId,
      binId: newBinId ?? prev.binId,
      batchId: newBatchId ?? prev.batchId,
      physicalCount: current,
      adjustmentDelta: 0
    }));
  };

  // Execute Stock Adjustment Atomic Transaction
  const handleSaveStockAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!adjustmentForm.itemId) {
      showToast('error', 'Please select a catalog item.');
      return;
    }
    if (!adjustmentForm.warehouseId) {
      showToast('error', 'Please select a warehouse facility.');
      return;
    }

    // Determine target quantity and delta
    let targetQuantity = 0;
    let delta = 0;
    if (adjustmentForm.mode === 'cycle_count') {
      targetQuantity = Math.max(0, Number(adjustmentForm.physicalCount));
      delta = targetQuantity - adjustmentCurrentStock;
    } else {
      delta = Number(adjustmentForm.adjustmentDelta);
      targetQuantity = adjustmentCurrentStock + delta;
      if (targetQuantity < 0) {
        showToast('error', 'Stock quantity cannot become negative.');
        return;
      }
    }

    if (delta === 0) {
      showToast('info', 'No stock quantity discrepancy detected. No change applied.');
      setIsAdjustmentModalOpen(false);
      return;
    }

    try {
      await dbService.transaction(async (tx: any) => {
        // 1. Check if inventory_stock row exists
        let checkSql = `SELECT id, quantity_on_hand FROM inventory_stock WHERE item_id = ? AND warehouse_id = ?`;
        const checkParams: any[] = [adjustmentForm.itemId, adjustmentForm.warehouseId];

        if (adjustmentForm.binId) {
          checkSql += ` AND bin_id = ?`;
          checkParams.push(adjustmentForm.binId);
        } else {
          checkSql += ` AND bin_id IS NULL`;
        }

        if (adjustmentForm.batchId) {
          checkSql += ` AND batch_id = ?`;
          checkParams.push(adjustmentForm.batchId);
        } else {
          checkSql += ` AND batch_id IS NULL`;
        }

        const existingStock: any[] = await tx.query(checkSql, checkParams);

        if (existingStock.length > 0) {
          await tx.execute(
            `UPDATE inventory_stock 
             SET quantity_on_hand = ?, updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
             WHERE id = ?;`,
            [targetQuantity, existingStock[0].id]
          );
        } else {
          const newStockId = `stk-${Date.now()}-${Math.random().toString(36).substring(7)}`;
          await tx.execute(
            `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, batch_id, quantity_on_hand, quantity_reserved)
             VALUES (?, ?, ?, ?, ?, ?, 0);`,
            [
              newStockId,
              adjustmentForm.itemId,
              adjustmentForm.warehouseId,
              adjustmentForm.binId || null,
              adjustmentForm.batchId || null,
              targetQuantity
            ]
          );
        }

        // 2. If batch is selected, update batch current quantity
        if (adjustmentForm.batchId) {
          await tx.execute(
            `UPDATE item_batches 
             SET current_quantity = MAX(0, current_quantity + ?), updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
             WHERE id = ?;`,
            [delta, adjustmentForm.batchId]
          );
        }

        // 3. Resolve unit cost for valuation log
        const itemRes: any[] = await tx.query(`SELECT cost_price FROM items WHERE id = ?`, [
          adjustmentForm.itemId
        ]);
        const unitCost = Number(itemRes[0]?.cost_price || 0);

        // 4. Double-Entry Immutable Ledger Write
        const auditId = `tx-adj-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        await tx.execute(
          `INSERT INTO inventory_transactions (
            id, transaction_timestamp, transaction_type, reference_type, reference_id,
            item_id, warehouse_id, bin_id, batch_id, quantity_change, unit_cost,
            running_balance_after, user_id, notes
          ) VALUES (?, (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), ?, 'ADJUSTMENT', ?, ?, ?, ?, ?, ?, ?, ?, 'system', ?);`,
          [
            auditId,
            adjustmentForm.reason,
            `ADJ-${Date.now().toString().slice(-6)}`,
            adjustmentForm.itemId,
            adjustmentForm.warehouseId,
            adjustmentForm.binId || null,
            adjustmentForm.batchId || null,
            delta,
            unitCost,
            targetQuantity,
            adjustmentForm.notes.trim() || 'Physical inventory cycle count reconciliation'
          ]
        );
      });

      showToast(
        'success',
        `Stock adjusted successfully: ${delta > 0 ? `+${delta}` : delta} units (${targetQuantity} on hand).`
      );
      setIsAdjustmentModalOpen(false);
      await loadInventoryData();
    } catch (err: any) {
      console.error('Failed to save stock adjustment:', err);
      showToast('error', `Failed to apply stock adjustment: ${err.message || String(err)}`);
    }
  };

  // --------------------------------------------------------------------------
  // Open Stock Transfer Wizard Modal
  // --------------------------------------------------------------------------
  const handleOpenTransferWizard = (prefillSourceWarehouseId?: string) => {
    const srcWh = prefillSourceWarehouseId || warehouses[0]?.id || '';
    const otherWh = warehouses.find((w) => w.id !== srcWh)?.id || '';

    const now = new Date();
    const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const randPart = Math.floor(1000 + Math.random() * 9000);
    const generatedNumber = `TR-${yyyymm}-${randPart}`;

    setTransferHeader({
      transferNumber: generatedNumber,
      sourceWarehouseId: srcWh,
      destWarehouseId: otherWh,
      requestedBy: 'Warehouse Operations Dispatcher',
      notes: 'Replenishment stock transfer between regional distribution centers.'
    });

    setTransferLines([]);
    setTransferDraftLine({
      itemId: itemsCatalog[0]?.id || '',
      sourceBinId: '',
      destBinId: '',
      batchId: '',
      transferQuantity: 1
    });

    setIsTransferWizardOpen(true);
  };

  // Add line to Transfer draft
  const handleAddTransferLine = () => {
    if (!transferDraftLine.itemId) {
      showToast('error', 'Please choose an item to transfer.');
      return;
    }
    if (transferDraftLine.transferQuantity <= 0) {
      showToast('error', 'Transfer quantity must be greater than zero.');
      return;
    }

    const item = itemsCatalog.find((i) => i.id === transferDraftLine.itemId);
    if (!item) return;

    // Available in source warehouse / bin
    const matchingStock = stockRecords.find(
      (r) =>
        r.item_id === transferDraftLine.itemId &&
        r.warehouse_id === transferHeader.sourceWarehouseId &&
        (!transferDraftLine.sourceBinId || r.bin_id === transferDraftLine.sourceBinId) &&
        (!transferDraftLine.batchId || r.batch_id === transferDraftLine.batchId)
    );

    const available = matchingStock ? matchingStock.quantity_available : 0;
    if (transferDraftLine.transferQuantity > available) {
      showToast(
        'error',
        `Insufficient available quantity. Only ${available} units available in source location.`
      );
      return;
    }

    const newLine: TransferWizardItem = {
      itemId: item.id,
      sku: item.sku,
      name: item.name,
      sourceBinId: transferDraftLine.sourceBinId,
      destBinId: transferDraftLine.destBinId,
      batchId: transferDraftLine.batchId,
      batchNumber: matchingStock?.batch_number,
      availableQuantity: available,
      transferQuantity: Number(transferDraftLine.transferQuantity)
    };

    setTransferLines((prev) => [...prev, newLine]);
    setTransferDraftLine((prev) => ({
      ...prev,
      transferQuantity: 1
    }));
  };

  const handleRemoveTransferLine = (index: number) => {
    setTransferLines((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Submit Stock Transfer to Database
  const handleSubmitStockTransfer = async () => {
    if (transferLines.length === 0) {
      showToast('error', 'Please add at least one line item to the transfer.');
      return;
    }
    if (transferHeader.sourceWarehouseId === transferHeader.destWarehouseId) {
      showToast('error', 'Source and destination warehouses cannot be the same facility.');
      return;
    }

    try {
      const transferId = `tr-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      await dbService.transaction(async (tx: any) => {
        // 1. Insert header in requested state
        await tx.execute(
          `INSERT INTO stock_transfers (
            id, transfer_number, source_warehouse_id, dest_warehouse_id, status, requested_by, notes
          ) VALUES (?, ?, ?, ?, 'requested', ?, ?);`,
          [
            transferId,
            transferHeader.transferNumber.trim().toUpperCase(),
            transferHeader.sourceWarehouseId,
            transferHeader.destWarehouseId,
            transferHeader.requestedBy.trim(),
            transferHeader.notes.trim() || null
          ]
        );

        // 2. Insert line items
        for (const line of transferLines) {
          const lineId = `tri-${Date.now()}-${Math.random().toString(36).substring(7)}`;
          await tx.execute(
            `INSERT INTO stock_transfer_items (
              id, transfer_id, item_id, batch_id, source_bin_id, dest_bin_id, quantity_requested, quantity_shipped, quantity_received
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0);`,
            [
              lineId,
              transferId,
              line.itemId,
              line.batchId || null,
              line.sourceBinId || null,
              line.destBinId || null,
              line.transferQuantity
            ]
          );
        }
      });

      showToast(
        'success',
        `Stock transfer request ${transferHeader.transferNumber} created successfully. Ready for dispatch approval.`
      );
      setIsTransferWizardOpen(false);
      await loadInventoryData();
    } catch (err: any) {
      console.error('Failed to submit transfer:', err);
      showToast('error', `Failed to create stock transfer: ${err.message || String(err)}`);
    }
  };

  // --------------------------------------------------------------------------
  // Batch Detail Drawer
  // --------------------------------------------------------------------------
  const handleOpenBatchDetail = async (record: InventoryStockRecord) => {
    try {
      const history = await dbService.query<any>(
        `SELECT id, transaction_timestamp, transaction_type, quantity_change, running_balance_after, user_id, notes
         FROM inventory_transactions 
         WHERE item_id = ? AND warehouse_id = ? AND (batch_id = ? OR (batch_id IS NULL AND ? IS NULL))
         ORDER BY transaction_timestamp DESC
         LIMIT 10;`,
        [record.item_id, record.warehouse_id, record.batch_id || null, record.batch_id || null]
      );
      setSelectedBatchDetail({ record, history });
    } catch (err) {
      console.warn('Failed to load batch transaction history:', err);
      setSelectedBatchDetail({ record, history: [] });
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* 1. Header Banner & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-main)] flex items-center gap-2.5">
            <Boxes className="text-[var(--accent-primary)]" size={26} />
            Multi-Warehouse Inventory & Real-Time Stock
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Monitor real-time bin/batch balances, track WAC/FIFO asset valuations, and initiate stock adjustments & transfers.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {onNavigateToWarehouses && (
            <button
              onClick={onNavigateToWarehouses}
              className="btn btn-secondary text-xs"
              title="Navigate to Warehouses & In-Transit Transfers"
            >
              <Building2 size={14} className="text-[var(--accent-primary)]" />
              <span>Warehouses & Bins</span>
            </button>
          )}

          <button
            onClick={() => handleOpenTransferWizard()}
            className="btn btn-secondary text-xs"
            title="Create inter-warehouse stock transfer wizard"
          >
            <ArrowRightLeft size={14} className="text-[var(--cyan)]" />
            <span>Transfer Wizard</span>
          </button>

          <button
            onClick={() => handleOpenAdjustmentModal()}
            className="btn btn-primary text-xs"
            title="Perform physical cycle count or stock write-off"
          >
            <Sliders size={14} />
            <span>Stock Adjustment</span>
          </button>

          <button
            onClick={loadInventoryData}
            disabled={isLoading}
            className="p-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] text-[var(--text-dim)] hover:text-[var(--text-main)] transition-colors"
            title="Refresh inventory from SQLite"
          >
            <RefreshCw size={15} className={isLoading ? 'animate-spin text-[var(--accent-primary)]' : ''} />
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
            {notification.type === 'error' && <AlertTriangle size={16} />}
            {notification.type === 'info' && <Info size={16} />}
            <span className="font-semibold">{notification.text}</span>
          </div>
          <button onClick={() => setNotification(null)} className="opacity-75 hover:opacity-100">
            <X size={14} />
          </button>
        </div>
      )}

      {/* 2. KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Stock Units */}
        <div className="erp-card p-4 hover-lift">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-dim)] uppercase">
              Total Stock Units
            </span>
            <div className="p-2 rounded-lg bg-[var(--accent-glow)] text-[var(--accent-primary)]">
              <Package size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-[var(--text-main)]">
              {summaryKPIs.totalStockUnits.toLocaleString()}
            </div>
            <div className="text-xs text-[var(--text-muted)] mt-1 flex items-center gap-1.5">
              <span>Across all operational DCs & bins</span>
            </div>
          </div>
        </div>

        {/* Active SKUs */}
        <div className="erp-card p-4 hover-lift">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-dim)] uppercase">
              Active Catalog SKUs
            </span>
            <div className="p-2 rounded-lg bg-[var(--cyan-bg)] text-[var(--cyan)]">
              <Layers size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-[var(--text-main)]">
              {summaryKPIs.activeSkusCount}
            </div>
            <div className="text-xs text-[var(--text-muted)] mt-1">
              Active products currently in stock
            </div>
          </div>
        </div>

        {/* Total Inventory Asset Valuation */}
        <div className="erp-card p-4 hover-lift">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-dim)] uppercase">
              Inventory Valuation
            </span>
            <div className="p-2 rounded-lg bg-[var(--emerald-bg)] text-[var(--emerald)]">
              <DollarSign size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-[var(--emerald)]">
              ${summaryKPIs.totalAssetValuation.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-[var(--text-muted)] mt-1">
              WAC & FIFO asset capitalization
            </div>
          </div>
        </div>

        {/* Low Stock & FEFO Alerts */}
        <div className="erp-card p-4 hover-lift">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-dim)] uppercase">
              Stock Warnings
            </span>
            <div className="p-2 rounded-lg bg-[var(--amber-bg)] text-[var(--amber)]">
              <AlertTriangle size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-[var(--amber)] flex items-center gap-2">
              <span>{summaryKPIs.lowStockAlertsCount}</span>
              {summaryKPIs.expiringSoonBatchesCount > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--ruby-bg)] text-[var(--ruby)] font-sans font-semibold">
                  {summaryKPIs.expiringSoonBatchesCount} Expiring
                </span>
              )}
            </div>
            <div className="text-xs text-[var(--text-muted)] mt-1">
              SKUs below reorder threshold
            </div>
          </div>
        </div>
      </div>

      {/* 3. Search & Comprehensive Filter Controls */}
      <div className="erp-card p-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Search Field */}
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-dim)]" />
            <input
              type="text"
              placeholder="Search by SKU, Product Name, Barcode, Batch Lot, or Bin Code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field pl-9 pr-8 text-xs"
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

          {/* Filter Dropdowns */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Warehouse Filter */}
            <div className="flex items-center gap-1 border border-[var(--border-color)] rounded-lg px-2.5 py-1 bg-[var(--bg-primary)]">
              <Building2 size={13} className="text-[var(--text-dim)]" />
              <select
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                className="bg-transparent text-xs text-[var(--text-main)] border-none outline-none cursor-pointer"
              >
                <option value="all">All Warehouses ({warehouses.length})</option>
                {warehouses.map((wh) => (
                  <option key={wh.id} value={wh.id}>
                    {wh.warehouse_code} — {wh.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Category Filter */}
            <div className="flex items-center gap-1 border border-[var(--border-color)] rounded-lg px-2.5 py-1 bg-[var(--bg-primary)]">
              <Filter size={13} className="text-[var(--text-dim)]" />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-transparent text-xs text-[var(--text-main)] border-none outline-none cursor-pointer"
              >
                <option value="all">All Categories</option>
                {availableCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Stock Level Filter */}
            <div className="flex items-center gap-1 border border-[var(--border-color)] rounded-lg px-2.5 py-1 bg-[var(--bg-primary)]">
              <span className="text-[11px] text-[var(--text-dim)] font-medium">Status:</span>
              <select
                value={selectedStockStatus}
                onChange={(e) => setSelectedStockStatus(e.target.value as any)}
                className="bg-transparent text-xs text-[var(--text-main)] border-none outline-none cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="in_stock">In Stock Only</option>
                <option value="low_stock">⚠️ Low Stock Alerts</option>
                <option value="expiring_soon">⏳ Expiring Soon (FEFO)</option>
                <option value="out_of_stock">Out of Stock (0)</option>
              </select>
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-1 border border-[var(--border-color)] rounded-lg px-2.5 py-1 bg-[var(--bg-primary)]">
              <ArrowUpDown size={13} className="text-[var(--text-dim)]" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-transparent text-xs text-[var(--text-main)] border-none outline-none cursor-pointer"
              >
                <option value="sku">SKU Code</option>
                <option value="name">Product Name</option>
                <option value="quantity">Stock On Hand</option>
                <option value="value">Asset Valuation</option>
                <option value="expiry">Expiry Date</option>
              </select>
              <button
                onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                className="text-[var(--text-dim)] hover:text-[var(--text-main)] px-1 font-bold text-xs"
                title={`Order: ${sortOrder === 'asc' ? 'Ascending' : 'Descending'}`}
              >
                {sortOrder === 'asc' ? '↑' : '↓'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 4. High-Density Interactive Stock Matrix Table */}
      <div className="erp-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr>
                <th>SKU & Item Details</th>
                <th>Category</th>
                <th>Warehouse & Bin</th>
                <th>Batch / Lot</th>
                <th>Expiry (FEFO)</th>
                <th className="text-right">On Hand</th>
                <th className="text-right">Reserved</th>
                <th className="text-right">Available</th>
                <th>Method</th>
                <th className="text-right">Unit Cost</th>
                <th className="text-right">Total Asset Value</th>
                <th className="text-center">Stock State</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={13} className="text-center py-16 text-[var(--text-dim)]">
                    <RefreshCw size={26} className="animate-spin mx-auto mb-2 text-[var(--accent-primary)]" />
                    <span className="text-sm font-medium">Querying multi-warehouse stock balances from SQLite...</span>
                  </td>
                </tr>
              ) : filteredStock.length === 0 ? (
                <tr>
                  <td colSpan={13} className="text-center py-16 text-[var(--text-dim)]">
                    <Boxes size={36} className="mx-auto mb-2 opacity-40" />
                    <p className="text-sm font-semibold text-[var(--text-main)]">
                      No inventory records match the applied criteria.
                    </p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                      Clear filter selections or add a stock adjustment.
                    </p>
                    {(searchQuery || selectedWarehouseId !== 'all' || selectedCategory !== 'all' || selectedStockStatus !== 'all') && (
                      <button
                        onClick={() => {
                          setSearchQuery('');
                          setSelectedWarehouseId('all');
                          setSelectedCategory('all');
                          setSelectedStockStatus('all');
                          setSelectedValuationMethod('all');
                        }}
                        className="btn btn-secondary text-xs mt-3"
                      >
                        Reset All Filters
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredStock.map((rec) => {
                  const isLowStock = rec.quantity_on_hand <= rec.min_stock_alert;
                  const isCritical = rec.quantity_on_hand <= rec.safety_stock;

                  let expiryBadge = null;
                  if (rec.expiry_date) {
                    const nowMs = Date.now();
                    const expMs = new Date(rec.expiry_date).getTime();
                    const diffDays = Math.ceil((expMs - nowMs) / (1000 * 60 * 60 * 24));

                    if (diffDays <= 0) {
                      expiryBadge = (
                        <span className="badge badge-danger text-[10px]" title="Expired batch">
                          Expired ({rec.expiry_date})
                        </span>
                      );
                    } else if (diffDays <= 90) {
                      expiryBadge = (
                        <span className="badge badge-warning text-[10px]" title="Expiring within 90 days">
                          Expiring in {diffDays}d
                        </span>
                      );
                    } else {
                      expiryBadge = (
                        <span className="text-xs text-[var(--text-dim)] font-mono">
                          {rec.expiry_date}
                        </span>
                      );
                    }
                  }

                  return (
                    <tr key={rec.stock_id} className="group">
                      {/* SKU & Item Details */}
                      <td>
                        <div className="flex flex-col">
                          <span className="chip-mono font-bold text-[var(--accent-primary)] inline-block w-fit">
                            {rec.sku}
                          </span>
                          <span className="font-semibold text-xs text-[var(--text-main)] mt-1 group-hover:text-[var(--accent-primary)] transition-colors">
                            {rec.item_name}
                          </span>
                          {rec.barcode && (
                            <span className="text-[10px] text-[var(--text-dim)] font-mono">
                              Barcode: {rec.barcode}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Category */}
                      <td>
                        <span className="text-xs font-medium text-[var(--text-muted)]">
                          {rec.category}
                        </span>
                        <div className="text-[10px] text-[var(--text-dim)]">
                          Unit: {rec.unit_of_measure}
                        </div>
                      </td>

                      {/* Warehouse & Bin Location */}
                      <td>
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-[var(--text-main)] flex items-center gap-1">
                            <Building2 size={11} className="text-[var(--accent-primary)]" />
                            {rec.warehouse_name}
                          </span>
                          <span className="text-[11px] font-mono text-[var(--text-dim)] mt-0.5">
                            Bin: {rec.bin_code || 'UNASSIGNED'}
                          </span>
                        </div>
                      </td>

                      {/* Batch / Lot */}
                      <td>
                        <button
                          onClick={() => handleOpenBatchDetail(rec)}
                          className="chip-mono hover:border-[var(--accent-primary)] text-left cursor-pointer transition-colors"
                          title="Click to view batch audit history"
                        >
                          <span className="text-[11px]">{rec.batch_number || 'DEFAULT-LOT'}</span>
                        </button>
                      </td>

                      {/* Expiry Date (FEFO) */}
                      <td>
                        {expiryBadge || <span className="text-xs text-[var(--text-dim)]">N/A</span>}
                      </td>

                      {/* Quantity On Hand */}
                      <td className="text-right font-mono font-bold text-xs text-[var(--text-main)]">
                        {rec.quantity_on_hand.toLocaleString()}
                      </td>

                      {/* Quantity Reserved */}
                      <td className="text-right font-mono text-xs text-[var(--amber)]">
                        {rec.quantity_reserved > 0 ? rec.quantity_reserved.toLocaleString() : '—'}
                      </td>

                      {/* Quantity Available */}
                      <td className="text-right font-mono font-bold text-xs text-[var(--emerald)]">
                        {rec.quantity_available.toLocaleString()}
                      </td>

                      {/* Valuation Method */}
                      <td>
                        <span className="badge text-[10px] border-[var(--border-color)] bg-[var(--bg-tertiary)] text-[var(--text-muted)]">
                          {rec.valuation_method === 'FIFO' ? 'FIFO' : 'WAC'}
                        </span>
                      </td>

                      {/* Unit Cost */}
                      <td className="text-right font-mono text-xs text-[var(--text-muted)]">
                        ${rec.unit_cost.toFixed(2)}
                      </td>

                      {/* Total Value */}
                      <td className="text-right font-mono font-bold text-xs text-[var(--text-main)]">
                        ${rec.total_value.toFixed(2)}
                      </td>

                      {/* Stock State Alert Badge */}
                      <td className="text-center">
                        {isCritical ? (
                          <span className="badge badge-danger text-[10px]">
                            Critical (&le; {rec.safety_stock})
                          </span>
                        ) : isLowStock ? (
                          <span className="badge badge-warning text-[10px]">
                            Low (&le; {rec.min_stock_alert})
                          </span>
                        ) : (
                          <span className="badge badge-success text-[10px]">
                            Healthy
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenAdjustmentModal(rec)}
                            className="p-1.5 rounded-md hover:bg-[var(--bg-hover)] text-[var(--text-dim)] hover:text-[var(--accent-primary)] transition-colors"
                            title="Adjust Stock Quantity"
                          >
                            <Sliders size={14} />
                          </button>
                          <button
                            onClick={() => handleOpenBatchDetail(rec)}
                            className="p-1.5 rounded-md hover:bg-[var(--bg-hover)] text-[var(--text-dim)] hover:text-[var(--cyan)] transition-colors"
                            title="Inspect Movement History"
                          >
                            <Eye size={14} />
                          </button>
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

      {/* ---------------------------------------------------------------------- */}
      {/* 5. Stock Adjustment Modal                                              */}
      {/* ---------------------------------------------------------------------- */}
      {isAdjustmentModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="erp-card w-full max-w-xl bg-[var(--bg-secondary)] border border-[var(--border-color)] shadow-2xl rounded-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] bg-[var(--bg-primary)]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-[var(--accent-glow)] text-[var(--accent-primary)]">
                  <Sliders size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[var(--text-main)]">
                    Stock Reconciliation & Cycle Count Adjustment
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    Directly reconcile physical count or register inventory write-offs into the double-entry ledger.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAdjustmentModalOpen(false)}
                className="p-1 rounded-md text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveStockAdjustment} className="p-6 space-y-4">
              {/* Item selection */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                  Product / SKU *
                </label>
                <select
                  value={adjustmentForm.itemId}
                  onChange={(e) =>
                    handleAdjustmentItemOrLocationChange(
                      e.target.value,
                      adjustmentForm.warehouseId,
                      adjustmentForm.binId,
                      adjustmentForm.batchId
                    )
                  }
                  className="input-field text-xs"
                  required
                >
                  <option value="">Select Catalog Item...</option>
                  {itemsCatalog.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.sku} — {it.name} ({it.category})
                    </option>
                  ))}
                </select>
              </div>

              {/* Warehouse & Bin selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    Warehouse Facility *
                  </label>
                  <select
                    value={adjustmentForm.warehouseId}
                    onChange={(e) =>
                      handleAdjustmentItemOrLocationChange(
                        adjustmentForm.itemId,
                        e.target.value,
                        adjustmentForm.binId,
                        adjustmentForm.batchId
                      )
                    }
                    className="input-field text-xs"
                    required
                  >
                    <option value="">Select Warehouse...</option>
                    {warehouses.map((wh) => (
                      <option key={wh.id} value={wh.id}>
                        {wh.warehouse_code} — {wh.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    Bin Location (Optional)
                  </label>
                  <select
                    value={adjustmentForm.binId}
                    onChange={(e) =>
                      handleAdjustmentItemOrLocationChange(
                        adjustmentForm.itemId,
                        adjustmentForm.warehouseId,
                        e.target.value,
                        adjustmentForm.batchId
                      )
                    }
                    className="input-field text-xs"
                  >
                    <option value="">Unassigned / Primary Floor</option>
                    {warehouseLocations
                      .filter((l) => l.warehouse_id === adjustmentForm.warehouseId)
                      .map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.bin_code} ({loc.zone})
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Batch selection */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                  Batch / Lot (Optional)
                </label>
                <select
                  value={adjustmentForm.batchId}
                  onChange={(e) =>
                    handleAdjustmentItemOrLocationChange(
                      adjustmentForm.itemId,
                      adjustmentForm.warehouseId,
                      adjustmentForm.binId,
                      e.target.value
                    )
                  }
                  className="input-field text-xs"
                >
                  <option value="">Default General Lot</option>
                  {batches
                    .filter((b) => b.item_id === adjustmentForm.itemId)
                    .map((batch) => (
                      <option key={batch.id} value={batch.id}>
                        {batch.batch_number} (Exp: {batch.expiry_date || 'None'}) — Current: {batch.current_quantity}
                      </option>
                    ))}
                </select>
              </div>

              {/* Current Recorded Stock Indicator */}
              <div className="p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)] flex items-center justify-between text-xs">
                <span className="text-[var(--text-muted)] font-medium">Currently Recorded Balance:</span>
                <span className="font-mono font-bold text-sm text-[var(--text-main)]">
                  {adjustmentCurrentStock} units
                </span>
              </div>

              {/* Adjustment Mode Switcher */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-[var(--text-main)]">
                  Adjustment Method
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjustmentForm((prev) => ({ ...prev, mode: 'cycle_count' }))}
                    className={`py-2 px-3 text-xs font-semibold rounded-lg border text-center transition-all ${
                      adjustmentForm.mode === 'cycle_count'
                        ? 'bg-[var(--accent-glow)] border-[var(--accent-primary)] text-[var(--accent-primary)]'
                        : 'border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-dim)]'
                    }`}
                  >
                    Physical Cycle Count
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustmentForm((prev) => ({ ...prev, mode: 'direct_delta' }))}
                    className={`py-2 px-3 text-xs font-semibold rounded-lg border text-center transition-all ${
                      adjustmentForm.mode === 'direct_delta'
                        ? 'bg-[var(--accent-glow)] border-[var(--accent-primary)] text-[var(--accent-primary)]'
                        : 'border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-dim)]'
                    }`}
                  >
                    Direct Variance (+/- Delta)
                  </button>
                </div>
              </div>

              {/* Count / Variance Inputs */}
              {adjustmentForm.mode === 'cycle_count' ? (
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    Actual Physical Count *
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={adjustmentForm.physicalCount}
                    onChange={(e) =>
                      setAdjustmentForm((prev) => ({
                        ...prev,
                        physicalCount: parseInt(e.target.value, 10) || 0
                      }))
                    }
                    className="input-field text-xs font-mono font-bold text-sm"
                    required
                  />
                  <div className="text-[11px] text-[var(--text-dim)] mt-1 flex items-center justify-between">
                    <span>Discrepancy:</span>
                    <span
                      className={`font-mono font-bold ${
                        adjustmentForm.physicalCount - adjustmentCurrentStock >= 0
                          ? 'text-[var(--emerald)]'
                          : 'text-[var(--ruby)]'
                      }`}
                    >
                      {adjustmentForm.physicalCount - adjustmentCurrentStock >= 0
                        ? `+${adjustmentForm.physicalCount - adjustmentCurrentStock}`
                        : adjustmentForm.physicalCount - adjustmentCurrentStock}{' '}
                      units
                    </span>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    Delta Adjustment Quantity (+/-) *
                  </label>
                  <input
                    type="number"
                    value={adjustmentForm.adjustmentDelta}
                    onChange={(e) =>
                      setAdjustmentForm((prev) => ({
                        ...prev,
                        adjustmentDelta: parseInt(e.target.value, 10) || 0
                      }))
                    }
                    className="input-field text-xs font-mono font-bold text-sm"
                    required
                  />
                  <div className="text-[11px] text-[var(--text-dim)] mt-1 flex items-center justify-between">
                    <span>Resulting Stock:</span>
                    <span className="font-mono font-bold text-[var(--text-main)]">
                      {adjustmentCurrentStock + adjustmentForm.adjustmentDelta} units
                    </span>
                  </div>
                </div>
              )}

              {/* Adjustment Reason & Audit Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    Ledger Reason Code *
                  </label>
                  <select
                    value={adjustmentForm.reason}
                    onChange={(e) =>
                      setAdjustmentForm((prev) => ({
                        ...prev,
                        reason: e.target.value as any
                      }))
                    }
                    className="input-field text-xs"
                  >
                    <option value="CYCLE_COUNT_ADJUSTMENT">Physical Cycle Count</option>
                    <option value="ADJUSTMENT_WRITE_OFF">Damaged / Loss Write-Off</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    Audit Explanation Notes
                  </label>
                  <input
                    type="text"
                    value={adjustmentForm.notes}
                    onChange={(e) =>
                      setAdjustmentForm((prev) => ({ ...prev, notes: e.target.value }))
                    }
                    placeholder="e.g. Broken packaging write-off..."
                    className="input-field text-xs"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--border-color)]">
                <button
                  type="button"
                  onClick={() => setIsAdjustmentModalOpen(false)}
                  className="btn btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary text-xs">
                  <Check size={14} />
                  <span>Apply Reconciliation</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* 6. Stock Transfer Wizard Modal                                         */}
      {/* ---------------------------------------------------------------------- */}
      {isTransferWizardOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="erp-card w-full max-w-3xl bg-[var(--bg-secondary)] border border-[var(--border-color)] shadow-2xl rounded-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] bg-[var(--bg-primary)]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-[var(--cyan-bg)] text-[var(--cyan)]">
                  <ArrowRightLeft size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[var(--text-main)]">
                    Inter-Warehouse Stock Transfer Wizard
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    Initiate an atomic stock transfer with in-transit isolation between distribution facilities.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsTransferWizardOpen(false)}
                className="p-1 rounded-md text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Row 1: Transfer Number & Operators */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    Transfer Reference #
                  </label>
                  <input
                    type="text"
                    value={transferHeader.transferNumber}
                    onChange={(e) =>
                      setTransferHeader((prev) => ({ ...prev, transferNumber: e.target.value }))
                    }
                    className="input-field text-xs font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    Origin / Source Warehouse *
                  </label>
                  <select
                    value={transferHeader.sourceWarehouseId}
                    onChange={(e) =>
                      setTransferHeader((prev) => ({ ...prev, sourceWarehouseId: e.target.value }))
                    }
                    className="input-field text-xs"
                  >
                    {warehouses.map((wh) => (
                      <option key={wh.id} value={wh.id}>
                        {wh.warehouse_code} — {wh.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    Target / Destination Warehouse *
                  </label>
                  <select
                    value={transferHeader.destWarehouseId}
                    onChange={(e) =>
                      setTransferHeader((prev) => ({ ...prev, destWarehouseId: e.target.value }))
                    }
                    className="input-field text-xs"
                  >
                    {warehouses.map((wh) => (
                      <option key={wh.id} value={wh.id} disabled={wh.id === transferHeader.sourceWarehouseId}>
                        {wh.warehouse_code} — {wh.name} {wh.id === transferHeader.sourceWarehouseId ? '(Source)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 2: Requested By & Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    Requested By
                  </label>
                  <input
                    type="text"
                    value={transferHeader.requestedBy}
                    onChange={(e) =>
                      setTransferHeader((prev) => ({ ...prev, requestedBy: e.target.value }))
                    }
                    className="input-field text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    Transfer Purpose / Notes
                  </label>
                  <input
                    type="text"
                    value={transferHeader.notes}
                    onChange={(e) =>
                      setTransferHeader((prev) => ({ ...prev, notes: e.target.value }))
                    }
                    className="input-field text-xs"
                  />
                </div>
              </div>

              {/* Line Items Picker Builder */}
              <div className="border border-[var(--border-color)] rounded-lg p-4 bg-[var(--bg-primary)] space-y-3">
                <h4 className="text-xs font-bold text-[var(--text-main)] flex items-center gap-1.5 uppercase tracking-wide">
                  <Plus size={14} className="text-[var(--accent-primary)]" />
                  Add Item To Transfer
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                  {/* Item select */}
                  <div className="sm:col-span-5">
                    <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                      SKU / Product
                    </label>
                    <select
                      value={transferDraftLine.itemId}
                      onChange={(e) =>
                        setTransferDraftLine((prev) => ({ ...prev, itemId: e.target.value }))
                      }
                      className="input-field text-xs"
                    >
                      {itemsCatalog.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.sku} — {i.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Source Bin */}
                  <div className="sm:col-span-3">
                    <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                      Source Bin
                    </label>
                    <select
                      value={transferDraftLine.sourceBinId}
                      onChange={(e) =>
                        setTransferDraftLine((prev) => ({ ...prev, sourceBinId: e.target.value }))
                      }
                      className="input-field text-xs"
                    >
                      <option value="">Auto-Assign / Default</option>
                      {warehouseLocations
                        .filter((l) => l.warehouse_id === transferHeader.sourceWarehouseId)
                        .map((loc) => (
                          <option key={loc.id} value={loc.id}>
                            {loc.bin_code}
                          </option>
                        ))}
                    </select>
                  </div>

                  {/* Quantity */}
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                      Transfer Qty
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={transferDraftLine.transferQuantity}
                      onChange={(e) =>
                        setTransferDraftLine((prev) => ({
                          ...prev,
                          transferQuantity: parseInt(e.target.value, 10) || 1
                        }))
                      }
                      className="input-field text-xs font-mono"
                    />
                  </div>

                  {/* Add button */}
                  <div className="sm:col-span-2">
                    <button
                      type="button"
                      onClick={handleAddTransferLine}
                      className="btn btn-secondary w-full text-xs"
                    >
                      <Plus size={14} />
                      <span>Add Item</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Transfer Line Items Table */}
              <div className="border border-[var(--border-color)] rounded-lg overflow-hidden">
                <table className="erp-table">
                  <thead>
                    <tr>
                      <th>SKU & Name</th>
                      <th>Source Bin</th>
                      <th className="text-right">Available</th>
                      <th className="text-right">Transfer Quantity</th>
                      <th className="text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transferLines.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-6 text-xs text-[var(--text-dim)]">
                          No items added yet. Select an item above and click "Add Item".
                        </td>
                      </tr>
                    ) : (
                      transferLines.map((line, idx) => (
                        <tr key={idx}>
                          <td>
                            <div className="font-mono text-xs font-bold text-[var(--accent-primary)]">
                              {line.sku}
                            </div>
                            <div className="text-[11px] text-[var(--text-main)]">{line.name}</div>
                          </td>
                          <td>
                            <span className="chip-mono text-[11px]">
                              {warehouseLocations.find((l) => l.id === line.sourceBinId)?.bin_code ||
                                'Unassigned'}
                            </span>
                          </td>
                          <td className="text-right font-mono text-xs text-[var(--text-dim)]">
                            {line.availableQuantity}
                          </td>
                          <td className="text-right font-mono font-bold text-xs text-[var(--text-main)]">
                            {line.transferQuantity}
                          </td>
                          <td className="text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveTransferLine(idx)}
                              className="p-1 rounded text-[var(--ruby)] hover:bg-[var(--ruby-bg)]"
                              title="Remove item"
                            >
                              <X size={14} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Footer Buttons */}
              <div className="flex items-center justify-between pt-3 border-t border-[var(--border-color)]">
                <div className="text-xs text-[var(--text-dim)]">
                  Total Items: <span className="font-bold text-[var(--text-main)]">{transferLines.length}</span> | Total Units:{' '}
                  <span className="font-bold text-[var(--text-main)]">
                    {transferLines.reduce((acc, curr) => acc + curr.transferQuantity, 0)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsTransferWizardOpen(false)}
                    className="btn btn-secondary text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmitStockTransfer}
                    disabled={transferLines.length === 0}
                    className="btn btn-primary text-xs"
                  >
                    <Check size={14} />
                    <span>Issue Stock Transfer</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* 7. Batch Audit Details Drawer / Modal                                  */}
      {/* ---------------------------------------------------------------------- */}
      {selectedBatchDetail && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="erp-card w-full max-w-2xl bg-[var(--bg-secondary)] border border-[var(--border-color)] shadow-2xl rounded-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] bg-[var(--bg-primary)]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-[var(--accent-glow)] text-[var(--accent-primary)]">
                  <Package size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[var(--text-main)]">
                    Batch / Lot Inspector: {selectedBatchDetail.record.batch_number}
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    Lot origin, shelf-life expiry schedule, and recent double-entry ledger transactions.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedBatchDetail(null)}
                className="p-1 rounded-md text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Batch Overview Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-color)] text-xs">
                <div>
                  <span className="text-[var(--text-dim)] block text-[11px]">Product SKU</span>
                  <span className="font-mono font-bold text-[var(--accent-primary)]">
                    {selectedBatchDetail.record.sku}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--text-dim)] block text-[11px]">Warehouse</span>
                  <span className="font-semibold text-[var(--text-main)]">
                    {selectedBatchDetail.record.warehouse_name}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--text-dim)] block text-[11px]">Unit Cost</span>
                  <span className="font-mono font-semibold text-[var(--emerald)]">
                    ${selectedBatchDetail.record.unit_cost.toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--text-dim)] block text-[11px]">Stock Balance</span>
                  <span className="font-mono font-bold text-[var(--text-main)]">
                    {selectedBatchDetail.record.quantity_on_hand} units
                  </span>
                </div>
              </div>

              {/* Manufacturing & Expiry Schedule */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)]">
                  <span className="text-[var(--text-dim)] block text-[11px] mb-1">Manufacture Date</span>
                  <span className="font-mono text-[var(--text-main)]">
                    {selectedBatchDetail.record.manufacture_date || 'Not registered'}
                  </span>
                </div>
                <div className="p-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)]">
                  <span className="text-[var(--text-dim)] block text-[11px] mb-1">Expiry Date (FEFO)</span>
                  <span className="font-mono font-semibold text-[var(--text-main)]">
                    {selectedBatchDetail.record.expiry_date || 'No expiration date'}
                  </span>
                </div>
              </div>

              {/* Recent Audit Movements Table */}
              <div>
                <h4 className="text-xs font-bold text-[var(--text-main)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <FileText size={14} className="text-[var(--accent-primary)]" />
                  Recent Double-Entry Movements
                </h4>
                <div className="border border-[var(--border-color)] rounded-lg overflow-hidden">
                  <table className="erp-table text-xs">
                    <thead>
                      <tr>
                        <th>Timestamp</th>
                        <th>Type</th>
                        <th className="text-right">Change</th>
                        <th className="text-right">Balance After</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedBatchDetail.history.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="text-center py-6 text-xs text-[var(--text-dim)]">
                            No transaction ledger records recorded for this batch location yet.
                          </td>
                        </tr>
                      ) : (
                        selectedBatchDetail.history.map((tx) => (
                          <tr key={tx.id}>
                            <td className="font-mono text-[11px] text-[var(--text-dim)]">
                              {new Date(tx.transaction_timestamp).toLocaleString()}
                            </td>
                            <td>
                              <span className="badge text-[10px] border-[var(--border-color)] bg-[var(--bg-tertiary)] font-mono">
                                {tx.transaction_type}
                              </span>
                            </td>
                            <td
                              className={`text-right font-mono font-bold ${
                                tx.quantity_change >= 0 ? 'text-[var(--emerald)]' : 'text-[var(--ruby)]'
                              }`}
                            >
                              {tx.quantity_change >= 0 ? `+${tx.quantity_change}` : tx.quantity_change}
                            </td>
                            <td className="text-right font-mono font-bold text-[var(--text-main)]">
                              {tx.running_balance_after}
                            </td>
                            <td className="text-[11px] text-[var(--text-muted)] truncate max-w-[150px]">
                              {tx.notes || '—'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setSelectedBatchDetail(null)}
                  className="btn btn-secondary text-xs"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventoryView;
