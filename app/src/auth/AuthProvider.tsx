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
    let cancelled = false;

    // `oidc-client-ts`'s automaticSilentRenew keeps the *stored* token fresh,
    // but only these events tell React the in-memory copy is stale. An
    // expired stored user must not read as signed-in, and a stale token must
    // not survive a failed renewal.
    function applyUser(found: User | null) {
      if (cancelled) return;
      const signedIn = found !== null && !found.expired;
      setUser(signedIn ? found : null);
      setStatus(signedIn ? 'signed-in' : 'signed-out');
    }

    function onUserLoaded(loadedUser: User) {
      applyUser(loadedUser);
    }

    function onUserUnloaded() {
      applyUser(null);
    }

    function onSilentRenewError(err: Error) {
      // A failed renewal leaves a soon-to-expire (or already-expired) token
      // in memory. Fail loudly and drop the session rather than let API
      // calls start returning 401s with no visible cause.
      console.error('silent token renewal failed', err);
      applyUser(null);
    }

    userManager.events.addUserLoaded(onUserLoaded);
    userManager.events.addUserUnloaded(onUserUnloaded);
    userManager.events.addSilentRenewError(onSilentRenewError);

    userManager
      .getUser()
      .then(applyUser)
      .catch(() => {
        if (!cancelled) setStatus('signed-out');
      });

    return () => {
      cancelled = true;
      userManager.events.removeUserLoaded(onUserLoaded);
      userManager.events.removeUserUnloaded(onUserUnloaded);
      userManager.events.removeSilentRenewError(onSilentRenewError);
    };
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
