import { cookies } from 'next/headers';
import { enterPartnerViewAction } from '@/lib/actions/partner';
import { PARTNER_VIEW_COOKIE } from '@/lib/partnerPaths';

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  // Next can normalize the handler URL behind a proxy. Fetch Metadata still
  // identifies requests sent by the same browser origin in that case.
  if (!origin || (origin !== new URL(request.url).origin && request.headers.get('sec-fetch-site') !== 'same-origin')) {
    return new Response(null, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  if (body?.pair === null) {
    (await cookies()).delete(PARTNER_VIEW_COOKIE);
    return Response.json({ ok: true });
  }
  if (typeof body?.pair !== 'string') return new Response(null, { status: 400 });
  return Response.json(await enterPartnerViewAction(body.pair, true));
}
