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
      settings: {
        create: {
          format: 'SNAKE',
          totalRounds: 3,
          pickTimerSeconds: 7200,
          autoPick: 'COMMISSIONER_PICK',
        },
      },
    },
    include: { members: true },
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
    where: { OR: [{ members: { some: { userId } } }, { commissionerId: userId }] },
    include: {
      settings: true,
      draft: true,
      members: { where: { userId }, select: { id: true } },
      _count: { select: { members: true, items: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getMemberInviteToken(leagueId: string, memberId: string) {
  const member = await prisma.leagueMember.findUnique({
    where: { id: memberId },
    select: { inviteToken: true, leagueId: true },
  });
  if (!member || member.leagueId !== leagueId) throw new AppError(404, 'Member not found');
  if (!member.inviteToken) throw new AppError(400, 'This member has no personal invite link');
  return member.inviteToken;
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
    enforceBucketPicking: input.enforceBucketPicking,
    allowSelfReclaim: input.allowSelfReclaim,
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

  if (input.email) {
    const existing = await prisma.leagueMember.findFirst({
      where: { leagueId, inviteEmail: input.email },
    });
    if (existing) throw new AppError(409, 'Member already invited');
  }

  const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const inviteToken = Array.from(crypto.randomBytes(12)).map((b) => BASE62[b % 62]).join('');
  const inviteExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const member = await prisma.leagueMember.create({
    data: {
      leagueId,
      inviteEmail: input.email ?? null,
      displayName: input.displayName,
      inviteToken,
      inviteExpiresAt,
      notifyPhone: input.notifyPhone,
    },
  });

  if (input.email) {
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
  }

  return member;
}

const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export async function upsertJoinCode(leagueId: string) {
  const joinCode = Array.from(crypto.randomBytes(8)).map((b) => BASE62[b % 62]).join('');
  return prisma.league.update({ where: { id: leagueId }, data: { joinCode } });
}

export async function getLeagueByJoinCode(code: string) {
  const league = await prisma.league.findUnique({
    where: { joinCode: code },
    select: {
      id: true,
      name: true,
      settings: { select: { allowSelfReclaim: true } },
      members: {
        where: { inviteStatus: { not: 'DECLINED' } },
        select: {
          id: true,
          displayName: true,
          inviteEmail: true,
          inviteStatus: true,
          user: { select: { email: true } },
        },
        orderBy: { draftPosition: 'asc' },
      },
    },
  });
  if (!league) throw new AppError(404, 'Join link not found or expired');
  const allowSelfReclaim = league.settings?.allowSelfReclaim ?? false;

  const members = league.members
    .filter((m) => m.inviteStatus === 'PENDING' || (m.inviteStatus === 'ACCEPTED' && allowSelfReclaim))
    .map(({ user, ...m }) => ({
      ...m,
      // Guests (stub accounts with no real email) can be reclaimed; real accounts must sign in
      reclaimable: m.inviteStatus === 'PENDING' || (user?.email.endsWith('@draftmate.internal') ?? false),
    }));

  return { id: league.id, name: league.name, allowSelfReclaim, members };
}

export async function revokeMember(leagueId: string, memberId: string) {
  const member = await prisma.leagueMember.findUnique({ where: { id: memberId } });
  if (!member || member.leagueId !== leagueId) throw new AppError(404, 'Member not found');
  if (member.inviteStatus !== 'ACCEPTED') throw new AppError(409, 'Member has not accepted yet');
  // Reset slot to claimable — clears the linked user and nulls the token so the old magic link can't re-auth
  return prisma.leagueMember.update({
    where: { id: member.id },
    data: { userId: null, inviteStatus: 'PENDING', inviteToken: null },
  });
}

export async function removeMember(leagueId: string, memberId: string) {
  const member = await prisma.leagueMember.findUnique({ where: { id: memberId } });
  if (!member || member.leagueId !== leagueId) throw new AppError(404, 'Member not found');
  await prisma.$transaction([
    prisma.pick.deleteMany({ where: { memberId } }),
    prisma.leagueMember.delete({ where: { id: memberId } }),
  ]);
}

export async function updateMemberPosition(leagueId: string, memberId: string, draftPosition: number) {
  const member = await prisma.leagueMember.findUnique({ where: { id: memberId } });
  if (!member || member.leagueId !== leagueId) throw new AppError(404, 'Member not found');
  return prisma.leagueMember.update({ where: { id: memberId }, data: { draftPosition } });
}

export async function deleteLeague(leagueId: string) {
  await prisma.league.delete({ where: { id: leagueId } });
}

export async function selfJoin(leagueId: string, userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const inviteToken = Array.from(crypto.randomBytes(12)).map((b) => BASE62[b % 62]).join('');
  return prisma.leagueMember.create({
    data: {
      leagueId,
      userId,
      inviteEmail: user.email,
      displayName: user.displayName,
      inviteStatus: 'ACCEPTED',
      inviteToken,
      notifyEmail: true,
    },
  });
}

export async function randomizeDraftOrder(leagueId: string) {
  const members = await prisma.leagueMember.findMany({ where: { leagueId } });
  const shuffled = [...members].sort(() => Math.random() - 0.5);
  // Clear all positions first to avoid @@unique([leagueId, draftPosition]) conflicts
  await prisma.$transaction(
    members.map((m) => prisma.leagueMember.update({ where: { id: m.id }, data: { draftPosition: null } })),
  );
  // Then assign new shuffled positions sequentially
  await prisma.$transaction(
    shuffled.map((m, i) => prisma.leagueMember.update({ where: { id: m.id }, data: { draftPosition: i + 1 } })),
  );
  return prisma.leagueMember.findMany({ where: { leagueId }, orderBy: { draftPosition: 'asc' } });
}
