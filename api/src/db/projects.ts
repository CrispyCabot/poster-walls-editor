import {
  DeleteCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  META,
  PROJECT_SK_PREFIX,
  WALL_SK_PREFIX,
  type Visibility,
  type Wall,
  projectIndexSk,
  projectPk,
  userPk,
} from '@pwe/shared';
import { docClient, tableName } from './client.js';

export interface ProjectRecord {
  id: string;
  ownerId: string;
  name: string;
  visibility: Visibility;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  visibility: Visibility;
  updatedAt: string;
}

/** Raised when a conditional write loses — another writer got there first. */
export class VersionConflictError extends Error {
  constructor() {
    super('The project was modified by someone else');
    this.name = 'VersionConflictError';
  }
}

export async function createProject(input: {
  ownerId: string;
  name: string;
  visibility: Visibility;
}): Promise<ProjectRecord> {
  const now = new Date().toISOString();
  const project: ProjectRecord = {
    id: crypto.randomUUID(),
    ownerId: input.ownerId,
    name: input.name,
    visibility: input.visibility,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };

  // One transaction, because a project whose index entry is missing exists but
  // never appears in its owner's list.
  await docClient().send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: tableName(),
            Item: { PK: projectPk(project.id), SK: META, ...project },
            ConditionExpression: 'attribute_not_exists(PK)',
          },
        },
        {
          Put: {
            TableName: tableName(),
            Item: {
              PK: userPk(input.ownerId),
              SK: projectIndexSk(project.id),
              id: project.id,
              name: project.name,
              visibility: project.visibility,
              updatedAt: now,
            },
          },
        },
      ],
    }),
  );

  return project;
}

export async function listProjects(ownerId: string): Promise<ProjectSummary[]> {
  const result = await docClient().send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': userPk(ownerId),
        ':sk': PROJECT_SK_PREFIX,
      },
    }),
  );

  return (result.Items ?? []).map((item) => ({
    id: String(item.id),
    name: String(item.name),
    visibility: item.visibility as Visibility,
    updatedAt: String(item.updatedAt),
  }));
}

/**
 * Returns null both when the project is absent and when it belongs to someone
 * else. Callers therefore cannot tell the two apart, which is what keeps the
 * 404-never-403 rule honest.
 */
export async function loadProject(
  projectId: string,
  ownerId: string,
): Promise<{ project: ProjectRecord; walls: Wall[] } | null> {
  const result = await docClient().send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': projectPk(projectId) },
    }),
  );

  const items = result.Items ?? [];
  const meta = items.find((i) => i.SK === META);
  if (meta === undefined || meta.ownerId !== ownerId) return null;

  const walls: Wall[] = items
    .filter((i) => String(i.SK).startsWith(WALL_SK_PREFIX))
    .map((i) => ({
      id: String(i.id),
      name: String(i.name),
      widthIn: Number(i.widthIn),
      heightIn: Number(i.heightIn),
      obstructions: (i.obstructions ?? []) as Wall['obstructions'],
    }));

  return {
    project: {
      id: String(meta.id),
      ownerId: String(meta.ownerId),
      name: String(meta.name),
      visibility: meta.visibility as Visibility,
      version: Number(meta.version),
      createdAt: String(meta.createdAt),
      updatedAt: String(meta.updatedAt),
    },
    walls,
  };
}

export async function renameProject(
  projectId: string,
  ownerId: string,
  name: string,
  visibility: Visibility,
  expectedVersion: number,
): Promise<ProjectRecord> {
  const now = new Date().toISOString();

  try {
    const result = await docClient().send(
      new UpdateCommand({
        TableName: tableName(),
        Key: { PK: projectPk(projectId), SK: META },
        UpdateExpression:
          'SET #name = :name, visibility = :visibility, updatedAt = :now, version = :next',
        // Ownership is part of the condition, so a non-owner's write fails the
        // same way a stale write does — no separate read, no timing signal.
        ConditionExpression: 'version = :expected AND ownerId = :ownerId',
        ExpressionAttributeNames: { '#name': 'name' },
        ExpressionAttributeValues: {
          ':name': name,
          ':visibility': visibility,
          ':now': now,
          ':next': expectedVersion + 1,
          ':expected': expectedVersion,
          ':ownerId': ownerId,
        },
        ReturnValues: 'ALL_NEW',
      }),
    );

    const a = result.Attributes ?? {};
    return {
      id: String(a.id),
      ownerId: String(a.ownerId),
      name: String(a.name),
      visibility: a.visibility as Visibility,
      version: Number(a.version),
      createdAt: String(a.createdAt),
      updatedAt: String(a.updatedAt),
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'ConditionalCheckFailedException') {
      throw new VersionConflictError();
    }
    throw err;
  }
}

export async function deleteProject(
  projectId: string,
  ownerId: string,
): Promise<boolean> {
  const result = await docClient().send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': projectPk(projectId) },
    }),
  );

  const items = result.Items ?? [];
  const meta = items.find((i) => i.SK === META);
  if (meta === undefined || meta.ownerId !== ownerId) return false;

  for (const item of items) {
    await docClient().send(
      new DeleteCommand({
        TableName: tableName(),
        Key: { PK: item.PK, SK: item.SK },
      }),
    );
  }

  await docClient().send(
    new DeleteCommand({
      TableName: tableName(),
      Key: { PK: userPk(ownerId), SK: projectIndexSk(projectId) },
    }),
  );

  return true;
}
