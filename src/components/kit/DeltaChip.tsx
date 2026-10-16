import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';

interface DeltaChipProps {
  /** Signed change; 0 shows as flat. */
  delta: number;
  /** The change as the caller wants it written, already formatted and signed
      ("+12%", "−$84"). Shown verbatim. */
  text: string;
  /** Which direction is good news: up for income or savings, down for
      spending. 'neutral' colours neither way. */
  good?: 'up' | 'down' | 'neutral';
  /** Accessible wording, e.g. "12% more than last month". */
  label?: string;
  /** Money in the text: blurred in privacy mode like every other figure. */
  money?: boolean;
}

/**
 * A small signed change badge: an arrow for the direction (so it never relies
 * on colour alone) and pine or wine for whether that direction is good.
 */
export function DeltaChip({ delta, text, good = 'up', label, money = false }: DeltaChipProps) {
  const dir = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  const tone = dir === 'flat' || good === 'neutral' ? 'flat' : dir === good ? 'good' : 'bad';
  const Icon = dir === 'up' ? ArrowUpRight : dir === 'down' ? ArrowDownRight : ArrowRight;
  return (
    <span className={`pb-delta pb-delta-${tone}`} aria-label={label} title={label}>
      <Icon size={12} strokeWidth={2.4} aria-hidden="true" />
      <span className={money ? 'font-mono-tab' : 'pb-delta-num'}>{text}</span>
    </span>
  );
}
