import { createRequire, registerHooks } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

// TypeScript 7 removed the JS compiler API. Keep the app on the latest
// compiler, and run ESLint with the newest API its own peer range supports.
// The compatibility package is isolated tooling, never an app dependency.
const require = createRequire(import.meta.url);
const fromConfig = createRequire(require.resolve('eslint-config-next'));
const toolingPath = join(dirname(fromConfig.resolve('typescript-eslint')), '..', 'package.json');
const tooling = JSON.parse(await readFile(toolingPath, 'utf8'));
const compiler = require('typescript').version;
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const execute = promisify(execFile);
const { stdout } = await execute(npm, ['view', `typescript@${tooling.peerDependencies.typescript}`, 'version', '--json', '--prefer-online']);
const versions = JSON.parse(stdout);
const compatible = Array.isArray(versions) ? versions : [versions];
if (!compatible.includes(compiler)) {
  const version = compatible.at(-1);
  const cache = join(process.cwd(), 'node_modules', '.cache', 'pebble-eslint-api');
  const api = join(cache, 'node_modules', 'typescript', 'lib', 'typescript.js');
  let installed;
  try { installed = JSON.parse(await readFile(join(dirname(api), '..', 'package.json'), 'utf8')).version; } catch {}
  if (installed !== version) {
    await mkdir(cache, { recursive: true });
    await writeFile(join(cache, 'package.json'), '{"name":"pebble-eslint-api","private":true}\n');
    await execute(npm, ['install', '--prefix', cache, '--no-save', '--package-lock=false', '--ignore-scripts', '--no-fund', '--no-audit', `typescript@${version}`]);
  }
  console.log(`Lint uses TypeScript ${version}'s API; the app compiler remains ${compiler}.`);
  registerHooks({ resolve(specifier, context, next) {
    if (specifier === 'typescript') return { url: pathToFileURL(api).href, shortCircuit: true };
    return next(specifier, context);
  } });
}

const cli = join(dirname(require.resolve('eslint/package.json')), 'bin', 'eslint.js');
process.argv[1] = cli;
await import(pathToFileURL(cli).href);
