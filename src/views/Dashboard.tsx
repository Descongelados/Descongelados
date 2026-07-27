import { useEffect, useState } from 'react';
import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Package,
  AlertTriangle,
  Wallet,
  ArrowRight,
  Clock,
  Calendar,
  Banknote,
  Pencil,
  Check,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCurrency, formatDate, formatNumber } from '../lib/format';
import StatCard from '../components/ui/StatCard';
import PageHeader from '../components/ui/PageHeader';
import Badge from '../components/ui/Badge';
import { FullPageLoader } from '../components/ui/Spinner';
import EmptyState from '../components/ui/EmptyState';
import { ViewKey } from '../components/Sidebar';


type DashboardData = {
  totalSales: number;
  totalPurchases: number;
  totalCollected: number;
  weekSalesCollected: number;
  bankSalesCollected: number;
  totalToCollect: number;
  totalToPay: number;
  cashSales: number;
  cashExpenses: number;
  bankExpenses: number;
  lowStockCount: number;
  recentSales: Array<{
    id: string;
    invoice_number: string | null;
    total: number;
    sale_date: string;
    status: string;
    customer: { name: string } | null;
  }>;
  lowStockProducts: Array<{ id: string; sku: string; name: string; stock: number; min_stock: number }>;
};

/** Returns ISO date strings for Monday and Sunday of the current week (Mon–Sun). */
function currentWeekRange(): { monday: string; sunday: string; label: string } {
  const now = new Date();
  const day = now.getDay(); // 0 Sun … 6 Sat
  // Days back to Monday (Sunday counts as end of previous week → -6)
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const labelFmt = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' });
  const label = `${labelFmt.format(monday)} – ${labelFmt.format(sunday)}`;

  return { monday: fmt(monday), sunday: fmt(sunday), label };
}

