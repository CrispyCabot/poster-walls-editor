import { Link } from 'react-router';
import { useAuth } from '../auth/AuthProvider.js';

export function Masthead() {
  const { status, signOut } = useAuth();

  return (
    <header className="masthead">
      <Link className="masthead__mark" to="/">
        Poster Walls
      </Link>
      {status === 'signed-in' && (
        <Link className="masthead__mark" to="/projects">
          Projects
        </Link>
      )}
      <span className="masthead__spacer" />
      {status === 'signed-in' && (
        <button type="button" className="btn--quiet" onClick={() => void signOut()}>
          Sign out
        </button>
      )}
    </header>
  );
}
