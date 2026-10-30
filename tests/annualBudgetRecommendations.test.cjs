/** Isolated pure-function regression checks. Never loads the DB/auth clients. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const req = createRequire(path.resolve(__dirname, '../package.json'));
const { buildSync } = req('esbuild');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pebble-budget-recommendations-'));
try {
  const bundle = path.join(dir, 'recommendations.cjs');
  buildSync({ entryPoints: [path.resolve(__dirname, '../src/lib/budgets/recommendations.ts')], outfile: bundle, bundle: true, platform: 'node', format: 'cjs' });
  const { recommendAnnualBudgets } = require(bundle);
  const categories = [{ id: 'groceries', name: 'Groceries', iconKey: 'ShoppingCart', color: '#123456', isSystem: false, sortOrder: 0 }];
  let serial = 0;
  function expense(month, amount, day = '01', extra = {}) { return { id: String(++serial), type: 'expense', category: 'Groceries', date: `${month}-${day}`, amount: -amount, description: '', paymentMethod: 'Cash', accountId: 'cash', ...extra }; }
  function income(month) { return { id: String(++serial), type: 'income', category: 'Standard Income', date: `${month}-01`, amount: 1000, grossAmount: 1000, netAmount: 1000, description: '', paymentMethod: 'Cash', accountId: 'cash' }; }
  function months(start, count) { const i = Number(start.slice(0, 4)) * 12 + Number(start.slice(5, 7)) - 1; return Array.from({ length: count }, (_, j) => `${Math.floor((i + j) / 12)}-${String((i + j) % 12 + 1).padStart(2, '0')}`); }
  function recommend(transactions, current = 1500, today = '2027-01-01') { return recommendAnnualBudgets({ transactions, categories, currentAmounts: { groceries: current }, today })[0]; }
  const year = months('2026-01', 12);
  const stable = year.map((m) => expense(m, 100));
  const steady = recommend(stable, 1320);
  assert.equal(steady.amount, 1320); assert.equal(steady.confidence, 'high'); assert.equal(steady.sampleMonths, 12); assert.equal(steady.baselineAnnual, 1200);
  const unused = recommend(stable, 2400);
  assert.equal(unused.reason, 'unusedRoom'); assert.equal(unused.amount, 1920); assert.equal(unused.changePercent, -20, 'decrease is capped for review');
  const noData = recommend([], 4500);
  assert.equal(noData.reason, 'noHistory'); assert.equal(noData.amount, 4500); assert.equal(noData.baselineAnnual, null);
  const inProgress = recommend([expense('2026-10', 99999)], 4500, '2026-10-29');
  assert.equal(inProgress.amount, 4500); assert.equal(inProgress.reason, 'noHistory', 'in-progress month cannot affect annual decisions');
  const hugeCurrentMonth = recommend([...stable, expense('2027-01', 50000)], 1320);
  assert.deepEqual(hugeCurrentMonth, steady, 'an unfinished month cannot skew recommendations');
  const partialFirst = recommend([expense('2026-01', 5000, '15'), ...year.slice(1).map((m) => expense(m, 100))], 2400);
  assert.equal(partialFirst.sampleMonths, 11); assert.equal(partialFirst.amount, 2400); assert.equal(partialFirst.reason, 'limitedHistory');
  const short = recommend(year.slice(9).map((m) => expense(m, 100)), 2400);
  assert.equal(short.sampleMonths, 3); assert.equal(short.amount, 2400); assert.equal(short.reason, 'limitedHistory');
  const newCategory = recommend(stable, 0);
  assert.equal(newCategory.reason, 'newBudget'); assert.equal(newCategory.changePercent, null); assert.equal(newCategory.amount, 1320);
  const rising = recommend(year.map((m, i) => expense(m, i >= 9 ? 200 : 100)), 1400);
  assert.equal(rising.reason, 'risingSpending'); assert.equal(rising.trendPercent, 100); assert.ok(rising.amount > 2000); assert.ok(rising.changePercent > 0);
  const falling = recommend(year.map((m, i) => expense(m, i >= 9 ? 100 : 200)), 2500);
  assert.equal(falling.reason, 'fallingSpending'); assert.equal(falling.trendPercent, -50); assert.equal(falling.amount, 2000);
  const spike = recommend([...stable, expense('2026-06', 5000, '15')], 1320);
  assert.equal(spike.reason, 'unusualSpike'); assert.equal(spike.excludedSpikeAmount, 5000); assert.equal(spike.amount, 1320, 'one purchase cannot inflate the recurring annual budget or justify a reduction');
  const seasonalRows = [...year.map(income), expense('2026-01', 1000), expense('2026-12', 2000)];
  const seasonal = recommend(seasonalRows, 4000);
  assert.equal(seasonal.reason, 'seasonalSpending'); assert.equal(seasonal.amount, 4000, 'seasonal spending never justifies a cut');
  const annualPeak = recommend([...months('2025-01', 24).map((m) => expense(m, 100)), expense('2025-06', 5000), expense('2026-06', 5000)], 1320);
  assert.equal(annualPeak.reason, 'seasonalSpending'); assert.equal(annualPeak.excludedSpikeAmount, 0, 'a repeating yearly bill is not discarded as a one-off'); assert.ok(annualPeak.amount > 6000);
  for (const count of [3, 4, 5]) {
    const sparse = recommend([...year.slice(0, count).map(income), expense('2026-01', 10000)], 1500, `2026-${String(count + 1).padStart(2, '0')}-01`);
    assert.equal(sparse.amount, 1500, 'a lone annual bill must not be annualized from a partial year');
    assert.equal(sparse.reason, 'seasonalSpending');
    const sparseNew = recommend([...year.slice(0, count).map(income), expense('2026-01', 10000)], 0, `2026-${String(count + 1).padStart(2, '0')}-01`);
    assert.equal(sparseNew.amount, 0, 'do not propose a 4x annual allowance for an isolated new-category purchase');
  }
  const dormant = recommend(stable.filter((t) => !['2026-04', '2026-05', '2026-06'].some((m) => t.date.startsWith(m))), 2400);
  assert.equal(dormant.sampleMonths, 9); assert.equal(dormant.amount, 2400); assert.equal(dormant.reason, 'limitedHistory');
  const stale = recommend(stable.slice(0, -1), 2400);
  assert.equal(stale.reason, 'limitedHistory'); assert.equal(stale.amount, 2400, 'unobserved trailing months do not count as zeros');
  const incomeOnly = recommend(year.map(income), 2400);
  assert.equal(incomeOnly.amount, 2400); assert.equal(incomeOnly.reason, 'noHistory');
  for (const y of [2028, 2029, 2030]) {
    const rows = months(`${y - 1}-01`, 12).map((m) => expense(m, 100));
    const nextYear = recommend(rows, 1320, `${y}-01-01`);
    assert.equal(nextYear.amount, 1320); assert.equal(nextYear.windowStart, `${y - 1}-01`); assert.equal(nextYear.windowEnd, `${y - 1}-12`);
  }
  const leapRows = months('2027-03', 12).map((m) => expense(m, 100));
  assert.equal(recommend(leapRows, 1320, '2028-03-01').sampleMonths, 12);
  const future = recommend([...stable, expense('2029-03', 999999)], 1320);
  assert.deepEqual(future, steady, 'future-dated expenses are excluded');
  const rounded = recommend(year.map((m) => expense(m, 100.01)), 0);
  assert.equal(rounded.amount, 1321, 'round up annual whole-dollar recommendation');
  const large = recommend(year.map((m) => expense(m, 9999999999)), 0);
  assert.equal(large.amount, 9999999999); assert.ok(Number.isFinite(large.amount));
  assert.throws(() => recommendAnnualBudgets({ transactions: [], categories, currentAmounts: {}, today: 'bad' }));
  console.log('PASS: annual budget recommendations — completed months, thin/stale history, dormant gaps, stable rates, sustained trends, capped decreases, new budgets, seasonal bills, disclosed one-offs, rounding, future dates and 2028–2030 rollover. No DB/auth imported.');
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
