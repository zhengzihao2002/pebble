import { spawn } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

async function install(args, { cwd }) {
  await new Promise((accept, reject) => {
    const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { cwd, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? accept() : reject(new Error(`npm exited with code ${code}`)));
  });
}

/** Check installed packages locally. Restore missing packages from the lockfile;
 * never query latest tags, update dependencies, or rewrite the manifest. */
export async function ensureDependencies({ cwd = process.cwd(), run = install } = {}) {
  const manifest = JSON.parse(await readFile(resolve(cwd, 'package.json'), 'utf8'));
  const names = [...new Set([...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.devDependencies ?? {})])];
  const missing = async () => (await Promise.all(names.map(async name => {
    try { await access(resolve(cwd, 'node_modules', name, 'package.json')); return null; }
    catch { return name; }
  }))).filter(Boolean);
  const absent = await missing();
  if (!absent.length) { console.log('Dependencies are installed. Keeping existing versions.'); return; }
  console.log(`Restoring missing dependencies from package-lock.json: ${absent.join(', ')}`);
  await run(['ci', '--include=dev', '--no-audit', '--no-fund'], { cwd });
  const remaining = await missing();
  if (remaining.length) throw new Error(`Dependencies still missing: ${remaining.join(', ')}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  ensureDependencies().catch(error => {
    console.error(`Dependency check failed: ${error.message}`);
    process.exitCode = 1;
  });
}
