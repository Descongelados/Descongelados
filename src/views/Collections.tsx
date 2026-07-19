import { useEffect, useMemo, useState } from 'react';
import {
  Truck,
  Wallet,
  Search,
  Banknote,
  Building,
  Layers,
  CheckCircle2,
  PackageCheck,
  AlertCircle,
  Receipt,
  Pencil,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Collection, Customer, Sale } from '../lib/types';
import { formatCurrency, formatDate, fromDateInputValue, toDateInputValue } from '../lib/format';
import PageHeader from '../components/ui/PageHeader';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { useToast } from '../components/ui/Toast';
import { FullPageLoader } from '../components/ui/Spinner';
import SaleReceiptModal from '../components/ui/SaleReceiptModal';
import { useAuth } from '../lib/auth';

type SaleRow = Sale & { customer: Customer | null };
type CollectionRow = Collection & {
  customer: Customer | null;
  sale: Sale | null;
};

const PAYMENT_METHODS = [
  { value: 'efectivo', label: 'Efectivo', icon: Banknote },
  { value: 'banco', label: 'Banco', icon: Building },
  { value: 'por_pagar', label: 'Por pagar', icon: Wallet },
  { value: 'combinado', label: 'Combinado', icon: Layers },
];

type PaymentForm = {
  customer_id: string;
  sale_id: string;
  method: string;
  amount: string;
  efectivo: string;
  banco: string;
  por_pagar: string;
  reference: string;
  payment_date: string;
  notes: string;
};

const emptyPaymentForm = (): PaymentForm => ({
  customer_id: '',
  sale_id: '',
  method: 'efectivo',
  amount: '0',
  efectivo: '0',
  banco: '0',
  por_pagar: '0',
  reference: '',
  payment_date: toDateInputValue(new Date()),
  notes: '',
});

type Props = { onDataChanged?: () => void };

