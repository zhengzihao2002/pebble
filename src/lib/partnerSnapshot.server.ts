import 'server-only';
import { cache } from 'react';
import { readPartnerWorkspaceAction } from '@/lib/actions/partner';

export const loadPartnerSnapshot = cache(readPartnerWorkspaceAction);
