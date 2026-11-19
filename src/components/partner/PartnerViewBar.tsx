'use client';

import { useState } from 'react';
import { ArrowLeftRight, UsersRound } from 'lucide-react';
import { leavePartnerViewAction } from '@/lib/actions/partner';
import { callAction } from '@/lib/actions/callAction';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { partnerDisplayName } from '@/lib/partnerDisplay';
import { isPartnerSection } from '@/lib/partnerPaths';

export function PartnerViewBar({ name, pathname }: { name: string | null; pathname: string }) {
  const { d } = useTranslation();
  const [leaving, setLeaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const x = d.partner;
  const displayName = partnerDisplayName(name, x.partnerName);

  const leave = async () => {
    setLeaving(true);
    setFailed(false);
    const result = await callAction(leavePartnerViewAction);
    if (result.ok) window.location.replace(pathname !== '/settings' && isPartnerSection(pathname.slice(1)) ? pathname : '/settings#settings-partner');
    else { setFailed(true); setLeaving(false); }
  };

  return <div className="pb-partner-view-bar">
    <div className="pb-partner-view-label">
      <UsersRound size={16} aria-hidden="true" />
      <span><strong>{x.partnerSpace}</strong>{displayName !== x.partnerName && <span className="pb-partner-view-name"> · {displayName}</span>}</span>
    </div>
    <button className="pill" type="button" onClick={() => void leave()} disabled={leaving}>
      <ArrowLeftRight size={14} aria-hidden="true" />{x.returnOwn}
    </button>
    {failed && <span role="alert">{x.errors.unexpected}</span>}
  </div>;
}
