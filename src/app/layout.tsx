import type { Metadata } from "next";
import { Fraunces, Work_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { authClient } from "@/lib/auth/client";
import { NeonAuthUIProvider } from "@neondatabase/auth-ui";

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

          Reads the same 'pebble-ui' key the Zustand persist store writes, and
          knows its {state:{...}} envelope. That coupling is the cost of the
          fix; if the store's key or shape changes, this must change with it.

          Wrapped in try/catch because localStorage throws outright in some
          privacy modes, and a theme preference is never worth breaking the
          page for. suppressHydrationWarning on <html> above is what makes the
          resulting server/client class mismatch acceptable.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var s=localStorage.getItem('pebble-ui');var d=s&&JSON.parse(s).state.darkMode;var c=document.documentElement.classList;c.add('no-theme-transition');if(d)c.add('dark');}catch(e){}`,
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
