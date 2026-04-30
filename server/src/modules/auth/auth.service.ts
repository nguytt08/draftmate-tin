import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../../db';
import { config } from '../../config';
import { AppError } from '../../middleware/errorHandler';
import type { RegisterInput, LoginInput } from './auth.schema';

const BCRYPT_ROUNDS = 12;

function generateAccessToken(userId: string, email: string, displayName: string): string {
  return jwt.sign({ sub: userId, email, displayName }, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
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

  const accessToken = generateAccessToken(user.id, user.email, user.displayName);
  return { accessToken, refreshToken: rawRefresh, user: { id: user.id, email: user.email, displayName: user.displayName } };
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

  const accessToken = generateAccessToken(user.id, user.email, user.displayName);
  return { accessToken, refreshToken: rawRefresh, user: { id: user.id, email: user.email, displayName: user.displayName } };
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

  const accessToken = generateAccessToken(record.userId, record.user.email, record.user.displayName);
  const user = { id: record.userId, email: record.user.email, displayName: record.user.displayName };
  return { accessToken, refreshToken: rawNewRefresh, user };
}

export async function logout(rawToken: string) {
  const hashed = hashToken(rawToken);
  await prisma.refreshToken.updateMany({
    where: { token: hashed, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function acceptInvite(token: string, password: string, displayName: string) {
  const member = await prisma.leagueMember.findUnique({ where: { inviteToken: token } });
  if (!member) throw new AppError(404, 'Invalid invite token');
  if (member.inviteStatus !== 'PENDING') throw new AppError(409, 'Invite already used');

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

  const accessToken = generateAccessToken(user.id, user.email, user.displayName);
  return { accessToken, refreshToken: rawRefresh, user: { id: user.id, email: user.email, displayName: user.displayName } };
}