export default function Dashboard({ onNavigate }: { onNavigate: (view: ViewKey) => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Efectivo inicial — persisted in Supabase app_settings
  const [cashInitial, setCashInitial] = useState<number>(0);
  const [editingCash, setEditingCash] = useState(false);
  const [cashDraft, setCashDraft] = useState('');

  useEffect(() => {
    supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'dashboard_cash_initial')
      .maybeSingle()
      .then(({ data: row }) => {
        if (row) setCashInitial(Number((row.value as { amount: number }).amount) || 0);
      });
  }, []);

  const startEditCash = () => {
    setCashDraft(String(cashInitial));
    setEditingCash(true);
  };
  const commitCash = async () => {
    const val = Math.max(0, Number(cashDraft) || 0);
    setCashInitial(val);
    setEditingCash(false);
    await supabase
      .from('app_settings')
      .upsert({ key: 'dashboard_cash_initial', value: { amount: val } });
  };

  const { monday, sunday, label: weekLabel } = currentWeekRange();

  useEffect(() => {
    const load = async () => {
      setData(null);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const applyWeek = (query: any, dateCol: string) =>
        query.gte(dateCol, monday).lte(dateCol, `${sunday}T23:59:59`);

      // ── Fase 1: queries independientes (no necesitan IDs de otras tablas) ──
      const [
        salesRes,
        purchasesRes,
        collectionsRes,
        supplierPaymentsRes,
        lowStockRes,
        recentSalesRes,
        allWeekSalesRes,
        allDeliveredSalesRes,
        allPurchasesRes,
      ] = await Promise.all([
        applyWeek(supabase.from('sales').select('total').eq('status', 'confirmada'), 'sale_date'),
        applyWeek(supabase.from('purchases').select('total').eq('status', 'confirmada'), 'purchase_date'),
        applyWeek(supabase.from('collections').select('amount, payment_method'), 'collection_date'),
        applyWeek(supabase.from('supplier_payments').select('amount, payment_method'), 'payment_date'),
        supabase.from('low_stock_products').select('id, sku, name, stock, min_stock'),
        // Últimas 10 ventas para display
        supabase
          .from('sales')
          .select('id, invoice_number, total, sale_date, status, customer:customers(name)')
          .gte('sale_date', monday)
          .lte('sale_date', `${sunday}T23:59:59`)
          .order('sale_date', { ascending: false })
          .limit(10),
        // Todos los IDs de ventas de la semana (sin límite) para calcular cobros
        supabase
          .from('sales')
          .select('id')
          .eq('status', 'confirmada')
          .gte('sale_date', monday)
          .lte('sale_date', `${sunday}T23:59:59`),
        // Ventas entregadas (sin límite de fecha) para calcular saldo por cobrar
        supabase
          .from('sales')
          .select('id, total')
          .eq('status', 'confirmada')
          .eq('delivery_status', 'entregado'),
        // Compras confirmadas (sin límite de fecha) para calcular saldo por pagar
        supabase.from('purchases').select('id, total').eq('status', 'confirmada'),
      ]);

      if (salesRes.error || purchasesRes.error || collectionsRes.error || supplierPaymentsRes.error || lowStockRes.error) {
        setError('No se pudieron cargar las métricas');
        return;
      }

      // IDs necesarios para filtrar collections y supplier_payments en Fase 2
      const deliveredSales = (allDeliveredSalesRes.data ?? []) as Array<{ id: string; total: number }>;
      const allPurchases   = (allPurchasesRes.data      ?? []) as Array<{ id: string; total: number }>;

      const deliveredSaleIds  = deliveredSales.map((s) => s.id);
      // Usar query sin límite para tener TODOS los IDs de ventas de la semana
      const weekSaleIds       = new Set(((allWeekSalesRes.data ?? []) as Array<{ id: string }>).map((s) => s.id));
      const allPurchaseIds    = allPurchases.map((p) => p.id);

      // IDs de ventas que necesitamos cobros: entregadas + semana actual (union)
      const saleIdsForCollections = [...new Set([...deliveredSaleIds, ...weekSaleIds])];

      // ── Fase 2: queries filtradas por IDs conocidos ──
      const [allCollectionsRes, allSupPaymentsRes] = await Promise.all([
        saleIdsForCollections.length > 0
          ? supabase.from('collections').select('sale_id, amount, payment_method').in('sale_id', saleIdsForCollections)
          : Promise.resolve({ data: [], error: null }),
        allPurchaseIds.length > 0
          ? supabase.from('supplier_payments').select('purchase_id, amount').in('purchase_id', allPurchaseIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      const sum = (rows: Array<{ total?: number; amount?: number }>) =>
        rows.reduce((acc, r) => acc + (r.total ?? r.amount ?? 0), 0);

      const totalSales = sum((salesRes.data ?? []) as Array<{ total: number }>);
      const totalPurchases = sum((purchasesRes.data ?? []) as Array<{ total: number }>);

      type PayRow = { amount: number; payment_method: string };
      const collections = (collectionsRes.data ?? []) as PayRow[];
      const supplierPayments = (supplierPaymentsRes.data ?? []) as PayRow[];

      const totalCollected = collections.reduce((s, r) => s + r.amount, 0);
      const totalPaid = supplierPayments.reduce((s, r) => s + r.amount, 0);

      // gastos en efectivo = pagos a proveedores en efectivo esta semana
      const cashExpenses = supplierPayments
        .filter((r) => r.payment_method === 'efectivo')
        .reduce((s, r) => s + r.amount, 0);

      const actualLowStock = (lowStockRes.data ?? []) as Array<{ id: string; sku: string; name: string; stock: number; min_stock: number }>;

      // Saldo real por cobrar: suma de (total - cobrado) de ventas entregadas con saldo > 0
      const colBySale = new Map<string, number>();
      for (const c of (allCollectionsRes.data ?? []) as Array<{ sale_id: string | null; amount: number }>) {
        if (c.sale_id) colBySale.set(c.sale_id, (colBySale.get(c.sale_id) ?? 0) + c.amount);
      }
      const totalToCollect = deliveredSales.reduce((acc, s) => {
        const balance = s.total - (colBySale.get(s.id) ?? 0);
        return acc + Math.max(0, balance);
      }, 0);

      // Saldo real por pagar: suma de (total - pagado) de compras con saldo > 0
      const payByPurchase = new Map<string, number>();
      for (const p of (allSupPaymentsRes.data ?? []) as Array<{ purchase_id: string | null; amount: number }>) {
        if (p.purchase_id) payByPurchase.set(p.purchase_id, (payByPurchase.get(p.purchase_id) ?? 0) + p.amount);
      }
      const totalToPay = allPurchases.reduce((acc, p) => {
        const balance = p.total - (payByPurchase.get(p.id) ?? 0);
        return acc + Math.max(0, balance);
      }, 0);

      // Cobros de ventas creadas esta semana — efectivo y banco desde el mismo conjunto
      type ColRow = { sale_id: string | null; amount: number; payment_method: string };
      const weekCollections = (allCollectionsRes.data ?? [] as ColRow[])
        .filter((c: ColRow) => c.sale_id && weekSaleIds.has(c.sale_id));
      const weekSalesCollected  = weekCollections.reduce((s: number, c: ColRow) => s + c.amount, 0);
      const cashSales           = weekCollections.filter((c: ColRow) => c.payment_method === 'efectivo').reduce((s: number, c: ColRow) => s + c.amount, 0);
      const bankSalesCollected  = weekCollections.filter((c: ColRow) => c.payment_method === 'banco').reduce((s: number, c: ColRow) => s + c.amount, 0);
      const bankExpenses        = totalPaid - cashExpenses;

      setData({
        totalSales,
        totalPurchases,
        totalCollected,
        weekSalesCollected,
        bankSalesCollected,
        totalToCollect,
        totalToPay,
        cashSales,
        cashExpenses,
        bankExpenses,
        lowStockCount: actualLowStock.length,
        recentSales: (recentSalesRes.data ?? []) as unknown as DashboardData['recentSales'],
        lowStockProducts: actualLowStock.slice(0, 5),
      });
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <EmptyState icon={AlertTriangle} title={error} description="Revisa la conexión e inténtalo de nuevo." />;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Panel de control"
        description="Resumen general de tu operación comercial"
        actions={
          <div className="flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-2 shadow-sm text-xs text-ink-600">
            <Calendar size={14} className="text-brand-500" />
            <span className="font-semibold text-ink-800">{weekLabel}</span>
            <span className="text-ink-400">· semana actual</span>
          </div>
        }
      />

      {!data ? (
        <FullPageLoader label="Cargando panel…" />
      ) : (
        <>
          {/* ── Resumen de la semana ── */}
          <div className="card p-5 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={18} className="text-brand-600" />
              <h3 className="font-semibold text-ink-900">Resumen de la semana</h3>
              <span className="ml-1 text-xs text-ink-400">· esta semana</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">

              {/* Cobrado */}
              <div className="rounded-xl bg-success-50 border border-success-200 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-success-600 mb-1">Cobrado</p>
                <p className="text-xl font-bold text-success-700">{formatCurrency(data.weekSalesCollected)}</p>
                <div className="flex gap-3 mt-2 pt-2 border-t border-success-200">
                  <div className="flex-1">
                    <p className="text-[11px] text-success-500 uppercase font-semibold">Efectivo</p>
                    <p className="text-sm font-bold text-success-700">{formatCurrency(data.cashSales)}</p>
                  </div>
                  <div className="w-px bg-success-200" />
                  <div className="flex-1">
                    <p className="text-[11px] text-success-500 uppercase font-semibold">Banco</p>
                    <p className="text-sm font-bold text-success-700">{formatCurrency(data.bankSalesCollected)}</p>
                  </div>
                </div>
              </div>

              {/* Compras */}
              <div className="rounded-xl bg-brand-50 border border-brand-200 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-600 mb-1">Compras</p>
                <p className="text-xl font-bold text-brand-700">{formatCurrency(data.totalPurchases)}</p>
                <div className="flex gap-3 mt-2 pt-2 border-t border-brand-200">
                  <div className="flex-1">
                    <p className="text-[11px] text-brand-400 uppercase font-semibold">Efectivo</p>
                    <p className="text-sm font-bold text-brand-700">{formatCurrency(data.cashExpenses)}</p>
                  </div>
                  <div className="w-px bg-brand-200" />
                  <div className="flex-1">
                    <p className="text-[11px] text-brand-400 uppercase font-semibold">Banco</p>
                    <p className="text-sm font-bold text-brand-700">{formatCurrency(data.bankExpenses)}</p>
                  </div>
                </div>
              </div>

              {/* Por cobrar */}
              <div className="rounded-xl bg-accent-50 border border-accent-200 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-accent-600 mb-1">Por cobrar</p>
                <p className="text-xl font-bold text-accent-700">{formatCurrency(data.totalToCollect)}</p>
                <p className="text-[11px] text-accent-500 mt-2">Ventas entregadas sin cobrar</p>
              </div>

              {/* Por pagar */}
              <div className="rounded-xl bg-warning-50 border border-warning-200 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-warning-600 mb-1">Por pagar</p>
                <p className="text-xl font-bold text-warning-700">{formatCurrency(data.totalToPay)}</p>
                <p className="text-[11px] text-warning-500 mt-2">Compras sin pagar</p>
              </div>

            </div>
          </div>

          {/* ── Resumen Efectivo ── */}
          <div className="card p-5 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Banknote size={18} className="text-success-600" />
              <h3 className="font-semibold text-ink-900">Resumen Efectivo</h3>
              <span className="ml-1 text-xs text-ink-400">· esta semana</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">

              {/* Efectivo inicial */}
              <div className="rounded-xl bg-ink-50 border border-ink-200 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-500 mb-1">Efectivo inicial</p>
                {editingCash ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-ink-500">$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="input py-1 text-base font-bold w-full"
                      value={cashDraft}
                      onChange={(e) => setCashDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') commitCash(); if (e.key === 'Escape') setEditingCash(false); }}
                      autoFocus
                    />
                    <button onClick={commitCash} className="rounded-lg p-1.5 bg-success-50 text-success-600 hover:bg-success-100 transition" title="Confirmar">
                      <Check size={15} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-bold text-ink-900">{formatCurrency(cashInitial)}</span>
                    <button onClick={startEditCash} className="rounded-lg p-1 text-ink-400 hover:bg-ink-200 hover:text-ink-700 transition" title="Editar">
                      <Pencil size={13} />
                    </button>
                  </div>
                )}
                <p className="text-[11px] text-ink-400 mt-1">Editable · no se guarda en BD</p>
              </div>

              {/* Ventas en efectivo */}
              <div className="rounded-xl bg-success-50 border border-success-200 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-success-600 mb-1">Ventas en efectivo</p>
                <p className="text-xl font-bold text-success-700">{formatCurrency(data.cashSales)}</p>
                <p className="text-[11px] text-success-500 mt-1">Cobros en efectivo</p>
              </div>

              {/* Gastos en efectivo */}
              <div className="rounded-xl bg-danger-50 border border-danger-200 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-danger-600 mb-1">Gastos en efectivo</p>
                <p className="text-xl font-bold text-danger-700">{formatCurrency(data.cashExpenses)}</p>
                <p className="text-[11px] text-danger-500 mt-1">Pagos a proveedores</p>
              </div>

              {/* Balance */}
              {(() => {
                const balance = cashInitial + data.cashSales - data.cashExpenses;
                const positive = balance >= 0;
                return (
                  <div className={`rounded-xl border px-4 py-3 ${positive ? 'bg-brand-50 border-brand-200' : 'bg-warning-50 border-warning-200'}`}>
                    <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${positive ? 'text-brand-600' : 'text-warning-600'}`}>Balance</p>
                    <p className={`text-xl font-bold ${positive ? 'text-brand-700' : 'text-warning-700'}`}>{formatCurrency(balance)}</p>
                    <p className={`text-[11px] mt-1 ${positive ? 'text-brand-400' : 'text-warning-500'}`}>
                      Inicial + ventas − gastos
                    </p>
                  </div>
                );
              })()}

            </div>
          </div>

          {/* ── Ventas de la semana + Cobranza realizada ── */}
          <div className="card p-5 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Wallet size={18} className="text-success-600" />
              <h3 className="font-semibold text-ink-900">Ventas de la semana + Cobranza realizada</h3>
              <span className="ml-1 text-xs text-ink-400">· esta semana</span>
            </div>
            <div className="flex items-start gap-3 mb-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-success-50 text-success-600 shrink-0">
                <Wallet size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-ink-900">{formatCurrency(data.totalCollected)}</p>
                <p className="text-sm text-ink-500">Total cobrado esta semana</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl bg-success-50 border border-success-200 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-success-600 mb-1">Efectivo</p>
                <p className="text-xl font-bold text-success-700">{formatCurrency(data.cashSales)}</p>
              </div>
              <div className="rounded-xl bg-brand-50 border border-brand-200 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-600 mb-1">Banco</p>
                <p className="text-xl font-bold text-brand-700">{formatCurrency(data.totalCollected - data.cashSales)}</p>
              </div>
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Clock size={18} className="text-brand-600" />
                <h3 className="font-semibold text-ink-900">Ventas recientes</h3>
              </div>
              <button
                onClick={() => onNavigate('sales')}
                className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1"
              >
                Ver todas <ArrowRight size={12} />
              </button>
            </div>
            {data.recentSales.length === 0 ? (
              <EmptyState icon={TrendingUp} title="Sin ventas aún" description="Las ventas registradas aparecerán aquí." />
            ) : (
              <div className="space-y-1">
                {data.recentSales.map((sale) => (
                  <div
                    key={sale.id}
                    className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 hover:bg-ink-50 transition"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink-800 truncate">
                        {sale.customer?.name ?? 'Cliente eliminado'}
                      </p>
                      <p className="text-xs text-ink-500">
                        {sale.invoice_number ? `Folio ${sale.invoice_number} · ` : ''}
                        {formatDate(sale.sale_date)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-ink-900">{formatCurrency(sale.total)}</p>
                      <Badge variant={sale.status === 'confirmada' ? 'success' : 'neutral'}>{sale.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
