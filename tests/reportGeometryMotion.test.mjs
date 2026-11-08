import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import vm from 'node:vm';
const code = buildSync({entryPoints:['src/components/reports/reportGeometryMotion.ts'],bundle:true,write:false,platform:'node',format:'cjs'}).outputFiles[0].text;
const compiled={exports:{}};vm.runInNewContext(code,{module:compiled,exports:compiled.exports});
const rect=(left,top,width,height)=>({left,top,width,height,right:left+width,bottom:top+height});
for (const right of [false,true]) test(`surface bounds and corner curvature stay coupled (${right?'right':'left'} anchor)`,()=>{
  const before=right?rect(1100,80,44,152):rect(40,80,1040,350);
  const after=right?rect(816,80,328,530):rect(40,80,756,650);
  const frames=compiled.exports.reportGeometryFrames(before,after,24,right);
  for(let i=0;i<frames.length;i++){
    const f=frames[i],p=i/(frames.length-1),scale=f.transform.match(/scale\(([^,]+), ([^)]+)\)/).slice(1).map(Number);
    assert.ok(!('width' in f)&&!('height' in f),'Every surface uses transforms rather than layout animation');
    const width=after.width*scale[0],height=after.height*scale[1];
    assert.ok(Math.abs(width-(before.width+(after.width-before.width)*p))<1e-8);
    assert.ok(Math.abs(height-(before.height+(after.height-before.height)*p))<1e-8);
    const radii=f.borderRadius.split(' / ').map(parseFloat),expected=Math.min(24,width/2,height/2);
    assert.ok(Math.abs(radii[0]*scale[0]-expected)<1e-8,'Visible x radius remains stable');
    assert.ok(Math.abs(radii[1]*scale[1]-expected)<1e-8,'Visible y radius remains stable');
  }
});
