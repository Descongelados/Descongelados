import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Role, hasPermission, Permission } from './permissions';
import { supabase } from './supabase';

// ─── Types ───────────────────────────────────────────────────────────────────

export type AppUser = {
  id: string;
  name: string;
  username: string;
  password: string;
  roles: Role[];
  active: boolean;
  created_at: string;
};

export type CompanyInfo = {
  name: string;
  rfc: string;
  phone: string;
  address: string;
  logo: string | null;
};

// ─── Company (still localStorage — single-tenant, device-level config) ────────

const COMPANY_KEY = 'app_company';
const SESSION_KEY = 'app_session_user_id';

const DEFAULT_COMPANY: CompanyInfo = {
  name: 'Mi Empresa',
  rfc: '',
  phone: '',
  address: '',
  logo: null,
};

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
  authLoading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  can: (permission: Permission) => boolean;
  isAdmin: boolean;
};

const AuthContext = createContext<AuthCtx>({
  currentUser: null,
  authLoading: true,
  login: async () => false,
  logout: () => {},
  can: () => false,
  isAdmin: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Restore session on mount
  useEffect(() => {
    const restore = async () => {
      try {
        const savedId = localStorage.getItem(SESSION_KEY);
        if (savedId) {
          const { data } = await supabase
            .from('app_users')
            .select('*')
            .eq('id', savedId)
            .eq('active', true)
            .maybeSingle();
          if (data) {
            setCurrentUser({ ...data, roles: data.roles as Role[] });
          } else {
            localStorage.removeItem(SESSION_KEY);
          }
        }
      } catch {
        // network issue — leave user logged out
      } finally {
        setAuthLoading(false);
      }
    };
    restore();
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    const { data: rows } = await supabase
      .from('app_users')
      .select('*')
      .eq('active', true);

    const normalUser = username.trim().toLowerCase();
    const trimmedPass = password.trim();
    const user = (rows ?? []).find(
      (u) => u.username.toLowerCase() === normalUser && u.password === trimmedPass,
    );

    if (user) {
      const appUser: AppUser = { ...user, roles: user.roles as Role[] };
      setCurrentUser(appUser);
      localStorage.setItem(SESSION_KEY, appUser.id);
      return true;
    }
    return false;
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem(SESSION_KEY);
  };

  const can = (permission: Permission) =>
    currentUser ? hasPermission(currentUser.roles, permission) : false;

  const isAdmin = currentUser?.roles.includes('admin') ?? false;

  return (
    <AuthContext.Provider value={{ currentUser, authLoading, login, logout, can, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
