import { auth } from '@/lib/auth/server';
import { NextRequest } from 'next/server';

const authMiddleware = auth.middleware({
  loginUrl: '/auth/sign-in',
});

export default function proxy(request: NextRequest) {
  if (request.headers.has('Next-Action')) {
    return;
  }
  return authMiddleware(request);
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/transactions/:path*',
    '/reports/:path*',
    '/budgets/:path*',
    '/goals/:path*',
    '/settings/:path*',
    '/account/:path*',
  ],
};
