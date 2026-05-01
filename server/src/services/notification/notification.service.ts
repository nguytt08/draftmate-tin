import { prisma } from '../../db';
import { config } from '../../config';
import { sendEmail } from './email.service';
import { sendSms } from './sms.service';

export interface RawNotifyPayload {
  toEmail?: string;
  toPhone?: string;
  type: 'YOUR_TURN' | 'DRAFT_STARTED' | 'DRAFT_COMPLETE' | 'INVITE';
  data: Record<string, unknown>;
}

function buildYourTurnEmail(data: Record<string, unknown>) {
  const { leagueName, round, pickNumber, draftId } = data;
  const url = `${config.APP_BASE_URL}/draft/${draftId}`;
  return {
    subject: `It's your pick in ${leagueName}!`,
    text: `It's your turn in ${leagueName}! Round ${round}, Pick ${pickNumber}. Draft here: ${url}`,
    html: `<p>It's your turn in <strong>${leagueName}</strong>!</p>
<p>Round ${round}, Pick ${pickNumber}</p>
<p><a href="${url}">Make your pick →</a></p>`,
  };
}

function buildInviteEmail(data: Record<string, unknown>) {
  const { leagueName, commissionerName, inviteToken } = data;
  const url = `${config.APP_BASE_URL}/invite/${inviteToken}`;
  return {
    subject: `You've been invited to ${leagueName}`,
    text: `${commissionerName} invited you to join ${leagueName}. Accept here: ${url}`,
    html: `<p><strong>${commissionerName}</strong> invited you to join <strong>${leagueName}</strong>.</p>
<p><a href="${url}">Accept Invite →</a></p>`,
  };
}

function buildDraftStartedEmail(data: Record<string, unknown>) {
  const { leagueName, draftId } = data;
  const url = `${config.APP_BASE_URL}/draft/${draftId}`;
  return {
    subject: `Draft started: ${leagueName}`,
    text: `The draft for ${leagueName} has started! Join here: ${url}`,
    html: `<p>The draft for <strong>${leagueName}</strong> has started!</p>
<p><a href="${url}">Join the Draft →</a></p>`,
  };
}

function buildDraftCompleteEmail(data: Record<string, unknown>) {
  const { leagueName, draftId } = data;
  const url = `${config.APP_BASE_URL}/draft/${draftId}`;
  return {
    subject: `Draft complete: ${leagueName}`,
    text: `The draft for ${leagueName} is complete! View results: ${url}`,
    html: `<p>The draft for <strong>${leagueName}</strong> is complete!</p>
<p><a href="${url}">View Results →</a></p>`,
  };
}

function buildSmsBody(type: RawNotifyPayload['type'], data: Record<string, unknown>): string {
  const draftUrl = `${config.APP_BASE_URL}/draft/${data.draftId}`;
  switch (type) {
    case 'YOUR_TURN':
      return `[Draft] Your pick in ${data.leagueName}! R${data.round} P${data.pickNumber}: ${draftUrl}`;
    case 'INVITE':
      return `[Draft] ${data.commissionerName} invited you to ${data.leagueName}: ${config.APP_BASE_URL}/invite/${data.inviteToken}`;
    case 'DRAFT_STARTED':
      return `[Draft] ${data.leagueName} draft started! ${draftUrl}`;
    case 'DRAFT_COMPLETE':
      return `[Draft] ${data.leagueName} draft complete! ${draftUrl}`;
  }
}

function buildEmailContent(type: RawNotifyPayload['type'], data: Record<string, unknown>) {
  switch (type) {
    case 'YOUR_TURN': return buildYourTurnEmail(data);
    case 'INVITE': return buildInviteEmail(data);
    case 'DRAFT_STARTED': return buildDraftStartedEmail(data);
    case 'DRAFT_COMPLETE': return buildDraftCompleteEmail(data);
  }
}

class NotificationService {
  async notify(payload: RawNotifyPayload): Promise<void> {
    const tasks: Promise<void>[] = [];

    if (payload.toEmail) {
      const content = buildEmailContent(payload.type, payload.data);
      tasks.push(sendEmail({ to: payload.toEmail, ...content }));
    }

    if (payload.toPhone) {
      const body = buildSmsBody(payload.type, payload.data);
      tasks.push(sendSms(payload.toPhone, body));
    }

    const results = await Promise.allSettled(tasks);
    for (const r of results) {
      if (r.status === 'rejected') {
        console.error('[Notification] Failed to send:', r.reason);
      }
    }
  }

  async notifyYourTurn(
    memberId: string,
    league: { id: string; name: string },
    draft: { id: string },
    pickNumber: number,
    timerEndsAt: Date,
  ): Promise<void> {
    const member = await prisma.leagueMember.findUnique({
      where: { id: memberId },
      include: { user: true },
    });
    if (!member) return;

    const round = Math.ceil(pickNumber / 1); // will be filled by caller context
    await this.notify({
      toEmail: member.notifyEmail ? member.inviteEmail ?? undefined : undefined,
      toPhone: member.notifyPhone ?? member.user?.phone ?? undefined,
      type: 'YOUR_TURN',
      data: {
        leagueName: league.name,
        draftId: draft.id,
        pickNumber,
        round,
        timerEndsAt: timerEndsAt.toISOString(),
      },
    });
  }
}

export const notificationService = new NotificationService();
