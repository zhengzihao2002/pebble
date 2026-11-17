import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const code=buildSync({entryPoints:['src/lib/buildVersion.ts'],bundle:true,write:false,platform:'node',format:'cjs'}).outputFiles[0].text;
const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports,require,process});
const {versionFromHistory}=module.exports;
const c=(sha,subject,body='')=>({sha,subject,body});
test('reviewed milestones and features reset the appropriate counters',()=>{
 assert.equal(versionFromHistory([c('1905497','Initial commit'),c('8215d03','App'),c('fix','Fix'),c('e92b744','Storage'),c('8019dd3','Accounts'),c('854e90c','Frame'),c('09dfcc0','Ghosts'),c('later','Fix dialog')]),'4.1.1');
});
test('explicit release footers and conventional commits govern future changes',()=>{
 let history=[c('8215d03','App'),c('a','New feature','Release-Type: minor'),c('b','Fix','Release-Type: patch')];
 assert.equal(versionFromHistory(history),'1.1.1');
 assert.equal(versionFromHistory([...history,c('c','Large change','Release-Type: major')]),'2.0.0');
 assert.equal(versionFromHistory([...history,c('d','Docs','Release-Type: none')]),'1.1.1');
 assert.equal(versionFromHistory([...history,c('e','feat: addition')]),'1.2.0');
 assert.equal(versionFromHistory([...history,c('f','feat!: incompatible change')]),'2.0.0');
});
test('merge, WIP and documentation-only commits do not create release bumps',()=>{
 assert.equal(versionFromHistory([c('8215d03','App'),c('a','Merge branch'),c('b','WIP: test'),c('c','docs: help')]),'1.0.0');
});
