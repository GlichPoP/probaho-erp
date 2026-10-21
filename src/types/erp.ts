// ============================================================================
// PROBAHO ERP: DOMAIN MODEL & INTERFACE CONTRACT TYPES
// File: src/types/erp.ts
// Milestone: M4 - Fulfillment & Logistics Domain Model
// ============================================================================

export type ValuationMethod = 'MOVING_AVERAGE' | 'FIFO';

export type POStatus = 
  | 'draft' 
  | 'pending_approval' 
  | 'approved' 
  | 'ordered' 
  | 'partially_received' 
  | 'received' 
  | 'cancelled';

export type TransferStatus = 
  | 'draft' 
  | 'requested' 
  | 'in_transit' 
  | 'completed' 
  | 'received' 
  | 'cancelled';

export type ShipmentStatus = 
  | 'pending' 
  | 'packed' 
  | 'dispatched' 
  | 'in_transit' 
  | 'delivered' 
  | 'return_to_origin' 
  | 'rto_received' 
  | 'rto_delivered' 
  | 'cancelled';

export type BatchStatus = 'ACTIVE' | 'EXPIRED' | 'QUARANTINED' | 'DEPLETED';

export type TransactionType = 
  | 'PO_RECEIPT' 
  | 'TRANSFER_OUT' 
  | 'TRANSFER_IN' 
  | 'FULFILLMENT_PICK' 
  | 'RETURN_RESTOCK' 
  | 'ADJUSTMENT_WRITE_OFF' 
  | 'CYCLE_COUNT_ADJUSTMENT';

export type ReferenceType = 'PO' | 'TRANSFER' | 'SHIPMENT' | 'ADJUSTMENT';

// ----------------------------------------------------------------------------
// 1. System Settings
// ----------------------------------------------------------------------------
export interface SystemSetting {
  key: string;
  value: string;
  category: string;
  description?: string;
  updated_at: string;
}

