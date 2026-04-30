import { PrismaClient } from '@prisma/client';
import { AppError } from '../../middleware/errorHandler';
import { createDraftStrategy } from './DraftStrategyFactory';
import type { Server as SocketServer } from 'socket.io';

export class DraftEngine {
  constructor(
    private prisma: PrismaClient,
    private io: SocketServer,
  ) {}

  async startDraft(leagueId: string, commissionerId: string) {
    const league = await this.prisma.league.findUnique({
      where: { id: leagueId },
      include: {
        settings: true,
        members: { orderBy: { draftPosition: 'asc' } },
        items: true,
        draft: true,
      },
    });

    if (!league) throw new AppError(404, 'League not found');
    if (league.commissionerId !== commissionerId) throw new AppError(403, 'Commissioner only');
    if (!league.settings) {
      await this.prisma.draftSettings.create({
        data: { leagueId, format: 'SNAKE', totalRounds: 15, pickTimerSeconds: 43200, autoPick: 'RANDOM' },
      });
      league.settings = await this.prisma.draftSettings.findUniqueOrThrow({ where: { leagueId } });
    }
    if (league.draft?.status === 'ACTIVE') throw new AppError(409, 'Draft already active');

    const acceptedMembers = league.members.filter((m) => m.inviteStatus === 'ACCEPTED');
    if (acceptedMembers.length < 1) throw new AppError(400, 'Need at least 1 accepted member');

    // Auto-assign positions if none are set yet (common for solo testing)
    const withPosition = acceptedMembers.filter((m) => m.draftPosition !== null);
    if (withPosition.length === 0) {
      await Promise.all(
        acceptedMembers.map((m, i) =>
          this.prisma.leagueMember.update({ where: { id: m.id }, data: { draftPosition: i + 1 } }),
        ),
      );
      acceptedMembers.forEach((m, i) => { m.draftPosition = i + 1; });
    } else if (withPosition.length !== acceptedMembers.length) {
      throw new AppError(400, 'All members must have a draft position set — use Randomize Draft Order');
    }

    const totalPicks = league.settings.totalRounds * acceptedMembers.length;
    if (league.items.length < totalPicks) {
      throw new AppError(400, `Need at least ${totalPicks} items in the pool for ${league.settings.totalRounds} rounds`);
    }

    const strategy = createDraftStrategy(league.settings.format);
    const firstMemberIndex = strategy.getMemberIndexForPick(1, acceptedMembers.length);
    const firstMember = acceptedMembers[firstMemberIndex];

    const timerEndsAt = new Date(Date.now() + league.settings.pickTimerSeconds * 1000);

    const draft = await this.prisma.draft.upsert({
      where: { leagueId },
      create: {
        leagueId,
        status: 'ACTIVE',
        currentPickNumber: 1,
        currentRound: 1,
        currentMemberId: firstMember.id,
        startedAt: new Date(),
      },
      update: {
        status: 'ACTIVE',
        currentPickNumber: 1,
        currentRound: 1,
        currentMemberId: firstMember.id,
        startedAt: new Date(),
        completedAt: null,
      },
    });

    // Emit to room
    const state = await this.getDraftState(draft.id);
    this.io.to(`draft:${draft.id}`).emit('draft:state', state);

    // Schedule timer (imported lazily to avoid circular deps)
    const { timerService } = await import('../timer/timer.service');
    await timerService.schedulePickTimer(draft.id, 1, league.settings.pickTimerSeconds);

    // Notify first member
    const { notificationService } = await import('../notification/notification.service');
    await notificationService.notifyYourTurn(firstMember.id, league, draft, 1, timerEndsAt);

    return draft;
  }

