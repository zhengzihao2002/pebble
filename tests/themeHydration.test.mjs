import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
import vm from 'node:vm';
const source=buildSync({entryPoints:['src/lib/htmlPreferences.ts'],bundle:true,write:false,platform:'node',format:'cjs',external:['@/store/usePebbleStore','@/lib/themeTransition']}).outputFiles[0].text;
function fixture(){
  let state={appearance:'dark',themeChoice:'ocean',locale:'zh',loadingStyle:'spinner'},repair,systemChange,fades=0;
  const subscribers=new Set(),classes=new Set(['pebble-dark']),attrs=new Map([['data-pebble-theme','ocean']]);
  const classList=set=>({contains:c=>set.has(c),toggle(c,on){if(on)set.add(c);else set.delete(c)}});
  const shell={classList:classList(new Set())},root={classList:classList(classes),getAttribute:k=>attrs.get(k)??null,setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k)};
  const system={matches:false,addEventListener(n,f){systemChange=f},removeEventListener(){systemChange=null}};
  const compiled={exports:{}};
  vm.runInNewContext(source,{module:compiled,exports:compiled.exports,document:{documentElement:root,querySelector:()=>shell},window:{matchMedia:()=>system},MutationObserver:class{constructor(f){repair=f}observe(){}disconnect(){repair=null}},require:n=>n.includes('usePebbleStore')?{usePebbleStore:{getState:()=>state,subscribe:f=>{subscribers.add(f);return()=>subscribers.delete(f)}}}:{themeChangePending:()=>false,runThemeChange:f=>{fades++;f()}}});
  return {root,classes,attrs,shell,system,mount:auth=>compiled.exports.mountHtmlPreferences(auth),repair:()=>repair(),fades:()=>fades,set(p){state={...state,...p};subscribers.forEach(f=>f())},systemChange:()=>systemChange(),subscribers};
}
test('hydration uses persisted state immediately and never fades through SSR defaults',()=>{
  const f=fixture(),stop=f.mount(false);
  assert.ok(f.classes.has('pebble-dark'));assert.equal(f.attrs.get('data-pebble-theme'),'ocean');assert.equal(f.attrs.get('lang'),'zh-CN');assert.equal(f.attrs.get('data-pb-loading-style'),'spinner');assert.equal(f.fades(),0);assert.ok(f.shell.classList.contains('dark'));stop();assert.equal(f.subscribers.size,0);
});
test('server attribute repairs restore the saved mode and palette without starting a transition',()=>{
  const f=fixture(),stop=f.mount(false);f.classes.clear();f.attrs.delete('data-pebble-theme');f.repair();assert.ok(f.classes.has('pebble-dark'));assert.equal(f.attrs.get('data-pebble-theme'),'ocean');assert.equal(f.fades(),0);stop();
});
test('actual appearance and palette changes still animate, including following the device',()=>{
  const f=fixture(),stop=f.mount(false);f.set({appearance:'light'});assert.equal(f.fades(),1);assert.equal(f.classes.has('pebble-dark'),false);f.set({themeChoice:'sakura'});assert.equal(f.fades(),2);assert.equal(f.attrs.get('data-pebble-theme'),'sakura');f.set({appearance:'system'});f.system.matches=true;f.systemChange();assert.ok(f.classes.has('pebble-dark'));stop();
});
test('auth pages consistently use the device and original palette',()=>{
  const f=fixture(),stop=f.mount(true);assert.equal(f.classes.has('pebble-dark'),false);assert.equal(f.attrs.has('data-pebble-theme'),false);f.system.matches=true;f.systemChange();assert.ok(f.classes.has('pebble-dark'));stop();
});
