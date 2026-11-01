import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the real private validator with in-memory ownership reads. Exporting
// it from the server-action module would expose a new callable server action.
const source=fs.readFileSync('src/lib/actions/pebble.ts','utf8');
const ast=ts.createSourceFile('pebble.ts',source,ts.ScriptTarget.Latest,true);
const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='normalizeRuleInput');
assert(fn);
const compiled=ts.transpileModule(fn.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const account={id:'owned-bank',status:'active',name:'Fixture bank'};
const scope={db:{select:()=>({from:()=>({where:()=>({limit:async()=>[account]})})})},account:{},and:()=>null,eq:()=>null,loadCards:async()=>new Set(),RECURRING_FREQUENCIES:['once','weekly','biweekly','monthly','yearly'],RECURRING_END_MODES:['never','after','on'],DATE_PATTERN:/^\d{4}-\d{2}-\d{2}$/,MAX_END_COUNT:1000,INCOME_CATEGORIES:['Standard Income','Side Cash'],isFiniteNumber:value=>typeof value==='number'&&Number.isFinite(value)};
const validate=vm.runInNewContext(compiled+'\nnormalizeRuleInput;',scope);
const base={kind:'income',description:'Fixture payout',category:'Side Cash',accountId:account.id,amount:125,frequency:'monthly',startDate:'2026-11-15',endMode:'never',endCount:null,endDate:null};

test('Side Cash schedules store one amount regardless of stale or omitted paycheck gross',async()=>{
 for(const grossAmount of [undefined,0,999,NaN]){
  const result=await validate('fixture-user',{...base,grossAmount});
  assert.equal(result.ok,true);assert.equal(result.values.amount,125);assert.equal(result.values.grossAmount,125);
 }
});
test('Standard Income preserves gross/net and rejects missing gross or net above gross',async()=>{
 const valid=await validate('fixture-user',{...base,category:'Standard Income',grossAmount:175});
 assert.equal(valid.ok,true);assert.equal(valid.values.grossAmount,175);assert.equal(valid.values.amount,125);
 for(const grossAmount of [undefined,0,-1,NaN,Infinity])assert.equal((await validate('fixture-user',{...base,category:'Standard Income',grossAmount})).code,'validation.ruleGrossAmountPositive');
 assert.equal((await validate('fixture-user',{...base,category:'Standard Income',grossAmount:100})).code,'validation.ruleNetExceedsGross');
});
test('the one-amount rule still rejects nonpositive amounts and invalid income categories',async()=>{
 for(const amount of [0,-5,NaN,Infinity])assert.equal((await validate('fixture-user',{...base,amount})).code,'validation.ruleAmountPositive');
 assert.equal((await validate('fixture-user',{...base,category:'invalid'})).code,'validation.ruleIncomeCategory');
});
