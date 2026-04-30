import { Prisma } from '@prisma/client';
import { prisma } from '../../db';
import { AppError } from '../../middleware/errorHandler';
import type { z } from 'zod';
import type { createItemSchema, bulkCreateItemsSchema, updateItemSchema } from './item.schema';

type CreateItemInput = z.infer<typeof createItemSchema>;
type BulkCreateInput = z.infer<typeof bulkCreateItemsSchema>;
type UpdateItemInput = z.infer<typeof updateItemSchema>;

export async function listItems(leagueId: string, availableOnly = false) {
  return prisma.draftItem.findMany({
    where: { leagueId, ...(availableOnly ? { isAvailable: true } : {}) },
    orderBy: [{ bucket: 'asc' }, { createdAt: 'asc' }],
  });
}

export async function createItem(leagueId: string, input: CreateItemInput) {
  return prisma.draftItem.create({
    data: {
      leagueId,
      name: input.name,
      bucket: input.bucket,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
      commissionerNotes: input.commissionerNotes,
    },
  });
}

export async function bulkCreateItems(leagueId: string, input: BulkCreateInput) {
  await prisma.draftItem.createMany({
    data: input.items.map((item) => ({
      leagueId,
      name: item.name,
      bucket: item.bucket,
      metadata: item.metadata as Prisma.InputJsonValue | undefined,
      commissionerNotes: item.commissionerNotes,
    })),
  });
  return prisma.draftItem.findMany({ where: { leagueId }, orderBy: [{ bucket: 'asc' }, { createdAt: 'asc' }] });
}

export async function updateItem(leagueId: string, itemId: string, input: UpdateItemInput) {
  const item = await prisma.draftItem.findUnique({ where: { id: itemId } });
  if (!item || item.leagueId !== leagueId) throw new AppError(404, 'Item not found');
  return prisma.draftItem.update({
    where: { id: itemId },
    data: {
      name: input.name,
      bucket: input.bucket,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
      commissionerNotes: input.commissionerNotes,
    },
  });
}

export async function deleteItem(leagueId: string, itemId: string) {
  const item = await prisma.draftItem.findUnique({ where: { id: itemId } });
  if (!item || item.leagueId !== leagueId) throw new AppError(404, 'Item not found');
  if (!item.isAvailable) throw new AppError(409, 'Cannot delete an already-picked item');
  await prisma.draftItem.delete({ where: { id: itemId } });
}

export async function getItemNotes(leagueId: string, itemId: string, memberId: string) {
  const item = await prisma.draftItem.findUnique({ where: { id: itemId } });
  if (!item || item.leagueId !== leagueId) throw new AppError(404, 'Item not found');

  const myNote = await prisma.memberItemNote.findUnique({
    where: { memberId_itemId: { memberId, itemId } },
  });

  return {
    commissionerNotes: item.commissionerNotes ?? null,
    myNote: myNote?.note ?? null,
  };
}

export async function getAllMyNotes(leagueId: string, memberId: string): Promise<Record<string, string>> {
  const notes = await prisma.memberItemNote.findMany({
    where: { memberId, item: { leagueId } },
    select: { itemId: true, note: true },
  });
  return Object.fromEntries(notes.map((n) => [n.itemId, n.note]));
}

export async function upsertMyNote(leagueId: string, itemId: string, memberId: string, note: string) {
  const item = await prisma.draftItem.findUnique({ where: { id: itemId } });
  if (!item || item.leagueId !== leagueId) throw new AppError(404, 'Item not found');

  return prisma.memberItemNote.upsert({
    where: { memberId_itemId: { memberId, itemId } },
    create: { memberId, itemId, note },
    update: { note },
  });
}
