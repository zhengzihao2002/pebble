import { execFile, spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

async function runNpm(args, { cwd, inherit = false }) {
  if (!inherit) return (await execute(npm, args, { cwd, maxBuffer: 8 * 1024 * 1024 })).stdout;
  await new Promise((accept, reject) => {
    const child = spawn(npm, args, { cwd, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? accept() : reject(new Error(`npm exited with code ${code}`)));
  });
}

/** No application dependencies required: Vercel can run this before install.
 * Ask the configured npm registry for its latest tags on every invocation.
 * Never silently start/build with old packages after a failed update.
 */
export async function updateDependencies({ cwd = process.cwd(), run = runNpm } = {}) {
  const manifestPath = resolve(cwd, 'package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const names = [...new Set([...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.devDependencies ?? {})])];
  console.log(`Checking the latest releases of ${names.length} dependencies…`);
  const versions = new Map();
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(6, names.length) }, async () => {
    while (index < names.length) {
      const name = names[index++];
      const result = await run(['view', `${name}@latest`, 'version', '--json', '--prefer-online'], { cwd });
      const version = JSON.parse(result);
      if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)) {
        throw new Error(`No valid latest version returned for ${name}`);
      }
      versions.set(name, version);
    }
  }));
  let changed = false;
  for (const group of ['dependencies', 'devDependencies']) {
    for (const name of Object.keys(manifest[group] ?? {})) {
      const version = versions.get(name);
      if (manifest[group][name] !== version) {
        console.log(`${name}: ${manifest[group][name]} → ${version}`);
        manifest[group][name] = version;
        changed = true;
      }
    }
  }
  if (changed) await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  // Also refresh nested dependencies to the newest versions allowed by their
  // owning libraries. npm retains those libraries' compatibility constraints.
  await run(['update', '--include=dev', '--no-audit', '--no-fund', '--prefer-online'], { cwd, inherit: true });
  console.log('Dependencies are current. package-lock.json records the installed versions.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  updateDependencies().catch(error => {
    console.error(`Dependency update failed; startup/build stopped: ${error.message}`);
    process.exitCode = 1;
  });
}
