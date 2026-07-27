import { describe, expect, it } from 'vitest';
import {
  META,
  PROFILE,
  POSTER_SK_PREFIX,
  PROJECT_SK_PREFIX,
  WALL_SK_PREFIX,
  layoutSk,
  posterSk,
  projectIndexSk,
  projectPk,
  sharePk,
  userPk,
  wallSk,
} from './keys.js';

describe('key builders', () => {
  it('builds a user partition key', () => {
    expect(userPk('abc-123')).toBe('USER#abc-123');
  });

  it('builds a project partition key', () => {
    expect(projectPk('p1')).toBe('PROJECT#p1');
  });

  it('builds child sort keys', () => {
    expect(wallSk('w1')).toBe('WALL#w1');
    expect(posterSk('po1')).toBe('POSTER#po1');
    expect(layoutSk('w1', 'l1')).toBe('LAYOUT#w1#l1');
    expect(sharePk('tok')).toBe('SHARE#tok');
  });

  it('exposes the constant sort keys', () => {
    expect(META).toBe('META');
    expect(PROFILE).toBe('PROFILE');
  });
});

describe('prefixes', () => {
  it('are the exact prefixes of the keys they scan for', () => {
    // A begins_with query is only correct if the prefix really prefixes the
    // key. Asserting the relationship keeps the two from drifting apart.
    expect(projectIndexSk('p1').startsWith(PROJECT_SK_PREFIX)).toBe(true);
    expect(wallSk('w1').startsWith(WALL_SK_PREFIX)).toBe(true);
    expect(posterSk('po1').startsWith(POSTER_SK_PREFIX)).toBe(true);
  });

  it('does not let a wall prefix match a layout key', () => {
    // LAYOUT#<wallId>#<layoutId> must not be swept up by a WALL# scan.
    expect(layoutSk('w1', 'l1').startsWith(WALL_SK_PREFIX)).toBe(false);
  });
});
