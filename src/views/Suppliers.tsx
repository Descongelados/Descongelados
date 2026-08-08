import { useEffect, useMemo, useState } from 'react';
import { Building2, Plus, Pencil, Trash2, Search, Eye, Phone, Mail, MapPin, DollarSign } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { SupplierBalance } from '../lib/types';
import { formatCurrency, formatDate } from '../lib/format';
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
  contact: string;
};

const emptyForm: FormState = {
  name: '',
  tax_id: '',
  phone: '',
  email: '',
  address: '',
  city: '',
  contact: '',
};

export default function Suppliers() {
  const { can } = useAuth();
  const canCreate = can('suppliers:create');
  const canEdit   = can('suppliers:edit');
  const canDelete = can('suppliers:delete');

  const { push } = useToast();
  const [balances, setBalances] = useState<SupplierBalance[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierBalance | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SupplierBalance | null>(null);
  const [detail, setDetail] = useState<SupplierBalance | null>(null);
  const [detailPurchases, setDetailPurchases] = useState<Array<{ id: string; invoice_number: string | null; total: number; purchase_date: string; status: string }>>([]);
  const [detailPayments, setDetailPayments] = useState<Array<{ id: string; amount: number; payment_date: string; payment_method: string; reference: string | null }>>([]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('supplier_balances')
      .select('*')
      .order('name', { ascending: true });
    if (error) {
      push('error', 'No se pudo cargar los proveedores');
      setBalances([]);
    } else {
      setBalances(data as SupplierBalance[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!balances) return [];
    return balances.filter((s) =>
      !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.tax_id?.toLowerCase().includes(search.toLowerCase()),
    );
  }, [balances, search]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (s: SupplierBalance) => {
    setEditing(s);
    setForm({
      name: s.name,
      tax_id: s.tax_id ?? '',
      phone: s.phone ?? '',
      email: s.email ?? '',
      address: '',
      city: s.city ?? '',
      contact: s.contact ?? '',
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
      contact: form.contact.trim() || null,
    };
    if (editing) {
      const { error } = await supabase.from('suppliers').update(payload).eq('id', editing.id);
      if (error) push('error', 'No se pudo actualizar el proveedor');
      else {
        push('success', 'Proveedor actualizado');
        setModalOpen(false);
        load();
      }
    } else {
      const { error } = await supabase.from('suppliers').insert(payload);
      if (error) push('error', 'No se pudo crear el proveedor');
      else {
        push('success', 'Proveedor creado');
        setModalOpen(false);
        load();
      }
    }
    setSaving(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from('suppliers').delete().eq('id', deleteTarget.id);
    if (error) {
      push('error', 'No se pudo eliminar (tiene compras o pagos asociados)');
    } else {
      push('success', 'Proveedor eliminado');
      load();
    }
    setDeleteTarget(null);
  };

  const openDetail = async (s: SupplierBalance) => {
    setDetail(s);
    const [pRes, payRes] = await Promise.all([
      supabase.from('purchases').select('id, invoice_number, total, purchase_date, status').eq('supplier_id', s.id).order('purchase_date', { ascending: false }).limit(10),
      supabase.from('supplier_payments').select('id, amount, payment_date, payment_method, reference').eq('supplier_id', s.id).order('payment_date', { ascending: false }).limit(10),
    ]);
    setDetailPurchases((pRes.data as typeof detailPurchases) ?? []);
    setDetailPayments((payRes.data as typeof detailPayments) ?? []);
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Proveedores"
        description="Cuentas por pagar a proveedores"
        actions={canCreate && (
          <button className="btn-primary" onClick={openCreate}>
            <Plus size={16} /> Nuevo proveedor
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
            icon={Building2}
            title="Sin proveedores"
            description="Agrega tu primer proveedor para empezar a registrar compras."
            action={
              <button className="btn-primary" onClick={openCreate}>
                <Plus size={16} /> Nuevo proveedor
              </button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-ink-100">
              <thead className="bg-ink-50/60">
                <tr>
                  <th className="table-head">Proveedor</th>
                  <th className="table-head">Contacto</th>
                  <th className="table-head text-right">Comprado</th>
                  <th className="table-head text-right">Pagado</th>
                  <th className="table-head text-right">Saldo</th>
                  <th className="table-head text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-ink-50/60 transition">
                    <td className="table-cell">
                      <div className="font-semibold text-ink-900">{s.name}</div>
                      <div className="text-xs text-ink-500">{s.tax_id ?? 'Sin RFC'}</div>
                    </td>
                    <td className="table-cell">
                      <div className="text-xs text-ink-500 space-y-0.5">
                        {s.contact && <div>{s.contact}</div>}
                        {s.phone && <div>{s.phone}</div>}
                        {!s.contact && !s.phone && <div>—</div>}
                      </div>
                    </td>
                    <td className="table-cell text-right">{formatCurrency(s.total_purchased)}</td>
                    <td className="table-cell text-right text-success-600">{formatCurrency(s.total_paid)}</td>
                    <td className="table-cell text-right">
                      <span className={`font-semibold ${s.balance > 0 ? 'text-warning-600' : 'text-ink-700'}`}>
                        {formatCurrency(s.balance)}
                      </span>
                    </td>
                    <td className="table-cell text-right">
                      <div className="flex items-center justify-end gap-1">
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
        title={editing ? 'Editar proveedor' : 'Nuevo proveedor'}
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
              placeholder="Ej. Proveedora Industrial SA"
            />
          </div>
          <div>
            <label className="label">RFC / Tax ID</label>
            <input
              className="input"
              value={form.tax_id}
              onChange={(e) => setForm({ ...form, tax_id: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Contacto</label>
            <input
              className="input"
              value={form.contact}
              onChange={(e) => setForm({ ...form, contact: e.target.value })}
              placeholder="Nombre del vendedor"
            />
          </div>
          <div>
            <label className="label">Teléfono</label>
            <input
              className="input"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Ciudad</label>
            <input
              className="input"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Dirección</label>
            <input
              className="input"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.name ?? ''}
        description="Estado de cuenta del proveedor"
        size="lg"
      >
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-ink-50 p-3">
                <p className="text-xs text-ink-500 uppercase font-semibold">Comprado</p>
                <p className="font-bold text-ink-900">{formatCurrency(detail.total_purchased)}</p>
              </div>
              <div className="rounded-lg bg-success-50 p-3">
                <p className="text-xs text-success-600 uppercase font-semibold">Pagado</p>
                <p className="font-bold text-success-700">{formatCurrency(detail.total_paid)}</p>
              </div>
              <div className="rounded-lg bg-warning-50 p-3">
                <p className="text-xs text-warning-600 uppercase font-semibold">Saldo</p>
                <p className="font-bold text-warning-700">{formatCurrency(detail.balance)}</p>
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
              <h4 className="text-sm font-semibold text-ink-800 mb-2">Compras recientes</h4>
              {detailPurchases.length === 0 ? (
                <p className="text-sm text-ink-400">Sin compras registradas.</p>
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
                      {detailPurchases.map((p) => (
                        <tr key={p.id}>
                          <td className="table-cell font-mono text-xs">{p.invoice_number ?? '—'}</td>
                          <td className="table-cell">{formatDate(p.purchase_date)}</td>
                          <td className="table-cell text-right font-semibold">{formatCurrency(p.total)}</td>
                          <td className="table-cell">
                            <Badge variant={p.status === 'confirmada' ? 'success' : 'neutral'}>{p.status}</Badge>
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
                <DollarSign size={16} className="text-success-600" /> Pagos recientes
              </h4>
              {detailPayments.length === 0 ? (
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
                      {detailPayments.map((p) => (
                        <tr key={p.id}>
                          <td className="table-cell">{formatDate(p.payment_date)}</td>
                          <td className="table-cell">{p.payment_method}</td>
                          <td className="table-cell">{p.reference ?? '—'}</td>
                          <td className="table-cell text-right font-semibold text-success-600">
                            {formatCurrency(p.amount)}
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
        title="Eliminar proveedor"
        message={`¿Eliminar a "${deleteTarget?.name}"? No se podrá si tiene compras o pagos asociados.`}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
