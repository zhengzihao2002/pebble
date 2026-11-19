import type { Account } from '@/lib/data/mappers';
import { canSeePartnerBalances, type PartnerWorkspaceData } from '@/lib/partner';
import type { BalanceAdjustment, Goal, IncomeTransaction, RecurringRule, Transaction } from '@/types';

export function partnerDisplayName(name: string | null, fallback: string) {
  return name?.trim() || fallback;
}

/** Adapt only the already-scoped fields. Missing amounts are rendered as
 * censored values by the shared cards, never included as real zeroes in charts. */
export function partnerTransactions(data: PartnerWorkspaceData, maskedTitle: string): Transaction[] {
  return data.transactions.map(row => {
    const title = row.hidden ? maskedTitle : row.title;
    const common = {
      id: row.id, date: row.date, description: !row.hidden && row.notes ? title + '\n' + row.notes : title,
      accountId: row.accountId ?? '', paymentMethod: row.accountName ?? '',
      amount: row.amount ?? 0,
    };
    if (row.kind === 'expense') return { ...common, type: 'expense', category: row.hidden ? '' : row.category, tag: row.hidden ? '' : row.tag, creditCardPayoff: row.creditCardPayoff ?? undefined };
    return {
      ...common, type: 'income', category: (row.hidden ? '' : row.category) as IncomeTransaction['category'],
      grossAmount: row.grossAmount ?? common.amount, netAmount: common.amount,
    };
  });
}

export function partnerAccounts(data: PartnerWorkspaceData): Account[] {
  return data.accounts.map((account, sortOrder) => ({
    ...account, last4: null, isDefault: false, isPreferred: false, sortOrder, creditLimit: null, dueDay: null,
  }));
}

export function partnerBalanceAdjustments(data: PartnerWorkspaceData): BalanceAdjustment[] {
  if (!canSeePartnerBalances(data.permissions)) return [];
  return data.adjustments ?? [];
}

export function partnerGoals(data: PartnerWorkspaceData): Goal[] {
  return data.goals.map(goal => ({ ...goal, target: goal.target ?? 1, current: goal.current ?? 0 }));
}

export function partnerRules(data: PartnerWorkspaceData): RecurringRule[] {
  return data.scheduled.map(rule => ({
    ...rule, status: rule.paused ? 'paused' : 'active', amount: rule.amount ?? 0,
    description: rule.title, startDate: rule.date, accountId: rule.accountId ?? '',
    paymentMethod: rule.accountName ?? '', grossAmount: null, tag: null,
  }));
}

export const partnerCanPost = (data: PartnerWorkspaceData) =>
  data.entryAccounts.length > 0 && (data.entryCategories.length > 0 || data.entryIncome.length > 0);
