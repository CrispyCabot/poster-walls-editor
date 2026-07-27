import { useState } from 'react';
import { Link } from 'react-router';
import { useCreateProject, useDeleteProject, useProjects } from '../api/queries.js';

export function Projects() {
  const { data, isLoading, error } = useProjects();
  const create = useCreateProject();
  const remove = useDeleteProject();
  const [name, setName] = useState('');

  if (isLoading) return <p>Loading your projects…</p>;

  if (error) {
    return <p role="alert">Could not load your projects: {(error as Error).message}</p>;
  }

  const projects = data?.projects ?? [];

  return (
    <main>
      <h1>Projects</h1>
      <p><Link to="/">Back</Link></p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = name.trim();
          if (trimmed === '') return;
          create.mutate(trimmed);
          setName('');
        }}
      >
        <label htmlFor="project-name">Project name</label>
        <input id="project-name" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Creating…' : 'Create'}
        </button>
      </form>

      {create.error && (
        <p role="alert">Could not create: {(create.error as Error).message}</p>
      )}

      {projects.length === 0 ? (
        <p>No projects yet. Create one above to get started.</p>
      ) : (
        <ul>
          {projects.map((p) => (
            <li key={p.id}>
              <Link to={`/projects/${p.id}`}>{p.name}</Link>{' '}
              <button
                type="button"
                onClick={() => remove.mutate(p.id)}
                aria-label={`Delete ${p.name}`}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
