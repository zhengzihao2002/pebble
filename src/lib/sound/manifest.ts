// GENERATED FILE — do not edit by hand.
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

export const SOUND_FILES: SoundFile[] = [
  { id: "ApplePay.mp3", label: "ApplePay", src: "/sounds/ApplePay.mp3" },
  { id: "click.mp3", label: "Click", src: "/sounds/click.mp3" },
  { id: "click2.mp3", label: "Click2", src: "/sounds/click2.mp3" },
  { id: "QQ上线.mp3", label: "QQ上线", src: "/sounds/QQ%E4%B8%8A%E7%BA%BF.mp3" },
  { id: "QQ加好友.mp3", label: "QQ加好友", src: "/sounds/QQ%E5%8A%A0%E5%A5%BD%E5%8F%8B.mp3" },
  { id: "QQ好友消息.mp3", label: "QQ好友消息", src: "/sounds/QQ%E5%A5%BD%E5%8F%8B%E6%B6%88%E6%81%AF.mp3" },
];

export function findSoundFile(id: string | null | undefined): SoundFile | undefined {
  if (!id) return undefined;
  return SOUND_FILES.find((f) => f.id === id);
}
