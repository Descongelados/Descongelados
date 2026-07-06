import { useEffect, useRef, useState } from 'react';
import {
  Settings,
  Building2,
  Users,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Eye,
  EyeOff,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import {
  AppUser,
  CompanyInfo,
  loadCompany,
  saveCompany,
} from '../lib/auth';
import { supabase } from '../lib/supabase';
import { Role, ROLE_LABELS, ROLE_DESCRIPTIONS, ROLE_COLORS } from '../lib/permissions';
import PageHeader from '../components/ui/PageHeader';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../lib/auth';

const ALL_ROLES: Role[] = ['admin', 'vendedor', 'compras', 'cobranza', 'supervisor'];

type UserForm = {
  name: string;
  username: string;
  password: string;
  roles: Role[];
  active: boolean;
};

const emptyUserForm = (): UserForm => ({
  name: '',
  username: '',
  password: '',
  roles: [],
  active: true,
});

export default function SettingsView() {
  const { push } = useToast();
  const { currentUser, isAdmin } = useAuth();
  const [tab, setTab] = useState<'empresa' | 'usuarios'>('empresa');

  // ── Company ──────────────────────────────────────────────────────────────
  const [company, setCompany] = useState<CompanyInfo>(loadCompany);
  const [companySaving, setCompanySaving] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_500_000) { push('error', 'El logo no debe superar 1.5 MB'); return; }
    const reader = new FileReader();
    reader.onload = () => setCompany((c) => ({ ...c, logo: reader.result as string }));
    reader.readAsDataURL(file);
  };

  const saveCompanyInfo = () => {
    if (!company.name.trim()) { push('error', 'El nombre de la empresa es obligatorio'); return; }
    setCompanySaving(true);
    saveCompany(company);
    setTimeout(() => { setCompanySaving(false); push('success', 'Información guardada'); }, 300);
  };

  // ── Users ─────────────────────────────────────────────────────────────────
  const [users, setUsers] = useState<AppUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [userModal, setUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [isSelfEdit, setIsSelfEdit] = useState(false);
  const [userForm, setUserForm] = useState<UserForm>(emptyUserForm());
  const [showPassword, setShowPassword] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null);

  const refreshUsers = async () => {
    const { data } = await supabase.from('app_users').select('*').order('created_at');
    setUsers((data ?? []).map((u) => ({ ...u, roles: u.roles as Role[] })));
    setUsersLoading(false);
  };

  useEffect(() => { refreshUsers(); }, []);

  const openCreateUser = () => {
    setEditingUser(null);
    setIsSelfEdit(false);
    setUserForm(emptyUserForm());
    setShowPassword(false);
    setUserModal(true);
  };

  const openEditUser = (u: AppUser) => {
    const selfEdit = !isAdmin && u.id === currentUser?.id;
    setEditingUser(u);
    setIsSelfEdit(selfEdit);
    setUserForm({ name: u.name, username: u.username, password: u.password, roles: [...u.roles], active: u.active });
    setShowPassword(false);
    setUserModal(true);
  };

  const toggleRole = (role: Role) => {
    setUserForm((f) => ({
      ...f,
      roles: f.roles.includes(role) ? f.roles.filter((r) => r !== role) : [...f.roles, role],
    }));
  };

  const saveUser = async () => {
    if (!userForm.name.trim()) { push('error', 'El nombre es obligatorio'); return; }

    // Non-admin self-edit: only name + password allowed
    if (isSelfEdit) {
      const { error } = await supabase.from('app_users').update({
        name: userForm.name.trim(),
        password: userForm.password.trim() || editingUser!.password,
      }).eq('id', editingUser!.id);
      if (error) { push('error', 'Error al actualizar perfil'); return; }
      push('success', 'Perfil actualizado');
      setUserModal(false);
      await refreshUsers();
      return;
    }

    if (!userForm.username.trim()) { push('error', 'El usuario es obligatorio'); return; }
    if (!editingUser && !userForm.password.trim()) { push('error', 'La contraseña es obligatoria'); return; }
    if (userForm.roles.length === 0) { push('error', 'Asigna al menos un rol'); return; }

    const normalUsername = userForm.username.trim().toLowerCase();

    // Unique username check
    const duplicate = users.find(
      (u) => u.username.toLowerCase() === normalUsername && u.id !== editingUser?.id,
    );
    if (duplicate) { push('error', 'Ese nombre de usuario ya existe'); return; }

    if (editingUser) {
      const { error } = await supabase.from('app_users').update({
        name: userForm.name.trim(),
        username: normalUsername,
        password: userForm.password.trim() || editingUser.password,
        roles: userForm.roles,
        active: userForm.active,
      }).eq('id', editingUser.id);
      if (error) { push('error', 'Error al actualizar usuario'); return; }
      push('success', 'Usuario actualizado');
    } else {
      const { error } = await supabase.from('app_users').insert({
        id: Date.now().toString(),
        name: userForm.name.trim(),
        username: normalUsername,
        password: userForm.password.trim(),
        roles: userForm.roles,
        active: userForm.active,
        created_at: new Date().toISOString(),
      });
      if (error) { push('error', 'Error al crear usuario'); return; }
      push('success', 'Usuario creado');
    }
    setUserModal(false);
    await refreshUsers();
  };

  const confirmDeleteUser = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.id === currentUser?.id) { push('error', 'No puedes eliminar tu propio usuario'); setDeleteTarget(null); return; }
    const { error } = await supabase.from('app_users').delete().eq('id', deleteTarget.id);
    if (error) { push('error', 'Error al eliminar usuario'); }
    else push('success', 'Usuario eliminado');
    setDeleteTarget(null);
    await refreshUsers();
  };

  const toggleActive = async (u: AppUser) => {
    if (u.id === currentUser?.id) { push('error', 'No puedes desactivarte a ti mismo'); return; }
    await supabase.from('app_users').update({ active: !u.active }).eq('id', u.id);
    await refreshUsers();
  };

  return (
    <div className="animate-fade-in">
      <PageHeader title="Configuración" description="Empresa, usuarios y permisos" />

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-ink-200">
        <button
          onClick={() => setTab('empresa')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition border-b-2 -mb-px ${tab === 'empresa' ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-500 hover:text-ink-700'}`}
        >
          <Building2 size={15} /> Empresa
        </button>
        <button
          onClick={() => setTab('usuarios')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition border-b-2 -mb-px ${tab === 'usuarios' ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-500 hover:text-ink-700'}`}
        >
          <Users size={15} /> Usuarios
          <span className="ml-1 rounded-full bg-ink-100 px-2 py-0.5 text-xs text-ink-600">{users.length}</span>
        </button>
      </div>

      {/* ── Empresa tab ── */}
      {tab === 'empresa' && (
        <div className="max-w-2xl space-y-6">
          {/* Logo */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-ink-700 mb-4 flex items-center gap-2"><Building2 size={15} /> Logo de la empresa</h3>
            <div className="flex items-center gap-5">
              <div className="h-24 w-24 rounded-xl border-2 border-dashed border-ink-300 flex items-center justify-center overflow-hidden bg-ink-50 shrink-0">
                {company.logo
                  ? <img src={company.logo} alt="logo" className="h-full w-full object-contain" />
                  : <Building2 size={32} className="text-ink-300" />
                }
              </div>
              <div className="space-y-2">
                <button
                  onClick={() => logoInputRef.current?.click()}
                  className="btn-secondary text-xs"
                >
                  <Upload size={14} /> Subir logo
                </button>
                {company.logo && (
                  <button
                    onClick={() => setCompany((c) => ({ ...c, logo: null }))}
                    className="btn-ghost text-xs text-danger-600 hover:bg-danger-50"
                  >
                    <X size={14} /> Eliminar logo
                  </button>
                )}
                <p className="text-xs text-ink-400">PNG, JPG · máx. 1.5 MB</p>
                <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
              </div>
            </div>
          </div>

          {/* Company info form */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-ink-700 mb-4 flex items-center gap-2"><Settings size={15} /> Datos de la empresa</h3>
            <div className="space-y-4">
              <div>
                <label className="label">Nombre de la empresa *</label>
                <input className="input" value={company.name} onChange={(e) => setCompany((c) => ({ ...c, name: e.target.value }))} placeholder="Nombre comercial" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">RFC</label>
                  <input className="input" value={company.rfc} onChange={(e) => setCompany((c) => ({ ...c, rfc: e.target.value }))} placeholder="XAXX010101000" />
                </div>
                <div>
                  <label className="label">Teléfono</label>
                  <input className="input" value={company.phone} onChange={(e) => setCompany((c) => ({ ...c, phone: e.target.value }))} placeholder="55 0000 0000" />
                </div>
              </div>
              <div>
                <label className="label">Dirección</label>
                <input className="input" value={company.address} onChange={(e) => setCompany((c) => ({ ...c, address: e.target.value }))} placeholder="Calle, número, colonia, ciudad" />
              </div>
              <div className="flex justify-end">
                <button className="btn-primary" onClick={saveCompanyInfo} disabled={companySaving}>
                  {companySaving ? 'Guardando…' : <><Check size={15} /> Guardar cambios</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Usuarios tab ── */}
      {tab === 'usuarios' && (
        <div className="space-y-4">
          {/* Role legend */}
          <div className="card p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500 mb-3 flex items-center gap-1.5"><ShieldCheck size={13} /> Roles disponibles</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {ALL_ROLES.map((role) => (
                <div key={role} className={`rounded-lg px-3 py-2 text-xs ${ROLE_COLORS[role]}`}>
                  <span className="font-bold">{ROLE_LABELS[role]}</span>
                  <span className="ml-1 opacity-80">— {ROLE_DESCRIPTIONS[role]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Users list */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-ink-100 bg-ink-50/50">
              <h3 className="text-sm font-semibold text-ink-700 flex items-center gap-2"><Users size={15} /> Usuarios del sistema</h3>
              {isAdmin && <button className="btn-primary text-xs" onClick={openCreateUser}><Plus size={14} /> Nuevo usuario</button>}
            </div>
            {usersLoading ? (
              <div className="py-10 text-center text-sm text-ink-400">Cargando usuarios…</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-ink-100">
                  <thead className="bg-ink-50/60">
                    <tr>
                      <th className="table-head">Usuario</th>
                      <th className="table-head">Nombre</th>
                      <th className="table-head">Roles</th>
                      <th className="table-head">Estado</th>
                      <th className="table-head text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-ink-50/60 transition">
                        <td className="table-cell font-mono text-xs font-semibold text-ink-800">{u.username}</td>
                        <td className="table-cell font-semibold text-ink-900">{u.name}</td>
                        <td className="table-cell">
                          <div className="flex flex-wrap gap-1">
                            {u.roles.map((r) => (
                              <span key={r} className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${ROLE_COLORS[r]}`}>
                                {ROLE_LABELS[r]}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="table-cell">
                          {isAdmin ? (
                            <button
                              onClick={() => toggleActive(u)}
                              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold transition ${u.active ? 'bg-success-100 text-success-700 hover:bg-success-200' : 'bg-ink-100 text-ink-500 hover:bg-ink-200'}`}
                            >
                              {u.active ? 'Activo' : 'Inactivo'}
                            </button>
                          ) : (
                            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${u.active ? 'bg-success-100 text-success-700' : 'bg-ink-100 text-ink-500'}`}>
                              {u.active ? 'Activo' : 'Inactivo'}
                            </span>
                          )}
                        </td>
                        <td className="table-cell text-right">
                          <div className="flex items-center justify-end gap-1">
                            {(isAdmin || u.id === currentUser?.id) && (
                              <button onClick={() => openEditUser(u)} className="rounded-lg p-1.5 text-ink-500 hover:bg-brand-50 hover:text-brand-600 transition" aria-label="Editar">
                                <Pencil size={15} />
                              </button>
                            )}
                            {isAdmin && (
                              <button onClick={() => setDeleteTarget(u)} disabled={u.id === currentUser?.id} className="rounded-lg p-1.5 text-ink-500 hover:bg-danger-50 hover:text-danger-600 transition disabled:opacity-30" aria-label="Eliminar">
                                <Trash2 size={15} />
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
        </div>
      )}

      {/* ── User modal ── */}
      <Modal
        open={userModal}
        onClose={() => setUserModal(false)}
        title={isSelfEdit ? 'Mi perfil' : editingUser ? 'Editar usuario' : 'Nuevo usuario'}
        size="md"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setUserModal(false)}>Cancelar</button>
            <button className="btn-primary" onClick={saveUser}>Guardar</button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Name — always visible */}
          <div className={isSelfEdit ? undefined : 'grid grid-cols-1 sm:grid-cols-2 gap-4'}>
            <div>
              <label className="label">Nombre completo *</label>
              <input className="input" value={userForm.name} onChange={(e) => setUserForm((f) => ({ ...f, name: e.target.value }))} placeholder="Nombre visible" />
            </div>

            {/* Username — admin only */}
            {!isSelfEdit && (
              <div>
                <label className="label">Usuario (login) *</label>
                <input className="input" value={userForm.username} onChange={(e) => setUserForm((f) => ({ ...f, username: e.target.value }))} placeholder="usuario123" autoCapitalize="none" />
              </div>
            )}
          </div>

          {/* Password — always visible */}
          <div>
            <label className="label">{editingUser ? 'Contraseña (dejar vacío para no cambiar)' : 'Contraseña *'}</label>
            <div className="relative">
              <input
                className="input pr-10"
                type={showPassword ? 'text' : 'password'}
                value={userForm.password}
                onChange={(e) => setUserForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="••••••••"
              />
              <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700 p-1" onClick={() => setShowPassword((v) => !v)}>
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Roles — admin only */}
          {!isSelfEdit && (
            <div>
              <label className="label">Roles * (puede tener más de uno)</label>
              <div className="grid grid-cols-1 gap-2">
                {ALL_ROLES.map((role) => {
                  const active = userForm.roles.includes(role);
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => toggleRole(role)}
                      className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition ${active ? 'border-brand-400 bg-brand-50' : 'border-ink-200 hover:bg-ink-50'}`}
                    >
                      <div className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition ${active ? 'border-brand-500 bg-brand-500' : 'border-ink-300'}`}>
                        {active && <Check size={10} className="text-white" strokeWidth={3} />}
                      </div>
                      <div>
                        <p className={`text-sm font-semibold ${active ? 'text-brand-700' : 'text-ink-800'}`}>{ROLE_LABELS[role]}</p>
                        <p className="text-xs text-ink-500">{ROLE_DESCRIPTIONS[role]}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Active toggle — admin only */}
          {!isSelfEdit && (
            <div className="flex items-center gap-2 rounded-lg border border-ink-200 px-3 py-2.5">
              <input
                id="user-active"
                type="checkbox"
                checked={userForm.active}
                onChange={(e) => setUserForm((f) => ({ ...f, active: e.target.checked }))}
                className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-200"
              />
              <label htmlFor="user-active" className="text-sm text-ink-700 cursor-pointer select-none">Usuario activo</label>
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Eliminar usuario"
        message={`¿Eliminar al usuario "${deleteTarget?.name}"? Esta acción no se puede deshacer.`}
        onConfirm={confirmDeleteUser}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
