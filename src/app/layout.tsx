import type { Metadata } from "next";
import { Fraunces, Work_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { authClient } from "@/lib/auth/client";
import { NeonAuthUIProvider } from "@neondatabase/auth-ui";
import { DARK_MODE_FIELD, LOCALE_FIELD, PEBBLE_UI_STORAGE_KEY } from "@/store/storageKeys";

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

export const metadata: Metadata = {
  title: "Pebble",
  description: "Pebble budgeting app",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fraunces.variable} ${workSans.variable} ${ibmPlexMono.variable} h-full antialiased`}
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
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var s=localStorage.getItem(${JSON.stringify(PEBBLE_UI_STORAGE_KEY)});var p=s?JSON.parse(s).state:null;var d=p&&p[${JSON.stringify(DARK_MODE_FIELD)}];var l=p&&p[${JSON.stringify(LOCALE_FIELD)}];var e=document.documentElement;e.classList.add('no-theme-transition');if(d)e.classList.add('pebble-dark');if(l==='zh')e.lang='zh-CN';}catch(err){}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <NeonAuthUIProvider authClient={authClient} emailOTP>
          {children}
        </NeonAuthUIProvider>
      </body>
    </html>
  );
}
