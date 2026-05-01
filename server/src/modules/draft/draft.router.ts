import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requireCommissioner } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { submitPickSchema } from './draft.schema';
import { prisma } from '../../db';
import { AppError } from '../../middleware/errorHandler';
import { io } from '../../index';
import { DraftEngine } from '../../services/draft-engine/DraftEngine';

export const draftRouter = Router();

draftRouter.use(requireAuth);

function getEngine() {
  return new DraftEngine(prisma, io);
}

// Start draft
draftRouter.post('/:id/draft/start', requireCommissioner(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const draft = await getEngine().startDraft(req.params.id, req.user!.sub, req.body.force === true);
    res.json(draft);
  } catch (err) { next(err); }
});

// Pause/resume
draftRouter.post('/:id/draft/pause', requireCommissioner(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const action = req.query.action === 'resume' ? 'resume' : 'pause';
    const engine = getEngine();
    const draft = action === 'pause'
      ? await engine.pauseDraft(req.params.id, req.user!.sub)
      : await engine.resumeDraft(req.params.id, req.user!.sub);
    res.json(draft);
  } catch (err) { next(err); }
});

// Get draft state
draftRouter.get('/:id/draft', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const draft = await prisma.draft.findUnique({ where: { leagueId: req.params.id } });
    if (!draft) throw new AppError(404, 'Draft not found');
    const state = await getEngine().getDraftState(draft.id);
    res.json(state);
  } catch (err) { next(err); }
});

// Get draft board (picks + order ahead)
draftRouter.get('/:id/draft/board', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const draft = await prisma.draft.findUnique({ where: { leagueId: req.params.id } });
    if (!draft) throw new AppError(404, 'Draft not found');
    const state = await getEngine().getDraftState(draft.id);
    res.json(state);
  } catch (err) { next(err); }
});

// Commissioner override: pick on behalf of whoever's current member
draftRouter.post('/:id/draft/picks/override', requireCommissioner(), validate(submitPickSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const draft = await prisma.draft.findUnique({ where: { leagueId: req.params.id } });
    if (!draft) throw new AppError(404, 'Draft not found');
    if (!draft.currentMemberId) throw new AppError(400, 'No active pick in progress');
    const state = await getEngine().submitPick(draft.id, draft.currentMemberId, req.body.itemId, true);
    res.json(state);
  } catch (err) { next(err); }
});

// Submit a pick
draftRouter.post('/:id/draft/picks', validate(submitPickSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const draft = await prisma.draft.findUnique({ where: { leagueId: req.params.id } });
    if (!draft) throw new AppError(404, 'Draft not found');

    // Verify the requesting user belongs to this draft as the current member
    const member = await prisma.leagueMember.findFirst({
      where: { leagueId: req.params.id, userId: req.user!.sub },
    });
    if (!member) throw new AppError(403, 'You are not a member of this league');

    const state = await getEngine().submitPick(draft.id, member.id, req.body.itemId);
    res.json(state);
  } catch (err) { next(err); }
});

// Reset draft — wipe all picks and restart from pick 1 (commissioner only)
draftRouter.post('/:id/draft/reset', requireCommissioner(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const league = await prisma.league.findUnique({
      where: { id: req.params.id },
      include: {
        draft: true,
        settings: true,
        members: { where: { inviteStatus: { not: 'DECLINED' } }, orderBy: { draftPosition: 'asc' } },
      },
    });
    if (!league?.draft) throw new AppError(404, 'Draft not found');

    const draft = league.draft;
    const { timerService } = await import('../../services/timer/timer.service');

    // Cancel all active BullMQ timer jobs for this draft
    const activeJobs = await prisma.pickTimerJob.findMany({
      where: { draftId: draft.id, status: 'ACTIVE' },
    });
    await Promise.all(activeJobs.map((j) => timerService.cancelPickTimer(draft.id, j.pickNumber)));

    // Wipe picks and reset items + draft state in one transaction
    await prisma.$transaction([
      prisma.pick.deleteMany({ where: { draftId: draft.id } }),
      prisma.draftItem.updateMany({ where: { leagueId: req.params.id }, data: { isAvailable: true } }),
      prisma.draft.update({
        where: { id: draft.id },
        data: {
          status: 'ACTIVE',
          currentPickNumber: 1,
          currentRound: 1,
          currentMemberId: league.members[0]?.id ?? null,
          completedAt: null,
        },
      }),
    ]);

    // Schedule a fresh timer for pick 1
    if (league.members.length > 0 && league.settings) {
      await timerService.schedulePickTimer(draft.id, 1, league.settings.pickTimerSeconds);
    }

    const state = await getEngine().getDraftState(draft.id);
    io.to(`draft:${draft.id}`).emit('draft:state', state);
    res.json(state);
  } catch (err) { next(err); }
});

// List picks
draftRouter.get('/:id/draft/picks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const draft = await prisma.draft.findUnique({ where: { leagueId: req.params.id } });
    if (!draft) throw new AppError(404, 'Draft not found');
    const picks = await prisma.pick.findMany({
      where: { draftId: draft.id },
      include: { item: true, member: true },
      orderBy: { pickNumber: 'asc' },
    });
    res.json(picks);
  } catch (err) { next(err); }
});
