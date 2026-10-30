/** Serializable annual planning data; monetary values are annual dollars. */
export interface AnnualPlan {
  year: number;
  state: 'draft' | 'scheduled';
  timeZone: string;
  revision: number;
  amounts: Record<string, number>; // stable category IDs
  baseAmounts: Record<string, number>;
  updatedAt: string;
}
export interface AnnualBudgetContext {
  year: number;
  timeZone: string;
  sourceYear: number | null;
  reviewed: boolean;
  nextPlan: AnnualPlan | null;
  available: boolean;
}
export interface AnnualPlannerData {
  year: number; // current year in the planning timezone; target is year + 1
  timeZone: string;
  currentAmounts: Record<string, number>; // stable category IDs
  plan: AnnualPlan | null;
  available: boolean;
}
export interface SaveAnnualPlanInput {
  year: number;
  timeZone: string;
  state: 'draft' | 'scheduled';
  revision: number | null;
  amounts: Record<string, number>;
  baseAmounts: Record<string, number>;
}
export type AnnualPlanResult = { ok: true; plan: AnnualPlan | null } | { ok: false; error: string; reason?: 'conflict' | 'year' | 'validation' | 'unavailable' };
