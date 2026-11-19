'use client';

import { createContext, useContext, useLayoutEffect, useMemo, type ReactNode } from 'react';
import type { PartnerWorkspaceData } from '@/lib/partner';
import type { StatementEntry } from '@/components/transactions/StatementList';
import type { LedgerRecord } from '@/types';
import type { PartnerEditor } from './PartnerCreateDialog';

export interface PartnerView {
  data: PartnerWorkspaceData;
  openEditor: (editor: PartnerEditor) => void;
  openTransaction: (transaction: LedgerRecord, entry?: StatementEntry) => void;
}

export const PartnerViewContext = createContext<PartnerView | null>(null);
export const usePartnerView = () => useContext(PartnerViewContext);

type PartnerWorkspaceControls = Omit<PartnerView, 'data'> & {
  register: (pathname: string, data: PartnerWorkspaceData) => void;
};

export const PartnerWorkspaceControlsContext = createContext<PartnerWorkspaceControls | null>(null);

/** The regular page receives its authorized records in the streamed segment.
 * Shell dialogs receive the same snapshot once that segment is active. */
export function PartnerWorkspaceScope({ data, pathname, children }: { data: PartnerWorkspaceData; pathname: string; children: ReactNode }) {
  const controls = useContext(PartnerWorkspaceControlsContext);
  const value = useMemo(() => controls ? { data, openEditor: controls.openEditor, openTransaction: controls.openTransaction } : null, [controls, data]);
  useLayoutEffect(() => { controls?.register(pathname, data); }, [controls, pathname, data]);
  return <PartnerViewContext.Provider value={value}>{children}</PartnerViewContext.Provider>;
}
