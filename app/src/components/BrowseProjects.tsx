import { useState } from 'react';
import { useBrowsePublic } from '../api/queries.js';
import { ProjectCard } from './ProjectCard.js';

const PAGE = 12;

export function BrowseProjects() {
  // Draft state is what the inputs bind to; `query` is what actually fetches.
  // Separating them keeps every keystroke from firing a request.
  const [draft, setDraft] = useState({ q: '', widthIn: '', heightIn: '' });
  const [query, setQuery] = useState({ q: '', widthIn: '', heightIn: '' });
  const [offset, setOffset] = useState(0);

  const { data, isLoading, error } = useBrowsePublic({
    ...query,
    offset,
    limit: PAGE,
  });

  const projects = data?.projects ?? [];
  const total = data?.total ?? 0;
  const page = Math.floor(offset / PAGE) + 1;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  function search(e: React.FormEvent) {
    e.preventDefault();
    setOffset(0);
    setQuery(draft);
  }

  return (
    <section>
      <div className="pagehead">
        <h2>Browse walls</h2>
        {total > 0 && (
          <span className="muted">
            {total} public {total === 1 ? 'wall' : 'walls'}
          </span>
        )}
      </div>

      <form className="card" onSubmit={search}>
        <div className="fields">
          <div className="field field--wide">
            <label htmlFor="browse-q">Search</label>
            <input
              id="browse-q"
              value={draft.q}
              placeholder="Project, wall, or poster name"
              onChange={(e) => setDraft({ ...draft, q: e.target.value })}
            />
          </div>
          <div className="field field--num">
            <label htmlFor="browse-w">Wall width (in)</label>
            <input
              id="browse-w"
              inputMode="numeric"
              value={draft.widthIn}
              placeholder="144"
              onChange={(e) => setDraft({ ...draft, widthIn: e.target.value })}
            />
          </div>
          <div className="field field--num">
            <label htmlFor="browse-h">Wall height (in)</label>
            <input
              id="browse-h"
              inputMode="numeric"
              value={draft.heightIn}
              placeholder="96"
              onChange={(e) => setDraft({ ...draft, heightIn: e.target.value })}
            />
          </div>
          <button type="submit" className="btn--primary">Search</button>
          {(query.q !== '' || query.widthIn !== '' || query.heightIn !== '') && (
            <button
              type="button"
              onClick={() => {
                setDraft({ q: '', widthIn: '', heightIn: '' });
                setQuery({ q: '', widthIn: '', heightIn: '' });
                setOffset(0);
              }}
            >
              Clear
            </button>
          )}
        </div>
        <p className="muted" style={{ margin: '8px 0 0' }}>
          Dimension filters match within a foot, closest first.
        </p>
      </form>

      {isLoading && <p className="notice">Loading public walls…</p>}

      {error && (
        <p className="notice notice--alert" role="alert">
          Could not load public walls. {(error as Error).message}
        </p>
      )}

      {!isLoading && !error && projects.length === 0 && (
        <div className="empty">
          Nothing matches yet. Try a wider search, or make one of your own
          projects public so others can find it.
        </div>
      )}

      <div className="cardgrid">
        {projects.map((p) => (
          <ProjectCard key={p.id} preview={p} />
        ))}
      </div>

      {pages > 1 && (
        <div className="pager">
          <button
            type="button"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE))}
          >
            Previous
          </button>
          <span className="muted">
            Page {page} of {pages}
          </span>
          <button
            type="button"
            disabled={offset + PAGE >= total}
            onClick={() => setOffset(offset + PAGE)}
          >
            Next
          </button>
        </div>
      )}

      {data?.truncated === true && (
        <p className="muted">
          Showing the most recent public walls. Narrow your search to see more.
        </p>
      )}
    </section>
  );
}
