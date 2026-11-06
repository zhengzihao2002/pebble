const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildSync}=require('esbuild');
const vm=require('node:vm');
const source=buildSync({entryPoints:['src/components/layout/bottomNavSnapshot.ts'],bundle:true,write:false,platform:'node',format:'cjs'}).outputFiles[0].text;
const storage=new Map();
function fixture(user='one',width=390){
 const module={exports:{}};
 const html={lang:'en',getAttribute:()=>null};
 const indicator={style:{}};
 const nav={clientWidth:width,clientLeft:0,clientTop:1,style:{},dataset:{},getBoundingClientRect:()=>({width,height:82,left:0,top:700}),querySelector:s=>s==='.pb-nav-glass-indicator'?indicator:{getBoundingClientRect:()=>({left:8,top:708,width:74,height:62})}};
 const localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)};
 vm.runInNewContext(source,{module,exports:module.exports,document:{documentElement:html,fonts:{status:'loaded'},querySelector:()=>({content:user+'|fixture'})},location:{pathname:'/dashboard'},innerWidth:width,getComputedStyle:e=>e===html?{fontSize:'16px'}:{paddingBottom:'10px'},localStorage,Date});
 return{nav,indicator,tools:module.exports.bottomNavSnapshot(),html,localStorage};
}
test('a new runtime restores numeric bottom bar geometry from localStorage',()=>{
 storage.clear();const first=fixture();first.tools.capture(first.nav);
 const raw=storage.get('pebble-bottom-nav:v1:one');assert(raw);assert(!raw.includes('innerHTML'));
 const next=fixture();next.tools.restore(next.nav);assert.equal(next.nav.style.minHeight,'82px');assert.equal(next.indicator.style.width,'74px');assert.equal(next.nav.dataset.pbNavRestored,'true');
 const other=fixture('two');other.tools.restore(other.nav);assert.equal(other.nav.dataset.pbNavRestored,undefined);
 const wider=fixture('one',430);wider.tools.restore(wider.nav);assert.equal(wider.nav.dataset.pbNavRestored,undefined);
 next.html.lang='zh-CN';delete next.nav.dataset.pbNavRestored;next.tools.restore(next.nav);assert.equal(next.nav.dataset.pbNavRestored,undefined);
});
test('invalid, expired and unavailable storage safely skip restoration',()=>{
 for(const corrupt of ['{bad',JSON.stringify([null]),JSON.stringify([{key:'bad',height:Infinity}])]){const f=fixture();storage.set('pebble-bottom-nav:v1:one',corrupt);f.tools.restore(f.nav);assert.equal(f.nav.dataset.pbNavRestored,undefined)}
 storage.clear();const f=fixture();f.tools.capture(f.nav);const expired=JSON.parse(storage.get('pebble-bottom-nav:v1:one'));expired[0].savedAt=Date.now()-31*86400000;storage.set('pebble-bottom-nav:v1:one',JSON.stringify(expired));f.tools.restore(f.nav);assert.equal(f.nav.dataset.pbNavRestored,undefined);
 f.localStorage.getItem=()=>{throw Error('Unavailable')};assert.doesNotThrow(()=>f.tools.restore(f.nav));
});