  async submitPick(draftId: string, memberId: string, itemId: string) {
    // Fetch draft with settings & members inside a serializable transaction
    const result = await this.prisma.$transaction(
      async (tx) => {
        // Lock draft row
        const drafts = await tx.$queryRaw<{ id: string; currentPickNumber: number; currentMemberId: string; status: string; leagueId: string }[]>`
          SELECT id, "currentPickNumber", "currentMemberId", status, "leagueId"
          FROM "Draft" WHERE id = ${draftId} FOR UPDATE
        `;
        const draft = drafts[0];
        if (!draft) throw new AppError(404, 'Draft not found');
        if (draft.status !== 'ACTIVE') throw new AppError(409, 'Draft is not active');
        if (draft.currentMemberId !== memberId) throw new AppError(403, 'Not your turn');

        // Lock the item row
        const items = await tx.$queryRaw<{ id: string; isAvailable: boolean; leagueId: string; bucket: string | null }[]>`
          SELECT id, "isAvailable", "leagueId", bucket FROM "DraftItem" WHERE id = ${itemId} FOR UPDATE
        `;
        const item = items[0];
        if (!item || item.leagueId !== (await tx.league.findUniqueOrThrow({ where: { id: draft.leagueId } })).id) {
          throw new AppError(404, 'Item not found');
        }
        if (!item.isAvailable) throw new AppError(409, 'ITEM_ALREADY_PICKED');

        const league = await tx.league.findUniqueOrThrow({
          where: { id: draft.leagueId },
          include: {
            settings: true,
            members: { where: { inviteStatus: 'ACCEPTED' }, orderBy: { draftPosition: 'asc' } },
          },
        });

        // Bucket picking enforcement
        if (league.settings?.enforceBucketPicking && item.bucket) {
          const existingBucketPick = await tx.pick.findFirst({
            where: { draftId, memberId, item: { bucket: item.bucket } },
          });
          if (existingBucketPick) {
            throw new AppError(409, `You already have a pick from the "${item.bucket}" bucket`);
          }
        }

        const settings = league.settings!;
        const members = league.members;
        const strategy = createDraftStrategy(settings.format);
        const currentPickNumber = draft.currentPickNumber;

        const memberRecord = await tx.leagueMember.findUniqueOrThrow({ where: { id: memberId } });

        // Record the pick
        const pick = await tx.pick.create({
          data: {
            draftId,
            memberId,
            userId: memberRecord.userId,
            itemId,
            pickNumber: currentPickNumber,
            round: strategy.getRoundForPick(currentPickNumber, members.length),
            positionInRound: strategy.getPositionInRound(currentPickNumber, members.length),
            isAutoPick: false,
          },
        });

        // Mark item as picked
        await tx.draftItem.update({ where: { id: itemId }, data: { isAvailable: false } });

        const nextPickNumber = currentPickNumber + 1;
        const complete = strategy.isComplete(nextPickNumber, settings.totalRounds, members.length);

        let nextMemberId: string | null = null;
        if (!complete) {
          const nextMemberIndex = strategy.getMemberIndexForPick(nextPickNumber, members.length);
          nextMemberId = members[nextMemberIndex].id;
        }

        // Advance draft state
        await tx.draft.update({
          where: { id: draftId },
          data: {
            currentPickNumber: nextPickNumber,
            currentRound: strategy.getRoundForPick(nextPickNumber, members.length),
            currentMemberId: nextMemberId,
            status: complete ? 'COMPLETED' : 'ACTIVE',
            completedAt: complete ? new Date() : null,
          },
        });

        return { pick, complete, nextMemberId, nextPickNumber, settings, league };
      },
      { isolationLevel: 'Serializable' as const },
    );

    // Cancel current timer
    const { timerService } = await import('../timer/timer.service');
    await timerService.cancelPickTimer(draftId, result.pick.pickNumber);

    // Emit events
    const state = await this.getDraftState(draftId);
    const timerEndsAt = result.complete
      ? null
      : new Date(Date.now() + result.settings.pickTimerSeconds * 1000);

    this.io.to(`draft:${draftId}`).emit('draft:pick_made', {
      pick: result.pick,
      nextMemberId: result.nextMemberId,
      nextPickNumber: result.nextPickNumber,
      timerEndsAt: timerEndsAt?.toISOString() ?? null,
      complete: result.complete,
    });

    if (result.complete) {
      this.io.to(`draft:${draftId}`).emit('draft:completed', { completedAt: new Date().toISOString() });
    } else {
      // Schedule next timer
      await timerService.schedulePickTimer(draftId, result.nextPickNumber, result.settings.pickTimerSeconds);

      // Notify next member
      if (result.nextMemberId) {
        const { notificationService } = await import('../notification/notification.service');
        await notificationService.notifyYourTurn(
          result.nextMemberId,
          result.league,
          state.draft,
          result.nextPickNumber,
          timerEndsAt!,
        );
      }
    }

    return state;
  }

