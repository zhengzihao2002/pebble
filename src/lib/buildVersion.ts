import { execFileSync } from 'node:child_process';
import { FEATURE_RELEASES, MAJOR_MILESTONES } from './releaseHistory';

export interface VersionCommit { sha: string; subject: string; body: string }
export function versionFromHistory(commits: VersionCommit[]) {
  let major = 0, minor = 0, patch = 0;
  for (const commit of commits) {
    const explicit = commit.body.match(/^Release-Type:\s*(major|minor|patch|none)\s*$/im)?.[1].toLowerCase();
    const knownMajor = Object.keys(MAJOR_MILESTONES).some(prefix => commit.sha.startsWith(prefix));
    const knownFeature = Object.keys(FEATURE_RELEASES).some(prefix => commit.sha.startsWith(prefix));
    const conventionalMajor = /^\w+(?:\([^)]*\))?!:/.test(commit.subject) || /^BREAKING[ -]CHANGE:/m.test(commit.body);
    const meta = /^(?:Merge\b|WIP\b|Initial commit\b|docs?(?:\([^)]*\))?:|test(?:\([^)]*\))?:|ci(?:\([^)]*\))?:)/i.test(commit.subject);
    const type = explicit ?? (knownMajor || conventionalMajor ? 'major' : knownFeature || /^feat(?:\([^)]*\))?:/i.test(commit.subject) ? 'minor' : meta || major === 0 ? 'none' : 'patch');
    if (type === 'major') { major++; minor = 0; patch = 0; }
    else if (type === 'minor') { minor++; patch = 0; }
    else if (type === 'patch') patch++;
  }
  return `${major}.${minor}.${patch}`;
}

/** Build-only: fetch missing history if necessary, never count a shallow clone
 * as a complete release history. No dependency updates or source mutations. */
export function resolveBuildVersion() {
  const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    if (git('rev-parse', '--is-shallow-repository') === 'true') git('fetch', '--unshallow', 'origin');
    const history = git('log', '--reverse', '--topo-order', '--format=%H%x1f%s%x1f%b%x1e', 'HEAD');
    const commits = history.split('\x1e').map(record => record.trim()).filter(Boolean).map(record => {
      const [sha, subject, ...body] = record.split('\x1f');
      return { sha, subject, body: body.join('\x1f') };
    });
    return { version: versionFromHistory(commits), count: git('rev-list', '--count', 'HEAD'), revision: git('rev-parse', '--short=7', 'HEAD') };
  } catch {
    // Source archives can have no Git history; show unavailable rather than a false number.
    return { version: '', count: '', revision: (process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || '').slice(0, 7) };
  }
}
