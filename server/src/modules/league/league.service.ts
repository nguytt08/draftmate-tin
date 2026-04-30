import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db';
import { AppError } from '../../middleware/errorHandler';
import { notificationService } from '../../services/notification/notification.service';
import type { z } from 'zod';
import type {
  createLeagueSchema,
  updateLeagueSchema,
  draftSettingsSchema,
  inviteMemberSchema,
} from './league.schema';

type CreateLeagueInput = z.infer<typeof createLeagueSchema>;
type UpdateLeagueInput = z.infer<typeof updateLeagueSchema>;
type DraftSettingsInput = z.infer<typeof draftSettingsSchema>;
type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export async function createLeague(commissionerId: string, input: CreateLeagueInput) {
  const league = await prisma.league.create({
    data: {
      ...input,
      commissionerId,
      members: {
        create: {
          inviteEmail: '',
          inviteStatus: 'ACCEPTED',
          userId: commissionerId,
          draftPosition: null,
          notifyEmail: true,
        },
      },
    },
    include: { members: true },
  });

  // Fix commissioner member's inviteEmail
  const user = await prisma.user.findUniqueOrThrow({ where: { id: commissionerId } });
  await prisma.leagueMember.updateMany({
    where: { leagueId: league.id, userId: commissionerId },
    data: { inviteEmail: user.email },
  });

  return league;
}

export async function getLeague(leagueId: string) {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: { settings: true, members: { include: { user: true } }, draft: true },
  });
  if (!league) throw new AppError(404, 'League not found');
  return league;
}

export async function listLeagues(userId: string) {
  return prisma.league.findMany({
    where: { members: { some: { userId } } },
    include: { settings: true, _count: { select: { members: true, items: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function updateLeague(leagueId: string, input: UpdateLeagueInput) {
  return prisma.league.update({ where: { id: leagueId }, data: input });
}

export async function upsertSettings(leagueId: string, input: DraftSettingsInput) {
  const data = {
    format: input.format,
    totalRounds: input.totalRounds,
    pickTimerSeconds: input.pickTimerSeconds,
    autoPick: input.autoPick,
    allowTrading: input.allowTrading,
    extendedConfig: input.extendedConfig as Prisma.InputJsonValue | undefined,
  };
  return prisma.draftSettings.upsert({
    where: { leagueId },
    create: { leagueId, ...data },
    update: data,
  });
}

export async function listMembers(leagueId: string) {
  return prisma.leagueMember.findMany({
    where: { leagueId },
    include: { user: { select: { id: true, email: true, displayName: true } } },
    orderBy: { draftPosition: 'asc' },
  });
}

export async function inviteMember(leagueId: string, commissionerId: string, input: InviteMemberInput) {
  const league = await prisma.league.findUniqueOrThrow({ where: { id: leagueId } });

  const existing = await prisma.leagueMember.findFirst({
    where: { leagueId, inviteEmail: input.email },
  });
  if (existing) throw new AppError(409, 'Member already invited');

  const inviteToken = crypto.randomBytes(24).toString('hex');
  const member = await prisma.leagueMember.create({
    data: {
      leagueId,
      inviteEmail: input.email,
      inviteToken,
      notifyPhone: input.notifyPhone,
    },
  });

  await notificationService.notify({
    toEmail: input.email,
    toPhone: input.notifyPhone,
    type: 'INVITE',
    data: {
      leagueName: league.name,
      inviteToken,
      commissionerName: (await prisma.user.findUniqueOrThrow({ where: { id: commissionerId } })).displayName,
    },
  });

  return member;
}

export async function removeMember(leagueId: string, memberId: string) {
  const member = await prisma.leagueMember.findUnique({ where: { id: memberId } });
  if (!member || member.leagueId !== leagueId) throw new AppError(404, 'Member not found');
  await prisma.leagueMember.delete({ where: { id: memberId } });
}

export async function updateMemberPosition(leagueId: string, memberId: string, draftPosition: number) {
  const member = await prisma.leagueMember.findUnique({ where: { id: memberId } });
  if (!member || member.leagueId !== leagueId) throw new AppError(404, 'Member not found');
  return prisma.leagueMember.update({ where: { id: memberId }, data: { draftPosition } });
}

export async function randomizeDraftOrder(leagueId: string) {
  const members = await prisma.leagueMember.findMany({ where: { leagueId } });
  const shuffled = [...members].sort(() => Math.random() - 0.5);
  await Promise.all(
    shuffled.map((m, i) =>
      prisma.leagueMember.update({ where: { id: m.id }, data: { draftPosition: i + 1 } }),
    ),
  );
  return prisma.leagueMember.findMany({ where: { leagueId }, orderBy: { draftPosition: 'asc' } });
}
