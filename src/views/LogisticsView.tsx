// ============================================================================
// PROBAHO ERP: FULFILLMENT & LOGISTICS TRACKING VIEW
// File: src/views/LogisticsView.tsx (Milestone 4)
// High-Contrast Theme Compliant (WCAG 2.1 AA), Offline-First SQLite Powered
// ============================================================================

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Truck,
  Package,
  Boxes,
  Building2,
  MapPin,
  Phone,
  User,
  Calendar,
  DollarSign,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  ArrowRight,
  ArrowRightLeft,
  Search,
  Filter,
  Plus,
  RefreshCw,
  Eye,
  Edit2,
  Trash2,
  X,
  ExternalLink,
  FileText,
  Check,
  ChevronRight,
  ShieldCheck,
  Layers,
  AlertCircle,
  Hash,
  Send,
  RotateCcw,
  Compass,
  FileSpreadsheet,
  Printer
} from 'lucide-react';
import { PrintVoucherModal, type VoucherType } from '../components/PrintVoucherModal';
import { dbService } from '../services/db';
import type {
  Courier,
  Shipment,
  ShipmentItem,
  ShipmentStatus,
  Warehouse,
  WarehouseLocation,
  Item,
  ItemBatch,
  InventoryStock
} from '../types/erp';

// ============================================================================
// DOMAIN INTERFACES & EXTENSIONS
// ============================================================================

export interface ExtendedShipment extends Shipment {
  source_warehouse_name?: string;
  source_warehouse_code?: string;
  items_count?: number;
  total_units?: number;
  items?: ExtendedShipmentItem[];
}

export interface ExtendedShipmentItem extends ShipmentItem {
  item_sku?: string;
  item_name?: string;
  item_category?: string;
  unit_of_measure?: string;
  batch_number?: string;
  bin_code?: string;
  bin_zone?: string;
}

export interface LogisticsKPISummary {
  totalActiveShipments: number;
  dispatchedInTransit: number;
  deliveredFulfilled: number;
  rtoPendingIntake: number;
  activeCouriers: number;
}

export interface NewShipmentLineItem {
  itemId: string;
  sku: string;
  name: string;
  unitOfMeasure: string;
  binId: string;
  batchId?: string;
  quantityOnHand: number;
  quantityReserved: number;
  availableStock: number;
  quantity: number;
  unitPrice: number;
}

export interface LogisticsViewProps {
  activeWarehouseId?: string;
  onRefreshCounts?: () => void;
  initialSearchQuery?: string;
}

// ============================================================================
// HIGH-CONTRAST STATUS BADGE COMPONENT (WCAG 2.1 AA COMPLIANT)
// ============================================================================

export const ShipmentStatusBadge: React.FC<{ status: ShipmentStatus | string; disposition?: string | null }> = ({
  status,
  disposition
}) => {
  switch (status) {
    case 'pending':
      return (
        <span
          className="badge inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[0.72rem] font-bold uppercase tracking-wider"
          style={{
            backgroundColor: 'var(--amber-bg)',
            color: 'var(--amber)',
            border: '1px solid var(--amber-border)'
          }}
        >
          <Clock size={12} className="flex-shrink-0" />
          Pending
        </span>
      );

    case 'packed':
      return (
        <span
          className="badge inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[0.72rem] font-bold uppercase tracking-wider"
          style={{
            backgroundColor: 'var(--cyan-bg)',
            color: 'var(--cyan)',
            border: '1px solid var(--cyan-border)'
          }}
        >
          <Package size={12} className="flex-shrink-0" />
          Packed & Staged
        </span>
      );

    case 'dispatched':
      return (
        <span
          className="badge inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[0.72rem] font-bold uppercase tracking-wider"
          style={{
            backgroundColor: 'var(--accent-glow)',
            color: 'var(--accent-primary)',
            border: '1px solid var(--accent-primary)'
          }}
        >
          <Send size={12} className="flex-shrink-0" />
          Dispatched
        </span>
      );

    case 'in_transit':
      return (
        <span
          className="badge inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[0.72rem] font-bold uppercase tracking-wider"
          style={{
            backgroundColor: 'var(--cyan-bg)',
            color: 'var(--cyan)',
            border: '1px solid var(--cyan-border)'
          }}
        >
          <Compass size={12} className="flex-shrink-0" />
          In-Transit
        </span>
      );

    case 'delivered':
      return (
        <span
          className="badge inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[0.72rem] font-bold uppercase tracking-wider"
          style={{
            backgroundColor: 'var(--emerald-bg)',
            color: 'var(--emerald)',
            border: '1px solid var(--emerald-border)'
          }}
        >
          <CheckCircle2 size={12} className="flex-shrink-0" />
          Delivered
        </span>
      );

    case 'return_to_origin':
      return (
        <span
          className="badge inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[0.72rem] font-bold uppercase tracking-wider"
          style={{
            backgroundColor: 'var(--ruby-bg)',
            color: 'var(--ruby)',
            border: '1px solid var(--ruby-border)'
          }}
        >
          <AlertTriangle size={12} className="flex-shrink-0" />
          RTO Pending
        </span>
      );

    case 'rto_received':
    case 'rto_delivered':
      return (
        <span
          className="badge inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[0.72rem] font-bold uppercase tracking-wider"
          style={{
            backgroundColor: disposition === 'damaged_writeoff' ? 'var(--ruby-bg)' : 'var(--emerald-bg)',
            color: disposition === 'damaged_writeoff' ? 'var(--ruby)' : 'var(--emerald)',
            border: disposition === 'damaged_writeoff' ? '1px solid var(--ruby-border)' : '1px solid var(--emerald-border)'
          }}
        >
          <RotateCcw size={12} className="flex-shrink-0" />
          {disposition === 'damaged_writeoff' ? 'RTO Scrapped' : 'RTO Restocked'}
        </span>
      );

    case 'cancelled':
      return (
        <span
          className="badge inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[0.72rem] font-bold uppercase tracking-wider"
          style={{
            backgroundColor: 'var(--bg-hover)',
            color: 'var(--text-dim)',
            border: '1px solid var(--border-color)'
          }}
        >
          <XCircle size={12} className="flex-shrink-0" />
          Cancelled
        </span>
      );

    default:
      return (
        <span className="badge badge-secondary text-[0.72rem] font-semibold">
          {status}
        </span>
      );
  }
};

// ============================================================================
// MAIN COMPONENT: LogisticsView
// ============================================================================

