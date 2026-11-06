/** Exercise the real private action with in-memory stubs; never load its DB imports. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from '@babel/parser';
import {transformSync} from 'esbuild';
const source=fs.readFileSync('src/lib/actions/pebble.ts','utf8');
const ast=parse(source,{sourceType:'module',plugins:['typescript']});
const fn=ast.program.body.find(n=>n.type==='FunctionDeclaration'&&n.id?.name==='chargeNextRecurring');
const compiled=transformSync(source.slice(fn.start,fn.end),{loader:'ts',target:'es2022'}).code;
let statements=[],reads=0;
const scope={fail:(error,kind,code)=>({ok:false,error,kind,code}),isYmd:v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v),getRecurringRuleById:async()=>{reads++;return{id:'rule',status:'active',kind:'income',materializedThrough:null,frequency:'monthly',startDate:'2026-12-01',endMode:'never',endCount:null,endDate:null}},resolveUserTimeZone:async()=> 'UTC',FALLBACK_TIME_ZONE:'UTC',todayInZone:()=> '2026-11-06',planChargeNext:()=>({early:true,occurrenceDate:'2026-12-01',transactionDate:'2026-11-06',newMaterializedThrough:'2026-12-01',nextAfter:'2027-01-01',finishesRule:false}),generateTransId:()=> 'synthetic',chargeNextStatement:(_,args)=>{statements.push(args);return args},neonSql:{transaction:async()=>[[],[{advanced:1,inserted:1}]]},userWriteLockStatement:()=>null,revalidateAll:()=>{},handleUnexpected:e=>{throw e}};
const action=vm.runInNewContext(compiled+'\nchargeNextRecurring;',scope);
const base={id:'rule',expectedOccurrence:'2026-12-01',expectedTransactionDate:'2026-11-06'};
test('selected text date never changes recording date or occurrence identity',async()=>{
 for(const [basis,date]of[['processed','2026-11-06'],['scheduled','2026-12-01']]){const result=await action('fixture-user',{...base,textDateBasis:basis});assert.equal(result.ok,true);assert.equal(statements.at(-1).textDate,date);assert.equal(statements.at(-1).transactionDate,'2026-11-06');assert.equal(statements.at(-1).occurrenceDate,'2026-12-01');}
 const result=await action('fixture-user',{id:'rule',expectedOccurrence:'2026-12-01'});assert.equal(result.ok,true);assert.equal(statements.at(-1).textDate,'2026-11-06','Older clients retain processed-date default');
});
test('untrusted choices and stale processing dates cannot write a payment',async()=>{
 for(const textDateBasis of ['arbitrary',null,{},'2027-05-01']){const before=reads;assert.equal((await action('fixture-user',{...base,textDateBasis})).ok,false);assert.equal(reads,before);}
 const before=statements.length;assert.equal((await action('fixture-user',{...base,expectedTransactionDate:'2026-11-05',textDateBasis:'processed'})).ok,false);assert.equal(statements.length,before,'A midnight/date rollover forces a fresh preview');
});
