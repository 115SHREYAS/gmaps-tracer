import type { Metadata } from "next";
import "./globals.css";
import "maplibre-gl/dist/maplibre-gl.css";
import { Nav } from "@/components/nav";
import { SessionBanner } from "@/components/session-banner";

export const metadata: Metadata = {
  title: "GpsLocationTracer",
  description: "Self-hosted Google Maps location sharing history tracker",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased">
        <Nav />
        <SessionBanner />
        {children}
      </body>
    </html>
  );
}
