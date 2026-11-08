import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import vm from 'node:vm';
const source = buildSync({entryPoints:['src/lib/cardGlow.ts'],bundle:true,write:false,platform:'node',format:'cjs'}).outputFiles[0].text;
for(const [touch,narrow] of [[true,false],[false,true],[true,true]]) test(`mobile glow skips SVG and observer machinery (${touch}, ${narrow})`,()=>{
  let listeners=0;
  const media=matches=>({matches,addEventListener(){listeners++},removeEventListener(){listeners--}});
  const compiled={exports:{}};
  vm.runInNewContext(source,{module:compiled,exports:compiled.exports,
    window:{matchMedia:q=>media(q.includes('pointer')?touch:narrow)},
    ResizeObserver:class{constructor(){throw Error('Native glow must not observe cards')}},
    document:{createElementNS(){throw Error('Native glow must not create SVG filters')}},
  });
  const layer={dataset:{}};
  const cleanup=compiled.exports.mountAdaptiveCardGlows(layer,'test');
  assert.equal(layer.dataset.pbGlowNative,'true');assert.equal(listeners,2);
  cleanup();assert.equal(layer.dataset.pbGlowNative,undefined);assert.equal(listeners,0);
});
