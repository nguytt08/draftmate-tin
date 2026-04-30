import type { Server as SocketServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { prisma } from '../../db';
import { DraftEngine } from '../../services/draft-engine/DraftEngine';
import type { JwtPayload } from '../../middleware/auth';

const onlineMembers: Map<string, Set<string>> = new Map(); // draftId -> Set<userId>

export function registerDraftSocket(io: SocketServer) {
  const draftNs = io.of('/draft');

  draftNs.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('Unauthorized'));
    try {
      const payload = jwt.verify(token, config.JWT_SECRET) as JwtPayload;
      (socket as Socket & { user: JwtPayload }).user = payload;
      next();
    } catch {
      next(new Error('Token invalid'));
    }
  });

  draftNs.on('connection', (socket) => {
    const user = (socket as Socket & { user: JwtPayload }).user;

    socket.on('draft:join', async ({ draftId }: { draftId: string }) => {
      try {
        // Verify membership
        const draft = await prisma.draft.findUnique({ where: { id: draftId }, include: { league: true } });
        if (!draft) return socket.emit('draft:error', { code: 'NOT_FOUND', message: 'Draft not found' });

        const member = await prisma.leagueMember.findFirst({
          where: { leagueId: draft.leagueId, userId: user.sub },
        });
        if (!member) return socket.emit('draft:error', { code: 'FORBIDDEN', message: 'Not a member' });

        socket.join(`draft:${draftId}`);

        // Track presence
        if (!onlineMembers.has(draftId)) onlineMembers.set(draftId, new Set());
        onlineMembers.get(draftId)!.add(user.sub);
        draftNs.to(`draft:${draftId}`).emit('presence:update', {
          onlineMembers: [...onlineMembers.get(draftId)!],
        });

        // Send full state snapshot
        const engine = new DraftEngine(prisma, io);
        const state = await engine.getDraftState(draftId);
        socket.emit('draft:state', state);
      } catch (err) {
        console.error('[Socket] draft:join error', err);
      }
    });

    socket.on('draft:leave', ({ draftId }: { draftId: string }) => {
      socket.leave(`draft:${draftId}`);
      onlineMembers.get(draftId)?.delete(user.sub);
      draftNs.to(`draft:${draftId}`).emit('presence:update', {
        onlineMembers: [...(onlineMembers.get(draftId) ?? [])],
      });
    });

    socket.on('disconnecting', () => {
      for (const room of socket.rooms) {
        if (room.startsWith('draft:')) {
          const draftId = room.replace('draft:', '');
          onlineMembers.get(draftId)?.delete(user.sub);
          draftNs.to(room).emit('presence:update', {
            onlineMembers: [...(onlineMembers.get(draftId) ?? [])],
          });
        }
      }
    });
  });
}
