# Sounds

Drop audio files here, then regenerate the manifest:

    node scripts/generate-sound-manifest.mjs

That writes `src/lib/sound/manifest.ts`, which is what the Settings dropdowns
read. Files are NOT discovered at runtime — a directory here is served by the
CDN in production and is not reliably readable from server code, so the list is
baked in at build time instead. Adding a file without running the script means
it will not appear in Settings.

## Formats

`.mp3` is safest. `.wav`, `.ogg` and `.m4a` are also picked up, but browser
support varies — mp3 plays everywhere.

## Naming

The filename becomes the label shown in Settings:

    save-expense.mp3   ->  "Save expense"
    soft_chime.mp3     ->  "Soft chime"
    coin-drop.mp3      ->  "Coin drop"

So name them descriptively. Any filename works; these just read better than
`sound1.mp3`.

## What to look for

Short — 100–400ms. Anything longer overlaps the next interaction and starts to
feel laggy. Quiet and soft-edged: these fire on every save, and a bright
transient gets tiring fast. Trim leading silence, or the sound will feel
delayed even when it fires instantly.

## Sources

- freesound.org — large, free, check each licence (CC0 needs no attribution)
- pixabay.com/sound-effects — free for commercial use, no attribution
- zapsplat.com — free with an account

These are committed to the repo, so keep them small. Under ~50KB each is
comfortable.

## Defaults

Every event ships set to **No sound**. Nothing plays until it is chosen in
Settings, per event. Files present here are only *offered* — never applied
automatically.
