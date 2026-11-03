import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import vm from 'node:vm';

const source = buildSync({ entryPoints: ['src/lib/transactionBrand.ts'], bundle: true, write: false, platform: 'node', format: 'cjs' }).outputFiles[0].text;
const compiled = { exports: {} };
vm.runInNewContext(source, { module: compiled, exports: compiled.exports });
const detect = compiled.exports.detectTransactionBrand;

for (const [title, brand] of [
  ['Whole Foods', 'whole-foods-market'],
  ['WHOLEFDS BRK #10234', 'whole-foods-market'],
  ['Whole Foods Market — groceries', 'whole-foods-market'],
  ['Costco Wholesale #123', 'costco'],
  ['COSTCO.COM 800-774-2678', 'costco'],
  ['Amazon.com*AB123', 'amazon'],
  ['AMZN Mktp US*XYZ', 'amazon'],
  ['ＡＭＡＺＯＮ．ＣＯＭ', 'amazon'],
  ['PAYPAL *AMAZON MARKETPLACE', 'amazon'],
  ['SQ *STARBUCKS #456', 'starbucks'],
  ['Debit card purchase Walmart supercenter', 'walmart'],
  ["McDonald’s #10", 'mcdonalds'],
  ['Uber Eats', 'uber'],
  ['APPLE.COM/BILL', 'apple'],
  ['Target #123', 'target'],
  ['亚马逊', 'amazon'],
  ['开市客', 'costco'],
]) {
  test(`recognizes ${title}`, () => assert.equal(detect(title), brand));
}

test('unknown, partial and ambiguous descriptions keep their category icon', () => {
  for (const title of ['', 'Corner grocery', 'Costcooperative', 'Amazonian cafe', 'Starbucksish', 'Savings target', 'Apple pie', 'An apple', 'Subway fare reimbursement']) {
    // Subway is a merchant as well as a transport term; see the explicit guard.
    assert.equal(detect(title), null, title);
  }
});

test('only the visible title can identify a merchant, never hidden notes', () => {
  assert.equal(detect('Corner grocery\nCompared prices at Amazon'), null);
  assert.equal(detect('Rent\r\nCostco'), null);
  assert.equal(detect('Whole Foods\nweekly food'), 'whole-foods-market');
});
