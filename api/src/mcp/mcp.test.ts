import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Placement, Poster, Wall } from '@pwe/shared';
import { createApp } from '../app.js';
import type { AuthedUser } from '../auth.js';
import type { ProjectView } from '../db/previews.js';
import type { BrowseDb } from '../routes/browse.js';
import type { PosterDb } from '../routes/posters.js';
import type { ProjectDb } from '../routes/projects.js';
import type { WallDb } from '../routes/walls.js';

const PID = 'proj-1';
const TOKEN = 'user-token';
const user: AuthedUser = { sub: 'user-1', username: 'chris' };
const now = '2026-01-01T00:00:00.000Z';

async function verify(token: string): Promise<AuthedUser> {
  if (token === TOKEN) return user;
  throw new Error('unknown token');
}

function wall(overrides: Partial<Wall> = {}): Wall {
  return { id: 'wall-1', name: 'Hallway', widthIn: 120, heightIn: 96, obstructions: [], backgroundColor: '#FFFFFF', ...overrides };
}

function poster(overrides: Partial<Poster> = {}): Poster {
  return { id: 'post-1', name: 'Mountains', widthIn: 18, heightIn: 24, frameWidthIn: 1, frameColor: '#000000', shape: 'rect', ...overrides };
}

function buildApp(seed: { walls?: Wall[]; posters?: Poster[]; placements?: Record<string, Placement[]> } = {}) {
  const walls = seed.walls ?? [wall()];
  const posters = seed.posters ?? [poster()];
  const placements: Record<string, Placement[]> = seed.placements ?? {};
  const project = { id: PID, ownerId: user.sub, name: 'Living room', visibility: 'private' as const, version: 2, createdAt: now, updatedAt: now };
  const owns = (pid: string, sub: string) => pid === PID && sub === user.sub;

  const db = {
    listProjects: async () => [{ id: PID, name: project.name, visibility: project.visibility, updatedAt: now }],
    loadProject: async (pid: string, sub: string) => (owns(pid, sub) ? { project, walls } : null),
    createProject: async (input: { name: string; visibility: 'private' | 'public' }) => ({ ...project, id: 'proj-new', ...input, version: 0 }),
    renameProject: vi.fn(async (_pid: string, _sub: string, name: string, visibility: 'private' | 'public', version: number) => ({
      ...project,
      name,
      visibility,
      version: version + 1,
    })),
    deleteProject: async () => true,
  } as unknown as ProjectDb;

  const wallDb = {
    addWall: async (pid: string, sub: string, input: Omit<Wall, 'id'>) => (owns(pid, sub) ? { id: 'wall-new', ...input } : null),
    updateWall: vi.fn(async (pid: string, sub: string, wid: string, input: Omit<Wall, 'id'>) => (owns(pid, sub) ? { id: wid, ...input } : null)),
    removeWall: async (pid: string, sub: string) => owns(pid, sub),
  } as unknown as WallDb;

  const posterDb = {
    listPosters: async (pid: string, sub: string) => (owns(pid, sub) ? posters : null),
    addPoster: async (pid: string, sub: string, input: Omit<Poster, 'id'>) => (owns(pid, sub) ? { id: 'post-new', ...input } : null),
    updatePoster: vi.fn(async (_pid: string, _sub: string, id: string, input: Omit<Poster, 'id'>) => ({ id, ...input })),
    removePoster: vi.fn(async () => true),
    getPlacements: async (pid: string, sub: string, wid: string) => (owns(pid, sub) ? (placements[wid] ?? []) : null),
    putPlacements: vi.fn(async (_pid: string, _sub: string, wid: string, next: Placement[]) => {
      placements[wid] = next;
      return next;
    }),
  } as unknown as PosterDb;

  const browseDb = {
    viewProject: async (pid: string, viewer: string | null): Promise<ProjectView | null> =>
      pid === PID && viewer === user.sub
        ? { project: { id: PID, name: project.name, visibility: project.visibility, updatedAt: now }, walls, posters, placementsByWall: placements, isOwner: true }
        : null,
    browsePublic: async () => ({ projects: [], total: 0, truncated: false }),
    previewsFor: async () => [],
    listProjects: db.listProjects,
  } as unknown as BrowseDb;

  const app = createApp({ verify, db, wallDb, posterDb, browseDb });
  return { app, db, wallDb, posterDb, placements };
}

type App = ReturnType<typeof createApp>;

let rpcId = 0;
function rpc(app: App, method: string, params: unknown, token = TOKEN) {
  return app.request('/mcp', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
  });
}

async function callTool(app: App, name: string, args: Record<string, unknown> = {}) {
  const res = await rpc(app, 'tools/call', { name, arguments: args });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { result: { isError?: boolean; content: { text: string }[] } };
  const text = body.result.content[0]?.text ?? '';
  return { isError: body.result.isError === true, text, json: () => JSON.parse(text) as Record<string, any> };
}

