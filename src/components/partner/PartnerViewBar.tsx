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

  return <div className="pb-partner-view-bar" role="group" aria-label={`${x.partnerSpace} · ${displayName}`}>
    <div className="pb-partner-view-label" title={`${x.partnerSpace} · ${displayName}`}>
      <UsersRound size={15} aria-hidden="true" />
      <span className="pb-partner-view-copy">
        <strong>{x.partnerSpace}</strong>
        {displayName !== x.partnerName && <span className="pb-partner-view-name"><span className="pb-partner-view-separator"> · </span>{displayName}</span>}
      </span>
    </div>
    <button className="pb-partner-view-back" type="button" onClick={() => void leave()} disabled={leaving}
      aria-label={x.returnOwn} title={x.returnOwn}>
      <ArrowLeftRight size={15} aria-hidden="true" /><span>{x.returnOwn}</span>
    </button>
    {failed && <span className="pb-partner-view-error" role="alert">{x.errors.unexpected}</span>}
  </div>;
}
