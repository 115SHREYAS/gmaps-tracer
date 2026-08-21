"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

interface Status {
  hasCookies: boolean;
  sessionValid: boolean;
  lastError: string | null;
}

export function SessionBanner() {
  const pathname = usePathname();
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/sync/status", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as Status;
        if (!cancelled) setStatus(data);
      } catch {}
    }
    load();
    const id = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pathname]);

  if (pathname === "/login" || pathname === "/settings" || !status) return null;

  if (!status.hasCookies) {
    return (
      <div className="border-b border-amber-900/60 bg-amber-950/60 px-4 py-2 text-sm text-amber-200">
        No Google cookies uploaded yet — the poller cannot fetch locations.{" "}
        <Link href="/settings" className="font-medium underline">
          Add cookies.txt in Settings
        </Link>
      </div>
    );
  }

  if (!status.sessionValid) {
    return (
      <div className="border-b border-red-900/60 bg-red-950/60 px-4 py-2 text-sm text-red-200">
        Google session is invalid or expired{status.lastError ? ` (${status.lastError})` : ""} —{" "}
        <Link href="/settings" className="font-medium underline">
          re-export your cookies.txt
        </Link>
      </div>
    );
  }

  return null;
}
