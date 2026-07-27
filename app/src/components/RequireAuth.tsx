import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthProvider.js';

/**
 * Holds a route until the session is known.
 *
 * On a page refresh the auth provider restores the session asynchronously, so
 * for a moment there is no token. Without this gate the route rendered anyway
 * and its data hooks fired against nothing — which is what made refreshing
 * inside a project show a blank screen.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, signIn } = useAuth();

  if (status === 'loading') {
    return <p className="notice">Restoring your session…</p>;
  }

  if (status === 'signed-out') {
    return (
      <div className="gate">
        <h1>Sign in to continue</h1>
        <p>This page needs your account. Signing in brings you right back.</p>
        <button type="button" className="btn--primary" onClick={() => void signIn()}>
          Sign in
        </button>
        <p style={{ marginTop: 16, marginBottom: 0 }}>
          <Link to="/">Back to the start</Link>
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
