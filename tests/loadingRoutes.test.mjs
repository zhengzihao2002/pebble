import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const loadBundle=createRequire(import.meta.url);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'pebble-route-skeleton-'));
process.on('exit',()=>fs.rmSync(temp,{recursive:true,force:true}));

for(const route of ['reports','analysis','transactions'])for(const style of ['cached','spinner'])test(`${route} route fallback uses ${style} loading before hydration`,()=>{
 const outfile=path.join(temp,route+'.cjs');
 buildSync({stdin:{contents:`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import Loading from './src/app/(app)/${route}/loading';export const render=()=>renderToStaticMarkup(React.createElement(Loading));`,resolveDir:process.cwd()},bundle:true,jsx:'automatic',platform:'node',format:'cjs',outfile});
 const html=loadBundle(outfile).render();
 const script=html.match(/<script>(.*?)<\/script>/s)?.[1];
 assert(script,'the route must send the cache bootstrap while data is pending');
 assert(html.includes(`data-layout-path="/${route}"`),'the fallback must use its own page profile');
 const node=()=>({dataset:{},style:{},children:[],setAttribute(key,value){this[key]=value},append(child){this.children.push(child)},replaceChildren(...children){this.children=children}});
 const values=new Map();
 const host=node(),surface=node(),main={clientWidth:600,closest:()=>({querySelector:()=>({getBoundingClientRect:()=>({height:112.5})})})},root={lang:'en',getAttribute:key=>key==='data-pb-loading-style'?style:null,style:{getPropertyValue:key=>values.get(key),setProperty:(key,value)=>values.set(key,value)}};
 const stage=node();
 host.dataset.layoutPath='/'+route;host.closest=selector=>selector==='.pebble-main'?main:selector==='.pb-navigation-stage'?stage:null;host.querySelector=()=>surface;host.getBoundingClientRect=()=>({width:600});
 const layout={key:JSON.stringify([route,560,1024,768,'16px','en',null,null]),savedAt:Date.now(),width:560,height:480,boxes:[{x:0,y:0,width:560,height:480,radius:16,kind:'card',flat:true}]};
 let cacheReads=0;
 const context={document:{documentElement:root,currentScript:{parentElement:host},querySelector:()=>({content:'route-user|test'}),createElement:node},window:{innerWidth:1024,innerHeight:768},localStorage:{getItem:()=>{cacheReads++;return JSON.stringify({version:2,entries:[layout]})}},getComputedStyle:e=>e===root?{fontSize:'16px'}:{paddingLeft:'20px',paddingRight:'20px'}};
 host.removeAttribute=key=>{delete host[key]};
 vm.runInNewContext(script,context);
 assert(html.includes('class="pb-loading-traditional" role="status"'),'streamed HTML must contain the accessible spinner without waiting for React');
 assert.equal(host['data-layout-ready'],'true');
 if(style==='spinner') {
   assert.equal(stage['data-pb-spinner-loading'],'true','streamed fallback must show the persistent spinner before hydration');
   assert.equal(host['data-layout-restored'],undefined);
   assert.equal(surface.children.length,0,'spinner must not create hidden cached cards');
   assert.equal(cacheReads,0,'spinner must skip the layout cache entirely');
 } else {
   assert.equal(host['data-layout-restored'],'true');
   assert.equal(surface.children[0].children[0].style.height,'480px');
 }
 assert.equal(values.get('--pb-header-layout-h'),'112.5px','every loader must use the rendered header before hydration');
});
