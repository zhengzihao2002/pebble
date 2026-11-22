'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ghost, Eye, ShieldCheck } from 'lucide-react';
import type { Account } from '@/lib/data/mappers';
import { notifyAccountScopeChanged } from '@/lib/accounts/ghostEvents';
import { setAccountGhostAction } from '@/lib/actions/pebble';
import { callMutation } from '@/lib/actions/callAction';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { translateActionError } from '@/lib/i18n/actionErrors';
import { ModalFrame } from '@/components/shared/ModalFrame';
import { ModalCloseButton } from '@/components/shared/ModalCloseButton';
import { quietSyncIsEnabled } from '@/lib/offline/quietSync';

export function GhostBadge() {
  const { locale } = useTranslation();
  return <span className="pb-ghost-badge"><Ghost size={12} aria-hidden="true" />{locale === 'zh' ? '幽灵账户' : 'Ghost account'}</span>;
}

/** A deliberate, reversible change: explain historical exclusion before saving. */
export function GhostAccountMode({ account, disabled = false }: { account: Account; disabled?: boolean }) {
  const { d, locale } = useTranslation();
  const zh = locale === 'zh';
  const router = useRouter();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [openMode, setOpenMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ghost = open ? openMode : account.isGhost === true;
  // Keep a way out for credit cards enabled before this restriction.
  if (account.kind === 'credit' && !ghost) return null;
  const label = ghost ? (zh ? '恢复计入' : 'Include again') : (zh ? '幽灵模式' : 'Ghost mode');
  const save = async (close: () => void) => {
    if (busy) return;
    setBusy(true); setError(null);
    const quiet = quietSyncIsEnabled();
    const result = await callMutation(setAccountGhostAction, account.id, !ghost, quiet);
    setBusy(false);
    if (!result.ok) { setError(translateActionError(d, locale, result)); return; }
    close();
    notifyAccountScopeChanged(account.id, !ghost);
    if (!quiet) router.refresh();
  };
  return <>
    <button type="button" className={`pill pb-ghost-mode-button${ghost ? ' is-active' : ''}`} disabled={disabled} onClick={() => { setError(null); setOpenMode(account.isGhost === true); setOpen(true); }} aria-label={`${label} · ${account.name}`}>
      {ghost ? <Eye size={14} aria-hidden="true" /> : <Ghost size={14} aria-hidden="true" />}{label}
    </button>
    {open && <ModalFrame onClose={() => setOpen(false)} busy={busy} labelledBy={titleId} maxWidth={460} cardClassName="pb-ghost-dialog">
      {(close, complete) => <>
        <div className="pb-modal-head"><div className="pb-ghost-dialog-heading"><span className="pb-ghost-dialog-icon"><Ghost size={24} aria-hidden="true" /></span><div><h2 id={titleId} className="font-display">{ghost ? (zh ? '恢复计入财务' : 'Include this account again?') : (zh ? '启用幽灵模式' : 'Enable ghost mode?')}</h2><p className="pb-ghost-account-name">{account.name}</p></div></div><ModalCloseButton onClick={close} disabled={busy} /></div>
        <div className="pb-modal-body">
          <p className="pb-ghost-dialog-intro">{ghost
            ? (zh ? '此账户及其全部历史记录将重新计入余额、预算和其他财务计算。' : 'This account and its full history will rejoin your balances, budgets, and other financial calculations.')
            : (zh ? '保留账户和记录，同时让它独立于日常财务。' : 'Keep the account and its records, separate from your everyday finances.')}</p>
          {!ghost && <ul className="pb-ghost-promises">
            <li><ShieldCheck size={17} aria-hidden="true" /><span>{zh ? '账户余额、收入、支出和计划付款均不参与任何全局计算，包括历史记录。报表按其账户筛选独立计算。' : 'Its balance, income, spending, and scheduled payments stay out of all app-wide calculations, including historical figures. Reports follows its own account filters.'}</span></li>
            <li><Ghost size={17} aria-hidden="true" /><span>{zh ? '账户会保留在独立的幽灵账户区域。交易默认隐藏，可选择显示。' : 'It lives in a separate Ghost accounts section. Its transactions stay hidden until you choose to show them.'}</span></li>
            <li><Eye size={17} aria-hidden="true" /><span>{zh ? '不会删除任何记录。随时恢复计入；休眠状态保持不变。' : 'No records are deleted. Include it again whenever you want; its hibernation state stays as it is.'}</span></li>
          </ul>}
          {!ghost && <p className="pb-ghost-dialog-note">{zh ? '现有计划付款仍会按原规则记入此账户。幽灵模式不等于暂停或删除。现有预算与目标预留保持不变，可能需要重新检查。' : 'Existing scheduled payments continue recording to this account. Ghost mode does not pause or delete them. Existing budgets and goal allocations stay as they are; you may need to review them.'}</p>}
          {error && <p role="alert" className="pb-ghost-error">{error}</p>}
        </div>
        <div className="pb-modal-foot"><button type="button" className="pill" onClick={close} disabled={busy}>{zh ? '取消' : 'Cancel'}</button><button type="button" className="btn-primary" disabled={busy} onClick={() => void save(complete)}>{busy ? d.common.saving : ghost ? (zh ? '恢复计入' : 'Include account') : (zh ? '启用幽灵模式' : 'Enable ghost mode')}</button></div>
      </>}
    </ModalFrame>}
  </>;
}
