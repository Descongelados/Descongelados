import { useEffect, useMemo, useState } from 'react';
import { Package, Plus, Pencil, Trash2, Search, Filter, DollarSign, TrendingUp, BarChart2, ShoppingBag, ClipboardList, ArrowUp, ArrowDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Product, InventoryLog } from '../lib/types';
import { formatCurrency, formatNumber, formatDateTime } from '../lib/format';
import PageHeader from '../components/ui/PageHeader';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { useToast } from '../components/ui/Toast';
import { FullPageLoader } from '../components/ui/Spinner';
import { useAuth } from '../lib/auth';
import StatCard from '../components/ui/StatCard';

type FormState = {
  sku: string;
  name: string;
  description: string;
  category: string;
  unit: string;
  cost_price: string;
  sale_price: string;
  stock: string;
  min_stock: string;
  is_active: boolean;
};

const emptyForm: FormState = {
  sku: '',
  name: '',
  description: '',
  category: '',
  unit: 'unidad',
  cost_price: '0',
  sale_price: '0',
  stock: '0',
  min_stock: '0',
  is_active: true,
};

type Tab = 'list' | 'value' | 'log';

// ─── Inventory Value Tab ─────────────────────────────────────────────────────

type CategoryRow = {
  category: string;
  totalCost: number;
  totalSale: number;
  totalProfit: number;
  margin: number;
  units: number;
};

