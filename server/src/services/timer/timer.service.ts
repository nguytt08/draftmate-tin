import { Queue } from 'bullmq';
import { redis } from '../../redis';
import { prisma } from '../../db';

export interface PickTimerJobData {
  draftId: string;
  pickNumber: number;
  memberId: string;
}

export const pickTimerQueue = new Queue<PickTimerJobData>('pick-timer', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: 50,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  },
});

class TimerService {
  async schedulePickTimer(draftId: string, pickNumber: number, delaySecs: number): Promise<void> {
    const draft = await prisma.draft.findUnique({
      where: { id: draftId },
      select: { currentMemberId: true },
    });
    if (!draft?.currentMemberId) return;

    const jobId = `pick-timer:${draftId}:${pickNumber}`;
    const scheduledFor = new Date(Date.now() + delaySecs * 1000);

    await pickTimerQueue.add(
      'auto-pick',
      { draftId, pickNumber, memberId: draft.currentMemberId },
      { jobId, delay: delaySecs * 1000 },
    );

    await prisma.pickTimerJob.upsert({
      where: { draftId_pickNumber: { draftId, pickNumber } },
      create: {
        draftId,
        bullJobId: jobId,
        pickNumber,
        scheduledFor,
        status: 'ACTIVE',
      },
      update: {
        bullJobId: jobId,
        scheduledFor,
        status: 'ACTIVE',
      },
    });
  }

  async cancelPickTimer(draftId: string, pickNumber: number): Promise<void> {
    const jobId = `pick-timer:${draftId}:${pickNumber}`;
    try {
      const job = await pickTimerQueue.getJob(jobId);
      if (job) await job.remove();
    } catch {
      // Job may already be processing or completed — not an error
    }
    await prisma.pickTimerJob.updateMany({
      where: { draftId, pickNumber, status: 'ACTIVE' },
      data: { status: 'CANCELLED' },
    });
  }
}

export const timerService = new TimerService();
