const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pebble-layout-'));
buildSync({entryPoints:[path.resolve('src/components/loading/layoutCache.ts')],bundle:true,platform:'node',format:'cjs',outfile:path.join(temp,'cache.cjs')});
const cache = require(path.join(temp,'cache.cjs'));
process.on('exit',()=>fs.rmSync(temp,{recursive:true,force:true}));
const values = new Map();
let owner, content;
const html = { lang:'en', getAttribute:()=>null };
const main = { clientWidth:600, getBoundingClientRect:()=>({left:0,top:0}), closest:()=>({scrollTop:0}) };
global.window = {innerWidth:1024,innerHeight:768,location:{pathname:'/accounts'}};
global.document = {documentElement:html,querySelector:selector=>selector.startsWith('meta')?{content:owner+'|test'}:content};
global.localStorage = { getItem:key=>values.get(key)??null, setItem:(key,value)=>values.set(key,value), removeItem:key=>values.delete(key) };
global.getComputedStyle = element=>element===html?{fontSize:'16px'}:element===main?{paddingLeft:'20px',paddingRight:'20px',paddingTop:'20px'}:{visibility:'visible',borderTopLeftRadius:'22px',boxShadow:'none'};
function entry() { return {key:cache.layoutProfile('/accounts',main),savedAt:Date.now(),width:560,height:640,boxes:[{x:0,y:0,width:560,height:640,radius:22,kind:'card',flat:true}]}; }
function seed(value) { values.set(cache.LAYOUT_CACHE_PREFIX+owner,JSON.stringify({version:1,entries:[value]})); }
function setup(name) {owner=name;window.innerWidth=1024;window.innerHeight=768;html.lang='en';main.clientWidth=600;content=null;}

test('reuses card sizes only for the same page, viewport and text layout',()=>{
 setup('profiles');seed(entry());assert.equal(cache.readPageLayout('/accounts',main).boxes[0].height,640);
 assert.equal(cache.readPageLayout('/goals',main),null);
 window.innerHeight=600;assert.equal(cache.readPageLayout('/accounts',main),null);window.innerHeight=768;
 main.clientWidth=375;assert.equal(cache.readPageLayout('/accounts',main),null);main.clientWidth=600;
 html.lang='zh';assert.equal(cache.readPageLayout('/accounts',main),null);
});
test('corrupt, expired, oversized and invalid geometry fall back safely',()=>{
 setup('validation');values.set(cache.LAYOUT_CACHE_PREFIX+owner,'not json');assert.equal(cache.readPageLayout('/accounts',main),null);
 for(const change of [e=>e.savedAt=Date.now()-31*86400000,e=>e.boxes[0].height=Infinity,e=>e.boxes[0].width=9000,e=>e.boxes[0].x=-1,e=>e.boxes[0].kind='HTML',e=>e.boxes=Array(81).fill(e.boxes[0])]) {const e=entry();change(e);seed(e);assert.equal(cache.readPageLayout('/accounts',main),null);}
});
test('records geometry without reading card text, HTML, IDs or financial data',()=>{
 setup('geometry');const card={getBoundingClientRect:()=>({left:20,top:20,width:560,height:640}),closest:()=>null,contains:()=>false,matches:()=>false};
 for(const property of ['innerHTML','textContent','id']) Object.defineProperty(card,property,{get(){throw Error('Content must never be read')}});
 content={hidden:false,closest:()=>main,querySelector:()=>null,querySelectorAll:()=>[card]};
 cache.capturePageLayout('/accounts');const result=cache.readPageLayout('/accounts',main);assert.equal(result.boxes[0].height,640);assert.equal(result.boxes[0].radius,22);
 assert.deepEqual(Object.keys(result.boxes[0]).sort(),['flat','height','kind','radius','width','x','y']);
 cache.clearLayoutCache();cache.capturePageLayout('/accounts');assert.equal(localStorage.getItem(cache.LAYOUT_CACHE_PREFIX+owner),null);
});
test('sign-out clearing and storage keys keep users separate',()=>{
 setup('first');seed(entry());assert(cache.readPageLayout('/accounts',main));
 owner='second';assert.equal(cache.readPageLayout('/accounts',main),null);seed(entry());
 owner='first';cache.clearLayoutCache();assert.equal(cache.readPageLayout('/accounts',main),null);
 owner='second';assert(cache.readPageLayout('/accounts',main));
});
test('unavailable storage is a harmless cache miss',()=>{
 setup('private');const original=localStorage.getItem;localStorage.getItem=()=>{throw Error('Blocked')};
 try { assert.equal(cache.readPageLayout('/accounts',main),null); } finally { localStorage.getItem=original; }
});
