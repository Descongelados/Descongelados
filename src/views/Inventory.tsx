import { useEffect, useMemo, useState } from 'react';
import { Package, Plus, Pencil, Trash2, Search, Filter } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Product } from '../lib/types';
import { formatCurrency, formatNumber } from '../lib/format';
import PageHeader from '../components/ui/PageHeader';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { useToast } from '../components/ui/Toast';
import { FullPageLoader } from '../components/ui/Spinner';
import { useAuth } from '../lib/auth';

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

export default function Inventory() {
  const { can } = useAuth();
  const canCreate = can('inventory:create');
  const canEdit   = can('inventory:edit');
  const canDelete = can('inventory:delete');
  const canAdjust = can('inventory:adjust');

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
        push('success', 'Producto actualizado');
        setModalOpen(false);
        load();
      }
    } else {
      let attempt = 0;
      let success = false;
      while (attempt < 3 && !success) {
        const sku = attempt === 0 ? form.sku : await generateNextSku();
        const { error } = await supabase.from('products').insert({ ...basePayload, sku });
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
      push('success', 'Producto eliminado');
      load();
    }
    setDeleteTarget(null);
  };

  const stockFieldDisabled = !!editing && !canAdjust;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Inventario"
        description="Administra productos, precios y existencias"
        actions={canCreate && (
          <button className="btn-primary" onClick={openCreate}>
            <Plus size={16} /> Nuevo producto
          </button>
        )}
      />

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
              <button className="btn-primary" onClick={openCreate}>
                <Plus size={16} /> Nuevo producto
              </button>
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
            <label className="label">Stock{editing && canAdjust ? ' (ajuste manual)' : editing ? '' : ' inicial'}</label>
            <input
              className={`input ${stockFieldDisabled ? 'bg-ink-50 text-ink-500 cursor-not-allowed' : ''}`}
              type="number"
              step="0.001"
              value={form.stock}
              onChange={(e) => setForm({ ...form, stock: e.target.value })}
              disabled={stockFieldDisabled}
            />
            {editing && !canAdjust && (
              <p className="text-xs text-ink-400 mt-1">El stock se ajusta vía compras y ventas.</p>
            )}
            {editing && canAdjust && (
              <p className="text-xs text-warning-600 mt-1">Ajuste manual de stock — usar con precaución.</p>
            )}
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
