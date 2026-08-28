import { createHmac, timingSafeEqual } from 'crypto';

export type OAuthStatePayload = {
  projectId: string;
  organizationId: string;
  ts: number;
};

const MAX_AGE_MS = 10 * 60 * 1000;

export function signOAuthState(
  payload: Omit<OAuthStatePayload, 'ts'>,
  secret: string,
): string {
  const body: OAuthStatePayload = { ...payload, ts: Date.now() };
  const encoded = Buffer.from(JSON.stringify(body), 'utf8').toString(
    'base64url',
  );
  const mac = createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${mac}`;
}

export function verifyOAuthState(
  state: string,
  secret: string,
): OAuthStatePayload {
  const [encoded, mac] = state.split('.');
  if (!encoded || !mac) {
    throw new Error('Invalid OAuth state');
  }
  const expected = createHmac('sha256', secret)
    .update(encoded)
    .digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error('Invalid OAuth state signature');
  }
  const payload = JSON.parse(
    Buffer.from(encoded, 'base64url').toString('utf8'),
  ) as OAuthStatePayload;
  if (!payload.projectId || !payload.organizationId || !payload.ts) {
    throw new Error('Invalid OAuth state payload');
  }
  if (Date.now() - payload.ts > MAX_AGE_MS) {
    throw new Error('OAuth state expired');
  }
  return payload;
}
