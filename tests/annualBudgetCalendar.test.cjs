const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pebble-calendar-'));
buildSync({entryPoints:[path.resolve('src/lib/budgets/calendar.ts')],bundle:true,platform:'node',format:'cjs',outfile:path.join(temp,'calendar.cjs')});
const {calendarYear,nextBudgetYearBoundary}=require(path.join(temp,'calendar.cjs'));
process.on('exit',()=>fs.rmSync(temp,{recursive:true,force:true}));
for(const year of [2026,2027,2028,2029,2030]) {
 for(const [zone,iso] of [['UTC',`${year+1}-01-01T00:00:00Z`],['America/New_York',`${year+1}-01-01T05:00:00Z`],['Asia/Shanghai',`${year}-12-31T16:00:00Z`],['Pacific/Kiritimati',`${year}-12-31T10:00:00Z`],['Pacific/Pago_Pago',`${year+1}-01-01T11:00:00Z`]]) {
  test(`January 1 ${year+1} in ${zone}`,()=>{
   const boundary=Date.parse(iso);
   assert.equal(nextBudgetYearBoundary(new Date(`${year}-07-01T00:00:00Z`),zone),boundary);
   assert.equal(calendarYear(new Date(boundary-1),zone),year);
   assert.equal(calendarYear(new Date(boundary),zone),year+1);
   assert.ok(nextBudgetYearBoundary(new Date(boundary),zone)>boundary);
  });
 }
}
