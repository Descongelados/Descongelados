import { Share2, Download, Clock } from 'lucide-react';
import { Collection, Customer, Sale } from '../../lib/types';
import { formatCurrency, formatDateTime } from '../../lib/format';
import Modal from './Modal';
import { useToast } from './Toast';
import { loadCompany } from '../../lib/auth';

type SaleRow = Sale & { customer: Customer | null };

type Props = {
  sale: SaleRow | null;
  collections: Collection[];
  totalPaid: number;
  onClose: () => void;
};

const METHOD_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  banco: 'Banco',
  por_pagar: 'Por pagar',
  combinado: 'Combinado',
};

export default function AbonosHistorialModal({ sale, collections, totalPaid, onClose }: Props) {
  const { push } = useToast();
  const company = loadCompany();

  const balance = (sale?.total ?? 0) - totalPaid;
  // Sort chronologically (oldest first) for historial display
  const sorted = [...collections].sort(
    (a, b) => new Date(a.collection_date).getTime() - new Date(b.collection_date).getTime(),
  );

  const share = async () => {
    if (!sale) return;
    let running = 0;
    const lines = sorted.map((c, i) => {
      running += c.amount;
      return (
        `Abono ${i + 1}: ${formatDateTime(c.collection_date)} — ${METHOD_LABELS[c.payment_method] ?? c.payment_method} — ${formatCurrency(c.amount)}` +
        (c.reference ? ` (Ref: ${c.reference})` : '')
      );
    });
    const text =
      `HISTORIAL DE ABONOS\n` +
      `Empresa: ${company.name}\n` +
      `Folio: ${sale.invoice_number ?? '—'}\n` +
      `Cliente: ${sale.customer?.name ?? '—'}\n` +
      `Total venta: ${formatCurrency(sale.total)}\n\n` +
      lines.join('\n') +
      `\n\nTotal abonado: ${formatCurrency(running)}\n` +
      `Saldo pendiente: ${balance <= 0.009 ? 'PAGADO' : formatCurrency(balance)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `Abonos ${sale.invoice_number ?? ''}`, text });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        push('success', 'Historial copiado al portapapeles');
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
      title="Historial de abonos"
      description={sale ? `Venta ${sale.invoice_number ?? '—'} · ${sale.customer?.name ?? '—'}` : ''}
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          <button className="btn-secondary" onClick={onClose}>Cerrar</button>
          <button className="btn-secondary" onClick={share}><Share2 size={15} /> Compartir</button>
          <button className="btn-primary" onClick={() => window.print()}><Download size={15} /> Descargar PDF</button>
        </div>
      }
    >
      {sale && (
        <div className="receipt-print-area space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between border-b border-ink-200 pb-4">
            <div>
              <p className="text-xs text-ink-400 uppercase font-semibold tracking-wide">{company.name}</p>
              <h2 className="text-base font-bold text-ink-900 mt-0.5">Historial de abonos</h2>
              <p className="text-xs text-ink-400">Comprobante interno · no fiscal</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-ink-400 uppercase font-semibold">Folio venta</p>
              <p className="font-mono font-bold text-ink-900">{sale.invoice_number ?? '—'}</p>
            </div>
          </div>

          {/* Client */}
          <div className="text-sm">
            <p className="text-xs text-ink-400 uppercase font-semibold">Cliente</p>
            <p className="font-medium text-ink-800">{sale.customer?.name ?? '—'}</p>
            {sale.customer?.phone && <p className="text-xs text-ink-400">{sale.customer.phone}</p>}
          </div>

          {/* Abonos table */}
          <div className="border border-ink-200 rounded-lg overflow-hidden">
            <div className="bg-ink-50/60 px-4 py-2 flex items-center gap-2 text-xs font-semibold text-ink-600 uppercase tracking-wide">
              <Clock size={13} /> Abonos realizados ({sorted.length})
            </div>
            {sorted.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-ink-400">Sin abonos registrados</p>
            ) : (
              <table className="min-w-full divide-y divide-ink-100 text-sm">
                <thead className="bg-ink-50/40">
                  <tr>
                    <th className="table-head">#</th>
                    <th className="table-head">Fecha</th>
                    <th className="table-head">Método</th>
                    <th className="table-head">Referencia</th>
                    <th className="table-head text-right">Monto</th>
                    <th className="table-head text-right">Acumulado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {(() => {
                    let running = 0;
                    return sorted.map((c, i) => {
                      running += c.amount;
                      return (
                        <tr key={c.id} className="hover:bg-ink-50/40 transition">
                          <td className="table-cell text-xs text-ink-400 font-mono">{i + 1}</td>
                          <td className="table-cell text-xs">{formatDateTime(c.collection_date)}</td>
                          <td className="table-cell">
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-brand-50 text-brand-700">
                              {METHOD_LABELS[c.payment_method] ?? c.payment_method}
                            </span>
                          </td>
                          <td className="table-cell text-xs text-ink-500">{c.reference ?? '—'}</td>
                          <td className="table-cell text-right font-semibold text-brand-700">
                            {formatCurrency(c.amount)}
                          </td>
                          <td className="table-cell text-right text-xs text-ink-500">
                            {formatCurrency(running)}
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            )}
          </div>

          {/* Summary */}
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-500">Total de la venta</span>
              <span className="font-medium text-ink-800">{formatCurrency(sale.total)}</span>
            </div>
            <div className="flex justify-between border-t border-ink-200 pt-1.5">
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

          <div className="pt-3 border-t border-ink-200 text-center text-xs text-ink-400">
            Historial generado el {formatDateTime(new Date().toISOString())}
          </div>
        </div>
      )}
    </Modal>
  );
}
