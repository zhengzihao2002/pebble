import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { updateDependencies } from '../scripts/update-dependencies.mjs';

async function fixture(runTest) {
  const cwd = await mkdtemp(join(tmpdir(), 'pebble-deps-'));
  const initial = { scripts: { dev: 'next dev' }, dependencies: { next: '16.3.1', react: '^19' }, devDependencies: { typescript: '^5' }, overrides: { nested: '$react' } };
  const manifest = join(cwd, 'package.json');
  await writeFile(manifest, JSON.stringify(initial));
  try { await runTest({ cwd, manifest, initial }); }
  finally { await rm(cwd, { recursive: true, force: true }); }
}

test('each invocation checks every dependency and installs latest tags plus compatible nested updates', async () => {
  await fixture(async ({ cwd, manifest, initial }) => {
    const calls = [];
    let latest = { next: '16.4.4', react: '19.3.1', typescript: '7.0.2' };
    const run = async (args, options) => {
      calls.push({ args, options });
      if (args[0] === 'view') return JSON.stringify(latest[args[1].replace('@latest', '')]);
    };
    await updateDependencies({ cwd, run });
    const updated = JSON.parse(await readFile(manifest, 'utf8'));
    assert.deepEqual(updated.dependencies, { next: '16.4.4', react: '19.3.1' });
    assert.deepEqual(updated.devDependencies, { typescript: '7.0.2' });
    assert.deepEqual(updated.scripts, initial.scripts);
    assert.deepEqual(updated.overrides, initial.overrides);
    assert.equal(calls.filter(c => c.args[0] === 'view').length, 3);
    assert(calls.every(c => c.args.includes('--prefer-online')));
    assert.deepEqual(calls.at(-1).args, ['update', '--include=dev', '--no-audit', '--no-fund', '--prefer-online']);
    latest = { ...latest, react: '19.3.2' };
    await updateDependencies({ cwd, run });
    assert.equal(JSON.parse(await readFile(manifest, 'utf8')).dependencies.react, '19.3.2');
    assert.equal(calls.filter(c => c.args[0] === 'view').length, 6);
  });
});

test('registry failure stops the update without rewriting the manifest or installing stale versions', async () => {
  await fixture(async ({ cwd, manifest, initial }) => {
    const run = async args => { assert.equal(args[0], 'view'); throw new Error('Registry unavailable'); };
    await assert.rejects(updateDependencies({ cwd, run }), /Registry unavailable/);
    assert.deepEqual(JSON.parse(await readFile(manifest, 'utf8')), initial);
  });
});

test('installation errors propagate so startup/build cannot silently continue', async () => {
  await fixture(async ({ cwd }) => {
    const run = async args => { if (args[0] === 'view') return '"2.0.0"'; throw new Error('Peer dependency conflict'); };
    await assert.rejects(updateDependencies({ cwd, run }), /Peer dependency conflict/);
  });
});
