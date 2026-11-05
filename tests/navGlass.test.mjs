import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import vm from 'node:vm';

const source=buildSync({entryPoints:['src/components/layout/useNavGlass.ts'],bundle:true,write:false,external:['react'],platform:'node',format:'cjs'}).outputFiles[0].text;
function fixture({visible=true,width=100,selector}={}) {
 let effect, resize, refIndex=0, sequence=0, lastSelector;
 const frames=new Map(), compiled={exports:{}}, style={};
 const bounds={left:10,top:20,width:visible?240:0,height:visible?40:0};
 const item={left:120,top:24,width,height:32};
 const target={getBoundingClientRect:()=>item};
 const host={dataset:{},clientLeft:1,clientTop:1,scrollLeft:0,scrollTop:0,
  getBoundingClientRect:()=>bounds,querySelector:s=>{lastSelector=s;return target;},querySelectorAll:()=>[target],addEventListener(){},removeEventListener(){}};
 const refs=[{current:host},{current:{style}}];
 vm.runInNewContext(source,{module:compiled,exports:compiled.exports,
  require:()=>({useRef:initial=>{const index=refIndex++;return refs[index]??(refs[index]={current:initial});},useLayoutEffect:fn=>{effect=fn;}}),
  ResizeObserver:class{constructor(fn){resize=fn;}observe(){}disconnect(){}},
  window:{addEventListener(){},removeEventListener(){}},
  document:{documentElement:{}},getComputedStyle:()=>({fontSize:'16px'}),
  requestAnimationFrame:fn=>{frames.set(++sequence,fn);return sequence;},cancelAnimationFrame:id=>frames.delete(id)});
 let dispose;
 const render=selection=>{refIndex=0;compiled.exports.useNavGlass(selection,false,selector);dispose?.();dispose=effect();};
 render('security');
 const cleanup=()=>dispose?.();
 const flush=()=>{for(let i=0;frames.size&&i<10;i++){const current=[...frames.values()];frames.clear();current.forEach(fn=>fn());}};
 return {host,style,bounds,item,cleanup,select:render,selector:()=>lastSelector,flush,resize:()=>{resize();flush();}};
}

test('an initially hidden account selector places a full pill when it becomes visible',()=>{
 const f=fixture({visible:false,selector:'[aria-current="page"]'});
 assert.equal(f.host.dataset.pbGlassReady,undefined);assert.equal(f.style.width,undefined);
 f.bounds.width=240;f.bounds.height=40;f.resize();
 assert.equal(f.host.dataset.pbGlassReady,'true');assert.equal(f.style.width,'100px');
 assert.equal(f.style.height,'32px');assert.equal(f.style.transform,'translate3d(109px, 3px, 0)');
 assert.equal(f.selector(),'[aria-current="page"]');f.cleanup();
});

test('a zero-width selected link never exposes a collapsed indicator',()=>{
 const f=fixture({width:0,selector:'[aria-current="page"]'});
 assert.equal(f.host.dataset.pbGlassReady,undefined);assert.equal(f.style.width,undefined);
 f.item.width=120;f.resize();assert.equal(f.style.width,'120px');assert.equal(f.host.dataset.pbGlassReady,'true');
 f.item.width=0;f.resize();assert.equal(f.host.dataset.pbGlassReady,undefined);f.cleanup();
});

test('label or text-size changes remeasure the existing account pill',()=>{
 const f=fixture({selector:'[aria-current="page"]'});f.flush();f.item.width=156;f.item.left=22;f.resize();
 assert.equal(f.style.width,'156px');assert.equal(f.style.transform,'translate3d(11px, 3px, 0)');f.cleanup();
});

test('main navigation retains its exclusions for the separated Settings destination',()=>{
 const f=fixture();assert(f.selector().includes(':not([href="/settings"])'));assert(f.selector().includes(':not([href^="/account/"])'));f.cleanup();
});

test('initial placement and late font/layout changes do not animate the selected pill',()=>{
 const f=fixture();f.flush();
 assert.equal(f.host.dataset.pbGlassAnimated,undefined);
 assert.equal(f.host.dataset.pbGlassNavigated,undefined);
 f.item.top+=2;f.item.width+=1;f.resize();
 assert.equal(f.host.dataset.pbGlassAnimated,undefined);
 assert.equal(f.host.dataset.pbGlassNavigated,undefined);
 assert.equal(f.style.width,'101px');assert.equal(f.style.transform,'translate3d(109px, 5px, 0)');f.cleanup();
});

test('only destination changes animate, and an unchanged observer notification keeps the glide',()=>{
 const f=fixture();f.flush();f.item.top+=40;f.select('profile');
 assert.equal(f.host.dataset.pbGlassAnimated,'true');
 assert.equal(f.host.dataset.pbGlassNavigated,'true');
 // CSSStyleDeclaration normalizes style strings independently of layout.
 f.style.transform=f.style.transform.replace(', 0)',', 0px)');f.style.height='32.0000px';
 f.resize();assert.equal(f.host.dataset.pbGlassAnimated,'true');
 f.item.width+=20;f.resize();assert.equal(f.host.dataset.pbGlassAnimated,undefined);
 assert.equal(f.style.width,'120px');f.cleanup();
});
