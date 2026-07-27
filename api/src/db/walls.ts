import { DeleteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { META, type CreateWall, type Wall, projectPk, wallSk } from '@pwe/shared';
import { docClient, tableName } from './client.js';

/**
 * Every wall mutation goes through this first. Skipping it would let anyone
 * append walls to any project by guessing its id.
 */
async function ownsProject(projectId: string, ownerId: string): Promise<boolean> {
  const result = await docClient().send(
    new GetCommand({
      TableName: tableName(),
      Key: { PK: projectPk(projectId), SK: META },
    }),
  );
  return result.Item !== undefined && result.Item.ownerId === ownerId;
}

export async function addWall(
  projectId: string,
  ownerId: string,
  input: CreateWall,
): Promise<Wall | null> {
  if (!(await ownsProject(projectId, ownerId))) return null;

  const wall: Wall = { id: crypto.randomUUID(), ...input };

  await docClient().send(
    new PutCommand({
      TableName: tableName(),
      Item: { PK: projectPk(projectId), SK: wallSk(wall.id), ...wall },
    }),
  );

  return wall;
}

export async function updateWall(
  projectId: string,
  ownerId: string,
  wallId: string,
  input: CreateWall,
): Promise<Wall | null> {
  if (!(await ownsProject(projectId, ownerId))) return null;

  const wall: Wall = { id: wallId, ...input };

  await docClient().send(
    new PutCommand({
      TableName: tableName(),
      Item: { PK: projectPk(projectId), SK: wallSk(wallId), ...wall },
    }),
  );

  return wall;
}

export async function removeWall(
  projectId: string,
  ownerId: string,
  wallId: string,
): Promise<boolean> {
  if (!(await ownsProject(projectId, ownerId))) return false;

  await docClient().send(
    new DeleteCommand({
      TableName: tableName(),
      Key: { PK: projectPk(projectId), SK: wallSk(wallId) },
    }),
  );

  return true;
}
