'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRightLeft, CalendarClock, Eye, EyeOff, PiggyBank, Plus, Search, Target } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ModalFrame } from '@/components/shared/ModalFrame';
import { navItems } from './navItems';
import { usePebbleStore } from '@/store/usePebbleStore';
import { useTranslation } from '@/lib/i18n/useTranslation';

interface CommandPaletteProps {
  onClose: () => void;
  onAddTransaction: () => void;
  onTransfer: () => void;
  onAddGoal: () => void;
  onAddSchedule: () => void;
  onModifyBudget: () => void;
}

interface Command {
  id: string;
  label: string;
  icon: LucideIcon;
  group: 'actions' | 'pages';
  run: () => void;
}

const hidden: React.CSSProperties = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
  overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
};

/**
 * ⌘K / Ctrl+K. Every action reuses AppShell's own handlers, and pages use
 * the router, so nothing here fetches or writes.
 *
 * An action runs AFTER the palette's exit, from the frame's onClose: a
 * dialog it opens then takes focus last, instead of the palette handing
 * focus back to whatever was focused before it.
 */
export function CommandPalette({ onClose, onAddTransaction, onTransfer, onAddGoal, onAddSchedule, onModifyBudget }: CommandPaletteProps) {
  const { d } = useTranslation();
  const router = useRouter();
  const privacyOn = usePebbleStore((s) => s.privacyOn);
  const setPrivacyOn = usePebbleStore((s) => s.setPrivacyOn);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const pending = useRef<(() => void) | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // After ModalFrame's own effect, which focuses the card (child effects run
  // first), so the filter box ends up focused.
  useEffect(() => { inputRef.current?.focus({ preventScroll: true }); }, []);

  const commands: Command[] = [
    { id: 'add', label: d.header.addTransaction, icon: Plus, group: 'actions', run: onAddTransaction },
    { id: 'transfer', label: d.transfer.title, icon: ArrowRightLeft, group: 'actions', run: onTransfer },
    { id: 'goal', label: d.common.addGoal, icon: Target, group: 'actions', run: onAddGoal },
    { id: 'schedule', label: d.header.addSchedule, icon: CalendarClock, group: 'actions', run: onAddSchedule },
    { id: 'budget', label: d.header.modifyBudget, icon: PiggyBank, group: 'actions', run: onModifyBudget },
    {
      id: 'privacy', label: privacyOn ? d.privacyMode.showAmounts : d.privacyMode.hideAmounts,
      icon: privacyOn ? Eye : EyeOff, group: 'actions', run: () => setPrivacyOn(!privacyOn),
    },
    ...navItems.map((item): Command => ({
      id: item.href, label: d.nav[item.labelKey], icon: item.icon, group: 'pages',
      run: () => router.push(item.href),
    })),
  ];

  const q = query.trim().toLowerCase();
  const shown = q ? commands.filter((c) => c.label.toLowerCase().includes(q)) : commands;
  const index = Math.min(active, Math.max(0, shown.length - 1));

  useEffect(() => {
    document.getElementById(`pb-palette-opt-${index}`)?.scrollIntoView({ block: 'nearest' });
  }, [index, q]);

  return (
    <ModalFrame
      onClose={() => { onClose(); const run = pending.current; pending.current = null; run?.(); }}
      labelledBy="pb-palette-title"
      maxWidth={520}
    >
      {(close) => {
        const pick = (c: Command | undefined) => {
          if (!c) return;
          pending.current = c.run;
          close();
        };
        return (
          <>
            <div className="pb-modal-head">
              <h2 id="pb-palette-title" style={hidden}>{d.palette.title}</h2>
              <div style={{ position: 'relative' }}>
                <Search size={17} aria-hidden="true" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)' }} />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setActive(0); }}
                  onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing) return;
                    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, shown.length - 1)); }
                    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
                    else if (e.key === 'Enter') { e.preventDefault(); pick(shown[index]); }
                  }}
                  placeholder={d.palette.placeholder}
                  aria-label={d.palette.title}
                  aria-controls="pb-palette-list"
                  aria-activedescendant={shown.length > 0 ? `pb-palette-opt-${index}` : undefined}
                  autoComplete="off" spellCheck={false}
                  style={{
                    width: '100%', boxSizing: 'border-box', padding: '0.75rem 0.9rem 0.75rem 2.4rem',
                    borderRadius: '0.75rem', border: '1px solid var(--line)', fontSize: '1rem',
                    color: 'var(--ink)', backgroundColor: 'var(--paper)',
                  }}
                />
              </div>
            </div>

            <div className="pb-modal-body themed-scroll">
              {shown.length === 0 ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', textAlign: 'center', padding: '1.5rem 0', margin: 0 }}>{d.palette.empty}</p>
              ) : (
                <ul id="pb-palette-list" role="listbox" aria-label={d.palette.title} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {shown.map((c, i) => {
                    const Icon = c.icon;
                    const on = i === index;
                    const firstOfGroup = i === 0 || shown[i - 1].group !== c.group;
                    return (
                      <li key={c.id} role="presentation">
                        {firstOfGroup && (
                          <p aria-hidden="true" style={{ fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--ink-soft)', margin: i === 0 ? '0 0 0.3rem' : '0.7rem 0 0.3rem' }}>
                            {c.group === 'actions' ? d.palette.actions : d.palette.pages}
                          </p>
                        )}
                        <div
                          id={`pb-palette-opt-${i}`}
                          role="option"
                          aria-selected={on}
                          onMouseMove={() => { if (!on) setActive(i); }}
                          onClick={() => pick(c)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.6rem 0.75rem',
                            borderRadius: '0.6rem', cursor: 'pointer', fontSize: '0.9rem',
                            backgroundColor: on ? 'var(--pine-soft)' : 'transparent',
                            color: on ? 'var(--pine)' : 'var(--ink)',
                          }}
                        >
                          <Icon size={16} aria-hidden="true" style={{ flex: 'none' }} />
                          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        );
      }}
    </ModalFrame>
  );
}
