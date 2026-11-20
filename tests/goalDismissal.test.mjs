import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import { buildSync } from 'esbuild';

const require = createRequire(import.meta.url);
const source = buildSync({
  stdin: { contents: `
    export { orderGoals } from './src/components/goals/goalMath';
    export { usePebbleStore, switchPebbleUser } from './src/store/usePebbleStore';
  `, resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
}).outputFiles[0].text;

function fixture(values = new Map()) {
  const compiled = { exports: {} };
  const localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  vm.runInNewContext(source, { module: compiled, exports: compiled.exports, require, console, window: { localStorage } });
  return { ...compiled.exports, values };
}

test('dismissal separates only achieved goals and preserves the supplied records and amounts', () => {
  const { orderGoals } = fixture();
  const achieved = { id: 'car', name: 'Car', date: '2026-12-01', target: 500, current: 625 };
  const achievedVisible = { id: 'trip', name: 'Trip', date: '2027-02-01', target: 500, current: 500 };
  const inProgress = { id: 'home', name: 'Home', date: '2027-01-01', target: 5000, current: 1000 };
  const goals = [achieved, achievedVisible, inProgress];
  const ordered = orderGoals(goals, ['car', 'home']);
  assert.equal(ordered.inProgress[0], inProgress);
  assert.equal(ordered.reached[0], achievedVisible);
  assert.equal(ordered.dismissed[0], achieved);
  assert.equal(ordered.dismissed.length, 1);
  assert.deepEqual(Array.from(ordered.visible), [achievedVisible, inProgress]);
  assert.equal(goals.reduce((sum, goal) => sum + goal.current, 0), 2125);
  assert.equal(orderGoals(goals).reached.length, 2);
  assert.equal(orderGoals(goals).dismissed.length, 0);
});

test('dismiss and restore persist locally for the signed-in owner and stay isolated by account', async () => {
  const first = fixture();
  await first.switchPebbleUser('alice');
  first.usePebbleStore.getState().setGoalDismissed('car', true);
  first.usePebbleStore.getState().setGoalDismissed('car', true);
  const reload = fixture(first.values);
  assert.deepEqual(Array.from(reload.usePebbleStore.getState().dismissedGoalIds), ['car']);

  await reload.switchPebbleUser('bob');
  assert.equal(reload.usePebbleStore.getState().dismissedGoalIds.length, 0);
  reload.usePebbleStore.getState().setGoalDismissed('trip', true);
  await reload.switchPebbleUser('alice');
  reload.usePebbleStore.getState().setGoalDismissed('car', false);
  assert.equal(fixture(reload.values).usePebbleStore.getState().dismissedGoalIds.length, 0);
  await reload.switchPebbleUser('bob');
  assert.deepEqual(Array.from(reload.usePebbleStore.getState().dismissedGoalIds), ['trip']);
});
