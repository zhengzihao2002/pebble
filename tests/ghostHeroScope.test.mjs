import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const {createElement}=require('react');const {renderToStaticMarkup}=require('react-dom/server');
const code=(await build({stdin:{contents:"export {BalanceHero} from './src/components/dashboard/BalanceHero';export {TodayLedger} from './src/components/transactions/TodayLedger';",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'node',format:'cjs',packages:'external',jsx:'automatic',plugins:[{name:'stubs',setup(b){
 b.onResolve({filter:/^next\/navigation$|@\/lib\/actions\/pebble|@\/components\/loading\/PendingLink/},args=>({path:args.path,namespace:'stub'}));
 b.onLoad({filter:/.*/,namespace:'stub'},args=>({contents:args.path.includes('PendingLink')?"import React from 'react';export default function Link({prefetch,children,...props}){return <a {...props}>{children}</a>}":args.path.includes('navigation')?'export const useRouter=()=>({refresh(){}});':'export const setAccountGhostAction=async()=>({ok:true});',loader:'tsx',resolveDir:process.cwd()}));
}}]})).outputFiles[0].text;
const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports,require});
const accounts=[{id:'bank',name:'Everyday',kind:'bank',status:'active'},{id:'cash',name:'Ghost Cash',kind:'cash',status:'active',isGhost:true}];
const balancesByAccount={bank:100,cash:999};
test('dashboard ghost rows show own balances without joining shares or the headline',()=>{
 const html=renderToStaticMarkup(createElement(module.exports.BalanceHero,{accounts,balancesByAccount,totalBalance:100}));
 assert.match(html,/pb-rolling-accessible">\$100\.00/);
 assert.match(html,/Ghost account · excluded from total/);
 const ghost=html.match(/<li[^>]+pb-hero-ghost-row[\s\S]*?<\/li>/)?.[0];
 assert(ghost?.includes('Ghost Cash'));assert(ghost?.includes('$999.00'));
 assert(!ghost.includes('pb-dash-hero-share'));
});
test('transaction hero shows marked ghost balances while keeping the supplied normal total',()=>{
 const html=renderToStaticMarkup(createElement(module.exports.TodayLedger,{accounts,balancesByAccount,currentBalance:100,selectedAccountId:null,onPickAccount(){}}));
 assert.match(html,/pb-rolling-accessible">\$100\.00/);
 assert.match(html,/pb-txn-acc is-ghost/);assert.match(html,/Ghost Cash/);assert.match(html,/Ghost account/);assert.match(html,/\$999\.00/);
});
