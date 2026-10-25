/**
 * Which build of the app this is. Set once per build in next.config.ts and
 * inlined into both the server and the browser code, so the signed-in layout
 * (which writes it into every page it renders) and the client agree.
 *
 * Why it exists: public/sw.js keeps a copy of each visited page. After a
 * deploy those copies point at the PREVIOUS build's code and Server Action
 * ids. A page carrying a different build id empties the saved pages first
 * (see storePage in sw.js), so old HTML never lingers beside new code.
 */
export const BUILD_ID: string = process.env.NEXT_PUBLIC_PEBBLE_BUILD || 'dev';