// ----------------------------------------------------------------------------
// 2. Vendors & Suppliers
// ----------------------------------------------------------------------------
export interface Supplier {
  id: string;
  supplier_code: string;
  name: string;
  contact_person?: string;
  email?: string;
  phone: string;
  address: string;
  city?: string;
  country: string;
  tax_id?: string;
  payment_terms_days: number;
  lead_time_days: number;
  rating: number;
  performance_score: number;
  total_pos_issued: number;
  total_pos_fulfilled: number;
  notes?: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface CreateSupplierInput {
  id?: string;
  supplierCode: string;
  name: string;
  contactPerson?: string;
  email?: string;
  phone: string;
  address: string;
  city?: string;
  country?: string;
  taxId?: string;
  paymentTermsDays?: number;
  leadTimeDays?: number;
  rating?: number;
  notes?: string;
}

// ----------------------------------------------------------------------------
// 3. Items & Product Catalog
// ----------------------------------------------------------------------------
export interface Item {
  id: string;
  sku: string;
  barcode?: string;
  name: string;
  description?: string;
  category: string;
  unit_of_measure: string;
  cost_price: number;
  selling_price: number;
  valuation_method: ValuationMethod;
  min_stock_alert: number;
  safety_stock: number;
  max_stock: number;
  weight_kg: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface CreateItemInput {
  id?: string;
  sku: string;
  barcode?: string;
  name: string;
  description?: string;
  category: string;
  unitOfMeasure?: string;
  costPrice: number;
  sellingPrice: number;
  minStockAlert?: number;
  safetyStock?: number;
  maxStock?: number;
  weightKg?: number;
  valuationMethod?: ValuationMethod;
}

// ----------------------------------------------------------------------------
// 4. Warehouses
// ----------------------------------------------------------------------------
export interface Warehouse {
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
}

export interface CreateWarehouseInput {
  id?: string;
  warehouseCode: string;
  name: string;
  address: string;
  city: string;
  district?: string;
  contactPerson?: string;
  contactPhone?: string;
  isDefault?: boolean;
}

// ----------------------------------------------------------------------------
// 5. Warehouse Locations / Bins
// ----------------------------------------------------------------------------
export interface WarehouseLocation {
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
}

export interface CreateLocationInput {
  id?: string;
  warehouseId: string;
  zone: string;
  aisle: string;
  rack: string;
  shelf: string;
  binCode: string;
  maxWeightKg?: number;
}

// ----------------------------------------------------------------------------
// 6. Item Batches & Lots
// ----------------------------------------------------------------------------
export interface ItemBatch {
  id: string;
  batch_number: string;
  item_id: string;
  supplier_id?: string;
  manufacture_date?: string;
  expiry_date?: string;
  unit_cost: number;
  initial_quantity: number;
  current_quantity: number;
  status: BatchStatus;
  created_at: string;
  updated_at: string;
}

// ----------------------------------------------------------------------------
// 7. Inventory Stock
// ----------------------------------------------------------------------------
export interface InventoryStock {
  id: string;
  item_id: string;
  warehouse_id: string;
  bin_id?: string;
  batch_id?: string;
  quantity_on_hand: number;
  quantity_reserved: number;
  created_at: string;
  updated_at: string;
}

// ----------------------------------------------------------------------------
// 8. Purchase Orders & Procurement
// ----------------------------------------------------------------------------
export interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_id: string;
  target_warehouse_id: string;
  status: POStatus;
  order_date: string;
  expected_delivery_date?: string;
  actual_delivery_date?: string;
  subtotal: number;
  tax_amount: number;
  shipping_cost: number;
  total_amount: number;
  payment_terms?: string;
  notes?: string;
  inspection_notes?: string;
  created_by: string;
  approved_by?: string;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderItem {
  id: string;
  po_id: string;
  item_id: string;
  sku: string;
  quantity_ordered: number;
  quantity_received: number;
  quantity_rejected: number;
  unit_cost: number;
  subtotal: number;
  tax_rate: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

// ----------------------------------------------------------------------------
// 9. Goods Receipts & Inspection
// ----------------------------------------------------------------------------
export interface GoodsReceipt {
  id: string;
  receipt_number: string;
  po_id: string;
  warehouse_id: string;
  received_by: string;
  receipt_date: string;
  inspection_passed: number;
  inspection_notes?: string;
  created_at: string;
}

export interface GoodsReceiptItem {
  id: string;
  receipt_id: string;
  po_item_id: string;
  item_id: string;
  batch_id?: string;
  bin_id?: string;
  quantity_accepted: number;
  quantity_rejected: number;
  rejection_reason?: string;
  unit_cost: number;
  created_at: string;
}

export interface IGoodsReceiptInput {
  purchaseOrderId: string;
  warehouseId: string;
  receiptDate?: string;
  receivedBy: string;
  inspectionNotes?: string;
  items: Array<{
    poItemId: string;
    itemId: string;
    receivedQuantity: number;
    rejectedQuantity: number;
    rejectionReason?: string;
    binId?: string;
    batchNumber?: string;
    expiryDate?: string;
    unitCost: number;
  }>;
}

// ----------------------------------------------------------------------------
// 10. Inter-Warehouse Stock Transfers
// ----------------------------------------------------------------------------
export interface StockTransfer {
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
}

export interface StockTransferItem {
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
}

export interface IStockTransferInput {
  transferNumber: string;
  sourceWarehouseId: string;
  destWarehouseId: string;
  requestedBy: string;
  notes?: string;
  items: Array<{
    itemId: string;
    sourceBinId?: string;
    destBinId?: string;
    batchId?: string;
    quantity: number;
  }>;
}

// ----------------------------------------------------------------------------
// 11. Couriers & Carriers (Milestone 4 Core Domain)
// ----------------------------------------------------------------------------
export interface ICourier {
  id: string;
  name: string;
  service_type: string;
  contact_phone: string;
  tracking_url_template?: string | null;
  is_active: number;
  created_at: string;
}

export type Courier = ICourier;

export interface ICreateCourierInput {
  id?: string;
  name: string;
  contactPhone?: string;
  phone?: string;
  serviceType?: string;
  trackingUrlTemplate?: string;
}

export type CreateCourierInput = ICreateCourierInput;

export interface IUpdateCourierInput {
  name?: string;
  contactPhone?: string;
  phone?: string;
  serviceType?: string;
  trackingUrlTemplate?: string | null;
  isActive?: boolean | number;
}

export type UpdateCourierInput = IUpdateCourierInput;

export interface CourierFilterOptions {
  activeOnly?: boolean;
  serviceType?: string;
  search?: string;
  sortBy?: 'name' | 'service_type' | 'created_at';
  sortOrder?: 'ASC' | 'DESC';
  limit?: number;
  offset?: number;
}

// ----------------------------------------------------------------------------
// 12. Shipments & Logistics Tracking (Milestone 4 Core Domain)
// ----------------------------------------------------------------------------
export interface IShipment {
  id: string;
  shipment_number: string;
  order_reference: string;
  source_warehouse_id: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  destination_city: string;
  destination_district?: string | null;
  courier_id?: string | null;
  courier_name: string;
  tracking_number?: string | null;
  status: ShipmentStatus;
  declared_value: number;
  cod_amount: number;
  shipping_fee: number;
  dispatched_at?: string | null;
  delivered_at?: string | null;
  rto_initiated_at?: string | null;
  rto_received_at?: string | null;
  rto_reason?: string | null;
  rto_disposition?: 'restocked' | 'damaged_writeoff' | string | null;
  notes?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type Shipment = IShipment;

export interface IShipmentItem {
  id: string;
  shipment_id: string;
  item_id: string;
  batch_id?: string | null;
  bin_id?: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  created_at: string;
}

export type ShipmentItem = IShipmentItem;

export interface ICreateShipmentItemInput {
  itemId: string;
  productId?: string;
  batchId?: string | null;
  binId?: string | null;
  locationId?: string | null;
  quantity: number;
  unitPrice?: number;
}

export type CreateShipmentItemInput = ICreateShipmentItemInput;

export interface ICreateShipmentInput {
  id?: string;
  shipmentNumber?: string;
  orderReference: string;
  sourceWarehouseId?: string;
  warehouseId?: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  destinationCity: string;
  destinationDistrict?: string;
  courierId?: string;
  courierName: string;
  trackingNumber?: string;
  declaredValue?: number;
  codAmount?: number;
  shippingFee?: number;
  notes?: string;
  createdBy?: string;
  items: ICreateShipmentItemInput[];
}

export type CreateShipmentInput = ICreateShipmentInput;
export type IShipmentInput = ICreateShipmentInput;

export interface IRTOProcessingInput {
  shipmentId: string;
  disposition: 'restocked' | 'damaged_writeoff';
  targetBinId?: string;
  user?: string;
  notes?: string;
}

export interface ShipmentFilterOptions {
  warehouseId?: string;
  sourceWarehouseId?: string;
  status?: ShipmentStatus;
  courierId?: string;
  search?: string;
  destinationCity?: string;
  startDate?: string;
  endDate?: string;
  sortBy?: 'shipment_number' | 'created_at' | 'dispatched_at' | 'delivered_at' | 'status';
  sortOrder?: 'ASC' | 'DESC';
  limit?: number;
  offset?: number;
}

export interface ShipmentWithItems extends IShipment {
  items: (IShipmentItem & {
    itemName?: string;
    item_name?: string;
    itemSku?: string;
    item_sku?: string;
    itemCategory?: string;
    item_category?: string;
    itemUnit?: string;
    item_unit?: string;
    batchNumber?: string;
    batch_number?: string;
    binCode?: string;
    bin_code?: string;
    zone?: string;
  })[];
  sourceWarehouseName?: string;
  source_warehouse_name?: string;
  sourceWarehouseCode?: string;
  source_warehouse_code?: string;
  courierServiceType?: string;
  courier_service_type?: string;
}

// ----------------------------------------------------------------------------
// 13. Inventory Transaction Audit Ledger
// ----------------------------------------------------------------------------
export interface InventoryTransaction {
  id: string;
  transaction_timestamp: string;
  transaction_type: TransactionType;
  reference_type: ReferenceType;
  reference_id: string;
  item_id: string;
  warehouse_id: string;
  bin_id?: string;
  batch_id?: string;
  quantity_change: number;
  unit_cost: number;
  running_balance_after: number;
  user_id: string;
  notes?: string;
}

// ----------------------------------------------------------------------------
// 14. Application Audit Logs
// ----------------------------------------------------------------------------
export interface AuditLog {
  id: string;
  timestamp: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details?: string;
}

// ----------------------------------------------------------------------------
// 15. Backup & Restore History
// ----------------------------------------------------------------------------
export interface BackupHistoryRecord {
  id: string;
  backup_filename: string;
  backup_format: 'JSON_SNAPSHOT' | 'SQLITE_BINARY';
  file_size_bytes: number;
  table_counts_json: string;
  sha256_checksum: string;
  status: 'COMPLETED' | 'FAILED' | 'VERIFIED';
  created_by: string;
  created_at: string;
}
