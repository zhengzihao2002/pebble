import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const code=buildSync({entryPoints:['src/lib/buildVersion.ts'],bundle:true,write:false,platform:'node',format:'cjs'}).outputFiles[0].text;
const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports,require,process});
const {versionFromHistory,resolveBuildVersion}=module.exports;
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
test('the actual full repository count and revision are available at build time',()=>{
 const result=resolveBuildVersion();assert.match(result.version,/^\d+\.\d+\.\d+$/);assert(+result.count>=359);assert.match(result.revision,/^[a-f0-9]{7,}$/);
 console.log('Current release:',result);
});

test('shallow checkouts expand history before counting; source archives use the prepared release snapshot',()=>{
 const calls=[];
 const fakeGit=(_cmd,args)=>{calls.push(args.join(' '));const key=args.join(' ');if(key==='rev-parse --is-shallow-repository')return 'true';if(key.startsWith('fetch'))return '';if(key.startsWith('log'))return '1905497\x1fInitial commit\x1f\x1e8215d03\x1fApp\x1f\x1efix0000\x1fFix\x1f\x1e';if(key==='rev-list --count HEAD')return '3';return 'fix0000';};
 const shallow={exports:{}};vm.runInNewContext(code,{module:shallow,exports:shallow.exports,process:{env:{}},require:name=>name==='node:child_process'?{execFileSync:fakeGit}:require(name)});
 const found=shallow.exports.resolveBuildVersion();
 assert.equal(found.count,'3');assert.equal(found.version,'1.0.1');assert(calls.indexOf('fetch --unshallow origin')<calls.indexOf('rev-list --count HEAD'));
 const missing={exports:{}};vm.runInNewContext(code,{module:missing,exports:missing.exports,process:{env:{}},require:name=>name==='node:child_process'?{execFileSync(){throw new Error('no Git')}}:require(name)});
 assert.match(missing.exports.resolveBuildVersion().version,/^\d+\.\d+\.\d+$/);
 assert(+missing.exports.resolveBuildVersion().count>=360);
});
