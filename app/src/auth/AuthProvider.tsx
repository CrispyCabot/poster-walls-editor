import type { User } from 'oidc-client-ts';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { userManager } from './oidc.js';

type Status = 'loading' | 'signed-in' | 'signed-out';

interface AuthValue {
  user: User | null;
  accessToken: string | null;
  status: Status;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    userManager
      .getUser()
      .then((found) => {
        setUser(found);
        setStatus(found ? 'signed-in' : 'signed-out');
      })
      .catch(() => setStatus('signed-out'));
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      accessToken: user?.access_token ?? null,
      status,
      signIn: () => userManager.signinRedirect(),
      signOut: () => userManager.signoutRedirect(),
    }),
    [user, status],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
