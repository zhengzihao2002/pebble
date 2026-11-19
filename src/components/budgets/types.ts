import type { LucideIcon } from 'lucide-react';

export interface BudgetEntry {
  name: string;
  censored?: boolean;
  icon: LucideIcon;
  color: string;
  budget: number;
  spent: number;
  pct: number;
}
