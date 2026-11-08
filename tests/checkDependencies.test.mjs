import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureDependencies } from '../scripts/check-dependencies.mjs';

async function fixture(runTest) {
  const cwd = await mkdtemp(join(tmpdir(), 'pebble-deps-'));
  const manifest = JSON.stringify({ dependencies: { next: '16.4.5', '@scope/lib': '1.0.0' }, devDependencies: { typescript: '7.0.2' } });
  const lock = '{"lockfileVersion":3,"test":"preserve exact bytes"}';
  await writeFile(join(cwd, 'package.json'), manifest);
  await writeFile(join(cwd, 'package-lock.json'), lock);
  const put = async names => {
    for (const name of names) {
      const path = join(cwd, 'node_modules', name);
      await mkdir(path, { recursive: true });
      await writeFile(join(path, 'package.json'), '{"version":"already-installed"}');
    }
  };
  try { await runTest({ cwd, put });
    assert.equal(await readFile(join(cwd, 'package.json'), 'utf8'), manifest);
    assert.equal(await readFile(join(cwd, 'package-lock.json'), 'utf8'), lock);
  } finally { await rm(cwd, { recursive: true, force: true }); }
}

test('installed direct and scoped packages need no registry lookup or install', () => fixture(async ({ cwd, put }) => {
  await put(['next', '@scope/lib', 'typescript']);
  await ensureDependencies({ cwd, run: () => { throw new Error('Must stay local'); } });
}));

test('missing packages restore the committed versions once, then pass the local check', () => fixture(async ({ cwd, put }) => {
  await put(['next']);
  const calls = [];
  await ensureDependencies({ cwd, run: async args => {
    calls.push(args);
    await put(['@scope/lib', 'typescript']);
  } });
  assert.deepEqual(calls, [['ci', '--include=dev', '--no-audit', '--no-fund']]);
  await ensureDependencies({ cwd, run: () => { throw new Error('Second run must not install'); } });
}));

test('failed or incomplete installs stop the build instead of silently continuing', () => fixture(async ({ cwd }) => {
  await assert.rejects(ensureDependencies({ cwd, run: async () => { throw new Error('Install failed'); } }), /Install failed/);
  await assert.rejects(ensureDependencies({ cwd, run: async () => {} }), /Dependencies still missing/);
}));

test('deploy and lifecycle commands keep existing locked versions', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  const vercel = JSON.parse(await readFile('vercel.json', 'utf8'));
  assert.equal(pkg.scripts.prebuild, 'npm run deps:check');
  assert.equal(pkg.scripts.predev, 'npm run deps:check');
  assert.equal(pkg.scripts['deps:update'], undefined);
  assert.equal(vercel.installCommand, 'node scripts/check-dependencies.mjs');
});
