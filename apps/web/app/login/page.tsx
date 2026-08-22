"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Same envs/defaults the map boots with — real config, not decoration.
  const lat = Number(process.env.NEXT_PUBLIC_MAP_CENTER_LAT ?? 12.9716).toFixed(4);
  const lng = Number(process.env.NEXT_PUBLIC_MAP_CENTER_LNG ?? 77.5946).toFixed(4);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Login failed");
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex h-full items-center justify-center overflow-hidden px-4">
      {/* Radar field */}
      <div aria-hidden className="radar-rings pointer-events-none absolute inset-0" />
      <div
        aria-hidden
        className="radar-sweep pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[220vmax] -translate-x-1/2 -translate-y-1/2 rounded-full"
      />

      <form
        onSubmit={submit}
        className="relative w-full max-w-sm rounded-xl border border-line bg-surface/90 p-8 shadow-[0_20px_60px_rgba(0,0,0,0.55)] backdrop-blur"
      >
        <div className="flex items-center gap-2.5">
          <span className="relative inline-flex h-5 w-5 items-center justify-center">
            <span className="absolute inset-0 rounded-full border border-accent/50" />
            <span className="absolute inset-[4px] animate-pulse rounded-full bg-accent/25" />
            <span className="h-[6px] w-[6px] rounded-full bg-accent" />
          </span>
          <h1 className="font-display text-base font-semibold uppercase tracking-[0.16em]">
            Gps<span className="text-muted">LocationTracer</span>
          </h1>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Self-hosted Google Maps location history.
        </p>

        <label htmlFor="password" className="eyebrow mt-7 mb-2 block">
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          className="w-full rounded-md border border-line bg-raised px-3 py-2.5 text-sm outline-none transition-colors focus:border-accent/70"
        />
        {error && (
          <p role="alert" className="mt-2 font-mono text-xs text-danger">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || !password}
          className="mt-5 w-full rounded-md bg-accent px-3 py-2.5 font-display text-sm font-semibold uppercase tracking-[0.14em] text-bg transition-[filter,opacity] hover:brightness-110 disabled:opacity-40"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <p className="mt-6 border-t border-line pt-4 font-mono text-[10px] tracking-wide text-faint">
          {lat}° · {lng}° — ASIA/KOLKATA
        </p>
      </form>
    </div>
  );
}
