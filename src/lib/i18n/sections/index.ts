/**
 * The redesign's string sections, assembled for en.ts and zh.ts. Each area
 * owns one file; this is the only place they are joined.
 */
import { shellEn, shellZh } from './shell';
import { dashboardEn, dashboardZh } from './dashboard';
import { transactionsEn, transactionsZh } from './transactions';
import { accountsEn, accountsZh } from './accounts';
import { reportsEn, reportsZh } from './reports';
import { analysisEn, analysisZh } from './analysis';
import { insightsEn, insightsZh } from './insights';
import { budgetsEn, budgetsZh } from './budgets';
import { goalsEn, goalsZh } from './goals';
import { scheduledEn, scheduledZh } from './scheduled';
import { settingsEn, settingsZh } from './settings';

export const uxEn = {
  shell: shellEn,
  dashboard: dashboardEn,
  transactions: transactionsEn,
  accounts: accountsEn,
  reports: reportsEn,
  analysis: analysisEn,
  insights: insightsEn,
  budgets: budgetsEn,
  goals: goalsEn,
  scheduled: scheduledEn,
  settings: settingsEn,
};

export const uxZh: typeof uxEn = {
  shell: shellZh,
  dashboard: dashboardZh,
  transactions: transactionsZh,
  accounts: accountsZh,
  reports: reportsZh,
  analysis: analysisZh,
  insights: insightsZh,
  budgets: budgetsZh,
  goals: goalsZh,
  scheduled: scheduledZh,
  settings: settingsZh,
};
