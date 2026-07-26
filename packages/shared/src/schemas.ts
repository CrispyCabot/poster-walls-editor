import { z } from 'zod';
import { IdSchema } from './ids.js';

const PositiveInches = z.number().positive().finite();
const NonNegativeInches = z.number().nonnegative().finite();
const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a #rrggbb hex color');

export const ObstructionKindSchema = z.enum(['door', 'window', 'outlet', 'generic']);
export type ObstructionKind = z.infer<typeof ObstructionKindSchema>;

export const ObstructionSchema = z.object({
  id: IdSchema,
  kind: ObstructionKindSchema,
  label: z.string().max(80),
  /** Bottom-left corner in wall space. */
  x: z.number().finite(),
  y: z.number().finite(),
  width: PositiveInches,
  height: PositiveInches,
});
export type Obstruction = z.infer<typeof ObstructionSchema>;

export const WallSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(120),
  widthIn: PositiveInches,
  heightIn: PositiveInches,
  obstructions: z.array(ObstructionSchema).default([]),
});
export type Wall = z.infer<typeof WallSchema>;

export const PosterSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(200),
  widthIn: PositiveInches,
  heightIn: PositiveInches,
  frameWidthIn: NonNegativeInches.default(1),
  frameColor: HexColor.default('#000000'),
  imageKey: z.string().optional(),
});
/** Parsed form: defaulted fields are present. */
export type Poster = z.infer<typeof PosterSchema>;
/** Construction form: defaulted fields may be omitted. Use for request bodies. */
export type PosterInput = z.input<typeof PosterSchema>;

export const PlacementSchema = z.object({
  posterId: IdSchema,
  /** Center of the framed poster, in wall space. */
  centerX: z.number().finite(),
  centerY: z.number().finite(),
});
export type Placement = z.infer<typeof PlacementSchema>;

export const VisibilitySchema = z.enum(['private', 'public']);
export type Visibility = z.infer<typeof VisibilitySchema>;

export const ProjectSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(200),
  visibility: VisibilitySchema,
  version: z.number().int().nonnegative(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const CreateProjectSchema = z.object({
  name: z.string().min(1).max(200),
  visibility: VisibilitySchema.default('private'),
});
/** Parsed form: `visibility` is always present. */
export type CreateProject = z.infer<typeof CreateProjectSchema>;
/**
 * Request-body form: `visibility` may be omitted. `z.infer` resolves to zod's
 * OUTPUT type, where a `.default()` field is required — so typing a request
 * body as `CreateProject` would reject `{ name: 'x' }`, the very omission the
 * default exists to serve.
 */
export type CreateProjectInput = z.input<typeof CreateProjectSchema>;
