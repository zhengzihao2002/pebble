import type { Metadata, Viewport } from "next";
import { Fraunces, Work_Sans, IBM_Plex_Mono, Nunito, Source_Serif_4, Atkinson_Hyperlegible, Noto_Serif_SC } from "next/font/google";
import "./globals.css";
import { PebbleAuthUIProvider } from "@/components/providers/PebbleAuthUIProvider";
import { HtmlPreferenceSync } from "@/components/providers/HtmlPreferenceSync";
import { CJK_FONT_FIELD, DARK_MODE_FIELD, FONT_FIELD, LOCALE_FIELD, PEBBLE_UI_STORAGE_KEY, THEME_FIELD } from "@/store/storageKeys";
import { THEME_ATTRIBUTE, THEME_CHOICES } from "@/lib/themeChoice";
import { CJK_FONT_ATTRIBUTE, CJK_FONT_CHOICES, FONT_ATTRIBUTE, FONT_CHOICES } from "@/lib/fontChoice";

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
  icons: {
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
          Runs before first paint, which is the whole point: darkMode lives in
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
            __html: `try{var s=localStorage.getItem(${JSON.stringify(PEBBLE_UI_STORAGE_KEY)});var p=s?JSON.parse(s).state:null;var d=p&&p[${JSON.stringify(DARK_MODE_FIELD)}];var l=p&&p[${JSON.stringify(LOCALE_FIELD)}];var e=document.documentElement;e.classList.add('no-theme-transition');if(d)e.classList.add('pebble-dark');if(l==='zh')e.lang='zh-CN';var f=p&&p[${JSON.stringify(FONT_FIELD)}];if(f!=='default'&&${JSON.stringify(FONT_CHOICES)}.indexOf(f)>=0)e.setAttribute(${JSON.stringify(FONT_ATTRIBUTE)},f);var c=p&&p[${JSON.stringify(CJK_FONT_FIELD)}];if(c!=='sans'&&${JSON.stringify(CJK_FONT_CHOICES)}.indexOf(c)>=0)e.setAttribute(${JSON.stringify(CJK_FONT_ATTRIBUTE)},c);var h=p&&p[${JSON.stringify(THEME_FIELD)}];if(h!=='original'&&${JSON.stringify(THEME_CHOICES)}.indexOf(h)>=0)e.setAttribute(${JSON.stringify(THEME_ATTRIBUTE)},h);}catch(err){}`,
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
