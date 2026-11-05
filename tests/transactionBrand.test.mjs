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

test('unknown descriptions keep their category icon', () => {
  for (const title of ['', 'Corner grocery', 'Rent', 'Train fare']) {
    assert.equal(detect(title), null, title);
  }
});

test('only the visible title can identify a merchant, never hidden notes', () => {
  assert.equal(detect('Corner grocery\nCompared prices at Amazon'), null);
  assert.equal(detect('Rent\r\nCostco'), null);
  assert.equal(detect('Whole Foods\nweekly food'), 'whole-foods-market');
});

test('matches brands throughout titles, including Claude and Apple', () => {
  for (const [title, brand] of [['Monthly Claude subscription','claude'],['Paid for Apple storage','apple'],['Apple','apple'],['Claude','claude'],['ClaudePro monthly','claude'],['Taxi via Uber','uber'],['Groceries at Whole Foods','whole-foods-market']]) assert.equal(detect(title),brand);
});

test('the first brand in title order wins, independent of registry order', () => {
  assert.equal(detect('Uber DoorDash'), 'uber');
  assert.equal(detect('DoorDash Uber'), 'doordash');
  assert.equal(detect('Apple Supercell'), 'apple');
  assert.equal(detect('Supercell Apple'), 'supercell');
});

test('QQ recognizes Tencent subscriptions in English and Chinese without matching tickers', () => {
  for (const title of ['QQ', 'QQ Music SVIP', 'QQ音乐绿钻年卡（双11特惠）', '充值 QQ音乐', 'qq music']) assert.equal(detect(title), 'qq', title);
  for (const title of ['QQQ', 'QQQM', 'Buy QQQM', 'NASDAQ QQQ', 'SQQQ']) assert.equal(detect(title), null, title);
  assert.equal(detect('Buy QQQM then QQ Music SVIP'), 'qq');
  assert.equal(detect('Supercell gems'), 'supercell');
});
