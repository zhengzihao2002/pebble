'use client';

import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/** Keep visited content mounted so chart state survives smooth open/close transitions. */
export function PlanDisclosure({ className, title, children }: { className: string; title: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [visited, setVisited] = useState(false);
  const id = useId();
  return <div className={`${className} pb-plan-disclosure`} data-open={open}>
    <button type="button" className="pb-plan-disclosure-toggle" aria-expanded={open} aria-controls={id}
      onClick={() => { setVisited(true); setOpen(value => !value); }}>
      {title}<ChevronDown size={14} aria-hidden="true" />
    </button>
    <div id={id} className="pb-plan-disclosure-body" inert={!open} aria-hidden={!open}>
      <div>{visited ? children : null}</div>
    </div>
  </div>;
}
