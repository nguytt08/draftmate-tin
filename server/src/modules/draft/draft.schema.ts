import { z } from 'zod';

export const submitPickSchema = z.object({
  itemId: z.string().uuid(),
});
