"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatDateTime, formatRelative } from "@/lib/geo";

interface SyncLogRow {
  id: number;
  ranAt: string;
  peopleCount: number | null;
  pointsInserted: number | null;
  ok: boolean;
  error: string | null;
}

interface Status {
  hasCookies: boolean;
  sessionValid: boolean;
  lastPollAt: string | null;
  lastError: string | null;
  pollIntervalSeconds: number;
  logs: SyncLogRow[];
}

export default function SettingsPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [cookieText, setCookieText] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/sync/status", { cache: "no-store" });
      if (res.ok) setStatus((await res.json()) as Status);
    } catch {}
  }, []);

  useEffect(() => {
    loadStatus();
    const id = setInterval(loadStatus, 30_000);
    return () => clearInterval(id);
  }, [loadStatus]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCookieText(await file.text());
    setMessage(null);
  }

  async function upload() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/cookies", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: cookieText,
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        count?: number;
        error?: string;
      };
      if (res.ok && data.ok) {
        setMessage({
          kind: "ok",
          text: `Saved ${data.count} cookies. The poller will validate them within ${Math.ceil((status?.pollIntervalSeconds ?? 300) / 60)} min.`,
        });
        setCookieText("");
        if (fileRef.current) fileRef.current.value = "";
        await loadStatus();
      } else {
        setMessage({ kind: "err", text: data.error ?? `Upload failed (HTTP ${res.status})` });
      }
    } catch (err) {
      setMessage({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto scroll-slim">
      <div className="mx-auto max-w-3xl space-y-5 px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-5 md:px-6 md:pb-10">
        <header>
          <p className="eyebrow mb-1">System</p>
          <h1 className="font-display text-lg font-semibold uppercase tracking-[0.12em]">Settings</h1>
        </header>

        {/* Sync status */}
        <section className="rounded-xl border border-line bg-surface p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="eyebrow">Sync status</h2>
            {!status && <span className="font-mono text-[11px] text-faint">loading…</span>}
            {status && (
              <span
                className={`rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
                  status.sessionValid
                    ? "border-ok/40 bg-ok/10 text-ok"
                    : status.hasCookies
                      ? "border-danger/40 bg-danger/10 text-danger"
                      : "border-accent/40 bg-accent/10 text-accent"
                }`}
              >
                {status.sessionValid ? "nominal" : status.hasCookies ? "session invalid" : "unconfigured"}
              </span>
            )}
          </div>

          {status && (
            <>
              <dl className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                <div className="rounded-lg border border-line bg-raised p-3">
                  <dt className="eyebrow mb-1.5">Cookies</dt>
                  <dd className="text-sm">{status.hasCookies ? "stored" : "none"}</dd>
                </div>
                <div className="rounded-lg border border-line bg-raised p-3">
                  <dt className="eyebrow mb-1.5">Google session</dt>
                  <dd className={`font-mono text-sm ${status.sessionValid ? "text-ok" : "text-danger"}`}>
                    {status.sessionValid ? "valid" : "invalid"}
                  </dd>
                </div>
                <div className="col-span-2 rounded-lg border border-line bg-raised p-3">
                  <dt className="eyebrow mb-1.5">Last poll</dt>
                  <dd className="truncate font-mono text-sm" title={status.lastPollAt ? formatDateTime(new Date(status.lastPollAt).getTime()) : undefined}>
                    {status.lastPollAt
                      ? `${formatRelative(new Date(status.lastPollAt).getTime())} · ${formatDateTime(new Date(status.lastPollAt).getTime())}`
                      : "never"}
                  </dd>
                </div>
              </dl>
              <p className="mt-2 font-mono text-[11px] text-faint">
                Poll interval {status.pollIntervalSeconds}s
              </p>

              {status.lastError && (
                <p className="mt-3 rounded-md border border-danger/30 bg-danger/[0.08] px-3 py-2 font-mono text-xs leading-relaxed text-danger">
                  Last error: {status.lastError}
                </p>
              )}

              <h3 className="eyebrow mt-6 mb-2">Recent sync runs</h3>
              <div className="overflow-x-auto scroll-slim">
                <table className="w-full min-w-[540px] text-left font-mono text-xs">
                  <thead>
                    <tr className="text-faint">
                      <th className="pb-2 pr-3 font-medium uppercase tracking-wider text-[10px]">When</th>
                      <th className="pb-2 pr-3 font-medium uppercase tracking-wider text-[10px]">Result</th>
                      <th className="pb-2 pr-3 font-medium uppercase tracking-wider text-[10px]">People</th>
                      <th className="pb-2 pr-3 font-medium uppercase tracking-wider text-[10px]">Inserted</th>
                      <th className="pb-2 font-medium uppercase tracking-wider text-[10px]">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {status.logs.map((l) => (
                      <tr key={l.id} className="border-t border-line">
                        <td className="py-1.5 pr-3 whitespace-nowrap text-muted">
                          {formatDateTime(new Date(l.ranAt).getTime())}
                        </td>
                        <td className="py-1.5 pr-3">
                          <span className={l.ok ? "text-ok" : "text-danger"}>{l.ok ? "ok" : "failed"}</span>
                        </td>
                        <td className="py-1.5 pr-3 text-muted">{l.peopleCount ?? "—"}</td>
                        <td className="py-1.5 pr-3 text-muted">{l.pointsInserted ?? "—"}</td>
                        <td className="max-w-[240px] truncate py-1.5 text-faint" title={l.error ?? ""}>
                          {l.error ?? ""}
                        </td>
                      </tr>
                    ))}
                    {status.logs.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-3 text-muted">
                          No sync runs yet — is the worker running?
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        {/* Cookies upload */}
        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="eyebrow">Google session cookies</h2>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-xs leading-relaxed text-muted">
            <li>Log in to your Google account at google.com/maps in your browser.</li>
            <li>
              Export cookies with an extension such as &quot;Get cookies.txt LOCALLY&quot; (Chrome) or
              &quot;Export cookies&quot; (Firefox) while on google.com.
            </li>
            <li>Paste or upload the file below. Cookies are encrypted before storage.</li>
          </ol>

          <input
            ref={fileRef}
            type="file"
            accept=".txt,text/plain"
            onChange={onFile}
            aria-label="cookies.txt file"
            className="mt-4 block w-full cursor-pointer rounded-md border border-line bg-raised text-xs text-muted file:mr-3 file:cursor-pointer file:border-0 file:border-r file:border-line file:bg-[#10151f] file:px-3 file:py-2 file:font-mono file:text-xs file:text-ink"
          />
          <textarea
            value={cookieText}
            onChange={(e) => setCookieText(e.target.value)}
            placeholder="# Netscape HTTP Cookie File ... or paste raw cookie header"
            rows={8}
            className="mt-3 w-full rounded-md border border-line bg-raised p-3 font-mono text-xs leading-relaxed outline-none transition-colors focus:border-accent/70"
          />
          {message && (
            <p
              role="status"
              className={`mt-2 rounded-md border px-3 py-2 font-mono text-xs leading-relaxed ${
                message.kind === "ok"
                  ? "border-ok/30 bg-ok/[0.08] text-ok"
                  : "border-danger/30 bg-danger/[0.08] text-danger"
              }`}
            >
              {message.text}
            </p>
          )}
          <button
            onClick={upload}
            disabled={busy || !cookieText.trim()}
            className="mt-4 rounded-md bg-accent px-5 py-2.5 font-display text-xs font-semibold uppercase tracking-[0.14em] text-bg transition-[filter,opacity] hover:brightness-110 disabled:opacity-40"
          >
            {busy ? "Saving…" : "Save cookies"}
          </button>
        </section>
      </div>
    </div>
  );
}
