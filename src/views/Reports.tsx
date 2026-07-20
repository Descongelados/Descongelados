import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart2,
  TrendingUp,
  TrendingDown,
  Wallet,
  Banknote,
  Building,
  Download,
  Calendar,
  RefreshCw,
  ShoppingCart,
  Package,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCurrency, formatDate } from '../lib/format';
import PageHeader from '../components/ui/PageHeader';
import { FullPageLoader } from '../components/ui/Spinner';
import EmptyState from '../components/ui/EmptyState';

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function currentWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { from: isoDate(monday), to: isoDate(sunday) };
}

/** Returns YYYY-MM-DD label for the period bucket of a given date */
function periodKey(dateStr: string, grouping: 'day' | 'week' | 'month'): string {
  const d = new Date(dateStr + 'T12:00:00');
  if (grouping === 'day') return isoDate(d);
  if (grouping === 'month') {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  // week: Monday of that week
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  return isoDate(monday);
}

/** Human-readable label for a period key */
function periodLabel(key: string, grouping: 'day' | 'week' | 'month'): string {
  if (grouping === 'day') return formatDate(key);
  if (grouping === 'month') {
    const [year, month] = key.split('-');
    return new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(
      new Date(Number(year), Number(month) - 1, 1),
    );
  }
  // week: "Sem. DD MMM – DD MMM"
  const monday = new Date(key + 'T12:00:00');
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return `Sem. ${formatDate(key)} – ${formatDate(isoDate(sunday))}`;
}

type SaleRow = {
  id: string;
  invoice_number: string | null;
  sale_date: string;
  total: number;
  subtotal: number;
  tax: number;
  customer: { name: string } | null;
};

type CollectionRow = { amount: number; payment_method: string };
type PurchaseRow = { total: number };
type SupplierPaymentRow = { amount: number; payment_method: string };
type SaleItemRow = {
  quantity: number;
  unit_price: number;
  subtotal: number;
  product: { name: string; cost_price: number } | null;
  sale: { sale_date: string } | null;
};

type ReportData = {
  sales: SaleRow[];
  collections: CollectionRow[];
  purchases: PurchaseRow[];
  supplierPayments: SupplierPaymentRow[];
  saleItems: SaleItemRow[];
};

function BarChart({
  bars,
  height = 160,
}: {
  bars: { label: string; value: number; color: string }[];
  height?: number;
}) {
  if (bars.length === 0) return null;
  const max = Math.max(...bars.map((b) => b.value), 1);
  const barW = Math.min(48, Math.floor(560 / bars.length) - 8);

  return (
    <svg viewBox={`0 0 560 ${height + 36}`} className="w-full" aria-hidden>
      {bars.map((b, i) => {
        const bh = Math.max(2, (b.value / max) * height);
        const x = (560 / bars.length) * i + (560 / bars.length - barW) / 2;
        const y = height - bh;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={bh} rx={4} fill={b.color} opacity={0.85} />
            <text
              x={x + barW / 2}
              y={height + 14}
              textAnchor="middle"
              fontSize={10}
              fill="#57606a"
            >
              {b.label.length > 10 ? b.label.slice(0, 9) + '…' : b.label}
            </text>
            <text
              x={x + barW / 2}
              y={Math.max(y - 4, 10)}
              textAnchor="middle"
              fontSize={9}
              fill="#1f2328"
              fontWeight="600"
            >
              {b.value > 0 ? formatCurrency(b.value) : ''}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function DonutChart({ slices }: { slices: { label: string; value: number; color: string }[] }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total === 0) return <p className="text-sm text-ink-400 text-center py-6">Sin datos</p>;

  const r = 70;
  const cx = 90;
  const cy = 90;
  let angle = -Math.PI / 2;

  const paths = slices
    .filter((s) => s.value > 0)
    .map((s) => {
      const sweep = (s.value / total) * 2 * Math.PI;
      const x1 = cx + r * Math.cos(angle);
      const y1 = cy + r * Math.sin(angle);
      angle += sweep;
      const x2 = cx + r * Math.cos(angle);
      const y2 = cy + r * Math.sin(angle);
      const large = sweep > Math.PI ? 1 : 0;
      return { ...s, d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z` };
    });

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <svg viewBox="0 0 180 180" className="w-36 shrink-0" aria-hidden>
        {paths.map((p, i) => (
          <path key={i} d={p.d} fill={p.color} opacity={0.9} />
        ))}
        <circle cx={cx} cy={cy} r={42} fill="white" />
      </svg>
      <div className="space-y-1.5 text-sm">
        {slices
          .filter((s) => s.value > 0)
          .map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full shrink-0" style={{ background: s.color }} />
              <span className="text-ink-700">{s.label}</span>
              <span className="ml-auto font-semibold text-ink-900">{formatCurrency(s.value)}</span>
              <span className="text-ink-400 text-xs">({((s.value / total) * 100).toFixed(1)}%)</span>
            </div>
          ))}
      </div>
    </div>
  );
}

type PeriodGrouping = 'day' | 'week' | 'month';

export default function Reports() {
  const defaultRange = currentWeekRange();
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [periodGrouping, setPeriodGrouping] = useState<PeriodGrouping>('day');
  const [expandedPeriod, setExpandedPeriod] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const runReport = async () => {
    if (!from || !to) return;
    setLoading(true);
    setError(null);
    setReportData(null);

    const end = `${to}T23:59:59`;

    const [salesRes, collectionsRes, purchasesRes, spRes] = await Promise.all([
      supabase
        .from('sales')
        .select('id, invoice_number, sale_date, total, subtotal, tax, customer:customers(name)')
        .eq('status', 'confirmada')
        .gte('sale_date', from)
        .lte('sale_date', end)
        .order('sale_date', { ascending: false }),
      supabase
        .from('collections')
        .select('amount, payment_method')
        .gte('collection_date', from)
        .lte('collection_date', end),
      supabase
        .from('purchases')
        .select('total')
        .eq('status', 'confirmada')
        .gte('purchase_date', from)
        .lte('purchase_date', end),
      supabase
        .from('supplier_payments')
        .select('amount, payment_method')
        .gte('payment_date', from)
        .lte('payment_date', end),
    ]);

    let saleItems: SaleItemRow[] = [];
    if (!salesRes.error && salesRes.data && salesRes.data.length > 0) {
      const saleIds = salesRes.data.map((s) => s.id);
      const { data: itemData } = await supabase
        .from('sale_items')
        .select('quantity, unit_price, subtotal, product:products(name, cost_price), sale:sales(sale_date)')
        .in('sale_id', saleIds);
      saleItems = (itemData ?? []) as unknown as SaleItemRow[];
    }

    if (salesRes.error || collectionsRes.error || purchasesRes.error || spRes.error) {
      setError('No se pudieron cargar los datos del reporte');
      setLoading(false);
      return;
    }

    setReportData({
      sales: (salesRes.data ?? []) as unknown as SaleRow[],
      collections: (collectionsRes.data ?? []) as CollectionRow[],
      purchases: (purchasesRes.data ?? []) as PurchaseRow[],
      supplierPayments: (spRes.data ?? []) as SupplierPaymentRow[],
      saleItems,
    });
    setLoading(false);
  };

  useEffect(() => { runReport(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const metrics = useMemo(() => {
    if (!reportData) return null;
    const { collections, purchases, supplierPayments, saleItems } = reportData;

    const totalPurchases = purchases.reduce((s, r) => s + r.total, 0);

    const colEfectivo = collections
      .filter((c) => c.payment_method === 'efectivo')
      .reduce((s, c) => s + c.amount, 0);
    const colBanco = collections
      .filter((c) => c.payment_method === 'banco')
      .reduce((s, c) => s + c.amount, 0);
    const colPorPagar = collections
      .filter((c) => c.payment_method === 'por_pagar')
      .reduce((s, c) => s + c.amount, 0);
    const totalCollected = collections.reduce((s, c) => s + c.amount, 0);
    const totalSales = totalCollected;

    const spEfectivo = supplierPayments
      .filter((p) => p.payment_method === 'efectivo')
      .reduce((s, p) => s + p.amount, 0);
    const spBanco = supplierPayments
      .filter((p) => p.payment_method === 'banco')
      .reduce((s, p) => s + p.amount, 0);
    const totalPaid = supplierPayments.reduce((s, p) => s + p.amount, 0);

    const ganancia = saleItems.reduce((acc, it) => {
      const costPrice = it.product?.cost_price ?? 0;
      return acc + (it.unit_price - costPrice) * it.quantity;
    }, 0);
    const totalCobradoVenta = colEfectivo + colBanco;
    const gananciaEfectivo = totalCobradoVenta > 0 ? ganancia * (colEfectivo / totalCobradoVenta) : 0;
    const gananciaBanco = totalCobradoVenta > 0 ? ganancia * (colBanco / totalCobradoVenta) : 0;

    const productMap = new Map<string, { name: string; qty: number; total: number }>();
    for (const it of saleItems) {
      const name = it.product?.name ?? 'Desconocido';
      const existing = productMap.get(name) ?? { name, qty: 0, total: 0 };
      productMap.set(name, {
        name,
        qty: existing.qty + Number(it.quantity),
        total: existing.total + it.subtotal,
      });
    }
    const productsSold = [...productMap.values()]
      .sort((a, b) => a.name.localeCompare(b.name));
    const topProducts = [...productMap.values()]
      .sort((a, b) => b.qty - a.qty || b.total - a.total)
      .slice(0, 8);

    return {
      totalSales,
      totalPurchases,
      totalCollected,
      totalPaid,
      colEfectivo,
      colBanco,
      colPorPagar,
      spEfectivo,
      spBanco,
      ganancia,
      gananciaEfectivo,
      gananciaBanco,
      productsSold,
      topProducts,
    };
  }, [reportData]);

  /** Products sold grouped by period (day/week/month) */
  const productsByPeriod = useMemo(() => {
    if (!reportData) return [];
    const { saleItems } = reportData;

    // Map: periodKey -> productName -> { qty, total }
    const periodMap = new Map<string, Map<string, { qty: number; total: number }>>();

    for (const it of saleItems) {
      const saleDate = it.sale?.sale_date;
      if (!saleDate) continue;
      const pKey = periodKey(saleDate, periodGrouping);
      const name = it.product?.name ?? 'Desconocido';

      if (!periodMap.has(pKey)) periodMap.set(pKey, new Map());
      const prods = periodMap.get(pKey)!;
      const prev = prods.get(name) ?? { qty: 0, total: 0 };
      prods.set(name, {
        qty: prev.qty + Number(it.quantity),
        total: prev.total + it.subtotal,
      });
    }

    return [...periodMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([pKey, prods]) => ({
        key: pKey,
        label: periodLabel(pKey, periodGrouping),
        products: [...prods.entries()]
          .map(([name, v]) => ({ name, qty: v.qty, total: v.total }))
          .sort((a, b) => b.qty - a.qty),
        totalQty: [...prods.values()].reduce((s, v) => s + v.qty, 0),
        totalAmount: [...prods.values()].reduce((s, v) => s + v.total, 0),
      }));
  }, [reportData, periodGrouping]);

  const handlePrint = () => window.print();

  const rangeLabel = from && to
    ? `${formatDate(from)} – ${formatDate(to)}`
    : 'Período seleccionado';

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Reportes"
        description="Análisis financiero por período"
        actions={
          <button
            className="btn-primary"
            onClick={handlePrint}
            disabled={!reportData}
          >
            <Download size={16} /> Exportar PDF
          </button>
        }
      />

      <div className="card p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1">
            <label className="label">Fecha inicio</label>
            <div className="relative">
              <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                type="date"
                className="input pl-8"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
          </div>
          <div className="flex-1">
            <label className="label">Fecha fin</label>
            <div className="relative">
              <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                type="date"
                className="input pl-8"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>
          <button
            className="btn-primary shrink-0"
            onClick={runReport}
            disabled={loading || !from || !to}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Generar reporte
          </button>
        </div>
      </div>

      {loading && <FullPageLoader label="Generando reporte…" />}
      {error && (
        <EmptyState icon={BarChart2} title={error} description="Revisa la conexión e inténtalo de nuevo." />
      )}

      {!loading && !error && reportData && metrics && (
        <div ref={printRef} className="space-y-6 receipt-print-area">
          <div className="hidden print:flex items-center justify-between border-b border-ink-200 pb-3 mb-4">
            <div>
              <h1 className="text-xl font-bold text-ink-900">Reporte financiero</h1>
              <p className="text-sm text-ink-500">{rangeLabel}</p>
            </div>
            <p className="text-xs text-ink-400">Comprobante interno · no fiscal</p>
          </div>

          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500 mb-3">Resumen del período · {rangeLabel}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="card p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-success-50 text-success-600">
                    <TrendingUp size={18} />
                  </div>
                  <div>
                    <p className="text-xs text-ink-500 uppercase font-semibold">Total ventas</p>
                    <p className="text-xl font-bold text-ink-900">{formatCurrency(metrics.totalSales)}</p>
                  </div>
                </div>
                <div className="space-y-1 border-t border-ink-100 pt-2 text-sm">
                  <div className="flex justify-between">
                    <span className="flex items-center gap-1.5 text-ink-500"><Banknote size={13} /> Efectivo cobrado</span>
                    <span className="font-semibold text-ink-800">{formatCurrency(metrics.colEfectivo)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="flex items-center gap-1.5 text-ink-500"><Building size={13} /> Banco cobrado</span>
                    <span className="font-semibold text-ink-800">{formatCurrency(metrics.colBanco)}</span>
                  </div>
                </div>
              </div>

              <div className="card p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-danger-50 text-danger-600">
                    <ShoppingCart size={18} />
                  </div>
                  <div>
                    <p className="text-xs text-ink-500 uppercase font-semibold">Total gastos</p>
                    <p className="text-xl font-bold text-ink-900">{formatCurrency(metrics.totalPurchases)}</p>
                  </div>
                </div>
                <div className="space-y-1 border-t border-ink-100 pt-2 text-sm">
                  <div className="flex justify-between">
                    <span className="flex items-center gap-1.5 text-ink-500"><Banknote size={13} /> Efectivo pagado</span>
                    <span className="font-semibold text-ink-800">{formatCurrency(metrics.spEfectivo)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="flex items-center gap-1.5 text-ink-500"><Building size={13} /> Banco pagado</span>
                    <span className="font-semibold text-ink-800">{formatCurrency(metrics.spBanco)}</span>
                  </div>
                </div>
              </div>

              <div className="card p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${metrics.ganancia >= 0 ? 'bg-brand-50 text-brand-600' : 'bg-danger-50 text-danger-600'}`}>
                    {metrics.ganancia >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                  </div>
                  <div>
                    <p className="text-xs text-ink-500 uppercase font-semibold">Ganancia neta</p>
                    <p className={`text-xl font-bold ${metrics.ganancia >= 0 ? 'text-success-700' : 'text-danger-700'}`}>
                      {formatCurrency(metrics.ganancia)}
                    </p>
                  </div>
                </div>
                <div className="space-y-1 border-t border-ink-100 pt-2 text-sm">
                  <div className="flex justify-between">
                    <span className="flex items-center gap-1.5 text-ink-500"><Banknote size={13} /> Efectivo</span>
                    <span className={`font-semibold ${metrics.gananciaEfectivo >= 0 ? 'text-success-700' : 'text-danger-700'}`}>
                      {formatCurrency(metrics.gananciaEfectivo)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="flex items-center gap-1.5 text-ink-500"><Building size={13} /> Banco</span>
                    <span className={`font-semibold ${metrics.gananciaBanco >= 0 ? 'text-success-700' : 'text-danger-700'}`}>
                      {formatCurrency(metrics.gananciaBanco)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-ink-800 mb-4 flex items-center gap-2">
                <BarChart2 size={16} className="text-brand-500" /> Ventas vs Gastos
              </h3>
              <BarChart
                bars={[
                  { label: 'Ventas', value: metrics.totalSales, color: '#059669' },
                  { label: 'Gastos', value: metrics.totalPurchases, color: '#dc2626' },
                  { label: 'Ganancia', value: Math.max(metrics.ganancia, 0), color: '#1d66f0' },
                ]}
              />
            </div>

            <div className="card p-5">
              <h3 className="text-sm font-semibold text-ink-800 mb-4 flex items-center gap-2">
                <Wallet size={16} className="text-brand-500" /> Formas de pago (cobranza)
              </h3>
              <DonutChart
                slices={[
                  { label: 'Efectivo', value: metrics.colEfectivo, color: '#059669' },
                  { label: 'Banco', value: metrics.colBanco, color: '#1d66f0' },
                  { label: 'Por pagar', value: metrics.colPorPagar, color: '#f97316' },
                ]}
              />
            </div>
          </section>

          {metrics.topProducts.length > 0 && (
            <section className="card p-5">
              <h3 className="text-sm font-semibold text-ink-800 mb-4 flex items-center gap-2">
                <Package size={16} className="text-brand-500" /> Productos más vendidos
              </h3>
              <BarChart
                height={140}
                bars={metrics.topProducts.map((p, i) => ({
                  label: p.name,
                  value: p.total,
                  color: ['#1d66f0','#059669','#f97316','#dc2626','#7c5cd8','#0891b2','#d97706','#be185d'][i % 8],
                }))}
              />
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                {metrics.topProducts.map((p, i) => (
                  <div key={i} className="rounded-lg bg-ink-50 px-3 py-2 text-xs">
                    <p className="font-semibold text-ink-800 truncate">{p.name}</p>
                    <p className="text-ink-500">{p.qty % 1 === 0 ? p.qty : p.qty.toFixed(2)} uds · {formatCurrency(p.total)}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Productos vendidos por periodo ── */}
          <section className="card overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-3 border-b border-ink-100 bg-ink-50/50">
              <div className="flex items-center gap-2 flex-1">
                <Package size={16} className="text-ink-500" />
                <h3 className="text-sm font-semibold text-ink-700">
                  Productos vendidos por período
                  <span className="ml-2 font-normal text-ink-400">({productsByPeriod.length} {productsByPeriod.length === 1 ? 'período' : 'períodos'})</span>
                </h3>
              </div>
              <div className="flex items-center gap-1 rounded-lg border border-ink-200 bg-white p-0.5 text-xs">
                {(['day', 'week', 'month'] as PeriodGrouping[]).map((g) => (
                  <button
                    key={g}
                    onClick={() => { setPeriodGrouping(g); setExpandedPeriod(null); }}
                    className={`px-3 py-1 rounded-md font-medium transition-colors ${
                      periodGrouping === g
                        ? 'bg-brand-600 text-white'
                        : 'text-ink-600 hover:bg-ink-100'
                    }`}
                  >
                    {g === 'day' ? 'Día' : g === 'week' ? 'Semana' : 'Mes'}
                  </button>
                ))}
              </div>
            </div>

            {productsByPeriod.length === 0 ? (
              <EmptyState
                icon={Package}
                title="Sin productos vendidos en este período"
                description="No se encontraron productos vendidos en el rango seleccionado."
              />
            ) : (
              <div className="divide-y divide-ink-100">
                {productsByPeriod.map((period) => {
                  const isExpanded = expandedPeriod === period.key;
                  return (
                    <div key={period.key}>
                      {/* Period header row — click to expand/collapse */}
                      <button
                        className="w-full flex items-center justify-between px-5 py-3 hover:bg-ink-50/60 transition text-left"
                        onClick={() => setExpandedPeriod(isExpanded ? null : period.key)}
                        aria-expanded={isExpanded}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono text-ink-400 w-4 select-none">
                            {isExpanded ? '▾' : '▸'}
                          </span>
                          <span className="text-sm font-semibold text-ink-800">{period.label}</span>
                          <span className="text-xs text-ink-400">
                            {period.products.length} {period.products.length === 1 ? 'producto' : 'productos'}
                          </span>
                        </div>
                        <div className="flex items-center gap-6 text-sm">
                          <span className="text-ink-500">
                            <span className="font-medium text-ink-800">
                              {period.totalQty % 1 === 0 ? period.totalQty : period.totalQty.toFixed(2)}
                            </span>{' '}
                            uds
                          </span>
                          <span className="font-semibold text-ink-900 min-w-[90px] text-right">
                            {formatCurrency(period.totalAmount)}
                          </span>
                        </div>
                      </button>

                      {/* Expanded product list */}
                      {isExpanded && (
                        <div className="bg-ink-50/30 border-t border-ink-100">
                          <table className="min-w-full divide-y divide-ink-100">
                            <thead>
                              <tr className="bg-ink-50/60">
                                <th className="table-head pl-12">Producto</th>
                                <th className="table-head text-right">Cantidad vendida</th>
                                <th className="table-head text-right">Total vendido</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-ink-100">
                              {period.products.map((p) => (
                                <tr key={p.name} className="hover:bg-ink-50/60 transition">
                                  <td className="table-cell pl-12 font-medium text-ink-800">{p.name}</td>
                                  <td className="table-cell text-right text-ink-700">
                                    {p.qty % 1 === 0 ? p.qty : p.qty.toFixed(2)}
                                  </td>
                                  <td className="table-cell text-right font-semibold text-ink-900">
                                    {formatCurrency(p.total)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="bg-ink-100/60">
                                <td className="table-cell pl-12 font-semibold text-ink-700">Total del período</td>
                                <td className="table-cell text-right font-semibold text-ink-800">
                                  {period.totalQty % 1 === 0 ? period.totalQty : period.totalQty.toFixed(2)}
                                </td>
                                <td className="table-cell text-right font-bold text-ink-900">
                                  {formatCurrency(period.totalAmount)}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Grand total row */}
                <div className="flex items-center justify-between px-5 py-3 bg-ink-50 border-t border-ink-200">
                  <span className="text-sm font-semibold text-ink-700">Total general</span>
                  <div className="flex items-center gap-6 text-sm">
                    <span className="text-ink-500">
                      <span className="font-semibold text-ink-800">
                        {(() => {
                          const total = productsByPeriod.reduce((s, p) => s + p.totalQty, 0);
                          return total % 1 === 0 ? total : total.toFixed(2);
                        })()}
                      </span>{' '}
                      uds
                    </span>
                    <span className="font-bold text-ink-900 min-w-[90px] text-right">
                      {formatCurrency(productsByPeriod.reduce((s, p) => s + p.totalAmount, 0))}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="card overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-ink-100 bg-ink-50/50">
              <Package size={16} className="text-ink-500" />
              <h3 className="text-sm font-semibold text-ink-700">
                Productos vendidos del período
                <span className="ml-2 font-normal text-ink-400">({metrics.productsSold.length} productos)</span>
              </h3>
            </div>
            {metrics.productsSold.length === 0 ? (
              <EmptyState
                icon={Package}
                title="Sin productos vendidos en este período"
                description="No se encontraron productos vendidos en el rango seleccionado."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-ink-100">
                  <thead className="bg-ink-50/60">
                    <tr>
                      <th className="table-head">Producto</th>
                      <th className="table-head text-right">Cantidad vendida</th>
                      <th className="table-head text-right">Total vendido</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {metrics.productsSold.map((p) => (
                      <tr key={p.name} className="hover:bg-ink-50/60 transition">
                        <td className="table-cell font-semibold text-ink-900">{p.name}</td>
                        <td className="table-cell text-right">{p.qty % 1 === 0 ? p.qty : p.qty.toFixed(2)}</td>
                        <td className="table-cell text-right">{formatCurrency(p.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-ink-100 bg-ink-50/50">
              <TrendingUp size={16} className="text-ink-500" />
              <h3 className="text-sm font-semibold text-ink-700">
                Ventas del período
                <span className="ml-2 font-normal text-ink-400">({reportData.sales.length} facturas)</span>
              </h3>
            </div>
            {reportData.sales.length === 0 ? (
              <EmptyState
                icon={TrendingUp}
                title="Sin ventas en este período"
                description="No se encontraron ventas confirmadas en el rango seleccionado."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-ink-100">
                  <thead className="bg-ink-50/60">
                    <tr>
                      <th className="table-head">Folio</th>
                      <th className="table-head">Cliente</th>
                      <th className="table-head">Fecha</th>
                      <th className="table-head text-right">Subtotal</th>
                      <th className="table-head text-right">IVA</th>
                      <th className="table-head text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {reportData.sales.map((s) => (
                      <tr key={s.id} className="hover:bg-ink-50/60 transition">
                        <td className="table-cell font-mono text-xs">{s.invoice_number ?? '—'}</td>
                        <td className="table-cell font-semibold text-ink-900">{s.customer?.name ?? '—'}</td>
                        <td className="table-cell">{formatDate(s.sale_date)}</td>
                        <td className="table-cell text-right">{formatCurrency(s.subtotal)}</td>
                        <td className="table-cell text-right">{formatCurrency(s.tax)}</td>
                        <td className="table-cell text-right font-semibold text-ink-900">{formatCurrency(s.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-ink-50">
                      <td colSpan={3} className="table-cell font-semibold text-right text-ink-700">Total</td>
                      <td className="table-cell text-right font-semibold">
                        {formatCurrency(reportData.sales.reduce((s, r) => s + r.subtotal, 0))}
                      </td>
                      <td className="table-cell text-right font-semibold">
                        {formatCurrency(reportData.sales.reduce((s, r) => s + r.tax, 0))}
                      </td>
                      <td className="table-cell text-right font-bold text-ink-900">
                        {formatCurrency(metrics.totalSales)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
