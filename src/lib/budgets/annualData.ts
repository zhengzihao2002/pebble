import 'server-only';

import { cache } from 'react';
import { neonSql } from '@/db';
import { resolveUserTimeZone } from '@/lib/time/serverTimeZone';
import { FALLBACK_TIME_ZONE, isValidTimeZone } from '@/lib/time/timeZone';
import { todayInZone } from '@/lib/recurring/occurrences';
import type { AnnualBudgetContext, AnnualPlan, AnnualPlannerData, AnnualPlanResult, SaveAnnualPlanInput } from './annualTypes';

interface PlanRow {
  year: number; state: 'draft' | 'scheduled'; time_zone: string; revision: number;
  updated_at: string; effective_at: string;
}
interface ItemRow { category_id: string; category_name: string; annual_amount: string | number; base_amount: string | number; name: string | null }

/** Only a genuinely unapplied additive migration gets the legacy fallback. */
export function annualSchemaUnavailable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: string; cause?: unknown; message?: string };
  return e.code === '42P01' || e.code === '42883' || (e.cause !== undefined && annualSchemaUnavailable(e.cause));
}
// Request-scoped only: never cache an effective plan across January 1.
const readPlans = cache(async (userId: string): Promise<PlanRow[]> => {
  return await neonSql`SELECT year,state,time_zone,revision,updated_at,effective_at FROM annual_budget_plan WHERE user_id=${userId}::uuid ORDER BY year DESC` as PlanRow[];
});
const itemsFor = cache(async (userId: string, year: number): Promise<ItemRow[]> => {
  return await neonSql`SELECT i.category_id,i.category_name,i.annual_amount,i.base_amount,c.name
    FROM annual_budget_plan_item i LEFT JOIN category c ON c.id=i.category_id AND c.user_id=i.user_id
    WHERE i.user_id=${userId}::uuid AND i.year=${year}` as ItemRow[];
});
function isEffective(plan: PlanRow, now = new Date()): boolean {
  return plan.state === 'scheduled' && Date.parse(plan.effective_at) <= now.getTime();
}
async function serializedPlan(userId: string, row: PlanRow): Promise<AnnualPlan> {
  const items = await itemsFor(userId, row.year);
  return { year: row.year, state: row.state, timeZone: row.time_zone, revision: row.revision,
    updatedAt: new Date(row.updated_at).toISOString(),
    amounts: Object.fromEntries(items.map((x) => [x.category_id, Number(x.annual_amount)])),
    baseAmounts: Object.fromEntries(items.map((x) => [x.category_id, Number(x.base_amount)])),
  };
}
async function zoneFor(userId: string, plans: PlanRow[]): Promise<string> {
  // A saved planning timezone is durable across devices and travel. Existing
  // plans keep their confirmed dates; first-time planning uses the user's zone.
  const resolved = await resolveUserTimeZone(userId);
  const active = plans.find((p) => isEffective(p));
  const upcoming = plans.find((p) => p.state === 'scheduled' && !isEffective(p));
  return upcoming?.time_zone ?? active?.time_zone ?? resolved ?? FALLBACK_TIME_ZONE;
}
export async function getAnnualBudgetContext(userId: string): Promise<AnnualBudgetContext> {
  let plans: PlanRow[];
  try { plans = await readPlans(userId); }
  catch (error) {
    if (!annualSchemaUnavailable(error)) throw error;
    const timeZone = await resolveUserTimeZone(userId) ?? FALLBACK_TIME_ZONE;
    return { year: Number(todayInZone(timeZone).slice(0, 4)), timeZone, sourceYear: null, reviewed: false, nextPlan: null, available: false };
  }
  const timeZone = await zoneFor(userId, plans);
  const year = Number(todayInZone(timeZone).slice(0, 4));
  const active = plans.find((p) => isEffective(p));
  const next = plans.find((p) => p.year === year + 1);
  return { year, timeZone, sourceYear: active?.year ?? null, reviewed: active?.year === year,
    nextPlan: next ? await serializedPlan(userId, next) : null, available: true };
}
export async function getAnnualPlannerData(userId: string): Promise<AnnualPlannerData> {
  const context = await getAnnualBudgetContext(userId);
  const effective = context.available ? await getEffectiveAnnualBudgets(userId) : null;
  const rows = await neonSql`SELECT c.id,c.name,COALESCE(b.annual_amount,0) AS annual_amount
    FROM category c LEFT JOIN budget b ON b.user_id=c.user_id AND b.category=c.name WHERE c.user_id=${userId}::uuid` as { id: string; name: string; annual_amount: number | string }[];
  return { year: context.year, timeZone: context.timeZone, available: context.available, plan: context.nextPlan,
    currentAmounts: Object.fromEntries(rows.map((r) => [r.id, effective ? effective[r.name] ?? 0 : Number(r.annual_amount)])),
  };
}
/** Null means use the legacy map; an empty/zero annual plan is authoritative. */
export async function getEffectiveAnnualBudgets(userId: string, year?: number): Promise<Record<string, number> | null> {
  try {
    const plans = await readPlans(userId);
    const row = year === undefined
      ? plans.find((p) => isEffective(p))
      : plans.find((p) => p.state === 'scheduled' && p.year <= year);
    if (!row) return null;
    const items = await itemsFor(userId, row.year);
    // Current names follow category renames. Deleted categories retain their
    // snapshot for historical views rather than silently deleting plan history.
    return Object.fromEntries(items.filter((x) => year !== undefined || x.name !== null).map((x) => [x.name ?? x.category_name, Number(x.annual_amount)]));
  } catch (error) { if (annualSchemaUnavailable(error)) return null; throw error; }
}
function resultMessage(reason: string): string {
  if (reason === 'conflict') return 'This plan or your categories changed in another tab. Reload before saving.';
  if (reason === 'year') return 'The calendar year changed. Reload to plan the next year.';
  if (reason === 'unavailable') return 'Annual planning is not available yet. Your current budgets are unchanged.';
  return 'Check the category amounts and planning timezone, then try again.';
}
function parseResult(value: unknown): AnnualPlanResult {
  const r = value as { ok?: boolean; plan?: AnnualPlan | null; reason?: 'conflict' | 'year' | 'validation' | 'unavailable' };
  if (r?.ok) return { ok: true, plan: r.plan ?? null };
  const reason = r?.reason ?? 'validation';
  return { ok: false, reason, error: resultMessage(reason) };
}
function validAmounts(value: unknown): value is Record<string, number> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.entries(value).length <= 2000
    && Object.entries(value).every(([id, amount]) => id.length > 0 && id.length <= 200
      && typeof amount === 'number' && Number.isFinite(amount) && amount >= 0 && amount <= 9999999999.99
      && Math.abs(amount * 100 - Math.round(amount * 100)) < 0.0001);
}
export async function saveAnnualPlan(userId: string, input: SaveAnnualPlanInput): Promise<AnnualPlanResult> {
  if (!input || !Number.isInteger(input.year) || !isValidTimeZone(input.timeZone)
    || !['draft', 'scheduled'].includes(input.state)
    || (input.revision !== null && (!Number.isInteger(input.revision) || input.revision < 1))
    || !validAmounts(input.amounts) || !validAmounts(input.baseAmounts)) {
    return { ok: false, reason: 'validation', error: resultMessage('validation') };
  }
  try {
    const rows = await neonSql`SELECT pebble_save_annual_budget_plan(${userId}::uuid,${input.year},${input.timeZone},${input.state},${input.revision}::integer,${JSON.stringify(input.amounts)}::jsonb,${JSON.stringify(input.baseAmounts)}::jsonb) AS result`;
    return parseResult(rows[0]?.result);
  } catch (error) {
    if (annualSchemaUnavailable(error)) return { ok: false, reason: 'unavailable', error: resultMessage('unavailable') };
    throw error;
  }
}
export async function cancelAnnualPlan(userId: string, year: number, revision: number): Promise<AnnualPlanResult> {
  if (!Number.isInteger(year) || !Number.isInteger(revision) || revision < 1) return { ok: false, reason: 'validation', error: resultMessage('validation') };
  try {
    const rows = await neonSql`SELECT pebble_cancel_annual_budget_plan(${userId}::uuid,${year},${revision}) AS result`;
    return parseResult(rows[0]?.result);
  } catch (error) {
    if (annualSchemaUnavailable(error)) return { ok: false, reason: 'unavailable', error: resultMessage('unavailable') };
    throw error;
  }
}
/** Current edits are atomic, including legacy-only users. False means migration absent. */
export async function patchCurrentAnnualBudgets(userId: string, amounts: Record<string, number>): Promise<boolean> {
  try {
    const rows = await neonSql`SELECT pebble_patch_current_annual_budgets(${userId}::uuid,${JSON.stringify(amounts)}::jsonb) AS updated`;
    return rows[0]?.updated === true;
  } catch (error) {
    if (annualSchemaUnavailable(error)) {
      // Before the additive migration the function itself is absent. Once the
      // annual tables exist, failing over to legacy writes could hide edits
      // beneath an already-active annual plan, so fail rather than lose data.
      const tables = await neonSql`SELECT to_regclass('annual_budget_plan') AS relation`;
      if (tables[0]?.relation === null) return false;
    }
    throw error;
  }
}
