import type { Metadata, Viewport } from "next";
import { Fraunces, Work_Sans, IBM_Plex_Mono, Nunito, Source_Serif_4, Atkinson_Hyperlegible, Noto_Serif_SC } from "next/font/google";
import "./globals.css";
// The redesign's stylesheets, after globals.css so they layer on top of it.
// One file per area keeps each page's rules together and reviewable.
import "@/styles/redesign/kit.css";
import "@/styles/redesign/shell.css";
import "@/styles/redesign/ambient-background.css";
import "@/styles/redesign/card-glow.css";
import "@/styles/redesign/dashboard.css";
import "@/styles/redesign/transactions.css";
import "@/styles/redesign/transaction-dialogs.css";
import "@/styles/redesign/accounts.css";
import "@/styles/redesign/reports.css";
import "@/styles/redesign/analysis.css";
import "@/styles/redesign/insights.css";
import "@/styles/redesign/budgets.css";
import "@/styles/redesign/annual-planner.css";
import "@/styles/redesign/annual-allocation.css";
import "@/styles/redesign/annual-entry.css";
import "@/styles/redesign/sticky-bars.css";
import "@/styles/redesign/goals.css";
import "@/styles/redesign/scheduled.css";
import "@/styles/redesign/settings.css";
import "@/styles/redesign/offline.css";
import "@/styles/redesign/loading-feedback.css";
import "@/styles/redesign/nav-glass.css";
import "@/styles/redesign/rolling-amounts.css";
import "@/styles/redesign/brand-icons.css";
import { PebbleAuthUIProvider } from "@/components/providers/PebbleAuthUIProvider";
import { PREINIT_PREFERENCES_SCRIPT } from "@/lib/preinitPreferences";
import { HtmlPreferenceSync } from "@/components/providers/HtmlPreferenceSync";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
});

const workSans = Work_Sans({
  subsets: ["latin"],
  variable: "--font-work-sans",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ibm-plex-mono",
});

// Settings > Appearance > Font. preload: false - each family's @font-face is
// declared, but a file only downloads once text actually uses it, so these
// cost nothing for anyone on the default.
const nunito = Nunito({ subsets: ["latin"], variable: "--font-nunito", preload: false });
const sourceSerif = Source_Serif_4({ subsets: ["latin"], variable: "--font-source-serif", preload: false });
const atkinson = Atkinson_Hyperlegible({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-atkinson",
  preload: false,
});

// Backup for the Chinese serif choice only. It sits AFTER the installed
// Chinese serifs in the --cjk override, so a device with Songti or SimSun
// never downloads it; Google serves it in unicode-range slices, so a device
// without one fetches only the characters actually on screen.
const notoSerifSC = Noto_Serif_SC({
  subsets: ["latin"],
  variable: "--font-noto-serif-sc",
  preload: false,
});

export const metadata: Metadata = {
  title: "Pebble",
  description: "Pebble budgeting app",
  manifest: "/manifest.json",
  // favicon.ico in app/ is linked automatically. The SVG is listed here, not
  // left as an app/icon.svg file: Next drops file-based icons whenever this
  // icons object is set, which it must be for the apple icon.
  icons: {
    icon: [{ url: "/icons/icon.svg", type: "image/svg+xml", sizes: "any" }],
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Pebble",
  },
};

// themeColor lives here, not in `metadata` - deprecated there since Next 14.
// A single static value, not a light/dark media-query pair: Pebble's dark
// mode is the manual `pebble-dark` class toggle in the pre-paint script
// above, not the OS-level prefers-color-scheme a media-query themeColor
// would actually be responding to. --pine (#1F5A45) is the fixed brand
// color in both themes, so one value is correct here, not a simplification.
export const viewport: Viewport = {
  // No zoom of any kind. maximumScale stops iOS zooming into a text field
  // on focus; pinch is also cancelled in AppShell (gesture events) and by
  // touch-action in globals.css. Text size is how things are enlarged.
  maximumScale: 1,
  userScalable: false,
  themeColor: "#1F5A45",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fraunces.variable} ${workSans.variable} ${ibmPlexMono.variable} ${nunito.variable} ${sourceSerif.variable} ${atkinson.variable} ${notoSerifSC.variable} h-full antialiased`}
    >
      <head>
        {/*
          Runs before first paint, which is the whole point: appearance lives in
          localStorage, the server cannot read it, so without this the server
          renders light, the browser paints light, and hydration then corrects
          it - a visible flash on every load.

          The key and field name are IMPORTED from storageKeys.ts, which the
          store also imports, so renaming either propagates here instead of
          silently restoring the flash. The remaining coupling is
          zustand-persist's {state:{...}} envelope - that shape belongs to the
          library, so it cannot be derived from anything we control.

          Wrapped in try/catch because localStorage throws outright in some
          privacy modes, and a theme preference is never worth breaking the
          page for. suppressHydrationWarning on <html> above is what makes the
          resulting server/client class mismatch acceptable.
        */}
        {/* A RAW <script>, not next/script. strategy="beforeInteractive"
            does not inline this: Next emits it as a push into self.__next_s
            for its client runtime to execute after hydration, which is long
            after first paint. The class this sets was therefore never present
            for the CSS at the top of globals.css to key on - the dark-mode
            flash on every reload. A plain script tag in the SSR'd HTML runs
            synchronously at parse time, which is the guarantee needed here. */}
        <script
          id="pebble-preinit"
          dangerouslySetInnerHTML={{
            __html: PREINIT_PREFERENCES_SCRIPT,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <PebbleAuthUIProvider>
          <HtmlPreferenceSync />
          {children}
        </PebbleAuthUIProvider>
      </body>
    </html>
  );
}
