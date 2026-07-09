import { Share2, Download, Banknote } from 'lucide-react';
import { Collection, Customer, Sale } from '../../lib/types';
import { formatCurrency, formatDateTime } from '../../lib/format';
import Modal from './Modal';
import { useToast } from './Toast';
import { useCompany } from '../../lib/auth';

type SaleRow = Sale & { customer: Customer | null };

export type AbonoData = {
  collection: Collection;
  sale: SaleRow;
  /** Total abonado a esta venta hasta e incluyendo este abono */
  totalPaid: number;
  /** Saldo restante después de este abono */
  balance: number;
};

type Props = {
  data: AbonoData | null;
  onClose: () => void;
};

const METHOD_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  banco: 'Banco',
  por_pagar: 'Por pagar',
  combinado: 'Combinado',
};

export default function AbonoReceiptModal({ data, onClose }: Props) {
  const { push } = useToast();
  const company = useCompany();

  const share = async () => {
    if (!data) return;
    const { collection: c, sale: s, totalPaid, balance } = data;
    const text =
      `TICKET DE ABONO\n` +
      `Empresa: ${company.name}\n` +
      `Folio venta: ${s.invoice_number ?? '—'}\n` +
      `Cliente: ${s.customer?.name ?? '—'}\n` +
      `Fecha abono: ${formatDateTime(c.collection_date)}\n` +
      `Método: ${METHOD_LABELS[c.payment_method] ?? c.payment_method}\n` +
      (c.reference ? `Referencia: ${c.reference}\n` : '') +
      `\nMonto abonado: ${formatCurrency(c.amount)}\n` +
      `Total de la venta: ${formatCurrency(s.total)}\n` +
      `Total abonado: ${formatCurrency(totalPaid)}\n` +
      `Saldo pendiente: ${formatCurrency(balance)}\n` +
      (balance <= 0.009 ? '✓ PAGADO EN SU TOTALIDAD' : '');
    try {
      if (navigator.share) {
        await navigator.share({ title: `Abono ${s.invoice_number ?? ''}`, text });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        push('success', 'Ticket copiado al portapapeles');
      } else {
        push('info', 'Tu navegador no soporta compartir. Usa descargar PDF.');
      }
    } catch {
      // user cancelled
    }
  };

  if (!data) return null;
  const { collection: c, sale: s, totalPaid, balance } = data;

  return (
    <Modal
      open={!!data}
      onClose={onClose}
      title="Ticket de abono"
      description="Comprobante del pago parcial registrado."
      size="sm"
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          <button className="btn-secondary" onClick={onClose}>Cerrar</button>
          <button className="btn-secondary" onClick={share}><Share2 size={15} /> Compartir</button>
          <button className="btn-primary" onClick={() => window.print()}><Download size={15} /> Descargar PDF</button>
        </div>
      }
    >
      <div className="receipt-print-area space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-ink-200 pb-4">
          <div>
            <p className="text-xs text-ink-400 uppercase font-semibold tracking-wide">{company.name}</p>
            <h2 className="text-base font-bold text-ink-900 mt-0.5">Ticket de abono</h2>
            <p className="text-xs text-ink-400">Comprobante interno · no fiscal</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-ink-400 uppercase font-semibold">Folio venta</p>
            <p className="font-mono font-bold text-ink-900">{s.invoice_number ?? '—'}</p>
          </div>
        </div>

        {/* Client + date */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-ink-400 uppercase font-semibold">Cliente</p>
            <p className="font-medium text-ink-800">{s.customer?.name ?? '—'}</p>
            {s.customer?.phone && <p className="text-xs text-ink-400">{s.customer.phone}</p>}
          </div>
          <div className="text-right">
            <p className="text-xs text-ink-400 uppercase font-semibold">Fecha abono</p>
            <p className="font-medium text-ink-800">{formatDateTime(c.collection_date)}</p>
          </div>
        </div>

        {/* Payment row */}
        <div className="rounded-lg border border-ink-200 overflow-hidden">
          <div className="bg-ink-50/60 px-4 py-2 flex items-center gap-2 text-xs font-semibold text-ink-600 uppercase tracking-wide">
            <Banknote size={13} /> Detalle del abono
          </div>
          <div className="px-4 py-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-500">Método de pago</span>
              <span className="font-medium text-ink-800">{METHOD_LABELS[c.payment_method] ?? c.payment_method}</span>
            </div>
            {c.reference && (
              <div className="flex justify-between">
                <span className="text-ink-500">Referencia</span>
                <span className="font-medium text-ink-800">{c.reference}</span>
              </div>
            )}
          </div>
        </div>

        {/* Totals */}
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-ink-500">Total de la venta</span>
            <span className="font-medium text-ink-800">{formatCurrency(s.total)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-500">Abonos anteriores</span>
            <span className="font-medium text-ink-800">{formatCurrency(totalPaid - c.amount)}</span>
          </div>
          <div className="flex justify-between border-t border-ink-200 pt-1.5">
            <span className="font-semibold text-brand-700">Este abono</span>
            <span className="font-bold text-brand-700 text-base">{formatCurrency(c.amount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold text-ink-700">Total abonado</span>
            <span className="font-bold text-success-700">{formatCurrency(totalPaid)}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold text-ink-700">Saldo pendiente</span>
            <span className={`font-bold text-base ${balance <= 0.009 ? 'text-success-700' : 'text-danger-600'}`}>
              {balance <= 0.009 ? 'PAGADO' : formatCurrency(balance)}
            </span>
          </div>
        </div>

        {c.notes && (
          <p className="text-xs text-ink-400 border-t border-ink-100 pt-3">Notas: {c.notes}</p>
        )}

        <div className="pt-3 border-t border-ink-200 text-center text-xs text-ink-400">
          Gracias por su pago.
        </div>
      </div>
    </Modal>
  );
}
