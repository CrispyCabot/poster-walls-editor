import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { PROFILE, userPk } from "@pwe/shared";
import { docClient, tableName } from "./client.js";

/**
 * Per-account ceilings.
 *
 * These exist so a stranger who finds the site cannot quietly run up an S3
 * bill. They are deliberately generous for real use and cheap to raise: a
 * `limits` map on a user's PROFILE item overrides any of them per account, so
 * lifting a cap is a single write rather than a deploy.
 */
export interface Limits {
  projects: number;
  postersPerProject: number;
  wallsPerProject: number;
  /** Largest single upload, in bytes. */
  uploadBytes: number;
  /** Total images across all of a user's projects. */
  images: number;
}

export const DEFAULT_LIMITS: Limits = {
  projects: 1,
  postersPerProject: 50,
  wallsPerProject: 2,
  uploadBytes: 15 * 1024 * 1024,
  images: 10,
};

/** Raised when an account is at a ceiling. Surfaces as 429, not 500. */
export class LimitExceededError extends Error {
  constructor(
    readonly limit: keyof Limits,
    readonly allowed: number,
    message: string,
  ) {
    super(message);
    this.name = "LimitExceededError";
  }
}

/**
 * A user's effective limits.
 *
 * Reads the PROFILE item and merges any `limits` overrides over the defaults,
 * so raising one ceiling for one account does not require touching the others.
 */
export async function limitsFor(ownerId: string): Promise<Limits> {
  const result = await docClient().send(
    new GetCommand({
      TableName: tableName(),
      Key: { PK: userPk(ownerId), SK: PROFILE },
    }),
  );

  const overrides = (result.Item?.limits ?? {}) as Partial<
    Record<keyof Limits, unknown>
  >;
  const merged = { ...DEFAULT_LIMITS };

  for (const key of Object.keys(DEFAULT_LIMITS) as (keyof Limits)[]) {
    const value = overrides[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      merged[key] = value;
    }
  }

  return merged;
}

export function assertUnder(
  current: number,
  limit: number,
  key: keyof Limits,
  noun: string,
): void {
  if (current >= limit) {
    throw new LimitExceededError(
      key,
      limit,
      `You have reached the limit of ${limit} ${noun}. Delete some, or ask for a higher limit.`,
    );
  }
}
