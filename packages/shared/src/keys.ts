/**
 * DynamoDB key addressing for the single table.
 *
 * These live in `shared` rather than `api` because share-link resolution and
 * any future tooling address the same items. They are pure string builders —
 * nothing here touches AWS.
 *
 * Layout:
 *   USER#<sub>            PROFILE
 *   USER#<sub>            PROJECT#<projectId>          (index entry)
 *   PROJECT#<projectId>   META
 *   PROJECT#<projectId>   WALL#<wallId>
 *   PROJECT#<projectId>   POSTER#<posterId>
 *   PROJECT#<projectId>   LAYOUT#<wallId>#<layoutId>
 *   SHARE#<token>         META
 */

export const META = 'META';
export const PROFILE = 'PROFILE';

export const PROJECT_SK_PREFIX = 'PROJECT#';
export const WALL_SK_PREFIX = 'WALL#';
export const POSTER_SK_PREFIX = 'POSTER#';

export function userPk(sub: string): string {
  return `USER#${sub}`;
}

export function projectPk(projectId: string): string {
  return `PROJECT#${projectId}`;
}

/** Sort key of the per-user index entry that makes "list my projects" a query. */
export function projectIndexSk(projectId: string): string {
  return `${PROJECT_SK_PREFIX}${projectId}`;
}

export function wallSk(wallId: string): string {
  return `${WALL_SK_PREFIX}${wallId}`;
}

export function posterSk(posterId: string): string {
  return `${POSTER_SK_PREFIX}${posterId}`;
}

export function layoutSk(wallId: string, layoutId: string): string {
  return `LAYOUT#${wallId}#${layoutId}`;
}

export function sharePk(token: string): string {
  return `SHARE#${token}`;
}
