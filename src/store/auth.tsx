import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { invoke, SESSION_EXPIRED_EVENT } from '@/lib/ipc';
import type { AuthUser } from '@/shared/ipc';

/** يحاول استدعاء auth:me حتى MAX_RETRIES مرة لو السيرفر لم يكن جاهزاً بعد */
async function fetchMeWithRetry(retries = 6, delayMs = 1200): Promise<AuthUser | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const base = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${base}/api/invoke/${encodeURIComponent('auth:me')}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      // السيرفر لم يبدأ بعد — أعد المحاولة
      if (res.status === 503) {
        if (i < retries - 1) await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      const json = await res.json() as { ok: boolean; data?: AuthUser; error?: string };
      if (json.ok && json.data) return json.data;
      return null;
    } catch {
      // خطأ شبكة (ECONNREFUSED) — السيرفر لم يبدأ بعد
      if (i < retries - 1) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return null;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  can: (permission: string) => boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;
    fetchMeWithRetry()
      .then((u) => { if (!cancelled) setUser(u ?? null); })
      .catch(() => { if (!cancelled) setUser(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const handler = () => {
      setUser(null);
      queryClient.clear();
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, handler);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handler);
  }, [queryClient]);

  const login = useCallback(async (username: string, password: string) => {
    const res = await invoke('auth:login', { username, password });
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    try { await invoke('auth:logout', {}); } catch { /* الجلسة قد تكون منتهية */ }
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  const can = useCallback(
    (permission: string) => user?.permissions.includes(permission as AuthUser['permissions'][number]) ?? false,
    [user]
  );

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, can, login, logout }),
    [user, loading, can, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
