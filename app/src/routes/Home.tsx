import { useAuth } from '../auth/AuthProvider.js';

export function Home() {
  const { status, user, signIn, signOut } = useAuth();

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
      <button onClick={() => void signOut()}>Sign out</button>
    </main>
  );
}
