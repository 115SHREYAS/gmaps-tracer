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
      <div className="flex shrink-0 items-center gap-2.5 border-b border-accent/25 bg-accent/[0.07] px-4 py-2 text-[13px] text-ink">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4 shrink-0 text-accent">
          <path d="M10 3 1.8 16.5h16.4L10 3Z" strokeLinejoin="round" />
          <path d="M10 8.2v3.4M10 14.2v.1" strokeLinecap="round" />
        </svg>
        <span className="text-muted">
          No Google cookies uploaded yet — the poller cannot fetch locations.{" "}
          <Link href="/settings" className="font-medium text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent">
            Add cookies.txt in Settings
          </Link>
        </span>
      </div>
    );
  }

  if (!status.sessionValid) {
    return (
      <div className="flex shrink-0 items-center gap-2.5 border-b border-danger/30 bg-danger/[0.08] px-4 py-2 text-[13px]">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4 shrink-0 text-danger">
          <circle cx="10" cy="10" r="7.25" />
          <path d="M7.5 7.5l5 5M12.5 7.5l-5 5" strokeLinecap="round" />
        </svg>
        <span className="text-muted">
          Google session is invalid or expired{status.lastError ? ` (${status.lastError})` : ""} —{" "}
          <Link href="/settings" className="font-medium text-danger underline decoration-danger/40 underline-offset-2 hover:decoration-danger">
            re-export your cookies.txt
          </Link>
        </span>
      </div>
    );
  }

  return null;
}
