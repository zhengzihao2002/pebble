import type { NextConfig } from "next";

// One id per build, inlined into server and browser code (src/lib/offline/buildId.ts).
// The offline page cache (public/sw.js) uses it to drop saved pages that were
// rendered by a previous build. Deploy hosts that expose the commit give the
// same id to every instance of a deployment; otherwise it is the time this
// build started.
const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || Date.now().toString(36);

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_PEBBLE_BUILD: BUILD_ID },
  async headers() {
    return [
      {
        // The service worker must never be served from a cache, or a fix to it
        // (or to the sign-out clearing it does) would reach people late.
        // Service-Worker-Allowed makes the root scope explicit.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        // The reachability probe (src/lib/offline/connectivity.ts) and the
        // fallback page must reflect the network and the current deploy.
        source: "/ping.txt",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
      {
        source: "/offline.html",
        headers: [{ key: "Cache-Control", value: "no-cache, max-age=0, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
