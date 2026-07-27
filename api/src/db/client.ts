import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

let cached: DynamoDBDocumentClient | undefined;

/**
 * Built on first use, not at module load. Eager construction would run in every
 * test that merely imports a route module, and would read TABLE_NAME before any
 * test had a chance to set it — the same trap that broke the Cognito verifier.
 */
export function docClient(): DynamoDBDocumentClient {
  cached ??= DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  });
  return cached;
}

export function tableName(): string {
  const name = process.env.TABLE_NAME;
  if (name === undefined || name === '') {
    throw new Error('TABLE_NAME is not set');
  }
  return name;
}

/** Test seam: drops the memoized client so a mock can take effect. */
export function resetDocClient(): void {
  cached = undefined;
}
