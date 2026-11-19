import 'server-only';
import { cache } from 'react';
import { readPartnerWorkspaceAction, readPartnerWorkspaceAccessAction } from '@/lib/actions/partner';

export const loadPartnerSnapshot = cache(readPartnerWorkspaceAction);

export const loadPartnerWorkspaceAccess = cache(readPartnerWorkspaceAccessAction);
