/**
 * The redesign's string sections, assembled for en.ts and zh.ts. Each area
 * owns one file; this is the only place they are joined.
 */
import { shellEn, shellZh } from './shell';
import { dashboardEn, dashboardZh } from './dashboard';
import { transactionsEn, transactionsZh } from './transactions';
import { transactionDialogsEn, transactionDialogsZh } from './transactionDialogs';
import { accountsEn, accountsZh } from './accounts';
import { reportsEn, reportsZh } from './reports';
import { analysisEn, analysisZh } from './analysis';
import { insightsEn, insightsZh } from './insights';
import { budgetsEn, budgetsZh } from './budgets';
import { annualBudgetsEn, annualBudgetsZh } from './annualBudgets';
import { goalsEn, goalsZh } from './goals';
import { scheduledEn, scheduledZh } from './scheduled';
import { settingsEn, settingsZh } from './settings';
import { offlineEn, offlineZh } from './offline';

export const uxEn = {
  shell: shellEn,
  dashboard: dashboardEn,
  transactions: transactionsEn,
  transactionDialogs: transactionDialogsEn,
  accounts: accountsEn,
  reports: reportsEn,
  analysis: analysisEn,
  insights: insightsEn,
  budgets: budgetsEn,
  annualBudgets: annualBudgetsEn,
  goals: goalsEn,
  scheduled: scheduledEn,
  settings: settingsEn,
  offline: offlineEn,
};

export const uxZh: typeof uxEn = {
  shell: shellZh,
  dashboard: dashboardZh,
  transactions: transactionsZh,
  transactionDialogs: transactionDialogsZh,
  accounts: accountsZh,
  reports: reportsZh,
  analysis: analysisZh,
  insights: insightsZh,
  budgets: budgetsZh,
  annualBudgets: annualBudgetsZh,
  goals: goalsZh,
  scheduled: scheduledZh,
  settings: settingsZh,
  offline: offlineZh,
};
