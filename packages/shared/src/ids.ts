import { z } from 'zod';

/**
 * IDs are opaque strings generated with `crypto.randomUUID()`.
 *
 * `#` is excluded deliberately: it is the key-segment separator, and
 * `layoutSk` joins two segments with it, so an id containing `#` would let two
 * different (wallId, layoutId) pairs address one item.
 */
export const IdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, 'must contain only letters, digits, hyphen, or underscore');
