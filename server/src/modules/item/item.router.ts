import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requireCommissioner } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { createItemSchema, bulkCreateItemsSchema, updateItemSchema, upsertMyNoteSchema } from './item.schema';
import * as itemService from './item.service';

export const itemRouter = Router();

itemRouter.use(requireAuth);

itemRouter.get('/:id/items', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const availableOnly = req.query.available === 'true';
    res.json(await itemService.listItems(req.params.id, availableOnly));
  } catch (err) { next(err); }
});

itemRouter.post('/:id/items', requireCommissioner(), validate(createItemSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(201).json(await itemService.createItem(req.params.id, req.body));
  } catch (err) { next(err); }
});

itemRouter.post('/:id/items/bulk', requireCommissioner(), validate(bulkCreateItemsSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(201).json(await itemService.bulkCreateItems(req.params.id, req.body));
  } catch (err) { next(err); }
});

itemRouter.patch('/:id/items/:itemId', requireCommissioner(), validate(updateItemSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await itemService.updateItem(req.params.id, req.params.itemId, req.body));
  } catch (err) { next(err); }
});

itemRouter.delete('/:id/items/:itemId', requireCommissioner(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await itemService.deleteItem(req.params.id, req.params.itemId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Notes — any league member can read/write their own note; commissioner notes come along for the ride
itemRouter.get('/:id/items/:itemId/notes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const member = await import('../../db').then(({ prisma }) =>
      prisma.leagueMember.findFirst({ where: { leagueId: req.params.id, userId: req.user!.sub } }),
    );
    if (!member) { res.status(403).json({ error: 'Not a member of this league' }); return; }
    res.json(await itemService.getItemNotes(req.params.id, req.params.itemId, member.id));
  } catch (err) { next(err); }
});

itemRouter.put('/:id/items/:itemId/notes/mine', validate(upsertMyNoteSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const member = await import('../../db').then(({ prisma }) =>
      prisma.leagueMember.findFirst({ where: { leagueId: req.params.id, userId: req.user!.sub } }),
    );
    if (!member) { res.status(403).json({ error: 'Not a member of this league' }); return; }
    res.json(await itemService.upsertMyNote(req.params.id, req.params.itemId, member.id, req.body.note));
  } catch (err) { next(err); }
});
