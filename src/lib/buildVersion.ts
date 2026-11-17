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
