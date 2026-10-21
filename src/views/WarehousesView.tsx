// ============================================================================
// PROBAHO ERP: WAREHOUSES, BINS & INTER-WAREHOUSE TRANSFERS VIEW
// Proposed File: src/views/WarehousesView.tsx (Milestone 3)
// Facility Management, Bin Visualizer, In-Transit Isolation & Reconciliation
// High-Contrast Theme Compliant, Offline-First SQLite Powered
// ============================================================================

import React, { useState, useEffect, useMemo } from 'react';
import {
  Building2,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Truck,
  ArrowRight,
  Boxes,
  MapPin,
  Phone,
  User,
  Edit2,
  Trash2,
  Eye,
  RefreshCw,
  X,
  AlertTriangle,
  Clock,
  Layers,
  ArrowRightLeft,
  Check,
  Package,
  Calendar,
  FileText,
  ShieldCheck,
  Sliders,
  Printer
} from 'lucide-react';
import { PrintVoucherModal, type VoucherType } from '../components/PrintVoucherModal';
import { dbService } from '../services/db';
import type {
  Warehouse,
  WarehouseLocation,
  StockTransfer,
  StockTransferItem,
  TransferStatus,
  Item
} from '../types/erp';

export interface ExtendedWarehouse {
  id: string;
  warehouse_code: string;
  name: string;
  address: string;
  city: string;
  district?: string;
  contact_person?: string;
  contact_phone?: string;
  is_default: number;
  is_active: number;
  created_at: string;
  updated_at: string;
  bins_count?: number;
  total_skus_count?: number;
  total_units_stored?: number;
  total_valuation?: number;
}

export interface ExtendedTransfer {
  id: string;
  transfer_number: string;
  source_warehouse_id: string;
  dest_warehouse_id: string;
  status: TransferStatus;
  requested_by: string;
  approved_by?: string;
  carrier_name?: string;
  tracking_number?: string;
  shipped_date?: string;
  received_date?: string;
  notes?: string;
  receiving_notes?: string;
  created_at: string;
  updated_at: string;
  source_warehouse_name?: string;
  source_warehouse_code?: string;
  dest_warehouse_name?: string;
  dest_warehouse_code?: string;
  items_count?: number;
  total_units_requested?: number;
  total_units_shipped?: number;
  total_units_received?: number;
}

export interface ExtendedTransferItem {
  id: string;
  transfer_id: string;
  item_id: string;
  batch_id?: string;
  source_bin_id?: string;
  dest_bin_id?: string;
  quantity_requested: number;
  quantity_shipped: number;
  quantity_received: number;
  discrepancy_reason?: string;
  created_at: string;
  updated_at: string;
  item_sku?: string;
  item_name?: string;
  item_category?: string;
  source_bin_code?: string;
  dest_bin_code?: string;
  batch_number?: string;
}

export interface ExtendedBinLocation {
  id: string;
  warehouse_id: string;
  zone: string;
  aisle: string;
  rack: string;
  shelf: string;
  bin_code: string;
  max_weight_kg?: number;
  is_active: number;
  created_at: string;
  updated_at: string;
  warehouse_name?: string;
  warehouse_code?: string;
  stored_items_count?: number;
  stored_units_count?: number;
}

