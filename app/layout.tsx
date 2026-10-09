import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { NightMode } from "./night-mode";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Social crawlers need absolute URLs for the preview image. Set NEXT_PUBLIC_SITE_URL to the public
// address when deploying (Vercel's production URL is picked up automatically); the localhost
// fallback only makes sense for local development.
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

const TITLE = "Pokédex · DEX-LINK Field Scanner";
const DESCRIPTION =
  "Browse every Pokémon and alternate form. Search by name or number, filter by type and generation, and scan stats, abilities, evolutions and cries in a retro field-scanner interface.";

// The images come from the file conventions next to this file: icon.tsx, apple-icon.tsx,
// favicon.ico, opengraph-image.tsx and twitter-image.tsx.
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: TITLE, template: "%s · Pokédex" },
  description: DESCRIPTION,
  applicationName: "Pokédex",
  openGraph: { type: "website", siteName: "Pokédex", title: TITLE, description: DESCRIPTION, locale: "en_US" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: "#0a0e13",
  colorScheme: "dark",
};

// Runs before first paint: marks the first visit of each browser session so the intro overlay shows with no flash.
// Skipped for reduced-motion users and when storage is unavailable.
const BOOT_SCRIPT = `try{if(!sessionStorage.getItem("pokedex:booted")&&!matchMedia("(prefers-reduced-motion: reduce)").matches)document.documentElement.dataset.boot="play"}catch(e){}`;

// Night mode (midnight to 6am, local time). Set before first paint so there is no flash; night-mode.tsx
// then keeps it in step with the clock while the page is open.
const NIGHT_SCRIPT = `try{document.documentElement.dataset.night=new Date().getHours()<6?"1":"0"}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: NIGHT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}
        <div className="night-veil" aria-hidden />
        <NightMode />
      </body>
    </html>
  );
}
