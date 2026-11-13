import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Obstruction, Placement, Poster, Project, Wall } from '@pwe/shared';
import { z } from 'zod';
import type { ProjectView } from '../db/previews.js';
import type { ProjectSummary } from '../db/projects.js';

export type ApiCaller = (path: string, init?: { method?: string; body?: unknown }) => Promise<Response>;

class ToolError extends Error {}

async function call<T>(api: ApiCaller, path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await api(path, init);
  if (res.status === 204) return undefined as T;
  const payload = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
  if (!res.ok) {
    if (res.status === 404) throw new ToolError('Not found. Check the project, wall and poster ids (list_projects and get_project show them).');
    if (payload.error?.code === 'validation_error') throw new ToolError('The poster walls editor rejected those values as invalid.');
    throw new ToolError(payload.error?.message ?? `Request failed with status ${res.status}`);
  }
  return payload as T;
}

function ok(value: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

function fail(err: unknown): CallToolResult {
  const message = err instanceof ToolError ? err.message : 'Something went wrong talking to the poster walls editor.';
  if (!(err instanceof ToolError)) console.error('mcp tool error', err);
  return { isError: true, content: [{ type: 'text', text: message }] };
}

function run(fn: () => Promise<unknown>): Promise<CallToolResult> {
  return fn().then(ok, fail);
}

export const DEFAULT_CENTER_HEIGHT_IN = 57;

export function hangingEdges(poster: Poster, placement: Placement) {
  const outerWidth = poster.widthIn + poster.frameWidthIn * 2;
  const outerHeight = poster.heightIn + poster.frameWidthIn * 2;
  return {
    outerWidthIn: outerWidth,
    outerHeightIn: outerHeight,
    leftEdgeIn: placement.centerXIn - outerWidth / 2,
    rightEdgeIn: placement.centerXIn + outerWidth / 2,
    bottomEdgeIn: placement.centerYIn - outerHeight / 2,
    topEdgeIn: placement.centerYIn + outerHeight / 2,
  };
}

function summarizeView(view: ProjectView) {
  const postersById = new Map(view.posters.map((p) => [p.id, p]));
  return {
    project: view.project,
    isOwner: view.isOwner,
    walls: view.walls.map((wall) => ({
      ...wall,
      placements: (view.placementsByWall[wall.id] ?? []).map((placement) => {
        const poster = postersById.get(placement.posterId);
        return {
          ...placement,
          ...(poster === undefined ? {} : { posterName: poster.name, ...hangingEdges(poster, placement) }),
        };
      }),
    })),
    posters: view.posters.map(({ imageKey, ...poster }) => ({ ...poster, hasImage: imageKey !== undefined })),
  };
}

const getView = (api: ApiCaller, pid: string) => call<ProjectView>(api, `/projects/${pid}/view`);
const loadProject = (api: ApiCaller, pid: string) => call<{ project: Project; walls: Wall[] }>(api, `/projects/${pid}`);
const listPosters = (api: ApiCaller, pid: string) => call<{ posters: Poster[] }>(api, `/projects/${pid}/posters`).then((r) => r.posters);
const getPlacements = (api: ApiCaller, pid: string, wid: string) =>
  call<{ placements: Placement[] }>(api, `/projects/${pid}/walls/${wid}/placements`).then((r) => r.placements);
const putPlacements = (api: ApiCaller, pid: string, wid: string, placements: Placement[]) =>
  call<{ placements: Placement[] }>(api, `/projects/${pid}/walls/${wid}/placements`, { method: 'PUT', body: { placements } }).then((r) => r.placements);

async function findWall(api: ApiCaller, pid: string, wid: string): Promise<Wall> {
  const wall = (await loadProject(api, pid)).walls.find((w) => w.id === wid);
  if (wall === undefined) throw new ToolError('Wall not found in that project. Call get_project to see its walls.');
  return wall;
}

async function findPoster(api: ApiCaller, pid: string, posterId: string): Promise<Poster> {
  const poster = (await listPosters(api, pid)).find((p) => p.id === posterId);
  if (poster === undefined) throw new ToolError('Poster not found in that project. Call get_project to see its posters.');
  return poster;
}

const projectIdArg = z.string().describe('Project id from list_projects.');
const wallIdArg = z.string().describe('Wall id from get_project.');
const posterIdArg = z.string().describe('Poster id from get_project.');
const inches = z.number().positive().finite();
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a #rrggbb hex color');

const ObstructionArg = z.object({
  id: z.string().optional().describe('Keep an existing obstruction id when editing; omit for a new one.'),
  kind: z.enum(['door', 'window', 'outlet', 'generic']),
  label: z.string().max(80).default(''),
  xIn: z.number().finite().describe('Distance from the wall’s left edge to the obstruction’s left edge, in inches.'),
  yIn: z.number().finite().describe('Distance from the floor to the obstruction’s bottom edge, in inches.'),
  widthIn: inches,
  heightIn: inches,
});

function toObstructions(input: z.infer<typeof ObstructionArg>[]): Obstruction[] {
  return input.map(({ id, ...rest }) => ({ id: id ?? crypto.randomUUID(), ...rest }));
}

const posterFields = {
  widthIn: inches.describe('Artwork width in inches, not counting the frame.'),
  heightIn: inches.describe('Artwork height in inches, not counting the frame.'),
  frameWidthIn: z.number().nonnegative().finite().describe('Frame border width in inches on each side. Defaults to 1.'),
  frameColor: hexColor.describe('Frame color. Defaults to #000000.'),
  shape: z.enum(['rect', 'circle', 'diamond']).describe('Defaults to rect. Width and height are the bounding box.'),
};

export function createMcpServer(api: ApiCaller): McpServer {
  const server = new McpServer(
    { name: 'poster-walls-editor', version: '1.0.0' },
    {
      instructions:
        'Tools for planning gallery walls. A project holds walls and a library of posters; posters are placed on walls. ' +
        'All measurements are inches. Wall space has its origin at the bottom-left corner of the wall, x to the right and ' +
        'y up from the floor. A placement is the center of the framed poster. Start with list_projects, then get_project.',
    },
  );

  server.registerTool(
    'list_projects',
    {
      title: 'List projects',
      description: 'Lists your poster wall projects, most recently updated first.',
      annotations: { readOnlyHint: true },
    },
    () =>
      run(async () => {
        const { projects } = await call<{ projects: ProjectSummary[] }>(api, '/projects');
        return { projects: [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) };
      }),
  );

  server.registerTool(
    'get_project',
    {
      title: 'Get a project',
      description:
        'Returns a project with its walls (size, color, obstructions), its poster library, and where each poster is placed, ' +
        'including each placed poster’s framed edges measured from the wall’s left edge and the floor.',
      inputSchema: { projectId: projectIdArg },
      annotations: { readOnlyHint: true },
    },
    ({ projectId }) => run(async () => summarizeView(await getView(api, projectId))),
  );

  server.registerTool(
    'create_project',
    {
      title: 'Create a project',
      description: 'Creates an empty project. Add walls and posters to it next.',
      inputSchema: {
        name: z.string().min(1).max(200),
        visibility: z.enum(['private', 'public']).default('private').describe('Public projects appear in the public gallery.'),
      },
    },
    (body) => run(async () => ({ created: (await call<{ project: Project }>(api, '/projects', { method: 'POST', body })).project })),
  );

  server.registerTool(
    'update_project',
    {
      title: 'Rename a project or change who can see it',
      description: 'Changes a project’s name or visibility. Only the fields you pass change.',
      inputSchema: {
        projectId: projectIdArg,
        name: z.string().min(1).max(200).optional(),
        visibility: z.enum(['private', 'public']).optional(),
      },
    },
    ({ projectId, name, visibility }) =>
      run(async () => {
        const { project } = await loadProject(api, projectId);
        const body = { name: name ?? project.name, visibility: visibility ?? project.visibility, version: project.version };
        return { updated: (await call<{ project: Project }>(api, `/projects/${projectId}`, { method: 'PATCH', body })).project };
      }),
  );

  server.registerTool(
    'add_wall',
    {
      title: 'Add a wall',
      description: 'Adds a wall to a project, with any doors, windows or outlets already on it.',
      inputSchema: {
        projectId: projectIdArg,
        name: z.string().min(1).max(120),
        widthIn: inches,
        heightIn: inches,
        backgroundColor: hexColor.optional().describe('Paint color. Defaults to white.'),
        obstructions: z.array(ObstructionArg).default([]),
      },
    },
    ({ projectId, obstructions, ...wall }) =>
      run(async () => {
        const body = { ...wall, obstructions: toObstructions(obstructions) };
        return { created: (await call<{ wall: Wall }>(api, `/projects/${projectId}/walls`, { method: 'POST', body })).wall };
      }),
  );

  server.registerTool(
    'update_wall',
    {
      title: 'Edit a wall',
      description: 'Changes a wall’s name, size, color or obstructions. Only the fields you pass change; obstructions, if passed, replace the whole list.',
      inputSchema: {
        projectId: projectIdArg,
        wallId: wallIdArg,
        name: z.string().min(1).max(120).optional(),
        widthIn: inches.optional(),
        heightIn: inches.optional(),
        backgroundColor: hexColor.optional(),
        obstructions: z.array(ObstructionArg).optional(),
      },
    },
    ({ projectId, wallId, ...changes }) =>
      run(async () => {
        const existing = await findWall(api, projectId, wallId);
        const body = {
          name: changes.name ?? existing.name,
          widthIn: changes.widthIn ?? existing.widthIn,
          heightIn: changes.heightIn ?? existing.heightIn,
          backgroundColor: changes.backgroundColor ?? existing.backgroundColor,
          obstructions: changes.obstructions === undefined ? existing.obstructions : toObstructions(changes.obstructions),
        };
        return { updated: (await call<{ wall: Wall }>(api, `/projects/${projectId}/walls/${wallId}`, { method: 'PUT', body })).wall };
      }),
  );

  server.registerTool(
    'delete_wall',
    {
      title: 'Delete a wall',
      description: 'Deletes a wall and its arrangement. The posters stay in the project’s library. Cannot be undone.',
      inputSchema: { projectId: projectIdArg, wallId: wallIdArg },
      annotations: { destructiveHint: true },
    },
    ({ projectId, wallId }) =>
      run(async () => {
        await call(api, `/projects/${projectId}/walls/${wallId}`, { method: 'DELETE' });
        return { deleted: { wallId } };
      }),
  );

  server.registerTool(
    'add_poster',
    {
      title: 'Add a poster',
      description: 'Adds a poster to a project’s library. Images can only be uploaded in the app.',
      inputSchema: {
        projectId: projectIdArg,
        name: z.string().min(1).max(200),
        widthIn: posterFields.widthIn,
        heightIn: posterFields.heightIn,
        frameWidthIn: posterFields.frameWidthIn.optional(),
        frameColor: posterFields.frameColor.optional(),
        shape: posterFields.shape.optional(),
      },
    },
    ({ projectId, ...poster }) =>
      run(async () => ({ created: (await call<{ poster: Poster }>(api, `/projects/${projectId}/posters`, { method: 'POST', body: poster })).poster })),
  );

  server.registerTool(
    'update_poster',
    {
      title: 'Edit a poster',
      description: 'Changes a poster’s name, size, frame or shape. Only the fields you pass change; its image and placements are kept.',
      inputSchema: {
        projectId: projectIdArg,
        posterId: posterIdArg,
        name: z.string().min(1).max(200).optional(),
        widthIn: posterFields.widthIn.optional(),
        heightIn: posterFields.heightIn.optional(),
        frameWidthIn: posterFields.frameWidthIn.optional(),
        frameColor: posterFields.frameColor.optional(),
        shape: posterFields.shape.optional(),
      },
    },
    ({ projectId, posterId, ...changes }) =>
      run(async () => {
        const { id: _id, ...existing } = await findPoster(api, projectId, posterId);
        const body = {
          ...existing,
          name: changes.name ?? existing.name,
          widthIn: changes.widthIn ?? existing.widthIn,
          heightIn: changes.heightIn ?? existing.heightIn,
          frameWidthIn: changes.frameWidthIn ?? existing.frameWidthIn,
          frameColor: changes.frameColor ?? existing.frameColor,
          shape: changes.shape ?? existing.shape,
        };
        return { updated: (await call<{ poster: Poster }>(api, `/projects/${projectId}/posters/${posterId}`, { method: 'PUT', body })).poster };
      }),
  );

  server.registerTool(
    'delete_poster',
    {
      title: 'Delete a poster',
      description: 'Deletes a poster from the library and takes it off every wall it hangs on. Cannot be undone.',
      inputSchema: { projectId: projectIdArg, posterId: posterIdArg },
      annotations: { destructiveHint: true },
    },
    ({ projectId, posterId }) =>
      run(async () => {
        const { walls } = await loadProject(api, projectId);
        const removedFrom: string[] = [];
        for (const wall of walls) {
          const placements = await getPlacements(api, projectId, wall.id);
          if (!placements.some((p) => p.posterId === posterId)) continue;
          await putPlacements(api, projectId, wall.id, placements.filter((p) => p.posterId !== posterId));
          removedFrom.push(wall.name);
        }
        await call(api, `/projects/${projectId}/posters/${posterId}`, { method: 'DELETE' });
        return { deleted: { posterId }, removedFromWalls: removedFrom };
      }),
  );

  server.registerTool(
    'place_poster',
    {
      title: 'Hang or move a poster',
      description:
        'Places a poster on a wall at the given center point, or moves it there if it is already on that wall. ' +
        `Without coordinates it goes in the horizontal middle at ${DEFAULT_CENTER_HEIGHT_IN}" to center (gallery height).`,
      inputSchema: {
        projectId: projectIdArg,
        wallId: wallIdArg,
        posterId: posterIdArg,
        centerXIn: z.number().finite().optional().describe('Distance from the wall’s left edge to the poster’s center.'),
        centerYIn: z.number().finite().optional().describe('Height of the poster’s center above the floor.'),
      },
    },
    ({ projectId, wallId, posterId, centerXIn, centerYIn }) =>
      run(async () => {
        const [wall, poster, placements] = await Promise.all([
          findWall(api, projectId, wallId),
          findPoster(api, projectId, posterId),
          getPlacements(api, projectId, wallId),
        ]);
        const placement: Placement = {
          posterId,
          centerXIn: centerXIn ?? wall.widthIn / 2,
          centerYIn: centerYIn ?? Math.min(DEFAULT_CENTER_HEIGHT_IN, wall.heightIn / 2),
        };
        await putPlacements(api, projectId, wallId, [...placements.filter((p) => p.posterId !== posterId), placement]);
        const edges = hangingEdges(poster, placement);
        const fits = edges.leftEdgeIn >= 0 && edges.bottomEdgeIn >= 0 && edges.rightEdgeIn <= wall.widthIn && edges.topEdgeIn <= wall.heightIn;
        return { placed: { ...placement, posterName: poster.name, wall: wall.name, ...edges, fitsOnWall: fits } };
      }),
  );

  server.registerTool(
    'remove_poster_from_wall',
    {
      title: 'Take a poster off a wall',
      description: 'Removes a poster from one wall. It stays in the project’s library.',
      inputSchema: { projectId: projectIdArg, wallId: wallIdArg, posterId: posterIdArg },
    },
    ({ projectId, wallId, posterId }) =>
      run(async () => {
        const placements = await getPlacements(api, projectId, wallId);
        if (!placements.some((p) => p.posterId === posterId)) throw new ToolError('That poster is not on that wall.');
        await putPlacements(api, projectId, wallId, placements.filter((p) => p.posterId !== posterId));
        return { removed: { posterId, wallId } };
      }),
  );

  server.registerTool(
    'browse_public_projects',
    {
      title: 'Browse public projects',
      description: 'Searches projects people have shared publicly, optionally for walls near a given size, for ideas.',
      inputSchema: {
        q: z.string().optional().describe('Words to match in project names.'),
        widthIn: inches.optional().describe('Wall width to match.'),
        heightIn: inches.optional().describe('Wall height to match.'),
        limit: z.number().int().min(1).max(48).default(12),
      },
      annotations: { readOnlyHint: true },
    },
    ({ q, widthIn, heightIn, limit }) =>
      run(async () => {
        const query = new URLSearchParams({ limit: String(limit) });
        if (q !== undefined) query.set('q', q);
        if (widthIn !== undefined) query.set('widthIn', String(widthIn));
        if (heightIn !== undefined) query.set('heightIn', String(heightIn));
        return call(api, `/public/projects?${query}`);
      }),
  );

  return server;
}
