const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pebble-layout-'));
buildSync({entryPoints:{cache:path.resolve('src/components/loading/layoutCache.ts'),snapshot:path.resolve('src/components/loading/layoutSnapshot.ts')},bundle:true,platform:'node',format:'cjs',outdir:temp,outExtension:{'.js':'.cjs'}});
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
function seed(value) { values.set(cache.LAYOUT_CACHE_PREFIX+owner,JSON.stringify({version:2,entries:[value]})); }
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
 for(const change of [e=>e.savedAt=Date.now()-31*86400000,e=>e.boxes[0].height=Infinity,e=>e.boxes[0].width=9000,e=>e.boxes[0].x=-101,e=>e.boxes[0].kind='HTML',e=>e.boxes=Array(81).fill(e.boxes[0])]) {const e=entry();change(e);seed(e);assert.equal(cache.readPageLayout('/accounts',main),null);}
});
test('records geometry without reading card text, HTML, IDs or financial data',()=>{
 setup('geometry');const card={getBoundingClientRect:()=>({left:20,top:20,width:560,height:640}),closest:()=>null,contains:()=>false,matches:()=>false};
 for(const property of ['innerHTML','textContent','id']) Object.defineProperty(card,property,{get(){throw Error('Content must never be read')}});
 content={hidden:false,closest:()=>main,querySelector:()=>null,children:[],querySelectorAll:selector=>selector==='.pb-rise'?[]:[card]};
 cache.capturePageLayout('/accounts');const result=cache.readPageLayout('/accounts',main);assert.equal(result.boxes[0].height,640);assert.equal(result.boxes[0].radius,22);
 assert.deepEqual(Object.keys(result.boxes[0]).sort(),['flat','height','kind','radius','width','x','y']);
 cache.clearLayoutCache();cache.capturePageLayout('/accounts');assert.equal(localStorage.getItem(cache.LAYOUT_CACHE_PREFIX+owner),null);
});
test('explicit clearing and storage keys keep users separate',()=>{
 setup('first');seed(entry());assert(cache.readPageLayout('/accounts',main));
 owner='second';assert.equal(cache.readPageLayout('/accounts',main),null);seed(entry());
 owner='first';cache.clearLayoutCache();assert.equal(cache.readPageLayout('/accounts',main),null);
 owner='second';assert(cache.readPageLayout('/accounts',main));
});
test('the same page restores each signed-in user\'s own dimensions without a last-user fallback',()=>{
 setup('account-a');seed(entry());
 owner='account-b';assert.equal(cache.readPageLayout('/accounts',main),null);
 const second=entry();second.height=920;second.boxes[0].height=920;seed(second);
 assert.equal(cache.readPageLayout('/accounts',main).height,920);
 owner='account-a';assert.equal(cache.readPageLayout('/accounts',main).height,640);
 // The pre-hydration path must obey the same account boundary.
 const {layoutBootstrap}=require(path.join(temp,'snapshot.cjs'));
 const node=()=>({style:{},dataset:{},children:[],setAttribute(key,value){this[key]=value},removeAttribute(key){delete this[key]},append(child){this.children.push(child)},replaceChildren(...children){this.children=children}});
 const surface=node(),host=node();host.dataset.layoutPath='/accounts';host.closest=()=>main;host.querySelector=()=>surface;
 const doc={...document,currentScript:{parentElement:host},createElement:node};
 for(const [user,height] of [['account-a','640px'],['account-b','920px'],['new-account',null]]) {
   owner=user;
   require('node:vm').runInNewContext(layoutBootstrap,{document:doc,window,localStorage,getComputedStyle,Date});
   assert.equal(surface.children[0]?.style.height??null,height);
   assert.equal(host['data-layout-restored'],height?'true':undefined);
 }
 owner='account-a';cache.clearLayoutCache();
 owner='account-b';assert.equal(cache.readPageLayout('/accounts',main).height,920,'explicit clearing only removes the selected user');
});
test('unavailable storage is a harmless cache miss',()=>{
 setup('private');const original=localStorage.getItem;localStorage.getItem=()=>{throw Error('Blocked')};
 try { assert.equal(cache.readPageLayout('/accounts',main),null); } finally { localStorage.getItem=original; }
});
test('keeps full-width bars and space below the final card without clipping',()=>{
 setup('bleed');const card={getBoundingClientRect:()=>({left:0,top:20,width:600,height:64}),closest:()=>null,matches:()=>true};
 content={hidden:false,closest:()=>main,querySelector:()=>null,children:[{getBoundingClientRect:()=>({bottom:920})}],querySelectorAll:selector=>selector==='.pb-rise'?[]:[card]};
 cache.capturePageLayout('/accounts');const saved=cache.readPageLayout('/accounts',main);
 assert.equal(saved.boxes[0].x,-20);assert.equal(saved.boxes[0].width,600);assert.equal(saved.height,900);
});
test('streamed pre-paint restoration uses the same validated numeric geometry',()=>{
 setup('bootstrap');seed(entry());
 const {layoutBootstrap}=require(path.join(temp,'snapshot.cjs'));
 const node=()=>({style:{},dataset:{},children:[],setAttribute(key,value){this[key]=value},append(child){this.children.push(child)},replaceChildren(...children){this.children=children}});
 const surface=node(),host=node();host.dataset.layoutPath='/accounts';host.closest=()=>main;host.querySelector=()=>surface;
 const doc={...document,currentScript:{parentElement:host},createElement:node};
 require('node:vm').runInNewContext(layoutBootstrap,{document:doc,window,localStorage,getComputedStyle,Date});
 assert.equal(host['data-layout-restored'],'true');assert.equal(surface.children[0].style.height,'640px');
 assert.equal(surface.children[0].children[0].style.width,'560px');
 values.set(cache.LAYOUT_CACHE_PREFIX+owner,'invalid');host.removeAttribute=key=>delete host[key];
 require('node:vm').runInNewContext(layoutBootstrap,{document:doc,window,localStorage,getComputedStyle,Date});
 assert.equal(host['data-layout-restored'],undefined);assert.equal(surface.children.length,0);
 assert.equal(host['data-layout-ready'],'true','a genuine miss enables the ordinary page skeleton');
});
test('streamed hosts wait for attachment and a measurable main before choosing a skeleton',()=>{
 setup('staged-stream');seed(entry());
 const {layoutBootstrap}=require(path.join(temp,'snapshot.cjs'));
 const node=()=>({style:{},dataset:{},children:[],setAttribute(key,value){this[key]=value},append(child){this.children.push(child)},replaceChildren(...children){this.children=children}});
 const surface=node(),host=node();host.dataset.layoutPath='/accounts';host.isConnected=true;host.querySelector=()=>surface;
 let attached=null,notify,stopped=0;host.closest=()=>attached;
 class Changes {constructor(callback){notify=callback}observe(){}disconnect(){stopped++}}
 class Sizes {observe(){}disconnect(){stopped++}}
 const doc={...document,currentScript:{parentElement:host},createElement:node};
 require('node:vm').runInNewContext(layoutBootstrap,{document:doc,window,localStorage,getComputedStyle,Date,MutationObserver:Changes,ResizeObserver:Sizes});
 assert.equal(host['data-layout-ready'],undefined,'detached HTML is not a cache miss');
 attached=main;main.clientWidth=0;notify();
 assert.equal(host['data-layout-ready'],undefined,'a hidden staging container is not a cache miss');
 main.clientWidth=600;notify();
 assert.equal(host['data-layout-restored'],'true');assert.equal(host['data-layout-ready'],'true');
 assert.equal(surface.children[0].style.height,'640px');assert(stopped>=2,'temporary observers disconnect after restoration');
});
test('captures the four standalone Analysis income tiles without duplicating tiles inside cards',()=>{
 setup('income-tiles');window.location.pathname='/analysis';
 const shape=(left,top,width,height,parentElement)=>({parentElement,getBoundingClientRect:()=>({left,top,width,height}),closest:()=>null,matches:()=>false});
 content={hidden:false,closest:()=>main,querySelector:()=>null,children:[]};
 const group={parentElement:content};
 const tiles=Array.from({length:4},(_,i)=>shape(20+(i%2)*290,20+Math.floor(i/2)*120,270,100,group));
 const chart=shape(20,320,560,400,content),nested=shape(40,340,200,50,chart);
 content.querySelectorAll=selector=>selector==='.pb-rise'?[]:selector.includes('.pb-ana-tile')?[...tiles,chart,nested]:[chart];
 cache.capturePageLayout('/analysis');const saved=cache.readPageLayout('/analysis',main);
 assert.equal(saved.boxes.length,5);assert.equal(saved.boxes.filter(box=>box.width===270&&box.height===100).length,4);
 assert.equal(saved.boxes.filter(box=>box.width===200).length,0,'an existing outer card covers its own nested tiles');
 window.location.pathname='/accounts';
});
test('desktop Transactions captures only visible pane contours and ignores independently scrolled panes',()=>{
 setup('transaction-panes');window.location.pathname='/transactions';
 const pane={scrollTop:0,getBoundingClientRect:()=>({top:20,bottom:500})};
 const split={querySelectorAll:()=>[pane]};
 content={hidden:false,closest:()=>main,querySelector:selector=>selector==='.pb-txn-page[data-txn-panes]'?split:null,children:[{getBoundingClientRect:()=>({bottom:500})}]};
 const shape=(left,top,width,height,virtual=false)=>({parentElement:content,getBoundingClientRect:()=>({left,top,width,height}),closest:selector=>selector==='.pb-txn-pane'?pane:null,matches:selector=>virtual&&selector==='[data-pb-pane-shadow]'});
 const cards=[shape(20,20,260,200,true),shape(20,250,260,200,true),shape(20,600,260,200,true),shape(310,20,270,1800,true)];
 content.querySelectorAll=selector=>selector==='.pb-rise'?[]:cards;
 cache.capturePageLayout('/transactions');
 const saved=cache.readPageLayout('/transactions',main);
 assert.equal(saved.height,480);assert.equal(saved.boxes.length,3);
 assert.equal(saved.boxes.at(-1).height,480,'the long statement is clipped to its viewport');
 assert.equal(saved.boxes[0].flat,false,'the external shadow layer is part of the visible card');
 assert.equal(saved.boxes.at(-1).flat,false,'right-pane cards retain their external shadow too');
 const before=localStorage.getItem(cache.LAYOUT_CACHE_PREFIX+owner);
 pane.scrollTop=80;cache.capturePageLayout('/transactions');
 assert.equal(localStorage.getItem(cache.LAYOUT_CACHE_PREFIX+owner),before,'pane scrolling cannot replace the initial layout');
 window.location.pathname='/accounts';
});