beforeEach(() => {
  vi.stubEnv('API_ORIGIN', 'https://api.example.test');
  vi.stubEnv('COGNITO_DOMAIN', 'https://login.example.test');
  vi.stubEnv('MCP_CLIENT_ID', 'mcp-client');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('/mcp auth', () => {
  it('answers an unauthenticated call with a 401 that points at the protected-resource metadata', async () => {
    const res = await buildApp().app.request('/mcp', { method: 'POST', body: '{}' });
    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toContain('resource_metadata="https://api.example.test/.well-known/oauth-protected-resource"');
  });

  it('rejects an invalid token', async () => {
    const res = await rpc(buildApp().app, 'tools/list', {}, 'nope');
    expect(res.status).toBe(401);
  });

  it('answers GET with 405, since the server is stateless', async () => {
    const res = await buildApp().app.request('/mcp', { headers: { Authorization: `Bearer ${TOKEN}` } });
    expect(res.status).toBe(405);
  });
});

describe('/mcp protocol', () => {
  it('initializes', async () => {
    const res = await rpc(buildApp().app, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
    const body = (await res.json()) as { result: { serverInfo: { name: string } } };
    expect(body.result.serverInfo.name).toBe('poster-walls-editor');
  });

  it('lists the tools', async () => {
    const res = await rpc(buildApp().app, 'tools/list', {});
    const body = (await res.json()) as { result: { tools: { name: string }[] } };
    expect(body.result.tools.map((t) => t.name).sort()).toEqual(
      [
        'add_poster',
        'add_wall',
        'browse_public_projects',
        'create_project',
        'delete_poster',
        'delete_wall',
        'get_project',
        'list_projects',
        'place_poster',
        'remove_poster_from_wall',
        'update_poster',
        'update_project',
        'update_wall',
      ].sort(),
    );
  });
});

describe('tools', () => {
  it('get_project reports each placed poster’s framed edges', async () => {
    const { app } = buildApp({ placements: { 'wall-1': [{ posterId: 'post-1', centerXIn: 60, centerYIn: 57 }] } });
    const result = (await callTool(app, 'get_project', { projectId: PID })).json();
    expect(result.walls[0].placements[0]).toMatchObject({
      posterName: 'Mountains',
      outerWidthIn: 20,
      outerHeightIn: 26,
      leftEdgeIn: 50,
      rightEdgeIn: 70,
      bottomEdgeIn: 44,
      topEdgeIn: 70,
    });
    expect(result.posters[0]).toMatchObject({ id: 'post-1', hasImage: false });
  });

  it('update_project keeps unchanged fields and sends the current version', async () => {
    const { app, db } = buildApp();
    const result = (await callTool(app, 'update_project', { projectId: PID, visibility: 'public' })).json();
    expect(db.renameProject).toHaveBeenCalledWith(PID, user.sub, 'Living room', 'public', 2);
    expect(result.updated.version).toBe(3);
  });

  it('update_wall merges changes over the existing wall', async () => {
    const existing = wall({ obstructions: [{ id: 'door-1', kind: 'door', label: 'Door', xIn: 0, yIn: 0, widthIn: 36, heightIn: 80 }] });
    const { app, wallDb } = buildApp({ walls: [existing] });
    await callTool(app, 'update_wall', { projectId: PID, wallId: 'wall-1', widthIn: 144 });
    const { id: _id, ...rest } = existing;
    expect(wallDb.updateWall).toHaveBeenCalledWith(PID, user.sub, 'wall-1', { ...rest, widthIn: 144 });
  });

  it('add_wall gives new obstructions ids', async () => {
    const { app } = buildApp();
    const result = (await callTool(app, 'add_wall', {
      projectId: PID,
      name: 'Stairs',
      widthIn: 100,
      heightIn: 90,
      obstructions: [{ kind: 'outlet', xIn: 10, yIn: 12, widthIn: 3, heightIn: 5 }],
    })).json();
    expect(result.created.obstructions[0].id).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(result.created.obstructions[0].label).toBe('');
  });

  it('update_poster keeps the image and other fields', async () => {
    const { app, posterDb } = buildApp({ posters: [poster({ imageKey: 'abc.png' })] });
    await callTool(app, 'update_poster', { projectId: PID, posterId: 'post-1', frameColor: '#FFFFFF' });
    expect(posterDb.updatePoster).toHaveBeenCalledWith(PID, user.sub, 'post-1', {
      name: 'Mountains',
      widthIn: 18,
      heightIn: 24,
      frameWidthIn: 1,
      frameColor: '#FFFFFF',
      shape: 'rect',
      imageKey: 'abc.png',
    });
  });

  it('place_poster defaults to the middle at gallery height and replaces an earlier placement', async () => {
    const { app, placements } = buildApp({ placements: { 'wall-1': [{ posterId: 'post-1', centerXIn: 10, centerYIn: 10 }] } });
    const result = (await callTool(app, 'place_poster', { projectId: PID, wallId: 'wall-1', posterId: 'post-1' })).json();
    expect(placements['wall-1']).toEqual([{ posterId: 'post-1', centerXIn: 60, centerYIn: 48 }]);
    expect(result.placed.fitsOnWall).toBe(true);
  });

  it('place_poster flags a poster that runs off the wall', async () => {
    const { app } = buildApp();
    const result = (await callTool(app, 'place_poster', { projectId: PID, wallId: 'wall-1', posterId: 'post-1', centerXIn: 5, centerYIn: 50 })).json();
    expect(result.placed.fitsOnWall).toBe(false);
  });

  it('delete_poster takes it off every wall first', async () => {
    const { app, posterDb, placements } = buildApp({
      walls: [wall(), wall({ id: 'wall-2', name: 'Bedroom' })],
      placements: {
        'wall-1': [{ posterId: 'post-1', centerXIn: 60, centerYIn: 57 }, { posterId: 'post-2', centerXIn: 20, centerYIn: 57 }],
        'wall-2': [{ posterId: 'post-2', centerXIn: 20, centerYIn: 57 }],
      },
    });
    const result = (await callTool(app, 'delete_poster', { projectId: PID, posterId: 'post-1' })).json();
    expect(placements['wall-1']).toEqual([{ posterId: 'post-2', centerXIn: 20, centerYIn: 57 }]);
    expect(result.removedFromWalls).toEqual(['Hallway']);
    expect(posterDb.removePoster).toHaveBeenCalledWith(PID, user.sub, 'post-1');
  });

  it('turns a missing project into a helpful tool error', async () => {
    const result = await callTool(buildApp().app, 'get_project', { projectId: 'someone-elses' });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('Not found');
  });
});
