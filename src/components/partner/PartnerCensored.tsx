'use client';

import { LockKeyhole } from 'lucide-react';
import { SectionHeader } from '@/components/kit/SectionHeader';
import { useTranslation } from '@/lib/i18n/useTranslation';

export function PartnerCensored({ balances = false }: { balances?: boolean }) {
  const { d } = useTranslation();
  const x = d.partner;
  return <div className="pb-partner-withheld">
    <LockKeyhole size={15} aria-hidden="true" />
    <p><strong>{x.censored}</strong> <span>{balances ? x.balancesRestricted : x.fieldsRestricted}</span></p>
  </div>;
}

export function PartnerCensoredCard({ title, className = '' }: { title: string; className?: string }) {
  return <section className={`card ${className}`}>
    <SectionHeader title={title} />
    <PartnerCensored />
  </section>;
}
