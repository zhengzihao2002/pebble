import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const {createElement}=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const source=buildSync({entryPoints:['src/components/settings/AppVersion.tsx'],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',jsx:'automatic'}).outputFiles[0].text;
const compiled={exports:{}};
// Deliberately no process, document or Git/hosting globals in the renderer.
vm.runInNewContext(source,{module:compiled,exports:compiled.exports,require});
const version=JSON.parse(fs.readFileSync('src/lib/releaseSnapshot.json','utf8')).version;
for(const locale of ['en','zh'])test(`source-only app version renders in ${locale} without hosting metadata`,()=>{
 const html=renderToStaticMarkup(createElement(compiled.exports.AppVersion,{locale}));
 assert(html.includes(version));assert(html.includes('Pebble'));
 assert(html.includes(locale==='zh'?'版本':'Version'));
 assert(!html.includes('Build'));assert(!html.includes('<code'));
 assert(!html.includes('unavailable'));assert(!source.includes('VERCEL'));
});
