import { useState } from 'react';
import { Link } from 'react-router';
import { useCreateProject, useDeleteProject, useProjects } from '../api/queries.js';

export function Projects() {
  const { data, isLoading, error } = useProjects();
  const create = useCreateProject();
  const remove = useDeleteProject();
  const [name, setName] = useState('');

  if (isLoading) return <p className="notice">Loading your projects…</p>;

  if (error) {
    return (
      <p className="notice notice--alert" role="alert">
        Could not load your projects. {(error as Error).message}
      </p>
    );
  }

  const projects = data?.projects ?? [];

  return (
    <div className="page">
      <div className="pagehead">
        <div>
          <h1>Projects</h1>
        </div>
        <span className="muted">
          {projects.length} {projects.length === 1 ? 'project' : 'projects'}
        </span>
      </div>

      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = name.trim();
          if (trimmed === '') return;
          create.mutate(trimmed);
          setName('');
        }}
      >
        <h3>Start a project</h3>
        <div className="fields">
          <div className="field field--wide">
            <label htmlFor="project-name">Project name</label>
            <input
              id="project-name"
              value={name}
              placeholder="Living room"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <button type="submit" className="btn--primary" disabled={create.isPending}>
            {create.isPending ? 'Creating' : 'Create project'}
          </button>
        </div>
      </form>

      {create.error && (
        <p className="notice notice--alert" role="alert">
          Could not create that project. {(create.error as Error).message}
        </p>
      )}

      {projects.length === 0 ? (
        <div className="empty">
          <strong>No projects yet</strong>
          Name a room above to start measuring its walls.
        </div>
      ) : (
        <ul className="list">
          {projects.map((p) => (
            <li className="item" key={p.id}>
              <span className="item__name">
                <Link to={`/projects/${p.id}`}>{p.name}</Link>
              </span>
              <button
                type="button"
                className="btn--danger"
                onClick={() => remove.mutate(p.id)}
                aria-label={`Delete ${p.name}`}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
