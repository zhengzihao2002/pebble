import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSessionUserIdOrRedirect } from '@/lib/auth/getSessionUser';
import { PARTNER_VIEW_COOKIE, partnerSectionPath, selectedPartnerPair } from './partnerPaths';

export async function partnerViewPair(userId: string) {
  return selectedPartnerPair(userId, (await cookies()).get(PARTNER_VIEW_COOKIE)?.value);
}

export async function getOwnWorkspaceUser(pathname: string) {
  const userId = await getSessionUserIdOrRedirect();
  if (await partnerViewPair(userId)) redirect(partnerSectionPath(pathname));
  return userId;
}
