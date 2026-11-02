import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
import vm from 'node:vm';
const source=buildSync({entryPoints:['src/components/loading/usePageReveal.ts'],bundle:true,write:false,external:['react'],platform:'node',format:'cjs'}).outputFiles[0].text;
function fixture(hidden) {
 let effect,mutation,hasHost=true,sequence=0,busy=[{closest:()=>hidden?{}:null}];
 const timers=new Map(),compiled={exports:{}};
 const style=()=>({removeProperty(name){delete this[name==='min-height'?'minHeight':name];}});
 const node=()=>({style:style(),classList:{add(){},remove(){}},setAttribute(){},append(){},remove(){},animate(){return{cancel(){},onfinish:null};}});
 const content={...node(),hidden:false,inert:false,querySelectorAll:s=>s.includes('aria-busy')?busy:[]};
 const rect={left:0,top:0,width:600,height:480};
 const host={closest:()=>null,hasAttribute:()=>true,getBoundingClientRect:()=>rect,querySelector:()=>({getBoundingClientRect:()=>rect,cloneNode:()=>node()})};
 const stage={...node(),querySelectorAll:()=>hasHost?[host]:[],getBoundingClientRect:()=>rect};
 const cancel=id=>timers.delete(id);
 vm.runInNewContext(source,{module:compiled,exports:compiled.exports,require:()=>({useLayoutEffect:fn=>{effect=fn;}}),
  document:{createElement:node,fonts:{status:'loaded',addEventListener(){},removeEventListener(){}}},
  MutationObserver:class{constructor(fn){mutation=fn;}observe(){}disconnect(){}},clearTimeout:cancel,
  window:{setTimeout:fn=>{timers.set(++sequence,fn);return sequence;},matchMedia:()=>({matches:false})}});
 compiled.exports.usePageReveal({current:stage},{current:content});const cleanup=effect();
 hasHost=false;mutation();
 return{content,timers,cleanup,loaded:()=>{busy=[];mutation();},flush:()=>{const current=[...timers.values()];timers.clear();current.forEach(fn=>fn());}};
}

test('background account-panel loaders do not delay revealing the visible panel',()=>{
 const f=fixture(true);assert.equal(f.timers.size,1);f.flush();assert.equal(f.content.inert,false);f.cleanup();
});

test('a visible panel loader still keeps the cached handoff until its data is ready',()=>{
 const f=fixture(false);assert.equal(f.timers.size,0);assert.equal(f.content.inert,true);
 f.loaded();assert.equal(f.timers.size,1);f.flush();assert.equal(f.content.inert,false);f.cleanup();
});
