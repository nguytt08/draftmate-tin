import { config } from '../../config';

let twilioClient: ReturnType<typeof import('twilio')> | null = null;

function getClient() {
  if (!twilioClient && config.TWILIO_ACCOUNT_SID && config.TWILIO_AUTH_TOKEN) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const twilio = require('twilio');
    twilioClient = twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);
  }
  return twilioClient;
}

export async function sendSms(to: string, body: string): Promise<void> {
  const client = getClient();
  if (!client || !config.TWILIO_PHONE_NUMBER) {
    console.log('[SMS] Twilio not configured — skipping SMS to', to);
    console.log('[SMS] Body:', body);
    return;
  }
  await client.messages.create({ from: config.TWILIO_PHONE_NUMBER, to, body });
}
