import React, { useRef, useState, useEffect } from 'react';
import { Printer, X, Download, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { dbService } from '../services/db';

export type VoucherType = 'po_slip' | 'grn_chit' | 'delivery_waybill' | 'rack_label';

export interface PrintVoucherModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: VoucherType;
  data: any;
}

export const PrintVoucherModal: React.FC<PrintVoucherModalProps> = ({
  isOpen,
  onClose,
  type,
  data
}) => {
  const printAreaRef = useRef<HTMLDivElement>(null);
  const [brand, setBrand] = useState<{ name: string; logoUrl?: string }>({
    name: 'PROBAHO SUPPLY CHAIN LTD.',
    logoUrl: ''
  });

  useEffect(() => {
    if (isOpen) {
      dbService.query<{ key: string; value: string }>(
        "SELECT key, value FROM system_settings WHERE key IN ('company_name', 'company_logo');"
      ).then(rows => {
        const map = new Map<string, string>();
        rows.forEach(r => map.set(r.key, r.value));
        setBrand({
          name: (map.get('company_name') || 'PROBAHO SUPPLY CHAIN LTD.').toUpperCase(),
          logoUrl: map.get('company_logo') || ''
        });
      }).catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen || !data) return null;

  const handlePrint = () => {
    window.print();
  };

  // Helper to render deterministic SVG Barcode
  const renderBarcode = (code: string) => {
    const chars = (code || '000000').toUpperCase();
    const pattern: number[] = [];
    for (let i = 0; i < chars.length; i++) {
      const codeVal = chars.charCodeAt(i);
      pattern.push((codeVal % 3) + 1, ((codeVal * 3) % 2) + 1, ((codeVal * 7) % 3) + 1, 1);
    }
    
    let xOffset = 10;
    const rects: React.ReactNode[] = [];
    pattern.forEach((w, idx) => {
      if (idx % 2 === 0) {
        rects.push(
          <rect key={idx} x={xOffset} y={0} width={w * 1.5} height={42} fill="#000000" />
        );
      }
      xOffset += (w * 1.5) + (idx % 2 !== 0 ? 1.5 : 0.8);
    });

    return (
      <div className="flex flex-col items-center">
        <svg width={Math.max(160, xOffset + 10)} height={44} className="overflow-visible">
          {rects}
        </svg>
        <span className="font-mono text-[11px] tracking-widest text-black font-bold mt-1">
          *{code}*
        </span>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white text-black w-full max-w-4xl rounded-xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[90vh]">
        {/* Modal Controls Bar (Hidden during print via no-print) */}
        <div className="no-print flex items-center justify-between px-6 py-3.5 bg-slate-900 text-white border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Printer size={18} className="text-indigo-400" />
            <span className="font-bold text-sm">
              {type === 'po_slip' && `Purchase Order Slip — #${data.po_number || ''}`}
              {type === 'grn_chit' && `Goods Receipt Inspection Chit — #${data.receipt_number || ''}`}
              {type === 'delivery_waybill' && `Delivery Consignment Waybill — #${data.shipment_number || ''}`}
              {type === 'rack_label' && `Warehouse Rack & Bin Label — ${data.bin_code || ''}`}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow transition-all"
            >
              <Printer size={14} />
              <span>Print Document (Ctrl+P)</span>
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Printable Document View Container */}
        <div className="flex-1 overflow-y-auto p-8 bg-slate-100 flex justify-center">
          <div
            ref={printAreaRef}
            id="printable-document"
            className="printable-area bg-white text-black w-full max-w-3xl p-8 border border-slate-300 shadow-sm rounded-lg"
            style={{ minHeight: '600px' }}
          >
            {/* --------------------------------------------------------------
                1. PURCHASE ORDER (PO ORDER SLIP)
                -------------------------------------------------------------- */}
            {type === 'po_slip' && (
              <div className="space-y-6 text-sm">
                {/* Header */}
                <div className="flex justify-between items-start border-b-2 border-black pb-4">
                  <div className="flex items-center gap-3">
                    {brand.logoUrl && (
                      <img src={brand.logoUrl} alt="Logo" className="max-h-12 max-w-[140px] object-contain rounded border border-slate-200 p-0.5" />
                    )}
                    <div>
                      <h1 className="text-2xl font-black tracking-tight text-slate-900">{brand.name}</h1>
                      <p className="text-xs text-slate-600 mt-0.5">Enterprise Logistics & Procurement Division</p>
                      <p className="text-xs text-slate-600">Plot 14, Commercial Zone, Dhaka 1230, Bangladesh</p>
                      <p className="text-xs text-slate-600">Email: procurement@probaho.corp | Tel: +880-2-9876543</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="inline-block bg-black text-white px-3 py-1 font-bold text-base tracking-wider rounded">
                      PURCHASE ORDER
                    </div>
                    <div className="mt-2 text-xs">
                      <div><strong>PO Number:</strong> <span className="font-mono font-bold">{data.po_number}</span></div>
                      <div><strong>Order Date:</strong> {data.order_date ? data.order_date.slice(0, 10) : 'N/A'}</div>
                      <div><strong>Delivery Due:</strong> {data.expected_delivery_date ? data.expected_delivery_date.slice(0, 10) : 'N/A'}</div>
                      <div><strong>Status:</strong> <span className="uppercase font-bold">{data.status}</span></div>
                    </div>
                  </div>
                </div>

                {/* Vendor & Target Warehouse Details */}
                <div className="grid grid-cols-2 gap-6 text-xs bg-slate-50 p-4 border border-slate-200 rounded">
                  <div>
                    <h3 className="font-bold text-slate-900 uppercase tracking-wider mb-1 text-[11px] border-b border-slate-300 pb-1">
                      Vendor / Supplier Information:
                    </h3>
                    <p className="font-bold text-sm text-slate-900">{data.supplier_name || 'N/A'}</p>
                    <p className="text-slate-600">Vendor Code: <span className="font-mono">{data.supplier_code || 'N/A'}</span></p>
                    <p className="text-slate-600">Contact: {data.contact_person || 'Accounts Dept'}</p>
                    <p className="text-slate-600">Phone: {data.supplier_phone || data.phone || 'N/A'}</p>
                    <p className="text-slate-600">{data.supplier_address || data.address || ''}</p>
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 uppercase tracking-wider mb-1 text-[11px] border-b border-slate-300 pb-1">
                      Deliver & Consign To (Destination DC):
                    </h3>
                    <p className="font-bold text-sm text-slate-900">{data.warehouse_name || 'Central Distribution Center'}</p>
                    <p className="text-slate-600">Facility Code: <span className="font-mono">{data.warehouse_code || 'WH-CENTRAL'}</span></p>
                    <p className="text-slate-600">Payment Terms: <strong>{data.payment_terms || 'Net 30'}</strong></p>
                    <p className="text-slate-600">Receiving Hours: 08:00 - 18:00 BST</p>
                  </div>
                </div>

                {/* Items Table */}
                <div>
                  <table className="w-full text-xs border border-slate-300">
                    <thead className="bg-slate-100 border-b border-slate-300">
                      <tr>
                        <th className="p-2 text-left border-r border-slate-300">#</th>
                        <th className="p-2 text-left border-r border-slate-300">SKU Code</th>
                        <th className="p-2 text-left border-r border-slate-300">Item Description</th>
                        <th className="p-2 text-right border-r border-slate-300">Qty Ordered</th>
                        <th className="p-2 text-right border-r border-slate-300">Unit Price</th>
                        <th className="p-2 text-right">Line Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {(data.items || []).map((line: any, idx: number) => (
                        <tr key={line.id || idx}>
                          <td className="p-2 border-r border-slate-200 text-center font-mono">{idx + 1}</td>
                          <td className="p-2 border-r border-slate-200 font-mono font-bold">{line.sku}</td>
                          <td className="p-2 border-r border-slate-200">{line.item_name || line.name || 'Commercial Good'}</td>
                          <td className="p-2 border-r border-slate-200 text-right font-mono font-bold">{line.quantity_ordered}</td>
                          <td className="p-2 border-r border-slate-200 text-right font-mono">${Number(line.unit_cost || 0).toFixed(2)}</td>
                          <td className="p-2 text-right font-mono font-bold">${Number(line.subtotal || (line.quantity_ordered * line.unit_cost) || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                      <tr>
                        <td colSpan={4} className="p-2 text-xs text-slate-500 italic">
                          Notes: {data.notes || 'Inspection mandatory upon dock arrival. Return discrepancies within 48h.'}
                        </td>
                        <td className="p-2 text-right border-r border-slate-200 text-xs">Total PO Value:</td>
                        <td className="p-2 text-right font-mono font-bold text-sm text-slate-900">
                          ${Number(data.total_amount || 0).toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Sign-off Blocks */}
                <div className="pt-12 grid grid-cols-3 gap-6 text-xs text-center">
                  <div className="border-t border-slate-400 pt-2">
                    <p className="font-bold">Prepared By</p>
                    <p className="text-[11px] text-slate-500">Procurement Officer</p>
                  </div>
                  <div className="border-t border-slate-400 pt-2">
                    <p className="font-bold">Authorized By</p>
                    <p className="text-[11px] text-slate-500">Supply Chain Director</p>
                  </div>
                  <div className="border-t border-slate-400 pt-2">
                    <p className="font-bold">Vendor Acceptance</p>
                    <p className="text-[11px] text-slate-500">Authorized Signature & Seal</p>
                  </div>
                </div>
              </div>
            )}

            {/* --------------------------------------------------------------
                2. GOODS RECEIPT NOTE (GRN INSPECTION CHIT)
                -------------------------------------------------------------- */}
            {type === 'grn_chit' && (
              <div className="space-y-6 text-sm">
                {/* Header */}
                <div className="flex justify-between items-start border-b-2 border-black pb-4">
                  <div className="flex items-center gap-3">
                    {brand.logoUrl && (
                      <img src={brand.logoUrl} alt="Logo" className="max-h-12 max-w-[140px] object-contain rounded border border-slate-200 p-0.5" />
                    )}
                    <div>
                      <h1 className="text-2xl font-black tracking-tight text-slate-900">{brand.name}</h1>
                      <p className="text-xs text-slate-600 mt-0.5">Warehouse Receiving & Quality Assurance Depot</p>
                      <p className="text-xs text-slate-600">Internal Audit Control Document</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="inline-block bg-emerald-800 text-white px-3 py-1 font-bold text-base tracking-wider rounded">
                      GOODS RECEIPT NOTE (GRN)
                    </div>
                    <div className="mt-2 text-xs">
                      <div><strong>GRN Number:</strong> <span className="font-mono font-bold">{data.receipt_number}</span></div>
                      <div><strong>PO Reference:</strong> <span className="font-mono font-bold">{data.po_number || 'N/A'}</span></div>
                      <div><strong>Received Date:</strong> {data.receipt_date ? data.receipt_date.slice(0, 10) : 'N/A'}</div>
                      <div><strong>QA Inspector:</strong> {data.received_by || 'Warehouse Officer'}</div>
                    </div>
                  </div>
                </div>

                {/* Inspection Overview */}
                <div className="grid grid-cols-3 gap-4 text-xs bg-slate-50 p-3.5 border border-slate-200 rounded">
                  <div>
                    <span className="text-slate-500 block">Inspection Disposition:</span>
                    <span className={`font-bold text-xs uppercase px-2 py-0.5 rounded inline-block mt-1 ${
                      data.inspection_passed !== 0 ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-red-100 text-red-800 border border-red-300'
                    }`}>
                      {data.inspection_passed !== 0 ? '✓ Passed Inspection' : '✕ Inspection Issues Noted'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Total Accepted Units:</span>
                    <span className="font-mono font-bold text-sm text-emerald-700">{data.total_accepted || data.quantity_accepted || 0} Units</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Total Rejected Units:</span>
                    <span className="font-mono font-bold text-sm text-red-600">{data.total_rejected || data.quantity_rejected || 0} Units</span>
                  </div>
                </div>

                {/* Line Items Received & Bins */}
                <div>
                  <h3 className="font-bold text-xs uppercase tracking-wider mb-2 text-slate-800">
                    Inspected Consignment Lines:
                  </h3>
                  <table className="w-full text-xs border border-slate-300">
                    <thead className="bg-slate-100 border-b border-slate-300">
                      <tr>
                        <th className="p-2 text-left border-r border-slate-300">SKU</th>
                        <th className="p-2 text-left border-r border-slate-300">Product</th>
                        <th className="p-2 text-right border-r border-slate-300">Accepted</th>
                        <th className="p-2 text-right border-r border-slate-300">Rejected</th>
                        <th className="p-2 text-left border-r border-slate-300">Putaway Bin</th>
                        <th className="p-2 text-left">Batch / Lot #</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {(data.items || []).map((line: any, idx: number) => (
                        <tr key={idx}>
                          <td className="p-2 border-r border-slate-200 font-mono font-bold">{line.sku}</td>
                          <td className="p-2 border-r border-slate-200">{line.item_name || line.name || '-'}</td>
                          <td className="p-2 border-r border-slate-200 text-right font-mono font-bold text-emerald-700">
                            {line.quantity_accepted || 0}
                          </td>
                          <td className="p-2 border-r border-slate-200 text-right font-mono font-bold text-red-600">
                            {line.quantity_rejected || 0}
                          </td>
                          <td className="p-2 border-r border-slate-200 font-mono">{line.bin_code || line.binId || 'Assigned Bin'}</td>
                          <td className="p-2 font-mono text-[11px]">{line.batch_number || line.batchNumber || 'N/A'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {data.inspection_notes && (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded text-xs">
                    <strong className="text-slate-700">QA Notes:</strong> {data.inspection_notes}
                  </div>
                )}

                {/* Sign-off */}
                <div className="pt-12 grid grid-cols-2 gap-8 text-xs text-center">
                  <div className="border-t border-slate-400 pt-2">
                    <p className="font-bold">Receiving Inspector Signature</p>
                    <p className="text-[11px] text-slate-500">Date: {new Date().toLocaleDateString()}</p>
                  </div>
                  <div className="border-t border-slate-400 pt-2">
                    <p className="font-bold">Warehouse Operations Lead</p>
                    <p className="text-[11px] text-slate-500">Physical Stock Recorded in Ledger</p>
                  </div>
                </div>
              </div>
            )}

            {/* --------------------------------------------------------------
                3. DELIVERY WAYBILL
                -------------------------------------------------------------- */}
            {type === 'delivery_waybill' && (
              <div className="space-y-6 text-sm">
                {/* Header */}
                <div className="flex justify-between items-start border-b-2 border-black pb-4">
                  <div className="flex items-center gap-3">
                    {brand.logoUrl && (
                      <img src={brand.logoUrl} alt="Logo" className="max-h-12 max-w-[140px] object-contain rounded border border-slate-200 p-0.5" />
                    )}
                    <div>
                      <h1 className="text-2xl font-black tracking-tight text-slate-900">{brand.name}</h1>
                      <p className="text-xs text-slate-600">Consignment Waybill & Carrier Manifest</p>
                      <p className="text-xs text-slate-600">Partner Carrier: <strong>{data.courier_name || 'Standard Courier'}</strong></p>
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end">
                    <div className="inline-block bg-blue-900 text-white px-3 py-1 font-bold text-base tracking-wider rounded">
                      DELIVERY WAYBILL
                    </div>
                    <div className="mt-2">
                      {renderBarcode(data.tracking_number || data.shipment_number || 'WAYBILL-001')}
                    </div>
                  </div>
                </div>

                {/* Routing Addresses */}
                <div className="grid grid-cols-2 gap-6 text-xs bg-slate-50 p-4 border border-slate-200 rounded">
                  <div>
                    <h3 className="font-bold text-slate-800 uppercase tracking-wider mb-1 text-[11px]">
                      Sender (Origin Dispatch Facility):
                    </h3>
                    <p className="font-bold text-slate-900">Probaho Distribution Hub</p>
                    <p className="text-slate-600">Ref PO / Order: <span className="font-mono font-bold">{data.order_reference}</span></p>
                    <p className="text-slate-600">Shipment Code: <span className="font-mono font-bold">{data.shipment_number}</span></p>
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 uppercase tracking-wider mb-1 text-[11px]">
                      Consignee (Delivery Recipient):
                    </h3>
                    <p className="font-bold text-sm text-slate-900">{data.customer_name}</p>
                    <p className="font-semibold text-slate-800">Phone: {data.customer_phone}</p>
                    <p className="text-slate-700">{data.customer_address}</p>
                    <p className="font-bold text-slate-900 mt-1 uppercase">City: {data.destination_city}</p>
                  </div>
                </div>

                {/* Parcel Contents */}
                <div>
                  <h3 className="font-bold text-xs uppercase tracking-wider mb-2 text-slate-800">
                    Declared Package Contents:
                  </h3>
                  <table className="w-full text-xs border border-slate-300">
                    <thead className="bg-slate-100 border-b border-slate-300">
                      <tr>
                        <th className="p-2 text-left border-r border-slate-300">Item SKU</th>
                        <th className="p-2 text-left border-r border-slate-300">Description</th>
                        <th className="p-2 text-right border-r border-slate-300">Qty</th>
                        <th className="p-2 text-right">Declared Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {(data.items || []).map((line: any, idx: number) => (
                        <tr key={idx}>
                          <td className="p-2 border-r border-slate-200 font-mono font-bold">{line.sku}</td>
                          <td className="p-2 border-r border-slate-200">{line.name || line.item_name || 'Goods'}</td>
                          <td className="p-2 border-r border-slate-200 text-right font-mono font-bold">{line.quantity}</td>
                          <td className="p-2 text-right font-mono">${(Number(line.unit_price || 0) * line.quantity).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Delivery Confirmation Sign-off */}
                <div className="pt-8 border-t border-slate-300 grid grid-cols-2 gap-6 text-xs">
                  <div>
                    <p className="font-bold mb-1">Carrier Driver Sign-off:</p>
                    <div className="h-14 border border-dashed border-slate-300 rounded p-1 text-[10px] text-slate-400">
                      Picked up in good condition & sealed.
                    </div>
                  </div>
                  <div>
                    <p className="font-bold mb-1">Customer / Recipient Signature:</p>
                    <div className="h-14 border border-dashed border-slate-300 rounded p-1 text-[10px] text-slate-400">
                      Received goods intact. Date: _____/_____/2026
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* --------------------------------------------------------------
                4. BARCODE / QR SHELF RACK LABEL
                -------------------------------------------------------------- */}
            {type === 'rack_label' && (
              <div className="printable-label border-4 border-black p-6 space-y-4 text-center mx-auto max-w-md bg-white">
                <div className="text-xs font-bold text-slate-700 tracking-wider uppercase border-b-2 border-black pb-2">
                  Probaho Warehouse Storage Rack Location
                </div>

                <div className="text-3xl font-black font-mono tracking-tight text-black py-2">
                  {data.bin_code || 'BIN-001'}
                </div>

                <div className="py-2 flex justify-center">
                  {renderBarcode(data.bin_code || 'BIN-001')}
                </div>

                <div className="grid grid-cols-4 gap-2 text-xs border-t-2 border-b-2 border-black py-3 font-semibold">
                  <div>
                    <span className="block text-[10px] text-slate-500 uppercase">Zone</span>
                    <span className="text-sm font-bold">{data.zone || 'A'}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-500 uppercase">Aisle</span>
                    <span className="text-sm font-bold">{data.aisle || '01'}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-500 uppercase">Rack</span>
                    <span className="text-sm font-bold">{data.rack || 'R1'}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-500 uppercase">Shelf</span>
                    <span className="text-sm font-bold">{data.shelf || 'S1'}</span>
                  </div>
                </div>

                <div className="text-[11px] text-slate-600 flex justify-between px-2">
                  <span>Warehouse: <strong>{data.warehouse_name || 'Central DC'}</strong></span>
                  <span>Max Load: <strong>{data.max_weight_kg || 500} KG</strong></span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrintVoucherModal;
