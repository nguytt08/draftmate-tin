import { Router, Request, Response, NextFunction } from 'express';
import { validate } from '../../middleware/validate';
import { requireAuth, requireAdmin } from '../../middleware/auth';
import { registerSchema, loginSchema } from './auth.schema';
import * as authService from './auth.service';
import { config } from '../../config';

export const authRouter = Router();

const COOKIE_NAME = 'refresh_token';
const cookieOptions = {
  httpOnly: true,
  secure: config.NODE_ENV === 'production',
  // cross-domain in production (railway.app frontend vs api subdomain) requires 'none';
  // 'strict' blocks the HttpOnly cookie on cross-site requests
  sameSite: (config.NODE_ENV === 'production' ? 'none' : 'strict') as 'none' | 'strict',
  maxAge: config.REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
};

authRouter.post('/register', validate(registerSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { accessToken, refreshToken, user } = await authService.register(req.body);
    res.cookie(COOKIE_NAME, refreshToken, cookieOptions);
    res.status(201).json({ accessToken, user });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/login', validate(loginSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { accessToken, refreshToken, recoveryToken, user } = await authService.login(req.body);
    res.cookie(COOKIE_NAME, refreshToken, cookieOptions);
    res.json({ accessToken, user, recoveryToken });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const raw = req.cookies[COOKIE_NAME];
    if (!raw) {
      res.status(401).json({ error: 'No refresh token' });
      return;
    }
    const { accessToken, refreshToken, user } = await authService.refresh(raw);
    res.cookie(COOKIE_NAME, refreshToken, cookieOptions);
    res.json({ accessToken, user });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const raw = req.cookies[COOKIE_NAME];
    if (raw) await authService.logout(raw);
    res.clearCookie(COOKIE_NAME);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', requireAuth, (req: Request, res: Response) => {
  res.json({ user: req.user });
});

authRouter.post('/join/:code/claim', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { memberId, displayName } = req.body;
    if (!memberId) { res.status(400).json({ error: 'memberId required' }); return; }
    const { accessToken, refreshToken, inviteToken, user } = await authService.joinClaim(req.params.code, memberId, displayName);
    res.cookie(COOKIE_NAME, refreshToken, cookieOptions);
    res.json({ accessToken, inviteToken, user });
  } catch (err) { next(err); }
});

authRouter.post('/invite/magic/:token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { displayName } = req.body;
    const { accessToken, refreshToken, user } = await authService.magicLinkAccept(req.params.token, displayName);
    res.cookie(COOKIE_NAME, refreshToken, cookieOptions);
    res.json({ accessToken, user });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/invite/accept/:token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { password, displayName } = req.body;
    if (!password || !displayName) {
      res.status(400).json({ error: 'password and displayName required' });
      return;
    }
    const { accessToken, refreshToken, user } = await authService.acceptInvite(req.params.token, password, displayName);
    res.cookie(COOKIE_NAME, refreshToken, cookieOptions);
    res.json({ accessToken, user });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/admin/users', requireAuth, requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await authService.listAllUsers();
    res.json({ users });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/admin/impersonate/:userId', requireAuth, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.impersonateUser(req.params.userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
