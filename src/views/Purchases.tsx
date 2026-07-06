import { useEffect, useMemo, useState } from 'react';
import {
  ShoppingCart,
  Plus,
  Trash2,
  Search,
  Eye,
  Pencil,
  X,
  Package,
  Building2,
  Wallet,
  Banknote,
  Building,
  CheckCircle2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Product, Purchase, PurchaseItem, Supplier, SupplierPayment } from '../lib/types';
import { formatCurrency, formatDate, fromDateInputValue, toDateInputValue } from '../lib/format';
import PageHeader from '../components/ui/PageHeader';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { useToast } from '../components/ui/Toast';
import { FullPageLoader } from '../components/ui/Spinner';
import { useAuth } from '../lib/auth';

type PurchaseRow = Purchase & { supplier: Supplier | null };
type ItemRow = {
  id: string;
  product_id: string;
  quantity: string;
  unit_cost: string;
};
type PaymentRow = SupplierPayment & { supplier: Supplier | null; purchase: Purchase | null };

const TAX_RATE = 0.16;

type PaymentSplit = {
  efectivo: string;
  banco: string;
  por_pagar: string;
};

const emptyPayments: PaymentSplit = { efectivo: '0', banco: '0', por_pagar: '0' };

const PAYMENT_METHODS = [
  { value: 'efectivo', label: 'Efectivo', icon: Banknote },
  { value: 'banco', label: 'Banco', icon: Building },
  { value: 'por_pagar', label: 'Por pagar', icon: Wallet },
];

type SupPayForm = {
  supplier_id: string;
  purchase_id: string;
  method: string;
  amount: string;
  reference: string;
  payment_date: string;
  notes: string;
};

const emptySupPayForm = (): SupPayForm => ({
  supplier_id: '',
  purchase_id: '',
  method: 'efectivo',
  amount: '0',
  reference: '',
  payment_date: toDateInputValue(new Date()),
  notes: '',
});

