// ─── Role definitions ────────────────────────────────────────────────────────

export type Role = 'admin' | 'vendedor' | 'compras' | 'cobranza' | 'supervisor';

export type Permission =
  | 'sales:create'
  | 'sales:edit'
  | 'sales:delete'
  | 'customers:create'
  | 'customers:edit'
  | 'customers:delete'
  | 'purchases:create'
  | 'purchases:edit'
  | 'purchases:delete'
  | 'suppliers:create'
  | 'suppliers:edit'
  | 'suppliers:delete'
  | 'inventory:create'
  | 'inventory:edit'
  | 'inventory:delete'
  | 'collections:edit'
  | 'settings:manage';

const ALL_PERMISSIONS: Permission[] = [
  'sales:create', 'sales:edit', 'sales:delete',
  'customers:create', 'customers:edit', 'customers:delete',
  'purchases:create', 'purchases:edit', 'purchases:delete',
  'suppliers:create', 'suppliers:edit', 'suppliers:delete',
  'inventory:create', 'inventory:edit', 'inventory:delete',
  'collections:edit',
  'settings:manage',
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: ALL_PERMISSIONS,
  vendedor: ['sales:create', 'customers:create'],
  compras: ['purchases:create', 'suppliers:create'],
  cobranza: ['collections:edit'],
  supervisor: ['collections:edit', 'inventory:create', 'inventory:edit'],
};

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrador',
  vendedor: 'Vendedor',
  compras: 'Compras',
  cobranza: 'Cobranza',
  supervisor: 'Supervisor',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: 'Acceso completo a todos los módulos',
  vendedor: 'Puede ver todo y crear ventas y clientes',
  compras: 'Puede ver todo y crear compras y proveedores',
  cobranza: 'Puede ver todo y gestionar entregas y cobranza',
  supervisor: 'Puede ver todo, gestionar cobranza y agregar productos',
};

export const ROLE_COLORS: Record<Role, string> = {
  admin: 'bg-danger-100 text-danger-700',
  vendedor: 'bg-success-100 text-success-700',
  compras: 'bg-brand-100 text-brand-700',
  cobranza: 'bg-accent-100 text-accent-700',
  supervisor: 'bg-warning-100 text-warning-700',
};

// ─── Helper ──────────────────────────────────────────────────────────────────

export function hasPermission(roles: Role[], permission: Permission): boolean {
  return roles.some((role) => ROLE_PERMISSIONS[role].includes(permission));
}
