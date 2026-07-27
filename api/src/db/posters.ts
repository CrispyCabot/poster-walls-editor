import { DeleteCommand, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  META,
  POSTER_SK_PREFIX,
  type Placement,
  type Poster,
  layoutSk,
  posterSk,
  projectPk,
} from '@pwe/shared';
import { docClient, tableName } from './client.js';

/** Every mutation checks this first, so ids cannot be guessed into. */
async function ownsProject(projectId: string, ownerId: string): Promise<boolean> {
  const result = await docClient().send(
    new GetCommand({
      TableName: tableName(),
      Key: { PK: projectPk(projectId), SK: META },
    }),
  );
  return result.Item !== undefined && result.Item.ownerId === ownerId;
}

/** Poster entered into a project's pool. */
export async function addPoster(
  projectId: string,
  ownerId: string,
  input: Omit<Poster, 'id'>,
): Promise<Poster | null> {
  if (!(await ownsProject(projectId, ownerId))) return null;

  const poster: Poster = { id: crypto.randomUUID(), ...input };

  await docClient().send(
    new PutCommand({
      TableName: tableName(),
      Item: { PK: projectPk(projectId), SK: posterSk(poster.id), ...poster },
    }),
  );

  return poster;
}

export async function listPosters(
  projectId: string,
  ownerId: string,
): Promise<Poster[] | null> {
  if (!(await ownsProject(projectId, ownerId))) return null;

  const result = await docClient().send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': projectPk(projectId),
        ':sk': POSTER_SK_PREFIX,
      },
    }),
  );

  return (result.Items ?? []).map((i) => ({
    id: String(i.id),
    name: String(i.name),
    widthIn: Number(i.widthIn),
    heightIn: Number(i.heightIn),
    frameWidthIn: Number(i.frameWidthIn),
    frameColor: String(i.frameColor),
    shape: (i.shape === 'circle' ? 'circle' : 'rect') as 'rect' | 'circle',
    ...(i.imageKey === undefined ? {} : { imageKey: String(i.imageKey) }),
  }));
}

export async function removePoster(
  projectId: string,
  ownerId: string,
  posterId: string,
): Promise<boolean> {
  if (!(await ownsProject(projectId, ownerId))) return false;

  await docClient().send(
    new DeleteCommand({
      TableName: tableName(),
      Key: { PK: projectPk(projectId), SK: posterSk(posterId) },
    }),
  );

  return true;
}

/**
 * Placements for one wall. Stored as a single layout item so that named layout
 * variants can be added later without moving the data — the sort key already
 * carries a layout id, which is `default` until variants exist.
 */
const DEFAULT_LAYOUT = 'default';

export async function getPlacements(
  projectId: string,
  ownerId: string,
  wallId: string,
): Promise<Placement[] | null> {
  if (!(await ownsProject(projectId, ownerId))) return null;

  const result = await docClient().send(
    new GetCommand({
      TableName: tableName(),
      Key: { PK: projectPk(projectId), SK: layoutSk(wallId, DEFAULT_LAYOUT) },
    }),
  );

  return (result.Item?.placements ?? []) as Placement[];
}

export async function putPlacements(
  projectId: string,
  ownerId: string,
  wallId: string,
  placements: Placement[],
): Promise<Placement[] | null> {
  if (!(await ownsProject(projectId, ownerId))) return null;

  await docClient().send(
    new PutCommand({
      TableName: tableName(),
      Item: {
        PK: projectPk(projectId),
        SK: layoutSk(wallId, DEFAULT_LAYOUT),
        wallId,
        layoutId: DEFAULT_LAYOUT,
        placements,
      },
    }),
  );

  return placements;
}
