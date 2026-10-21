import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Store,
  ShoppingCart,
  Search,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  Banknote,
  Smartphone,
  Printer,
  CheckCircle2,
  RefreshCw,
  X,
  Package,
  User,
  Phone,
  Receipt,
  RotateCcw,
  Sparkles,
  Barcode
} from 'lucide-react';
import { dbService } from '../services/db';
import { posService, type POSSaleResult, type ShowroomCatalogItem } from '../services/posService';
import type { Warehouse } from '../types/erp';

interface ShowroomItem extends ShowroomCatalogItem {}

interface CartItem {
  item: ShowroomItem;
  quantity: number;
}

interface POSSaleRecord {
  receiptNumber: string;
  timestamp: string;
  warehouseId: string;
  warehouseName: string;
  customerName: string;
  customerPhone: string;
  paymentMethod: 'Cash' | 'Card' | 'MFS';
  paymentDetails: string;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  amountTendered: number;
  changeDue: number;
  items: Array<{
    sku: string;
    name: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
}

export interface ShowroomViewProps {
  onRefreshCounts?: () => void;
}

export const ShowroomView: React.FC<ShowroomViewProps> = ({ onRefreshCounts }) => {
  // Warehouse and Catalog State
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [activeWarehouseId, setActiveWarehouseId] = useState<string>('wh-central-dc');
  const [catalogItems, setCatalogItems] = useState<ShowroomItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [barcodeInput, setBarcodeInput] = useState<string>('');

  // Cart / Basket State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState<string>('Walk-in Customer');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [taxRate, setTaxRate] = useState<number>(5); // 5% VAT standard

  // Payment Settlement State
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Card' | 'MFS'>('Cash');
  const [cashTendered, setCashTendered] = useState<string>('');
  const [cardRef, setCardRef] = useState<string>('');
  const [cardType, setCardType] = useState<string>('Visa / Debit');
  const [mfsProvider, setMfsProvider] = useState<string>('bKash');
  const [mfsPhone, setMfsPhone] = useState<string>('');
  const [mfsTrxId, setMfsTrxId] = useState<string>('');

  // Processing & Receipt Modals
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [completedSale, setCompletedSale] = useState<POSSaleRecord | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState<boolean>(false);
  const [salesHistory, setSalesHistory] = useState<POSSaleRecord[]>([]);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  const showToast = (type: 'success' | 'error' | 'info', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // 1. Fetch Warehouses and Catalog Items with stock in the active facility
  const loadShowroomData = async () => {
    try {
      setIsLoading(true);
      await dbService.initialize();

      // Load active warehouses
      const whRows = await dbService.query<Warehouse>(
        "SELECT * FROM warehouses WHERE is_active = 1 ORDER BY is_default DESC, name ASC;"
      );
      setWarehouses(whRows || []);
      if (whRows && whRows.length > 0 && !activeWarehouseId) {
        setActiveWarehouseId(whRows[0].id);
      }

      const whId = activeWarehouseId || (whRows && whRows[0] ? whRows[0].id : 'wh-central-dc');

      // Load catalog items joined with unexpired stock in this warehouse (FEFO-aware)
      const items = await posService.getShowroomCatalog(whId, dbService);
      setCatalogItems(items);
    } catch (err: any) {
      console.error('Error loading showroom catalog:', err);
      showToast('error', `Failed to load catalog: ${err.message || String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadShowroomData();
  }, [activeWarehouseId]);

  // Categories list
  const categories = useMemo(() => {
    const set = new Set<string>();
    catalogItems.forEach((i) => {
      if (i.category) set.add(i.category);
    });
    return ['all', ...Array.from(set)];
  }, [catalogItems]);

  // Filtered Products
  const filteredItems = useMemo(() => {
    return catalogItems.filter((item) => {
      const matchesSearch =
        searchQuery === '' ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.barcode && item.barcode.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesCategory =
        selectedCategory === 'all' || item.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [catalogItems, searchQuery, selectedCategory]);

  // Add Item to Cart
  const handleAddToCart = (item: ShowroomItem) => {
    if (item.stock_available <= 0) {
      showToast('error', `${item.name} (${item.sku}) is out of stock in this showroom.`);
      return;
    }

    setCart((prev) => {
      const existing = prev.find((ci) => ci.item.id === item.id);
      if (existing) {
        if (existing.quantity >= item.stock_available) {
          showToast('info', `Maximum available stock reached for ${item.sku} (${item.stock_available} units).`);
          return prev;
        }
        return prev.map((ci) =>
          ci.item.id === item.id ? { ...ci, quantity: ci.quantity + 1 } : ci
        );
      } else {
        return [...prev, { item, quantity: 1 }];
      }
    });
  };

  // Barcode / SKU scan submit
  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = barcodeInput.trim();
    if (!query) return;

    const matched = catalogItems.find(
      (i) =>
        i.sku.toLowerCase() === query.toLowerCase() ||
        (i.barcode && i.barcode.toLowerCase() === query.toLowerCase())
    );

    if (matched) {
      handleAddToCart(matched);
      setBarcodeInput('');
      showToast('success', `Added ${matched.name} to cart.`);
    } else {
      showToast('error', `No product found matching barcode/SKU "${query}".`);
    }
  };

  // Modify Cart Quantities
  const handleUpdateQuantity = (itemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((ci) => {
          if (ci.item.id === itemId) {
            const nextQty = ci.quantity + delta;
            if (nextQty > ci.item.stock_available) {
              showToast('info', `Cannot exceed stock balance of ${ci.item.stock_available}.`);
              return ci;
            }
            return { ...ci, quantity: nextQty };
          }
          return ci;
        })
        .filter((ci) => ci.quantity > 0)
    );
  };

  const handleRemoveFromCart = (itemId: string) => {
    setCart((prev) => prev.filter((ci) => ci.item.id !== itemId));
  };

  const handleClearCart = () => {
    setCart([]);
  };

  // Financial Computations
  const subtotal = useMemo(() => {
    return cart.reduce((acc, ci) => acc + ci.item.selling_price * ci.quantity, 0);
  }, [cart]);

  const discountAmount = useMemo(() => {
    return (subtotal * discountPercent) / 100;
  }, [subtotal, discountPercent]);

  const taxableAmount = Math.max(0, subtotal - discountAmount);
  const taxAmount = (taxableAmount * taxRate) / 100;
  const grandTotal = taxableAmount + taxAmount;

  const parsedCashTendered = parseFloat(cashTendered) || 0;
  const changeDue = paymentMethod === 'Cash' ? Math.max(0, parsedCashTendered - grandTotal) : 0;

  // Checkout and Deduct Stock
  const handleProcessSale = async () => {
    if (cart.length === 0) {
      showToast('error', 'Cart is empty. Add items before processing sale.');
      return;
    }

    if (paymentMethod === 'Cash' && parsedCashTendered < grandTotal) {
      showToast('error', `Tendered cash ($${parsedCashTendered.toFixed(2)}) is less than total amount ($${grandTotal.toFixed(2)}).`);
      return;
    }

    try {
      setIsProcessing(true);

      let paymentDetailStr = '';
      if (paymentMethod === 'Cash') {
        paymentDetailStr = `Tendered: $${parsedCashTendered.toFixed(2)} | Change: $${changeDue.toFixed(2)}`;
      } else if (paymentMethod === 'Card') {
        paymentDetailStr = `${cardType} | Ref: ${cardRef || 'Approved'}`;
      } else {
        paymentDetailStr = `${mfsProvider} | Wallet: ${mfsPhone || 'Walk-in'} | TrxID: ${mfsTrxId || 'MFS-CONFIRMED'}`;
      }

      // Delegate to POS Service for atomic transaction, FEFO depletion & batch sync
      const saleRecord = await posService.processPOSSale(
        {
          warehouseId: activeWarehouseId,
          customerName,
          customerPhone,
          paymentMethod,
          paymentDetails: paymentDetailStr,
          discountPercent,
          taxRate,
          cashTendered: parsedCashTendered,
          userId: 'POS Cashier',
          items: cart.map((ci) => ({ itemId: ci.item.id, quantity: ci.quantity }))
        },
        dbService
      );

      setCompletedSale(saleRecord);
      setSalesHistory((prev) => [saleRecord, ...prev]);
      setIsReceiptModalOpen(true);
      setCart([]);
      setCashTendered('');
      setCustomerPhone('');
      setMfsTrxId('');
      setCardRef('');

      // Refresh catalog stock counts
      await loadShowroomData();
      if (onRefreshCounts) onRefreshCounts();
      showToast('success', `Sale ${saleRecord.receiptNumber} completed successfully. Stock deducted from showroom.`);
    } catch (err: any) {
      console.error('POS Checkout error:', err);
      showToast('error', `Checkout failed: ${err.message || String(err)}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] -m-6 overflow-hidden">
      {/* Toast Alert */}
      {toastMessage && (
        <div
          className={`fixed top-16 right-6 z-50 p-3.5 rounded-lg border text-xs font-semibold shadow-xl flex items-center justify-between gap-3 ${
            toastMessage.type === 'success'
              ? 'bg-[var(--emerald-bg)] border-[var(--emerald-border)] text-[var(--emerald)]'
              : toastMessage.type === 'error'
              ? 'bg-[var(--ruby-bg)] border-[var(--ruby-border)] text-[var(--ruby)]'
              : 'bg-[var(--cyan-bg)] border-[var(--cyan-border)] text-[var(--cyan)]'
          }`}
        >
          <span>{toastMessage.text}</span>
          <button onClick={() => setToastMessage(null)} className="font-bold ml-2">✕</button>
        </div>
      )}

      {/* Top Banner & Control Bar */}
      <div
        className="flex items-center justify-between px-6 py-3 border-b shrink-0 select-none"
        style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-indigo-600 text-white shadow-sm">
            <Store size={20} />
          </div>
          <div>
            <h1 className="text-base font-bold text-[var(--text-main)] flex items-center gap-2">
              <span>Showroom & Retail POS</span>
              <span className="badge badge-success text-[10px]">Live Terminal</span>
            </h1>
            <p className="text-xs text-[var(--text-muted)]">
              Instant walk-in counter sales, basket management & automated bin deductions.
            </p>
          </div>
        </div>

        {/* Operating Showroom DC selector & Sales History button */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-medium text-[var(--text-dim)]">Counter Hub:</span>
            <select
              value={activeWarehouseId}
              onChange={(e) => setActiveWarehouseId(e.target.value)}
              className="px-2.5 py-1 text-xs font-semibold rounded-md border cursor-pointer outline-none bg-[var(--bg-primary)] text-[var(--text-main)] border-[var(--border-color)]"
            >
              {warehouses.map((wh) => (
                <option key={wh.id} value={wh.id}>
                  {wh.name} ({wh.warehouse_code})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setIsHistoryDrawerOpen(true)}
            className="btn btn-secondary text-xs flex items-center gap-1.5"
            title="View today's counter sales chits"
          >
            <Receipt size={14} />
            <span>Today's Sales ({salesHistory.length})</span>
          </button>
        </div>
      </div>

      {/* Main Dual Workspace: Left Product Catalog (60%) | Right Cart & Tender (40%) */}
      <div className="flex-1 flex overflow-hidden">
        {/* ====================================================================
            LEFT SECTION: PRODUCT CATALOG & SCANNER
            ==================================================================== */}
        <div className="flex-1 flex flex-col border-r overflow-hidden" style={{ borderColor: 'var(--border-color)' }}>
          {/* Barcode & Search Bar */}
          <div
            className="p-4 border-b flex flex-wrap gap-3 items-center justify-between"
            style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}
          >
            {/* Quick Barcode Scanner Form */}
            <form onSubmit={handleBarcodeSubmit} className="flex items-center gap-2 flex-1 min-w-[240px]">
              <div className="relative flex-1">
                <Barcode size={16} className="absolute left-3 top-2.5 text-[var(--accent-primary)]" />
                <input
                  ref={barcodeInputRef}
                  type="text"
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  placeholder="Scan barcode or enter exact SKU and press Enter..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border outline-none font-mono bg-[var(--bg-secondary)] text-[var(--text-main)] border-[var(--border-color)] focus:border-[var(--accent-primary)]"
                />
              </div>
              <button type="submit" className="btn btn-secondary text-xs">
                Scan Add
              </button>
            </form>

            {/* General Filter Search */}
            <div className="relative w-64">
              <Search size={14} className="absolute left-3 top-2.5 text-[var(--text-dim)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name, SKU, category..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border outline-none bg-[var(--bg-secondary)] text-[var(--text-main)] border-[var(--border-color)]"
              />
            </div>
          </div>

          {/* Category Chips Bar */}
          <div
            className="px-4 py-2 border-b flex gap-1.5 overflow-x-auto select-none"
            style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
          >
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                  selectedCategory === cat
                    ? 'bg-[var(--accent-primary)] text-white'
                    : 'bg-[var(--bg-hover)] text-[var(--text-dim)] hover:text-[var(--text-main)]'
                }`}
              >
                {cat === 'all' ? 'All Categories' : cat}
              </button>
            ))}
          </div>

          {/* Product Items Grid */}
          <div className="flex-1 overflow-y-auto p-4 bg-[var(--bg-primary)]">
            {isLoading ? (
              <div className="flex items-center justify-center h-48 text-xs text-[var(--text-dim)]">
                <RefreshCw size={18} className="animate-spin mr-2" />
                Loading inventory catalog...
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-xs text-[var(--text-dim)] gap-2">
                <Package size={28} className="opacity-40" />
                <span>No products found matching "{searchQuery}".</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                {filteredItems.map((item) => {
                  const inStock = item.stock_available > 0;
                  return (
                    <div
                      key={item.id}
                      onClick={() => inStock && handleAddToCart(item)}
                      className={`p-3.5 rounded-xl border flex flex-col justify-between transition-all select-none ${
                        inStock
                          ? 'cursor-pointer hover-lift border-[var(--border-color)] bg-[var(--bg-card)] hover:border-[var(--accent-primary)]'
                          : 'opacity-50 cursor-not-allowed border-[var(--border-color)] bg-[var(--bg-tertiary)]'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="chip-mono font-bold text-[10px] text-[var(--accent-primary)]">
                            {item.sku}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              inStock ? 'badge-success text-[var(--emerald)]' : 'badge-danger text-[var(--ruby)]'
                            }`}
                          >
                            {inStock ? `${item.stock_available} in stock` : 'Out of stock'}
                          </span>
                        </div>
                        <h4 className="text-xs font-bold text-[var(--text-main)] line-clamp-2 leading-tight">
                          {item.name}
                        </h4>
                        <span className="text-[10px] text-[var(--text-dim)] block mt-0.5">
                          {item.category}
                        </span>
                      </div>

                      <div className="mt-3 pt-2 border-t flex items-center justify-between" style={{ borderColor: 'var(--border-color)' }}>
                        <span className="font-mono font-bold text-sm text-[var(--text-main)]">
                          ${item.selling_price.toFixed(2)}
                        </span>
                        <button
                          disabled={!inStock}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (inStock) handleAddToCart(item);
                          }}
                          className={`p-1.5 rounded-lg text-xs font-bold flex items-center gap-1 ${
                            inStock
                              ? 'bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-hover)]'
                              : 'bg-gray-400 text-gray-200 cursor-not-allowed'
                          }`}
                        >
                          <Plus size={13} />
                          <span>Add</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ====================================================================
            RIGHT SECTION: CART, TENDER & SETTLEMENT (40%)
            ==================================================================== */}
        <div
          className="w-96 lg:w-[420px] flex flex-col bg-[var(--bg-secondary)] overflow-hidden shrink-0"
        >
          {/* Cart Header */}
          <div
            className="px-5 py-3.5 border-b flex items-center justify-between"
            style={{ borderColor: 'var(--border-color)' }}
          >
            <div className="flex items-center gap-2">
              <ShoppingCart size={18} className="text-[var(--accent-primary)]" />
              <span className="text-sm font-bold text-[var(--text-main)]">Counter Basket</span>
              <span className="badge badge-info text-[10px]">
                {cart.reduce((a, c) => a + c.quantity, 0)} items
              </span>
            </div>
            {cart.length > 0 && (
              <button
                onClick={handleClearCart}
                className="text-[11px] text-[var(--ruby)] hover:underline flex items-center gap-1"
              >
                <Trash2 size={12} />
                <span>Clear</span>
              </button>
            )}
          </div>

          {/* Customer Metadata Input */}
          <div className="px-5 py-2.5 border-b bg-[var(--bg-primary)] grid grid-cols-2 gap-2 text-xs" style={{ borderColor: 'var(--border-color)' }}>
            <div className="flex items-center gap-1.5 bg-[var(--bg-secondary)] px-2.5 py-1 rounded border border-[var(--border-color)]">
              <User size={13} className="text-[var(--text-dim)] shrink-0" />
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Walk-in Customer"
                className="w-full bg-transparent border-none outline-none text-xs text-[var(--text-main)]"
              />
            </div>
            <div className="flex items-center gap-1.5 bg-[var(--bg-secondary)] px-2.5 py-1 rounded border border-[var(--border-color)]">
              <Phone size={13} className="text-[var(--text-dim)] shrink-0" />
              <input
                type="text"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="Phone (optional)"
                className="w-full bg-transparent border-none outline-none text-xs text-[var(--text-main)] font-mono"
              />
            </div>
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2.5 divide-y divide-[var(--border-color)]">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-44 text-xs text-[var(--text-dim)] gap-2">
                <ShoppingCart size={32} className="opacity-30" />
                <span>The basket is currently empty.</span>
                <span className="text-[11px]">Click items or scan a barcode to add.</span>
              </div>
            ) : (
              cart.map((ci) => (
                <div key={ci.item.id} className="pt-2.5 first:pt-0 flex items-center justify-between text-xs">
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="font-bold text-[var(--text-main)] truncate">{ci.item.name}</div>
                    <div className="text-[11px] text-[var(--text-dim)] flex items-center gap-2">
                      <span className="font-mono text-[var(--accent-primary)]">{ci.item.sku}</span>
                      <span>${ci.item.selling_price.toFixed(2)} / unit</span>
                    </div>
                  </div>

                  {/* Quantity Stepper */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleUpdateQuantity(ci.item.id, -1)}
                      className="w-6 h-6 rounded flex items-center justify-center border border-[var(--border-color)] hover:bg-[var(--bg-hover)] text-[var(--text-main)]"
                    >
                      <Minus size={11} />
                    </button>
                    <span className="font-mono font-bold w-6 text-center text-xs">
                      {ci.quantity}
                    </span>
                    <button
                      onClick={() => handleUpdateQuantity(ci.item.id, 1)}
                      className="w-6 h-6 rounded flex items-center justify-center border border-[var(--border-color)] hover:bg-[var(--bg-hover)] text-[var(--text-main)]"
                    >
                      <Plus size={11} />
                    </button>
                  </div>

                  {/* Line Total & Remove */}
                  <div className="text-right pl-3 flex items-center gap-2 font-mono">
                    <span className="font-bold text-[var(--text-main)]">
                      ${(ci.item.selling_price * ci.quantity).toFixed(2)}
                    </span>
                    <button
                      onClick={() => handleRemoveFromCart(ci.item.id)}
                      className="text-[var(--text-dim)] hover:text-[var(--ruby)] p-1"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Payment Method Selector Tabs */}
          <div className="px-5 pt-3 border-t bg-[var(--bg-primary)] space-y-3" style={{ borderColor: 'var(--border-color)' }}>
            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-lg border bg-[var(--bg-secondary)]" style={{ borderColor: 'var(--border-color)' }}>
              <button
                type="button"
                onClick={() => setPaymentMethod('Cash')}
                className={`py-1.5 text-xs font-bold rounded flex items-center justify-center gap-1.5 transition-colors ${
                  paymentMethod === 'Cash'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-[var(--text-dim)] hover:text-[var(--text-main)]'
                }`}
              >
                <Banknote size={14} />
                <span>Cash</span>
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('Card')}
                className={`py-1.5 text-xs font-bold rounded flex items-center justify-center gap-1.5 transition-colors ${
                  paymentMethod === 'Card'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-[var(--text-dim)] hover:text-[var(--text-main)]'
                }`}
              >
                <CreditCard size={14} />
                <span>Card</span>
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('MFS')}
                className={`py-1.5 text-xs font-bold rounded flex items-center justify-center gap-1.5 transition-colors ${
                  paymentMethod === 'MFS'
                    ? 'bg-pink-600 text-white shadow-sm'
                    : 'text-[var(--text-dim)] hover:text-[var(--text-main)]'
                }`}
              >
                <Smartphone size={14} />
                <span>MFS</span>
              </button>
            </div>

            {/* Payment Details Inputs */}
            {paymentMethod === 'Cash' && (
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-[var(--text-dim)]">Amount Tendered ($)</label>
                  <div className="flex gap-1">
                    {[10, 20, 50, 100].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setCashTendered(String(amt))}
                        className="px-1.5 py-0.5 rounded border border-[var(--border-color)] text-[10px] font-mono hover:bg-[var(--bg-hover)]"
                      >
                        ${amt}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  type="number"
                  step="0.01"
                  value={cashTendered}
                  onChange={(e) => setCashTendered(e.target.value)}
                  placeholder={`Min: $${grandTotal.toFixed(2)}`}
                  className="input-field text-xs font-mono font-bold"
                />
                {parsedCashTendered > 0 && (
                  <div className="flex justify-between text-xs pt-1">
                    <span className="text-[var(--text-dim)]">Change Due:</span>
                    <span className={`font-mono font-bold ${changeDue >= 0 ? 'text-[var(--emerald)]' : 'text-[var(--ruby)]'}`}>
                      ${changeDue.toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {paymentMethod === 'Card' && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="text-[10px] font-semibold text-[var(--text-dim)] block mb-1">Card Network</label>
                  <select
                    value={cardType}
                    onChange={(e) => setCardType(e.target.value)}
                    className="input-field text-xs"
                  >
                    <option value="Visa">Visa Credit / Debit</option>
                    <option value="Mastercard">Mastercard</option>
                    <option value="Amex">American Express</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-[var(--text-dim)] block mb-1">Approval Code</label>
                  <input
                    type="text"
                    value={cardRef}
                    onChange={(e) => setCardRef(e.target.value)}
                    placeholder="Terminal Auth #"
                    className="input-field text-xs font-mono"
                  />
                </div>
              </div>
            )}

            {paymentMethod === 'MFS' && (
              <div className="space-y-2 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-semibold text-[var(--text-dim)] block mb-1">MFS Provider</label>
                    <select
                      value={mfsProvider}
                      onChange={(e) => setMfsProvider(e.target.value)}
                      className="input-field text-xs font-semibold"
                    >
                      <option value="bKash">bKash Merchant</option>
                      <option value="Nagad">Nagad Merchant</option>
                      <option value="Rocket">DBBL Rocket</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-[var(--text-dim)] block mb-1">Customer Mobile</label>
                    <input
                      type="text"
                      value={mfsPhone}
                      onChange={(e) => setMfsPhone(e.target.value)}
                      placeholder="+88017..."
                      className="input-field text-xs font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-[var(--text-dim)] block mb-0.5">Transaction ID (TrxID)</label>
                  <input
                    type="text"
                    value={mfsTrxId}
                    onChange={(e) => setMfsTrxId(e.target.value)}
                    placeholder="e.g. BL991K720P"
                    className="input-field text-xs font-mono"
                  />
                </div>
              </div>
            )}

            {/* Financial Summary & Checkout Button */}
            <div className="pt-2 border-t space-y-1.5 text-xs" style={{ borderColor: 'var(--border-color)' }}>
              <div className="flex justify-between text-[var(--text-dim)]">
                <span>Subtotal ({cart.length} lines):</span>
                <span className="font-mono">${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-[var(--text-dim)]">
                <span>VAT / Tax ({taxRate}%):</span>
                <span className="font-mono">${taxAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-sm font-bold text-[var(--text-main)] pt-1 border-t" style={{ borderColor: 'var(--border-color)' }}>
                <span>Total Amount Due:</span>
                <span className="font-mono text-base text-[var(--accent-primary)]">
                  ${grandTotal.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Complete Sale Button */}
            <div className="pb-4 pt-1">
              <button
                type="button"
                onClick={handleProcessSale}
                disabled={cart.length === 0 || isProcessing}
                className={`w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition-all ${
                  cart.length > 0 && !isProcessing
                    ? 'bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white'
                    : 'bg-gray-400 text-gray-200 cursor-not-allowed shadow-none'
                }`}
              >
                <CheckCircle2 size={16} />
                <span>{isProcessing ? 'Processing Sale & Stock...' : `Complete Sale — $${grandTotal.toFixed(2)}`}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ====================================================================
          MODAL: PRINTABLE RECEIPT CHIT (THERMAL PRINTER FORMAT)
          ==================================================================== */}
      {isReceiptModalOpen && completedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white text-black w-full max-w-sm rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header Toolbar */}
            <div className="no-print flex items-center justify-between px-4 py-3 bg-slate-900 text-white">
              <span className="font-bold text-xs flex items-center gap-1.5">
                <Receipt size={14} className="text-emerald-400" />
                <span>Sale Completed — Receipt Chit</span>
              </span>
              <button
                onClick={() => setIsReceiptModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            {/* Printable Thermal Receipt Container */}
            <div className="p-6 overflow-y-auto bg-white flex justify-center">
              <div id="printable-document" className="printable-area printable-thermal w-full font-mono text-[11px] text-black space-y-3">
                <div className="text-center border-b border-black pb-3">
                  <h2 className="text-sm font-black tracking-tight uppercase">Probaho Retail Showroom</h2>
                  <p className="text-[10px] text-gray-700">Central Distribution & Retail Outlet</p>
                  <p className="text-[10px] text-gray-700">Hub: {completedSale.warehouseName}</p>
                  <p className="text-[10px] text-gray-700">Date: {new Date(completedSale.timestamp).toLocaleString()}</p>
                  <p className="text-[10px] font-bold mt-1">Receipt #{completedSale.receiptNumber}</p>
                </div>

                <div className="text-[10px] border-b border-black pb-2 space-y-0.5">
                  <div><strong>Customer:</strong> {completedSale.customerName}</div>
                  {completedSale.customerPhone && <div><strong>Phone:</strong> {completedSale.customerPhone}</div>}
                  <div><strong>Cashier:</strong> Terminal POS Officer</div>
                </div>

                {/* Items */}
                <table className="w-full text-[10px] border-collapse">
                  <thead>
                    <tr className="border-b border-dashed border-black text-left">
                      <th className="py-1">Item</th>
                      <th className="py-1 text-center">Qty</th>
                      <th className="py-1 text-right">Price</th>
                      <th className="py-1 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dotted divide-gray-300">
                    {completedSale.items.map((line, idx) => (
                      <tr key={idx}>
                        <td className="py-1 pr-1">
                          <div className="font-bold truncate max-w-[120px]">{line.name}</div>
                          <div className="text-[9px] text-gray-600">{line.sku}</div>
                        </td>
                        <td className="py-1 text-center">{line.quantity}</td>
                        <td className="py-1 text-right">${line.unitPrice.toFixed(2)}</td>
                        <td className="py-1 text-right font-bold">${line.subtotal.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Summary */}
                <div className="border-t border-dashed border-black pt-2 space-y-1 text-[10px]">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>${completedSale.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tax / VAT (5%):</span>
                    <span>${completedSale.tax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs font-black border-t border-black pt-1">
                    <span>GRAND TOTAL:</span>
                    <span>${completedSale.total.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-[10px] text-gray-800 pt-1">
                    <span>Payment Method:</span>
                    <span className="font-bold uppercase">{completedSale.paymentMethod}</span>
                  </div>
                  {completedSale.paymentMethod === 'Cash' && (
                    <>
                      <div className="flex justify-between">
                        <span>Paid Tendered:</span>
                        <span>${completedSale.amountTendered.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-bold">
                        <span>Change Returned:</span>
                        <span>${completedSale.changeDue.toFixed(2)}</span>
                      </div>
                    </>
                  )}
                  {completedSale.paymentDetails && (
                    <div className="text-[9px] text-gray-600 italic">
                      {completedSale.paymentDetails}
                    </div>
                  )}
                </div>

                {/* Barcode representation */}
                <div className="text-center pt-2 border-t border-dashed border-black space-y-1">
                  <div className="text-[9px] tracking-widest font-mono">
                    *{completedSale.receiptNumber}*
                  </div>
                  <p className="text-[9px] text-gray-600">
                    Thank you for shopping with Probaho!
                  </p>
                  <p className="text-[8px] text-gray-500">
                    Goods sold are backed by Probaho ERP Warranty.
                  </p>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="no-print p-4 bg-slate-100 border-t border-slate-200 flex gap-2">
              <button
                onClick={handlePrintReceipt}
                className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow"
              >
                <Printer size={14} />
                <span>Print Chit</span>
              </button>
              <button
                onClick={() => setIsReceiptModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-200 font-bold text-xs text-slate-700"
              >
                New Sale
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          DRAWER: TODAY'S SALES CHIT HISTORY
          ==================================================================== */}
      {isHistoryDrawerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-sm p-0">
          <div className="w-full max-w-md h-full bg-[var(--bg-secondary)] border-l border-[var(--border-color)] shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
            <div className="px-5 py-4 border-b border-[var(--border-color)] flex items-center justify-between bg-[var(--bg-primary)]">
              <div className="flex items-center gap-2">
                <Receipt size={17} className="text-[var(--accent-primary)]" />
                <h3 className="font-bold text-sm text-[var(--text-main)]">Today's Counter Sales</h3>
              </div>
              <button
                onClick={() => setIsHistoryDrawerOpen(false)}
                className="p-1 rounded text-[var(--text-dim)] hover:text-[var(--text-main)]"
              >
                <X size={17} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {salesHistory.length === 0 ? (
                <div className="text-center py-12 text-xs text-[var(--text-dim)]">
                  No sales recorded in this terminal session yet.
                </div>
              ) : (
                salesHistory.map((s) => (
                  <div
                    key={s.receiptNumber}
                    className="p-3.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="chip-mono font-bold text-[var(--accent-primary)]">
                        {s.receiptNumber}
                      </span>
                      <span className="font-mono text-[var(--text-dim)] text-[11px]">
                        {new Date(s.timestamp).toLocaleTimeString()}
                      </span>
                    </div>

                    <div className="text-[var(--text-muted)] flex justify-between">
                      <span>Customer: <strong>{s.customerName}</strong></span>
                      <span className="badge badge-info text-[10px]">{s.paymentMethod}</span>
                    </div>

                    <div className="text-[11px] text-[var(--text-dim)]">
                      {s.items.length} items • {s.items.map((i) => `${i.quantity}x ${i.sku}`).join(', ')}
                    </div>

                    <div className="pt-2 border-t border-[var(--border-color)] flex items-center justify-between">
                      <span className="font-mono font-bold text-sm text-[var(--text-main)]">
                        ${s.total.toFixed(2)}
                      </span>
                      <button
                        onClick={() => {
                          setCompletedSale(s);
                          setIsReceiptModalOpen(true);
                        }}
                        className="px-2.5 py-1 rounded border border-[var(--border-color)] hover:bg-[var(--bg-hover)] text-[11px] font-semibold flex items-center gap-1 text-[var(--accent-primary)]"
                      >
                        <Printer size={12} />
                        <span>Reprint Chit</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShowroomView;
