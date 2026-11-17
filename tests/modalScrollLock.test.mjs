import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { buildSync } from 'esbuild';
const source = buildSync({entryPoints:['src/lib/modalScrollLock.ts'],bundle:true,write:false,platform:'node',format:'cjs'}).outputFiles[0].text;
test('nested dialogs keep background scrolling locked and restore the previous styles', () => {
  class Element {
    values = new Map();
    style = { getPropertyValue: key => this.values.get(key) ?? '', setProperty: (key,value) => this.values.set(key,value), removeProperty: key => this.values.delete(key) };
  }
  const host = new Element(), html = new Element(), body = new Element();
  host.style.setProperty('overflow','auto');
  html.style.setProperty('overscroll-behavior','contain');
  const module = {exports:{}};
  vm.runInNewContext(source,{module,exports:module.exports,HTMLElement:Element,document:{scrollingElement:html,body}});
  const outer = module.exports.lockModalBackground(host);
  const inner = module.exports.lockModalBackground(host);
  inner();
  for (const el of [host,html,body]) assert.equal(el.style.getPropertyValue('overflow'),'hidden');
  outer();
  assert.equal(host.style.getPropertyValue('overflow'),'auto');
  assert.equal(html.style.getPropertyValue('overscroll-behavior'),'contain');
  assert.equal(body.values.size,0);
});
