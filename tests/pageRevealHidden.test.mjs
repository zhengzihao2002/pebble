import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
import vm from 'node:vm';
const source=buildSync({entryPoints:['src/components/loading/usePageReveal.ts'],bundle:true,write:false,external:['react','@/lib/chartReveal'],platform:'node',format:'cjs'}).outputFiles[0].text;
function fixture(hidden, spinner = false, direct = false) {
 let effect,mutation,dependencies,hasHost=!direct,sequence=0,busy=direct?[]:[{closest:()=>hidden?{}:null}];
 const visibleEvents=[],chartCalls={reveal:0,pause:0,dispose:0};
 const timers=new Map(),compiled={exports:{}},animations=[];
 const style=()=>({removeProperty(name){delete this[name==='min-height'?'minHeight':name];}});
 const node=()=>{const attributes=new Map();return{dataset:{},style:style(),classList:{add(){},remove(){}},setAttribute:(key,value)=>attributes.set(key,value),removeAttribute:key=>attributes.delete(key),hasAttribute:key=>attributes.has(key),append(){},remove(){},animate(){const a={cancel(){},onfinish:null};animations.push(a);return a;}};};
 const content={...node(),hidden:false,inert:false,querySelectorAll:s=>s.includes('aria-busy')?busy:[]};
 const rect={left:0,top:0,width:600,height:480};
 let clones=0;
 const host={closest:()=>null,hasAttribute:()=>true,getBoundingClientRect:()=>({...rect,height:spinner?0:rect.height}),querySelector:()=>({getBoundingClientRect:()=>rect,cloneNode:()=>{clones++;return node();}})};
 const persistentSpinner=node();
 const stage={...node(),querySelector:()=>spinner?persistentSpinner:null,querySelectorAll:()=>hasHost?[host]:[],getBoundingClientRect:()=>rect};
 const cancel=id=>timers.delete(id);
 vm.runInNewContext(source,{module:compiled,exports:compiled.exports,require:name=>name==='react'?{useLayoutEffect:(fn,deps)=>{effect=fn;dependencies=deps;}}:{createPageChartReveal:()=>({reveal(){chartCalls.reveal++;},pause(){chartCalls.pause++;},dispose(){chartCalls.dispose++;}})},
  CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},
  document:{documentElement:{getAttribute:()=>spinner?'spinner':'cached'},createElement:node,fonts:{status:'loaded',addEventListener(){},removeEventListener(){}}},
  MutationObserver:class{constructor(fn){mutation=fn;}observe(){}disconnect(){}},clearTimeout:cancel,
  window:{dispatchEvent:event=>visibleEvents.push(event),setTimeout:fn=>{timers.set(++sequence,fn);return sequence;},matchMedia:()=>({matches:false})}});
 compiled.exports.usePageReveal({current:stage},{current:content},'/dashboard');const cleanup=effect();
 hasHost=false;mutation();
 return{content,timers,cleanup,stage,visibleEvents,chartCalls,dependencies,get clones(){return clones;},
  nextFallback:()=>{hasHost=true;mutation();hasHost=false;mutation();},
  loaded:()=>{busy=[];mutation();},finish:()=>animations[0]?.onfinish?.(),
  flush:()=>{const current=[...timers.values()];timers.clear();current.forEach(fn=>fn());}};
}

test('background account-panel loaders do not delay revealing the visible panel',()=>{
 const f=fixture(true);assert.equal(f.timers.size,1);f.flush();assert.equal(f.content.inert,false);f.cleanup();
});

test('a visible panel loader still keeps the cached handoff until its data is ready',()=>{
 const f=fixture(false);assert.equal(f.timers.size,0);assert.equal(f.content.inert,true);
 f.loaded();assert.equal(f.timers.size,1);f.flush();assert.equal(f.content.inert,false);f.cleanup();
});

test('one persistent spinner survives fallback replacements and child loading without cloning or hiding',()=>{
 const f=fixture(false,true);assert.equal(f.clones,0);assert(f.stage.hasAttribute('data-pb-spinner-loading'));
 assert.equal(f.timers.size,0);assert.equal(f.content.inert,true);
 f.nextFallback();assert(f.stage.hasAttribute('data-pb-spinner-loading'));assert.equal(f.clones,0);
 f.loaded();f.flush();assert.equal(f.content.inert,false);assert(f.stage.hasAttribute('data-pb-spinner-loading'),'keep spinning through the fade');
 f.finish();assert(!f.stage.hasAttribute('data-pb-spinner-loading'));f.cleanup();
});


test('complete warm pages announce entry once without requiring a loading fallback',()=>{
 const f=fixture(false,false,true);
 assert.equal(f.content.dataset.pbPageVisible,'true');
 assert.equal(f.chartCalls.reveal,1);
 assert.equal(f.visibleEvents.length,1);
 assert.equal(f.visibleEvents[0].type,'pebble:page-visible');
 assert.equal(f.visibleEvents[0].detail.content,f.content);
 assert.equal(f.dependencies.at(-1),'/dashboard','Each actual pathname installs a fresh page reveal session');
 f.loaded();assert.equal(f.visibleEvents.length,1,'Ordinary child mutations do not replay the page');
 f.cleanup();assert.equal(f.chartCalls.dispose,1);assert.equal(f.content.dataset.pbPageVisible,undefined);
});

test('page-visible waits behind a busy cached handoff and starts with the data fade',()=>{
 const f=fixture(false);
 assert.equal(f.visibleEvents.length,0);assert.equal(f.content.dataset.pbPageVisible,undefined);
 f.loaded();assert.equal(f.visibleEvents.length,0);
 f.flush();assert.equal(f.visibleEvents.length,1);assert.equal(f.chartCalls.reveal,1);
 assert.equal(f.content.dataset.pbPageVisible,'true');f.cleanup();
});
