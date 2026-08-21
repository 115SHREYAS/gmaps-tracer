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
        setMessage({ kind: "ok", text: `Saved ${data.count} cookies. The poller will validate them within ${Math.ceil((status?.pollIntervalSeconds ?? 300) / 60)} min.` });
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
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
        <h2 className="text-sm font-semibold">Sync status</h2>
        {!status ? (
          <p className="mt-2 text-sm text-neutral-500">Loading...</p>
        ) : (
          <>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-neutral-500">Cookies stored</dt>
                <dd>{status.hasCookies ? "Yes" : "No"}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Google session</dt>
                <dd>
                  {status.sessionValid ? (
                    <span className="text-emerald-400">valid</span>
                  ) : (
                    <span className="text-red-400">invalid / unverified</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-neutral-500">Last poll</dt>
                <dd>
                  {status.lastPollAt
                    ? `${formatRelative(new Date(status.lastPollAt).getTime())} (${formatDateTime(new Date(status.lastPollAt).getTime())})`
                    : "never"}
                </dd>
              </div>
              <div>
                <dt className="text-neutral-500">Poll interval</dt>
                <dd>{status.pollIntervalSeconds}s</dd>
              </div>
            </dl>
            {status.lastError && (
              <p className="mt-3 rounded-md bg-red-950/60 px-3 py-2 text-xs text-red-200">
                Last error: {status.lastError}
              </p>
            )}

            <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Recent sync runs
            </h3>
            <table className="mt-2 w-full text-left text-xs">
              <thead className="text-neutral-500">
                <tr>
                  <th className="py-1 pr-3 font-medium">When</th>
                  <th className="py-1 pr-3 font-medium">Result</th>
                  <th className="py-1 pr-3 font-medium">People</th>
                  <th className="py-1 pr-3 font-medium">Inserted</th>
                  <th className="py-1 font-medium">Error</th>
                </tr>
              </thead>
              <tbody>
                {status.logs.map((l) => (
                  <tr key={l.id} className="border-t border-neutral-800">
                    <td className="py-1.5 pr-3 text-neutral-300">{formatDateTime(new Date(l.ranAt).getTime())}</td>
                    <td className="py-1.5 pr-3">
                      {l.ok ? (
                        <span className="text-emerald-400">ok</span>
                      ) : (
                        <span className="text-red-400">failed</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-neutral-400">{l.peopleCount ?? "—"}</td>
                    <td className="py-1.5 pr-3 text-neutral-400">{l.pointsInserted ?? "—"}</td>
                    <td className="max-w-[240px] truncate py-1.5 text-neutral-500" title={l.error ?? ""}>
                      {l.error ?? ""}
                    </td>
                  </tr>
                ))}
                {status.logs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-2 text-neutral-500">
                      No sync runs yet — is the worker running?
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </>
        )}
      </section>

      <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
        <h2 className="text-sm font-semibold">Google session cookies</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-relaxed text-neutral-400">
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
          className="mt-4 block w-full cursor-pointer rounded-md border border-neutral-700 bg-neutral-950 text-xs text-neutral-400 file:mr-3 file:cursor-pointer file:border-0 file:bg-neutral-800 file:px-3 file:py-2 file:text-xs file:text-neutral-200"
        />
        <textarea
          value={cookieText}
          onChange={(e) => setCookieText(e.target.value)}
          placeholder="# Netscape HTTP Cookie File ... or paste raw cookie header"
          rows={8}
          className="mt-3 w-full rounded-lg border border-neutral-700 bg-neutral-950 p-3 font-mono text-xs outline-none focus:border-sky-500"
        />
        {message && (
          <p
            className={`mt-2 rounded-md px-3 py-2 text-xs ${
              message.kind === "ok"
                ? "bg-emerald-950/60 text-emerald-200"
                : "bg-red-950/60 text-red-200"
            }`}
          >
            {message.text}
          </p>
        )}
        <button
          onClick={upload}
          disabled={busy || !cookieText.trim()}
          className="mt-3 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
        >
          {busy ? "Saving..." : "Save cookies"}
        </button>
      </section>
    </div>
  );
}
