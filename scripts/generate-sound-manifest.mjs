#!/usr/bin/env node
/**
 * Scans public/sounds and writes src/lib/sound/manifest.ts.
 *
 * Run after adding or removing files:
 *   node scripts/generate-sound-manifest.mjs
 *
 * The manifest is generated rather than read at runtime because public/ is
 * served by the CDN in production and is not reliably readable from server
 * code — a runtime scan would work locally and return nothing on Vercel.
 */
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, extname, basename } from 'node:path';

const SOUND_DIR = join(process.cwd(), 'public', 'sounds');
const OUT_FILE = join(process.cwd(), 'src', 'lib', 'sound', 'manifest.ts');
const EXTS = new Set(['.mp3', '.wav', '.ogg', '.m4a']);

let files = [];
try {
  files = readdirSync(SOUND_DIR)
    .filter((f) => EXTS.has(extname(f).toLowerCase()))
    .sort((a, b) => a.localeCompare(b));
} catch {
  console.warn('public/sounds not found — writing an empty manifest.');
}

// "save-expense.mp3" -> "Save expense"
const toLabel = (file) => {
  const stem = basename(file, extname(file)).replace(/[-_]+/g, ' ').trim();
  return stem.charAt(0).toUpperCase() + stem.slice(1);
};

const entries = files.map((file) => ({
  // The filename IS the id: stable across regenerations, so a stored
  // preference keeps pointing at the same file. Renaming a file therefore
  // orphans any preference referring to it — playback treats an unknown id
  // as silence rather than erroring.
  id: file,
  label: toLabel(file),
  src: `/sounds/${encodeURIComponent(file)}`,
}));

const body = entries.length === 0
  ? 'export const SOUND_FILES: SoundFile[] = [];\n'
  : 'export const SOUND_FILES: SoundFile[] = [\n'
    + entries.map((e) =>
        `  { id: ${JSON.stringify(e.id)}, label: ${JSON.stringify(e.label)}, src: ${JSON.stringify(e.src)} },`
      ).join('\n')
    + '\n];\n';

const out = `// GENERATED FILE — do not edit by hand.
// Regenerate with: node scripts/generate-sound-manifest.mjs
//
// Lists the audio files present in public/sounds at the time the script ran.
// An empty array is a valid, expected state: every event then offers only
// "No sound".

export interface SoundFile {
  /** Filename, used as the stored preference value. */
  id: string;
  /** Human label shown in Settings, derived from the filename. */
  label: string;
  /** Public URL for playback. */
  src: string;
}

${body}
export function findSoundFile(id: string | null | undefined): SoundFile | undefined {
  if (!id) return undefined;
  return SOUND_FILES.find((f) => f.id === id);
}
`;

mkdirSync(join(process.cwd(), 'src', 'lib', 'sound'), { recursive: true });
writeFileSync(OUT_FILE, out, 'utf8');
console.log(`Wrote ${OUT_FILE} — ${entries.length} sound(s):`);
entries.forEach((e) => console.log(`  ${e.label}  (${e.id})`));