  async pauseDraft(leagueId: string, commissionerId: string) {
    const league = await this.prisma.league.findUnique({ where: { id: leagueId } });
    if (!league || league.commissionerId !== commissionerId) throw new AppError(403, 'Commissioner only');

    const draft = await this.prisma.draft.findUnique({ where: { leagueId } });
    if (!draft || draft.status !== 'ACTIVE') throw new AppError(409, 'Draft is not active');

    await this.prisma.draft.update({ where: { id: draft.id }, data: { status: 'PAUSED' } });
    const { timerService } = await import('../timer/timer.service');
    await timerService.cancelPickTimer(draft.id, draft.currentPickNumber);

    this.io.to(`draft:${draft.id}`).emit('draft:paused', { pausedAt: new Date().toISOString() });
    return draft;
  }

  async resumeDraft(leagueId: string, commissionerId: string) {
    const league = await this.prisma.league.findUnique({
      where: { id: leagueId },
      include: { settings: true },
    });
    if (!league || league.commissionerId !== commissionerId) throw new AppError(403, 'Commissioner only');

    const draft = await this.prisma.draft.findUnique({ where: { leagueId } });
    if (!draft || draft.status !== 'PAUSED') throw new AppError(409, 'Draft is not paused');

    await this.prisma.draft.update({ where: { id: draft.id }, data: { status: 'ACTIVE' } });

    const timerSeconds = league.settings!.pickTimerSeconds;
    const timerEndsAt = new Date(Date.now() + timerSeconds * 1000);
    const { timerService } = await import('../timer/timer.service');
    await timerService.schedulePickTimer(draft.id, draft.currentPickNumber, timerSeconds);

    this.io.to(`draft:${draft.id}`).emit('draft:resumed', {
      resumedAt: new Date().toISOString(),
      timerEndsAt: timerEndsAt.toISOString(),
    });
    return draft;
  }

  async getDraftState(draftId: string) {
    const draft = await this.prisma.draft.findUniqueOrThrow({
      where: { id: draftId },
      include: {
        picks: { include: { item: true, member: true }, orderBy: { pickNumber: 'asc' } },
        league: {
          include: {
            settings: true,
            members: { where: { inviteStatus: 'ACCEPTED' }, orderBy: { draftPosition: 'asc' } },
            items: { where: { isAvailable: true }, orderBy: { name: 'asc' } },
          },
        },
        timerJobs: { where: { status: 'ACTIVE' } },
      },
    });

    const activeTimer = draft.timerJobs[0];

    return {
      draft: {
        id: draft.id,
        status: draft.status,
        currentPickNumber: draft.currentPickNumber,
        currentRound: draft.currentRound,
        currentMemberId: draft.currentMemberId,
        timerEndsAt: activeTimer?.scheduledFor?.toISOString() ?? null,
        startedAt: draft.startedAt?.toISOString() ?? null,
        completedAt: draft.completedAt?.toISOString() ?? null,
      },
      picks: draft.picks,
      availableItems: draft.league.items,
      members: draft.league.members,
      settings: draft.league.settings,
    };
  }
}
