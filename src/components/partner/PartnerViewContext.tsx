'use client';

import { createContext, useContext } from 'react';
import type { PartnerWorkspaceData } from '@/lib/partner';
import type { LedgerRecord } from '@/types';
import type { PartnerEditor } from './PartnerCreateDialog';

export interface PartnerView {
  data: PartnerWorkspaceData;
  openEditor: (editor: PartnerEditor) => void;
  openTransaction: (transaction: LedgerRecord) => void;
}

export const PartnerViewContext = createContext<PartnerView | null>(null);
export const usePartnerView = () => useContext(PartnerViewContext);
