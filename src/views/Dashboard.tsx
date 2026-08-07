import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
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
import { useToast } from '../components/ui/Toast';
import { ViewKey } from '../components/Sidebar';


type KpisResult = {
  total_sales: number;
  total_purchases: number;
  total_collected: number;
  collected_cash: number;
  collected_bank: number;
  week_sales_collected: number;
  bank_sales_collected: number;
  total_to_collect: number;
  total_to_pay: number;
  cash_sales: number;
  cash_expenses: number;
  bank_expenses: number;
  low_stock_count: number;
};

type DashboardData = {
  totalSales: number;
  totalPurchases: number;
  totalCollected: number;
  collectedCash: number;
  collectedBank: number;
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

/**
 * Returns the Monday–Sunday range of the current week expressed as full ISO-8601
 * timestamps that include the local timezone offset, so Supabase (which stores
 * timestamptz in UTC) compares correctly against the user's local calendar week.
 *
 *   mondayISO → "2025-07-28T00:00:00-06:00"
 *   sundayISO → "2025-08-03T23:59:59-06:00"
 */
function currentWeekRange(): { mondayISO: string; sundayISO: string; label: string } {
  const now = new Date();
  const day = now.getDay(); // 0 Sun … 6 Sat
  // Days back to Monday (Sunday counts as end of previous week → -6)
  const diffToMonday = day === 0 ? -6 : 1 - day;

  // Build Monday at local 00:00:00
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);

  // Build Sunday at local 23:59:59
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  /** Format a Date as "YYYY-MM-DDTHH:mm:ss±HH:MM" preserving the local offset. */
  const toLocalISO = (d: Date): string => {
    const pad = (n: number, w = 2) => String(n).padStart(w, '0');
    const offsetMin = -d.getTimezoneOffset(); // positive east of UTC
    const sign = offsetMin >= 0 ? '+' : '-';
    const absMin = Math.abs(offsetMin);
    const offsetStr = `${sign}${pad(Math.floor(absMin / 60))}:${pad(absMin % 60)}`;
    return (
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
      `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${offsetStr}`
    );
  };

  const labelFmt = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' });
  const label = `${labelFmt.format(monday)} – ${labelFmt.format(sunday)}`;

  return { mondayISO: toLocalISO(monday), sundayISO: toLocalISO(sunday), label };
}

export type DashboardHandle = { refresh: () => void };

const Dashboard = forwardRef<DashboardHandle, { onNavigate: (view: ViewKey) => void }>(
function Dashboard({ onNavigate }, ref) {
  const { push } = useToast();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Efectivo inicial — persisted in Supabase app_settings
  const [cashInitial, setCashInitial] = useState<number>(0);
  const [editingCash, setEditingCash] = useState(false);
  const [cashDraft, setCashDraft] = useState('');
  const [cashSaving, setCashSaving] = useState(false);

  useEffect(() => {
    supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'dashboard_cash_initial')
      .maybeSingle()
      .then(({ data: row, error }) => {
        if (error) { push('error', 'No se pudo cargar el efectivo inicial'); return; }
        if (row) setCashInitial(Number((row.value as { amount: number }).amount) || 0);
      });
  }, []);

  const startEditCash = () => {
    setCashDraft(String(cashInitial));
    setEditingCash(true);
  };
  const commitCash = async () => {
    const val = Math.max(0, Number(cashDraft) || 0);
    setCashSaving(true);
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key: 'dashboard_cash_initial', value: { amount: val } });
    setCashSaving(false);
    if (error) {
      push('error', 'No se pudo guardar el efectivo inicial');
      return;
    }
    setCashInitial(val);
    setEditingCash(false);
  };

  const { mondayISO, sundayISO, label: weekLabel } = currentWeekRange();

  const loadRef = useRef<() => Promise<void>>();

  const load = async () => {
    setData(null);

    // Un solo Promise.all: RPC con todos los KPIs + 2 queries pequeñas de display
    const [kpisRes, recentSalesRes, lowStockRes] = await Promise.all([
      supabase.rpc('dashboard_kpis', {
        p_week_from: mondayISO,
        p_week_to:   sundayISO,
      }),
      supabase
        .from('sales')
        .select('id, invoice_number, total, sale_date, status, customer:customers(name)')
        .gte('sale_date', mondayISO)
        .lte('sale_date', sundayISO)
        .order('sale_date', { ascending: false })
        .limit(10),
      supabase.from('low_stock_products').select('id, sku, name, stock, min_stock'),
    ]);

    if (kpisRes.error || recentSalesRes.error || lowStockRes.error) {
      setError('No se pudieron cargar las métricas');
      return;
    }

    const k = kpisRes.data as KpisResult;
    const actualLowStock = (lowStockRes.data ?? []) as Array<{ id: string; sku: string; name: string; stock: number; min_stock: number }>;

    setData({
      totalSales:          Number(k.total_sales),
      totalPurchases:      Number(k.total_purchases),
      totalCollected:      Number(k.total_collected),
      collectedCash:       Number(k.collected_cash),
      collectedBank:       Number(k.collected_bank),
      weekSalesCollected:  Number(k.week_sales_collected),
      bankSalesCollected:  Number(k.bank_sales_collected),
      totalToCollect:      Number(k.total_to_collect),
      totalToPay:          Number(k.total_to_pay),
      cashSales:           Number(k.cash_sales),
      cashExpenses:        Number(k.cash_expenses),
      bankExpenses:        Number(k.bank_expenses),
      lowStockCount:       Number(k.low_stock_count),
      recentSales:         (recentSalesRes.data ?? []) as unknown as DashboardData['recentSales'],
      lowStockProducts:    actualLowStock.slice(0, 5),
    });
  };

  loadRef.current = load;

  // Exponer refresh() al padre sin re-montar el componente
  useImperativeHandle(ref, () => ({
    refresh: () => { loadRef.current?.(); },
  }), []);

  useEffect(() => {
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
                    <button onClick={commitCash} disabled={cashSaving} className="rounded-lg p-1.5 bg-success-50 text-success-600 hover:bg-success-100 transition disabled:opacity-50" title="Confirmar">
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
                <p className="text-[11px] text-ink-400 mt-1">Se guarda en configuración</p>
              </div>

              {/* Ventas en efectivo */}
              <div className="rounded-xl bg-success-50 border border-success-200 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-success-600 mb-1">Ventas en efectivo</p>
                <p className="text-xl font-bold text-success-700">{formatCurrency(data.collectedCash)}</p>
                <p className="text-[11px] text-success-500 mt-1">Cobros en efectivo · esta semana</p>
              </div>

              {/* Gastos en efectivo */}
              <div className="rounded-xl bg-danger-50 border border-danger-200 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-danger-600 mb-1">Gastos en efectivo</p>
                <p className="text-xl font-bold text-danger-700">{formatCurrency(data.cashExpenses)}</p>
                <p className="text-[11px] text-danger-500 mt-1">Pagos a proveedores</p>
              </div>

              {/* Balance */}
              {(() => {
                const balance = cashInitial + data.collectedCash - data.cashExpenses;
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
                <p className="text-xl font-bold text-success-700">{formatCurrency(data.collectedCash)}</p>
              </div>
              <div className="rounded-xl bg-brand-50 border border-brand-200 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-600 mb-1">Banco</p>
                <p className="text-xl font-bold text-brand-700">{formatCurrency(data.collectedBank)}</p>
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
});

export default Dashboard;
