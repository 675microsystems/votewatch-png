import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000"),
  title: { default: "VoteWatch PNG", template: "%s · VoteWatch PNG" },
  description:
    "VoteWatch PNG: independent, offline-first vote tallies for Papua New Guinea candidate teams. Campaign-side tool, not an official election result system.",
  openGraph: { title: "VoteWatch PNG", description: "Independent, offline-first vote tallies for Papua New Guinea candidate teams.", images: [{ url: "/og.png", width: 1200, height: 630 }] },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#020c22" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
