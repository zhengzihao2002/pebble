import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const {createElement} = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
const code = (await build({entryPoints:['src/components/accounts/GhostAccountMode.tsx'],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',jsx:'automatic',plugins:[{name:'server-stubs',setup(b){
  b.onResolve({filter:/^next\/navigation$|@\/lib\/actions\/pebble/},args=>({path:args.path,namespace:'stub'}));
  b.onLoad({filter:/.*/,namespace:'stub'},args=>({contents:args.path==='next/navigation'?'export const useRouter=()=>({refresh(){}});':'export const setAccountGhostAction=async()=>({ok:true});'}));
}}]})).outputFiles[0].text;
const module = {exports:{}};
vm.runInNewContext(code,{module,exports:module.exports,require});
const {GhostAccountMode} = module.exports;
const account = {id:'a',name:'Account',status:'active',isDefault:false,isPreferred:false};
test('only cash and bank accounts offer ghost mode',()=>{
  for(const kind of ['cash','bank']) assert.match(renderToStaticMarkup(createElement(GhostAccountMode,{account:{...account,kind}})),/Ghost mode/);
  assert.equal(renderToStaticMarkup(createElement(GhostAccountMode,{account:{...account,kind:'credit'}})),'');
});
test('legacy ghost credit cards retain their restore control',()=>{
  assert.match(renderToStaticMarkup(createElement(GhostAccountMode,{account:{...account,kind:'credit',isGhost:true}})),/Include again/);
});
