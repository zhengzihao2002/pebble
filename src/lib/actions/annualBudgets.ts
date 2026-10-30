'use server';

import { revalidatePath } from 'next/cache';
import { withSessionUser } from './withSessionUser';
import { saveAnnualPlan, cancelAnnualPlan } from '@/lib/budgets/annualData';
import type { AnnualPlanResult, SaveAnnualPlanInput } from '@/lib/budgets/annualTypes';

function invalidate() {
  for (const path of ['/budgets', '/budgets/plan', '/dashboard', '/analysis', '/insights', '/reports', '/transactions']) revalidatePath(path);
}
async function save(userId: string, input: SaveAnnualPlanInput): Promise<AnnualPlanResult> {
  try {
    const result = await saveAnnualPlan(userId, input);
    if (result.ok) invalidate();
    return result;
  } catch (error) {
    console.error('[annual budgets] save failed', error);
    return { ok: false, error: "Couldn't save your plan. Please try again; your current budgets are unchanged." };
  }
}
async function cancel(userId: string, year: number, revision: number): Promise<AnnualPlanResult> {
  try {
    const result = await cancelAnnualPlan(userId, year, revision);
    if (result.ok) invalidate();
    return result;
  } catch (error) {
    console.error('[annual budgets] cancel failed', error);
    return { ok: false, error: "Couldn't cancel your plan. Please try again." };
  }
}
export const saveAnnualPlanAction = withSessionUser(save);
export const cancelAnnualPlanAction = withSessionUser(cancel);
