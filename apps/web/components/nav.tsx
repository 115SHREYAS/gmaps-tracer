"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

function CrosshairIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5">
      <circle cx="10" cy="10" r="6.25" />
      <circle cx="10" cy="10" r="1.4" fill="currentColor" stroke="none" />
      <path d="M10 1v3M10 16v3M1 10h3M16 10h3" strokeLinecap="round" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5">
      <path d="M3.2 10a6.8 6.8 0 1 0 2-4.8" strokeLinecap="round" />
      <path d="M3.4 2.6v3h3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 6.4V10l2.6 1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SlidersIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5">
      <path d="M2.5 6.5h9M15.5 6.5h2M2.5 13.5h2M8.5 13.5h9" strokeLinecap="round" />
      <circle cx="13.5" cy="6.5" r="2" />
      <circle cx="6.5" cy="13.5" r="2" />
    </svg>
  );
}

const LINKS = [
  { href: "/dashboard", label: "Live", icon: <CrosshairIcon /> },
  { href: "/history", label: "History", icon: <HistoryIcon /> },
  { href: "/settings", label: "Settings", icon: <SlidersIcon /> },
];

function LogoMark() {
  return (
    <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center">
      <span className="absolute inset-0 rounded-full border border-accent/50" />
      <span className="absolute inset-[3px] animate-pulse rounded-full bg-accent/25" />
      <span className="h-[5px] w-[5px] rounded-full bg-accent" />
    </span>
  );
}

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === "/login") return null;

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <>
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-surface px-4">
        <div className="flex items-center gap-6 md:gap-8">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <LogoMark />
            <span className="font-display text-sm font-semibold uppercase tracking-[0.14em]">
              Gps<span className="text-muted">LocationTracer</span>
            </span>
          </Link>
          <nav className="hidden h-14 items-center gap-1 md:flex">
            {LINKS.map((l) => {
              const active = pathname === l.href;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-full items-center border-b-2 px-3 font-display text-xs font-semibold uppercase tracking-[0.14em] transition-colors ${
                    active
                      ? "border-accent text-ink"
                      : "border-transparent text-muted hover:text-ink"
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <button
          onClick={logout}
          title="Log out"
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 font-display text-xs font-semibold uppercase tracking-[0.14em] text-muted transition-colors hover:bg-raised hover:text-ink"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4">
            <path d="M12.5 6.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2" strokeLinecap="round" />
            <path d="M8 10h9m0 0-2.5-2.5M17 10l-2.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="hidden sm:inline">Log out</span>
        </button>
      </header>

      {/* Mobile: thumb-reachable bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {LINKS.map((l) => {
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-1 py-2 transition-colors ${
                active ? "text-accent" : "text-muted hover:text-ink"
              }`}
            >
              {l.icon}
              <span className="font-display text-[10px] font-semibold uppercase tracking-[0.14em]">
                {l.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
