import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import type { User } from '../types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, workspace?: string) => Promise<void>;
  register: (email: string, password: string, name: string, orgName?: string, workspace?: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    api.me()
      .then(setUser)
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string, workspace?: string) => {
    const { token, user } = await api.login(email, password, workspace);
    localStorage.setItem('token', token);
    if (workspace) localStorage.setItem('aios_tenant_slug', workspace);
    setUser(user);
  };

  const register = async (
    email: string,
    password: string,
    name: string,
    orgName?: string,
    workspace?: string
  ) => {
    const { token, user } = await api.register(email, password, name, orgName, workspace);
    localStorage.setItem('token', token);
    if (workspace) localStorage.setItem('aios_tenant_slug', workspace);
    setUser(user);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  const refreshUser = async () => {
    const u = await api.me();
    setUser(u);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
