// v3 — company cargada una sola vez en AuthContext
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Role, hasPermission, Permission } from './permissions';
import { supabase } from './supabase';

// ─── Types ───────────────────────────────────────────────────────────────────

type VerifyPasswordResult = {
  ok: boolean;
  id: string;
  name: string;
  username: string;
  roles: Role[];
  active: boolean;
  created_at: string;
};

export type AppUser = {
  id: string;
  name: string;
  username: string;
  // password nunca se descarga al cliente — se gestiona vía RPC verify_password / set_user_password
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

// ─── Company — stored in Supabase app_settings ────────────────────────────────

const SESSION_KEY = 'app_session_user_id';

const DEFAULT_COMPANY: CompanyInfo = {
  name: 'Mi Empresa',
  rfc: '',
  phone: '',
  address: '',
  logo: null,
};

export async function loadCompany(): Promise<CompanyInfo> {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'company')
    .maybeSingle();
  return data ? { ...DEFAULT_COMPANY, ...(data.value as Partial<CompanyInfo>) } : DEFAULT_COMPANY;
}

export async function saveCompany(info: CompanyInfo): Promise<void> {
  await supabase
    .from('app_settings')
    .upsert({ key: 'company', value: info as unknown as Record<string, unknown> });
}

// ─── Context ──────────────────────────────────────────────────────────────────

type AuthCtx = {
  currentUser: AppUser | null;
  authLoading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  can: (permission: Permission) => boolean;
  isAdmin: boolean;
  // company cargada una sola vez — compartida por todos los consumidores del contexto
  company: CompanyInfo;
  setCompany: (info: CompanyInfo) => void;
};

const AuthContext = createContext<AuthCtx>({
  currentUser: null,
  authLoading: true,
  login: async () => false,
  logout: () => {},
  can: () => false,
  isAdmin: false,
  company: { name: 'Mi Empresa', rfc: '', phone: '', address: '', logo: null },
  setCompany: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [company, setCompany] = useState<CompanyInfo>(DEFAULT_COMPANY);

  // Cargar company una sola vez al montar — todos los consumidores comparten este estado
  useEffect(() => { loadCompany().then(setCompany); }, []);

  // Restore session on mount
  useEffect(() => {
    const restore = async () => {
      try {
        const savedId = localStorage.getItem(SESSION_KEY);
        if (savedId) {
          const { data } = await supabase
            .from('app_users')
            .select('id, name, username, roles, active, created_at')
            .eq('id', savedId)
            .eq('active', true)
            .maybeSingle();
          if (data) {
            setCurrentUser({ ...data, roles: data.roles as Role[] });
          } else {
            // Usuario no encontrado o desactivado — limpiar sesión
            localStorage.removeItem(SESSION_KEY);
            localStorage.setItem('session_expired', '1');
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
    // RPC verify_password: compara bcrypt en BD — nunca descarga el hash al cliente
    const { data } = await supabase.rpc('verify_password', {
      p_username: username.trim().toLowerCase(),
      p_password: password.trim(),
    });

    const result = data as VerifyPasswordResult | null;
    if (result?.ok) {
      const appUser: AppUser = {
        id:         result.id,
        name:       result.name,
        username:   result.username,
        roles:      result.roles,
        active:     result.active,
        created_at: result.created_at,
      };
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
    <AuthContext.Provider value={{ currentUser, authLoading, login, logout, can, isAdmin, company, setCompany }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

// useCompany ahora consume del contexto — sin query extra
export function useCompany(): CompanyInfo {
  return useContext(AuthContext).company;
}
