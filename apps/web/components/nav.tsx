"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const LINKS = [
  { href: "/dashboard", label: "Live" },
  { href: "/history", label: "History" },
  { href: "/settings", label: "Settings" },
];

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
    <nav className="flex h-14 items-center justify-between border-b border-neutral-800 bg-neutral-900 px-4">
      <div className="flex items-center gap-6">
        <span className="text-sm font-semibold tracking-tight">GpsLocationTracer</span>
        <div className="flex items-center gap-1">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                pathname === l.href
                  ? "bg-neutral-800 text-white"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>
      </div>
      <button
        onClick={logout}
        className="rounded-md px-3 py-1.5 text-sm text-neutral-400 hover:text-white"
      >
        Log out
      </button>
    </nav>
  );
}
