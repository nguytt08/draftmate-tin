import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requireCommissioner } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import {
  createLeagueSchema,
  updateLeagueSchema,
  draftSettingsSchema,
  inviteMemberSchema,
  setDraftPositionSchema,
} from './league.schema';
import * as leagueService from './league.service';

export const leagueRouter = Router();

// Public — no auth required; must be before requireAuth middleware
leagueRouter.get('/join/:code', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await leagueService.getLeagueByJoinCode(req.params.code));
  } catch (err) { next(err); }
});

leagueRouter.use(requireAuth);

leagueRouter.post('/', validate(createLeagueSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const league = await leagueService.createLeague(req.user!.sub, req.body);
    res.status(201).json(league);
  } catch (err) { next(err); }
});

leagueRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await leagueService.listLeagues(req.user!.sub));
  } catch (err) { next(err); }
});

leagueRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await leagueService.getLeague(req.params.id));
  } catch (err) { next(err); }
});

leagueRouter.delete('/:id', requireCommissioner(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await leagueService.deleteLeague(req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

leagueRouter.patch('/:id', requireCommissioner(), validate(updateLeagueSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await leagueService.updateLeague(req.params.id, req.body));
  } catch (err) { next(err); }
});

leagueRouter.put('/:id/settings', requireCommissioner(), validate(draftSettingsSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await leagueService.upsertSettings(req.params.id, req.body));
  } catch (err) { next(err); }
});

leagueRouter.get('/:id/members', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await leagueService.listMembers(req.params.id));
  } catch (err) { next(err); }
});

leagueRouter.post('/:id/members/invite', requireCommissioner(), validate(inviteMemberSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const member = await leagueService.inviteMember(req.params.id, req.user!.sub, req.body);
    res.status(201).json(member);
  } catch (err) { next(err); }
});

leagueRouter.post('/:id/members/randomize-order', requireCommissioner(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await leagueService.randomizeDraftOrder(req.params.id));
  } catch (err) { next(err); }
});

leagueRouter.post('/:id/members/reorder', requireCommissioner(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await leagueService.reorderMembers(req.params.id, req.body.memberIds));
  } catch (err) { next(err); }
});

leagueRouter.post('/:id/members/self', requireCommissioner(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const member = await leagueService.selfJoin(req.params.id, req.user!.sub);
    res.status(201).json(member);
  } catch (err) { next(err); }
});

leagueRouter.patch('/:id/members/:memberId', requireCommissioner(), validate(setDraftPositionSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await leagueService.updateMemberPosition(req.params.id, req.params.memberId, req.body.draftPosition));
  } catch (err) { next(err); }
});

leagueRouter.delete('/:id/members/:memberId', requireCommissioner(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await leagueService.removeMember(req.params.id, req.params.memberId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

leagueRouter.get('/:id/members/:memberId/magic-link', requireCommissioner(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inviteToken = await leagueService.getMemberInviteToken(req.params.id, req.params.memberId);
    res.json({ inviteToken });
  } catch (err) { next(err); }
});

leagueRouter.post('/:id/members/:memberId/revoke', requireCommissioner(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await leagueService.revokeMember(req.params.id, req.params.memberId));
  } catch (err) { next(err); }
});

leagueRouter.post('/:id/join-code', requireCommissioner(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const league = await leagueService.upsertJoinCode(req.params.id);
    res.json({ joinCode: league.joinCode });
  } catch (err) { next(err); }
});
