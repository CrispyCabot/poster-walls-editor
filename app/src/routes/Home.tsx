import { Link } from 'react-router';
import { useProjectPreviews } from '../api/queries.js';
import { useAuth } from '../auth/AuthProvider.js';
import { BrowseProjects } from '../components/BrowseProjects.js';
import { ProjectCard } from '../components/ProjectCard.js';

/**
 * How many of your own projects the home page shows.
 *
 * The grid is responsive, so this is a cap rather than an exact fit: four
 * fills a wide monitor's row, and anything beyond it lives on the projects
 * page rather than turning the home page into a second list.
 */
const HOME_LIMIT = 4;

function YourProjects() {
  const { data, isLoading, error } = useProjectPreviews();

  if (isLoading) return <p className="notice">Loading your projects…</p>;

  if (error) {
    return (
      <p className="notice notice--alert" role="alert">
        Could not load your projects. {(error as Error).message}
      </p>
    );
  }

  const projects = data?.projects ?? [];

  if (projects.length === 0) {
    return (
      <section>
        <div className="pagehead">
          <h2>Your walls</h2>
        </div>
        <div className="empty">
          Nothing here yet. <Link to="/projects">Start a project</Link> and
          measure your first wall.
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="pagehead">
        <h2>Your walls</h2>
        <Link to="/projects">
          {projects.length > HOME_LIMIT
            ? `Open all ${projects.length} projects →`
            : 'Open your projects →'}
        </Link>
      </div>

      <div className="cardgrid">
        {projects.slice(0, HOME_LIMIT).map((p) => (
          <ProjectCard key={p.id} preview={p} />
        ))}
      </div>
    </section>
  );
}

export function Home() {
  const { status, signIn } = useAuth();

  if (status === 'loading') return <p className="notice">Loading…</p>;

  if (status === 'signed-out') {
    return (
      <div className="page">
        <div className="gate">
          <h1>Plan the wall before you drill it.</h1>
          <p>
            Enter a wall's real dimensions, mark what is already on it, and lay
            out your frames to scale.
          </p>
          <button type="button" className="btn--primary" onClick={() => void signIn()}>
            Sign in
          </button>
        </div>

        {/* Browsing needs no account, so the gate does not hide it. */}
        <BrowseProjects />
      </div>
    );
  }

  return (
    <div className="page">
      <YourProjects />
      <hr className="rule" />
      <BrowseProjects />
    </div>
  );
}
