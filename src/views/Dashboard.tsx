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
  totalToCollect: number;
  totalToPay: number;
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

export default function Dashboard({ onNavigate }: { onNavigate: (view: ViewKey) => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const [
        salesRes,
        purchasesRes,
        collectionsRes,
        supplierPaymentsRes,
        lowStockRes,
        recentSalesRes,
      ] = await Promise.all([
        supabase.from('sales').select('total').eq('status', 'confirmada'),
        supabase.from('purchases').select('total').eq('status', 'confirmada'),
        supabase.from('collections').select('amount'),
        supabase.from('supplier_payments').select('amount'),
        supabase.from('products').select('id, sku, name, stock, min_stock').lt('stock', 0).or('stock.lt.min_stock'),
        supabase
          .from('sales')
          .select('id, invoice_number, total, sale_date, status, customer:customers(name)')
          .order('sale_date', { ascending: false })
          .limit(5),
      ]);

      if (salesRes.error || purchasesRes.error || collectionsRes.error || supplierPaymentsRes.error) {
        setError('No se pudieron cargar las métricas');
        return;
      }

      const sum = (rows: Array<{ total?: number; amount?: number }>) =>
        rows.reduce((acc, r) => acc + (r.total ?? r.amount ?? 0), 0);

      const totalSales = sum((salesRes.data ?? []) as Array<{ total: number }>);
      const totalPurchases = sum((purchasesRes.data ?? []) as Array<{ total: number }>);
      const totalCollected = sum((collectionsRes.data ?? []) as Array<{ amount: number }>);
      const totalPaid = sum((supplierPaymentsRes.data ?? []) as Array<{ amount: number }>);

      const lowStock = (lowStockRes.data ?? []) as Array<{ id: string; sku: string; name: string; stock: number; min_stock: number }>;
      const actualLowStock = lowStock.filter((p) => p.stock <= p.min_stock);

      setData({
        totalSales,
        totalPurchases,
        totalCollected,
        totalToCollect: totalSales - totalCollected,
        totalToPay: totalPurchases - totalPaid,
        lowStockCount: actualLowStock.length,
        recentSales: (recentSalesRes.data ?? []) as unknown as DashboardData['recentSales'],
        lowStockProducts: actualLowStock.slice(0, 5),
      });
    };
    load();
  }, []);

  if (error) return <EmptyState icon={AlertTriangle} title={error} description="Revisa la conexión e inténtalo de nuevo." />;
  if (!data) return <FullPageLoader label="Cargando panel…" />;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Panel de control"
        description="Resumen general de tu operación comercial"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Ventas totales"
          value={formatCurrency(data.totalSales)}
          icon={TrendingUp}
          tone="success"
          hint="Facturas confirmadas"
        />
        <StatCard
          label="Compras totales"
          value={formatCurrency(data.totalPurchases)}
          icon={ShoppingCart}
          tone="brand"
          hint="Órdenes a proveedores"
        />
        <StatCard
          label="Por cobrar"
          value={formatCurrency(data.totalToCollect)}
          icon={Wallet}
          tone="accent"
          hint="Saldo pendiente de clientes"
        />
        <StatCard
          label="Por pagar"
          value={formatCurrency(data.totalToPay)}
          icon={DollarSign}
          tone="warning"
          hint="Saldo pendiente a proveedores"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <StatCard
          label="Productos con stock bajo"
          value={formatNumber(data.lowStockCount, 0)}
          icon={AlertTriangle}
          tone={data.lowStockCount > 0 ? 'danger' : 'neutral'}
          hint="Requieren reposición"
        />
        <StatCard
          label="Cobranza recibida"
          value={formatCurrency(data.totalCollected)}
          icon={Wallet}
          tone="success"
          hint="Pagos registrados"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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

        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-danger-600" />
              <h3 className="font-semibold text-ink-900">Alertas de inventario</h3>
            </div>
            <button
              onClick={() => onNavigate('inventory')}
              className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1"
            >
              Ver inventario <ArrowRight size={12} />
            </button>
          </div>
          {data.lowStockProducts.length === 0 ? (
            <EmptyState
              icon={Package}
              title="Inventario saludable"
              description="Todos los productos están por encima del stock mínimo."
            />
          ) : (
            <div className="space-y-1">
              {data.lowStockProducts.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 hover:bg-ink-50 transition"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink-800 truncate">{p.name}</p>
                    <p className="text-xs text-ink-500">SKU {p.sku}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-danger-600">{formatNumber(p.stock, 0)}</p>
                    <p className="text-xs text-ink-400">mín. {formatNumber(p.min_stock, 0)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
