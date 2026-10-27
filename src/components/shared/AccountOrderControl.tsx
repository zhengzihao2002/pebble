'use client';

import { useId, useLayoutEffect, useRef, useState } from 'react';
import { GripVertical } from 'lucide-react';
import type { Account } from '@/lib/data/mappers';
import { ACCOUNT_SORT_MODES, accountSortMode, accountOrderGroup, manualAccountIds, orderAccounts } from '@/lib/accountOrder';
import { usePebbleStore } from '@/store/usePebbleStore';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { SelectField } from './SelectField';

/** Draft changes stay local to the editor until Save is pressed. */
function OrderEditor({ accounts, onSave, onCancel }: { accounts: Account[]; onSave: (ids: string[]) => void; onCancel: () => void }) {
  const { d, t } = useTranslation();
  const x = d.ux.accounts;
  const savedIds = usePebbleStore((s) => s.manualAccountOrder);
  const [ids, setIds] = useState(() => manualAccountIds(savedIds).length ? manualAccountIds(savedIds) : accounts.map((a) => a.id));
  const [dragging, setDragging] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const dragRef = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<string, number>());
  const ordered = orderAccounts(accounts, {}, 'manual', ids);
  const groups = [0, 1, 2, 3].map((group) => ({
    label: `${group >= 2 ? `${d.accounts.hibernated} · ` : ''}${group % 2 ? x.sectionCards : x.sectionBankCash}`,
    accounts: ordered.filter((a) => accountOrderGroup(a) === group),
  })).filter((group) => group.accounts.length > 0);
  useLayoutEffect(() => {
    const next = new Map<string, number>();
    listRef.current?.querySelectorAll<HTMLElement>('[data-account-id]').forEach((el) => {
      const id = el.dataset.accountId!;
      const top = el.getBoundingClientRect().top;
      const previous = positions.current.get(id);
      if (previous !== undefined && previous !== top && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        el.animate([{ transform: `translateY(${previous - top}px)` }, { transform: 'translateY(0)' }], { duration: 180, easing: 'ease-out' });
      }
      next.set(id, top);
    });
    positions.current = next;
  }, [ids]);
  const move = (fromId: string, toId: string) => {
    const from = ordered.find((a) => a.id === fromId), to = ordered.find((a) => a.id === toId);
    if (!from || !to || from === to || accountOrderGroup(from) !== accountOrderGroup(to)) return;
    const next = ordered.map((a) => a.id);
    const index = next.indexOf(toId);
    next.splice(next.indexOf(fromId), 1);
    next.splice(index, 0, fromId);
    setIds(next);
    const group = groups.find((g) => g.accounts.some((a) => a.id === fromId))!;
    setAnnouncement(t(x.orderPosition, { name: from.name, position: group.accounts.findIndex((a) => a.id === toId) + 1, count: group.accounts.length }));
  };
  const endDrag = () => { dragRef.current = null; setDragging(null); };
  return (
    <div className="pb-account-order-editor" ref={listRef}>
      <p className="pb-account-order-hint">{x.orderHint}</p>
      <span role="status" className="sr-only">{announcement}</span>
      {groups.map((group) => (
        <div key={group.label}>
          <h4>{group.label}</h4>
          <ul>
            {group.accounts.map((a, i) => (
              <li key={a.id} data-account-id={a.id} className={dragging === a.id ? 'is-dragging' : ''}>
                <button type="button" className="pill pb-account-order-handle" aria-label={t(x.dragAccount, { name: a.name })}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    dragRef.current = a.id; setDragging(a.id);
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={(e) => {
                    if (!dragRef.current) return;
                    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-account-id]');
                    if (target && listRef.current?.contains(target)) move(dragRef.current, target.dataset.accountId!);
                    const scroller = e.currentTarget.closest('.pebble-root');
                    if (e.clientY > innerHeight - 70) scroller?.scrollBy(0, 16);
                    else if (e.clientY < 70) scroller?.scrollBy(0, -16);
                  }}
                  onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}
                  onKeyDown={(e) => {
                    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
                    e.preventDefault();
                    const neighbor = group.accounts[i + (e.key === 'ArrowUp' ? -1 : 1)];
                    if (neighbor) move(a.id, neighbor.id);
                  }}>
                  <GripVertical size={18} aria-hidden="true" />
                </button>
                <span className="pb-account-order-name">{a.name}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="pb-account-order-actions">
        <button type="button" className="pill" onClick={onCancel}>{x.cancelOrder}</button>
        <button type="button" className="btn-primary" onClick={() => onSave(ordered.map((a) => a.id))}>{x.saveOrder}</button>
      </div>
    </div>
  );
}

export function AccountOrderControl({ accounts }: { accounts: Account[] }) {
  const { d } = useTranslation();
  const x = d.ux.accounts;
  const id = useId();
  const mode = accountSortMode(usePebbleStore((s) => s.accountSort));
  const setMode = usePebbleStore((s) => s.setAccountSort);
  const setOrder = usePebbleStore((s) => s.setManualAccountOrder);
  const [editing, setEditing] = useState(false);
  return (
    <div className="pb-account-order">
      <div className="pb-account-order-select">
        <label htmlFor={id}>{x.sortAccounts}</label>
        <SelectField id={id} ariaLabel={x.sortAccounts} value={editing ? 'manual' : mode}
          options={ACCOUNT_SORT_MODES.map((value) => ({ value, label: x.sortModes[value] }))}
          onChange={(value) => {
            const next = accountSortMode(value);
            setEditing(next === 'manual');
            if (next !== 'manual') setMode(next);
          }} />
      </div>
      {editing ? <OrderEditor accounts={accounts} onCancel={() => setEditing(false)} onSave={(ids) => { setOrder(ids); setEditing(false); }} />
        : mode === 'manual' && <button type="button" className="pill" onClick={() => setEditing(true)}>{x.reorderAccounts}</button>}
    </div>
  );
}
