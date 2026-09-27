import { createHash, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/server';

/**
 * Pebble's gate in front of Neon Auth. Every auth request from the app passes
 * through this route before being proxied to Neon's hosted auth server.
 *
 * - SIGN-UP (/sign-up/email) requires the shared invite code, compared in
 *   constant time against PEBBLE_INVITE_CODE and REMOVED before forwarding -
 *   Neon never sees it. With the variable unset, every sign-up is refused, so
 *   a missing setting can never leave sign-up open.
 * - EMAIL-CODE SIGN-IN is refused: it silently creates an account for an
 *   unknown email, and Neon offers no switch for that. Email codes stay on
 *   for password reset and email verification only.
 * - Sign-in methods Pebble does not use, several of which can create
 *   accounts, are refused outright. Revisit this list if one is ever enabled.
 *
 * LIMIT: this protects the app's path. A request sent straight to
 * NEON_AUTH_BASE_URL bypasses it; that address is server-only, not secret.
 */
const neon = auth.handler();

export const GET = neon.GET;

const REFUSED_PATHS = [
  '/sign-in/email-otp',
  '/sign-in/anonymous',
  '/sign-in/social',
  '/sign-in/magic-link',
  '/sign-in/phone-number',
  '/sign-in/username',
];

const OTP_SIGN_IN_OFF = 'Email-code sign-in is turned off. Sign in with your password, or use Forgot password.';

function authPath(url: string): string {
  const { pathname } = new URL(url);
  const i = pathname.indexOf('/api/auth');
  return i === -1 ? pathname : pathname.slice(i + '/api/auth'.length);
}

function refuse(message: string) {
  return NextResponse.json({ code: 'PEBBLE_AUTH_REFUSED', message }, { status: 403 });
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.clone().json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// Hashing both sides first gives equal-length buffers, so neither the
// comparison time nor a length mismatch reveals anything about the code.
function inviteMatches(submitted: unknown): boolean {
  const expected = process.env.PEBBLE_INVITE_CODE;
  if (!expected || typeof submitted !== 'string' || submitted === '') return false;
  const a = createHash('sha256').update(submitted).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(...args: Parameters<typeof neon.POST>) {
  const [request, ...rest] = args;
  const path = authPath(request.url);

  if (REFUSED_PATHS.includes(path)) {
    return refuse(path === '/sign-in/email-otp' ? OTP_SIGN_IN_OFF : 'This sign-in method is not available.');
  }

  if (path === '/email-otp/send-verification-otp') {
    const body = await readJson(request);
    if (body?.type === 'sign-in') return refuse(OTP_SIGN_IN_OFF);
    return neon.POST(request, ...rest);
  }

  if (path === '/sign-up/email') {
    const body = await readJson(request);
    if (!body || !inviteMatches(body.inviteCode)) return refuse('Invalid invite code.');
    const forwardedBody = { ...body };
    delete forwardedBody.inviteCode;
    const headers = new Headers(request.headers);
    headers.delete('content-length');
    const forwarded = new NextRequest(request.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(forwardedBody),
    });
    return neon.POST(forwarded, ...rest);
  }

  return neon.POST(request, ...rest);
}