export const WarehousesView: React.FC<{ onNavigateToInventory?: () => void }> = ({
  onNavigateToInventory
}) => {
  // Active Section Tab inside Warehouses View
  const [activeSubTab, setActiveSubTab] = useState<'facilities' | 'bins' | 'transfers'>('facilities');

  // Master Data
  const [warehouses, setWarehouses] = useState<ExtendedWarehouse[]>([]);
  const [locations, setLocations] = useState<ExtendedBinLocation[]>([]);
  const [transfers, setTransfers] = useState<ExtendedTransfer[]>([]);
  const [catalogItems, setCatalogItems] = useState<Item[]>([]);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedWarehouseFilter, setSelectedWarehouseFilter] = useState<string>('all');
  const [transferStatusFilter, setTransferStatusFilter] = useState<string>('all');

  // Modals
  const [isWarehouseModalOpen, setIsWarehouseModalOpen] = useState<boolean>(false);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);

  const [isBinModalOpen, setIsBinModalOpen] = useState<boolean>(false);
  const [editingBin, setEditingBin] = useState<WarehouseLocation | null>(null);

  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState<boolean>(false);
  const [dispatchTargetTransfer, setDispatchTargetTransfer] = useState<ExtendedTransfer | null>(null);

  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState<boolean>(false);
  const [receiveTargetTransfer, setReceiveTargetTransfer] = useState<ExtendedTransfer | null>(null);
  const [receiveItemsDraft, setReceiveItemsDraft] = useState<
    Array<{
      lineId: string;
      itemSku: string;
      itemName: string;
      quantityShipped: number;
      quantityReceived: number;
      destBinId: string;
      discrepancyReason: string;
    }>
  >([]);

  const [isTransferDetailDrawerOpen, setIsTransferDetailDrawerOpen] = useState<boolean>(false);
  const [selectedTransferDetail, setSelectedTransferDetail] = useState<{
    transfer: ExtendedTransfer;
    items: ExtendedTransferItem[];
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
  // Warehouse Form State
  // --------------------------------------------------------------------------
  const [warehouseForm, setWarehouseForm] = useState({
    warehouse_code: '',
    name: '',
    address: '',
    city: 'Dhaka',
    district: 'Dhaka',
    contact_person: '',
    contact_phone: '',
    is_default: false,
    is_active: true
  });
  const [warehouseFormErrors, setWarehouseFormErrors] = useState<Record<string, string>>({});

  // --------------------------------------------------------------------------
  // Bin Location Form State
  // --------------------------------------------------------------------------
  const [binForm, setBinForm] = useState({
    warehouse_id: '',
    zone: 'Zone A - Fast Pick',
    aisle: 'Aisle 01',
    rack: 'Rack 01',
    shelf: 'Shelf 01',
    bin_code: '',
    max_weight_kg: 500
  });

  const [printModalState, setPrintModalState] = useState<{
    isOpen: boolean;
    type: VoucherType;
    data: any;
  }>({
    isOpen: false,
    type: 'rack_label',
    data: null
  });

  // --------------------------------------------------------------------------
  // Dispatch Modal Form State
  // --------------------------------------------------------------------------
  const [dispatchForm, setDispatchForm] = useState({
    carrier_name: 'Standard Fleet Logistics',
    tracking_number: '',
    dispatched_by: 'Warehouse Dispatch Controller',
    notes: 'Dispatched via express inter-facility transfer truck.'
  });

  // --------------------------------------------------------------------------
  // Data Fetching: Load All Facilities, Bins, Transfers & Aggregates
  // --------------------------------------------------------------------------
  const loadWarehousesData = async () => {
    try {
      setIsLoading(true);
      await dbService.initialize();

      // 1. Warehouses with joined bin and stock counts
      const whRows = await dbService.query<ExtendedWarehouse>(`
        SELECT 
          w.*,
          (SELECT COUNT(*) FROM warehouse_locations l WHERE l.warehouse_id = w.id AND l.is_active = 1) AS bins_count,
          (SELECT COUNT(DISTINCT s.item_id) FROM inventory_stock s WHERE s.warehouse_id = w.id AND s.quantity_on_hand > 0) AS total_skus_count,
          (SELECT COALESCE(SUM(s.quantity_on_hand), 0) FROM inventory_stock s WHERE s.warehouse_id = w.id) AS total_units_stored,
          (SELECT COALESCE(SUM(s.quantity_on_hand * COALESCE(b.unit_cost, i.cost_price)), 0)
           FROM inventory_stock s 
           JOIN items i ON s.item_id = i.id 
           LEFT JOIN item_batches b ON s.batch_id = b.id
           WHERE s.warehouse_id = w.id) AS total_valuation
        FROM warehouses w
        ORDER BY w.is_default DESC, w.name ASC;
      `);
      setWarehouses(whRows);

      // 2. Locations / Bins with stock metrics
      const binRows = await dbService.query<ExtendedBinLocation>(`
        SELECT 
          l.*,
          w.name AS warehouse_name,
          w.warehouse_code AS warehouse_code,
          (SELECT COUNT(DISTINCT s.item_id) FROM inventory_stock s WHERE s.bin_id = l.id AND s.quantity_on_hand > 0) AS stored_items_count,
          (SELECT COALESCE(SUM(s.quantity_on_hand), 0) FROM inventory_stock s WHERE s.bin_id = l.id) AS stored_units_count
        FROM warehouse_locations l
        JOIN warehouses w ON l.warehouse_id = w.id
        ORDER BY w.warehouse_code ASC, l.bin_code ASC;
      `);
      setLocations(binRows);

      // 3. Stock Transfers with joined origin & destination
      const trRows = await dbService.query<ExtendedTransfer>(`
        SELECT 
          t.*,
          sw.name AS source_warehouse_name,
          sw.warehouse_code AS source_warehouse_code,
          dw.name AS dest_warehouse_name,
          dw.warehouse_code AS dest_warehouse_code,
          (SELECT COUNT(*) FROM stock_transfer_items ti WHERE ti.transfer_id = t.id) AS items_count,
          (SELECT COALESCE(SUM(ti.quantity_requested), 0) FROM stock_transfer_items ti WHERE ti.transfer_id = t.id) AS total_units_requested,
          (SELECT COALESCE(SUM(ti.quantity_shipped), 0) FROM stock_transfer_items ti WHERE ti.transfer_id = t.id) AS total_units_shipped,
          (SELECT COALESCE(SUM(ti.quantity_received), 0) FROM stock_transfer_items ti WHERE ti.transfer_id = t.id) AS total_units_received
        FROM stock_transfers t
        JOIN warehouses sw ON t.source_warehouse_id = sw.id
        JOIN warehouses dw ON t.dest_warehouse_id = dw.id
        ORDER BY t.created_at DESC;
      `);
      setTransfers(trRows);

      // 4. Catalog Items
      const itRows = await dbService.query<Item>(
        `SELECT * FROM items WHERE is_active = 1 ORDER BY sku ASC;`
      );
      setCatalogItems(itRows);
    } catch (err: any) {
      console.error('Failed to load warehouses data:', err);
      showToast('error', `Failed to load facilities data: ${err.message || String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadWarehousesData();
  }, []);

  // --------------------------------------------------------------------------
  // Summary Aggregates
  // --------------------------------------------------------------------------
  const aggregateMetrics = useMemo(() => {
    const totalFacilities = warehouses.length;
    const activeFacilities = warehouses.filter((w) => w.is_active === 1).length;
    const totalBins = locations.length;
    const occupiedBins = locations.filter((l) => (l.stored_units_count || 0) > 0).length;
    const binUtilizationRate = totalBins > 0 ? Math.round((occupiedBins / totalBins) * 100) : 0;
    const inTransitTransfersCount = transfers.filter((t) => t.status === 'in_transit').length;
    const totalUnitsOverall = warehouses.reduce(
      (sum, w) => sum + Number(w.total_units_stored || 0),
      0
    );

    return {
      totalFacilities,
      activeFacilities,
      totalBins,
      occupiedBins,
      binUtilizationRate,
      inTransitTransfersCount,
      totalUnitsOverall
    };
  }, [warehouses, locations, transfers]);

  // --------------------------------------------------------------------------
  // Filtered Lists
  // --------------------------------------------------------------------------
  const filteredWarehouses = useMemo(() => {
    return warehouses.filter((w) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        w.name.toLowerCase().includes(q) ||
        w.warehouse_code.toLowerCase().includes(q) ||
        w.city.toLowerCase().includes(q) ||
        (w.contact_person || '').toLowerCase().includes(q)
      );
    });
  }, [warehouses, searchQuery]);

  const filteredLocations = useMemo(() => {
    return locations.filter((l) => {
      if (selectedWarehouseFilter !== 'all' && l.warehouse_id !== selectedWarehouseFilter) {
        return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        l.bin_code.toLowerCase().includes(q) ||
        l.zone.toLowerCase().includes(q) ||
        l.aisle.toLowerCase().includes(q) ||
        (l.warehouse_name || '').toLowerCase().includes(q)
      );
    });
  }, [locations, selectedWarehouseFilter, searchQuery]);

  const filteredTransfers = useMemo(() => {
    return transfers.filter((t) => {
      if (transferStatusFilter !== 'all' && t.status !== transferStatusFilter) {
        return false;
      }
      if (selectedWarehouseFilter !== 'all') {
        const matchesSource = t.source_warehouse_id === selectedWarehouseFilter;
        const matchesDest = t.dest_warehouse_id === selectedWarehouseFilter;
        if (!matchesSource && !matchesDest) return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        t.transfer_number.toLowerCase().includes(q) ||
        (t.source_warehouse_name || '').toLowerCase().includes(q) ||
        (t.dest_warehouse_name || '').toLowerCase().includes(q) ||
        (t.tracking_number || '').toLowerCase().includes(q) ||
        (t.carrier_name || '').toLowerCase().includes(q)
      );
    });
  }, [transfers, transferStatusFilter, selectedWarehouseFilter, searchQuery]);

  // --------------------------------------------------------------------------
  // Warehouse CRUD Actions
  // --------------------------------------------------------------------------
  const handleOpenCreateWarehouseModal = () => {
    setEditingWarehouse(null);
    const codeNum = warehouses.length + 1;
    setWarehouseForm({
      warehouse_code: `WH-DEPOT-0${codeNum}`,
      name: '',
      address: '',
      city: 'Dhaka',
      district: 'Dhaka',
      contact_person: '',
      contact_phone: '',
      is_default: warehouses.length === 0,
      is_active: true
    });
    setWarehouseFormErrors({});
    setIsWarehouseModalOpen(true);
  };

  const handleOpenEditWarehouseModal = (wh: Warehouse) => {
    setEditingWarehouse(wh);
    setWarehouseForm({
      warehouse_code: wh.warehouse_code,
      name: wh.name,
      address: wh.address,
      city: wh.city,
      district: wh.district || 'Dhaka',
      contact_person: wh.contact_person || '',
      contact_phone: wh.contact_phone || '',
      is_default: wh.is_default === 1,
      is_active: wh.is_active === 1
    });
    setWarehouseFormErrors({});
    setIsWarehouseModalOpen(true);
  };

  const validateWarehouseForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!warehouseForm.warehouse_code.trim()) {
      errors.warehouse_code = 'Warehouse code is required.';
    } else {
      const isDuplicate = warehouses.some(
        (w) =>
          w.warehouse_code.toLowerCase() === warehouseForm.warehouse_code.trim().toLowerCase() &&
          (!editingWarehouse || w.id !== editingWarehouse.id)
      );
      if (isDuplicate) {
        errors.warehouse_code = 'Warehouse code must be unique.';
      }
    }

    if (!warehouseForm.name.trim()) errors.name = 'Warehouse facility name is required.';
    if (!warehouseForm.address.trim()) errors.address = 'Street address is required.';
    if (!warehouseForm.city.trim()) errors.city = 'City is required.';

    setWarehouseFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateWarehouseForm()) return;

    try {
      await dbService.transaction(async (tx: any) => {
        // If set as default, unset other defaults
        if (warehouseForm.is_default) {
          await tx.execute(`UPDATE warehouses SET is_default = 0;`);
        }

        if (editingWarehouse) {
          await tx.execute(
            `UPDATE warehouses 
             SET warehouse_code = ?, name = ?, address = ?, city = ?, district = ?, 
                 contact_person = ?, contact_phone = ?, is_default = ?, is_active = ?,
                 updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
             WHERE id = ?;`,
            [
              warehouseForm.warehouse_code.trim().toUpperCase(),
              warehouseForm.name.trim(),
              warehouseForm.address.trim(),
              warehouseForm.city.trim(),
              warehouseForm.district.trim() || null,
              warehouseForm.contact_person.trim() || null,
              warehouseForm.contact_phone.trim() || null,
              warehouseForm.is_default ? 1 : 0,
              warehouseForm.is_active ? 1 : 0,
              editingWarehouse.id
            ]
          );
          showToast('success', `Warehouse "${warehouseForm.name}" updated successfully.`);
        } else {
          const id = `wh-${Date.now()}-${Math.random().toString(36).substring(7)}`;
          await tx.execute(
            `INSERT INTO warehouses (
              id, warehouse_code, name, address, city, district, contact_person, contact_phone, is_default, is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            [
              id,
              warehouseForm.warehouse_code.trim().toUpperCase(),
              warehouseForm.name.trim(),
              warehouseForm.address.trim(),
              warehouseForm.city.trim(),
              warehouseForm.district.trim() || null,
              warehouseForm.contact_person.trim() || null,
              warehouseForm.contact_phone.trim() || null,
              warehouseForm.is_default ? 1 : 0,
              warehouseForm.is_active ? 1 : 0
            ]
          );
          showToast('success', `Warehouse facility "${warehouseForm.name}" created successfully.`);
        }
      });

      setIsWarehouseModalOpen(false);
      await loadWarehousesData();
    } catch (err: any) {
      console.error('Failed to save warehouse:', err);
      showToast('error', `Failed to save warehouse: ${err.message || String(err)}`);
    }
  };

  // Toggle Warehouse Active Status
  const handleToggleWarehouseStatus = async (wh: Warehouse) => {
    try {
      const newStatus = wh.is_active === 1 ? 0 : 1;
      await dbService.execute(
        `UPDATE warehouses 
         SET is_active = ?, updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         WHERE id = ?;`,
        [newStatus, wh.id]
      );
      showToast(
        'info',
        `Warehouse "${wh.name}" marked as ${newStatus === 1 ? 'Active' : 'Inactive'}.`
      );
      await loadWarehousesData();
    } catch (err: any) {
      console.error('Failed to toggle warehouse status:', err);
      showToast('error', `Status change failed: ${err.message || String(err)}`);
    }
  };

  // --------------------------------------------------------------------------
  // Bin Location CRUD Actions
  // --------------------------------------------------------------------------
  const handleOpenCreateBinModal = (prefillWarehouseId?: string) => {
    setEditingBin(null);
    const targetWhId = prefillWarehouseId || selectedWarehouseFilter !== 'all'
      ? selectedWarehouseFilter
      : warehouses[0]?.id || '';
    const wh = warehouses.find((w) => w.id === targetWhId);
    const whCode = wh ? wh.warehouse_code.replace('WH-', '') : 'CTR';

    setBinForm({
      warehouse_id: targetWhId,
      zone: 'Zone A - Fast Pick',
      aisle: 'Aisle 01',
      rack: 'Rack 01',
      shelf: 'Shelf 01',
      bin_code: `WH-${whCode}-ZA-A01-R01-B0${locations.length + 1}`,
      max_weight_kg: 500
    });
    setIsBinModalOpen(true);
  };

  const handleOpenEditBinModal = (bin: WarehouseLocation) => {
    setEditingBin(bin);
    setBinForm({
      warehouse_id: bin.warehouse_id,
      zone: bin.zone,
      aisle: bin.aisle,
      rack: bin.rack,
      shelf: bin.shelf,
      bin_code: bin.bin_code,
      max_weight_kg: bin.max_weight_kg ?? 500
    });
    setIsBinModalOpen(true);
  };

  const handleSaveBin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!binForm.warehouse_id) {
      showToast('error', 'Warehouse must be selected.');
      return;
    }
    if (!binForm.bin_code.trim()) {
      showToast('error', 'Bin code is required.');
      return;
    }

    try {
      if (editingBin) {
        await dbService.execute(
          `UPDATE warehouse_locations 
           SET zone = ?, aisle = ?, rack = ?, shelf = ?, bin_code = ?, max_weight_kg = ?,
               updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
           WHERE id = ?;`,
          [
            binForm.zone.trim(),
            binForm.aisle.trim(),
            binForm.rack.trim(),
            binForm.shelf.trim(),
            binForm.bin_code.trim().toUpperCase(),
            binForm.max_weight_kg || null,
            editingBin.id
          ]
        );
        showToast('success', `Bin location "${binForm.bin_code}" updated.`);
      } else {
        const id = `loc-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        await dbService.execute(
          `INSERT INTO warehouse_locations (
            id, warehouse_id, zone, aisle, rack, shelf, bin_code, max_weight_kg, is_active
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1);`,
          [
            id,
            binForm.warehouse_id,
            binForm.zone.trim(),
            binForm.aisle.trim(),
            binForm.rack.trim(),
            binForm.shelf.trim(),
            binForm.bin_code.trim().toUpperCase(),
            binForm.max_weight_kg || null
          ]
        );
        showToast('success', `Bin location "${binForm.bin_code}" created.`);
      }

      setIsBinModalOpen(false);
      await loadWarehousesData();
    } catch (err: any) {
      console.error('Save bin error:', err);
      showToast('error', `Failed to save bin location: ${err.message || String(err)}`);
    }
  };

  // --------------------------------------------------------------------------
  // Inter-Warehouse Transfer State Machine Workflows
  // --------------------------------------------------------------------------

  // 1. Advance Draft / Requested -> Approved
  const handleApproveTransfer = async (t: ExtendedTransfer) => {
    try {
      await dbService.execute(
        `UPDATE stock_transfers 
         SET status = 'approved', approved_by = 'Operations Director', updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         WHERE id = ?;`,
        [t.id]
      );
      showToast('success', `Transfer ${t.transfer_number} approved for staging and dispatch.`);
      await loadWarehousesData();
    } catch (err: any) {
      console.error('Approve transfer error:', err);
      showToast('error', `Approval failed: ${err.message || String(err)}`);
    }
  };

  // 2. Open Dispatch Modal
  const handleOpenDispatchModal = (t: ExtendedTransfer) => {
    setDispatchTargetTransfer(t);
    const trackingRand = Math.floor(1000000 + Math.random() * 9000000);
    setDispatchForm({
      carrier_name: 'Standard Fleet Logistics',
      tracking_number: `TRK-EXP-${trackingRand}`,
      dispatched_by: 'Warehouse Dispatch Controller',
      notes: 'Outbound dispatch confirmed. Transfer departing source facility.'
    });
    setIsDispatchModalOpen(true);
  };

  // Execute Dispatch with In-Transit Stock Isolation
  const handleExecuteDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dispatchTargetTransfer) return;

    try {
      await dbService.transaction(async (tx: any) => {
        // Fetch transfer line items
        const lines: StockTransferItem[] = await tx.query(
          `SELECT * FROM stock_transfer_items WHERE transfer_id = ?;`,
          [dispatchTargetTransfer.id]
        );

        if (lines.length === 0) {
          throw new Error('Transfer does not contain any line items.');
        }

        // Atomic deduction from source warehouse & bin
        for (const line of lines) {
          // Check stock in source warehouse
          let stockSql = `SELECT id, quantity_on_hand, quantity_reserved, batch_id FROM inventory_stock WHERE item_id = ? AND warehouse_id = ?`;
          const stockParams: any[] = [line.item_id, dispatchTargetTransfer.source_warehouse_id];

          if (line.source_bin_id) {
            stockSql += ` AND bin_id = ?`;
            stockParams.push(line.source_bin_id);
          }
          if (line.batch_id) {
            stockSql += ` AND batch_id = ?`;
            stockParams.push(line.batch_id);
          } else {
            stockSql += ` ORDER BY quantity_on_hand DESC`;
          }

          const stockRows: any[] = await tx.query(stockSql, stockParams);
          const currentStock = stockRows[0];
          const available = (currentStock?.quantity_on_hand || 0) - (currentStock?.quantity_reserved || 0);

          if (!currentStock || available < line.quantity_requested) {
            throw new Error(
              `Insufficient stock at source warehouse/bin for item ${line.item_id}. Requested: ${line.quantity_requested}, Available: ${available}`
            );
          }

          const balanceAfter = currentStock.quantity_on_hand - line.quantity_requested;

          // Deduct from source inventory_stock
          await tx.execute(
            `UPDATE inventory_stock 
             SET quantity_on_hand = quantity_on_hand - ?, updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
             WHERE id = ?;`,
            [line.quantity_requested, currentStock.id]
          );

          // Update transfer line quantity_shipped
          const resolvedBatchId = line.batch_id || currentStock.batch_id || null;
          await tx.execute(
            `UPDATE stock_transfer_items 
             SET quantity_shipped = ?, batch_id = ?, updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
             WHERE id = ?;`,
            [line.quantity_requested, resolvedBatchId, line.id]
          );

          // Immutable Double-Entry Ledger: TRANSFER_OUT
          const auditId = `tx-tr-out-${Date.now()}-${Math.random().toString(36).substring(7)}`;
          await tx.execute(
            `INSERT INTO inventory_transactions (
              id, transaction_timestamp, transaction_type, reference_type, reference_id,
              item_id, warehouse_id, bin_id, batch_id, quantity_change, unit_cost,
              running_balance_after, user_id, notes
            ) VALUES (?, (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), 'TRANSFER_OUT', 'TRANSFER', ?, ?, ?, ?, ?, ?, 0.0, ?, ?, 'In-transit departure');`,
            [
              auditId,
              dispatchTargetTransfer.transfer_number,
              line.item_id,
              dispatchTargetTransfer.source_warehouse_id,
              line.source_bin_id || null,
              resolvedBatchId,
              -line.quantity_requested,
              balanceAfter,
              dispatchForm.dispatched_by
            ]
          );
        }

        // Set transfer status to in_transit
        await tx.execute(
          `UPDATE stock_transfers 
           SET status = 'in_transit', carrier_name = ?, tracking_number = ?, shipped_date = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
               notes = ?, updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
           WHERE id = ?;`,
          [
            dispatchForm.carrier_name.trim(),
            dispatchForm.tracking_number.trim() || null,
            dispatchForm.notes.trim() || null,
            dispatchTargetTransfer.id
          ]
        );
      });

      showToast(
        'success',
        `Transfer ${dispatchTargetTransfer.transfer_number} marked IN_TRANSIT. Stock isolated from source DC.`
      );
      setIsDispatchModalOpen(false);
      await loadWarehousesData();
    } catch (err: any) {
      console.error('Dispatch execution error:', err);
      showToast('error', `Dispatch failed: ${err.message || String(err)}`);
    }
  };

  // 3. Open Receive & Reconcile Modal
  const handleOpenReceiveModal = async (t: ExtendedTransfer) => {
    try {
      const items = await dbService.query<any>(
        `SELECT ti.*, i.sku AS item_sku, i.name AS item_name
         FROM stock_transfer_items ti
         JOIN items i ON ti.item_id = i.id
         WHERE ti.transfer_id = ?;`,
        [t.id]
      );

      setReceiveTargetTransfer(t);
      setReceiveItemsDraft(
        items.map((item: any) => ({
          lineId: item.id,
          itemSku: item.item_sku,
          itemName: item.item_name,
          quantityShipped: item.quantity_shipped,
          quantityReceived: item.quantity_shipped, // default to receiving all
          destBinId: item.dest_bin_id || '',
          discrepancyReason: ''
        }))
      );
      setIsReceiveModalOpen(true);
    } catch (err: any) {
      console.error('Failed to load items for receive modal:', err);
      showToast('error', `Cannot load transfer items: ${err.message || String(err)}`);
    }
  };

  // Execute Destination Receive & Stock Increment
  const handleExecuteReceive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiveTargetTransfer) return;

    try {
      await dbService.transaction(async (tx: any) => {
        for (const lineDraft of receiveItemsDraft) {
          if (lineDraft.quantityReceived > lineDraft.quantityShipped) {
            throw new Error(
              `Received quantity cannot exceed shipped quantity for SKU ${lineDraft.itemSku}.`
            );
          }

          // Fetch transfer item
          const lineRows: StockTransferItem[] = await tx.query(
            `SELECT * FROM stock_transfer_items WHERE id = ?;`,
            [lineDraft.lineId]
          );
          const line = lineRows[0];
          if (!line) throw new Error(`Transfer line ${lineDraft.lineId} not found.`);

          // Increment destination inventory_stock
          const targetBin = lineDraft.destBinId || line.dest_bin_id || null;
          let destStockSql = `SELECT id, quantity_on_hand FROM inventory_stock WHERE item_id = ? AND warehouse_id = ?`;
          const destStockParams: any[] = [line.item_id, receiveTargetTransfer.dest_warehouse_id];

          if (targetBin) {
            destStockSql += ` AND bin_id = ?`;
            destStockParams.push(targetBin);
          } else {
            destStockSql += ` AND bin_id IS NULL`;
          }

          if (line.batch_id) {
            destStockSql += ` AND batch_id = ?`;
            destStockParams.push(line.batch_id);
          } else {
            destStockSql += ` AND batch_id IS NULL`;
          }

          const destStock: any[] = await tx.query(destStockSql, destStockParams);
          let newBalance = lineDraft.quantityReceived;

          if (destStock.length > 0) {
            newBalance = destStock[0].quantity_on_hand + lineDraft.quantityReceived;
            await tx.execute(
              `UPDATE inventory_stock 
               SET quantity_on_hand = quantity_on_hand + ?, updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
               WHERE id = ?;`,
              [lineDraft.quantityReceived, destStock[0].id]
            );
          } else {
            const stockId = `stk-${Date.now()}-${Math.random().toString(36).substring(7)}`;
            await tx.execute(
              `INSERT INTO inventory_stock (id, item_id, warehouse_id, bin_id, batch_id, quantity_on_hand, quantity_reserved)
               VALUES (?, ?, ?, ?, ?, ?, 0);`,
              [
                stockId,
                line.item_id,
                receiveTargetTransfer.dest_warehouse_id,
                targetBin,
                line.batch_id || null,
                lineDraft.quantityReceived
              ]
            );
          }

          // Update line item received quantity
          await tx.execute(
            `UPDATE stock_transfer_items 
             SET quantity_received = ?, dest_bin_id = ?, discrepancy_reason = ?,
                 updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
             WHERE id = ?;`,
            [
              lineDraft.quantityReceived,
              targetBin,
              lineDraft.discrepancyReason ? lineDraft.discrepancyReason.trim() : null,
              line.id
            ]
          );

          // Double-Entry Ledger: TRANSFER_IN
          const auditId = `tx-tr-in-${Date.now()}-${Math.random().toString(36).substring(7)}`;
          await tx.execute(
            `INSERT INTO inventory_transactions (
              id, transaction_timestamp, transaction_type, reference_type, reference_id,
              item_id, warehouse_id, bin_id, batch_id, quantity_change, unit_cost,
              running_balance_after, user_id, notes
            ) VALUES (?, (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), 'TRANSFER_IN', 'TRANSFER', ?, ?, ?, ?, ?, ?, 0.0, ?, 'system', 'In-transit destination receipt');`,
            [
              auditId,
              receiveTargetTransfer.transfer_number,
              line.item_id,
              receiveTargetTransfer.dest_warehouse_id,
              targetBin,
              line.batch_id || null,
              lineDraft.quantityReceived,
              newBalance
            ]
          );
        }

        // Set status to received / completed
        await tx.execute(
          `UPDATE stock_transfers 
           SET status = 'received', received_date = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
               updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
           WHERE id = ?;`,
          [receiveTargetTransfer.id]
        );
      });

      showToast(
        'success',
        `Transfer ${receiveTargetTransfer.transfer_number} received & reconciled at destination facility.`
      );
      setIsReceiveModalOpen(false);
      await loadWarehousesData();
    } catch (err: any) {
      console.error('Receive execution error:', err);
      showToast('error', `Failed to receive transfer: ${err.message || String(err)}`);
    }
  };

  // 4. Cancel Transfer
  const handleCancelTransfer = async (t: ExtendedTransfer) => {
    if (t.status === 'in_transit' || t.status === 'completed' || t.status === 'received') {
      showToast('error', 'Cannot cancel transfer that has already been dispatched or received.');
      return;
    }

    try {
      await dbService.execute(
        `UPDATE stock_transfers 
         SET status = 'cancelled', updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         WHERE id = ?;`,
        [t.id]
      );
      showToast('info', `Stock transfer ${t.transfer_number} cancelled.`);
      await loadWarehousesData();
    } catch (err: any) {
      console.error('Cancel transfer error:', err);
      showToast('error', `Cancel failed: ${err.message || String(err)}`);
    }
  };

  // 5. Open Transfer Detail Drawer
  const handleOpenTransferDetail = async (t: ExtendedTransfer) => {
    try {
      const items = await dbService.query<ExtendedTransferItem>(
        `SELECT 
          ti.*,
          i.sku AS item_sku,
          i.name AS item_name,
          i.category AS item_category,
          sl.bin_code AS source_bin_code,
          dl.bin_code AS dest_bin_code,
          b.batch_number AS batch_number
        FROM stock_transfer_items ti
        JOIN items i ON ti.item_id = i.id
        LEFT JOIN warehouse_locations sl ON ti.source_bin_id = sl.id
        LEFT JOIN warehouse_locations dl ON ti.dest_bin_id = dl.id
        LEFT JOIN item_batches b ON ti.batch_id = b.id
        WHERE ti.transfer_id = ?;`,
        [t.id]
      );

      setSelectedTransferDetail({ transfer: t, items });
      setIsTransferDetailDrawerOpen(true);
    } catch (err: any) {
      console.error('Failed to load transfer detail:', err);
      showToast('error', `Cannot open details: ${err.message || String(err)}`);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* 1. Header Banner & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-main)] flex items-center gap-2.5">
            <Building2 className="text-[var(--accent-primary)]" size={26} />
            Warehouse Logistics, Bins & In-Transit Transfers
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Manage distribution facilities, configure precision bin hierarchies, and oversee multi-stage stock transfers.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {onNavigateToInventory && (
            <button
              onClick={onNavigateToInventory}
              className="btn btn-secondary text-xs"
              title="Return to real-time stock balances & SKU valuation"
            >
              <Boxes size={14} className="text-[var(--emerald)]" />
              <span>Stock Balances</span>
            </button>
          )}

          <button
            onClick={() => handleOpenCreateBinModal()}
            className="btn btn-secondary text-xs"
            title="Add a new rack / bin storage location"
          >
            <Plus size={14} className="text-[var(--cyan)]" />
            <span>New Bin Location</span>
          </button>

          <button
            onClick={handleOpenCreateWarehouseModal}
            className="btn btn-primary text-xs"
            title="Register a new warehouse facility"
          >
            <Building2 size={14} />
            <span>Add Facility</span>
          </button>

          <button
            onClick={loadWarehousesData}
            disabled={isLoading}
            className="p-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] text-[var(--text-dim)] hover:text-[var(--text-main)] transition-colors"
            title="Refresh facilities from SQLite"
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
            {notification.type === 'info' && <ShieldCheck size={16} />}
            <span className="font-semibold">{notification.text}</span>
          </div>
          <button onClick={() => setNotification(null)} className="opacity-75 hover:opacity-100">
            <X size={14} />
          </button>
        </div>
      )}

      {/* 2. Aggregate KPI Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Facilities */}
        <div className="erp-card p-4 hover-lift">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-dim)] uppercase">
              Operational Facilities
            </span>
            <div className="p-2 rounded-lg bg-[var(--accent-glow)] text-[var(--accent-primary)]">
              <Building2 size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-[var(--text-main)]">
              {aggregateMetrics.activeFacilities}{' '}
              <span className="text-xs font-normal text-[var(--text-dim)]">
                / {aggregateMetrics.totalFacilities} total
              </span>
            </div>
            <div className="text-xs text-[var(--text-muted)] mt-1">
              Active enterprise distribution centers
            </div>
          </div>
        </div>

        {/* Bins & Storage Capacity */}
        <div className="erp-card p-4 hover-lift">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-dim)] uppercase">
              Storage Bins & Utilization
            </span>
            <div className="p-2 rounded-lg bg-[var(--cyan-bg)] text-[var(--cyan)]">
              <Layers size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-[var(--cyan)] flex items-center gap-2">
              <span>{aggregateMetrics.totalBins}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--emerald-bg)] text-[var(--emerald)] font-sans font-semibold">
                {aggregateMetrics.binUtilizationRate}% Occupied
              </span>
            </div>
            <div className="text-xs text-[var(--text-muted)] mt-1">
              {aggregateMetrics.occupiedBins} assigned bin locations
            </div>
          </div>
        </div>

        {/* In-Transit Transfers Isolation */}
        <div className="erp-card p-4 hover-lift">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-dim)] uppercase">
              In-Transit Stock Transfers
            </span>
            <div className="p-2 rounded-lg bg-[var(--amber-bg)] text-[var(--amber)]">
              <Truck size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-[var(--amber)]">
              {aggregateMetrics.inTransitTransfersCount}
            </div>
            <div className="text-xs text-[var(--text-muted)] mt-1">
              Isolated in-transit inventory flows
            </div>
          </div>
        </div>

        {/* Total Units Across Facilities */}
        <div className="erp-card p-4 hover-lift">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-dim)] uppercase">
              Total Units Managed
            </span>
            <div className="p-2 rounded-lg bg-[var(--emerald-bg)] text-[var(--emerald)]">
              <Boxes size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-[var(--emerald)]">
              {aggregateMetrics.totalUnitsOverall.toLocaleString()}
            </div>
            <div className="text-xs text-[var(--text-muted)] mt-1">
              Stock units across all active facilities
            </div>
          </div>
        </div>
      </div>

      {/* 3. Sub-Navigation Tabs: Facilities / Bins / In-Transit Transfers */}
      <div className="flex items-center justify-between border-b border-[var(--border-color)]">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSubTab('facilities')}
            className={`pb-3 px-3 text-xs font-semibold transition-all relative ${
              activeSubTab === 'facilities'
                ? 'text-[var(--accent-primary)] border-b-2 border-[var(--accent-primary)]'
                : 'text-[var(--text-dim)] hover:text-[var(--text-main)]'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Building2 size={14} />
              Warehouse Facilities ({warehouses.length})
            </span>
          </button>

          <button
            onClick={() => setActiveSubTab('bins')}
            className={`pb-3 px-3 text-xs font-semibold transition-all relative ${
              activeSubTab === 'bins'
                ? 'text-[var(--accent-primary)] border-b-2 border-[var(--accent-primary)]'
                : 'text-[var(--text-dim)] hover:text-[var(--text-main)]'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Layers size={14} />
              Bin Locations & Hierarchy ({locations.length})
            </span>
          </button>

          <button
            onClick={() => setActiveSubTab('transfers')}
            className={`pb-3 px-3 text-xs font-semibold transition-all relative ${
              activeSubTab === 'transfers'
                ? 'text-[var(--accent-primary)] border-b-2 border-[var(--accent-primary)]'
                : 'text-[var(--text-dim)] hover:text-[var(--text-main)]'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <ArrowRightLeft size={14} />
              In-Transit Transfers ({transfers.length})
              {aggregateMetrics.inTransitTransfersCount > 0 && (
                <span className="badge badge-warning text-[10px] ml-1">
                  {aggregateMetrics.inTransitTransfersCount} Active
                </span>
              )}
            </span>
          </button>
        </div>

        {/* Filter on current sub-tab */}
        <div className="pb-2 flex items-center gap-2">
          <div className="relative w-64">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-dim)]" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field pl-8 py-1 text-xs"
            />
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------------------- */}
      {/* 4. SUB-TAB A: WAREHOUSE FACILITIES DIRECTORY                           */}
      {/* ---------------------------------------------------------------------- */}
      {activeSubTab === 'facilities' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredWarehouses.map((wh) => (
            <div key={wh.id} className="erp-card p-5 hover-lift flex flex-col justify-between">
              <div>
                {/* Header with badges */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <span className="chip-mono font-bold text-[var(--accent-primary)]">
                      {wh.warehouse_code}
                    </span>
                    <h3 className="font-bold text-base text-[var(--text-main)] mt-1">
                      {wh.name}
                    </h3>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {wh.is_default === 1 && (
                      <span className="badge badge-primary text-[10px]">
                        Primary DC
                      </span>
                    )}
                    {wh.is_active === 1 ? (
                      <span className="badge badge-success text-[10px]">
                        Active
                      </span>
                    ) : (
                      <span className="badge badge-danger text-[10px]">
                        Inactive
                      </span>
                    )}
                  </div>
                </div>

                {/* Address & City */}
                <div className="space-y-1.5 text-xs text-[var(--text-muted)] border-t border-[var(--border-color)] pt-3 mb-4">
                  <div className="flex items-center gap-1.5">
                    <MapPin size={13} className="text-[var(--text-dim)] flex-shrink-0" />
                    <span className="truncate">{wh.address}, {wh.city}</span>
                  </div>
                  {wh.contact_person && (
                    <div className="flex items-center gap-1.5">
                      <User size={13} className="text-[var(--text-dim)] flex-shrink-0" />
                      <span className="truncate">{wh.contact_person}</span>
                    </div>
                  )}
                  {wh.contact_phone && (
                    <div className="flex items-center gap-1.5">
                      <Phone size={13} className="text-[var(--text-dim)] flex-shrink-0" />
                      <span className="font-mono text-[11px]">{wh.contact_phone}</span>
                    </div>
                  )}
                </div>

                {/* Storage & Inventory Metric Strip */}
                <div className="grid grid-cols-3 gap-2 p-2.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-color)] text-xs text-center mb-4">
                  <div>
                    <span className="text-[10px] text-[var(--text-dim)] block">Bins</span>
                    <span className="font-mono font-bold text-[var(--text-main)]">
                      {wh.bins_count || 0}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[var(--text-dim)] block">Units</span>
                    <span className="font-mono font-bold text-[var(--text-main)]">
                      {(wh.total_units_stored || 0).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[var(--text-dim)] block">Asset Value</span>
                    <span className="font-mono font-bold text-[var(--emerald)]">
                      ${Math.round(wh.total_valuation || 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Bottom Card Actions */}
              <div className="flex items-center justify-between pt-3 border-t border-[var(--border-color)]">
                <button
                  onClick={() => {
                    setSelectedWarehouseFilter(wh.id);
                    setActiveSubTab('bins');
                  }}
                  className="text-xs font-semibold text-[var(--accent-primary)] hover:underline flex items-center gap-1"
                >
                  <span>Explore Bins</span>
                  <ArrowRight size={13} />
                </button>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleOpenCreateBinModal(wh.id)}
                    className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-dim)] hover:text-[var(--text-main)]"
                    title="Add Bin to this Facility"
                  >
                    <Plus size={15} />
                  </button>
                  <button
                    onClick={() => handleOpenEditWarehouseModal(wh)}
                    className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-dim)] hover:text-[var(--text-main)]"
                    title="Edit Facility Details"
                  >
                    <Edit2 size={15} />
                  </button>
                  <button
                    onClick={() => handleToggleWarehouseStatus(wh)}
                    className={`p-1.5 rounded hover:bg-[var(--bg-hover)] ${
                      wh.is_active === 1
                        ? 'text-[var(--text-dim)] hover:text-[var(--ruby)]'
                        : 'text-[var(--text-dim)] hover:text-[var(--emerald)]'
                    }`}
                    title={wh.is_active === 1 ? 'Deactivate Warehouse' : 'Activate Warehouse'}
                  >
                    {wh.is_active === 1 ? <XCircle size={15} /> : <CheckCircle2 size={15} />}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* 5. SUB-TAB B: BIN LOCATIONS & HIERARCHY MANAGER                       */}
      {/* ---------------------------------------------------------------------- */}
      {activeSubTab === 'bins' && (
        <div className="space-y-4">
          {/* Bin Filters */}
          <div className="flex items-center justify-between gap-3 p-3 erp-card">
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-dim)] font-medium">Facility Filter:</span>
              <select
                value={selectedWarehouseFilter}
                onChange={(e) => setSelectedWarehouseFilter(e.target.value)}
                className="input-field text-xs py-1"
              >
                <option value="all">All Facilities ({warehouses.length})</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.warehouse_code} — {w.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => handleOpenCreateBinModal()}
              className="btn btn-primary text-xs"
            >
              <Plus size={14} />
              <span>Add Bin Code</span>
            </button>
          </div>

          {/* Bins Table */}
          <div className="erp-card overflow-hidden">
            <table className="erp-table text-xs">
              <thead>
                <tr>
                  <th>Bin Code</th>
                  <th>Warehouse Facility</th>
                  <th>Zone</th>
                  <th>Aisle</th>
                  <th>Rack / Shelf</th>
                  <th className="text-right">Max Weight (kg)</th>
                  <th className="text-right">Stored Units</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredLocations.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-10 text-[var(--text-dim)]">
                      No bin locations found. Click "Add Bin Code" to create rack/aisle locations.
                    </td>
                  </tr>
                ) : (
                  filteredLocations.map((loc) => (
                    <tr key={loc.id}>
                      <td>
                        <span className="chip-mono font-bold text-[var(--accent-primary)]">
                          {loc.bin_code}
                        </span>
                      </td>
                      <td>
                        <div className="font-semibold text-[var(--text-main)]">
                          {loc.warehouse_name}
                        </div>
                        <div className="text-[10px] text-[var(--text-dim)]">
                          {loc.warehouse_code}
                        </div>
                      </td>
                      <td>
                        <span className="text-xs text-[var(--text-muted)] font-medium">
                          {loc.zone}
                        </span>
                      </td>
                      <td>{loc.aisle}</td>
                      <td>
                        {loc.rack} / {loc.shelf}
                      </td>
                      <td className="text-right font-mono">
                        {loc.max_weight_kg ? `${loc.max_weight_kg} kg` : 'Unlimited'}
                      </td>
                      <td className="text-right font-mono font-bold text-[var(--emerald)]">
                        {(loc.stored_units_count || 0).toLocaleString()}
                      </td>
                      <td>
                        {loc.is_active === 1 ? (
                          <span className="badge badge-success text-[10px]">Active</span>
                        ) : (
                          <span className="badge badge-danger text-[10px]">Inactive</span>
                        )}
                      </td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              const wh = warehouses.find((w) => w.id === loc.warehouse_id);
                              setPrintModalState({
                                isOpen: true,
                                type: 'rack_label',
                                data: {
                                  ...loc,
                                  warehouse_name: wh?.name || 'Warehouse Storage Facility'
                                }
                              });
                            }}
                            className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-dim)] hover:text-[var(--accent-primary)]"
                            title="Print Shelf Rack & Barcode Label"
                          >
                            <Printer size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEditBinModal(loc)}
                            className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-dim)] hover:text-[var(--text-main)]"
                            title="Edit Bin Location"
                          >
                            <Edit2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* 6. SUB-TAB C: IN-TRANSIT TRANSFERS MONITORING TABLE                    */}
      {/* ---------------------------------------------------------------------- */}
      {activeSubTab === 'transfers' && (
        <div className="space-y-4">
          {/* Transfer Status Filters */}
          <div className="erp-card p-3 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-dim)] font-medium">Transfer State:</span>
              <div className="inline-flex rounded-lg border border-[var(--border-color)] p-0.5 bg-[var(--bg-primary)]">
                {['all', 'draft', 'requested', 'approved', 'in_transit', 'received', 'cancelled'].map((st) => (
                  <button
                    key={st}
                    onClick={() => setTransferStatusFilter(st)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all capitalize ${
                      transferStatusFilter === st
                        ? 'bg-[var(--bg-card)] text-[var(--text-main)] shadow-sm font-semibold'
                        : 'text-[var(--text-dim)] hover:text-[var(--text-main)]'
                    }`}
                  >
                    {st.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-xs text-[var(--text-muted)]">
              Showing <span className="font-bold text-[var(--text-main)]">{filteredTransfers.length}</span> transfers
            </div>
          </div>

          {/* Transfers Table */}
          <div className="erp-card overflow-hidden">
            <table className="erp-table text-xs">
              <thead>
                <tr>
                  <th>Transfer #</th>
                  <th>Origin Warehouse</th>
                  <th>Destination Warehouse</th>
                  <th>Lines / Units</th>
                  <th>Carrier & Tracking</th>
                  <th>State Workflow</th>
                  <th>Created Date</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransfers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-[var(--text-dim)]">
                      <Truck size={32} className="mx-auto mb-2 opacity-40" />
                      <p className="text-sm font-semibold text-[var(--text-main)]">
                        No stock transfers match the filter criteria.
                      </p>
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        Transfers initiated from the Inventory View will appear here.
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredTransfers.map((t) => {
                    const isInTransit = t.status === 'in_transit';
                    const isReceived = t.status === 'received' || t.status === 'completed';
                    const isApproved = (t.status as string) === 'approved';
                    const isRequested = t.status === 'requested';

                    return (
                      <tr key={t.id} className="group">
                        {/* Transfer Number */}
                        <td>
                          <button
                            onClick={() => handleOpenTransferDetail(t)}
                            className="chip-mono font-bold text-[var(--accent-primary)] hover:border-[var(--accent-primary)] text-left cursor-pointer transition-colors"
                            title="Click to view full line-item details"
                          >
                            {t.transfer_number}
                          </button>
                          <div className="text-[10px] text-[var(--text-dim)] mt-0.5">
                            By: {t.requested_by}
                          </div>
                        </td>

                        {/* Origin Warehouse */}
                        <td>
                          <span className="font-semibold text-[var(--text-main)]">
                            {t.source_warehouse_name}
                          </span>
                          <div className="text-[10px] text-[var(--text-dim)] font-mono">
                            {t.source_warehouse_code}
                          </div>
                        </td>

                        {/* Destination Warehouse */}
                        <td>
                          <span className="font-semibold text-[var(--text-main)]">
                            {t.dest_warehouse_name}
                          </span>
                          <div className="text-[10px] text-[var(--text-dim)] font-mono">
                            {t.dest_warehouse_code}
                          </div>
                        </td>

                        {/* Lines & Units */}
                        <td>
                          <div className="font-mono text-xs">
                            <span className="font-bold text-[var(--text-main)]">
                              {t.total_units_requested} units
                            </span>{' '}
                            <span className="text-[var(--text-dim)]">({t.items_count} SKUs)</span>
                          </div>
                          {isInTransit && (
                            <div className="text-[10px] text-[var(--amber)] font-medium">
                              Shipped: {t.total_units_shipped} units
                            </div>
                          )}
                          {isReceived && (
                            <div className="text-[10px] text-[var(--emerald)] font-medium">
                              Received: {t.total_units_received} units
                            </div>
                          )}
                        </td>

                        {/* Carrier & Tracking */}
                        <td>
                          {t.carrier_name ? (
                            <div>
                              <div className="text-xs font-medium text-[var(--text-main)]">
                                {t.carrier_name}
                              </div>
                              <div className="text-[10px] font-mono text-[var(--text-dim)]">
                                {t.tracking_number || 'No tracking #'}
                              </div>
                            </div>
                          ) : (
                            <span className="text-[11px] text-[var(--text-dim)] italic">
                              Awaiting dispatch
                            </span>
                          )}
                        </td>

                        {/* Status Stepper Pill */}
                        <td>
                          {isInTransit ? (
                            <span className="badge badge-warning text-[10px] flex items-center gap-1">
                              <Truck size={11} className="animate-pulse" />
                              IN TRANSIT
                            </span>
                          ) : isReceived ? (
                            <span className="badge badge-success text-[10px] flex items-center gap-1">
                              <CheckCircle2 size={11} />
                              RECEIVED
                            </span>
                          ) : isApproved ? (
                            <span className="badge badge-info text-[10px] flex items-center gap-1">
                              <Clock size={11} />
                              APPROVED
                            </span>
                          ) : isRequested ? (
                            <span className="badge text-[10px] bg-[var(--bg-tertiary)] border-[var(--border-color)] text-[var(--text-muted)]">
                              REQUESTED
                            </span>
                          ) : (
                            <span className="badge badge-danger text-[10px]">
                              {t.status.toUpperCase()}
                            </span>
                          )}
                        </td>

                        {/* Created Date */}
                        <td className="font-mono text-[11px] text-[var(--text-dim)]">
                          {new Date(t.created_at).toLocaleDateString()}
                        </td>

                        {/* Actions */}
                        <td className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* State transitions */}
                            {isRequested && (
                              <button
                                onClick={() => handleApproveTransfer(t)}
                                className="btn btn-secondary text-xs py-1 px-2"
                                title="Approve Transfer"
                              >
                                <Check size={12} className="text-[var(--emerald)]" />
                                <span>Approve</span>
                              </button>
                            )}

                            {isApproved && (
                              <button
                                onClick={() => handleOpenDispatchModal(t)}
                                className="btn btn-primary text-xs py-1 px-2"
                                title="Dispatch transfer into transit isolation"
                              >
                                <Truck size={12} />
                                <span>Dispatch</span>
                              </button>
                            )}

                            {isInTransit && (
                              <button
                                onClick={() => handleOpenReceiveModal(t)}
                                className="btn btn-success text-xs py-1 px-2"
                                title="Receive and reconcile stock at destination"
                              >
                                <CheckCircle2 size={12} />
                                <span>Receive</span>
                              </button>
                            )}

                            {/* View Details */}
                            <button
                              onClick={() => handleOpenTransferDetail(t)}
                              className="p-1.5 rounded-md hover:bg-[var(--bg-hover)] text-[var(--text-dim)] hover:text-[var(--text-main)]"
                              title="View Transfer Details"
                            >
                              <Eye size={14} />
                            </button>

                            {/* Cancel */}
                            {(isRequested || isApproved) && (
                              <button
                                onClick={() => handleCancelTransfer(t)}
                                className="p-1.5 rounded-md hover:bg-[var(--ruby-bg)] text-[var(--text-dim)] hover:text-[var(--ruby)]"
                                title="Cancel Transfer"
                              >
                                <X size={14} />
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
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* 7. Warehouse Facility CRUD Modal                                       */}
      {/* ---------------------------------------------------------------------- */}
      {isWarehouseModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="erp-card w-full max-w-xl bg-[var(--bg-secondary)] border border-[var(--border-color)] shadow-2xl rounded-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] bg-[var(--bg-primary)]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-[var(--accent-glow)] text-[var(--accent-primary)]">
                  <Building2 size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[var(--text-main)]">
                    {editingWarehouse ? `Edit Warehouse: ${editingWarehouse.name}` : 'Register New Warehouse Facility'}
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    Configure physical distribution center profile, address, and default status.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsWarehouseModalOpen(false)}
                className="p-1 rounded-md text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveWarehouse} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    Warehouse Code *
                  </label>
                  <input
                    type="text"
                    value={warehouseForm.warehouse_code}
                    onChange={(e) =>
                      setWarehouseForm((prev) => ({ ...prev, warehouse_code: e.target.value }))
                    }
                    className="input-field text-xs font-mono font-bold"
                    required
                  />
                  {warehouseFormErrors.warehouse_code && (
                    <span className="text-[11px] text-[var(--ruby)]">
                      {warehouseFormErrors.warehouse_code}
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    Facility Name *
                  </label>
                  <input
                    type="text"
                    value={warehouseForm.name}
                    onChange={(e) => setWarehouseForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. South Regional Hub"
                    className="input-field text-xs"
                    required
                  />
                  {warehouseFormErrors.name && (
                    <span className="text-[11px] text-[var(--ruby)]">
                      {warehouseFormErrors.name}
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                  Street Address *
                </label>
                <input
                  type="text"
                  value={warehouseForm.address}
                  onChange={(e) =>
                    setWarehouseForm((prev) => ({ ...prev, address: e.target.value }))
                  }
                  placeholder="e.g. Plot 18, BSCIC Industrial Area"
                  className="input-field text-xs"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    City *
                  </label>
                  <input
                    type="text"
                    value={warehouseForm.city}
                    onChange={(e) => setWarehouseForm((prev) => ({ ...prev, city: e.target.value }))}
                    className="input-field text-xs"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    District / Region
                  </label>
                  <input
                    type="text"
                    value={warehouseForm.district}
                    onChange={(e) =>
                      setWarehouseForm((prev) => ({ ...prev, district: e.target.value }))
                    }
                    className="input-field text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    Manager / Contact Person
                  </label>
                  <input
                    type="text"
                    value={warehouseForm.contact_person}
                    onChange={(e) =>
                      setWarehouseForm((prev) => ({ ...prev, contact_person: e.target.value }))
                    }
                    placeholder="e.g. Tanvir Islam"
                    className="input-field text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    Contact Phone
                  </label>
                  <input
                    type="text"
                    value={warehouseForm.contact_phone}
                    onChange={(e) =>
                      setWarehouseForm((prev) => ({ ...prev, contact_phone: e.target.value }))
                    }
                    placeholder="+880 1711-..."
                    className="input-field text-xs font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[var(--text-main)]">
                  <input
                    type="checkbox"
                    checked={warehouseForm.is_default}
                    onChange={(e) =>
                      setWarehouseForm((prev) => ({ ...prev, is_default: e.target.checked }))
                    }
                    className="rounded border-[var(--border-color)] text-[var(--accent-primary)]"
                  />
                  <span>Set as Default Central Facility</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[var(--text-main)]">
                  <input
                    type="checkbox"
                    checked={warehouseForm.is_active}
                    onChange={(e) =>
                      setWarehouseForm((prev) => ({ ...prev, is_active: e.target.checked }))
                    }
                    className="rounded border-[var(--border-color)] text-[var(--accent-primary)]"
                  />
                  <span>Active Operational Status</span>
                </label>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--border-color)]">
                <button
                  type="button"
                  onClick={() => setIsWarehouseModalOpen(false)}
                  className="btn btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary text-xs">
                  <Check size={14} />
                  <span>Save Facility</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* 8. Bin Location CRUD Modal                                             */}
      {/* ---------------------------------------------------------------------- */}
      {isBinModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="erp-card w-full max-w-lg bg-[var(--bg-secondary)] border border-[var(--border-color)] shadow-2xl rounded-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] bg-[var(--bg-primary)]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-[var(--cyan-bg)] text-[var(--cyan)]">
                  <Layers size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[var(--text-main)]">
                    {editingBin ? `Edit Bin: ${editingBin.bin_code}` : 'Define New Bin Location'}
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    Assign zone, aisle, rack, shelf, and unique bin identifier code.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsBinModalOpen(false)}
                className="p-1 rounded-md text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveBin} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                  Target Warehouse Facility *
                </label>
                <select
                  value={binForm.warehouse_id}
                  onChange={(e) => setBinForm((prev) => ({ ...prev, warehouse_id: e.target.value }))}
                  className="input-field text-xs"
                  required
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.warehouse_code} — {w.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                  Zone Designation *
                </label>
                <input
                  type="text"
                  value={binForm.zone}
                  onChange={(e) => setBinForm((prev) => ({ ...prev, zone: e.target.value }))}
                  placeholder="e.g. Zone A - Fast Pick"
                  className="input-field text-xs"
                  required
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    Aisle
                  </label>
                  <input
                    type="text"
                    value={binForm.aisle}
                    onChange={(e) => setBinForm((prev) => ({ ...prev, aisle: e.target.value }))}
                    className="input-field text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    Rack
                  </label>
                  <input
                    type="text"
                    value={binForm.rack}
                    onChange={(e) => setBinForm((prev) => ({ ...prev, rack: e.target.value }))}
                    className="input-field text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    Shelf
                  </label>
                  <input
                    type="text"
                    value={binForm.shelf}
                    onChange={(e) => setBinForm((prev) => ({ ...prev, shelf: e.target.value }))}
                    className="input-field text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    Bin Identifier Code *
                  </label>
                  <input
                    type="text"
                    value={binForm.bin_code}
                    onChange={(e) => setBinForm((prev) => ({ ...prev, bin_code: e.target.value }))}
                    placeholder="e.g. WH-CTR-ZA-A01-R01-B01"
                    className="input-field text-xs font-mono font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    Max Weight Capacity (kg)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={binForm.max_weight_kg}
                    onChange={(e) =>
                      setBinForm((prev) => ({
                        ...prev,
                        max_weight_kg: parseFloat(e.target.value) || 0
                      }))
                    }
                    className="input-field text-xs font-mono"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-[var(--border-color)]">
                <div>
                  {editingBin && (
                    <button
                      type="button"
                      onClick={() => {
                        const wh = warehouses.find((w) => w.id === editingBin.warehouse_id);
                        setPrintModalState({
                          isOpen: true,
                          type: 'rack_label',
                          data: {
                            ...editingBin,
                            warehouse_name: wh?.name || 'Warehouse Storage Facility'
                          }
                        });
                      }}
                      className="btn btn-secondary text-xs flex items-center gap-1.5"
                    >
                      <Printer size={14} />
                      <span>Print Label</span>
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsBinModalOpen(false)}
                    className="btn btn-secondary text-xs"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary text-xs">
                    <Check size={14} />
                    <span>Save Bin</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* 9. Dispatch Modal (In-Transit Isolation)                               */}
      {/* ---------------------------------------------------------------------- */}
      {isDispatchModalOpen && dispatchTargetTransfer && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="erp-card w-full max-w-lg bg-[var(--bg-secondary)] border border-[var(--border-color)] shadow-2xl rounded-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] bg-[var(--bg-primary)]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-[var(--amber-bg)] text-[var(--amber)]">
                  <Truck size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[var(--text-main)]">
                    Confirm Transfer Dispatch: {dispatchTargetTransfer.transfer_number}
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    Atomic isolation: Stock will be deducted from source DC immediately.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsDispatchModalOpen(false)}
                className="p-1 rounded-md text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleExecuteDispatch} className="p-6 space-y-4">
              <div className="p-3 rounded-lg bg-[var(--amber-bg)] border border-[var(--amber-border)] text-xs text-[var(--amber)] flex items-start gap-2">
                <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                <span>
                  Dispatching will deduct{' '}
                  <strong className="font-mono">
                    {dispatchTargetTransfer.total_units_requested} units
                  </strong>{' '}
                  from <strong>{dispatchTargetTransfer.source_warehouse_name}</strong> and place them
                  in transit isolation. Stock will NOT appear at destination until received and verified.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                  Carrier / Transport Provider *
                </label>
                <input
                  type="text"
                  value={dispatchForm.carrier_name}
                  onChange={(e) =>
                    setDispatchForm((prev) => ({ ...prev, carrier_name: e.target.value }))
                  }
                  className="input-field text-xs"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                  Tracking / Consignment Number
                </label>
                <input
                  type="text"
                  value={dispatchForm.tracking_number}
                  onChange={(e) =>
                    setDispatchForm((prev) => ({ ...prev, tracking_number: e.target.value }))
                  }
                  className="input-field text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                  Dispatch Operator
                </label>
                <input
                  type="text"
                  value={dispatchForm.dispatched_by}
                  onChange={(e) =>
                    setDispatchForm((prev) => ({ ...prev, dispatched_by: e.target.value }))
                  }
                  className="input-field text-xs"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                  Dispatch Notes
                </label>
                <input
                  type="text"
                  value={dispatchForm.notes}
                  onChange={(e) =>
                    setDispatchForm((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  className="input-field text-xs"
                />
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--border-color)]">
                <button
                  type="button"
                  onClick={() => setIsDispatchModalOpen(false)}
                  className="btn btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary text-xs">
                  <Truck size={14} />
                  <span>Confirm Dispatch & Deduct Stock</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* 10. Destination Receipt & Reconciliation Modal                         */}
      {/* ---------------------------------------------------------------------- */}
      {isReceiveModalOpen && receiveTargetTransfer && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="erp-card w-full max-w-2xl bg-[var(--bg-secondary)] border border-[var(--border-color)] shadow-2xl rounded-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] bg-[var(--bg-primary)]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-[var(--emerald-bg)] text-[var(--emerald)]">
                  <CheckCircle2 size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[var(--text-main)]">
                    Receive & Reconcile Transfer: {receiveTargetTransfer.transfer_number}
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    Verify received physical quantities at {receiveTargetTransfer.dest_warehouse_name} and assign destination bins.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsReceiveModalOpen(false)}
                className="p-1 rounded-md text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleExecuteReceive} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="border border-[var(--border-color)] rounded-lg overflow-hidden">
                <table className="erp-table text-xs">
                  <thead>
                    <tr>
                      <th>SKU & Item</th>
                      <th className="text-right">Shipped</th>
                      <th className="text-right">Received *</th>
                      <th>Target Bin</th>
                      <th>Variance Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receiveItemsDraft.map((draft, idx) => (
                      <tr key={draft.lineId}>
                        <td>
                          <div className="font-mono font-bold text-[var(--accent-primary)]">
                            {draft.itemSku}
                          </div>
                          <div className="text-[11px] text-[var(--text-main)]">{draft.itemName}</div>
                        </td>
                        <td className="text-right font-mono font-semibold">
                          {draft.quantityShipped}
                        </td>
                        <td className="text-right">
                          <input
                            type="number"
                            min="0"
                            max={draft.quantityShipped}
                            value={draft.quantityReceived}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10) || 0;
                              setReceiveItemsDraft((prev) =>
                                prev.map((item, i) =>
                                  i === idx ? { ...item, quantityReceived: val } : item
                                )
                              );
                            }}
                            className="input-field text-xs font-mono font-bold w-20 text-right py-1"
                            required
                          />
                        </td>
                        <td>
                          <select
                            value={draft.destBinId}
                            onChange={(e) => {
                              const val = e.target.value;
                              setReceiveItemsDraft((prev) =>
                                prev.map((item, i) =>
                                  i === idx ? { ...item, destBinId: val } : item
                                )
                              );
                            }}
                            className="input-field text-xs py-1"
                          >
                            <option value="">Auto / Default Bin</option>
                            {locations
                              .filter((l) => l.warehouse_id === receiveTargetTransfer.dest_warehouse_id)
                              .map((loc) => (
                                <option key={loc.id} value={loc.id}>
                                  {loc.bin_code}
                                </option>
                              ))}
                          </select>
                        </td>
                        <td>
                          {draft.quantityReceived < draft.quantityShipped ? (
                            <input
                              type="text"
                              placeholder="Discrepancy reason..."
                              value={draft.discrepancyReason}
                              onChange={(e) => {
                                const val = e.target.value;
                                setReceiveItemsDraft((prev) =>
                                  prev.map((item, i) =>
                                    i === idx ? { ...item, discrepancyReason: val } : item
                                  )
                                );
                              }}
                              className="input-field text-xs py-1 border-[var(--ruby-border)]"
                              required
                            />
                          ) : (
                            <span className="text-[11px] text-[var(--emerald)] flex items-center gap-1">
                              <Check size={12} />
                              Exact Match
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--border-color)]">
                <button
                  type="button"
                  onClick={() => setIsReceiveModalOpen(false)}
                  className="btn btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-success text-xs">
                  <CheckCircle2 size={14} />
                  <span>Complete Transfer & Increment Stock</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* 11. Transfer Line Items & Audit Inspector Drawer                       */}
      {/* ---------------------------------------------------------------------- */}
      {isTransferDetailDrawerOpen && selectedTransferDetail && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="erp-card w-full max-w-2xl bg-[var(--bg-secondary)] border border-[var(--border-color)] shadow-2xl rounded-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] bg-[var(--bg-primary)]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-[var(--accent-glow)] text-[var(--accent-primary)]">
                  <ArrowRightLeft size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[var(--text-main)]">
                    Transfer Inspector: {selectedTransferDetail.transfer.transfer_number}
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    Inter-facility movement manifest and line-item reconciliation ledger.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsTransferDetailDrawerOpen(false)}
                className="p-1 rounded-md text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Transfer Details Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-color)] text-xs">
                <div>
                  <span className="text-[var(--text-dim)] block text-[11px]">Origin Facility</span>
                  <span className="font-semibold text-[var(--text-main)]">
                    {selectedTransferDetail.transfer.source_warehouse_name}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--text-dim)] block text-[11px]">Target Facility</span>
                  <span className="font-semibold text-[var(--text-main)]">
                    {selectedTransferDetail.transfer.dest_warehouse_name}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--text-dim)] block text-[11px]">Carrier</span>
                  <span className="font-medium text-[var(--text-main)]">
                    {selectedTransferDetail.transfer.carrier_name || 'Not assigned'}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--text-dim)] block text-[11px]">Workflow State</span>
                  <span className="font-bold text-[var(--accent-primary)] uppercase">
                    {selectedTransferDetail.transfer.status}
                  </span>
                </div>
              </div>

              {/* Items Table */}
              <div>
                <h4 className="text-xs font-bold text-[var(--text-main)] uppercase tracking-wider mb-2">
                  Transfer Line Items
                </h4>
                <div className="border border-[var(--border-color)] rounded-lg overflow-hidden">
                  <table className="erp-table text-xs">
                    <thead>
                      <tr>
                        <th>SKU & Product</th>
                        <th>Source Bin</th>
                        <th>Target Bin</th>
                        <th className="text-right">Requested</th>
                        <th className="text-right">Shipped</th>
                        <th className="text-right">Received</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedTransferDetail.items.map((line) => (
                        <tr key={line.id}>
                          <td>
                            <div className="font-mono font-bold text-[var(--accent-primary)]">
                              {line.item_sku}
                            </div>
                            <div className="text-[11px] text-[var(--text-main)]">{line.item_name}</div>
                          </td>
                          <td>
                            <span className="chip-mono text-[11px]">
                              {line.source_bin_code || 'Unassigned'}
                            </span>
                          </td>
                          <td>
                            <span className="chip-mono text-[11px]">
                              {line.dest_bin_code || 'Unassigned'}
                            </span>
                          </td>
                          <td className="text-right font-mono">{line.quantity_requested}</td>
                          <td className="text-right font-mono font-semibold text-[var(--amber)]">
                            {line.quantity_shipped}
                          </td>
                          <td className="text-right font-mono font-bold text-[var(--emerald)]">
                            {line.quantity_received}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Audit Timestamps & Notes */}
              <div className="p-3 rounded-lg border border-[var(--border-color)] text-xs space-y-1 bg-[var(--bg-card)]">
                <div className="flex items-center justify-between text-[11px] text-[var(--text-dim)]">
                  <span>Created: {new Date(selectedTransferDetail.transfer.created_at).toLocaleString()}</span>
                  {selectedTransferDetail.transfer.shipped_date && (
                    <span>Shipped: {new Date(selectedTransferDetail.transfer.shipped_date).toLocaleString()}</span>
                  )}
                  {selectedTransferDetail.transfer.received_date && (
                    <span>Received: {new Date(selectedTransferDetail.transfer.received_date).toLocaleString()}</span>
                  )}
                </div>
                {selectedTransferDetail.transfer.notes && (
                  <p className="text-xs text-[var(--text-muted)] mt-1 italic">
                    "{selectedTransferDetail.transfer.notes}"
                  </p>
                )}
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setIsTransferDetailDrawerOpen(false)}
                  className="btn btn-secondary text-xs"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Print Shelf / Rack Label Modal */}
      <PrintVoucherModal
        isOpen={printModalState.isOpen}
        onClose={() => setPrintModalState((prev) => ({ ...prev, isOpen: false }))}
        type={printModalState.type}
        data={printModalState.data}
      />
    </div>
  );
};

export default WarehousesView;