export const LogisticsView: React.FC<LogisticsViewProps> = ({
  activeWarehouseId,
  onRefreshCounts,
  initialSearchQuery
}) => {
  // Main Data States
  const [shipments, setShipments] = useState<ExtendedShipment[]>([]);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseBins, setWarehouseBins] = useState<WarehouseLocation[]>([]);
  const [catalogItems, setCatalogItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Search & Filtering States
  const [searchQuery, setSearchQuery] = useState<string>(initialSearchQuery || '');

  useEffect(() => {
    if (initialSearchQuery !== undefined) {
      setSearchQuery(initialSearchQuery);
    }
  }, [initialSearchQuery]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'dispatched' | 'in_transit' | 'delivered' | 'rto' | 'couriers'>('all');
  const [warehouseFilter, setWarehouseFilter] = useState<string>(activeWarehouseId || 'all');
  const [courierFilter, setCourierFilter] = useState<string>('all');

  // Modals & Dialogs State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);
  const [selectedShipmentDetail, setSelectedShipmentDetail] = useState<ExtendedShipment | null>(null);
  const [printModalState, setPrintModalState] = useState<{
    isOpen: boolean;
    type: VoucherType;
    data: any;
  }>({
    isOpen: false,
    type: 'delivery_waybill',
    data: null
  });

  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState<boolean>(false);
  const [dispatchTargetShipment, setDispatchTargetShipment] = useState<ExtendedShipment | null>(null);
  const [dispatchTrackingInput, setDispatchTrackingInput] = useState<string>('');

  const [isRTOModalOpen, setIsRTOModalOpen] = useState<boolean>(false);
  const [rtoTargetShipment, setRTOTargetShipment] = useState<ExtendedShipment | null>(null);
  const [rtoInspectionNotes, setRtoInspectionNotes] = useState<string>('Customer delivery failed; package returned in sealed condition.');
  const [rtoDisposition, setRtoDisposition] = useState<'restocked' | 'damaged_writeoff'>('restocked');
  const [rtoTargetBinId, setRtoTargetBinId] = useState<string>('');

  const [isCourierModalOpen, setIsCourierModalOpen] = useState<boolean>(false);
  const [editingCourier, setEditingCourier] = useState<Courier | null>(null);
  const [courierForm, setCourierForm] = useState({
    name: '',
    service_type: 'Standard',
    contact_phone: '',
    tracking_url_template: '',
    is_active: 1
  });

  // Toast Notification System
  const [notification, setNotification] = useState<{
    type: 'success' | 'error' | 'info' | 'warning';
    text: string;
  } | null>(null);

  const showToast = useCallback((type: 'success' | 'error' | 'info' | 'warning', text: string) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 4500);
  }, []);

  // Outbound Shipment Wizard State
  const [newShipmentHeader, setNewShipmentHeader] = useState({
    shipment_number: '',
    order_reference: '',
    source_warehouse_id: activeWarehouseId || 'wh-central-dc',
    customer_name: '',
    customer_phone: '',
    customer_address: '',
    destination_city: 'Dhaka',
    destination_district: 'Dhaka',
    courier_id: '',
    courier_name: '',
    tracking_number: '',
    cod_amount: 0,
    shipping_fee: 60.0,
    notes: ''
  });
  const [newLineItems, setNewLineItems] = useState<NewShipmentLineItem[]>([]);
  const [wizardErrors, setWizardErrors] = useState<Record<string, string>>({});
  const [isSubmittingShipment, setIsSubmittingShipment] = useState<boolean>(false);

  // --------------------------------------------------------------------------
  // Data Loading from SQLite
  // --------------------------------------------------------------------------
  const loadLogisticsData = useCallback(async () => {
    try {
      setIsLoading(true);
      await dbService.initialize();

      // 1. Couriers
      const courierRows = await dbService.query<Courier>(
        'SELECT * FROM couriers ORDER BY is_active DESC, name ASC;'
      );
      setCouriers(courierRows);

      // 2. Active Warehouses
      const whRows = await dbService.query<Warehouse>(
        'SELECT * FROM warehouses WHERE is_active = 1 ORDER BY is_default DESC, name ASC;'
      );
      setWarehouses(whRows);

      // 3. Warehouse Locations / Bins
      const binRows = await dbService.query<WarehouseLocation>(
        'SELECT * FROM warehouse_locations WHERE is_active = 1 ORDER BY warehouse_id, bin_code ASC;'
      );
      setWarehouseBins(binRows);

      // 4. Catalog Items
      const itemRows = await dbService.query<Item>(
        'SELECT * FROM items WHERE is_active = 1 ORDER BY sku ASC;'
      );
      setCatalogItems(itemRows);

      // 5. Extended Shipments with joined warehouse and item stats
      const shipmentRows = await dbService.query<ExtendedShipment>(`
        SELECT 
          s.*,
          w.name AS source_warehouse_name,
          w.warehouse_code AS source_warehouse_code,
          (SELECT COUNT(*) FROM shipment_items si WHERE si.shipment_id = s.id) AS items_count,
          (SELECT COALESCE(SUM(si.quantity), 0) FROM shipment_items si WHERE si.shipment_id = s.id) AS total_units
        FROM shipments s
        LEFT JOIN warehouses w ON s.source_warehouse_id = w.id
        ORDER BY s.created_at DESC;
      `);
      setShipments(shipmentRows);

      if (onRefreshCounts) {
        onRefreshCounts();
      }
    } catch (err) {
      console.error('Failed to load logistics data from SQLite:', err);
      showToast('error', 'Error reading logistics records from database.');
    } finally {
      setIsLoading(false);
    }
  }, [onRefreshCounts, showToast]);

  useEffect(() => {
    loadLogisticsData();
  }, [loadLogisticsData]);

  // Sync warehouse filter when activeWarehouseId prop changes
  useEffect(() => {
    if (activeWarehouseId) {
      setWarehouseFilter(activeWarehouseId);
    }
  }, [activeWarehouseId]);

  // --------------------------------------------------------------------------
  // KPI Metrics Calculations
  // --------------------------------------------------------------------------
  const kpis: LogisticsKPISummary = useMemo(() => {
    const totalActive = shipments.filter((s) =>
      ['pending', 'packed', 'dispatched', 'in_transit'].includes(s.status)
    ).length;

    const dispatchedTransit = shipments.filter((s) =>
      ['dispatched', 'in_transit'].includes(s.status)
    ).length;

    const delivered = shipments.filter((s) => s.status === 'delivered').length;

    const rtoPending = shipments.filter((s) => s.status === 'return_to_origin').length;

    const activeCour = couriers.filter((c) => c.is_active === 1).length;

    return {
      totalActiveShipments: totalActive,
      dispatchedInTransit: dispatchedTransit,
      deliveredFulfilled: delivered,
      rtoPendingIntake: rtoPending,
      activeCouriers: activeCour
    };
  }, [shipments, couriers]);

  // --------------------------------------------------------------------------
  // Filtered Shipments
  // --------------------------------------------------------------------------
  const filteredShipments = useMemo(() => {
    return shipments.filter((s) => {
      // 1. Tab / Status Filter
      if (statusFilter === 'pending' && !['pending', 'packed'].includes(s.status)) {
        return false;
      }
      if (statusFilter === 'dispatched' && s.status !== 'dispatched') {
        return false;
      }
      if (statusFilter === 'in_transit' && s.status !== 'in_transit') {
        return false;
      }
      if (statusFilter === 'delivered' && s.status !== 'delivered') {
        return false;
      }
      if (statusFilter === 'rto' && !['return_to_origin', 'rto_received', 'rto_delivered'].includes(s.status)) {
        return false;
      }

      // 2. Warehouse Filter
      if (warehouseFilter !== 'all' && s.source_warehouse_id !== warehouseFilter) {
        return false;
      }

      // 3. Courier Filter
      if (courierFilter !== 'all' && s.courier_id !== courierFilter && s.courier_name !== courierFilter) {
        return false;
      }

      // 4. Search Query (Shipment #, Order Ref, Customer, Phone, Tracking, City)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const numMatch = s.shipment_number?.toLowerCase().includes(q);
        const orderMatch = s.order_reference?.toLowerCase().includes(q);
        const custMatch = s.customer_name?.toLowerCase().includes(q);
        const phoneMatch = s.customer_phone?.toLowerCase().includes(q);
        const trackMatch = s.tracking_number?.toLowerCase().includes(q);
        const cityMatch = s.destination_city?.toLowerCase().includes(q);

        if (!numMatch && !orderMatch && !custMatch && !phoneMatch && !trackMatch && !cityMatch) {
          return false;
        }
      }

      return true;
    });
  }, [shipments, statusFilter, warehouseFilter, courierFilter, searchQuery]);

  // --------------------------------------------------------------------------
  // Fetch Line Items for Selected Shipment
  // --------------------------------------------------------------------------
  const openShipmentDetails = async (shipment: ExtendedShipment) => {
    try {
      const items = await dbService.query<ExtendedShipmentItem>(`
        SELECT 
          si.*,
          i.sku AS item_sku,
          i.name AS item_name,
          i.category AS item_category,
          i.unit_of_measure,
          b.batch_number,
          l.bin_code,
          l.zone AS bin_zone
        FROM shipment_items si
        LEFT JOIN items i ON si.item_id = i.id
        LEFT JOIN item_batches b ON si.batch_id = b.id
        LEFT JOIN warehouse_locations l ON si.bin_id = l.id
        WHERE si.shipment_id = ?
        ORDER BY si.created_at ASC;
      `, [shipment.id]);

      setSelectedShipmentDetail({
        ...shipment,
        items
      });
      setIsDetailModalOpen(true);
    } catch (err) {
      console.error('Failed to load shipment items:', err);
      showToast('error', 'Failed to load shipment items details.');
    }
  };

  // --------------------------------------------------------------------------
  // Stock Availability Lookup for a specific item, warehouse, bin, batch
  // --------------------------------------------------------------------------
  const getLiveStockAvailability = async (
    itemId: string,
    warehouseId: string,
    binId?: string,
    batchId?: string
  ): Promise<{ onHand: number; reserved: number; available: number; stockId?: string }> => {
    try {
      let sql = 'SELECT id, quantity_on_hand, quantity_reserved FROM inventory_stock WHERE item_id = ? AND warehouse_id = ?';
      const params: any[] = [itemId, warehouseId];

      if (binId) {
        sql += ' AND bin_id = ?';
        params.push(binId);
      }
      if (batchId) {
        sql += ' AND batch_id = ?';
        params.push(batchId);
      } else {
        sql += ' ORDER BY (quantity_on_hand - quantity_reserved) DESC LIMIT 1';
      }

      const rows = await dbService.query<InventoryStock>(sql, params);
      if (rows && rows.length > 0) {
        const onHand = Number(rows[0].quantity_on_hand || 0);
        const reserved = Number(rows[0].quantity_reserved || 0);
        const available = Math.max(0, onHand - reserved);
        return { onHand, reserved, available, stockId: rows[0].id };
      }
      return { onHand: 0, reserved: 0, available: 0 };
    } catch (err) {
      console.error('Failed to query stock availability:', err);
      return { onHand: 0, reserved: 0, available: 0 };
    }
  };

  // --------------------------------------------------------------------------
  // Open Create Shipment Wizard
  // --------------------------------------------------------------------------
  const openCreateShipmentWizard = async () => {
    const selectedWh = warehouses.find((w) => w.id === (activeWarehouseId || warehouseFilter !== 'all' ? warehouseFilter : warehouses[0]?.id)) || warehouses[0];
    const defaultWhId = selectedWh ? selectedWh.id : 'wh-central-dc';
    const defaultCourier = couriers.find((c) => c.is_active === 1) || couriers[0];

    const generatedShpNum = `SHP-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;
    const generatedOrderRef = `SO-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;

    setNewShipmentHeader({
      shipment_number: generatedShpNum,
      order_reference: generatedOrderRef,
      source_warehouse_id: defaultWhId,
      customer_name: '',
      customer_phone: '',
      customer_address: '',
      destination_city: 'Dhaka',
      destination_district: 'Dhaka',
      courier_id: defaultCourier ? defaultCourier.id : '',
      courier_name: defaultCourier ? defaultCourier.name : 'Standard Fleet Logistics',
      tracking_number: '',
      cod_amount: 0,
      shipping_fee: 60.0,
      notes: ''
    });

    // Populate initial line item if catalog available
    if (catalogItems.length > 0) {
      const firstItem = catalogItems[0];
      const matchingBin = warehouseBins.find((b) => b.warehouse_id === defaultWhId) || warehouseBins[0];
      const binId = matchingBin ? matchingBin.id : '';

      const stock = await getLiveStockAvailability(firstItem.id, defaultWhId, binId);

      setNewLineItems([
        {
          itemId: firstItem.id,
          sku: firstItem.sku,
          name: firstItem.name,
          unitOfMeasure: firstItem.unit_of_measure,
          binId,
          quantityOnHand: stock.onHand,
          quantityReserved: stock.reserved,
          availableStock: stock.available,
          quantity: stock.available > 0 ? 1 : 0,
          unitPrice: firstItem.selling_price || firstItem.cost_price || 10
        }
      ]);
    } else {
      setNewLineItems([]);
    }

    setWizardErrors({});
    setIsCreateModalOpen(true);
  };

  // --------------------------------------------------------------------------
  // Dynamic Line Item Change in Creation Wizard
  // --------------------------------------------------------------------------
  const handleLineItemChange = async (
    index: number,
    field: keyof NewShipmentLineItem,
    value: any
  ) => {
    const updated = [...newLineItems];
    const line = { ...updated[index] };

    if (field === 'itemId') {
      const selectedItem = catalogItems.find((c) => c.id === value);
      if (selectedItem) {
        line.itemId = selectedItem.id;
        line.sku = selectedItem.sku;
        line.name = selectedItem.name;
        line.unitOfMeasure = selectedItem.unit_of_measure;
        line.unitPrice = selectedItem.selling_price || selectedItem.cost_price || 10;

        const stock = await getLiveStockAvailability(
          selectedItem.id,
          newShipmentHeader.source_warehouse_id,
          line.binId
        );
        line.quantityOnHand = stock.onHand;
        line.quantityReserved = stock.reserved;
        line.availableStock = stock.available;
        if (line.quantity > stock.available) {
          line.quantity = Math.max(0, stock.available);
        }
      }
    } else if (field === 'binId') {
      line.binId = value;
      const stock = await getLiveStockAvailability(
        line.itemId,
        newShipmentHeader.source_warehouse_id,
        value
      );
      line.quantityOnHand = stock.onHand;
      line.quantityReserved = stock.reserved;
      line.availableStock = stock.available;
      if (line.quantity > stock.available) {
        line.quantity = Math.max(0, stock.available);
      }
    } else {
      (line as any)[field] = value;
    }

    updated[index] = line;
    setNewLineItems(updated);
  };

  const handleAddLineItem = async () => {
    if (catalogItems.length === 0) return;
    const firstItem = catalogItems[0];
    const matchingBin = warehouseBins.find((b) => b.warehouse_id === newShipmentHeader.source_warehouse_id) || warehouseBins[0];
    const binId = matchingBin ? matchingBin.id : '';

    const stock = await getLiveStockAvailability(
      firstItem.id,
      newShipmentHeader.source_warehouse_id,
      binId
    );

    setNewLineItems([
      ...newLineItems,
      {
        itemId: firstItem.id,
        sku: firstItem.sku,
        name: firstItem.name,
        unitOfMeasure: firstItem.unit_of_measure,
        binId,
        quantityOnHand: stock.onHand,
        quantityReserved: stock.reserved,
        availableStock: stock.available,
        quantity: stock.available > 0 ? 1 : 0,
        unitPrice: firstItem.selling_price || firstItem.cost_price || 10
      }
    ]);
  };

  const handleRemoveLineItem = (index: number) => {
    setNewLineItems(newLineItems.filter((_, i) => i !== index));
  };

  // Re-calculate totals
  const shipmentTotals = useMemo(() => {
    let subtotal = 0;
    let units = 0;
    for (const line of newLineItems) {
      subtotal += (line.quantity || 0) * (line.unitPrice || 0);
      units += Number(line.quantity || 0);
    }
    const fee = Number(newShipmentHeader.shipping_fee) || 0;
    const grandTotal = subtotal + fee;
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      units,
      shippingFee: fee,
      grandTotal: Math.round(grandTotal * 100) / 100
    };
  }, [newLineItems, newShipmentHeader.shipping_fee]);

  // Handle warehouse change in wizard (refreshes all line items stock)
  const handleWizardWarehouseChange = async (newWhId: string) => {
    setNewShipmentHeader((prev) => ({ ...prev, source_warehouse_id: newWhId }));
    const matchingBins = warehouseBins.filter((b) => b.warehouse_id === newWhId);
    const defaultBin = matchingBins[0] ? matchingBins[0].id : '';

    const updated = await Promise.all(
      newLineItems.map(async (line) => {
        const binId = matchingBins.some((b) => b.id === line.binId) ? line.binId : defaultBin;
        const stock = await getLiveStockAvailability(line.itemId, newWhId, binId);
        return {
          ...line,
          binId,
          quantityOnHand: stock.onHand,
          quantityReserved: stock.reserved,
          availableStock: stock.available,
          quantity: Math.min(line.quantity, stock.available)
        };
      })
    );
    setNewLineItems(updated);
  };

  // --------------------------------------------------------------------------
  // Submit Outbound Shipment Creation & Atomic Stock Reservation
  // --------------------------------------------------------------------------
  const handleCreateShipmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};

    if (!newShipmentHeader.shipment_number.trim()) {
      errors.shipment_number = 'Shipment Number is required.';
    }
    if (!newShipmentHeader.order_reference.trim()) {
      errors.order_reference = 'Order Reference is required.';
    }
    if (!newShipmentHeader.customer_name.trim()) {
      errors.customer_name = 'Customer full name is required.';
    }
    if (!newShipmentHeader.customer_phone.trim()) {
      errors.customer_phone = 'Customer phone number is required.';
    }
    if (!newShipmentHeader.customer_address.trim()) {
      errors.customer_address = 'Delivery address is required.';
    }
    if (!newShipmentHeader.destination_city.trim()) {
      errors.destination_city = 'Destination city is required.';
    }
    if (!newShipmentHeader.courier_name.trim()) {
      errors.courier_name = 'Carrier or courier must be selected.';
    }

    if (newLineItems.length === 0) {
      errors.items = 'At least one line item must be added.';
    } else {
      for (let i = 0; i < newLineItems.length; i++) {
        const line = newLineItems[i];
        if (!line.quantity || line.quantity <= 0) {
          errors[`item_${i}_qty`] = `Quantity for ${line.sku} must be at least 1.`;
        }
        if (line.quantity > line.availableStock) {
          errors[`item_${i}_qty`] = `Requested ${line.quantity} exceeds available stock (${line.availableStock}) for ${line.sku}.`;
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      setWizardErrors(errors);
      showToast('error', 'Please resolve highlighted form validation errors.');
      return;
    }

    setIsSubmittingShipment(true);
    try {
      const shipmentId = `shp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const selectedCourier = couriers.find((c) => c.name === newShipmentHeader.courier_name || c.id === newShipmentHeader.courier_id);

      await dbService.transaction(async () => {
        // 1. Double check and reserve stock for each item atomically
        for (const line of newLineItems) {
          let stockQuery = 'SELECT id, quantity_on_hand, quantity_reserved FROM inventory_stock WHERE item_id = ? AND warehouse_id = ? AND bin_id = ?';
          const stockParams: any[] = [line.itemId, newShipmentHeader.source_warehouse_id, line.binId];

          if (line.batchId) {
            stockQuery += ' AND batch_id = ?';
            stockParams.push(line.batchId);
          } else {
            stockQuery += ' ORDER BY quantity_on_hand DESC';
          }

          const currentStock = await dbService.query<InventoryStock>(stockQuery, stockParams);
          const current = currentStock[0];
          const available = (current?.quantity_on_hand || 0) - (current?.quantity_reserved || 0);

          if (!current || available < line.quantity) {
            throw new Error(`Insufficient inventory for SKU ${line.sku}. Requested ${line.quantity}, Available ${available}.`);
          }

          // Atomically reserve inventory
          await dbService.execute(
            'UPDATE inventory_stock SET quantity_reserved = quantity_reserved + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [line.quantity, current.id]
          );
        }

        // 2. Insert Shipment record
        await dbService.execute(
          `INSERT INTO shipments (
            id, shipment_number, order_reference, source_warehouse_id, customer_name, customer_phone,
            customer_address, destination_city, destination_district, courier_id, courier_name,
            tracking_number, status, declared_value, cod_amount, shipping_fee, notes, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, 'system')`,
          [
            shipmentId,
            newShipmentHeader.shipment_number.trim(),
            newShipmentHeader.order_reference.trim(),
            newShipmentHeader.source_warehouse_id,
            newShipmentHeader.customer_name.trim(),
            newShipmentHeader.customer_phone.trim(),
            newShipmentHeader.customer_address.trim(),
            newShipmentHeader.destination_city.trim(),
            newShipmentHeader.destination_district?.trim() || null,
            selectedCourier ? selectedCourier.id : null,
            newShipmentHeader.courier_name.trim(),
            newShipmentHeader.tracking_number?.trim() || null,
            shipmentTotals.subtotal,
            newShipmentHeader.cod_amount || shipmentTotals.grandTotal,
            shipmentTotals.shippingFee,
            newShipmentHeader.notes?.trim() || null
          ]
        );

        // 3. Insert Shipment Items
        for (const line of newLineItems) {
          const lineId = `shpi-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          await dbService.execute(
            `INSERT INTO shipment_items (
              id, shipment_id, item_id, batch_id, bin_id, quantity, unit_price, total_price
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              lineId,
              shipmentId,
              line.itemId,
              line.batchId || null,
              line.binId,
              line.quantity,
              line.unitPrice,
              line.quantity * line.unitPrice
            ]
          );
        }
      });

      showToast('success', `Shipment ${newShipmentHeader.shipment_number} created! Stock reserved.`);
      setIsCreateModalOpen(false);
      await loadLogisticsData();
    } catch (err: any) {
      console.error('Error creating outbound shipment:', err);
      showToast('error', err?.message || 'Failed to create shipment.');
    } finally {
      setIsSubmittingShipment(false);
    }
  };

  // --------------------------------------------------------------------------
  // Progress Shipment Lifecycle: Mark Packed
  // --------------------------------------------------------------------------
  const handleMarkPacked = async (shipmentId: string) => {
    try {
      await dbService.execute(
        "UPDATE shipments SET status = 'packed', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [shipmentId]
      );
      showToast('success', 'Shipment marked as Packed and staged for courier handover.');
      await loadLogisticsData();
      if (selectedShipmentDetail && selectedShipmentDetail.id === shipmentId) {
        setSelectedShipmentDetail((prev) => (prev ? { ...prev, status: 'packed' } : null));
      }
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to update status.');
    }
  };

  // --------------------------------------------------------------------------
  // Progress Shipment Lifecycle: Dispatch with Tracking & Stock Deduction
  // --------------------------------------------------------------------------
  const openDispatchModal = (shipment: ExtendedShipment) => {
    setDispatchTargetShipment(shipment);
    setDispatchTrackingInput(shipment.tracking_number || '');
    setIsDispatchModalOpen(true);
  };

  const handleConfirmDispatch = async () => {
    if (!dispatchTargetShipment) return;
    const trackingCode = dispatchTrackingInput.trim();

    if (!trackingCode) {
      showToast('error', 'Carrier Tracking Number is mandatory for outbound dispatch.');
      return;
    }

    try {
      // Fetch full line items if not loaded
      const items = await dbService.query<ExtendedShipmentItem>(
        'SELECT * FROM shipment_items WHERE shipment_id = ?',
        [dispatchTargetShipment.id]
      );

      await dbService.transaction(async () => {
        // Physical stock deduction for each item
        for (const line of items) {
          let stockQuery = 'SELECT id, quantity_on_hand, quantity_reserved FROM inventory_stock WHERE item_id = ? AND warehouse_id = ? AND bin_id = ?';
          const stockParams: any[] = [line.item_id, dispatchTargetShipment.source_warehouse_id, line.bin_id];
          if (line.batch_id) {
            stockQuery += ' AND batch_id = ?';
            stockParams.push(line.batch_id);
          } else {
            stockQuery += ' ORDER BY quantity_on_hand DESC';
          }

          const stockRows = await dbService.query<InventoryStock>(stockQuery, stockParams);
          const current = stockRows[0];
          if (!current || current.quantity_on_hand < line.quantity) {
            throw new Error(`Physical stock no longer available in assigned bin for item ${line.item_id}.`);
          }

          const balanceAfter = current.quantity_on_hand - line.quantity;
          const reservedAfter = Math.max(0, current.quantity_reserved - line.quantity);

          // Atomic deduction of on_hand and reservation
          await dbService.execute(
            'UPDATE inventory_stock SET quantity_on_hand = quantity_on_hand - ?, quantity_reserved = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [line.quantity, reservedAfter, current.id]
          );

          // Double-Entry Inventory Audit Ledger Log
          const auditId = `aud-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          await dbService.execute(
            `INSERT INTO inventory_transactions (
              id, transaction_type, reference_type, reference_id, item_id, warehouse_id, bin_id,
              batch_id, quantity_change, running_balance_after, notes
            ) VALUES (?, 'FULFILLMENT_PICK', 'SHIPMENT', ?, ?, ?, ?, ?, ?, ?, 'Outbound Shipment Dispatch')`,
            [
              auditId,
              dispatchTargetShipment.shipment_number,
              line.item_id,
              dispatchTargetShipment.source_warehouse_id,
              line.bin_id,
              line.batch_id,
              -line.quantity,
              balanceAfter
            ]
          );
        }

        // Update Shipment status and tracking code
        await dbService.execute(
          "UPDATE shipments SET status = 'dispatched', tracking_number = ?, dispatched_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          [trackingCode, dispatchTargetShipment.id]
        );
      });

      showToast('success', `Shipment ${dispatchTargetShipment.shipment_number} dispatched! Inventory deducted.`);
      setIsDispatchModalOpen(false);
      setDispatchTargetShipment(null);
      await loadLogisticsData();

      if (selectedShipmentDetail && selectedShipmentDetail.id === dispatchTargetShipment.id) {
        setSelectedShipmentDetail((prev) =>
          prev
            ? {
                ...prev,
                status: 'dispatched',
                tracking_number: trackingCode,
                dispatched_at: new Date().toISOString()
              }
            : null
        );
      }
    } catch (err: any) {
      console.error('Dispatch failed:', err);
      showToast('error', err?.message || 'Failed to dispatch shipment.');
    }
  };

  // --------------------------------------------------------------------------
  // Progress Shipment: In-Transit & Delivered
  // --------------------------------------------------------------------------
  const handleTransitionStatus = async (
    shipmentId: string,
    nextStatus: 'in_transit' | 'delivered'
  ) => {
    try {
      if (nextStatus === 'delivered') {
        await dbService.execute(
          "UPDATE shipments SET status = 'delivered', delivered_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          [shipmentId]
        );
        showToast('success', 'Shipment marked as Delivered! Fulfillment complete.');
      } else {
        await dbService.execute(
          'UPDATE shipments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [nextStatus, shipmentId]
        );
        showToast('info', `Shipment status progressed to ${nextStatus}.`);
      }

      await loadLogisticsData();
      if (selectedShipmentDetail && selectedShipmentDetail.id === shipmentId) {
        setSelectedShipmentDetail((prev) =>
          prev
            ? {
                ...prev,
                status: nextStatus,
                delivered_at: nextStatus === 'delivered' ? new Date().toISOString() : prev.delivered_at
              }
            : null
        );
      }
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to transition shipment status.');
    }
  };

  // --------------------------------------------------------------------------
  // Initiate Return-to-Origin (RTO)
  // --------------------------------------------------------------------------
  const handleInitiateRTO = async (shipmentId: string) => {
    const reason = window.prompt(
      'Enter reason for initiating Return-to-Origin (RTO):',
      'Customer Refused / Delivery Address Inaccessible'
    );
    if (!reason) return;

    try {
      await dbService.execute(
        "UPDATE shipments SET status = 'return_to_origin', rto_initiated_at = CURRENT_TIMESTAMP, rto_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [reason, shipmentId]
      );
      showToast('warning', 'Shipment transitioned to Return-to-Origin (RTO).');
      await loadLogisticsData();
      if (selectedShipmentDetail && selectedShipmentDetail.id === shipmentId) {
        setSelectedShipmentDetail((prev) =>
          prev
            ? {
                ...prev,
                status: 'return_to_origin',
                rto_initiated_at: new Date().toISOString(),
                rto_reason: reason
              }
            : null
        );
      }
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to initiate RTO.');
    }
  };

  // --------------------------------------------------------------------------
  // RTO Intake Processing: Restock vs Damaged Write-off
  // --------------------------------------------------------------------------
  const openRTOModal = (shipment: ExtendedShipment) => {
    setRTOTargetShipment(shipment);
    setRtoInspectionNotes(shipment.rto_reason || 'Package returned unopened. Quality inspection verified.');
    setRtoDisposition('restocked');

    // Default bin in source warehouse
    const defaultBin = warehouseBins.find((b) => b.warehouse_id === shipment.source_warehouse_id);
    setRtoTargetBinId(defaultBin ? defaultBin.id : '');
    setIsRTOModalOpen(true);
  };

  const handleProcessRTOSubmit = async () => {
    if (!rtoTargetShipment) return;

    try {
      const items = await dbService.query<ExtendedShipmentItem>(
        'SELECT * FROM shipment_items WHERE shipment_id = ?',
        [rtoTargetShipment.id]
      );

      await dbService.transaction(async () => {
        if (rtoDisposition === 'restocked') {
          // Restock pristine goods back into target warehouse bin
          for (const line of items) {
            const destBin = rtoTargetBinId || line.bin_id;

            const stock = await dbService.query<InventoryStock>(
              'SELECT id, quantity_on_hand FROM inventory_stock WHERE item_id = ? AND warehouse_id = ? AND bin_id = ? AND (batch_id = ? OR (batch_id IS NULL AND ? IS NULL))',
              [line.item_id, rtoTargetShipment.source_warehouse_id, destBin, line.batch_id, line.batch_id]
            );

            let balanceAfter = line.quantity;
            if (stock && stock.length > 0) {
              balanceAfter = Number(stock[0].quantity_on_hand) + Number(line.quantity);
              await dbService.execute(
                'UPDATE inventory_stock SET quantity_on_hand = quantity_on_hand + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [line.quantity, stock[0].id]
              );
            } else {
              const newStockId = `stk-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
              await dbService.execute(
                `INSERT INTO inventory_stock (
                  id, item_id, warehouse_id, bin_id, batch_id, quantity_on_hand, quantity_reserved
                ) VALUES (?, ?, ?, ?, ?, ?, 0)`,
                [newStockId, line.item_id, rtoTargetShipment.source_warehouse_id, destBin, line.batch_id, line.quantity]
              );
            }

            // Ledger log
            const auditId = `aud-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
            await dbService.execute(
              `INSERT INTO inventory_transactions (
                id, transaction_type, reference_type, reference_id, item_id, warehouse_id, bin_id,
                batch_id, quantity_change, running_balance_after, notes
              ) VALUES (?, 'RETURN_RESTOCK', 'SHIPMENT', ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                auditId,
                rtoTargetShipment.shipment_number,
                line.item_id,
                rtoTargetShipment.source_warehouse_id,
                destBin,
                line.batch_id,
                line.quantity,
                balanceAfter,
                `RTO Restocked Into Bin: ${rtoInspectionNotes.substring(0, 60)}`
              ]
            );
          }
        } else {
          // Damaged write-off disposal
          for (const line of items) {
            const auditId = `aud-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
            await dbService.execute(
              `INSERT INTO inventory_transactions (
                id, transaction_type, reference_type, reference_id, item_id, warehouse_id, bin_id,
                batch_id, quantity_change, running_balance_after, notes
              ) VALUES (?, 'ADJUSTMENT_WRITE_OFF', 'SHIPMENT', ?, ?, ?, ?, ?, 0, 0, ?)`,
              [
                auditId,
                rtoTargetShipment.shipment_number,
                line.item_id,
                rtoTargetShipment.source_warehouse_id,
                line.bin_id,
                line.batch_id,
                `RTO Damaged Write-Off Scrap: ${rtoInspectionNotes.substring(0, 60)}`
              ]
            );
          }
        }

        // Finalize shipment status to rto_received with disposition
        await dbService.execute(
          `UPDATE shipments 
           SET status = 'rto_received', 
               rto_received_at = CURRENT_TIMESTAMP, 
               rto_disposition = ?, 
               notes = COALESCE(notes || char(10), '') || ?, 
               updated_at = CURRENT_TIMESTAMP 
           WHERE id = ?`,
          [rtoDisposition, `RTO Intake [${rtoDisposition}]: ${rtoInspectionNotes}`, rtoTargetShipment.id]
        );
      });

      showToast('success', `RTO intake completed (${rtoDisposition === 'restocked' ? 'Restocked into Bin' : 'Scrap Write-off'}).`);
      setIsRTOModalOpen(false);
      setRTOTargetShipment(null);
      await loadLogisticsData();

      if (selectedShipmentDetail && selectedShipmentDetail.id === rtoTargetShipment.id) {
        setIsDetailModalOpen(false);
      }
    } catch (err: any) {
      console.error('RTO processing failed:', err);
      showToast('error', err?.message || 'Failed to process RTO intake.');
    }
  };

  // --------------------------------------------------------------------------
  // Courier Directory Management
  // --------------------------------------------------------------------------
  const openAddCourierModal = () => {
    setEditingCourier(null);
    setCourierForm({
      name: '',
      service_type: 'Standard',
      contact_phone: '',
      tracking_url_template: 'https://track.carrier.com?id={tracking_number}',
      is_active: 1
    });
    setIsCourierModalOpen(true);
  };

  const openEditCourierModal = (c: Courier) => {
    setEditingCourier(c);
    setCourierForm({
      name: c.name,
      service_type: c.service_type,
      contact_phone: c.contact_phone,
      tracking_url_template: c.tracking_url_template || '',
      is_active: c.is_active
    });
    setIsCourierModalOpen(true);
  };

  const handleSaveCourier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courierForm.name.trim() || !courierForm.contact_phone.trim()) {
      showToast('error', 'Courier Name and Contact Phone are required.');
      return;
    }

    try {
      if (editingCourier) {
        await dbService.execute(
          'UPDATE couriers SET name = ?, service_type = ?, contact_phone = ?, tracking_url_template = ?, is_active = ? WHERE id = ?',
          [
            courierForm.name.trim(),
            courierForm.service_type,
            courierForm.contact_phone.trim(),
            courierForm.tracking_url_template.trim() || null,
            courierForm.is_active,
            editingCourier.id
          ]
        );
        showToast('success', `Courier ${courierForm.name} updated.`);
      } else {
        const id = `courier-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        await dbService.execute(
          'INSERT INTO couriers (id, name, service_type, contact_phone, tracking_url_template, is_active) VALUES (?, ?, ?, ?, ?, ?)',
          [
            id,
            courierForm.name.trim(),
            courierForm.service_type,
            courierForm.contact_phone.trim(),
            courierForm.tracking_url_template.trim() || null,
            courierForm.is_active
          ]
        );
        showToast('success', `Courier ${courierForm.name} registered.`);
      }

      setIsCourierModalOpen(false);
      await loadLogisticsData();
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to save courier.');
    }
  };

  const handleToggleCourierStatus = async (c: Courier) => {
    const nextActive = c.is_active === 1 ? 0 : 1;
    try {
      await dbService.execute('UPDATE couriers SET is_active = ? WHERE id = ?', [nextActive, c.id]);
      showToast('info', `Courier ${c.name} ${nextActive ? 'activated' : 'deactivated'}.`);
      await loadLogisticsData();
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to update courier status.');
    }
  };

  // Helper to build tracking URL
  const buildTrackingUrl = (courierName: string, trackingNumber?: string | null): string | null => {
    if (!trackingNumber) return null;
    const cour = couriers.find((c) => c.name.toLowerCase() === courierName.toLowerCase());
    if (cour && cour.tracking_url_template) {
      return cour.tracking_url_template.replace('{tracking_number}', encodeURIComponent(trackingNumber));
    }
    return null;
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <div className="flex flex-col gap-5 w-full select-none">
      {/* Toast Notification Banner */}
      {notification && (
        <div
          className="fixed top-14 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border animate-in fade-in slide-in-from-top-2 duration-200"
          style={{
            backgroundColor:
              notification.type === 'success'
                ? 'var(--emerald-bg)'
                : notification.type === 'error'
                ? 'var(--ruby-bg)'
                : notification.type === 'warning'
                ? 'var(--amber-bg)'
                : 'var(--cyan-bg)',
            color:
              notification.type === 'success'
                ? 'var(--emerald)'
                : notification.type === 'error'
                ? 'var(--ruby)'
                : notification.type === 'warning'
                ? 'var(--amber)'
                : 'var(--cyan)',
            borderColor:
              notification.type === 'success'
                ? 'var(--emerald-border)'
                : notification.type === 'error'
                ? 'var(--ruby-border)'
                : notification.type === 'warning'
                ? 'var(--amber-border)'
                : 'var(--cyan-border)'
          }}
        >
          {notification.type === 'success' && <CheckCircle2 size={18} />}
          {notification.type === 'error' && <XCircle size={18} />}
          {notification.type === 'info' && <AlertCircle size={18} />}
          {notification.type === 'warning' && <AlertTriangle size={18} />}
          <span className="text-xs font-semibold">{notification.text}</span>
          <button
            onClick={() => setNotification(null)}
            className="ml-2 hover:opacity-75 p-0.5"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* 1. Header Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b" style={{ borderColor: 'var(--border-color)' }}>
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-[var(--text-main)]">
              Fulfillment & Logistics Tracking
            </h1>
            <span className="badge badge-primary text-[0.7rem] font-bold uppercase">
              Milestone 4
            </span>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Outbound shipment generation, carrier tracking, dispatch stock deduction & Return-to-Origin (RTO) intake.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setStatusFilter(statusFilter === 'couriers' ? 'all' : 'couriers')}
            className={`btn text-xs ${statusFilter === 'couriers' ? 'btn-primary' : 'btn-secondary'}`}
            title="Manage Carrier & Courier Directory"
          >
            <Truck size={15} />
            <span>Couriers Directory ({couriers.length})</span>
          </button>

          <button
            onClick={openCreateShipmentWizard}
            className="btn btn-primary text-xs"
            title="Create and reserve new outbound customer delivery"
          >
            <Plus size={15} />
            <span>New Outbound Shipment</span>
          </button>

          <button
            onClick={loadLogisticsData}
            className="btn btn-secondary p-2"
            title="Refresh database records"
          >
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* 2. KPI Summary Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        {/* Metric 1: Total Active Shipments */}
        <div className="erp-card p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">
              Active Shipments
            </span>
            <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ backgroundColor: 'var(--accent-glow)', color: 'var(--accent-primary)' }}>
              <Package size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono tracking-tight text-[var(--text-main)]">
            {kpis.totalActiveShipments}
          </div>
          <span className="text-[11px] text-[var(--text-muted)] mt-1">
            Pending, Packed, or In-Transit
          </span>
        </div>

        {/* Metric 2: Dispatched / In-Transit */}
        <div className="erp-card p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">
              In-Transit En Route
            </span>
            <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ backgroundColor: 'var(--cyan-bg)', color: 'var(--cyan)' }}>
              <Compass size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono tracking-tight text-[var(--cyan)]">
            {kpis.dispatchedInTransit}
          </div>
          <span className="text-[11px] text-[var(--text-muted)] mt-1">
            Physical stock deducted
          </span>
        </div>

        {/* Metric 3: Delivered (Fulfilled) */}
        <div className="erp-card p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">
              Delivered Fulfilled
            </span>
            <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ backgroundColor: 'var(--emerald-bg)', color: 'var(--emerald)' }}>
              <CheckCircle2 size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono tracking-tight text-[var(--emerald)]">
            {kpis.deliveredFulfilled}
          </div>
          <span className="text-[11px] text-[var(--text-muted)] mt-1">
            Terminal state reached
          </span>
        </div>

        {/* Metric 4: RTO Pending Intake */}
        <div className="erp-card p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">
              RTO Exceptions
            </span>
            <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ backgroundColor: 'var(--ruby-bg)', color: 'var(--ruby)' }}>
              <RotateCcw size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono tracking-tight text-[var(--ruby)]">
            {kpis.rtoPendingIntake}
          </div>
          <span className="text-[11px] text-[var(--text-muted)] mt-1">
            Awaiting inspection intake
          </span>
        </div>

        {/* Metric 5: Active Couriers */}
        <div className="erp-card p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">
              Active Couriers
            </span>
            <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ backgroundColor: 'var(--accent-glow)', color: 'var(--accent-primary)' }}>
              <Truck size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono tracking-tight text-[var(--text-main)]">
            {kpis.activeCouriers}
          </div>
          <span className="text-[11px] text-[var(--text-muted)] mt-1">
            Carriers integrated
          </span>
        </div>
      </div>

      {/* 3. Navigation Tabs & Quick Status Bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
          {[
            { id: 'all', label: 'All Shipments', count: shipments.length },
            { id: 'pending', label: 'Pending / Staged', count: shipments.filter((s) => ['pending', 'packed'].includes(s.status)).length },
            { id: 'dispatched', label: 'Dispatched', count: shipments.filter((s) => s.status === 'dispatched').length },
            { id: 'in_transit', label: 'In-Transit', count: shipments.filter((s) => s.status === 'in_transit').length },
            { id: 'delivered', label: 'Delivered', count: shipments.filter((s) => s.status === 'delivered').length },
            { id: 'rto', label: 'RTO Exceptions', count: shipments.filter((s) => ['return_to_origin', 'rto_received', 'rto_delivered'].includes(s.status)).length },
            { id: 'couriers', label: 'Couriers Directory', count: couriers.length }
          ].map((tab) => {
            const isActive = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-[var(--accent-primary)] text-white shadow-sm'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)]'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className="px-1.5 py-0.2 rounded-full text-[10px] font-bold"
                  style={{
                    backgroundColor: isActive ? 'rgba(255,255,255,0.22)' : 'var(--bg-tertiary)',
                    color: isActive ? '#FFFFFF' : 'var(--text-main)'
                  }}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Search and Filter Bar (shown when not in couriers tab) */}
      {statusFilter !== 'couriers' && (
        <div className="erp-card p-3 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative flex-1 w-full">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-dim)]"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Shipment #, Order Ref, Customer Name, Phone, Tracking Code, City..."
              className="input-field pl-9 pr-8 text-xs w-full"
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

          <div className="flex items-center gap-2.5 w-full md:w-auto">
            {/* Warehouse Filter */}
            <div className="flex items-center gap-1.5 min-w-[170px]">
              <Building2 size={15} className="text-[var(--text-dim)] flex-shrink-0" />
              <select
                value={warehouseFilter}
                onChange={(e) => setWarehouseFilter(e.target.value)}
                className="input-field text-xs py-1.5"
              >
                <option value="all">All Facilities</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.warehouse_code})
                  </option>
                ))}
              </select>
            </div>

            {/* Courier Filter */}
            <div className="flex items-center gap-1.5 min-w-[160px]">
              <Truck size={15} className="text-[var(--text-dim)] flex-shrink-0" />
              <select
                value={courierFilter}
                onChange={(e) => setCourierFilter(e.target.value)}
                className="input-field text-xs py-1.5"
              >
                <option value="all">All Couriers</option>
                {couriers.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* 5. Main Content: Shipments Table OR Courier Directory */}
      {statusFilter === 'couriers' ? (
        // Courier Directory Manager View
        <div className="erp-card overflow-hidden">
          <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-color)' }}>
            <div>
              <h2 className="text-sm font-bold text-[var(--text-main)]">
                Courier & Carrier Directory
              </h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Configured outbound delivery partners, service tiers, contact phone numbers, and online tracking templates.
              </p>
            </div>
            <button
              onClick={openAddCourierModal}
              className="btn btn-primary text-xs"
            >
              <Plus size={14} />
              <span>Add Carrier Partner</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Carrier Name</th>
                  <th>Service Tier</th>
                  <th>Contact Phone</th>
                  <th>Tracking URL Template</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {couriers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-xs text-[var(--text-dim)]">
                      No courier partners registered. Click "Add Carrier Partner" to configure one.
                    </td>
                  </tr>
                ) : (
                  couriers.map((c) => (
                    <tr key={c.id} className="hover:bg-[var(--bg-hover)] transition-colors">
                      <td className="font-semibold text-xs text-[var(--text-main)]">
                        <div className="flex items-center gap-2">
                          <Truck size={16} className="text-[var(--accent-primary)] flex-shrink-0" />
                          <span>{c.name}</span>
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-info text-[0.72rem] font-semibold">
                          {c.service_type || 'Standard'}
                        </span>
                      </td>
                      <td className="font-mono text-xs text-[var(--text-muted)]">
                        {c.contact_phone}
                      </td>
                      <td className="text-xs text-[var(--text-dim)] font-mono max-w-xs truncate">
                        {c.tracking_url_template ? (
                          <span title={c.tracking_url_template}>{c.tracking_url_template}</span>
                        ) : (
                          <span className="italic text-[var(--text-dim)]">None (Manual)</span>
                        )}
                      </td>
                      <td>
                        <button
                          onClick={() => handleToggleCourierStatus(c)}
                          className={`badge text-[0.7rem] font-bold uppercase transition-transform hover:scale-105 ${
                            c.is_active === 1 ? 'badge-success' : 'badge-danger'
                          }`}
                          title="Click to toggle active status"
                        >
                          {c.is_active === 1 ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openEditCourierModal(c)}
                            className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-main)]"
                            title="Edit Courier"
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
      ) : (
        // Shipments Management Table
        <div className="erp-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Shipment #</th>
                  <th>Order Ref</th>
                  <th>Customer & Destination</th>
                  <th>Facility</th>
                  <th>Carrier & Tracking</th>
                  <th>Status</th>
                  <th>Items & Units</th>
                  <th>Financials (COD)</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredShipments.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-xs text-[var(--text-dim)]">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Package size={28} className="text-[var(--text-dim)] opacity-40" />
                        <span>No shipments found matching the selected filter criteria.</span>
                        <button
                          onClick={openCreateShipmentWizard}
                          className="btn btn-secondary text-xs mt-2"
                        >
                          <Plus size={13} />
                          <span>Create Outbound Shipment</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredShipments.map((shp) => {
                    const trackingLink = buildTrackingUrl(shp.courier_name, shp.tracking_number);

                    return (
                      <tr key={shp.id} className="hover:bg-[var(--bg-hover)] transition-colors">
                        {/* Shipment # */}
                        <td>
                          <button
                            onClick={() => openShipmentDetails(shp)}
                            className="chip-mono font-bold hover:underline text-[var(--accent-primary)] text-left"
                            title="Click to view tracking timeline & details"
                          >
                            {shp.shipment_number}
                          </button>
                        </td>

                        {/* Order Ref */}
                        <td>
                          <span className="chip-mono text-xs">{shp.order_reference}</span>
                        </td>

                        {/* Customer & Destination */}
                        <td>
                          <div className="flex flex-col">
                            <span className="font-semibold text-xs text-[var(--text-main)]">
                              {shp.customer_name}
                            </span>
                            <div className="flex items-center gap-1 text-[11px] text-[var(--text-dim)] mt-0.5">
                              <MapPin size={11} className="flex-shrink-0" />
                              <span className="truncate max-w-[140px]" title={`${shp.customer_address}, ${shp.destination_city}`}>
                                {shp.destination_city}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Facility */}
                        <td>
                          <div className="flex flex-col">
                            <span className="text-xs text-[var(--text-main)] font-medium">
                              {shp.source_warehouse_code || 'Central'}
                            </span>
                            <span className="text-[10px] text-[var(--text-dim)] truncate max-w-[120px]">
                              {shp.source_warehouse_name}
                            </span>
                          </div>
                        </td>

                        {/* Carrier & Tracking */}
                        <td>
                          <div className="flex flex-col">
                            <span className="text-xs font-semibold text-[var(--text-main)]">
                              {shp.courier_name}
                            </span>
                            {shp.tracking_number ? (
                              <div className="flex items-center gap-1 mt-0.5">
                                <span className="chip-mono text-[10px]">{shp.tracking_number}</span>
                                {trackingLink && (
                                  <a
                                    href={trackingLink}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[var(--accent-primary)] hover:opacity-80 p-0.5"
                                    title="Open courier tracking portal"
                                  >
                                    <ExternalLink size={11} />
                                  </a>
                                )}
                              </div>
                            ) : (
                              <span className="text-[10px] text-[var(--text-dim)] italic">
                                Pending Dispatch
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Status Badge */}
                        <td>
                          <ShipmentStatusBadge status={shp.status} disposition={shp.rto_disposition} />
                        </td>

                        {/* Items & Units */}
                        <td>
                          <div className="flex items-center gap-1 text-xs">
                            <Boxes size={13} className="text-[var(--text-dim)]" />
                            <span className="font-mono font-medium">
                              {shp.items_count || 1} lines ({shp.total_units || 0} pcs)
                            </span>
                          </div>
                        </td>

                        {/* Financials / COD */}
                        <td>
                          <div className="flex flex-col">
                            <span className="font-mono text-xs font-bold text-[var(--text-main)]">
                              ${Number(shp.declared_value || 0).toFixed(2)}
                            </span>
                            {Number(shp.cod_amount) > 0 && (
                              <span className="text-[10px] text-[var(--amber)] font-medium">
                                COD: ${Number(shp.cod_amount).toFixed(2)}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Row Actions */}
                        <td className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Details Button */}
                            <button
                              onClick={() => openShipmentDetails(shp)}
                              className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--accent-primary)] transition-colors"
                              title="View Tracking Stepper & Shipment Details"
                            >
                              <Eye size={15} />
                            </button>

                            {/* Quick Dispatch Action (if pending or packed) */}
                            {['pending', 'packed'].includes(shp.status) && (
                              <button
                                onClick={() => openDispatchModal(shp)}
                                className="p-1.5 rounded hover:bg-[var(--accent-glow)] text-[var(--accent-primary)] transition-colors"
                                title="Dispatch Shipment with Carrier Tracking"
                              >
                                <Send size={15} />
                              </button>
                            )}

                            {/* Quick RTO Intake Action (if return_to_origin) */}
                            {shp.status === 'return_to_origin' && (
                              <button
                                onClick={() => openRTOModal(shp)}
                                className="p-1.5 rounded hover:bg-[var(--ruby-bg)] text-[var(--ruby)] transition-colors"
                                title="Process RTO Intake (Restock / Scrap)"
                              >
                                <RotateCcw size={15} />
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

      {/* ======================================================================
          MODAL 1: NEW OUTBOUND SHIPMENT WIZARD (WITH LIVE STOCK VALIDATION)
          ====================================================================== */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div
            className="erp-card w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl"
            style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
          >
            {/* Modal Header */}
            <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-color)' }}>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--accent-glow)] text-[var(--accent-primary)]">
                  <Package size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-main)]">
                    Create Outbound Shipment & Reserve Stock
                  </h3>
                  <p className="text-[11px] text-[var(--text-dim)]">
                    Generates customer delivery, validates live warehouse stock, and atomically reserves inventory.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)]"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleCreateShipmentSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* SECTION 1: Logistics & Customer Header */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-dim)] mb-2.5 flex items-center gap-1.5">
                  <MapPin size={13} />
                  <span>1. Delivery Destination & Customer Profile</span>
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Shipment Number */}
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-dim)] mb-1">
                      Shipment # *
                    </label>
                    <input
                      type="text"
                      value={newShipmentHeader.shipment_number}
                      onChange={(e) =>
                        setNewShipmentHeader((prev) => ({ ...prev, shipment_number: e.target.value }))
                      }
                      className="input-field font-mono text-xs"
                      required
                    />
                    {wizardErrors.shipment_number && (
                      <span className="text-[10px] text-[var(--ruby)] font-medium mt-0.5 block">
                        {wizardErrors.shipment_number}
                      </span>
                    )}
                  </div>

                  {/* Order Reference */}
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-dim)] mb-1">
                      Order Reference (SO #) *
                    </label>
                    <input
                      type="text"
                      value={newShipmentHeader.order_reference}
                      onChange={(e) =>
                        setNewShipmentHeader((prev) => ({ ...prev, order_reference: e.target.value }))
                      }
                      className="input-field font-mono text-xs"
                      required
                    />
                    {wizardErrors.order_reference && (
                      <span className="text-[10px] text-[var(--ruby)] font-medium mt-0.5 block">
                        {wizardErrors.order_reference}
                      </span>
                    )}
                  </div>

                  {/* Origin Warehouse Selector */}
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-dim)] mb-1">
                      Origin Warehouse *
                    </label>
                    <select
                      value={newShipmentHeader.source_warehouse_id}
                      onChange={(e) => handleWizardWarehouseChange(e.target.value)}
                      className="input-field text-xs"
                      required
                    >
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} ({w.warehouse_code})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Customer Full Name */}
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-dim)] mb-1">
                      Customer Full Name *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Rahim Garments Ltd"
                      value={newShipmentHeader.customer_name}
                      onChange={(e) =>
                        setNewShipmentHeader((prev) => ({ ...prev, customer_name: e.target.value }))
                      }
                      className="input-field text-xs"
                      required
                    />
                    {wizardErrors.customer_name && (
                      <span className="text-[10px] text-[var(--ruby)] font-medium mt-0.5 block">
                        {wizardErrors.customer_name}
                      </span>
                    )}
                  </div>

                  {/* Customer Phone */}
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-dim)] mb-1">
                      Contact Phone *
                    </label>
                    <input
                      type="text"
                      placeholder="+880 1819-..."
                      value={newShipmentHeader.customer_phone}
                      onChange={(e) =>
                        setNewShipmentHeader((prev) => ({ ...prev, customer_phone: e.target.value }))
                      }
                      className="input-field text-xs font-mono"
                      required
                    />
                    {wizardErrors.customer_phone && (
                      <span className="text-[10px] text-[var(--ruby)] font-medium mt-0.5 block">
                        {wizardErrors.customer_phone}
                      </span>
                    )}
                  </div>

                  {/* Destination City */}
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-dim)] mb-1">
                      Destination City *
                    </label>
                    <input
                      type="text"
                      placeholder="Dhaka, Chittagong, Sylhet..."
                      value={newShipmentHeader.destination_city}
                      onChange={(e) =>
                        setNewShipmentHeader((prev) => ({ ...prev, destination_city: e.target.value }))
                      }
                      className="input-field text-xs"
                      required
                    />
                  </div>

                  {/* Delivery Address */}
                  <div className="md:col-span-3">
                    <label className="block text-[11px] font-semibold text-[var(--text-dim)] mb-1">
                      Full Delivery Address *
                    </label>
                    <input
                      type="text"
                      placeholder="Street, Building, Sector, Zone..."
                      value={newShipmentHeader.customer_address}
                      onChange={(e) =>
                        setNewShipmentHeader((prev) => ({ ...prev, customer_address: e.target.value }))
                      }
                      className="input-field text-xs"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 2: Line Items Picker with Live Stock Validation */}
              <div className="pt-2 border-t" style={{ borderColor: 'var(--border-color)' }}>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-dim)] flex items-center gap-1.5">
                    <Boxes size={13} />
                    <span>2. Line Items & Live Inventory Stock Validation</span>
                  </h4>
                  <button
                    type="button"
                    onClick={handleAddLineItem}
                    className="btn btn-secondary text-xs py-1"
                  >
                    <Plus size={13} />
                    <span>Add Item</span>
                  </button>
                </div>

                {wizardErrors.items && (
                  <div className="p-2 mb-2 rounded bg-[var(--ruby-bg)] text-[var(--ruby)] text-xs font-medium border border-[var(--ruby-border)]">
                    {wizardErrors.items}
                  </div>
                )}

                <div className="space-y-2.5">
                  {newLineItems.map((line, idx) => {
                    const lineError = wizardErrors[`item_${idx}_qty`];
                    const isOutOfStock = line.availableStock <= 0;

                    return (
                      <div
                        key={idx}
                        className="erp-card p-3 flex flex-col md:flex-row items-center gap-3 transition-colors"
                        style={{
                          backgroundColor: isOutOfStock ? 'rgba(239, 68, 68, 0.04)' : 'var(--bg-primary)',
                          borderColor: lineError ? 'var(--ruby-border)' : 'var(--border-color)'
                        }}
                      >
                        {/* Item Selector */}
                        <div className="flex-1 w-full">
                          <label className="block text-[10px] font-semibold text-[var(--text-dim)] mb-1">
                            SKU / Item
                          </label>
                          <select
                            value={line.itemId}
                            onChange={(e) => handleLineItemChange(idx, 'itemId', e.target.value)}
                            className="input-field text-xs"
                          >
                            {catalogItems.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.sku} — {c.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Bin Location Selector */}
                        <div className="w-full md:w-44">
                          <label className="block text-[10px] font-semibold text-[var(--text-dim)] mb-1">
                            Warehouse Bin
                          </label>
                          <select
                            value={line.binId}
                            onChange={(e) => handleLineItemChange(idx, 'binId', e.target.value)}
                            className="input-field text-xs font-mono"
                          >
                            {warehouseBins
                              .filter((b) => b.warehouse_id === newShipmentHeader.source_warehouse_id)
                              .map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.bin_code}
                                </option>
                              ))}
                          </select>
                        </div>

                        {/* Live Available Stock Indicator */}
                        <div className="w-full md:w-32 flex flex-col">
                          <span className="text-[10px] font-semibold text-[var(--text-dim)] mb-1">
                            Stock Status
                          </span>
                          <span
                            className={`badge text-[11px] font-bold ${
                              line.availableStock > 0 ? 'badge-success' : 'badge-danger'
                            }`}
                            title={`On Hand: ${line.quantityOnHand}, Reserved: ${line.quantityReserved}`}
                          >
                            {line.availableStock > 0
                              ? `Avail: ${line.availableStock} ${line.unitOfMeasure || 'pcs'}`
                              : 'Out of Stock'}
                          </span>
                        </div>

                        {/* Quantity Input */}
                        <div className="w-full md:w-24">
                          <label className="block text-[10px] font-semibold text-[var(--text-dim)] mb-1">
                            Quantity *
                          </label>
                          <input
                            type="number"
                            min="1"
                            max={line.availableStock}
                            value={line.quantity}
                            onChange={(e) =>
                              handleLineItemChange(idx, 'quantity', Number(e.target.value))
                            }
                            className={`input-field font-mono text-xs ${
                              lineError ? 'border-[var(--ruby)] text-[var(--ruby)] font-bold' : ''
                            }`}
                            required
                          />
                        </div>

                        {/* Unit Price */}
                        <div className="w-full md:w-28">
                          <label className="block text-[10px] font-semibold text-[var(--text-dim)] mb-1">
                            Unit Price ($)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={line.unitPrice}
                            onChange={(e) =>
                              handleLineItemChange(idx, 'unitPrice', Number(e.target.value))
                            }
                            className="input-field font-mono text-xs"
                          />
                        </div>

                        {/* Line Total */}
                        <div className="w-full md:w-28 text-right flex flex-col justify-end">
                          <span className="text-[10px] text-[var(--text-dim)]">Subtotal</span>
                          <span className="font-mono text-xs font-bold text-[var(--text-main)]">
                            ${(line.quantity * line.unitPrice).toFixed(2)}
                          </span>
                        </div>

                        {/* Delete Button */}
                        <div className="flex items-end">
                          <button
                            type="button"
                            onClick={() => handleRemoveLineItem(idx)}
                            className="p-1.5 rounded hover:bg-[var(--ruby-bg)] text-[var(--text-dim)] hover:text-[var(--ruby)]"
                            title="Remove line item"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* SECTION 3: Courier Selection & Financials */}
              <div className="pt-2 border-t" style={{ borderColor: 'var(--border-color)' }}>
                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-dim)] mb-2.5 flex items-center gap-1.5">
                  <Truck size={13} />
                  <span>3. Courier & Financial Breakdown</span>
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  {/* Courier Selection */}
                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-semibold text-[var(--text-dim)] mb-1">
                      Carrier Partner *
                    </label>
                    <select
                      value={newShipmentHeader.courier_name}
                      onChange={(e) => {
                        const selected = couriers.find((c) => c.name === e.target.value);
                        setNewShipmentHeader((prev) => ({
                          ...prev,
                          courier_name: e.target.value,
                          courier_id: selected ? selected.id : ''
                        }));
                      }}
                      className="input-field text-xs"
                      required
                    >
                      {couriers
                        .filter((c) => c.is_active === 1)
                        .map((c) => (
                          <option key={c.id} value={c.name}>
                            {c.name} ({c.service_type})
                          </option>
                        ))}
                    </select>
                  </div>

                  {/* Initial Tracking Number */}
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-dim)] mb-1">
                      Tracking # (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. PTH-998822"
                      value={newShipmentHeader.tracking_number}
                      onChange={(e) =>
                        setNewShipmentHeader((prev) => ({ ...prev, tracking_number: e.target.value }))
                      }
                      className="input-field text-xs font-mono"
                    />
                  </div>

                  {/* Shipping Fee */}
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-dim)] mb-1">
                      Shipping Fee ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={newShipmentHeader.shipping_fee}
                      onChange={(e) =>
                        setNewShipmentHeader((prev) => ({
                          ...prev,
                          shipping_fee: Number(e.target.value)
                        }))
                      }
                      className="input-field text-xs font-mono"
                    />
                  </div>

                  {/* COD Amount */}
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-dim)] mb-1">
                      COD Collection ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={newShipmentHeader.cod_amount || shipmentTotals.grandTotal}
                      onChange={(e) =>
                        setNewShipmentHeader((prev) => ({
                          ...prev,
                          cod_amount: Number(e.target.value)
                        }))
                      }
                      className="input-field text-xs font-mono"
                    />
                  </div>

                  {/* Notes */}
                  <div className="md:col-span-3">
                    <label className="block text-[11px] font-semibold text-[var(--text-dim)] mb-1">
                      Delivery Instructions & Notes
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Fragile contents; call customer prior to gate drop-off"
                      value={newShipmentHeader.notes}
                      onChange={(e) =>
                        setNewShipmentHeader((prev) => ({ ...prev, notes: e.target.value }))
                      }
                      className="input-field text-xs"
                    />
                  </div>
                </div>

                {/* Summary Banner */}
                <div
                  className="mt-4 p-3.5 rounded-lg flex items-center justify-between flex-wrap gap-3"
                  style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}
                >
                  <div className="flex items-center gap-4 text-xs">
                    <div>
                      <span className="text-[var(--text-dim)]">Lines: </span>
                      <span className="font-bold font-mono">{newLineItems.length}</span>
                    </div>
                    <div>
                      <span className="text-[var(--text-dim)]">Total Units: </span>
                      <span className="font-bold font-mono">{shipmentTotals.units} pcs</span>
                    </div>
                    <div>
                      <span className="text-[var(--text-dim)]">Declared Value: </span>
                      <span className="font-bold font-mono">${shipmentTotals.subtotal.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-xs text-[var(--text-dim)] mr-2">Grand Total (with Fee):</span>
                    <span className="text-base font-bold font-mono text-[var(--accent-primary)]">
                      ${shipmentTotals.grandTotal.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Form Actions */}
              <div className="pt-3 border-t flex items-center justify-end gap-2.5" style={{ borderColor: 'var(--border-color)' }}>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="btn btn-secondary text-xs"
                  disabled={isSubmittingShipment}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="btn btn-primary text-xs"
                  disabled={isSubmittingShipment}
                >
                  {isSubmittingShipment ? (
                    <>
                      <RefreshCw size={13} className="animate-spin" />
                      <span>Reserving Stock...</span>
                    </>
                  ) : (
                    <>
                      <Check size={13} />
                      <span>Save Shipment & Reserve Stock</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================================
          MODAL 2: SHIPMENT DETAIL & TRACKING STEPPER MODAL
          ====================================================================== */}
      {isDetailModalOpen && selectedShipmentDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div
            className="erp-card w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl"
            style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
          >
            {/* Header */}
            <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-color)' }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--accent-glow)] text-[var(--accent-primary)]">
                  <Truck size={18} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-[var(--text-main)] font-mono">
                      {selectedShipmentDetail.shipment_number}
                    </h3>
                    <ShipmentStatusBadge
                      status={selectedShipmentDetail.status}
                      disposition={selectedShipmentDetail.rto_disposition}
                    />
                  </div>
                  <span className="text-[11px] text-[var(--text-dim)]">
                    Ref: {selectedShipmentDetail.order_reference} • Created {new Date(selectedShipmentDetail.created_at).toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPrintModalState({
                      isOpen: true,
                      type: 'delivery_waybill',
                      data: selectedShipmentDetail
                    });
                  }}
                  className="px-3 py-1 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] hover:bg-[var(--bg-hover)] text-xs font-semibold flex items-center gap-1.5 text-[var(--text-main)]"
                >
                  <Printer size={13} />
                  <span>Print Waybill</span>
                </button>
                <button
                  onClick={() => setIsDetailModalOpen(false)}
                  className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)]"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Stepper Timeline & Details */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {/* VISUAL TRACKING STEPPER */}
              <div>
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-dim)] mb-3">
                  Shipment Tracking Lifecycle Stepper
                </h4>

                <div
                  className="p-4 rounded-xl border flex items-center justify-between overflow-x-auto gap-2"
                  style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}
                >
                  {/* Step 1: Pending */}
                  <div className="flex flex-col items-center text-center flex-1 min-w-[90px]">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                        ['pending', 'packed', 'dispatched', 'in_transit', 'delivered', 'return_to_origin', 'rto_received'].includes(
                          selectedShipmentDetail.status
                        )
                          ? 'bg-[var(--emerald)] text-white'
                          : 'bg-[var(--bg-tertiary)] text-[var(--text-dim)]'
                      }`}
                    >
                      <Check size={14} />
                    </div>
                    <span className="text-[11px] font-bold mt-1 text-[var(--text-main)]">1. Created</span>
                    <span className="text-[9px] text-[var(--text-dim)]">Stock Reserved</span>
                  </div>

                  <div className="h-0.5 w-6 bg-[var(--border-color)] flex-shrink-0" />

                  {/* Step 2: Packed */}
                  <div className="flex flex-col items-center text-center flex-1 min-w-[90px]">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                        ['packed', 'dispatched', 'in_transit', 'delivered', 'return_to_origin', 'rto_received'].includes(
                          selectedShipmentDetail.status
                        )
                          ? 'bg-[var(--emerald)] text-white'
                          : selectedShipmentDetail.status === 'pending'
                          ? 'bg-[var(--accent-primary)] text-white ring-4 ring-[var(--accent-glow)]'
                          : 'bg-[var(--bg-tertiary)] text-[var(--text-dim)]'
                      }`}
                    >
                      {['packed', 'dispatched', 'in_transit', 'delivered', 'return_to_origin', 'rto_received'].includes(
                        selectedShipmentDetail.status
                      ) ? (
                        <Check size={14} />
                      ) : (
                        '2'
                      )}
                    </div>
                    <span className="text-[11px] font-bold mt-1 text-[var(--text-main)]">2. Packed</span>
                    <span className="text-[9px] text-[var(--text-dim)]">Staged in DC</span>
                  </div>

                  <div className="h-0.5 w-6 bg-[var(--border-color)] flex-shrink-0" />

                  {/* Step 3: Dispatched */}
                  <div className="flex flex-col items-center text-center flex-1 min-w-[90px]">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                        ['dispatched', 'in_transit', 'delivered', 'return_to_origin', 'rto_received'].includes(
                          selectedShipmentDetail.status
                        )
                          ? 'bg-[var(--emerald)] text-white'
                          : selectedShipmentDetail.status === 'packed'
                          ? 'bg-[var(--accent-primary)] text-white ring-4 ring-[var(--accent-glow)]'
                          : 'bg-[var(--bg-tertiary)] text-[var(--text-dim)]'
                      }`}
                    >
                      {['dispatched', 'in_transit', 'delivered', 'return_to_origin', 'rto_received'].includes(
                        selectedShipmentDetail.status
                      ) ? (
                        <Check size={14} />
                      ) : (
                        '3'
                      )}
                    </div>
                    <span className="text-[11px] font-bold mt-1 text-[var(--text-main)]">3. Dispatched</span>
                    <span className="text-[9px] text-[var(--text-dim)]">Stock Deducted</span>
                  </div>

                  <div className="h-0.5 w-6 bg-[var(--border-color)] flex-shrink-0" />

                  {/* Step 4: In-Transit */}
                  <div className="flex flex-col items-center text-center flex-1 min-w-[90px]">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                        ['in_transit', 'delivered', 'return_to_origin', 'rto_received'].includes(
                          selectedShipmentDetail.status
                        )
                          ? 'bg-[var(--emerald)] text-white'
                          : selectedShipmentDetail.status === 'dispatched'
                          ? 'bg-[var(--cyan)] text-white ring-4 ring-[var(--cyan-border)]'
                          : 'bg-[var(--bg-tertiary)] text-[var(--text-dim)]'
                      }`}
                    >
                      {['delivered', 'return_to_origin', 'rto_received'].includes(selectedShipmentDetail.status) ? (
                        <Check size={14} />
                      ) : (
                        '4'
                      )}
                    </div>
                    <span className="text-[11px] font-bold mt-1 text-[var(--text-main)]">4. In-Transit</span>
                    <span className="text-[9px] text-[var(--text-dim)]">En Route</span>
                  </div>

                  <div className="h-0.5 w-6 bg-[var(--border-color)] flex-shrink-0" />

                  {/* Step 5: Terminal Delivered OR RTO */}
                  {['return_to_origin', 'rto_received', 'rto_delivered'].includes(selectedShipmentDetail.status) ? (
                    <div className="flex flex-col items-center text-center flex-1 min-w-[90px]">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-[var(--ruby)] text-white ring-4 ring-[var(--ruby-border)]">
                        <RotateCcw size={14} />
                      </div>
                      <span className="text-[11px] font-bold mt-1 text-[var(--ruby)]">5. RTO Exception</span>
                      <span className="text-[9px] text-[var(--ruby)]">
                        {selectedShipmentDetail.status === 'return_to_origin' ? 'Awaiting Intake' : 'Intake Done'}
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center text-center flex-1 min-w-[90px]">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                          selectedShipmentDetail.status === 'delivered'
                            ? 'bg-[var(--emerald)] text-white ring-4 ring-[var(--emerald-border)]'
                            : 'bg-[var(--bg-tertiary)] text-[var(--text-dim)]'
                        }`}
                      >
                        {selectedShipmentDetail.status === 'delivered' ? <Check size={14} /> : '5'}
                      </div>
                      <span className="text-[11px] font-bold mt-1 text-[var(--text-main)]">5. Delivered</span>
                      <span className="text-[9px] text-[var(--text-dim)]">Fulfilled</span>
                    </div>
                  )}
                </div>
              </div>

              {/* DETAILS GRID */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Customer Details */}
                <div className="erp-card p-3.5 space-y-2">
                  <h5 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-dim)] flex items-center gap-1.5">
                    <User size={13} />
                    <span>Customer & Delivery Details</span>
                  </h5>
                  <div className="text-xs space-y-1 text-[var(--text-main)]">
                    <div className="font-semibold">{selectedShipmentDetail.customer_name}</div>
                    <div className="text-[var(--text-muted)] flex items-center gap-1 font-mono">
                      <Phone size={11} />
                      <span>{selectedShipmentDetail.customer_phone}</span>
                    </div>
                    <div className="text-[var(--text-muted)] flex items-start gap-1">
                      <MapPin size={12} className="flex-shrink-0 mt-0.5" />
                      <span>
                        {selectedShipmentDetail.customer_address}, {selectedShipmentDetail.destination_city}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Carrier & Tracking */}
                <div className="erp-card p-3.5 space-y-2">
                  <h5 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-dim)] flex items-center gap-1.5">
                    <Truck size={13} />
                    <span>Carrier Partner & Tracking</span>
                  </h5>
                  <div className="text-xs space-y-1.5 text-[var(--text-main)]">
                    <div className="font-semibold">{selectedShipmentDetail.courier_name}</div>
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--text-dim)]">Tracking Code:</span>
                      {selectedShipmentDetail.tracking_number ? (
                        <span className="chip-mono font-bold text-xs">
                          {selectedShipmentDetail.tracking_number}
                        </span>
                      ) : (
                        <span className="italic text-[var(--text-dim)]">Not yet assigned</span>
                      )}
                    </div>
                    {selectedShipmentDetail.tracking_number && (
                      <div className="pt-0.5">
                        <a
                          href={buildTrackingUrl(selectedShipmentDetail.courier_name, selectedShipmentDetail.tracking_number) || '#'}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-[var(--accent-primary)] hover:underline font-semibold"
                        >
                          <ExternalLink size={12} />
                          <span>Track Online with Carrier</span>
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ITEMS BREAKDOWN */}
              <div>
                <h5 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-dim)] mb-2 flex items-center gap-1.5">
                  <Boxes size={13} />
                  <span>Shipment Line Items</span>
                </h5>

                <div className="erp-card overflow-hidden">
                  <table className="erp-table">
                    <thead>
                      <tr>
                        <th>Item SKU</th>
                        <th>Product Name</th>
                        <th>Bin Location</th>
                        <th>Batch #</th>
                        <th>Quantity</th>
                        <th>Unit Price</th>
                        <th className="text-right">Line Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedShipmentDetail.items || []).map((it) => (
                        <tr key={it.id}>
                          <td className="chip-mono text-xs">{it.item_sku || it.item_id}</td>
                          <td className="text-xs font-medium text-[var(--text-main)]">
                            {it.item_name || 'Item'}
                          </td>
                          <td className="font-mono text-xs text-[var(--text-muted)]">
                            {it.bin_code || it.bin_id || 'Default'}
                          </td>
                          <td className="font-mono text-xs text-[var(--text-dim)]">
                            {it.batch_number || it.batch_id || '-'}
                          </td>
                          <td className="font-mono font-bold text-xs text-[var(--text-main)]">
                            {it.quantity} {it.unit_of_measure || 'pcs'}
                          </td>
                          <td className="font-mono text-xs text-[var(--text-muted)]">
                            ${Number(it.unit_price || 0).toFixed(2)}
                          </td>
                          <td className="font-mono font-bold text-xs text-right text-[var(--text-main)]">
                            ${Number(it.total_price || 0).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* RTO Information (if applicable) */}
              {selectedShipmentDetail.rto_initiated_at && (
                <div
                  className="p-3.5 rounded-lg border flex flex-col gap-1.5"
                  style={{ backgroundColor: 'var(--ruby-bg)', borderColor: 'var(--ruby-border)' }}
                >
                  <div className="flex items-center gap-2 text-[var(--ruby)] font-bold text-xs">
                    <AlertTriangle size={15} />
                    <span>Return-to-Origin (RTO) Exception Logged</span>
                  </div>
                  <p className="text-xs text-[var(--text-main)]">
                    <span className="font-semibold">Reason: </span>
                    {selectedShipmentDetail.rto_reason || 'Delivery failed / refused'}
                  </p>
                  {selectedShipmentDetail.rto_disposition && (
                    <p className="text-xs text-[var(--text-main)]">
                      <span className="font-semibold">Disposition: </span>
                      <span className="badge badge-success text-[10px] uppercase font-bold">
                        {selectedShipmentDetail.rto_disposition}
                      </span>
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Modal Actions Toolbar */}
            <div className="p-4 border-t flex items-center justify-between flex-wrap gap-2.5" style={{ borderColor: 'var(--border-color)' }}>
              <div>
                <span className="text-xs text-[var(--text-dim)]">Current Stage: </span>
                <span className="text-xs font-bold capitalize text-[var(--text-main)]">
                  {selectedShipmentDetail.status.replace(/_/g, ' ')}
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Pending State Actions */}
                {selectedShipmentDetail.status === 'pending' && (
                  <>
                    <button
                      onClick={() => handleMarkPacked(selectedShipmentDetail.id)}
                      className="btn btn-secondary text-xs"
                    >
                      <Package size={14} />
                      <span>Mark as Packed</span>
                    </button>
                    <button
                      onClick={() => {
                        setIsDetailModalOpen(false);
                        openDispatchModal(selectedShipmentDetail);
                      }}
                      className="btn btn-primary text-xs"
                    >
                      <Send size={14} />
                      <span>Dispatch Outbound</span>
                    </button>
                  </>
                )}

                {/* Packed State Actions */}
                {selectedShipmentDetail.status === 'packed' && (
                  <button
                    onClick={() => {
                      setIsDetailModalOpen(false);
                      openDispatchModal(selectedShipmentDetail);
                    }}
                    className="btn btn-primary text-xs"
                  >
                    <Send size={14} />
                    <span>Dispatch Outbound</span>
                  </button>
                )}

                {/* Dispatched State Actions */}
                {selectedShipmentDetail.status === 'dispatched' && (
                  <>
                    <button
                      onClick={() => handleTransitionStatus(selectedShipmentDetail.id, 'in_transit')}
                      className="btn btn-secondary text-xs"
                    >
                      <Compass size={14} />
                      <span>Mark In-Transit</span>
                    </button>
                    <button
                      onClick={() => handleTransitionStatus(selectedShipmentDetail.id, 'delivered')}
                      className="btn btn-success text-xs"
                    >
                      <CheckCircle2 size={14} />
                      <span>Mark Delivered</span>
                    </button>
                    <button
                      onClick={() => handleInitiateRTO(selectedShipmentDetail.id)}
                      className="btn btn-danger text-xs"
                    >
                      <AlertTriangle size={14} />
                      <span>Initiate RTO</span>
                    </button>
                  </>
                )}

                {/* In-Transit State Actions */}
                {selectedShipmentDetail.status === 'in_transit' && (
                  <>
                    <button
                      onClick={() => handleTransitionStatus(selectedShipmentDetail.id, 'delivered')}
                      className="btn btn-success text-xs"
                    >
                      <CheckCircle2 size={14} />
                      <span>Mark Delivered</span>
                    </button>
                    <button
                      onClick={() => handleInitiateRTO(selectedShipmentDetail.id)}
                      className="btn btn-danger text-xs"
                    >
                      <AlertTriangle size={14} />
                      <span>Initiate RTO</span>
                    </button>
                  </>
                )}

                {/* RTO Pending Action */}
                {selectedShipmentDetail.status === 'return_to_origin' && (
                  <button
                    onClick={() => {
                      setIsDetailModalOpen(false);
                      openRTOModal(selectedShipmentDetail);
                    }}
                    className="btn btn-danger text-xs"
                  >
                    <RotateCcw size={14} />
                    <span>Process RTO Intake</span>
                  </button>
                )}

                {/* Delivered State */}
                {selectedShipmentDetail.status === 'delivered' && (
                  <div className="flex items-center gap-1.5 text-xs text-[var(--emerald)] font-bold">
                    <ShieldCheck size={16} />
                    <span>Delivered & Fulfilled (Terminal Locked)</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================
          MODAL 3: DISPATCH CONFIRMATION WITH MANDATORY TRACKING CODE
          ====================================================================== */}
      {isDispatchModalOpen && dispatchTargetShipment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div
            className="erp-card w-full max-w-md p-5 flex flex-col gap-4 shadow-2xl"
            style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
          >
            <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--border-color)' }}>
              <div className="flex items-center gap-2">
                <Send size={18} className="text-[var(--accent-primary)]" />
                <h3 className="text-sm font-bold text-[var(--text-main)]">
                  Dispatch Outbound Shipment
                </h3>
              </div>
              <button
                onClick={() => setIsDispatchModalOpen(false)}
                className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)]"
              >
                <X size={16} />
              </button>
            </div>

            <div className="text-xs text-[var(--text-muted)] space-y-2">
              <p>
                Confirm physical handover of parcel{' '}
                <strong className="text-[var(--text-main)] font-mono">{dispatchTargetShipment.shipment_number}</strong>{' '}
                to carrier partner <strong className="text-[var(--text-main)]">{dispatchTargetShipment.courier_name}</strong>.
              </p>
              <div
                className="p-3 rounded-lg border text-[11px]"
                style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}
              >
                <span className="font-bold text-[var(--text-main)]">Atomic Stock Deduction Warning:</span>
                <p className="mt-1">
                  Upon dispatch, reserved items will be atomically deducted from physical warehouse on-hand stock and logged to the double-entry audit ledger with <code className="chip-mono">FULFILLMENT_PICK</code>.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                Carrier Tracking Code *
              </label>
              <input
                type="text"
                placeholder="e.g. PTH-889922-EXP"
                value={dispatchTrackingInput}
                onChange={(e) => setDispatchTrackingInput(e.target.value)}
                className="input-field font-mono text-xs"
                required
                autoFocus
              />
              <span className="text-[10px] text-[var(--text-dim)] mt-1 block">
                Tracking code is required to monitor carrier delivery progression.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t" style={{ borderColor: 'var(--border-color)' }}>
              <button
                onClick={() => setIsDispatchModalOpen(false)}
                className="btn btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDispatch}
                className="btn btn-primary text-xs"
              >
                <Send size={13} />
                <span>Confirm Outbound Dispatch</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================
          MODAL 4: RETURN-TO-ORIGIN (RTO) INTAKE & DISPOSITION
          ====================================================================== */}
      {isRTOModalOpen && rtoTargetShipment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div
            className="erp-card w-full max-w-lg p-5 flex flex-col gap-4 shadow-2xl"
            style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
          >
            <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--border-color)' }}>
              <div className="flex items-center gap-2">
                <RotateCcw size={18} className="text-[var(--ruby)]" />
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-main)]">
                    Return-to-Origin (RTO) Intake Inspection
                  </h3>
                  <span className="text-[11px] text-[var(--text-dim)] font-mono">
                    Shipment #{rtoTargetShipment.shipment_number}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setIsRTOModalOpen(false)}
                className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)]"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Disposition Options */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-main)] mb-2">
                  Select Return Disposition *
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  <div
                    onClick={() => setRtoDisposition('restocked')}
                    className={`erp-card p-3 cursor-pointer rounded-lg border transition-all ${
                      rtoDisposition === 'restocked'
                        ? 'border-[var(--emerald)] bg-[var(--emerald-bg)] ring-2 ring-[var(--emerald-border)]'
                        : 'border-[var(--border-color)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-xs text-[var(--emerald)]">
                      <CheckCircle2 size={16} />
                      <span>Restock into Inventory</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] mt-1">
                      Pristine condition. Returns physical stock into target bin with RETURN_RESTOCK audit entry.
                    </p>
                  </div>

                  <div
                    onClick={() => setRtoDisposition('damaged_writeoff')}
                    className={`erp-card p-3 cursor-pointer rounded-lg border transition-all ${
                      rtoDisposition === 'damaged_writeoff'
                        ? 'border-[var(--ruby)] bg-[var(--ruby-bg)] ring-2 ring-[var(--ruby-border)]'
                        : 'border-[var(--border-color)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-xs text-[var(--ruby)]">
                      <AlertTriangle size={16} />
                      <span>Damaged Scrap Write-Off</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] mt-1">
                      Spoiled or broken. Stock will NOT be restored; logs ADJUSTMENT_WRITE_OFF.
                    </p>
                  </div>
                </div>
              </div>

              {/* Target Bin (if restocked) */}
              {rtoDisposition === 'restocked' && (
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-dim)] mb-1">
                    Destination Warehouse Bin for Restocking *
                  </label>
                  <select
                    value={rtoTargetBinId}
                    onChange={(e) => setRtoTargetBinId(e.target.value)}
                    className="input-field text-xs font-mono"
                    required
                  >
                    {warehouseBins
                      .filter((b) => b.warehouse_id === rtoTargetShipment.source_warehouse_id)
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.bin_code} ({b.zone})
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {/* Inspection Notes */}
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-dim)] mb-1">
                  Intake Inspection Notes *
                </label>
                <textarea
                  rows={3}
                  value={rtoInspectionNotes}
                  onChange={(e) => setRtoInspectionNotes(e.target.value)}
                  placeholder="Record package seal condition, reasons for rejection, and QA findings..."
                  className="input-field text-xs resize-none"
                  required
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t" style={{ borderColor: 'var(--border-color)' }}>
              <button
                onClick={() => setIsRTOModalOpen(false)}
                className="btn btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleProcessRTOSubmit}
                className={`btn text-xs ${
                  rtoDisposition === 'restocked' ? 'btn-success' : 'btn-danger'
                }`}
              >
                {rtoDisposition === 'restocked' ? (
                  <>
                    <CheckCircle2 size={13} />
                    <span>Confirm Restock & Close RTO</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={13} />
                    <span>Confirm Damaged Scrap Write-off</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================
          MODAL 5: ADD / EDIT COURIER MANAGER
          ====================================================================== */}
      {isCourierModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div
            className="erp-card w-full max-w-md p-5 flex flex-col gap-4 shadow-2xl"
            style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
          >
            <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--border-color)' }}>
              <div className="flex items-center gap-2">
                <Truck size={18} className="text-[var(--accent-primary)]" />
                <h3 className="text-sm font-bold text-[var(--text-main)]">
                  {editingCourier ? 'Edit Carrier Profile' : 'Register New Courier Partner'}
                </h3>
              </div>
              <button
                onClick={() => setIsCourierModalOpen(false)}
                className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)]"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveCourier} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-dim)] mb-1">
                  Carrier / Courier Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Steadfast Logistics"
                  value={courierForm.name}
                  onChange={(e) => setCourierForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="input-field text-xs"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-dim)] mb-1">
                  Service Tier / Type *
                </label>
                <select
                  value={courierForm.service_type}
                  onChange={(e) => setCourierForm((prev) => ({ ...prev, service_type: e.target.value }))}
                  className="input-field text-xs"
                >
                  <option value="Standard">Standard Domestic Road</option>
                  <option value="Express">Express Same-Day / Next-Day</option>
                  <option value="Freight">Bulk Cargo & Heavy Freight</option>
                  <option value="Regional">Regional Hub Inter-District</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-dim)] mb-1">
                  Contact Phone *
                </label>
                <input
                  type="text"
                  placeholder="+880 1711-..."
                  value={courierForm.contact_phone}
                  onChange={(e) => setCourierForm((prev) => ({ ...prev, contact_phone: e.target.value }))}
                  className="input-field text-xs font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-dim)] mb-1">
                  Tracking URL Template (Optional)
                </label>
                <input
                  type="text"
                  placeholder="https://track.carrier.com?id={tracking_number}"
                  value={courierForm.tracking_url_template}
                  onChange={(e) => setCourierForm((prev) => ({ ...prev, tracking_url_template: e.target.value }))}
                  className="input-field text-xs font-mono"
                />
                <span className="text-[10px] text-[var(--text-dim)] mt-0.5 block">
                  Use <code className="chip-mono">{'{tracking_number}'}</code> as the substitution placeholder.
                </span>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="courierActiveToggle"
                  checked={courierForm.is_active === 1}
                  onChange={(e) => setCourierForm((prev) => ({ ...prev, is_active: e.target.checked ? 1 : 0 }))}
                  className="rounded border-[var(--border-color)]"
                />
                <label htmlFor="courierActiveToggle" className="text-xs font-medium text-[var(--text-main)] cursor-pointer">
                  Active for outbound shipment selection
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t" style={{ borderColor: 'var(--border-color)' }}>
                <button
                  type="button"
                  onClick={() => setIsCourierModalOpen(false)}
                  className="btn btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary text-xs">
                  <Check size={13} />
                  <span>{editingCourier ? 'Update Carrier' : 'Register Carrier'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Print Waybill Modal */}
      <PrintVoucherModal
        isOpen={printModalState.isOpen}
        onClose={() => setPrintModalState((prev) => ({ ...prev, isOpen: false }))}
        type={printModalState.type}
        data={printModalState.data}
      />
    </div>
  );
};

export default LogisticsView;
