import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthProvider.js';
import { getConfig } from '../config.js';

interface Me {
  sub: string;
  username: string;
}

export function Home() {
  const { status, user, accessToken, signIn } = useAuth();
  const [me, setMe] = useState<Me | null>(null);
  const [meError, setMeError] = useState<string | null>(null);

  useEffect(() => {
    if (accessToken === null) return;
    const controller = new AbortController();
    fetch(`${getConfig().apiUrl}/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`API returned ${res.status}`);
        setMe((await res.json()) as Me);
      })
      .catch((err: Error) => {
        if (err.name !== 'AbortError') setMeError(err.message);
      });
    return () => controller.abort();
  }, [accessToken]);

  if (status === 'loading') return <p className="notice">Loading…</p>;

  if (status === 'signed-out') {
    return (
      <div className="gate">
        <h1>Plan the wall before you drill it.</h1>
        <p>
          Enter a wall's real dimensions, mark what is already on it, and lay out
          your frames to scale.
        </p>
        <button type="button" className="btn--primary" onClick={() => void signIn()}>
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="pagehead">
        <div>
          <span className="muted">Signed in as {user?.profile.email}</span>
          <h1>Poster Walls</h1>
        </div>
        <span className="muted">
          {me !== null ? `verified · ${me.username}` : 'verifying…'}
        </span>
      </div>

      {meError !== null && (
        <p className="notice notice--alert" role="alert">
          The API rejected this session. {meError}
        </p>
      )}

      <p>
        <Link to="/projects">Open your projects →</Link>
      </p>
    </div>
  );
}
