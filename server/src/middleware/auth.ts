import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../db';

export interface JwtPayload {
  sub: string;
  email: string;
  displayName: string;
  isAdmin?: boolean;
  iat: number;
  exp: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as JwtPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Token expired or invalid' });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user?.isAdmin) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

export function requireCommissioner(leagueIdParam = 'id') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const leagueId = req.params[leagueIdParam];
    const league = await prisma.league.findUnique({ where: { id: leagueId } });
    if (!league) {
      res.status(404).json({ error: 'League not found' });
      return;
    }
    if (league.commissionerId !== req.user!.sub) {
      res.status(403).json({ error: 'Commissioner access required' });
      return;
    }
    next();
  };
}
