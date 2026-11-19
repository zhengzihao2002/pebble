import { timingSafeEqual } from 'node:crypto';
import { neonSql } from '@/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const received = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(secret ? 'Bearer ' + secret : '');
  if (!secret || received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return new Response(null, { status: 401 });
  }

  await neonSql`DELETE FROM public.pebble_partner_inbox WHERE expires_at <= now()`;
  return new Response(null, { status: 204 });
}
