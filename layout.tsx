import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000"),
  title: { default: "VoteWatch PNG", template: "%s · VoteWatch PNG" },
  description:
    "VoteWatch PNG: independent, offline-first vote tallies for Papua New Guinea candidate teams. Campaign-side tool, not an official election result system.",
  openGraph: { title: "VoteWatch PNG", description: "Independent, offline-first vote tallies for Papua New Guinea candidate teams.", images: [{ url: "/og.png", width: 1200, height: 630 }] },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f8fe" },
    { media: "(prefers-color-scheme: dark)", color: "#020c22" },
  ],
};

// Runs before first paint so the saved (or system) theme never flashes the wrong colours.
const themeInit = `(function(){try{var t=localStorage.getItem("vw-theme");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="dark"}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeInit }} /></head>
      <body>
        {children}
        <Footer />
      </body>
    </html>
  );
}
