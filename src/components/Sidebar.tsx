import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  TrendingUp,
  Users,
  Truck,
  Building2,
  Boxes,
  Menu,
  X,
  BarChart2,
  Settings,
  LogOut,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../lib/auth';

export type ViewKey =
  | 'dashboard'
  | 'inventory'
  | 'purchases'
  | 'sales'
  | 'customers'
  | 'suppliers'
  | 'collections'
  | 'reports'
  | 'settings';

type NavItem = {
  key: ViewKey;
  label: string;
  icon: typeof LayoutDashboard;
  description: string;
};

const navItems: NavItem[] = [
  { key: 'dashboard', label: 'Panel', icon: LayoutDashboard, description: 'Resumen general' },
  { key: 'inventory', label: 'Inventario', icon: Package, description: 'Productos y stock' },
  { key: 'purchases', label: 'Compras', icon: ShoppingCart, description: 'Órdenes a proveedores' },
  { key: 'sales', label: 'Ventas', icon: TrendingUp, description: 'Facturas a clientes' },
  { key: 'customers', label: 'Clientes', icon: Users, description: 'Cartera y saldos' },
  { key: 'suppliers', label: 'Proveedores', icon: Building2, description: 'Cuentas por pagar' },
  { key: 'collections', label: 'Entrega&Cobranza', icon: Truck, description: 'Entregas y pagos de clientes' },
  { key: 'reports', label: 'Reportes', icon: BarChart2, description: 'Análisis y exportación' },
  { key: 'settings', label: 'Configuración', icon: Settings, description: 'Empresa, usuarios y roles' },
];

type SidebarProps = {
  current: ViewKey;
  onNavigate: (view: ViewKey) => void;
};

export default function Sidebar({ current, onNavigate }: SidebarProps) {
  const { currentUser, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleNavigate = (view: ViewKey) => {
    onNavigate(view);
    setMobileOpen(false);
  };

  return (
    <>
      <button
        className="lg:hidden fixed top-4 left-4 z-40 flex h-10 w-10 items-center justify-center rounded-lg bg-white border border-ink-200 shadow-card text-ink-700"
        onClick={() => setMobileOpen(true)}
        aria-label="Abrir menú"
      >
        <Menu size={20} />
      </button>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-ink-950/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
      )}

      <aside
        className={`fixed lg:sticky top-0 left-0 z-40 h-screen w-64 shrink-0 bg-ink-950 text-ink-100 flex flex-col transition-transform duration-300 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex items-center justify-between px-5 h-16 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-white shadow-lg shadow-brand-500/30">
              <Boxes size={20} />
            </div>
            <div>
              <p className="text-sm font-bold tracking-tight text-white">NexoComercio</p>
              <p className="text-[10px] uppercase tracking-wider text-ink-400">Gestión integral</p>
            </div>
          </div>
          <button
            className="lg:hidden text-ink-400 hover:text-white"
            onClick={() => setMobileOpen(false)}
            aria-label="Cerrar menú"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = current === item.key;
            return (
              <button
                key={item.key}
                onClick={() => handleNavigate(item.key)}
                className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition group ${
                  active
                    ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20'
                    : 'text-ink-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon size={18} className={active ? 'text-white' : 'text-ink-400 group-hover:text-white'} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{item.label}</p>
                  <p className={`text-[11px] truncate ${active ? 'text-white/70' : 'text-ink-500'}`}>{item.description}</p>
                </div>
              </button>
            );
          })}
        </nav>

        <div className="px-4 py-4 border-t border-white/10 space-y-2">
          {currentUser && (
            <div className="flex items-center gap-2 px-1 py-1">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white text-xs font-bold">
                {currentUser.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white truncate">{currentUser.name}</p>
                <p className="text-[10px] text-ink-400 truncate">{currentUser.roles.map(r => r).join(', ')}</p>
              </div>
              <button
                onClick={logout}
                className="rounded-lg p-1.5 text-ink-400 hover:bg-white/10 hover:text-white transition"
                title="Cerrar sesión"
                aria-label="Cerrar sesión"
              >
                <LogOut size={15} />
              </button>
            </div>
          )}
          <p className="text-[11px] text-ink-500 px-1">© 2026 NexoComercio</p>
        </div>
      </aside>
    </>
  );
}
