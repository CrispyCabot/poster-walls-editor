import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  GSI1,
  META,
  POSTER_SK_PREFIX,
  PUBLIC_PARTITION,
  type Placement,
  type Poster,
  type ProjectPreview,
  type Wall,
  WALL_SK_PREFIX,
  projectPk,
} from '@pwe/shared';
import { docClient, tableName } from './client.js';

/**
 * How many public projects a browse request will ever look at.
 *
 * Search filters run over assembled previews rather than in DynamoDB, because
 * matching on poster names and wall dimensions means reading a project's child
 * items regardless. That is fine at this scale and honest about its ceiling —
 * past this many public projects, browsing needs a real search index.
 */
const BROWSE_CEILING = 120;

/** Turns one project's items into the shape a preview card needs. */
function toPreview(items: Record<string, unknown>[]): ProjectPreview | null {
  const meta = items.find((i) => i.SK === META);
  if (meta === undefined) return null;

  const walls: Wall[] = items
    .filter((i) => String(i.SK).startsWith(WALL_SK_PREFIX))
    .map((i) => ({
      id: String(i.id),
      name: String(i.name),
      widthIn: Number(i.widthIn),
      heightIn: Number(i.heightIn),
      obstructions: (i.obstructions ?? []) as Wall['obstructions'],
      backgroundColor: String(i.backgroundColor ?? '#FFFFFF'),
    }));

  const posters: Poster[] = items
    .filter((i) => String(i.SK).startsWith(POSTER_SK_PREFIX))
    .map((i) => ({
      id: String(i.id),
      name: String(i.name),
      widthIn: Number(i.widthIn),
      heightIn: Number(i.heightIn),
      frameWidthIn: Number(i.frameWidthIn),
      frameColor: String(i.frameColor),
      shape: (i.shape === 'circle' ? 'circle' : 'rect') as 'rect' | 'circle',
      ...(i.imageKey === undefined ? {} : { imageKey: String(i.imageKey) }),
    }));

  // The card shows the first wall, so only that wall's placements matter.
  const wall = walls[0] ?? null;
  const layout = items.find(
    (i) => wall !== null && String(i.SK).startsWith(`LAYOUT#${wall.id}#`),
  );

  return {
    id: String(meta.id),
    name: String(meta.name),
    visibility: meta.visibility === 'public' ? 'public' : 'private',
    updatedAt: String(meta.updatedAt),
    wall,
    posters,
    placements: (layout?.placements ?? []) as Placement[],
  };
}

async function previewOf(projectId: string): Promise<ProjectPreview | null> {
  const result = await docClient().send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': projectPk(projectId) },
    }),
  );
  return toPreview(result.Items ?? []);
}

export async function previewsFor(projectIds: string[]): Promise<ProjectPreview[]> {
  const previews = await Promise.all(projectIds.map(previewOf));
  return previews.filter((p): p is ProjectPreview => p !== null);
}

export interface BrowseFilters {
  /** Matches project name, wall name, or any poster name. */
  q?: string;
  /** Wall width in inches; results within tolerance, exact matches first. */
  widthIn?: number;
  heightIn?: number;
  toleranceIn?: number;
}

export interface BrowseResult {
  projects: ProjectPreview[];
  total: number;
  /** True when the ceiling was hit and some public projects were not examined. */
  truncated: boolean;
}

function matches(p: ProjectPreview, f: BrowseFilters): boolean {
  if (f.q !== undefined && f.q.trim() !== '') {
    const needle = f.q.trim().toLowerCase();
    const haystack = [p.name, p.wall?.name ?? '', ...p.posters.map((x) => x.name)]
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(needle)) return false;
  }

  const tolerance = f.toleranceIn ?? 12;

  if (f.widthIn !== undefined) {
    if (p.wall === null) return false;
    if (Math.abs(p.wall.widthIn - f.widthIn) > tolerance) return false;
  }
  if (f.heightIn !== undefined) {
    if (p.wall === null) return false;
    if (Math.abs(p.wall.heightIn - f.heightIn) > tolerance) return false;
  }

  return true;
}

/** How far a project's wall is from the requested dimensions. Exact sorts first. */
function dimensionDistance(p: ProjectPreview, f: BrowseFilters): number {
  if (p.wall === null) return Number.POSITIVE_INFINITY;
  let d = 0;
  if (f.widthIn !== undefined) d += Math.abs(p.wall.widthIn - f.widthIn);
  if (f.heightIn !== undefined) d += Math.abs(p.wall.heightIn - f.heightIn);
  return d;
}

export async function browsePublic(
  filters: BrowseFilters,
  limit: number,
  offset: number,
): Promise<BrowseResult> {
  const result = await docClient().send(
    new QueryCommand({
      TableName: tableName(),
      IndexName: GSI1,
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: { ':pk': PUBLIC_PARTITION },
      // Newest first.
      ScanIndexForward: false,
      Limit: BROWSE_CEILING,
    }),
  );

  const ids = (result.Items ?? []).map((i) => String(i.id));
  const previews = await previewsFor(ids);

  const filtered = previews.filter((p) => matches(p, filters));

  const wantsDimensions =
    filters.widthIn !== undefined || filters.heightIn !== undefined;
  if (wantsDimensions) {
    filtered.sort((a, b) => dimensionDistance(a, filters) - dimensionDistance(b, filters));
  }

  return {
    projects: filtered.slice(offset, offset + limit),
    total: filtered.length,
    truncated: result.LastEvaluatedKey !== undefined,
  };
}
