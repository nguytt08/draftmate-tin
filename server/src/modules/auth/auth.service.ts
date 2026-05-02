import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../../db';
import { config } from '../../config';
import { AppError } from '../../middleware/errorHandler';
import type { RegisterInput, LoginInput } from './auth.schema';

const BCRYPT_ROUNDS = 12;

function isAdminEmail(email: string): boolean {
  return config.ADMIN_EMAILS.split(',').map((e) => e.trim()).filter(Boolean).includes(email);
}

function generateAccessToken(userId: string, email: string, displayName: string, isAdmin = false): string {
  return jwt.sign(
    { sub: userId, email, displayName, ...(isAdmin && { isAdmin: true }) },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] },
  );
}

function generateRawRefreshToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function refreshTokenExpiry(): Date {
  const d = new Date();
  d.setDate(d.getDate() + config.REFRESH_TOKEN_EXPIRES_DAYS);
  return d;
}

export async function register(input: RegisterInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new AppError(409, 'Email already in use');

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      displayName: input.displayName,
      phone: input.phone,
    },
  });

  const rawRefresh = generateRawRefreshToken();
  await prisma.refreshToken.create({
    data: {
      token: hashToken(rawRefresh),
      userId: user.id,
      expiresAt: refreshTokenExpiry(),
    },
  });

  const accessToken = generateAccessToken(user.id, user.email, user.displayName, isAdminEmail(user.email));
  return { accessToken, refreshToken: rawRefresh, user: { id: user.id, email: user.email, displayName: user.displayName, isAdmin: isAdminEmail(user.email) } };
}

export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) throw new AppError(401, 'Invalid credentials');

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) throw new AppError(401, 'Invalid credentials');

  const rawRefresh = generateRawRefreshToken();
  await prisma.refreshToken.create({
    data: {
      token: hashToken(rawRefresh),
      userId: user.id,
      expiresAt: refreshTokenExpiry(),
    },
  });

  const memberWithToken = await prisma.leagueMember.findFirst({
    where: { userId: user.id, inviteToken: { not: null } },
    select: { inviteToken: true },
  });

  const admin = isAdminEmail(user.email);
  const accessToken = generateAccessToken(user.id, user.email, user.displayName, admin);
  return {
    accessToken,
    refreshToken: rawRefresh,
    recoveryToken: memberWithToken?.inviteToken ?? null,
    user: { id: user.id, email: user.email, displayName: user.displayName, isAdmin: admin },
  };
}

export async function refresh(rawToken: string) {
  const hashed = hashToken(rawToken);
  const record = await prisma.refreshToken.findUnique({ where: { token: hashed }, include: { user: true } });

  if (!record || record.revokedAt || record.expiresAt < new Date()) {
    throw new AppError(401, 'Invalid or expired refresh token');
  }

  // Rotate: revoke old, issue new
  const rawNewRefresh = generateRawRefreshToken();
  await prisma.$transaction([
    prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } }),
    prisma.refreshToken.create({
      data: {
        token: hashToken(rawNewRefresh),
        userId: record.userId,
        expiresAt: refreshTokenExpiry(),
      },
    }),
  ]);

  const admin = isAdminEmail(record.user.email);
  const accessToken = generateAccessToken(record.userId, record.user.email, record.user.displayName, admin);
  const user = { id: record.userId, email: record.user.email, displayName: record.user.displayName, isAdmin: admin };
  return { accessToken, refreshToken: rawNewRefresh, user };
}

