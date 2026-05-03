import { z } from 'zod';

export const createLeagueSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

export const updateLeagueSchema = createLeagueSchema.partial();

export const draftSettingsSchema = z.object({
  format: z.enum(['SNAKE', 'LINEAR', 'AUCTION']).default('SNAKE'),
  totalRounds: z.number().int().min(1).max(50),
  pickTimerSeconds: z.number().int().min(60).default(7200),
  autoPick: z.enum(['RANDOM', 'SKIP', 'BEST_RANKED', 'COMMISSIONER_PICK']).default('COMMISSIONER_PICK'),
  allowTrading: z.boolean().default(false),
  enforceBucketPicking: z.boolean().default(false),
  allowSelfReclaim: z.boolean().default(false),
  extendedConfig: z.record(z.unknown()).optional(),
});

export const inviteMemberSchema = z.object({
  email: z.string().email().optional(),
  displayName: z.string().min(1).max(100).optional(),
  notifyPhone: z.string().optional(),
}).refine((d) => d.email || d.displayName, { message: 'Provide at least a name or email' });

export const setDraftPositionSchema = z.object({
  draftPosition: z.number().int().min(1),
});

export const cloneLeagueSchema = z.object({
  name: z.string().min(1).max(100),
});