function InventoryValueTab({ products }: { products: Product[] }) {
  const active = useMemo(() => products.filter((p) => p.stock > 0), [products]);

  const totalCost   = useMemo(() => active.reduce((s, p) => s + p.cost_price  * p.stock, 0), [active]);
  const totalSale   = useMemo(() => active.reduce((s, p) => s + p.sale_price  * p.stock, 0), [active]);
  const totalProfit = totalSale - totalCost;
  const avgMargin   = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;

  const byCategory = useMemo<CategoryRow[]>(() => {
    const map = new Map<string, CategoryRow>();
    active.forEach((p) => {
      const key = p.category ?? 'Sin categoría';
      const row = map.get(key) ?? { category: key, totalCost: 0, totalSale: 0, totalProfit: 0, margin: 0, units: 0 };
      row.totalCost  += p.cost_price * p.stock;
      row.totalSale  += p.sale_price * p.stock;
      row.units      += p.stock;
      map.set(key, row);
    });
    const rows = Array.from(map.values()).map((r) => ({
      ...r,
      totalProfit: r.totalSale - r.totalCost,
      margin: r.totalCost > 0 ? ((r.totalSale - r.totalCost) / r.totalCost) * 100 : 0,
    }));
    return rows.sort((a, b) => b.totalCost - a.totalCost);
  }, [active]);

  const marginColor = (m: number) =>
    m >= 50 ? 'text-success-600' : m >= 20 ? 'text-brand-600' : m > 0 ? 'text-warning-600' : 'text-danger-600';

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Capital invertido"
          value={formatCurrency(totalCost)}
          icon={DollarSign}
          tone="neutral"
          hint={`${active.length} productos con stock`}
        />
        <StatCard
          label="Valor potencial de venta"
          value={formatCurrency(totalSale)}
          icon={ShoppingBag}
          tone="brand"
          hint="Al precio de venta actual"
        />
        <StatCard
          label="Ganancia potencial"
          value={formatCurrency(totalProfit)}
          icon={TrendingUp}
          tone="success"
          hint="Si se vende todo el stock"
        />
        <StatCard
          label="Margen promedio"
          value={`${avgMargin.toFixed(1)}%`}
          icon={BarChart2}
          tone={avgMargin >= 50 ? 'success' : avgMargin >= 20 ? 'brand' : 'warning'}
          hint="Sobre el costo total"
        />
      </div>

      {/* Detail by product */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-ink-100">
          <h3 className="font-semibold text-ink-900">Detalle por producto</h3>
          <p className="text-xs text-ink-500 mt-0.5">Solo productos con stock disponible</p>
        </div>
        {active.length === 0 ? (
          <EmptyState icon={Package} title="Sin stock disponible" description="No hay productos con existencias actualmente." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-ink-100">
              <thead className="bg-ink-50/60">
                <tr>
                  <th className="table-head">Producto</th>
                  <th className="table-head text-right">Stock</th>
                  <th className="table-head text-right">Costo unit.</th>
                  <th className="table-head text-right">Precio unit.</th>
                  <th className="table-head text-right">Invertido</th>
                  <th className="table-head text-right">Val. venta</th>
                  <th className="table-head text-right">Ganancia pot.</th>
                  <th className="table-head text-right">Margen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {active.map((p) => {
                  const invested = p.cost_price * p.stock;
                  const saleVal  = p.sale_price  * p.stock;
                  const profit   = saleVal - invested;
                  const margin   = p.cost_price > 0 ? ((p.sale_price - p.cost_price) / p.cost_price) * 100 : p.sale_price > 0 ? 100 : 0;
                  return (
                    <tr key={p.id} className="hover:bg-ink-50/60 transition">
                      <td className="table-cell">
                        <div className="font-semibold text-ink-900">{p.name}</div>
                        <div className="text-xs text-ink-500">SKU {p.sku} · {p.category ?? 'Sin categoría'}</div>
                      </td>
                      <td className="table-cell text-right">{formatNumber(p.stock, 0)} {p.unit}</td>
                      <td className="table-cell text-right">{formatCurrency(p.cost_price)}</td>
                      <td className="table-cell text-right">{formatCurrency(p.sale_price)}</td>
                      <td className="table-cell text-right font-semibold">{formatCurrency(invested)}</td>
                      <td className="table-cell text-right font-semibold text-brand-700">{formatCurrency(saleVal)}</td>
                      <td className="table-cell text-right font-semibold text-success-700">{formatCurrency(profit)}</td>
                      <td className="table-cell text-right">
                        <span className={`font-semibold ${marginColor(margin)}`}>
                          {margin > 0 ? `+${margin.toFixed(1)}%` : '—'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-ink-50/80 border-t-2 border-ink-200">
                <tr>
                  <td className="table-cell font-bold text-ink-900" colSpan={4}>Total</td>
                  <td className="table-cell text-right font-bold text-ink-900">{formatCurrency(totalCost)}</td>
                  <td className="table-cell text-right font-bold text-brand-700">{formatCurrency(totalSale)}</td>
                  <td className="table-cell text-right font-bold text-success-700">{formatCurrency(totalProfit)}</td>
                  <td className="table-cell text-right font-bold">
                    <span className={marginColor(avgMargin)}>+{avgMargin.toFixed(1)}%</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Summary by category */}
      {byCategory.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-ink-100">
            <h3 className="font-semibold text-ink-900">Resumen por categoría</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-ink-100">
              <thead className="bg-ink-50/60">
                <tr>
                  <th className="table-head">Categoría</th>
                  <th className="table-head text-right">Unidades</th>
                  <th className="table-head text-right">Invertido</th>
                  <th className="table-head text-right">Val. venta</th>
                  <th className="table-head text-right">Ganancia pot.</th>
                  <th className="table-head text-right">Margen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {byCategory.map((row) => (
                  <tr key={row.category} className="hover:bg-ink-50/60 transition">
                    <td className="table-cell font-medium text-ink-900">{row.category}</td>
                    <td className="table-cell text-right">{formatNumber(row.units, 0)}</td>
                    <td className="table-cell text-right font-semibold">{formatCurrency(row.totalCost)}</td>
                    <td className="table-cell text-right font-semibold text-brand-700">{formatCurrency(row.totalSale)}</td>
                    <td className="table-cell text-right font-semibold text-success-700">{formatCurrency(row.totalProfit)}</td>
                    <td className="table-cell text-right">
                      <span className={`font-semibold ${marginColor(row.margin)}`}>
                        {row.margin > 0 ? `+${row.margin.toFixed(1)}%` : '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

// ─── Inventory Log Tab ───────────────────────────────────────────────────────

const ACTION_LABELS: Record<InventoryLog['action'], string> = {
  created:  'Creado',
  edited:   'Editado',
  deleted:  'Eliminado',
  purchase: 'Compra',
  sale:     'Venta',
};

const ACTION_COLORS: Record<InventoryLog['action'], string> = {
  created:  'bg-brand-100 text-brand-700',
  edited:   'bg-warning-100 text-warning-700',
  deleted:  'bg-danger-100 text-danger-700',
  purchase: 'bg-success-100 text-success-700',
  sale:     'bg-accent-100 text-accent-700',
};

// Movimiento sintético construido en el frontend sin depender de inventory_logs
type Movement = {
  id: string;
  product_name: string;
  product_sku: string;
  action: 'sale' | 'purchase' | 'created' | 'edited' | 'deleted';
  delta: number | null;
  changed_by: string | null;
  notes: string | null;
  created_at: string;
};

function InventoryLogTab() {
  const [movements, setMovements] = useState<Movement[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      // Siempre últimos 7 días
      const since = new Date();
      since.setDate(since.getDate() - 7);
      since.setHours(0, 0, 0, 0);
      const sinceISO = since.toISOString();

      // Limpiar inventory_logs de más de 30 días (silencioso, no bloquea)
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      supabase.from('inventory_logs').delete().lt('created_at', cutoff.toISOString()).then(() => {});

      // ── Ventas + sus líneas ─────────────────────────────────────────────
      const salesQuery = supabase
        .from('sales')
        .select('id, invoice_number, sale_date')
        .gte('sale_date', sinceISO)
        .order('sale_date', { ascending: false });

      const purchasesQuery = supabase
        .from('purchases')
        .select('id, invoice_number, purchase_date')
        .gte('purchase_date', sinceISO)
        .order('purchase_date', { ascending: false });

      const [
        { data: sales },
        { data: purchases },
        { data: saleItems },
        { data: purchaseItems },
        { data: prods },
        { data: invLogs },
      ] = await Promise.all([
        salesQuery,
        purchasesQuery,
        supabase.from('sale_items').select('sale_id, product_id, quantity'),
        supabase.from('purchase_items').select('purchase_id, product_id, quantity'),
        supabase.from('products').select('id, name, sku'),
        // inventory_logs may not exist — handle error gracefully
        supabase.from('inventory_logs').select('*').order('created_at', { ascending: false }).limit(200),
      ]);

      type ProdRow = { id: string; name: string; sku: string };
      type SaleRow = { id: string; invoice_number: string | null; sale_date: string };
      type PurchaseRow = { id: string; invoice_number: string | null; purchase_date: string };
      type SaleItemRow = { sale_id: string; product_id: string; quantity: number };
      type PurchaseItemRow = { purchase_id: string; product_id: string; quantity: number };

      const prodMap = new Map(((prods ?? []) as ProdRow[]).map((p) => [p.id, p]));
      const result: Movement[] = [];

      // Build one row per product-line per sale
      for (const s of ((sales ?? []) as SaleRow[])) {
        const folio = s.invoice_number ?? s.id.slice(0, 8);
        const lines = ((saleItems ?? []) as SaleItemRow[]).filter((si) => si.sale_id === s.id);
        if (lines.length === 0) {
          result.push({ id: `sale-${s.id}`, product_name: '—', product_sku: '—',
            action: 'sale', delta: null, changed_by: null, notes: `Venta ${folio}`, created_at: s.sale_date });
        } else {
          for (const li of lines) {
            const prod = prodMap.get(li.product_id);
            result.push({ id: `sale-${s.id}-${li.product_id}`,
              product_name: prod?.name ?? 'Eliminado', product_sku: prod?.sku ?? '—',
              action: 'sale', delta: -li.quantity, changed_by: null,
              notes: `Venta ${folio}`, created_at: s.sale_date });
          }
        }
      }

      // Build one row per product-line per purchase
      for (const p of ((purchases ?? []) as PurchaseRow[])) {
        const folio = p.invoice_number ?? p.id.slice(0, 8);
        const lines = ((purchaseItems ?? []) as PurchaseItemRow[]).filter((pi) => pi.purchase_id === p.id);
        if (lines.length === 0) {
          result.push({ id: `pur-${p.id}`, product_name: '—', product_sku: '—',
            action: 'purchase', delta: null, changed_by: null, notes: `Compra ${folio}`, created_at: p.purchase_date });
        } else {
          for (const li of lines) {
            const prod = prodMap.get(li.product_id);
            result.push({ id: `pur-${p.id}-${li.product_id}`,
              product_name: prod?.name ?? 'Eliminado', product_sku: prod?.sku ?? '—',
              action: 'purchase', delta: li.quantity, changed_by: null,
              notes: `Compra ${folio}`, created_at: p.purchase_date });
          }
        }
      }

      // Append inventory_logs rows (manual adjustments, created, edited, deleted) if available
      for (const l of ((invLogs ?? []) as InventoryLog[])) {
        if (l.action === 'sale' || l.action === 'purchase') continue; // already in result
        result.push({ id: l.id, product_name: l.product_name, product_sku: l.product_sku,
          action: l.action, delta: l.delta ?? null, changed_by: l.changed_by,
          notes: l.notes, created_at: l.created_at });
      }

      // Sort all by date desc
      result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setMovements(result);
      setLoading(false);
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!movements) return [];
    return movements.filter((m) => {
      const matchesAction = actionFilter === 'all' || m.action === actionFilter;
      const matchesSearch =
        !search ||
        m.product_name.toLowerCase().includes(search.toLowerCase()) ||
        m.product_sku.toLowerCase().includes(search.toLowerCase()) ||
        (m.notes ?? '').toLowerCase().includes(search.toLowerCase());
      return matchesAction && matchesSearch;
    });
  }, [movements, actionFilter, search]);

  if (loading) return <FullPageLoader />;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              className="input pl-9"
              placeholder="Buscar por producto, SKU o folio…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="input w-auto"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          >
            <option value="all">Todas las acciones</option>
            <option value="created">Creado</option>
            <option value="edited">Editado</option>
            <option value="deleted">Eliminado</option>
            <option value="purchase">Compra</option>
            <option value="sale">Venta</option>
          </select>
          <span className="text-xs text-ink-400 whitespace-nowrap">Últimos 7 días</span>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="Sin movimientos"
            description="No hay movimientos en el periodo seleccionado."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-ink-100">
              <thead className="bg-ink-50/60">
                <tr>
                  <th className="table-head">Fecha</th>
                  <th className="table-head">Producto</th>
                  <th className="table-head">Acción</th>
                  <th className="table-head text-right">Cambio</th>
                  <th className="table-head">Usuario</th>
                  <th className="table-head">Folio / Notas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {filtered.map((m) => (
                  <tr key={m.id} className="hover:bg-ink-50/60 transition">
                    <td className="table-cell text-xs text-ink-500 whitespace-nowrap">
                      {formatDateTime(m.created_at)}
                    </td>
                    <td className="table-cell">
                      <div className="font-semibold text-ink-900">{m.product_name}</div>
                      {m.product_sku !== '—' && <div className="text-xs text-ink-500">SKU {m.product_sku}</div>}
                    </td>
                    <td className="table-cell">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${ACTION_COLORS[m.action]}`}>
                        {ACTION_LABELS[m.action]}
                      </span>
                    </td>
                    <td className="table-cell text-right font-semibold">
                      {m.delta != null ? (
                        <span className={`flex items-center justify-end gap-0.5 ${m.delta > 0 ? 'text-success-600' : m.delta < 0 ? 'text-danger-600' : 'text-ink-400'}`}>
                          {m.delta > 0 ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
                          {m.delta > 0 ? '+' : ''}{formatNumber(m.delta, 3)}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="table-cell text-ink-600 text-sm">{m.changed_by ?? '—'}</td>
                    <td className="table-cell text-ink-500 text-xs">{m.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Inventory() {
  const { can, currentUser } = useAuth();
  const canCreate = can('inventory:create');
  const canEdit   = can('inventory:edit');
  const canDelete = can('inventory:delete');

  const { push } = useToast();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [tab, setTab] = useState<Tab>('list');

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('products').select('*').order('name', { ascending: true });
    if (error) {
      push('error', 'No se pudo cargar el inventario');
      setProducts([]);
    } else {
      setProducts(data as Product[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    (products ?? []).forEach((p) => p.category && set.add(p.category));
    return Array.from(set).sort();
  }, [products]);

  const filtered = useMemo(() => {
    if (!products) return [];
    return products.filter((p) => {
      const matchesSearch =
        !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.sku.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryFilter === 'all' || p.category === categoryFilter;
      const matchesStock =
        stockFilter === 'all' ||
        (stockFilter === 'low' && p.stock > 0 && p.stock <= p.min_stock) ||
        (stockFilter === 'out' && p.stock <= 0);
      return matchesSearch && matchesCategory && matchesStock;
    });
  }, [products, search, categoryFilter, stockFilter]);

  const generateNextSku = async (): Promise<string> => {
    const { data } = await supabase.from('products').select('sku');
    const skus = (data ?? []) as Pick<Product, 'sku'>[];
    let maxNum = 0;
    skus.forEach((s) => {
      const match = s.sku.match(/PROD-(\d+)/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    });
    return `PROD-${String(maxNum + 1).padStart(4, '0')}`;
  };

  const openCreate = async () => {
    setEditing(null);
    setForm({ ...emptyForm, sku: '' });
    setModalOpen(true);
    const nextSku = await generateNextSku();
    setForm((prev) => ({ ...prev, sku: nextSku }));
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      sku: p.sku,
      name: p.name,
      description: p.description ?? '',
      category: p.category ?? '',
      unit: p.unit,
      cost_price: String(p.cost_price),
      sale_price: String(p.sale_price),
      stock: String(p.stock),
      min_stock: String(p.min_stock),
      is_active: p.is_active,
    });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      push('error', 'El nombre es obligatorio');
      return;
    }
    setSaving(true);
    const basePayload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      category: form.category.trim() || null,
      unit: form.unit.trim() || 'unidad',
      cost_price: Number(form.cost_price) || 0,
      sale_price: Number(form.sale_price) || 0,
      stock: Number(form.stock) || 0,
      min_stock: Number(form.min_stock) || 0,
      is_active: form.is_active,
    };

    if (editing) {
      const { error } = await supabase.from('products').update(basePayload).eq('id', editing.id);
      if (error) {
        push('error', 'No se pudo actualizar el producto');
      } else {
        // Log: edited
        const changes: string[] = [];
        if (editing.stock !== basePayload.stock) changes.push(`stock: ${editing.stock} → ${basePayload.stock}`);
        if (editing.cost_price !== basePayload.cost_price) changes.push(`costo: ${editing.cost_price} → ${basePayload.cost_price}`);
        if (editing.sale_price !== basePayload.sale_price) changes.push(`precio: ${editing.sale_price} → ${basePayload.sale_price}`);
        await supabase.from('inventory_logs').insert({
          product_id:   editing.id,
          product_name: basePayload.name,
          product_sku:  editing.sku,
          action:       'edited',
          stock_before: editing.stock,
          stock_after:  basePayload.stock,
          changed_by:   currentUser?.name ?? null,
          notes:        changes.length > 0 ? changes.join(' · ') : 'Sin cambios de stock',
        });
        push('success', 'Producto actualizado');
        setModalOpen(false);
        load();
      }
    } else {
      let attempt = 0;
      let success = false;
      while (attempt < 3 && !success) {
        const sku = attempt === 0 ? form.sku : await generateNextSku();
        const { data: inserted, error } = await supabase
          .from('products')
          .insert({ ...basePayload, sku })
          .select('id')
          .single();
        if (error && error.message.includes('duplicate')) {
          attempt += 1;
          if (attempt >= 3) {
            push('error', 'No se pudo generar un SKU único. Inténtalo de nuevo.');
            break;
          }
          const nextSku = await generateNextSku();
          setForm((prev) => ({ ...prev, sku: nextSku }));
        } else if (error) {
          push('error', 'No se pudo crear el producto');
          break;
        } else {
          // Log: created
          await supabase.from('inventory_logs').insert({
            product_id:   inserted?.id ?? null,
            product_name: basePayload.name,
            product_sku:  sku,
            action:       'created',
            stock_before: 0,
            stock_after:  basePayload.stock,
            changed_by:   currentUser?.name ?? null,
            notes:        null,
          });
          push('success', 'Producto creado');
          setModalOpen(false);
          load();
          success = true;
        }
      }
    }
    setSaving(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from('products').delete().eq('id', deleteTarget.id);
    if (error) {
      push('error', 'No se pudo eliminar (puede estar referenciado en compras/ventas)');
    } else {
      // Log: deleted (product_id SET NULL via ON DELETE SET NULL, guardamos datos antes)
      await supabase.from('inventory_logs').insert({
        product_id:   null,
        product_name: deleteTarget.name,
        product_sku:  deleteTarget.sku,
        action:       'deleted',
        stock_before: deleteTarget.stock,
        stock_after:  0,
        changed_by:   currentUser?.name ?? null,
        notes:        null,
      });
      push('success', 'Producto eliminado');
      load();
    }
    setDeleteTarget(null);
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Inventario"
        description="Administra productos, precios y existencias"
        actions={canCreate && tab === 'list' && (
          <button className="btn-primary" onClick={openCreate}>
            <Plus size={16} /> Nuevo producto
          </button>
        )}
      />

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-ink-200">
        <button
          onClick={() => setTab('list')}
          className={`px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px ${
            tab === 'list'
              ? 'border-brand-600 text-brand-700'
              : 'border-transparent text-ink-500 hover:text-ink-800'
          }`}
        >
          Productos
        </button>
        <button
          onClick={() => setTab('value')}
          className={`px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px ${
            tab === 'value'
              ? 'border-brand-600 text-brand-700'
              : 'border-transparent text-ink-500 hover:text-ink-800'
          }`}
        >
          Valor del inventario
        </button>
        <button
          onClick={() => setTab('log')}
          className={`px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px ${
            tab === 'log'
              ? 'border-brand-600 text-brand-700'
              : 'border-transparent text-ink-500 hover:text-ink-800'
          }`}
        >
          Historial
        </button>
      </div>

      {/* Tab: Valor del inventario */}
      {tab === 'value' && (
        loading ? <FullPageLoader /> : <InventoryValueTab products={products ?? []} />
      )}

      {/* Tab: Historial de movimientos */}
      {tab === 'log' && <InventoryLogTab />}

      {/* Tab: Lista de productos */}
      {tab === 'list' && (
        <>
          <div className="card p-4 mb-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                  className="input pl-9"
                  placeholder="Buscar por nombre o SKU…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter size={16} className="text-ink-400" />
                <select
                  className="input w-auto"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                >
                  <option value="all">Todas las categorías</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <select
                  className="input w-auto"
                  value={stockFilter}
                  onChange={(e) => setStockFilter(e.target.value as 'all' | 'low' | 'out')}
                >
                  <option value="all">Todo el stock</option>
                  <option value="low">Stock bajo</option>
                  <option value="out">Agotado</option>
                </select>
              </div>
            </div>
          </div>

          <div className="card overflow-hidden">
            {loading ? (
              <FullPageLoader />
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={Package}
                title="Sin productos"
                description="Agrega tu primer producto para empezar a controlar el inventario."
                action={
                  canCreate ? (
                    <button className="btn-primary" onClick={openCreate}>
                      <Plus size={16} /> Nuevo producto
                    </button>
                  ) : undefined
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-ink-100">
                  <thead className="bg-ink-50/60">
                    <tr>
                      <th className="table-head">Producto</th>
                      <th className="table-head">Categoría</th>
                      <th className="table-head text-right">Costo</th>
                      <th className="table-head text-right">Precio</th>
                      <th className="table-head text-right">Ganancia</th>
                      <th className="table-head text-right">Stock</th>
                      <th className="table-head">Estado</th>
                      <th className="table-head text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {filtered.map((p) => {
                      const out = p.stock <= 0;
                      const low = p.stock > 0 && p.stock <= p.min_stock;
                      const margin = p.cost_price > 0
                        ? ((p.sale_price - p.cost_price) / p.cost_price) * 100
                        : p.sale_price > 0
                          ? 100
                          : 0;
                      const marginColor =
                        margin >= 50 ? 'text-success-600' : margin >= 20 ? 'text-brand-600' : margin > 0 ? 'text-warning-600' : 'text-danger-600';
                      return (
                        <tr key={p.id} className="hover:bg-ink-50/60 transition">
                          <td className="table-cell">
                            <div className="font-semibold text-ink-900">{p.name}</div>
                            <div className="text-xs text-ink-500">SKU {p.sku} · {p.unit}</div>
                          </td>
                          <td className="table-cell">{p.category ?? '—'}</td>
                          <td className="table-cell text-right">{formatCurrency(p.cost_price)}</td>
                          <td className="table-cell text-right font-semibold">{formatCurrency(p.sale_price)}</td>
                          <td className="table-cell text-right">
                            <span className={`font-semibold ${marginColor}`}>
                              {margin > 0 ? `+${margin.toFixed(1)}%` : '—'}
                            </span>
                            {p.cost_price > 0 && (
                              <div className="text-[10px] text-ink-400">
                                {formatCurrency(p.sale_price - p.cost_price)} / und
                              </div>
                            )}
                          </td>
                          <td className="table-cell text-right">
                            <span
                              className={`font-semibold ${
                                out ? 'text-danger-600' : low ? 'text-warning-600' : 'text-ink-900'
                              }`}
                            >
                              {formatNumber(p.stock, 0)}
                            </span>
                            {out && <div className="text-[10px] text-danger-500">agotado</div>}
                            {low && <div className="text-[10px] text-warning-500">bajo</div>}
                          </td>
                          <td className="table-cell">
                            {p.is_active ? <Badge variant="success">activo</Badge> : <Badge variant="neutral">inactivo</Badge>}
                          </td>
                          <td className="table-cell text-right">
                            <div className="flex items-center justify-end gap-1">
                              {canEdit && (
                                <button onClick={() => openEdit(p)} className="rounded-lg p-1.5 text-ink-500 hover:bg-brand-50 hover:text-brand-600 transition" aria-label="Editar">
                                  <Pencil size={16} />
                                </button>
                              )}
                              {canDelete && (
                                <button onClick={() => setDeleteTarget(p)} className="rounded-lg p-1.5 text-ink-500 hover:bg-danger-50 hover:text-danger-600 transition" aria-label="Eliminar">
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar producto' : 'Nuevo producto'}
        description="Los cambios de stock se reflejan automáticamente en el inventario."
        size="lg"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancelar
            </button>
            <button className="btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">SKU (automático)</label>
            <input
              className="input bg-ink-50 text-ink-500 cursor-not-allowed font-mono"
              value={form.sku || 'Generando…'}
              readOnly
              placeholder="Generando…"
            />
            <p className="text-xs text-ink-400 mt-1">Se asigna automáticamente al guardar.</p>
          </div>
          <div>
            <label className="label">Nombre *</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Nombre del producto"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Descripción</label>
            <textarea
              className="input"
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Descripción opcional"
            />
          </div>
          <div>
            <label className="label">Categoría</label>
            <input
              className="input"
              list="categories-list"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="Ej. Bebidas"
            />
            <datalist id="categories-list">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="label">Unidad</label>
            <input
              className="input"
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              placeholder="unidad, kg, lt…"
            />
          </div>
          <div>
            <label className="label">Costo unitario</label>
            <input
              className="input"
              type="number"
              step="0.01"
              min="0"
              value={form.cost_price}
              onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Precio de venta</label>
            <input
              className="input"
              type="number"
              step="0.01"
              min="0"
              value={form.sale_price}
              onChange={(e) => setForm({ ...form, sale_price: e.target.value })}
            />
            {(() => {
              const cost = Number(form.cost_price) || 0;
              const sale = Number(form.sale_price) || 0;
              if (cost <= 0 && sale <= 0) return null;
              const margin = cost > 0 ? ((sale - cost) / cost) * 100 : 100;
              const profit = sale - cost;
              const color = margin >= 50 ? 'text-success-600' : margin >= 20 ? 'text-brand-600' : margin > 0 ? 'text-warning-600' : 'text-danger-600';
              return (
                <p className={`text-xs mt-1 font-medium ${color}`}>
                  Ganancia: {margin > 0 ? '+' : ''}{margin.toFixed(1)}% · {formatCurrency(profit)}/und
                </p>
              );
            })()}
          </div>
          <div>
            <label className="label">Stock actual</label>
            <input
              className="input"
              type="number"
              step="0.001"
              value={form.stock}
              onChange={(e) => setForm({ ...form, stock: e.target.value })}
            />
            {editing && <p className="text-xs text-ink-400 mt-1">Ajuste manual de inventario físico.</p>}
          </div>
          <div>
            <label className="label">Stock mínimo</label>
            <input
              className="input"
              type="number"
              step="0.001"
              value={form.min_stock}
              onChange={(e) => setForm({ ...form, min_stock: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-200"
              />
              <span className="text-sm text-ink-700">Producto activo</span>
            </label>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Eliminar producto"
        message={`¿Seguro que deseas eliminar "${deleteTarget?.name}"? Esta acción no se puede deshacer.`}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
