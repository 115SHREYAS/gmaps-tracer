import type { Metadata, Viewport } from "next";
import "./globals.css";
import "maplibre-gl/dist/maplibre-gl.css";
import { Nav } from "@/components/nav";
import { SessionBanner } from "@/components/session-banner";

export const metadata: Metadata = {
  title: "GpsLocationTracer",
  description: "Self-hosted Google Maps location sharing history tracker",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "GPSTracer",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0e16",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex h-dvh flex-col overflow-hidden bg-bg text-ink antialiased">
        <Nav />
        <SessionBanner />
        <main className="min-h-0 flex-1">{children}</main>
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));}`,
          }}
        />
      </body>
    </html>
  );
}