export default function Collections({ onDataChanged }: Props) {
  const { can } = useAuth();
  const canEdit = can('collections:edit');
  const { push } = useToast();
  const [tab, setTab] = useState<'entregas' | 'cobranza' | 'cobradas'>('entregas');
  const [sales, setSales] = useState<SaleRow[] | null>(null);
  const [collections, setCollections] = useState<CollectionRow[] | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<SaleRow | null>(null);
  const [paymentForm, setPaymentForm] = useState<PaymentForm>(emptyPaymentForm());
  const [saving, setSaving] = useState(false);

  const [editPayment, setEditPayment] = useState<CollectionRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CollectionRow | null>(null);
  const [confirmDelivery, setConfirmDelivery] = useState<SaleRow | null>(null);
  const [receiptSale, setReceiptSale] = useState<SaleRow | null>(null);

  const load = async () => {
    setLoading(true);
    const [sRes, cRes, custRes] = await Promise.all([
      supabase
        .from('sales')
        .select('*, customer:customers(*)')
        .eq('status', 'confirmada')
        .order('sale_date', { ascending: false }),
      supabase
        .from('collections')
        .select('*, customer:customers(*), sale:sales(*)')
        .order('collection_date', { ascending: false }),
      supabase.from('customers').select('*').order('name'),
    ]);
    if (sRes.error) {
      push('error', 'No se pudieron cargar las ventas');
      setSales([]);
    } else {
      setSales(sRes.data as SaleRow[]);
    }
    if (cRes.error) {
      push('error', 'No se pudo cargar la cobranza');
      setCollections([]);
    } else {
      setCollections(cRes.data as CollectionRow[]);
    }
    if (!custRes.error) setCustomers(custRes.data as Customer[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { monday: weekStart, sunday: weekEnd } = useMemo(() => {
    const now = new Date();
    const diff = now.getDay() === 0 ? -6 : 1 - now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return { monday, sunday };
  }, []);

  const paidBySale = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of collections ?? []) {
      if (c.sale_id) {
        map.set(c.sale_id, (map.get(c.sale_id) ?? 0) + c.amount);
      }
    }
    return map;
  }, [collections]);

  const salesWithBalance = useMemo(() => {
    return (sales ?? []).map((s) => ({
      ...s,
      paid: paidBySale.get(s.id) ?? 0,
      balance: s.total - (paidBySale.get(s.id) ?? 0),
    }));
  }, [sales, paidBySale]);

  // Sales within the current week (used for entregas + cobradas tabs)
  const salesWithBalanceWeek = useMemo(
    () => salesWithBalance.filter((s) => {
      const d = new Date(s.sale_date);
      return d >= weekStart && d <= weekEnd;
    }),
    [salesWithBalance, weekStart, weekEnd],
  );

  const pendingDeliveries = useMemo(
    () => salesWithBalanceWeek.filter((s) => s.delivery_status === 'pendiente'),
    [salesWithBalanceWeek],
  );
  const deliveredSalesWeek = useMemo(
    () => salesWithBalanceWeek.filter((s) => s.delivery_status === 'entregado'),
    [salesWithBalanceWeek],
  );

  // All delivered sales regardless of date - used for Cobranza (pending payment)
  const deliveredSalesAll = useMemo(
    () => salesWithBalance.filter((s) => s.delivery_status === 'entregado'),
    [salesWithBalance],
  );

  // entregadas con saldo pendiente — acción requerida en Cobranza (ALL dates)
  const pendingPaymentSales = useMemo(
    () => deliveredSalesAll.filter((s) => s.balance > 0.009),
    [deliveredSalesAll],
  );

  // entregadas y totalmente pagadas — pestaña Ventas cobradas (current week only)
  const paidSales = useMemo(
    () => deliveredSalesWeek.filter((s) => s.balance <= 0.009),
    [deliveredSalesWeek],
  );

  // Registros de cobranza de ventas pendientes de pago (para la sección de historial en Cobranza)
  const pendingPaymentSaleIds = useMemo(
    () => new Set(pendingPaymentSales.map((s) => s.id)),
    [pendingPaymentSales],
  );

  // Registros de cobranza de ventas ya pagadas (para pestaña Ventas cobradas)
  const paidSaleIds = useMemo(
    () => new Set(paidSales.map((s) => s.id)),
    [paidSales],
  );

  const collectionsForPending = useMemo(
    () => (collections ?? []).filter((c) => c.sale_id && pendingPaymentSaleIds.has(c.sale_id)),
    [collections, pendingPaymentSaleIds],
  );

  const collectionsForPaid = useMemo(
    () => (collections ?? []).filter((c) => c.sale_id && paidSaleIds.has(c.sale_id)),
    [collections, paidSaleIds],
  );

  const filteredDeliveries = useMemo(() => {
    const list = tab === 'entregas' ? pendingDeliveries : deliveredSalesWeek;
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter(
      (s) =>
        s.customer?.name.toLowerCase().includes(q) ||
        s.invoice_number?.toLowerCase().includes(q),
    );
  }, [tab, pendingDeliveries, deliveredSalesWeek, search]);

  const totalCollectedToday = useMemo(() => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return (collections ?? [])
      .filter((c) => c.collection_date.slice(0, 10) === today)
      .reduce((acc, c) => acc + c.amount, 0);
  }, [collections]);

  const totalPendingCollect = useMemo(
    () => salesWithBalance.reduce((acc, s) => acc + Math.max(s.balance, 0), 0),
    [salesWithBalance],
  );

  const openRegisterPayment = (sale: SaleRow) => {
    setEditPayment(null);
    setPaymentTarget(sale);
    const balance = sale.total - (paidBySale.get(sale.id) ?? 0);
    setPaymentForm({
      ...emptyPaymentForm(),
      customer_id: sale.customer_id,
      sale_id: sale.id,
      amount: String(balance > 0 ? balance.toFixed(2) : '0'),
      efectivo: String(balance > 0 ? balance.toFixed(2) : '0'),
      banco: '0',
      por_pagar: '0',
    });
    setPaymentOpen(true);
  };

  const openEditCollectionPayment = (col: CollectionRow) => {
    setPaymentTarget(null);
    setEditPayment(col);
    setPaymentForm({
      customer_id: col.customer_id ?? '',
      sale_id: col.sale_id ?? '',
      method: col.payment_method ?? 'efectivo',
      amount: String(col.amount),
      efectivo: '0',
      banco: '0',
      por_pagar: '0',
      reference: col.reference ?? '',
      payment_date: toDateInputValue(new Date(col.collection_date)),
      notes: col.notes ?? '',
    });
    setPaymentOpen(true);
  };

  const combinedTotal = useMemo(() => {
    const e = Number(paymentForm.efectivo) || 0;
    const b = Number(paymentForm.banco) || 0;
    const p = Number(paymentForm.por_pagar) || 0;
    return e + b + p;
  }, [paymentForm.efectivo, paymentForm.banco, paymentForm.por_pagar]);

  const savePayment = async () => {
    if (editPayment) {
      const amount = Number(paymentForm.amount);
      if (!amount || amount <= 0) {
        push('error', 'El monto debe ser mayor a cero');
        return;
      }
      setSaving(true);
      const { error } = await supabase
        .from('collections')
        .update({
          customer_id: paymentForm.customer_id,
          sale_id: paymentForm.sale_id || null,
          amount,
          payment_method: paymentForm.method,
          reference: paymentForm.reference.trim() || null,
          collection_date: fromDateInputValue(paymentForm.payment_date),
          notes: paymentForm.notes.trim() || null,
        })
        .eq('id', editPayment.id);
      if (error) push('error', 'No se pudo actualizar el pago');
      else {
        push('success', 'Pago actualizado');
        setPaymentOpen(false);
        await load();
        onDataChanged?.();
      }
      setSaving(false);
      return;
    }

    if (!paymentTarget) return;
    const balance = paymentTarget.total - (paidBySale.get(paymentTarget.id) ?? 0);

    if (paymentForm.method === 'combinado') {
      const e = Number(paymentForm.efectivo) || 0;
      const b = Number(paymentForm.banco) || 0;
      const p = Number(paymentForm.por_pagar) || 0;
      const total = e + b + p;
      if (total <= 0) {
        push('error', 'El total combinado debe ser mayor a cero');
        return;
      }
      if (total > balance + 0.01) {
        push('error', `El total combinado excede el saldo pendiente (${formatCurrency(balance)})`);
        return;
      }
      setSaving(true);
      const baseDate = fromDateInputValue(paymentForm.payment_date);
      const rows: Array<Record<string, unknown>> = [];
      if (e > 0) rows.push({ customer_id: paymentTarget.customer_id, sale_id: paymentTarget.id, amount: e, payment_method: 'efectivo', reference: paymentForm.reference.trim() || null, collection_date: baseDate, notes: paymentForm.notes.trim() || null });
      if (b > 0) rows.push({ customer_id: paymentTarget.customer_id, sale_id: paymentTarget.id, amount: b, payment_method: 'banco', reference: paymentForm.reference.trim() || null, collection_date: baseDate, notes: paymentForm.notes.trim() || null });
      if (p > 0) rows.push({ customer_id: paymentTarget.customer_id, sale_id: paymentTarget.id, amount: p, payment_method: 'por_pagar', reference: paymentForm.reference.trim() || null, collection_date: baseDate, notes: paymentForm.notes.trim() || null });
      const { error } = await supabase.from('collections').insert(rows);
      if (error) push('error', 'No se pudo registrar el pago combinado');
      else {
        push('success', 'Pago combinado registrado');
        setPaymentOpen(false);
        await load();
        onDataChanged?.();
      }
      setSaving(false);
      return;
    }

    const amount = Number(paymentForm.amount);
    if (!amount || amount <= 0) {
      push('error', 'El monto debe ser mayor a cero');
      return;
    }
    if (amount > balance + 0.01) {
      push('error', `El monto excede el saldo pendiente (${formatCurrency(balance)})`);
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('collections').insert({
      customer_id: paymentTarget.customer_id,
      sale_id: paymentTarget.id,
      amount,
      payment_method: paymentForm.method,
      reference: paymentForm.reference.trim() || null,
      collection_date: fromDateInputValue(paymentForm.payment_date),
      notes: paymentForm.notes.trim() || null,
    });
    if (error) push('error', 'No se pudo registrar el pago');
    else {
      push('success', 'Pago registrado');
      setPaymentOpen(false);
      await load();
      onDataChanged?.();
    }
    setSaving(false);
  };

  const confirmDeliveryAction = async () => {
    if (!confirmDelivery) return;
    const { error } = await supabase
      .from('sales')
      .update({ delivery_status: 'entregado' })
      .eq('id', confirmDelivery.id);
    if (error) {
      push('error', 'No se pudo confirmar la entrega');
    } else {
      push('success', 'Entrega confirmada');
      await load();
      onDataChanged?.();
      setTab('cobranza');
    }
    setConfirmDelivery(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from('collections').delete().eq('id', deleteTarget.id);
    if (error) push('error', 'No se pudo eliminar el pago');
    else {
      push('success', 'Pago eliminado');
      await load();
      onDataChanged?.();
    }
    setDeleteTarget(null);
  };

  const selectedCustomer = customers.find((c) => c.id === paymentForm.customer_id);
  const targetBalance = paymentTarget
    ? paymentTarget.total - (paidBySale.get(paymentTarget.id) ?? 0)
    : 0;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Entrega & Cobranza"
        description="Confirma entregas de ventas y registra pagos de clientes"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-warning-50 text-warning-600">
              <Truck size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-ink-900">{pendingDeliveries.length}</p>
              <p className="text-sm text-ink-500">Entregas pendientes</p>
            </div>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <PackageCheck size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-ink-900">{deliveredSalesWeek.length}</p>
              <p className="text-sm text-ink-500">Entregas confirmadas esta semana</p>
            </div>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-success-50 text-success-600">
              <Wallet size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-ink-900">{formatCurrency(totalCollectedToday)}</p>
              <p className="text-sm text-ink-500">Cobrado hoy</p>
            </div>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-danger-50 text-danger-600">
              <Banknote size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-ink-900">{formatCurrency(totalPendingCollect)}</p>
              <p className="text-sm text-ink-500">Por cobrar</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 mb-4 border-b border-ink-200">
        <button
          onClick={() => setTab('entregas')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition border-b-2 -mb-px ${
            tab === 'entregas'
              ? 'border-brand-600 text-brand-700'
              : 'border-transparent text-ink-500 hover:text-ink-700'
          }`}
        >
          <Truck size={16} /> Entregas
          {pendingDeliveries.length > 0 ? (
            <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-warning-500 px-2 py-0.5 text-xs font-semibold text-white">
              <AlertCircle size={10} />
              {pendingDeliveries.length}
            </span>
          ) : (
            <span className="ml-1 rounded-full bg-ink-100 px-2 py-0.5 text-xs text-ink-600">
              0
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('cobranza')}
          className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition border-b-2 -mb-px ${
            tab === 'cobranza'
              ? 'border-brand-600 text-brand-700'
              : 'border-transparent text-ink-500 hover:text-ink-700'
          }`}
        >
          <Wallet size={16} /> Cobranza
          {pendingPaymentSales.length > 0 ? (
            <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-danger-500 px-2 py-0.5 text-xs font-semibold text-white">
              <AlertCircle size={10} />
              {pendingPaymentSales.length}
            </span>
          ) : (
            <span className="ml-1 rounded-full bg-ink-100 px-2 py-0.5 text-xs text-ink-600">
              {collections?.length ?? 0}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('cobradas')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition border-b-2 -mb-px ${
            tab === 'cobradas'
              ? 'border-brand-600 text-brand-700'
              : 'border-transparent text-ink-500 hover:text-ink-700'
          }`}
        >
          <CheckCircle2 size={16} /> Ventas cobradas
          <span className="ml-1 rounded-full bg-ink-100 px-2 py-0.5 text-xs text-ink-600">
            {paidSales.length}
          </span>
        </button>
      </div>

      <div className="card p-4 mb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              className="input pl-9"
              placeholder={tab === 'entregas' ? 'Buscar por cliente o folio.' : 'Buscar por cliente o referencia.'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {tab === 'entregas' ? (
        <div className="card overflow-hidden">
          {loading ? (
            <FullPageLoader />
          ) : filteredDeliveries.length === 0 ? (
            <EmptyState
              icon={Truck}
              title={tab === 'entregas' ? 'Sin entregas pendientes' : 'Sin entregas confirmadas'}
              description={
                tab === 'entregas'
                  ? 'Las ventas confirmadas aparecerán aquí para confirmar su entrega.'
                  : 'Aún no has confirmado entregas.'
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-ink-100">
                <thead className="bg-ink-50/60">
                  <tr>
                    <th className="table-head">Folio</th>
                    <th className="table-head">Cliente</th>
                    <th className="table-head">Fecha</th>
                    <th className="table-head text-right">Total</th>
                    <th className="table-head text-right">Pagado</th>
                    <th className="table-head text-right">Saldo</th>
                    <th className="table-head">Entrega</th>
                    <th className="table-head text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {filteredDeliveries.map((s) => (
                    <tr key={s.id} className="hover:bg-ink-50/60 transition">
                      <td className="table-cell font-mono text-xs">{s.invoice_number ?? '-'}</td>
                      <td className="table-cell font-semibold text-ink-900">{s.customer?.name ?? '-'}</td>
                      <td className="table-cell">{formatDate(s.sale_date)}</td>
                      <td className="table-cell text-right">{formatCurrency(s.total)}</td>
                      <td className="table-cell text-right text-success-600">{formatCurrency(s.paid)}</td>
                      <td className="table-cell text-right font-semibold">
                        {s.balance > 0 ? (
                          <span className="text-danger-600">{formatCurrency(s.balance)}</span>
                        ) : (
                          <span className="text-success-600">Pagado</span>
                        )}
                      </td>
                      <td className="table-cell">
                        {s.delivery_status === 'entregado' ? (
                          <Badge variant="success">
                            <CheckCircle2 size={12} /> Entregado
                          </Badge>
                        ) : (
                          <Badge variant="warning">Pendiente</Badge>
                        )}
                      </td>
                      <td className="table-cell text-right">
                        <div className="flex items-center justify-end gap-1">
                          {canEdit && s.delivery_status === 'pendiente' && (
                            <button
                              onClick={() => setConfirmDelivery(s)}
                              className="inline-flex items-center gap-1 rounded-lg bg-success-50 px-2.5 py-1.5 text-xs font-semibold text-success-700 hover:bg-success-100 transition"
                            >
                              <CheckCircle2 size={14} /> Confirmar entrega
                            </button>
                          )}
                          {canEdit && (
                          <button
                            onClick={() => openRegisterPayment(s)}
                            className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100 transition"
                          >
                            <Wallet size={14} /> Registrar pago
                          </button>
                          )}
                          <button
                            onClick={() => setReceiptSale(s)}
                            className="rounded-lg p-1.5 text-ink-500 hover:bg-success-50 hover:text-success-600 transition"
                            aria-label="Ver ticket"
                            title="Ver ticket"
                          >
                            <Receipt size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : tab === 'cobranza' ? (
        <div className="space-y-4">
          {/* Ventas entregadas con saldo pendiente - requieren acción */}
          {pendingPaymentSales.length > 0 && (
            <div className="card overflow-hidden border-danger-200">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-danger-100 bg-danger-50">
                <AlertCircle size={16} className="text-danger-600" />
                <h3 className="text-sm font-semibold text-danger-700">Requieren acción — Por cobrar</h3>
                <span className="ml-auto rounded-full bg-danger-500 px-2 py-0.5 text-xs font-semibold text-white">
                  {pendingPaymentSales.length}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-danger-100">
                  <thead className="bg-danger-50/40">
                    <tr>
                      <th className="table-head">Folio</th>
                      <th className="table-head">Cliente</th>
                      <th className="table-head">Fecha</th>
                      <th className="table-head text-right">Total</th>
                      <th className="table-head text-right">Pagado</th>
                      <th className="table-head text-right">Saldo pendiente</th>
                      <th className="table-head text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-danger-100">
                    {pendingPaymentSales.map((s) => (
                      <tr key={s.id} className="hover:bg-danger-50/30 transition">
                        <td className="table-cell font-mono text-xs">{s.invoice_number ?? '-'}</td>
                        <td className="table-cell font-semibold text-ink-900">{s.customer?.name ?? '-'}</td>
                        <td className="table-cell">{formatDate(s.sale_date)}</td>
                        <td className="table-cell text-right">{formatCurrency(s.total)}</td>
                        <td className="table-cell text-right text-success-600">{formatCurrency(s.paid)}</td>
                        <td className="table-cell text-right font-bold text-danger-600">
                          {formatCurrency(s.balance)}
                        </td>
                        <td className="table-cell text-right">
                          <div className="flex items-center justify-end gap-1">
                            {canEdit && (
                            <button
                              onClick={() => openRegisterPayment(s)}
                              className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition"
                            >
                              <Wallet size={14} /> Registrar pago
                            </button>
                            )}
                            <button
                              onClick={() => setReceiptSale(s)}
                              className="rounded-lg p-1.5 text-ink-500 hover:bg-success-50 hover:text-success-600 transition"
                              aria-label="Ver ticket"
                              title="Ver ticket"
                            >
                              <Receipt size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Historial de cobros parciales de ventas pendientes */}
          {collectionsForPending.length > 0 && (
            <div className="card overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-ink-100 bg-ink-50">
                <Wallet size={16} className="text-brand-600" />
                <h3 className="text-sm font-semibold text-ink-700">Cobros registrados (ventas pendientes)</h3>
                <span className="ml-auto rounded-full bg-ink-200 px-2 py-0.5 text-xs font-semibold text-ink-600">
                  {collectionsForPending.length}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-ink-100">
                  <thead className="bg-ink-50/60">
                    <tr>
                      <th className="table-head">Fecha</th>
                      <th className="table-head">Cliente</th>
                      <th className="table-head">Folio venta</th>
                      <th className="table-head">Método</th>
                      <th className="table-head text-right">Monto</th>
                      <th className="table-head">Referencia</th>
                      <th className="table-head">Notas</th>
                      {canEdit && <th className="table-head text-right">Acciones</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {collectionsForPending.map((col) => (
                      <tr key={col.id} className="hover:bg-ink-50/60 transition">
                        <td className="table-cell">{formatDate(col.collection_date)}</td>
                        <td className="table-cell font-semibold text-ink-900">{col.customer?.name ?? '-'}</td>
                        <td className="table-cell font-mono text-xs">{col.sale?.invoice_number ?? '-'}</td>
                        <td className="table-cell capitalize">{col.payment_method ?? '-'}</td>
                        <td className="table-cell text-right font-semibold text-success-600">{formatCurrency(col.amount)}</td>
                        <td className="table-cell text-ink-500">{col.reference ?? '-'}</td>
                        <td className="table-cell text-ink-500">{col.notes ?? '-'}</td>
                        {canEdit && (
                          <td className="table-cell text-right">
                            <button
                              onClick={() => openEditCollectionPayment(col)}
                              className="inline-flex items-center gap-1 rounded-lg bg-warning-50 px-2.5 py-1.5 text-xs font-semibold text-warning-700 hover:bg-warning-100 transition"
                              title="Modificar cobro"
                            >
                              <Pencil size={13} /> Modificar
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {pendingPaymentSales.length === 0 && (
            <div className="card p-5">
              <EmptyState
                icon={Wallet}
                title="Sin cobros pendientes"
                description="Todas las ventas entregadas están al corriente."
              />
            </div>
          )}
        </div>
      ) : (
        /* ── Pestaña: Ventas cobradas ── */
        <div className="space-y-4">
          <div className="card overflow-hidden">
            {loading ? (
              <FullPageLoader />
            ) : paidSales.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="Sin ventas cobradas aún"
                description="Las ventas entregadas y completamente pagadas aparecerán aquí."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-ink-100">
                  <thead className="bg-ink-50/60">
                    <tr>
                      <th className="table-head">Folio</th>
                      <th className="table-head">Cliente</th>
                      <th className="table-head">Fecha</th>
                      <th className="table-head text-right">Total</th>
                      <th className="table-head text-right">Total cobrado</th>
                      <th className="table-head">Estado</th>
                      <th className="table-head text-right">Ticket</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {paidSales.map((s) => (
                      <tr key={s.id} className="hover:bg-ink-50/60 transition">
                        <td className="table-cell font-mono text-xs">{s.invoice_number ?? '-'}</td>
                        <td className="table-cell font-semibold text-ink-900">{s.customer?.name ?? '-'}</td>
                        <td className="table-cell">{formatDate(s.sale_date)}</td>
                        <td className="table-cell text-right">{formatCurrency(s.total)}</td>
                        <td className="table-cell text-right font-semibold text-success-600">
                          {formatCurrency(s.paid)}
                        </td>
                        <td className="table-cell">
                          <Badge variant="success">
                            <CheckCircle2 size={12} /> Cobrada
                          </Badge>
                        </td>
                        <td className="table-cell text-right">
                          <button
                            onClick={() => setReceiptSale(s)}
                            className="rounded-lg p-1.5 text-ink-500 hover:bg-success-50 hover:text-success-600 transition"
                            aria-label="Ver ticket"
                            title="Ver ticket"
                          >
                            <Receipt size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Detalle de cobros de ventas ya pagadas */}
          {collectionsForPaid.length > 0 && (
            <div className="card overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-ink-100 bg-success-50">
                <CheckCircle2 size={16} className="text-success-600" />
                <h3 className="text-sm font-semibold text-success-700">Detalle de cobros (esta semana)</h3>
                <span className="ml-auto rounded-full bg-success-200 px-2 py-0.5 text-xs font-semibold text-success-700">
                  {collectionsForPaid.length}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-ink-100">
                  <thead className="bg-success-50/40">
                    <tr>
                      <th className="table-head">Fecha</th>
                      <th className="table-head">Cliente</th>
                      <th className="table-head">Folio venta</th>
                      <th className="table-head">Método</th>
                      <th className="table-head text-right">Monto</th>
                      <th className="table-head">Referencia</th>
                      <th className="table-head">Notas</th>
                      {canEdit && <th className="table-head text-right">Acciones</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {collectionsForPaid.map((col) => (
                      <tr key={col.id} className="hover:bg-success-50/20 transition">
                        <td className="table-cell">{formatDate(col.collection_date)}</td>
                        <td className="table-cell font-semibold text-ink-900">{col.customer?.name ?? '-'}</td>
                        <td className="table-cell font-mono text-xs">{col.sale?.invoice_number ?? '-'}</td>
                        <td className="table-cell capitalize">{col.payment_method ?? '-'}</td>
                        <td className="table-cell text-right font-semibold text-success-600">{formatCurrency(col.amount)}</td>
                        <td className="table-cell text-ink-500">{col.reference ?? '-'}</td>
                        <td className="table-cell text-ink-500">{col.notes ?? '-'}</td>
                        {canEdit && (
                          <td className="table-cell text-right">
                            <button
                              onClick={() => openEditCollectionPayment(col)}
                              className="inline-flex items-center gap-1 rounded-lg bg-warning-50 px-2.5 py-1.5 text-xs font-semibold text-warning-700 hover:bg-warning-100 transition"
                              title="Modificar cobro"
                            >
                              <Pencil size={13} /> Modificar
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      <Modal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        title={editPayment ? 'Editar pago' : 'Registrar pago'}
        description={
          paymentTarget
            ? `Venta ${paymentTarget.invoice_number ?? '-'} · ${paymentTarget.customer?.name ?? ''}`
            : 'Edita los datos del pago'
        }
        size="lg"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setPaymentOpen(false)} disabled={saving}>
              Cancelar
            </button>
            <button className="btn-success" onClick={savePayment} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar pago'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {paymentTarget && (
            <div className="rounded-lg bg-ink-50 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-500">Total de la venta</span>
                <span className="font-semibold text-ink-900">{formatCurrency(paymentTarget.total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-500">Pagado</span>
                <span className="font-semibold text-success-600">{formatCurrency(paidBySale.get(paymentTarget.id) ?? 0)}</span>
              </div>
              <div className="flex justify-between pt-1.5 border-t border-ink-200 mt-1.5">
                <span className="font-semibold text-ink-700">Saldo pendiente</span>
                <span className="font-bold text-danger-600">{formatCurrency(targetBalance)}</span>
              </div>
            </div>
          )}

          {editPayment && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Cliente</label>
                <select
                  className="input"
                  value={paymentForm.customer_id}
                  onChange={(e) => setPaymentForm({ ...paymentForm, customer_id: e.target.value })}
                >
                  <option value="">Selecciona…</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Venta asociada</label>
                <select
                  className="input"
                  value={paymentForm.sale_id}
                  onChange={(e) => setPaymentForm({ ...paymentForm, sale_id: e.target.value })}
                >
                  <option value="">Sin venta específica</option>
                  {(sales ?? [])
                    .filter((s) => s.customer_id === paymentForm.customer_id)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.invoice_number ?? 'Sin folio'} — {formatCurrency(s.total)}
                      </option>
                    ))}
                </select>
              </div>
            </div>
          )}

          <div>
            <label className="label">Método de pago</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {PAYMENT_METHODS.map((m) => {
                const Icon = m.icon;
                const active = paymentForm.method === m.value;
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setPaymentForm({ ...paymentForm, method: m.value })}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition ${
                      active
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-ink-200 bg-white text-ink-600 hover:bg-ink-50'
                    }`}
                  >
                    <Icon size={16} />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {paymentForm.method === 'combinado' ? (
            <div className="space-y-3">
              <div className="rounded-lg bg-warning-50 border border-warning-200 p-3 text-sm text-warning-700">
                Divide el pago entre los métodos disponibles. La suma debe ser menor o igual al saldo pendiente.
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="label flex items-center gap-1.5">
                    <Banknote size={12} /> Efectivo
                  </label>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    min="0"
                    value={paymentForm.efectivo}
                    onChange={(e) => setPaymentForm({ ...paymentForm, efectivo: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label flex items-center gap-1.5">
                    <Building size={12} /> Banco
                  </label>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    min="0"
                    value={paymentForm.banco}
                    onChange={(e) => setPaymentForm({ ...paymentForm, banco: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label flex items-center gap-1.5">
                    <Wallet size={12} /> Por pagar
                  </label>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    min="0"
                    value={paymentForm.por_pagar}
                    onChange={(e) => setPaymentForm({ ...paymentForm, por_pagar: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex justify-between rounded-lg bg-ink-50 p-3 text-sm">
                <span className="text-ink-500">Total combinado</span>
                <span className="font-bold text-ink-900">{formatCurrency(combinedTotal)}</span>
              </div>
              {paymentTarget && combinedTotal > targetBalance + 0.01 && (
                <p className="text-xs text-danger-600">
                  El total combinado excede el saldo pendiente ({formatCurrency(targetBalance)}).
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Monto *</label>
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  min="0"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Fecha</label>
                <input
                  className="input"
                  type="date"
                  value={paymentForm.payment_date}
                  onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
                />
              </div>
            </div>
          )}

          {paymentForm.method === 'combinado' && (
            <div>
              <label className="label">Fecha</label>
              <input
                className="input"
                type="date"
                value={paymentForm.payment_date}
                onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Referencia</label>
              <input
                className="input"
                value={paymentForm.reference}
                onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })}
                placeholder="Folio de transferencia, etc."
              />
            </div>
            <div>
              <label className="label">Notas</label>
              <input
                className="input"
                value={paymentForm.notes}
                onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                placeholder="Notas internas"
              />
            </div>
          </div>

          {selectedCustomer && !paymentTarget && (
            <div className="text-xs text-ink-500">
              Cliente: <span className="font-semibold text-ink-700">{selectedCustomer.name}</span>
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelivery}
        title="Confirmar entrega"
        message={`¿Confirmar la entrega de la venta ${confirmDelivery?.invoice_number ?? ''} a ${confirmDelivery?.customer?.name ?? ''}?`}
        onConfirm={confirmDeliveryAction}
        onCancel={() => setConfirmDelivery(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Eliminar pago"
        message="¿Eliminar este registro de cobranza? El saldo del cliente se recalculará."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
      <SaleReceiptModal sale={receiptSale} onClose={() => setReceiptSale(null)} />
    </div>
  );
}
