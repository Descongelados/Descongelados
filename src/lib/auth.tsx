import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Role, hasPermission, Permission } from './permissions';

// ─── Types ───────────────────────────────────────────────────────────────────

export type AppUser = {
  id: string;
  name: string;
  username: string;
  password: string; // stored plain in localStorage (no real auth server)
  roles: Role[];
  active: boolean;
  created_at: string;
};

export type CompanyInfo = {
  name: string;
  rfc: string;
  phone: string;
  address: string;
  logo: string | null; // base64 data URL
};

// ─── Storage keys ─────────────────────────────────────────────────────────────

const USERS_KEY = 'app_users';
const CURRENT_USER_KEY = 'app_current_user';
const COMPANY_KEY = 'app_company';

// ─── Default admin ────────────────────────────────────────────────────────────

const DEFAULT_ADMIN: AppUser = {
  id: '1',
  name: 'Administrador',
  username: 'admin',
  password: 'admin123',
  roles: ['admin'],
  active: true,
  created_at: new Date().toISOString(),
};

const DEFAULT_COMPANY: CompanyInfo = {
  name: 'Mi Empresa',
  rfc: '',
  phone: '',
  address: '',
  logo: null,
};

// ─── Storage helpers ──────────────────────────────────────────────────────────

export function loadUsers(): AppUser[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) return [DEFAULT_ADMIN];
    const users: AppUser[] = JSON.parse(raw);
    // Ensure the default admin always exists so first-time login always works
    const hasAdmin = users.some((u) => u.id === DEFAULT_ADMIN.id);
    if (!hasAdmin) {
      const merged = [DEFAULT_ADMIN, ...users];
      localStorage.setItem(USERS_KEY, JSON.stringify(merged));
      return merged;
    }
    return users;
  } catch {
    return [DEFAULT_ADMIN];
  }
}

export function saveUsers(users: AppUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export function loadCompany(): CompanyInfo {
  try {
    const raw = localStorage.getItem(COMPANY_KEY);
    return raw ? { ...DEFAULT_COMPANY, ...JSON.parse(raw) } : DEFAULT_COMPANY;
  } catch {
    return DEFAULT_COMPANY;
  }
}

export function saveCompany(info: CompanyInfo) {
  localStorage.setItem(COMPANY_KEY, JSON.stringify(info));
}

// ─── Context ──────────────────────────────────────────────────────────────────

type AuthCtx = {
  currentUser: AppUser | null;
  login: (username: string, password: string) => boolean;
  logout: () => void;
  can: (permission: Permission) => boolean;
  isAdmin: boolean;
};

const AuthContext = createContext<AuthCtx>({
  currentUser: null,
  login: () => false,
  logout: () => {},
  can: () => false,
  isAdmin: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(() => {
    try {
      const raw = localStorage.getItem(CURRENT_USER_KEY);
      if (!raw) return null;
      const saved = JSON.parse(raw) as AppUser;
      // Re-validate against users list (in case user was deleted/deactivated)
      const users = loadUsers();
      const live = users.find((u) => u.id === saved.id && u.active);
      return live ?? null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(currentUser));
    } else {
      localStorage.removeItem(CURRENT_USER_KEY);
    }
  }, [currentUser]);

  const login = (username: string, password: string): boolean => {
    const users = loadUsers();
    const user = users.find(
      (u) => u.username === username && u.password === password && u.active,
    );
    if (user) {
      setCurrentUser(user);
      return true;
    }
    return false;
  };

  const logout = () => setCurrentUser(null);

  const can = (permission: Permission) =>
    currentUser ? hasPermission(currentUser.roles, permission) : false;

  const isAdmin = currentUser?.roles.includes('admin') ?? false;

  return (
    <AuthContext.Provider value={{ currentUser, login, logout, can, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
