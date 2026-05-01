import { Worker, Job } from 'bullmq';
import { Prisma } from '@prisma/client';
import { redis } from '../redis';
import { prisma } from '../db';
import { createDraftStrategy } from '../services/draft-engine/DraftStrategyFactory';
import { DraftEngine } from '../services/draft-engine/DraftEngine';
import { notificationService } from '../services/notification/notification.service';
import { timerService, type PickTimerJobData } from '../services/timer/timer.service';

export function createPickTimerWorker(io: import('socket.io').Server) {
  return new Worker<PickTimerJobData>(
    'pick-timer',
    async (job: Job<PickTimerJobData>) => {
      const { draftId, pickNumber } = job.data;

      // Guard: verify timer job is still active in DB
      const timerJob = await prisma.pickTimerJob.findUnique({
        where: { draftId_pickNumber: { draftId, pickNumber } },
      });
      if (!timerJob || timerJob.status !== 'ACTIVE') {
        console.log(`[Timer] Job for draft ${draftId} pick ${pickNumber} already cancelled — skipping`);
        return;
      }

      const result = await prisma.$transaction(
        async (tx) => {
          // Lock the draft row
          const drafts = await tx.$queryRaw<{ id: string; currentPickNumber: number; currentMemberId: string; status: string; leagueId: string }[]>`
            SELECT id, "currentPickNumber", "currentMemberId", status, "leagueId"
            FROM "Draft" WHERE id = ${draftId} FOR UPDATE
          `;
          const draft = drafts[0];
          if (!draft || draft.status !== 'ACTIVE') return null;

          // Guard: pick must still be the current one
          if (draft.currentPickNumber !== pickNumber) {
            console.log(`[Timer] Pick already advanced — expected ${pickNumber}, got ${draft.currentPickNumber}`);
            return null;
          }

          const league = await tx.league.findUniqueOrThrow({
            where: { id: draft.leagueId },
            include: {
              settings: true,
              members: { where: { inviteStatus: { not: 'DECLINED' } }, orderBy: { draftPosition: 'asc' } },
            },
          });

          const settings = league.settings!;
          const members = league.members;
          const strategy = createDraftStrategy(settings.format);

          if (settings.autoPick === 'COMMISSIONER_PICK') {
            await tx.pickTimerJob.update({
              where: { id: timerJob.id },
              data: { status: 'FIRED' },
            });
            return { commissionerPickRequired: true } as const;
          }

          // Pick a random available item
          const availableItems = await tx.draftItem.findMany({
            where: { leagueId: league.id, isAvailable: true },
          });

          if (availableItems.length === 0) return null;

          let chosenItem = availableItems[Math.floor(Math.random() * availableItems.length)];

          if (settings.autoPick === 'SKIP') {
            // Record a placeholder pick with no item — not supported in current schema.
            // For now, fall back to RANDOM behavior.
            chosenItem = availableItems[0];
          }

          const memberRecord = members.find((m) => m.id === draft.currentMemberId)!;

          const pick = await tx.pick.create({
            data: {
              draftId,
              memberId: draft.currentMemberId,
              userId: memberRecord.userId,
              itemId: chosenItem.id,
              pickNumber,
              round: strategy.getRoundForPick(pickNumber, members.length),
              positionInRound: strategy.getPositionInRound(pickNumber, members.length),
              isAutoPick: true,
            },
          });

          await tx.draftItem.update({ where: { id: chosenItem.id }, data: { isAvailable: false } });

          const nextPickNumber = pickNumber + 1;
          const complete = strategy.isComplete(nextPickNumber, settings.totalRounds, members.length);

          let nextMemberId: string | null = null;
          if (!complete) {
            const nextMemberIndex = strategy.getMemberIndexForPick(nextPickNumber, members.length);
            nextMemberId = members[nextMemberIndex].id;
          }

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

          await tx.pickTimerJob.update({
            where: { id: timerJob.id },
            data: { status: 'FIRED' },
          });

          return { pick, complete, nextMemberId, nextPickNumber, settings, league };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      if (!result) return;

      if ('commissionerPickRequired' in result) {
        const engine = new DraftEngine(prisma, io);
        const state = await engine.getDraftState(draftId);
        io.of('/draft').to(`draft:${draftId}`).emit('draft:state', state);
        io.of('/draft').to(`draft:${draftId}`).emit('draft:commissioner_pick_required', { draftId, pickNumber });
        return;
      }

      const { pick, complete, nextMemberId, nextPickNumber, settings, league } = result;

      const engine = new DraftEngine(prisma, io);
      const state = await engine.getDraftState(draftId);
      io.of('/draft').to(`draft:${draftId}`).emit('draft:state', state);

      io.of('/draft').to(`draft:${draftId}`).emit('draft:auto_pick', {
        pick,
        reason: 'timer_expired',
        nextMemberId,
        nextPickNumber,
        complete,
      });

      if (complete) {
        io.of('/draft').to(`draft:${draftId}`).emit('draft:completed', { completedAt: new Date().toISOString() });
      } else if (nextMemberId) {
        const timerEndsAt = new Date(Date.now() + settings.pickTimerSeconds * 1000);
        await timerService.schedulePickTimer(draftId, nextPickNumber, settings.pickTimerSeconds);
        await notificationService.notifyYourTurn(nextMemberId, league, { id: draftId }, nextPickNumber, timerEndsAt);
      }
    },
    { connection: redis, concurrency: 5 },
  );
}
