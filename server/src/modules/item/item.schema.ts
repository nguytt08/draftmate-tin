import { z } from 'zod';

export const createItemSchema = z.object({
  name: z.string().min(1).max(200),
  metadata: z.record(z.unknown()).optional(),
  commissionerNotes: z.string().max(1000).optional(),
});

export const bulkCreateItemsSchema = z.object({
  items: z.array(createItemSchema).min(1).max(500),
});

export const updateItemSchema = createItemSchema.partial();

export const upsertMyNoteSchema = z.object({
  note: z.string().max(2000),
});