export async function logout(rawToken: string) {
  const hashed = hashToken(rawToken);
  await prisma.refreshToken.updateMany({
    where: { token: hashed, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function magicLinkAccept(token: string, displayName?: string) {
  const member = await prisma.leagueMember.findUnique({
    where: { inviteToken: token },
    include: { user: true },
  });
  if (!member) throw new AppError(404, 'Invalid invite link');

  // Re-auth: already accepted — re-issue tokens for the linked user
  if (member.inviteStatus === 'ACCEPTED' && member.user) {
    const rawRefresh = generateRawRefreshToken();
    await prisma.refreshToken.create({
      data: { token: hashToken(rawRefresh), userId: member.user.id, expiresAt: refreshTokenExpiry() },
    });
    const accessToken = generateAccessToken(member.user.id, member.user.email, member.user.displayName, isAdminEmail(member.user.email));
    return { accessToken, refreshToken: rawRefresh, user: { id: member.user.id, email: member.user.email, displayName: member.user.displayName, isAdmin: isAdminEmail(member.user.email) } };
  }

  // First use: check expiry
  if (member.inviteExpiresAt && member.inviteExpiresAt < new Date()) {
    throw new AppError(410, 'This invite link has expired');
  }

  const resolvedName = displayName?.trim() || member.displayName || 'Drafter';

  // Use existing User if inviteEmail matches a registered account, otherwise create stub
  let user = member.inviteEmail
    ? await prisma.user.findUnique({ where: { email: member.inviteEmail } })
    : null;

  if (!user) {
    const placeholderEmail = member.inviteEmail ?? `guest_${member.id}@draftmate.internal`;
    const passwordHash = await bcrypt.hash(crypto.randomUUID(), BCRYPT_ROUNDS);
    user = await prisma.user.create({
      data: { email: placeholderEmail, passwordHash, displayName: resolvedName },
    });
  }

  // Link member — inviteToken stays set as persistent re-auth key
  await prisma.leagueMember.update({
    where: { id: member.id },
    data: { userId: user.id, displayName: resolvedName, inviteStatus: 'ACCEPTED' },
  });

  const rawRefresh = generateRawRefreshToken();
  await prisma.refreshToken.create({
    data: { token: hashToken(rawRefresh), userId: user.id, expiresAt: refreshTokenExpiry() },
  });

  const accessToken = generateAccessToken(user.id, user.email, user.displayName, isAdminEmail(user.email));
  return { accessToken, refreshToken: rawRefresh, user: { id: user.id, email: user.email, displayName: user.displayName, isAdmin: isAdminEmail(user.email) } };
}

export async function joinClaim(code: string, memberId: string, displayName?: string) {
  const league = await prisma.league.findUnique({
    where: { joinCode: code },
    select: { id: true, settings: true },
  });
  if (!league) throw new AppError(404, 'Join link not found');

  const member = await prisma.leagueMember.findUnique({
    where: { id: memberId },
    include: { user: true },
  });
  if (!member || member.leagueId !== league.id) throw new AppError(404, 'Member not found');

  if (member.inviteStatus === 'ACCEPTED') {
    if (!league.settings?.allowSelfReclaim) throw new AppError(409, 'This spot has already been claimed');
    // Protect real accounts — only guest stub accounts are reclaimable via the join page.
    // Real registered users (commissioner, email-invited) must sign in with their email.
    if (!member.user?.email.endsWith('@draftmate.internal')) {
      throw new AppError(403, 'This account is linked to a registered email. Sign in instead.');
    }
    // Self-reclaim: re-issue a fresh token and new auth for the existing user
    const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    const newInviteToken = Array.from(crypto.randomBytes(12)).map((b) => BASE62[b % 62]).join('');
    await prisma.leagueMember.update({ where: { id: member.id }, data: { inviteToken: newInviteToken } });
    const rawRefresh = generateRawRefreshToken();
    await prisma.refreshToken.create({
      data: { token: hashToken(rawRefresh), userId: member.user!.id, expiresAt: refreshTokenExpiry() },
    });
    const accessToken = generateAccessToken(member.user!.id, member.user!.email, member.user!.displayName, isAdminEmail(member.user!.email));
    return { accessToken, refreshToken: rawRefresh, inviteToken: newInviteToken, user: { id: member.user!.id, email: member.user!.email, displayName: member.user!.displayName, isAdmin: isAdminEmail(member.user!.email) } };
  }

  const resolvedName = displayName?.trim() || member.displayName || 'Drafter';

  let user = member.inviteEmail
    ? await prisma.user.findUnique({ where: { email: member.inviteEmail } })
    : null;

  if (!user) {
    const placeholderEmail = member.inviteEmail ?? `guest_${member.id}@draftmate.internal`;
    // Stub may already exist if this slot was previously claimed then revoked
    user = await prisma.user.findUnique({ where: { email: placeholderEmail } });
    if (!user) {
      const passwordHash = await bcrypt.hash(crypto.randomUUID(), BCRYPT_ROUNDS);
      user = await prisma.user.create({
        data: { email: placeholderEmail, passwordHash, displayName: resolvedName },
      });
    }
  }

  await prisma.leagueMember.update({
    where: { id: member.id },
    data: { userId: user.id, displayName: resolvedName, inviteStatus: 'ACCEPTED' },
  });

  const rawRefresh = generateRawRefreshToken();
  await prisma.refreshToken.create({
    data: { token: hashToken(rawRefresh), userId: user.id, expiresAt: refreshTokenExpiry() },
  });

  const accessToken = generateAccessToken(user.id, user.email, user.displayName, isAdminEmail(user.email));
  return { accessToken, refreshToken: rawRefresh, inviteToken: member.inviteToken, user: { id: user.id, email: user.email, displayName: user.displayName, isAdmin: isAdminEmail(user.email) } };
}

export async function acceptInvite(token: string, password: string, displayName: string) {
  const member = await prisma.leagueMember.findUnique({ where: { inviteToken: token } });
  if (!member) throw new AppError(404, 'Invalid invite token');
  if (member.inviteStatus !== 'PENDING') throw new AppError(409, 'Invite already used');

  if (!member.inviteEmail) throw new AppError(400, 'This invite has no email address — use a magic link to join');

  let user = await prisma.user.findUnique({ where: { email: member.inviteEmail } });
  if (!user) {
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    user = await prisma.user.create({
      data: { email: member.inviteEmail, passwordHash, displayName },
    });
  }

  await prisma.leagueMember.update({
    where: { id: member.id },
    data: { userId: user.id, inviteToken: null, inviteStatus: 'ACCEPTED' },
  });

  const rawRefresh = generateRawRefreshToken();
  await prisma.refreshToken.create({
    data: { token: hashToken(rawRefresh), userId: user.id, expiresAt: refreshTokenExpiry() },
  });

  const accessToken = generateAccessToken(user.id, user.email, user.displayName, isAdminEmail(user.email));
  return { accessToken, refreshToken: rawRefresh, user: { id: user.id, email: user.email, displayName: user.displayName, isAdmin: isAdminEmail(user.email) } };
}

export async function listAllUsers() {
  return prisma.user.findMany({
    where: { NOT: { email: { endsWith: '@draftmate.internal' } } },
    select: {
      id: true,
      email: true,
      displayName: true,
      createdAt: true,
      _count: { select: { leagues: true, memberships: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function impersonateUser(targetUserId: string) {
  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target) throw new AppError(404, 'User not found');
  const accessToken = jwt.sign(
    { sub: target.id, email: target.email, displayName: target.displayName },
    config.JWT_SECRET,
    { expiresIn: '24h' },
  );
  return { accessToken, user: { id: target.id, email: target.email, displayName: target.displayName } };
}
