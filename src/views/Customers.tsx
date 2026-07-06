import { useEffect, useMemo, useState } from 'react';
import { Users, Plus, Pencil, Trash2, Search, Eye, Phone, Mail, MapPin, Wallet } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { CustomerBalance } from '../lib/types';
import { formatCurrency } from '../lib/format';
import PageHeader from '../components/ui/PageHeader';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { useToast } from '../components/ui/Toast';
import { FullPageLoader } from '../components/ui/Spinner';
import { useAuth } from '../lib/auth';

type FormState = {
  name: string;
  tax_id: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  credit_limit: string;
};

const emptyForm: FormState = {
  name: '',
  tax_id: '',
  phone: '',
  email: '',
  address: '',
  city: '',
  credit_limit: '0',
};

export default function Customers() {
  const { can } = useAuth();
  const canCreate = can('customers:create');
  const canEdit   = can('customers:edit');
  const canDelete = can('customers:delete');

  const { push } = useToast();
  const [balances, setBalances] = useState<CustomerBalance[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerBalance | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CustomerBalance | null>(null);
  const [detail, setDetail] = useState<CustomerBalance | null>(null);
  const [detailSales, setDetailSales] = useState<Array<{ id: string; invoice_number: string | null; total: number; sale_date: string; status: string }>>([]);
  const [detailCollections, setDetailCollections] = useState<Array<{ id: string; amount: number; collection_date: string; payment_method: string; reference: string | null }>>([]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('customer_balances')
      .select('*')
      .order('name', { ascending: true });
    if (error) {
      push('error', 'No se pudo cargar los clientes');
      setBalances([]);
    } else {
      setBalances(data as CustomerBalance[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!balances) return [];
    return balances.filter((c) =>
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.tax_id?.toLowerCase().includes(search.toLowerCase()),
    );
  }, [balances, search]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (c: CustomerBalance) => {
    setEditing(c);
    setForm({
      name: c.name,
      tax_id: c.tax_id ?? '',
      phone: c.phone ?? '',
      email: c.email ?? '',
      address: '',
      city: c.city ?? '',
      credit_limit: String(c.credit_limit),
    });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      push('error', 'El nombre es obligatorio');
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      tax_id: form.tax_id.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      credit_limit: Number(form.credit_limit) || 0,
    };
    if (editing) {
      const { error } = await supabase.from('customers').update(payload).eq('id', editing.id);
      if (error) push('error', 'No se pudo actualizar el cliente');
      else {
        push('success', 'Cliente actualizado');
        setModalOpen(false);
        load();
      }
    } else {
      const { error } = await supabase.from('customers').insert(payload);
      if (error) push('error', 'No se pudo crear el cliente');
      else {
        push('success', 'Cliente creado');
        setModalOpen(false);
        load();
      }
    }
    setSaving(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from('customers').delete().eq('id', deleteTarget.id);
    if (error) {
      push('error', 'No se pudo eliminar (tiene ventas o cobranzas asociadas)');
    } else {
      push('success', 'Cliente eliminado');
      load();
    }
    setDeleteTarget(null);
  };

  const openDetail = async (c: CustomerBalance) => {
    setDetail(c);
    const [salesRes, colRes] = await Promise.all([
      supabase.from('sales').select('id, invoice_number, total, sale_date, status').eq('customer_id', c.id).order('sale_date', { ascending: false }).limit(10),
      supabase.from('collections').select('id, amount, collection_date, payment_method, reference').eq('customer_id', c.id).order('collection_date', { ascending: false }).limit(10),
    ]);
    setDetailSales((salesRes.data as typeof detailSales) ?? []);
    setDetailCollections((colRes.data as typeof detailCollections) ?? []);
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Clientes"
        description="Cartera de clientes y saldos pendientes"
        actions={canCreate && (
          <button className="btn-primary" onClick={openCreate}>
            <Plus size={16} /> Nuevo cliente
          </button>
        )}
      />

      <div className="card p-4 mb-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            className="input pl-9"
            placeholder="Buscar por nombre o RFC…"
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
            icon={Users}
            title="Sin clientes"
            description="Agrega tu primer cliente para empezar a registrar ventas."
            action={
              <button className="btn-primary" onClick={openCreate}>
                <Plus size={16} /> Nuevo cliente
              </button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-ink-100">
              <thead className="bg-ink-50/60">
                <tr>
                  <th className="table-head">Cliente</th>
                  <th className="table-head">Contacto</th>
                  <th className="table-head text-right">Comprado</th>
                  <th className="table-head text-right">Pagado</th>
                  <th className="table-head text-right">Saldo</th>
                  <th className="table-head text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {filtered.map((c) => {
                  const overLimit = c.credit_limit > 0 && c.balance > c.credit_limit;
                  return (
                    <tr key={c.id} className="hover:bg-ink-50/60 transition">
                      <td className="table-cell">
                        <div className="font-semibold text-ink-900">{c.name}</div>
                        <div className="text-xs text-ink-500">{c.tax_id ?? 'Sin RFC'}</div>
                      </td>
                      <td className="table-cell">
                        <div className="text-xs text-ink-500 space-y-0.5">
                          {c.phone && <div>{c.phone}</div>}
                          {c.city && <div>{c.city}</div>}
                          {!c.phone && !c.city && <div>—</div>}
                        </div>
                      </td>
                      <td className="table-cell text-right">{formatCurrency(c.total_purchased)}</td>
                      <td className="table-cell text-right text-success-600">{formatCurrency(c.total_paid)}</td>
                      <td className="table-cell text-right">
                        <span className={`font-semibold ${c.balance > 0 ? 'text-danger-600' : 'text-ink-700'}`}>
                          {formatCurrency(c.balance)}
                        </span>
                        {overLimit && (
                          <div className="text-[10px] text-danger-500">sobre límite</div>
                        )}
                      </td>
                      <td className="table-cell text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openDetail(c)}
                            className="rounded-lg p-1.5 text-ink-500 hover:bg-brand-50 hover:text-brand-600 transition"
                            aria-label="Ver detalle"
                          >
                            <Eye size={16} />
                          </button>
                          {canEdit && (
                            <button onClick={() => openEdit(c)} className="rounded-lg p-1.5 text-ink-500 hover:bg-brand-50 hover:text-brand-600 transition" aria-label="Editar">
                              <Pencil size={16} />
                            </button>
                          )}
                          {canDelete && (
                            <button onClick={() => setDeleteTarget(c)} className="rounded-lg p-1.5 text-ink-500 hover:bg-danger-50 hover:text-danger-600 transition" aria-label="Eliminar">
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
        title={editing ? 'Editar cliente' : 'Nuevo cliente'}
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
          <div className="sm:col-span-2">
            <label className="label">Nombre / Razón social *</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ej. Distribuidora del Norte SA"
            />
          </div>
          <div>
            <label className="label">RFC / Tax ID</label>
            <input
              className="input"
              value={form.tax_id}
              onChange={(e) => setForm({ ...form, tax_id: e.target.value })}
              placeholder="Ej. ABC123456789"
            />
          </div>
          <div>
            <label className="label">Teléfono</label>
            <input
              className="input"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="Ej. +52 55 1234 5678"
            />
          </div>
          <div>
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="cliente@correo.com"
            />
          </div>
          <div>
            <label className="label">Ciudad</label>
            <input
              className="input"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              placeholder="Ej. Monterrey, NL"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Dirección</label>
            <input
              className="input"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Calle, número, colonia"
            />
          </div>
          <div>
            <label className="label">Límite de crédito</label>
            <input
              className="input"
              type="number"
              step="0.01"
              min="0"
              value={form.credit_limit}
              onChange={(e) => setForm({ ...form, credit_limit: e.target.value })}
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.name ?? ''}
        description="Estado de cuenta del cliente"
        size="lg"
      >
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg bg-ink-50 p-3">
                <p className="text-xs text-ink-500 uppercase font-semibold">Comprado</p>
                <p className="font-bold text-ink-900">{formatCurrency(detail.total_purchased)}</p>
              </div>
              <div className="rounded-lg bg-success-50 p-3">
                <p className="text-xs text-success-600 uppercase font-semibold">Pagado</p>
                <p className="font-bold text-success-700">{formatCurrency(detail.total_paid)}</p>
              </div>
              <div className="rounded-lg bg-danger-50 p-3">
                <p className="text-xs text-danger-600 uppercase font-semibold">Saldo</p>
                <p className="font-bold text-danger-700">{formatCurrency(detail.balance)}</p>
              </div>
              <div className="rounded-lg bg-ink-50 p-3">
                <p className="text-xs text-ink-500 uppercase font-semibold">Límite crédito</p>
                <p className="font-bold text-ink-900">{formatCurrency(detail.credit_limit)}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              {detail.phone && (
                <div className="flex items-center gap-2 text-ink-600">
                  <Phone size={14} className="text-ink-400" /> {detail.phone}
                </div>
              )}
              {detail.email && (
                <div className="flex items-center gap-2 text-ink-600">
                  <Mail size={14} className="text-ink-400" /> {detail.email}
                </div>
              )}
              {detail.city && (
                <div className="flex items-center gap-2 text-ink-600">
                  <MapPin size={14} className="text-ink-400" /> {detail.city}
                </div>
              )}
            </div>

            <div>
              <h4 className="text-sm font-semibold text-ink-800 mb-2">Ventas recientes</h4>
              {detailSales.length === 0 ? (
                <p className="text-sm text-ink-400">Sin ventas registradas.</p>
              ) : (
                <div className="border border-ink-100 rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-ink-100">
                    <thead className="bg-ink-50/60">
                      <tr>
                        <th className="table-head">Folio</th>
                        <th className="table-head">Fecha</th>
                        <th className="table-head text-right">Total</th>
                        <th className="table-head">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {detailSales.map((s) => (
                        <tr key={s.id}>
                          <td className="table-cell font-mono text-xs">{s.invoice_number ?? '—'}</td>
                          <td className="table-cell">{new Date(s.sale_date).toLocaleDateString('es-MX')}</td>
                          <td className="table-cell text-right font-semibold">{formatCurrency(s.total)}</td>
                          <td className="table-cell">
                            <Badge variant={s.status === 'confirmada' ? 'success' : 'neutral'}>{s.status}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div>
              <h4 className="text-sm font-semibold text-ink-800 mb-2 flex items-center gap-2">
                <Wallet size={16} className="text-success-600" /> Cobranza reciente
              </h4>
              {detailCollections.length === 0 ? (
                <p className="text-sm text-ink-400">Sin pagos registrados.</p>
              ) : (
                <div className="border border-ink-100 rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-ink-100">
                    <thead className="bg-ink-50/60">
                      <tr>
                        <th className="table-head">Fecha</th>
                        <th className="table-head">Método</th>
                        <th className="table-head">Referencia</th>
                        <th className="table-head text-right">Monto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {detailCollections.map((c) => (
                        <tr key={c.id}>
                          <td className="table-cell">{new Date(c.collection_date).toLocaleDateString('es-MX')}</td>
                          <td className="table-cell">{c.payment_method}</td>
                          <td className="table-cell">{c.reference ?? '—'}</td>
                          <td className="table-cell text-right font-semibold text-success-600">
                            {formatCurrency(c.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Eliminar cliente"
        message={`¿Eliminar a "${deleteTarget?.name}"? No se podrá si tiene ventas o cobranzas asociadas.`}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
