import { z } from 'zod';

/** IDs are opaque strings; the API generates them with crypto.randomUUID(). */
export const IdSchema = z.string().min(1).max(64);
