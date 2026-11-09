import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import vm from 'node:vm';
const compiled = { exports: {} };
vm.runInNewContext(buildSync({ entryPoints: ['src/lib/preinitPreferences.ts'], bundle: true, write: false, platform: 'node', format: 'cjs' }).outputFiles[0].text, {module: compiled, exports: compiled.exports});
const script = compiled.exports.PREINIT_PREFERENCES_SCRIPT;
function boot({ prefs, system = false, broken = false, missingUser = false } = {}) {
  const classes = new Set(), attrs = new Map();
  const root = { classList: { add: c => classes.add(c) }, style: {}, setAttribute: (k,v) => attrs.set(k,v) };
  vm.runInNewContext(script, { document: { documentElement: root }, location: { pathname: '/dashboard' },
    localStorage: { getItem(key) { if (broken) throw Error('Storage unavailable'); if (key === 'pebble-ui:last-user') return 'alice'; if(key === 'pebble-ui:alice') return missingUser ? null : JSON.stringify({state:prefs}); if(key === 'pebble-ui') return JSON.stringify({state:{appearance:'dark',themeChoice:'sakura'}}); return null; } },
    sessionStorage: {getItem:()=>null}, matchMedia: () => ({matches:system}),
  });
  return { classes, attrs };
}
for (const [appearance, system, dark] of [['light',true,false],['dark',false,true],['system',true,true],['system',false,false]]) {
  test(`pre-paint honors ${appearance} with system dark=${system}`, () => {
    const f=boot({prefs:{appearance,themeChoice:'ocean'},system});
    assert.equal(f.classes.has('pebble-dark'),dark); assert.equal(f.attrs.get('data-pebble-theme'),'ocean');
  });
}
test('blocked storage still applies the device dark appearance',()=>assert.equal(boot({broken:true,system:true}).classes.has('pebble-dark'),true));
test('a known user without preferences never borrows an unrelated shared palette',()=>{
  const f=boot({missingUser:true});assert.equal(f.classes.has('pebble-dark'),false);assert.equal(f.attrs.has('data-pebble-theme'),false);
});
