import {
  Home, UtensilsCrossed, Car, ShoppingBag, Zap, Film, HeartPulse, CreditCard,
  GraduationCap, Plane, Gift, PiggyBank, Shield, PawPrint, Sparkles, Laptop, Key,
} from 'lucide-react';
import type { CategoryMeta, ExpenseTransaction, IncomeTransaction, Goal, GoalIconOption } from '@/types';

// Category taxonomy: icon + color are fixed app metadata. `budget` is the
// fallback for a brand-new install with nothing set yet — real budgets set
// via "Modify Budget" take over from here (see store/usePebbleStore.ts).
export const initialCategoryMeta: CategoryMeta = {
  'Housing':           { icon: Home,            color: '#1F5A45', budget: 0 },
  'Food & Dining':     { icon: UtensilsCrossed, color: '#AD7B2E', budget: 0 },
  'Transportation':    { icon: Car,             color: '#5B7B9A', budget: 0 },
  'Shopping':          { icon: ShoppingBag,     color: '#8C3D42', budget: 0 },
  'Utilities':         { icon: Zap,             color: '#B0A23E', budget: 0 },
  'Entertainment':     { icon: Film,            color: '#7A6BA6', budget: 0 },
  'Health & Fitness':  { icon: HeartPulse,      color: '#4C8577', budget: 0 },
  'Subscriptions':     { icon: CreditCard,      color: '#9C7A54', budget: 0 },
  'Education':         { icon: GraduationCap,   color: '#5B7B9A', budget: 0 },
  'Travel':            { icon: Plane,           color: '#AD7B2E', budget: 0 },
  'Gifts & Donations': { icon: Gift,            color: '#7A6BA6', budget: 0 },
  'Savings':           { icon: PiggyBank,       color: '#1F5A45', budget: 0 },
  'Insurance':         { icon: Shield,          color: '#4C8577', budget: 0 },
  'Pets':              { icon: PawPrint,        color: '#9C7A54', budget: 0 },
  'Personal Care':     { icon: Sparkles,        color: '#8C3D42', budget: 0 },
};

// Permanent, never-pruned history — starts empty, same as your source.
export const initialExpenses: ExpenseTransaction[] = [];
export const initialIncome: IncomeTransaction[] = [];
export const initialGoals: Goal[] = [];

export const GOAL_ICON_OPTIONS: GoalIconOption[] = [
  { key: 'Shield', icon: Shield }, { key: 'Plane', icon: Plane }, { key: 'Laptop', icon: Laptop },
  { key: 'Key', icon: Key }, { key: 'Home', icon: Home }, { key: 'Car', icon: Car },
  { key: 'GraduationCap', icon: GraduationCap }, { key: 'Gift', icon: Gift },
];
export const GOAL_COLOR_OPTIONS = ['#1F5A45', '#AD7B2E', '#5B7B9A', '#4C8577', '#7A6BA6', '#B0A23E'];

// Live "now" — evaluated once per module load, matching the confirmed
// decision to use the real current date rather than a fixed demo date.
export const TODAY = new Date();

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
export const QUARTER_NAMES = ['Q1', 'Q2', 'Q3', 'Q4'];

export const TREND_MODES = [
  { value: 'last6', label: 'Last 6 months' },
  { value: 'last12', label: 'Last 12 months' },
  { value: 'month', label: 'By month' },
  { value: 'quarter', label: 'By quarter' },
  { value: 'year', label: 'By year' },
];

export const STATS_MODES = [
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'last6', label: 'Last 6 months' },
  { value: 'last12', label: 'Last 12 months' },
  { value: 'month', label: 'By month' },
  { value: 'quarter', label: 'By quarter' },
  { value: 'year', label: 'By year' },
];
