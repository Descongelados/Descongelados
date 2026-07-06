import { useEffect, useRef, useState } from 'react';
import { Download, Share2, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Customer, Product, Sale, SaleItem } from '../../lib/types';
import { formatCurrency, formatDateTime } from '../../lib/format';
import Modal from './Modal';
import { useToast } from './Toast';

type SaleRow = Sale & { customer: Customer | null };
type ReceiptItem = SaleItem & { product: Product | null };

type Props = {
  sale: SaleRow | null;
  onClose: () => void;
};

export default function SaleReceiptModal({ sale, onClose }: Props) {
  const { push } = useToast();
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sale) { setItems([]); return; }
    supabase
      .from('sale_items')
      .select('*, product:products(*)')
      .eq('sale_id', sale.id)
      .then(({ data }) => setItems((data as ReceiptItem[]) ?? []));
  }, [sale?.id]);

  const share = async () => {
    if (!sale) return;
    const lines = items.map(
      (it) => `• ${it.product?.name ?? 'Producto'} x${it.quantity} — ${formatCurrency(it.subtotal)}`,
    );
    const text =
      `Recibo de venta\n` +
      `Folio: ${sale.invoice_number ?? '—'}\n` +
      `Cliente: ${sale.customer?.name ?? '—'}\n` +
      `Fecha: ${formatDateTime(sale.sale_date)}\n\n` +
      `Productos:\n${lines.join('\n')}\n\n` +
      `Subtotal: ${formatCurrency(sale.subtotal)}\n` +
      `Impuesto: ${formatCurrency(sale.tax)}\n` +
      `Total: ${formatCurrency(sale.total)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `Recibo ${sale.invoice_number ?? ''}`, text });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        push('success', 'Recibo copiado al portapapeles');
      } else {
        push('info', 'Tu navegador no soporta compartir. Usa descargar PDF.');
      }
    } catch {
      // user cancelled
    }
  };

  return (
    <Modal
      open={!!sale}
      onClose={onClose}
      title="Recibo de venta"
      description="Descarga en PDF o comparte con el cliente."
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          <button className="btn-secondary" onClick={onClose}>
            Cerrar
          </button>
          <button className="btn-secondary" onClick={share}>
            <Share2 size={16} /> Compartir
          </button>
          <button className="btn-primary" onClick={() => window.print()}>
            <Download size={16} /> Descargar PDF
          </button>
        </div>
      }
    >
      <div ref={receiptRef} className="receipt-print-area">
        <div className="flex items-start justify-between border-b border-ink-200 pb-4">
          <div>
            <h2 className="text-lg font-bold text-ink-900">Recibo de venta</h2>
            <p className="text-xs text-ink-500 mt-0.5">Comprobante interno · no fiscal</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-ink-500 uppercase font-semibold">Folio</p>
            <p className="font-mono font-bold text-ink-900">{sale?.invoice_number ?? '—'}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 py-4 text-sm">
          <div>
            <p className="text-xs text-ink-500 uppercase font-semibold">Cliente</p>
            <p className="font-medium text-ink-800">{sale?.customer?.name ?? '—'}</p>
            {sale?.customer?.phone && (
              <p className="text-xs text-ink-500">{sale.customer.phone}</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs text-ink-500 uppercase font-semibold">Fecha</p>
            <p className="font-medium text-ink-800">{formatDateTime(sale?.sale_date ?? null)}</p>
          </div>
        </div>

        <div className="border border-ink-200 rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-ink-100">
            <thead className="bg-ink-50/60">
              <tr>
                <th className="table-head">Producto</th>
                <th className="table-head text-right">Cant.</th>
                <th className="table-head text-right">Precio</th>
                <th className="table-head text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-ink-400">
                    Sin productos
                  </td>
                </tr>
              ) : (
                items.map((it) => (
                  <tr key={it.id}>
                    <td className="table-cell font-medium text-ink-800">
                      {it.product?.name ?? 'Producto eliminado'}
                    </td>
                    <td className="table-cell text-right">{it.quantity}</td>
                    <td className="table-cell text-right">{formatCurrency(it.unit_price)}</td>
                    <td className="table-cell text-right font-semibold">{formatCurrency(it.subtotal)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end pt-4">
          <div className="w-full sm:w-64 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-ink-500">Subtotal</span>
              <span className="font-medium text-ink-800">{formatCurrency(sale?.subtotal ?? 0)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-ink-500">Impuesto</span>
              <span className="font-medium text-ink-800">{formatCurrency(sale?.tax ?? 0)}</span>
            </div>
            <div className="flex justify-between pt-1.5 border-t border-ink-200">
              <span className="font-semibold text-ink-900">Total</span>
              <span className="font-bold text-ink-900 text-base">{formatCurrency(sale?.total ?? 0)}</span>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-ink-200 text-center">
          <div className="inline-flex items-center gap-1.5 text-success-600 text-sm font-semibold">
            <CheckCircle2 size={14} /> Venta confirmada
          </div>
          <p className="text-xs text-ink-400 mt-1">Gracias por su compra.</p>
        </div>
      </div>
    </Modal>
  );
}
