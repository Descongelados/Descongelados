import { useEffect, useMemo, useState } from 'react';
import {
  TrendingUp,
  Plus,
  Trash2,
  Search,
  Eye,
  Pencil,
  X,
  Package,
  Users,
  Receipt,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Customer, Product, Sale, SaleItem } from '../lib/types';
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
type ItemRow = {
  id: string;
  product_id: string;
  quantity: string;
  unit_price: string;
};

const TAX_RATE = 0.16;

function getWeekRange(): { monday: Date; sunday: Date } {
  const now = new Date();
  const diff = now.getDay() === 0 ? -6 : 1 - now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { monday, sunday };
}

export default function Sales() {
  const { can } = useAuth();
  const canCreate = can('sales:create');
  const canEdit   = can('sales:edit');
  const canDelete = can('sales:delete');
  const { push } = useToast();
  const [sales, setSales] = useState<SaleRow[] | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState<SaleRow | null>(null);
  const [detailItems, setDetailItems] = useState<(SaleItem & { product: Product | null })[]>([]);
  const [editing, setEditing] = useState<Sale | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SaleRow | null>(null);

  const [form, setForm] = useState({
    customer_id: '',
    invoice_number: '',
    sale_date: toDateInputValue(new Date()),
    notes: '',
    status: 'confirmada',
    has_tax: true,
  });
  const [items, setItems] = useState<ItemRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [receiptSale, setReceiptSale] = useState<SaleRow | null>(null);

  const load = async () => {
    setLoading(true);
    const { monday, sunday } = getWeekRange();
    const mondayStr = monday.toISOString().slice(0, 10);
    const sundayStr = `${sunday.toISOString().slice(0, 10)}T23:59:59`;

    const [sRes, cRes, prodRes] = await Promise.all([
      supabase
        .from('sales')
        .select('id, invoice_number, sale_date, total, subtotal, tax, status, delivery_status, customer_id, notes, created_at, customer:customers(id, name, phone)')
        .gte('sale_date', mondayStr)
        .lte('sale_date', sundayStr)
        .order('sale_date', { ascending: false }),
      supabase.from('customers').select('id, name, phone, tax_id, email, city, credit_limit, created_at').order('name'),
      supabase.from('products').select('id, sku, name, sale_price, cost_price, stock, unit, is_active').order('name'),
    ]);
    if (sRes.error) {
      push('error', 'No se pudieron cargar las ventas');
      setSales([]);
    } else {
      setSales(sRes.data as SaleRow[]);
    }
    if (!cRes.error) setCustomers(cRes.data as Customer[]);
    if (!prodRes.error) setProducts(prodRes.data as Product[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!sales) return [];
    if (!search) return sales;
    const q = search.toLowerCase();
    return sales.filter(
      (s) =>
        s.invoice_number?.toLowerCase().includes(q) ||
        s.customer?.name.toLowerCase().includes(q),
    );
  }, [sales, search]);

  const totalCollectedThisWeek = useMemo(
    () => filtered.reduce((acc, s) => acc + s.total, 0),
    [filtered],
  );

  const totals = useMemo(() => {
    const subtotal = items.reduce((acc, it) => acc + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0);
    const tax = form.has_tax ? subtotal * TAX_RATE : 0;
    return { subtotal, tax, total: subtotal + tax };
  }, [items, form.has_tax]);

  const openCreate = async () => {
    setEditing(null);
    setForm({
      customer_id: customers[0]?.id ?? '',
      invoice_number: '',
      sale_date: toDateInputValue(new Date()),
      notes: '',
      status: 'confirmada',
      has_tax: true,
    });
    setItems([{ id: crypto.randomUUID(), product_id: '', quantity: '1', unit_price: '0' }]);
    setModalOpen(true);
    // Genera el folio consultando el máximo histórico en la BD
    const { data } = await supabase.rpc('next_invoice_number');
    if (data) setForm((prev) => ({ ...prev, invoice_number: data as string }));
  };

  const openEdit = async (s: SaleRow) => {
    setEditing(s);
    const { data: existingItems } = await supabase.from('sale_items').select('*').eq('sale_id', s.id);
    setForm({
      customer_id: s.customer_id,
      invoice_number: s.invoice_number ?? '',
      sale_date: toDateInputValue(s.sale_date),
      notes: s.notes ?? '',
      status: s.status,
      has_tax: Number(s.tax) > 0,
    });
    setItems(
      (existingItems ?? []).map((it) => ({
        id: it.id,
        product_id: it.product_id,
        quantity: String(it.quantity),
        unit_price: String(it.unit_price),
      })),
    );
    setModalOpen(true);
  };

  const addItem = () =>
    setItems([...items, { id: crypto.randomUUID(), product_id: '', quantity: '1', unit_price: '0' }]);

  const updateItem = (id: string, patch: Partial<ItemRow>) =>
    setItems(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const removeItem = (id: string) => setItems(items.filter((it) => it.id !== id));

  const onProductChange = (id: string, productId: string) => {
    const product = products.find((p) => p.id === productId);
    updateItem(id, { product_id: productId, unit_price: product ? String(product.sale_price) : '0' });
  };

  const save = async () => {
    if (!form.customer_id) {
      push('error', 'Selecciona un cliente');
      return;
    }
    const validItems = items.filter((it) => it.product_id && Number(it.quantity) > 0);
    if (validItems.length === 0) {
      push('error', 'Agrega al menos un producto');
      return;
    }
    for (const it of validItems) {
      const product = products.find((p) => p.id === it.product_id);
      if (product && Number(it.quantity) > product.stock) {
        push('error', `Stock insuficiente para ${product.name} (disponible: ${product.stock})`);
        return;
      }
    }
    setSaving(true);
    const payload = {
      customer_id: form.customer_id,
      invoice_number: form.invoice_number.trim() || null,
      sale_date: fromDateInputValue(form.sale_date),
      notes: form.notes.trim() || null,
      status: form.status,
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
    };

    if (editing) {
      const { error } = await supabase.from('sales').update(payload).eq('id', editing.id);
      if (error) {
        push('error', 'No se pudo actualizar la venta');
        setSaving(false);
        return;
      }
      await supabase.from('sale_items').delete().eq('sale_id', editing.id);
      const itemPayload = validItems.map((it) => ({
        sale_id: editing.id,
        product_id: it.product_id,
        quantity: Number(it.quantity),
        unit_price: Number(it.unit_price),
        subtotal: Number(it.quantity) * Number(it.unit_price),
      }));
      const { error: itemErr } = await supabase.from('sale_items').insert(itemPayload);
      if (itemErr) {
        push('error', 'No se guardaron los productos');
        setSaving(false);
        return;
      }
      push('success', 'Venta actualizada');
      setModalOpen(false);
      load();
      setSaving(false);
    } else {
      const { data: created, error } = await supabase.from('sales').insert(payload).select().single();
      if (error) {
        push('error', 'No se pudo crear la venta');
        setSaving(false);
        return;
      }
      const itemPayload = validItems.map((it) => ({
        sale_id: created.id,
        product_id: it.product_id,
        quantity: Number(it.quantity),
        unit_price: Number(it.unit_price),
        subtotal: Number(it.quantity) * Number(it.unit_price),
      }));
      const { error: itemErr } = await supabase.from('sale_items').insert(itemPayload);
      if (itemErr) {
        push('error', 'No se guardaron los productos');
        setSaving(false);
        return;
      }
      push('success', 'Venta registrada');
      setModalOpen(false);
      setSaving(false);
      load(); // refresh list in background
      const customer = customers.find((c) => c.id === form.customer_id) ?? null;
      const row: SaleRow = { ...(created as Sale), customer };
      openReceipt(row);
    }
  };

  const openReceipt = (s: SaleRow) => setReceiptSale(s);

  const openDetail = async (s: SaleRow) => {
    setDetailOpen(s);
    const { data } = await supabase
      .from('sale_items')
      .select('*, product:products(*)')
      .eq('sale_id', s.id);
    setDetailItems((data as (SaleItem & { product: Product | null })[]) ?? []);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from('sales').delete().eq('id', deleteTarget.id);
    if (error) {
      push('error', 'No se pudo eliminar la venta');
    } else {
      push('success', 'Venta eliminada');
      load();
    }
    setDeleteTarget(null);
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Ventas"
        description="Facturas a clientes"
        actions={
          canCreate && (
            <button className="btn-primary" onClick={openCreate} disabled={customers.length === 0 || products.length === 0}>
              <Plus size={16} /> Nueva venta
            </button>
          )
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <TrendingUp size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-ink-900">{formatCurrency(totalCollectedThisWeek)}</p>
              <p className="text-sm text-ink-500">Recaudado esta semana</p>
            </div>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-success-50 text-success-600">
              <Receipt size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-ink-900">{filtered.length}</p>
              <p className="text-sm text-ink-500">Ventas esta semana</p>
            </div>
          </div>
        </div>
      </div>

      {(customers.length === 0 || products.length === 0) && !loading && (
        <div className="card p-4 mb-4 flex items-start gap-3 bg-warning-50 border-warning-200">
          <Users size={18} className="text-warning-600 mt-0.5" />
          <p className="text-sm text-warning-700">
            Necesitas al menos un cliente y un producto para registrar ventas.{' '}
            {customers.length === 0 && 'Crea un cliente primero. '}
            {products.length === 0 && 'Crea un producto en Inventario.'}
          </p>
        </div>
      )}

      <div className="card p-4 mb-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            className="input pl-9"
            placeholder="Buscar por folio o cliente…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <FullPageLoader />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={TrendingUp}
            title="Sin ventas"
            description="Registra tu primera venta a un cliente."
            action={
              <button className="btn-primary" onClick={openCreate} disabled={customers.length === 0 || products.length === 0}>
                <Plus size={16} /> Nueva venta
              </button>
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
                  <th className="table-head text-right">Subtotal</th>
                  <th className="table-head text-right">Impuesto</th>
                  <th className="table-head text-right">Total</th>
                  <th className="table-head">Estado</th>
                  <th className="table-head text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-ink-50/60 transition">
                    <td className="table-cell font-mono text-xs">{s.invoice_number ?? '—'}</td>
                    <td className="table-cell font-semibold text-ink-900">{s.customer?.name ?? '—'}</td>
                    <td className="table-cell">{formatDate(s.sale_date)}</td>
                    <td className="table-cell text-right">{formatCurrency(s.subtotal)}</td>
                    <td className="table-cell text-right">{formatCurrency(s.tax)}</td>
                    <td className="table-cell text-right font-semibold">{formatCurrency(s.total)}</td>
                    <td className="table-cell">
                      <Badge variant={s.status === 'confirmada' ? 'success' : 'neutral'}>{s.status}</Badge>
                    </td>
                    <td className="table-cell text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openReceipt(s)}
                          className="rounded-lg p-1.5 text-ink-500 hover:bg-success-50 hover:text-success-600 transition"
                          aria-label="Ver ticket"
                          title="Ver ticket"
                        >
                          <Receipt size={16} />
                        </button>
                        <button
                          onClick={() => openDetail(s)}
                          className="rounded-lg p-1.5 text-ink-500 hover:bg-brand-50 hover:text-brand-600 transition"
                          aria-label="Ver detalle"
                        >
                          <Eye size={16} />
                        </button>
                        {canEdit && (
                          <button onClick={() => openEdit(s)} className="rounded-lg p-1.5 text-ink-500 hover:bg-brand-50 hover:text-brand-600 transition" aria-label="Editar">
                            <Pencil size={16} />
                          </button>
                        )}
                        {canDelete && (
                          <button onClick={() => setDeleteTarget(s)} className="rounded-lg p-1.5 text-ink-500 hover:bg-danger-50 hover:text-danger-600 transition" aria-label="Eliminar">
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar venta' : 'Nueva venta'}
        description="Los productos se descuentan del inventario al guardar."
        size="xl"
        footer={
          <div className="flex items-center justify-between w-full">
            <div className="text-sm text-ink-600">
              <span className="text-ink-400">Total: </span>
              <span className="font-bold text-ink-900 text-base">{formatCurrency(totals.total)}</span>
            </div>
            <div className="flex items-center gap-2">
              <button className="btn-secondary" onClick={() => setModalOpen(false)} disabled={saving}>
                Cancelar
              </button>
              <button className="btn-primary" onClick={save} disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar venta'}
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="label">Cliente *</label>
              <select
                className="input"
                value={form.customer_id}
                onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
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
              <label className="label">Folio / Factura</label>
              <input
                className="input bg-ink-50 text-ink-600 cursor-not-allowed font-mono"
                value={form.invoice_number}
                readOnly
                placeholder="Se genera automáticamente"
              />
              <p className="text-[10px] text-ink-400 mt-1">Se asigna automáticamente al crear la venta.</p>
            </div>
            <div>
              <label className="label">Fecha</label>
              <input
                className="input"
                type="date"
                value={form.sale_date}
                onChange={(e) => setForm({ ...form, sale_date: e.target.value })}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label !mb-0">Productos</label>
              <button className="btn-ghost text-xs" onClick={addItem}>
                <Plus size={14} /> Agregar línea
              </button>
            </div>
            <div className="space-y-2">
              {items.map((it) => {
                const product = products.find((p) => p.id === it.product_id);
                const lineTotal = (Number(it.quantity) || 0) * (Number(it.unit_price) || 0);
                const insufficient = product && Number(it.quantity) > product.stock;
                return (
                  <div
                    key={it.id}
                    className={`rounded-lg border p-3 ${
                      insufficient ? 'border-danger-200 bg-danger-50/40' : 'border-ink-200 bg-ink-50/40'
                    }`}
                  >
                    <div className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-12 sm:col-span-5">
                        <label className="label">Producto</label>
                        <select
                          className="input"
                          value={it.product_id}
                          onChange={(e) => onProductChange(it.id, e.target.value)}
                        >
                          <option value="">Selecciona producto…</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id} disabled={p.stock <= 0}>
                              {p.name} ({p.sku}) — stock {p.stock}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-5 sm:col-span-2">
                        <label className="label">Cantidad</label>
                        <input
                          className="input"
                          type="number"
                          step="0.001"
                          min="0"
                          value={it.quantity}
                          onChange={(e) => updateItem(it.id, { quantity: e.target.value })}
                          placeholder="0"
                        />
                      </div>
                      <div className="col-span-5 sm:col-span-2">
                        <label className="label">Precio unit.</label>
                        <input
                          className="input"
                          type="number"
                          step="0.01"
                          min="0"
                          value={it.unit_price}
                          onChange={(e) => updateItem(it.id, { unit_price: e.target.value })}
                          placeholder="0.00"
                        />
                      </div>
                      <div className="col-span-2 sm:col-span-2">
                        <label className="label">Subtotal</label>
                        <div className="text-right text-sm font-semibold text-ink-900 pt-2">
                          {formatCurrency(lineTotal)}
                        </div>
                      </div>
                      <div className="col-span-12 sm:col-span-1 flex justify-end">
                        <button
                          onClick={() => removeItem(it.id)}
                          className="rounded-lg p-1.5 text-ink-400 hover:bg-danger-50 hover:text-danger-600 transition"
                          aria-label="Quitar"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                    {product && (
                      <div className={`mt-1.5 text-xs pl-1 ${insufficient ? 'text-danger-600' : 'text-ink-500'}`}>
                        {insufficient
                          ? `Stock insuficiente (disponible: ${product.stock} ${product.unit})`
                          : `Stock disponible: ${product.stock} ${product.unit}`}
                      </div>
                    )}
                  </div>
                );
              })}
              {items.length === 0 && (
                <p className="text-sm text-ink-400 text-center py-4">Agrega al menos un producto.</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Notas</label>
              <textarea
                className="input"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Notas internas (opcional)"
              />
            </div>
            <div className="rounded-lg bg-ink-50 p-4 space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-ink-500">Subtotal</span>
                <span className="font-medium text-ink-800">{formatCurrency(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-ink-500">Impuesto {form.has_tax ? '(16%)' : '(0%)'}</span>
                <span className="font-medium text-ink-800">{formatCurrency(totals.tax)}</span>
              </div>
              <div className="flex justify-between pt-1.5 border-t border-ink-200">
                <span className="font-semibold text-ink-900">Total</span>
                <span className="font-bold text-ink-900 text-base">{formatCurrency(totals.total)}</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-ink-200 p-4">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.has_tax}
                onChange={(e) => setForm({ ...form, has_tax: e.target.checked })}
                className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-200"
              />
              <span className="text-sm text-ink-700">Aplicar IVA (16%)</span>
            </label>
            {!form.has_tax && (
              <p className="text-xs text-ink-500 mt-1.5">La venta se registrará sin impuestos. El total será igual al subtotal.</p>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={!!detailOpen}
        onClose={() => setDetailOpen(null)}
        title={`Venta · ${detailOpen?.invoice_number ?? 'Sin folio'}`}
        description={detailOpen?.customer?.name}
        size="lg"
      >
        {detailOpen && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-xs text-ink-500 uppercase font-semibold">Fecha</p>
                <p className="font-medium text-ink-800">{formatDate(detailOpen.sale_date)}</p>
              </div>
              <div>
                <p className="text-xs text-ink-500 uppercase font-semibold">Estado</p>
                <Badge variant={detailOpen.status === 'confirmada' ? 'success' : 'neutral'}>{detailOpen.status}</Badge>
              </div>
              <div>
                <p className="text-xs text-ink-500 uppercase font-semibold">Subtotal</p>
                <p className="font-medium text-ink-800">{formatCurrency(detailOpen.subtotal)}</p>
              </div>
              <div>
                <p className="text-xs text-ink-500 uppercase font-semibold">Impuesto</p>
                <p className="font-medium text-ink-800">{formatCurrency(detailOpen.tax)}</p>
              </div>
            </div>
            {detailOpen.notes && (
              <div className="rounded-lg bg-ink-50 p-3 text-sm text-ink-600">
                <p className="text-xs text-ink-500 uppercase font-semibold mb-1">Notas</p>
                {detailOpen.notes}
              </div>
            )}
            <div className="border border-ink-100 rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-ink-100">
                <thead className="bg-ink-50/60">
                  <tr>
                    <th className="table-head">Producto</th>
                    <th className="table-head text-right">Cantidad</th>
                    <th className="table-head text-right">Precio unit.</th>
                    <th className="table-head text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {detailItems.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-ink-400">
                        <Package size={20} className="mx-auto mb-2" />
                        Sin productos
                      </td>
                    </tr>
                  ) : (
                    detailItems.map((it) => (
                      <tr key={it.id}>
                        <td className="table-cell font-medium text-ink-800">
                          {it.product?.name ?? 'Producto eliminado'}
                          <div className="text-xs text-ink-500">{it.product?.sku}</div>
                        </td>
                        <td className="table-cell text-right">{it.quantity}</td>
                        <td className="table-cell text-right">{formatCurrency(it.unit_price)}</td>
                        <td className="table-cell text-right font-semibold">{formatCurrency(it.subtotal)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-ink-50/60">
                    <td colSpan={3} className="table-cell text-right font-semibold">
                      Total
                    </td>
                    <td className="table-cell text-right font-bold text-ink-900">
                      {formatCurrency(detailOpen.total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </Modal>

      <SaleReceiptModal sale={receiptSale} onClose={() => setReceiptSale(null)} />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Eliminar venta"
        message="Se eliminará la venta y sus productos. El stock se revertirá automáticamente."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

