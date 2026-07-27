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

/** GSI1: browsing public projects. Sparse — only public META items carry it. */
export const GSI1 = 'GSI1';
export const PUBLIC_PARTITION = 'PUBLIC';

/** Sort key for the public index. Newest first when the query runs backwards. */
export function publicSk(updatedAt: string, projectId: string): string {
  return `${updatedAt}#${projectId}`;
}

/** Narrows a stored shape value, defaulting anything unrecognised to rect. */
export function toShape(value: unknown): 'rect' | 'circle' | 'diamond' {
  return value === 'circle' || value === 'diamond' ? value : 'rect';
}
