const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {buildSync}=require('esbuild');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'pebble-projection-'));
try{
const out=path.join(temp,'helper.cjs');buildSync({entryPoints:[path.resolve(__dirname,'../src/lib/budgets/spendingProjection.ts')],outfile:out,bundle:true,platform:'node',format:'cjs'});
const{projectCategorySpending,budgetQuickSet,budgetCurrencyAxis,budgetHistoryThroughToday}=require(out);
function history(current='2026-12',vals=600){const [y,m]=current.split('-').map(Number),end=y*12+m-1;const months=Array.from({length:25},(_,i)=>{const n=end-24+i;return Math.floor(n/12)+'-'+String(n%12+1).padStart(2,'0')});return{current,months,byCat:{Food:months.map((_,i)=>typeof vals==='function'?vals(i):vals)}}}
const observed = budgetHistoryThroughToday([{date:'2026-12-15',amount:-50,category:'Food'},{date:'2026-12-20',amount:-200,category:'Food'},{date:'2027-01-01',amount:-300,category:'Food'}],'2026-12-15');
assert.equal(observed.byCat.Food.at(-1),50,'future dates are not actual observations for a forecast');
assert.equal(observed.current,'2026-12');
const h=history();h.byCat.Food[24]=500;
const dec1=projectCategorySpending(h,'Food','2026-12-01',2026);assert.equal(dec1.averageMonthly,600);assert.equal(dec1.additions[11],580.65);assert.equal(dec1.remaining,580.65);assert.ok(dec1.additions.slice(0,11).every(v=>v===null));
const dec15=projectCategorySpending(h,'Food','2026-12-15',2026);assert.equal(dec15.remaining,309.68);
const dec31=projectCategorySpending(h,'Food','2026-12-31',2026);assert.equal(dec31.remaining,0);assert.equal(dec31.additions[11],0);
const nextJan=projectCategorySpending(history('2027-01'),'Food','2027-01-01',2027);assert.equal(nextJan.additions[0],580.65);assert.equal(nextJan.additions[11],600);assert.equal(nextJan.remaining,7180.65);
const leap=projectCategorySpending(history('2028-02',290),'Food','2028-02-28',2028);assert.equal(leap.additions[1],10);assert.equal(projectCategorySpending(history('2028-02',290),'Food','2028-02-29',2028).additions[1],0);
assert.equal(projectCategorySpending(h,'Food','2026-12-15',2025),null,'historical years never project');assert.equal(projectCategorySpending(h,'Food','2026-11-15',2026),null,'clock/history mismatch never projects');
assert.equal(projectCategorySpending(history('2026-12',i=>i===24?500:0),'Food','2026-12-01',2026),null,'one incomplete spending month is not a forecast');
assert.equal(projectCategorySpending(history('2026-12',i=>i===18?5000:0),'Food','2026-12-01',2026),null,'single annual bill does not create a monthly prediction');
assert.equal(projectCategorySpending(history('2026-12',0),'Food','2026-12-01',2026),null,'no history does not claim a zero forecast');
const noisy=history();noisy.byCat.Food[24]=500000;assert.equal(projectCategorySpending(noisy,'Food','2026-12-01',2026).averageMonthly,600,'unfinished month excluded from baseline');
assert.deepEqual(budgetQuickSet(h,'Food'),{sixMonthAnnual:7200,last12Total:7200});
assert.deepEqual(budgetQuickSet(history('2026-12',0),'Food'),{sixMonthAnnual:null,last12Total:null});
assert.deepEqual(budgetQuickSet({...h,months:h.months.slice(-3),byCat:{Food:h.byCat.Food.slice(-3)}},'Food'),{sixMonthAnnual:null,last12Total:null},'missing completed months do not imply zero spending');
for(const max of [0,.01,.03,1,123,1000,12500,500000,9999999999]){const axis=budgetCurrencyAxis([max,NaN,null]);assert.equal(axis.ticks[0],0);assert.ok(axis.domain[1]>=max);const step=axis.ticks[1];assert.ok(step>0);assert.ok(axis.ticks.every((v,i)=>Math.abs(v-i*step)<.001));assert.equal(new Set(axis.ticks).size,5,'small amounts retain distinct ticks');}
console.log('PASS: December partial-month estimates, December31zero, futuremonths, Jan rollover, leapyear, no-history/annualbill safeguards, currentmonth exclusion, quicksets and nice Yaxis increments. No DB/auth imported.');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
