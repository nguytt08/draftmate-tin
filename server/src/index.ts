import './config'; // validate env first
import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { Server as SocketServer } from 'socket.io';

import { config } from './config';
import { errorHandler } from './middleware/errorHandler';
import { authRouter } from './modules/auth/auth.router';
import { leagueRouter } from './modules/league/league.router';
import { itemRouter } from './modules/item/item.router';
import { draftRouter } from './modules/draft/draft.router';
import { registerDraftSocket } from './modules/draft/draft.socket';
import { createPickTimerWorker } from './workers/pickTimer.worker';

const app = express();
const httpServer = http.createServer(app);

export const io = new SocketServer(httpServer, {
  cors: {
    origin: config.APP_BASE_URL,
    credentials: true,
  },
});

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: config.APP_BASE_URL, credentials: true }));
app.use(morgan(config.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json());
app.use(cookieParser());
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/leagues', leagueRouter);
app.use('/api/v1/leagues', itemRouter);
app.use('/api/v1/leagues', draftRouter);

app.get('/health', (_req, res) => res.json({ ok: true }));

// ─── Socket.io ────────────────────────────────────────────────────────────────
registerDraftSocket(io);

// ─── Worker (in-process so auto-picks can emit real Socket.io events) ─────────
createPickTimerWorker(io);

// ─── Error handler (must be last) ─────────────────────────────────────────────
app.use(errorHandler);

httpServer.listen(config.PORT, () => {
  console.log(`Server running on port ${config.PORT}`);
});

export { app, httpServer };