export default function Purchases() {
  const { can } = useAuth();
  const canCreate = can('purchases:create');
  const canEdit   = can('purchases:edit');
  const canDelete = can('purchases:delete');

  const { push } = useToast();
  const [tab, setTab] = useState<'compras' | 'pagos'>('compras');

  const [purchases, setPurchases] = useState<PurchaseRow[] | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [supPayments, setSupPayments] = useState<PaymentRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState<PurchaseRow | null>(null);
  const [detailItems, setDetailItems] = useState<(PurchaseItem & { product: Product | null })[]>([]);
  const [detailPayments, setDetailPayments] = useState<Array<{ amount: number; payment_method: string; payment_date: string }>>([]);
  const [editing, setEditing] = useState<Purchase | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PurchaseRow | null>(null);

  const [supPayOpen, setSupPayOpen] = useState(false);
  const [editingSupPay, setEditingSupPay] = useState<PaymentRow | null>(null);
  const [deleteSupPay, setDeleteSupPay] = useState<PaymentRow | null>(null);
  const [supPayForm, setSupPayForm] = useState<SupPayForm>(emptySupPayForm());
  const [savingSupPay, setSavingSupPay] = useState(false);

  const [form, setForm] = useState({
    supplier_id: '',
    invoice_number: '',
    purchase_date: toDateInputValue(new Date()),
    notes: '',
    status: 'confirmada',
    has_tax: true,
  });
  const [items, setItems] = useState<ItemRow[]>([]);
  const [payments, setPayments] = useState<PaymentSplit>(emptyPayments);
  const [paymentByPurchase, setPaymentByPurchase] = useState<Array<{ purchase_id: string; amount: number; payment_method: string }>>([]);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [pRes, sRes, prodRes, paysRes, supPaysRes] = await Promise.all([
      supabase.from('purchases').select('*, supplier:suppliers(*)').order('purchase_date', { ascending: false }),
      supabase.from('suppliers').select('*').order('name'),
      supabase.from('products').select('*').order('name'),
      supabase.from('supplier_payments').select('purchase_id, amount, payment_method'),
      supabase
        .from('supplier_payments')
        .select('*, supplier:suppliers(*), purchase:purchases(*)')
        .order('payment_date', { ascending: false }),
    ]);
    if (pRes.error) {
      push('error', 'No se pudieron cargar las compras');
      setPurchases([]);
    } else {
      setPurchases(pRes.data as PurchaseRow[]);
    }
    if (!sRes.error) setSuppliers(sRes.data as Supplier[]);
    if (!prodRes.error) setProducts(prodRes.data as Product[]);
    setPaymentByPurchase((paysRes.data ?? []) as Array<{ purchase_id: string; amount: number; payment_method: string }>);
    if (!supPaysRes.error) setSupPayments(supPaysRes.data as PaymentRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!purchases) return [];
    return purchases.filter((p) => {
      const matchesSearch =
        !search ||
        p.invoice_number?.toLowerCase().includes(search.toLowerCase()) ||
        p.supplier?.name.toLowerCase().includes(search.toLowerCase());
      return matchesSearch;
    });
  }, [purchases, search]);

  const filteredSupPayments = useMemo(() => {
    if (!supPayments) return [];
    return supPayments.filter((p) => {
      const matchesSearch =
        !search ||
        p.supplier?.name.toLowerCase().includes(search.toLowerCase()) ||
        p.reference?.toLowerCase().includes(search.toLowerCase());
      const matchesMethod = methodFilter === 'all' || p.payment_method === methodFilter;
      return matchesSearch && matchesMethod;
    });
  }, [supPayments, search, methodFilter]);

  const totals = useMemo(() => {
    const subtotal = items.reduce((acc, it) => acc + (Number(it.quantity) || 0) * (Number(it.unit_cost) || 0), 0);
    const tax = form.has_tax ? subtotal * TAX_RATE : 0;
    return { subtotal, tax, total: subtotal + tax };
  }, [items, form.has_tax]);

  const paidNow = useMemo(
    () => (Number(payments.efectivo) || 0) + (Number(payments.banco) || 0),
    [payments],
  );
  const porPagar = useMemo(() => Number(payments.por_pagar) || 0, [payments]);
  const paymentTotal = paidNow + porPagar;
  const paymentDiff = totals.total - paymentTotal;
  const paymentBalanced = Math.abs(paymentDiff) < 0.01;

  const getPaymentLabel = (purchaseId: string, purchaseTotal: number) => {
    const pays = paymentByPurchase.filter((p) => p.purchase_id === purchaseId);
    const efectivo = pays.filter((p) => p.payment_method === 'efectivo').reduce((a, b) => a + b.amount, 0);
    const banco = pays.filter((p) => p.payment_method === 'banco').reduce((a, b) => a + b.amount, 0);
    const paid = efectivo + banco;
    const porPagarAmt = Math.max(0, purchaseTotal - paid);
    const methods: string[] = [];
    if (efectivo > 0) methods.push('Efectivo');
    if (banco > 0) methods.push('Banco');
    if (porPagarAmt > 0.005) methods.push('Por pagar');
    if (methods.length === 0) return { label: 'Sin pago', variant: 'neutral' as const };
    if (methods.length === 1) {
      if (methods[0] === 'Efectivo') return { label: 'Efectivo', variant: 'success' as const };
      if (methods[0] === 'Banco') return { label: 'Banco', variant: 'brand' as const };
      return { label: 'Por pagar', variant: 'warning' as const };
    }
    return { label: 'Combinado', variant: 'accent' as const };
  };

  const paidByPurchase = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of paymentByPurchase) {
      if (p.purchase_id) {
        map.set(p.purchase_id, (map.get(p.purchase_id) ?? 0) + p.amount);
      }
    }
    return map;
  }, [paymentByPurchase]);

  const totalPendingPay = useMemo(
    () =>
      (purchases ?? []).reduce((acc, p) => {
        const paid = paidByPurchase.get(p.id) ?? 0;
        return acc + Math.max(0, p.total - paid);
      }, 0),
    [purchases, paidByPurchase],
  );

  const openCreate = () => {
    setEditing(null);
    setForm({
      supplier_id: suppliers[0]?.id ?? '',
      invoice_number: '',
      purchase_date: toDateInputValue(new Date()),
      notes: '',
      status: 'confirmada',
      has_tax: true,
    });
    setItems([{ id: crypto.randomUUID(), product_id: '', quantity: '1', unit_cost: '0' }]);
    setPayments({ efectivo: '0', banco: '0', por_pagar: String(totals.total || 0) });
    setModalOpen(true);
  };

  const openEdit = async (p: PurchaseRow) => {
    setEditing(p);
    const [itemsRes, paysRes] = await Promise.all([
      supabase.from('purchase_items').select('*').eq('purchase_id', p.id),
      supabase.from('supplier_payments').select('amount, payment_method').eq('purchase_id', p.id),
    ]);
    setForm({
      supplier_id: p.supplier_id,
      invoice_number: p.invoice_number ?? '',
      purchase_date: toDateInputValue(p.purchase_date),
      notes: p.notes ?? '',
      status: p.status,
      has_tax: Number(p.tax) > 0,
    });
    setItems(
      ((itemsRes.data ?? []) as PurchaseItem[]).map((it) => ({
        id: it.id,
        product_id: it.product_id,
        quantity: String(it.quantity),
        unit_cost: String(it.unit_cost),
      })),
    );
    const pays = (paysRes.data ?? []) as Array<{ amount: number; payment_method: string }>;
    const efectivo = pays.filter((x) => x.payment_method === 'efectivo').reduce((a, b) => a + b.amount, 0);
    const banco = pays.filter((x) => x.payment_method === 'banco').reduce((a, b) => a + b.amount, 0);
    const por_pagar = Math.max(0, p.total - efectivo - banco);
    setPayments({
      efectivo: String(efectivo),
      banco: String(banco),
      por_pagar: String(por_pagar),
    });
    setModalOpen(true);
  };

  const addItem = () =>
    setItems([...items, { id: crypto.randomUUID(), product_id: '', quantity: '1', unit_cost: '0' }]);

  const updateItem = (id: string, patch: Partial<ItemRow>) =>
    setItems(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const removeItem = (id: string) => setItems(items.filter((it) => it.id !== id));

  const onProductChange = (id: string, productId: string) => {
    const product = products.find((p) => p.id === productId);
    updateItem(id, { product_id: productId, unit_cost: product ? String(product.cost_price) : '0' });
  };

  const save = async () => {
    if (!form.supplier_id) {
      push('error', 'Selecciona un proveedor');
      return;
    }
    const validItems = items.filter((it) => it.product_id && Number(it.quantity) > 0);
    if (validItems.length === 0) {
      push('error', 'Agrega al menos un producto');
      return;
    }
    if (!paymentBalanced) {
      push('error', `El pago (${formatCurrency(paymentTotal)}) no coincide con el total (${formatCurrency(totals.total)})`);
      return;
    }
    setSaving(true);
    const payload = {
      supplier_id: form.supplier_id,
      invoice_number: form.invoice_number.trim() || null,
      purchase_date: fromDateInputValue(form.purchase_date),
      notes: form.notes.trim() || null,
      status: form.status,
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
    };

    const buildPayments = (purchaseId: string) => {
      const rows: Array<{ supplier_id: string; purchase_id: string; amount: number; payment_method: string; payment_date: string }> = [];
      const efectivoAmt = Number(payments.efectivo) || 0;
      const bancoAmt = Number(payments.banco) || 0;
      const paymentDate = fromDateInputValue(form.purchase_date);
      if (efectivoAmt > 0) {
        rows.push({ supplier_id: form.supplier_id, purchase_id: purchaseId, amount: efectivoAmt, payment_method: 'efectivo', payment_date: paymentDate });
      }
      if (bancoAmt > 0) {
        rows.push({ supplier_id: form.supplier_id, purchase_id: purchaseId, amount: bancoAmt, payment_method: 'banco', payment_date: paymentDate });
      }
      return rows;
    };

    if (editing) {
      const { error } = await supabase.from('purchases').update(payload).eq('id', editing.id);
      if (error) {
        push('error', 'No se pudo actualizar la compra');
        setSaving(false);
        return;
      }
      await supabase.from('purchase_items').delete().eq('purchase_id', editing.id);
      await supabase.from('supplier_payments').delete().eq('purchase_id', editing.id);
      const itemPayload = validItems.map((it) => ({
        purchase_id: editing.id,
        product_id: it.product_id,
        quantity: Number(it.quantity),
        unit_cost: Number(it.unit_cost),
        subtotal: Number(it.quantity) * Number(it.unit_cost),
      }));
      const { error: itemErr } = await supabase.from('purchase_items').insert(itemPayload);
      if (itemErr) {
        push('error', 'No se guardaron los productos');
        setSaving(false);
        return;
      }
      const payRows = buildPayments(editing.id);
      if (payRows.length > 0) {
        const { error: payErr } = await supabase.from('supplier_payments').insert(payRows);
        if (payErr) push('error', 'No se guardaron los pagos, pero la compra sí se actualizó');
      }
      push('success', 'Compra actualizada');
    } else {
      const { data: created, error } = await supabase.from('purchases').insert(payload).select().single();
      if (error) {
        push('error', 'No se pudo crear la compra');
        setSaving(false);
        return;
      }
      const itemPayload = validItems.map((it) => ({
        purchase_id: created.id,
        product_id: it.product_id,
        quantity: Number(it.quantity),
        unit_cost: Number(it.unit_cost),
        subtotal: Number(it.quantity) * Number(it.unit_cost),
      }));
      const { error: itemErr } = await supabase.from('purchase_items').insert(itemPayload);
      if (itemErr) {
        push('error', 'No se guardaron los productos');
        setSaving(false);
        return;
      }
      const payRows = buildPayments(created.id);
      if (payRows.length > 0) {
        const { error: payErr } = await supabase.from('supplier_payments').insert(payRows);
        if (payErr) push('error', 'No se guardaron los pagos, pero la compra sí se registró');
      }
      push('success', 'Compra registrada');
    }
    setModalOpen(false);
    load();
    setSaving(false);
  };

  const openDetail = async (p: PurchaseRow) => {
    setDetailOpen(p);
    const [itemsRes, paysRes] = await Promise.all([
      supabase.from('purchase_items').select('*, product:products(*)').eq('purchase_id', p.id),
      supabase.from('supplier_payments').select('amount, payment_method, payment_date').eq('purchase_id', p.id),
    ]);
    setDetailItems((itemsRes.data as (PurchaseItem & { product: Product | null })[]) ?? []);
    setDetailPayments((paysRes.data as Array<{ amount: number; payment_method: string; payment_date: string }>) ?? []);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from('purchases').delete().eq('id', deleteTarget.id);
    if (error) {
      push('error', 'No se pudo eliminar la compra');
    } else {
      push('success', 'Compra eliminada');
      load();
    }
    setDeleteTarget(null);
  };

  const openRegisterPayment = (purchase: PurchaseRow) => {
    setEditingSupPay(null);
    const balance = purchase.total - (paidByPurchase.get(purchase.id) ?? 0);
    setSupPayForm({
      supplier_id: purchase.supplier_id,
      purchase_id: purchase.id,
      method: 'efectivo',
      amount: String(balance > 0 ? balance.toFixed(2) : '0'),
      reference: '',
      payment_date: toDateInputValue(new Date()),
      notes: '',
    });
    setSupPayOpen(true);
  };

  const openEditSupPay = (p: PaymentRow) => {
    setEditingSupPay(p);
    setSupPayForm({
      supplier_id: p.supplier_id,
      purchase_id: p.purchase_id ?? '',
      method: p.payment_method,
      amount: String(p.amount),
      reference: p.reference ?? '',
      payment_date: toDateInputValue(p.payment_date),
      notes: p.notes ?? '',
    });
    setSupPayOpen(true);
  };

  const saveSupPay = async () => {
    const amount = Number(supPayForm.amount);
    if (!supPayForm.supplier_id) {
      push('error', 'Selecciona un proveedor');
      return;
    }
    if (!amount || amount <= 0) {
      push('error', 'El monto debe ser mayor a cero');
      return;
    }
    setSavingSupPay(true);
    const payload = {
      supplier_id: supPayForm.supplier_id,
      purchase_id: supPayForm.purchase_id || null,
      amount,
      payment_method: supPayForm.method,
      reference: supPayForm.reference.trim() || null,
      payment_date: fromDateInputValue(supPayForm.payment_date),
      notes: supPayForm.notes.trim() || null,
    };
    if (editingSupPay) {
      const { error } = await supabase.from('supplier_payments').update(payload).eq('id', editingSupPay.id);
      if (error) push('error', 'No se pudo actualizar el pago');
      else {
        push('success', 'Pago actualizado');
        setSupPayOpen(false);
        load();
      }
    } else {
      const { error } = await supabase.from('supplier_payments').insert(payload);
      if (error) push('error', 'No se pudo registrar el pago');
      else {
        push('success', 'Pago registrado');
        setSupPayOpen(false);
        load();
      }
    }
    setSavingSupPay(false);
  };

  const confirmDeleteSupPay = async () => {
    if (!deleteSupPay) return;
    const { error } = await supabase.from('supplier_payments').delete().eq('id', deleteSupPay.id);
    if (error) push('error', 'No se pudo eliminar el pago');
    else {
      push('success', 'Pago eliminado');
      load();
    }
    setDeleteSupPay(null);
  };

  const methodLabel = (m: string) => PAYMENT_METHODS.find((p) => p.value === m)?.label ?? m;

  const selectedPurchaseForPay = supPayForm.purchase_id
    ? (purchases ?? []).find((p) => p.id === supPayForm.purchase_id) ?? null
    : null;
  const balanceForSelectedPurchase = selectedPurchaseForPay
    ? selectedPurchaseForPay.total - (paidByPurchase.get(selectedPurchaseForPay.id) ?? 0)
    : null;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Compras"
        description="Órdenes de compra y pagos a proveedores"
        actions={
          tab === 'compras' ? (
            canCreate && <button className="btn-primary" onClick={openCreate} disabled={suppliers.length === 0 || products.length === 0}>
              <Plus size={16} /> Nueva compra
            </button>
          ) : (
            <button
              className="btn-primary"
              onClick={() => {
                setEditingSupPay(null);
                setSupPayForm({ ...emptySupPayForm(), supplier_id: suppliers[0]?.id ?? '' });
                setSupPayOpen(true);
              }}
              disabled={suppliers.length === 0}
            >
              <Plus size={16} /> Nuevo pago
            </button>
          )
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <ShoppingCart size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-ink-900">{(purchases ?? []).length}</p>
              <p className="text-sm text-ink-500">Órdenes de compra</p>
            </div>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-warning-50 text-warning-600">
              <Wallet size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-ink-900">{formatCurrency(totalPendingPay)}</p>
              <p className="text-sm text-ink-500">Por pagar</p>
            </div>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-success-50 text-success-600">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-ink-900">
                {(purchases ?? []).filter((p) => Math.abs((paidByPurchase.get(p.id) ?? 0) - p.total) < 0.01).length}
              </p>
              <p className="text-sm text-ink-500">Pagadas completo</p>
            </div>
          </div>
        </div>
      </div>

      {(suppliers.length === 0 || products.length === 0) && !loading && tab === 'compras' && (
        <div className="card p-4 mb-4 flex items-start gap-3 bg-warning-50 border-warning-200">
          <Building2 size={18} className="text-warning-600 mt-0.5" />
          <p className="text-sm text-warning-700">
            Necesitas al menos un proveedor y un producto para registrar compras.{' '}
            {suppliers.length === 0 && 'Crea un proveedor primero. '}
            {products.length === 0 && 'Crea un producto en Inventario.'}
          </p>
        </div>
      )}

      <div className="flex items-center gap-1 mb-4 border-b border-ink-200">
        <button
          onClick={() => { setTab('compras'); setSearch(''); setMethodFilter('all'); }}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition border-b-2 -mb-px ${
            tab === 'compras'
              ? 'border-brand-600 text-brand-700'
              : 'border-transparent text-ink-500 hover:text-ink-700'
          }`}
        >
          <ShoppingCart size={16} /> Compras
          <span className="ml-1 rounded-full bg-ink-100 px-2 py-0.5 text-xs text-ink-600">
            {(purchases ?? []).length}
          </span>
        </button>
        <button
          onClick={() => { setTab('pagos'); setSearch(''); setMethodFilter('all'); }}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition border-b-2 -mb-px ${
            tab === 'pagos'
              ? 'border-brand-600 text-brand-700'
              : 'border-transparent text-ink-500 hover:text-ink-700'
          }`}
        >
          <Wallet size={16} /> Pagos a proveedores
          <span className="ml-1 rounded-full bg-ink-100 px-2 py-0.5 text-xs text-ink-600">
            {supPayments?.length ?? 0}
          </span>
        </button>
      </div>

      <div className="card p-4 mb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              className="input pl-9"
              placeholder={tab === 'compras' ? 'Buscar por folio o proveedor…' : 'Buscar por proveedor o referencia…'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {tab === 'pagos' && (
            <select
              className="input w-auto"
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
            >
              <option value="all">Todos los métodos</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {tab === 'compras' ? (
        <div className="card overflow-hidden">
          {loading ? (
            <FullPageLoader />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={ShoppingCart}
              title="Sin compras"
              description="Registra tu primera orden de compra a un proveedor."
              action={
                <button className="btn-primary" onClick={openCreate} disabled={suppliers.length === 0 || products.length === 0}>
                  <Plus size={16} /> Nueva compra
                </button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-ink-100">
                <thead className="bg-ink-50/60">
                  <tr>
                    <th className="table-head">Folio</th>
                    <th className="table-head">Proveedor</th>
                    <th className="table-head">Fecha</th>
                    <th className="table-head text-right">Subtotal</th>
                    <th className="table-head text-right">Impuesto</th>
                    <th className="table-head text-right">Total</th>
                    <th className="table-head text-right">Saldo</th>
                    <th className="table-head">Pago</th>
                    <th className="table-head">Estado</th>
                    <th className="table-head text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {filtered.map((p) => {
                    const paid = paidByPurchase.get(p.id) ?? 0;
                    const balance = Math.max(0, p.total - paid);
                    return (
                      <tr key={p.id} className="hover:bg-ink-50/60 transition">
                        <td className="table-cell font-mono text-xs">{p.invoice_number ?? '—'}</td>
                        <td className="table-cell font-semibold text-ink-900">{p.supplier?.name ?? '—'}</td>
                        <td className="table-cell">{formatDate(p.purchase_date)}</td>
                        <td className="table-cell text-right">{formatCurrency(p.subtotal)}</td>
                        <td className="table-cell text-right">{formatCurrency(p.tax)}</td>
                        <td className="table-cell text-right font-semibold">{formatCurrency(p.total)}</td>
                        <td className="table-cell text-right">
                          {balance > 0.005 ? (
                            <span className="font-semibold text-warning-600">{formatCurrency(balance)}</span>
                          ) : (
                            <span className="text-success-600 font-semibold">Pagado</span>
                          )}
                        </td>
                        <td className="table-cell">
                          {(() => {
                            const pl = getPaymentLabel(p.id, p.total);
                            return <Badge variant={pl.variant}>{pl.label}</Badge>;
                          })()}
                        </td>
                        <td className="table-cell">
                          <Badge variant={p.status === 'confirmada' ? 'success' : 'neutral'}>{p.status}</Badge>
                        </td>
                        <td className="table-cell text-right">
                          <div className="flex items-center justify-end gap-1">
                            {balance > 0.005 && (
                              <button
                                onClick={() => openRegisterPayment(p)}
                                className="inline-flex items-center gap-1 rounded-lg bg-success-50 px-2.5 py-1.5 text-xs font-semibold text-success-700 hover:bg-success-100 transition"
                                title="Registrar pago"
                              >
                                <Wallet size={14} /> Pagar
                              </button>
                            )}
                            <button
                              onClick={() => openDetail(p)}
                              className="rounded-lg p-1.5 text-ink-500 hover:bg-brand-50 hover:text-brand-600 transition"
                              aria-label="Ver detalle"
                            >
                              <Eye size={16} />
                            </button>
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
      ) : (
        <div className="card overflow-hidden">
          {loading ? (
            <FullPageLoader />
          ) : filteredSupPayments.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="Sin pagos registrados"
              description="Registra pagos a proveedores desde la tabla de compras o con el botón de arriba."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-ink-100">
                <thead className="bg-ink-50/60">
                  <tr>
                    <th className="table-head">Fecha</th>
                    <th className="table-head">Proveedor</th>
                    <th className="table-head">Folio compra</th>
                    <th className="table-head">Método</th>
                    <th className="table-head">Referencia</th>
                    <th className="table-head text-right">Monto</th>
                    <th className="table-head text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {filteredSupPayments.map((p) => (
                    <tr key={p.id} className="hover:bg-ink-50/60 transition">
                      <td className="table-cell">{formatDate(p.payment_date)}</td>
                      <td className="table-cell font-semibold text-ink-900">{p.supplier?.name ?? '—'}</td>
                      <td className="table-cell font-mono text-xs">{p.purchase?.invoice_number ?? '—'}</td>
                      <td className="table-cell">
                        <Badge variant="neutral">{methodLabel(p.payment_method)}</Badge>
                      </td>
                      <td className="table-cell">{p.reference ?? '—'}</td>
                      <td className="table-cell text-right font-semibold text-success-600">
                        {formatCurrency(p.amount)}
                      </td>
                      <td className="table-cell text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEditSupPay(p)}
                            className="rounded-lg p-1.5 text-ink-500 hover:bg-brand-50 hover:text-brand-600 transition"
                            aria-label="Editar"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => setDeleteSupPay(p)}
                            className="rounded-lg p-1.5 text-ink-500 hover:bg-danger-50 hover:text-danger-600 transition"
                            aria-label="Eliminar"
                          >
                            <Trash2 size={16} />
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
      )}

      {/* Purchase create/edit modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar compra' : 'Nueva compra'}
        description="Los productos se agregan al inventario al guardar."
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
                {saving ? 'Guardando…' : 'Guardar compra'}
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-1">
              <label className="label">Proveedor *</label>
              <select
                className="input"
                value={form.supplier_id}
                onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}
              >
                <option value="">Selecciona…</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Folio / Factura</label>
              <input
                className="input"
                value={form.invoice_number}
                onChange={(e) => setForm({ ...form, invoice_number: e.target.value })}
                placeholder="Ej. FAC-2026-001"
              />
            </div>
            <div>
              <label className="label">Fecha</label>
              <input
                className="input"
                type="date"
                value={form.purchase_date}
                onChange={(e) => setForm({ ...form, purchase_date: e.target.value })}
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
                const lineTotal = (Number(it.quantity) || 0) * (Number(it.unit_cost) || 0);
                return (
                  <div
                    key={it.id}
                    className="rounded-lg border border-ink-200 bg-ink-50/40 p-3"
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
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.sku})
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
                          value={it.unit_cost}
                          onChange={(e) => updateItem(it.id, { unit_cost: e.target.value })}
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
                      <div className="mt-1.5 text-xs text-ink-500 pl-1">
                        Stock actual: {product.stock} {product.unit}
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
            <div className="flex items-center justify-between mb-3">
              <label className="label !mb-0">Impuestos</label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.has_tax}
                  onChange={(e) => setForm({ ...form, has_tax: e.target.checked })}
                  className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-200"
                />
                <span className="text-sm text-ink-700">Aplicar IVA (16%)</span>
              </label>
            </div>
            {!form.has_tax && (
              <p className="text-xs text-ink-500">La compra se registrará sin impuestos. El total será igual al subtotal.</p>
            )}
          </div>

          <div className="rounded-lg border border-ink-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <label className="label !mb-0">Pago inicial</label>
              <span className="text-xs text-ink-500">
                Total a cubrir: <span className="font-bold text-ink-900">{formatCurrency(totals.total)}</span>
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="label">Efectivo</label>
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  min="0"
                  value={payments.efectivo}
                  onChange={(e) => setPayments({ ...payments, efectivo: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Banco / Transferencia</label>
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  min="0"
                  value={payments.banco}
                  onChange={(e) => setPayments({ ...payments, banco: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Por pagar (crédito)</label>
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  min="0"
                  value={payments.por_pagar}
                  onChange={(e) => setPayments({ ...payments, por_pagar: e.target.value })}
                />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
              <div className="flex items-center gap-3">
                <span className="text-ink-500">Suma: <span className="font-semibold text-ink-800">{formatCurrency(paymentTotal)}</span></span>
                <button
                  type="button"
                  className="text-xs font-semibold text-brand-600 hover:text-brand-700"
                  onClick={() => setPayments({ efectivo: '0', banco: '0', por_pagar: String(totals.total) })}
                >
                  Todo al crédito
                </button>
                <button
                  type="button"
                  className="text-xs font-semibold text-brand-600 hover:text-brand-700"
                  onClick={() => setPayments({ efectivo: String(totals.total), banco: '0', por_pagar: '0' })}
                >
                  Todo en efectivo
                </button>
              </div>
              <span
                className={`text-xs font-semibold ${
                  paymentBalanced ? 'text-success-600' : 'text-danger-600'
                }`}
              >
                {paymentBalanced
                  ? 'Cuadra con el total'
                  : `Diferencia: ${formatCurrency(Math.abs(paymentDiff))}`}
              </span>
            </div>
          </div>
        </div>
      </Modal>

      {/* Purchase detail modal */}
      <Modal
        open={!!detailOpen}
        onClose={() => setDetailOpen(null)}
        title={`Compra · ${detailOpen?.invoice_number ?? 'Sin folio'}`}
        description={detailOpen?.supplier?.name}
        size="lg"
      >
        {detailOpen && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-xs text-ink-500 uppercase font-semibold">Fecha</p>
                <p className="font-medium text-ink-800">{formatDate(detailOpen.purchase_date)}</p>
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
                    <th className="table-head text-right">Costo unit.</th>
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
                        <td className="table-cell text-right">{formatCurrency(it.unit_cost)}</td>
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

            <div>
              <h4 className="text-sm font-semibold text-ink-800 mb-2">Detalle de pago</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg bg-success-50 p-3">
                  <p className="text-xs text-success-600 uppercase font-semibold">Efectivo</p>
                  <p className="font-bold text-success-700">
                    {formatCurrency(detailPayments.filter((p) => p.payment_method === 'efectivo').reduce((a, b) => a + b.amount, 0))}
                  </p>
                </div>
                <div className="rounded-lg bg-brand-50 p-3">
                  <p className="text-xs text-brand-600 uppercase font-semibold">Banco</p>
                  <p className="font-bold text-brand-700">
                    {formatCurrency(detailPayments.filter((p) => p.payment_method === 'banco').reduce((a, b) => a + b.amount, 0))}
                  </p>
                </div>
                <div className="rounded-lg bg-warning-50 p-3">
                  <p className="text-xs text-warning-600 uppercase font-semibold">Por pagar</p>
                  <p className="font-bold text-warning-700">
                    {formatCurrency(
                      detailOpen.total - detailPayments.reduce((a, b) => a + b.amount, 0),
                    )}
                  </p>
                </div>
                <div className="rounded-lg bg-ink-50 p-3">
                  <p className="text-xs text-ink-500 uppercase font-semibold">Total</p>
                  <p className="font-bold text-ink-900">{formatCurrency(detailOpen.total)}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Register/edit supplier payment modal */}
      <Modal
        open={supPayOpen}
        onClose={() => setSupPayOpen(false)}
        title={editingSupPay ? 'Editar pago a proveedor' : 'Registrar pago a proveedor'}
        description={editingSupPay ? 'Modifica los datos del pago' : 'Registra un pago por una compra a crédito'}
        size="lg"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setSupPayOpen(false)} disabled={savingSupPay}>
              Cancelar
            </button>
            <button className="btn-success" onClick={saveSupPay} disabled={savingSupPay}>
              {savingSupPay ? 'Guardando…' : 'Guardar pago'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Proveedor *</label>
              <select
                className="input"
                value={supPayForm.supplier_id}
                onChange={(e) => setSupPayForm({ ...supPayForm, supplier_id: e.target.value, purchase_id: '' })}
              >
                <option value="">Selecciona…</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Compra asociada</label>
              <select
                className="input"
                value={supPayForm.purchase_id}
                onChange={(e) => {
                  const purchaseId = e.target.value;
                  const purchase = (purchases ?? []).find((p) => p.id === purchaseId);
                  if (purchase) {
                    const balance = purchase.total - (paidByPurchase.get(purchase.id) ?? 0);
                    setSupPayForm({
                      ...supPayForm,
                      purchase_id: purchaseId,
                      amount: String(balance > 0 ? balance.toFixed(2) : supPayForm.amount),
                    });
                  } else {
                    setSupPayForm({ ...supPayForm, purchase_id: purchaseId });
                  }
                }}
              >
                <option value="">Sin compra específica</option>
                {(purchases ?? [])
                  .filter((p) => !supPayForm.supplier_id || p.supplier_id === supPayForm.supplier_id)
                  .map((p) => {
                    const bal = Math.max(0, p.total - (paidByPurchase.get(p.id) ?? 0));
                    return (
                      <option key={p.id} value={p.id}>
                        {p.invoice_number ?? 'Sin folio'} · {formatCurrency(p.total)}
                        {bal > 0.005 ? ` (saldo: ${formatCurrency(bal)})` : ' ✓'}
                      </option>
                    );
                  })}
              </select>
            </div>
          </div>

          {selectedPurchaseForPay && balanceForSelectedPurchase !== null && (
            <div className="rounded-lg bg-ink-50 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-500">Total de la compra</span>
                <span className="font-semibold text-ink-900">{formatCurrency(selectedPurchaseForPay.total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-500">Ya pagado</span>
                <span className="font-semibold text-success-600">
                  {formatCurrency(paidByPurchase.get(selectedPurchaseForPay.id) ?? 0)}
                </span>
              </div>
              <div className="flex justify-between pt-1.5 border-t border-ink-200 mt-1.5">
                <span className="font-semibold text-ink-700">Saldo pendiente</span>
                <span className={`font-bold ${balanceForSelectedPurchase > 0 ? 'text-warning-600' : 'text-success-600'}`}>
                  {balanceForSelectedPurchase > 0 ? formatCurrency(balanceForSelectedPurchase) : 'Pagado'}
                </span>
              </div>
            </div>
          )}

          <div>
            <label className="label">Método de pago</label>
            <div className="grid grid-cols-3 gap-2">
              {PAYMENT_METHODS.filter((m) => m.value !== 'por_pagar').concat(PAYMENT_METHODS.filter((m) => m.value === 'por_pagar')).map((m) => {
                const Icon = m.icon;
                const active = supPayForm.method === m.value;
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setSupPayForm({ ...supPayForm, method: m.value })}
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Monto *</label>
              <input
                className="input"
                type="number"
                step="0.01"
                min="0"
                value={supPayForm.amount}
                onChange={(e) => setSupPayForm({ ...supPayForm, amount: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Fecha</label>
              <input
                className="input"
                type="date"
                value={supPayForm.payment_date}
                onChange={(e) => setSupPayForm({ ...supPayForm, payment_date: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Referencia</label>
              <input
                className="input"
                value={supPayForm.reference}
                onChange={(e) => setSupPayForm({ ...supPayForm, reference: e.target.value })}
                placeholder="Folio de transferencia, etc."
              />
            </div>
            <div>
              <label className="label">Notas</label>
              <input
                className="input"
                value={supPayForm.notes}
                onChange={(e) => setSupPayForm({ ...supPayForm, notes: e.target.value })}
                placeholder="Notas internas"
              />
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Eliminar compra"
        message="Se eliminará la compra y sus productos. El stock se revertirá automáticamente."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteSupPay}
        title="Eliminar pago"
        message="¿Eliminar este pago al proveedor? El saldo de la cuenta por pagar se recalculará."
        onConfirm={confirmDeleteSupPay}
        onCancel={() => setDeleteSupPay(null)}
      />
    </div>
  );
}
