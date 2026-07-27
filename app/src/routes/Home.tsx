import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthProvider.js';
import { getConfig } from '../config.js';

interface Me {
  sub: string;
  username: string;
}

export function Home() {
  const { status, user, accessToken, signIn, signOut } = useAuth();
  const [me, setMe] = useState<Me | null>(null);
  const [meError, setMeError] = useState<string | null>(null);

  useEffect(() => {
    if (accessToken === null) return;
    fetch(`${getConfig().apiUrl}/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`API returned ${res.status}`);
        setMe((await res.json()) as Me);
      })
      .catch((err: Error) => setMeError(err.message));
  }, [accessToken]);

  if (status === 'loading') return <p>Loading…</p>;

  if (status === 'signed-out') {
    return (
      <main>
        <h1>Poster Walls Editor</h1>
        <button onClick={() => void signIn()}>Sign in</button>
      </main>
    );
  }

  return (
    <main>
      <h1>Poster Walls Editor</h1>
      <p>Signed in as {user?.profile.email}</p>
      {meError !== null && <p role="alert">API check failed: {meError}</p>}
      {me !== null && <p>API confirmed identity: {me.username}</p>}
      <p><Link to="/projects">Your projects</Link></p>
      <button onClick={() => void signOut()}>Sign out</button>
    </main>
  );
}
