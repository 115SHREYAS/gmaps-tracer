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

interface NotificationConfig {
  channels: {
    telegram: boolean;
    discord: boolean;
    ntfy: boolean;
    webhook: boolean;
    totalConfigured: number;
  };
  batteryThreshold: number;
}

interface ShareLinkRow {
  id: string;
  token: string;
  personId: string;
  personName: string;
  label: string | null;
  expiresAt: string | null;
  isExpired: boolean;
}

export default function SettingsPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [notifConfig, setNotifConfig] = useState<NotificationConfig | null>(null);
  const [testAlertMsg, setTestAlertMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [testingAlert, setTestingAlert] = useState(false);
  const [cookieText, setCookieText] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [shareLinks, setShareLinks] = useState<ShareLinkRow[]>([]);
  const [personsList, setPersonsList] = useState<Array<{ id: string; name: string }>>([]);
  const [sharePersonId, setSharePersonId] = useState("");
  const [shareLabel, setShareLabel] = useState("");
  const [shareHours, setShareHours] = useState(24);
  const [creatingShare, setCreatingShare] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/sync/status", { cache: "no-store" });
      if (res.ok) setStatus((await res.json()) as Status);
    } catch {}

    try {
      const res = await fetch("/api/notifications/status", { cache: "no-store" });
      if (res.ok) setNotifConfig((await res.json()) as NotificationConfig);
    } catch {}

    try {
      const [shRes, pRes] = await Promise.all([
        fetch("/api/share", { cache: "no-store" }),
        fetch("/api/persons", { cache: "no-store" }),
      ]);
      if (shRes.ok) setShareLinks(await shRes.json());
      if (pRes.ok) {
        const p = await pRes.json();
        setPersonsList(p);
        if (p.length > 0) setSharePersonId((prev) => prev || p[0].id);
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadStatus();
    const id = setInterval(loadStatus, 30_000);
    return () => clearInterval(id);
  }, [loadStatus]);

  async function createShare() {
    if (!sharePersonId) return;
    setCreatingShare(true);
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personId: sharePersonId,
          label: shareLabel.trim(),
          durationHours: shareHours > 0 ? shareHours : null,
        }),
      });
      if (res.ok) {
        setShareLabel("");
        const shRes = await fetch("/api/share", { cache: "no-store" });
        if (shRes.ok) setShareLinks(await shRes.json());
      }
    } finally {
      setCreatingShare(false);
    }
  }

  async function deleteShare(id: string) {
    await fetch(`/api/share?id=${id}`, { method: "DELETE" });
    const shRes = await fetch("/api/share", { cache: "no-store" });
    if (shRes.ok) setShareLinks(await shRes.json());
  }

  function copyShareUrl(token: string) {
    const url = `${window.location.origin}/share/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  }

  async function sendTestAlert() {
    setTestingAlert(true);
    setTestAlertMsg(null);
    try {
      const res = await fetch("/api/notifications/test", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        results?: Array<{ channel: string; ok: boolean; error?: string }>;
      };
      if (res.ok && data.ok) {
        const succ = data.results?.filter((r) => r.ok).map((r) => r.channel).join(", ");
        setTestAlertMsg({ kind: "ok", text: `Test alert dispatched successfully to: ${succ}` });
      } else {
        setTestAlertMsg({ kind: "err", text: data.error ?? "Failed to dispatch test notification" });
      }
    } catch (err) {
      setTestAlertMsg({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setTestingAlert(false);
    }
  }

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

        {/* Notifications & Alerts */}
        <section className="rounded-xl border border-line bg-surface p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="eyebrow">Notifications & Alerts</h2>
              <p className="mt-1 text-xs text-muted">
                Receive proactive alerts when Google session expires or phone batteries run low.
              </p>
            </div>
            {notifConfig && (
              <span
                className={`rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
                  notifConfig.channels.totalConfigured > 0
                    ? "border-ok/40 bg-ok/10 text-ok"
                    : "border-line bg-raised text-faint"
                }`}
              >
                {notifConfig.channels.totalConfigured > 0
                  ? `${notifConfig.channels.totalConfigured} active`
                  : "unconfigured"}
              </span>
            )}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {[
              { label: "Telegram", active: notifConfig?.channels.telegram, env: "TELEGRAM_BOT_TOKEN" },
              { label: "Discord", active: notifConfig?.channels.discord, env: "DISCORD_WEBHOOK_URL" },
              { label: "ntfy.sh", active: notifConfig?.channels.ntfy, env: "NTFY_URL / TOPIC" },
              { label: "Webhook", active: notifConfig?.channels.webhook, env: "GENERIC_WEBHOOK_URL" },
            ].map((c) => (
              <div key={c.label} className="rounded-lg border border-line bg-raised p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">{c.label}</span>
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${c.active ? "bg-ok" : "bg-faint/40"}`}
                  />
                </div>
                <p className="mt-1 font-mono text-[10px] text-faint">
                  {c.active ? "configured" : "not set"}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-lg border border-line bg-raised p-3.5 text-xs">
            <h3 className="eyebrow mb-2">Automated Alert Triggers</h3>
            <ul className="space-y-1.5 text-muted">
              <li className="flex items-center gap-2">
                <span className="text-danger">●</span>
                <span><strong>Session Expiry:</strong> Alerts immediately if Google rejects session cookies.</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-accent">●</span>
                <span>
                  <strong>Low Battery:</strong> Alerts when any device drops below{" "}
                  <code className="rounded bg-surface px-1 py-0.5 font-mono text-[11px] text-ink">
                    {notifConfig?.batteryThreshold ?? 20}%
                  </code>{" "}
                  while discharging.
                </span>
              </li>
            </ul>
          </div>

          {testAlertMsg && (
            <p
              role="status"
              className={`mt-3 rounded-md border px-3 py-2 font-mono text-xs leading-relaxed ${
                testAlertMsg.kind === "ok"
                  ? "border-ok/30 bg-ok/[0.08] text-ok"
                  : "border-danger/30 bg-danger/[0.08] text-danger"
              }`}
            >
              {testAlertMsg.text}
            </p>
          )}

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={sendTestAlert}
              disabled={testingAlert || notifConfig?.channels.totalConfigured === 0}
              className="rounded-md border border-line bg-raised px-4 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink transition-colors hover:border-faint/60 hover:bg-surface disabled:opacity-40"
            >
              {testingAlert ? "Dispatching…" : "Send test alert"}
            </button>
            {notifConfig?.channels.totalConfigured === 0 && (
              <span className="font-mono text-[11px] text-faint">
                Configure TELEGRAM_BOT_TOKEN, DISCORD_WEBHOOK_URL, or NTFY_URL in .env to enable.
              </span>
            )}
          </div>
        </section>

        {/* Public Share Links */}
        <section className="rounded-xl border border-line bg-surface p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="eyebrow">Public Share Links</h2>
              <p className="mt-1 text-xs text-muted">
                Create temporary, secure read-only tracking links to share a person's live location.
              </p>
            </div>
            <span className="rounded border border-line bg-raised px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-faint">
              {shareLinks.length} Active
            </span>
          </div>

          <div className="mt-4 rounded-lg border border-line bg-raised p-4">
            <h3 className="eyebrow mb-3">Generate new link</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-faint">
                  Person
                </label>
                <select
                  value={sharePersonId}
                  onChange={(e) => setSharePersonId(e.target.value)}
                  className="w-full rounded-md border border-line bg-surface px-3 py-2 text-xs text-ink outline-none focus:border-accent"
                >
                  {personsList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                  {personsList.length === 0 && <option value="">No people found</option>}
                </select>
              </div>

              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-faint">
                  Label (optional)
                </label>
                <input
                  type="text"
                  value={shareLabel}
                  onChange={(e) => setShareLabel(e.target.value)}
                  placeholder="e.g. Trip to airport"
                  className="w-full rounded-md border border-line bg-surface px-3 py-2 text-xs text-ink placeholder-faint outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-faint">
                  Duration
                </label>
                <select
                  value={shareHours}
                  onChange={(e) => setShareHours(Number(e.target.value))}
                  className="w-full rounded-md border border-line bg-surface px-3 py-2 text-xs text-ink outline-none focus:border-accent"
                >
                  <option value={1}>1 hour</option>
                  <option value={6}>6 hours</option>
                  <option value={24}>24 hours</option>
                  <option value={168}>7 days</option>
                  <option value={0}>No expiration</option>
                </select>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={createShare}
                disabled={creatingShare || !sharePersonId}
                className="rounded-md bg-accent px-4 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-bg transition-[filter,opacity] hover:brightness-110 disabled:opacity-40"
              >
                {creatingShare ? "Generating…" : "Create share link"}
              </button>
            </div>
          </div>

          {shareLinks.length > 0 && (
            <div className="mt-4 space-y-2">
              <h3 className="eyebrow mb-2">Active links</h3>
              {shareLinks.map((s) => (
                <div
                  key={s.id}
                  className="flex flex-col gap-2 rounded-lg border border-line bg-raised p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-ink">{s.personName}</span>
                      {s.label && (
                        <span className="rounded bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted">
                          {s.label}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-faint">
                      {s.expiresAt
                        ? `Expires: ${formatDateTime(new Date(s.expiresAt).getTime())}`
                        : "Never expires"}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => copyShareUrl(s.token)}
                      className="rounded border border-line bg-surface px-2.5 py-1 font-mono text-xs text-ink transition-colors hover:border-accent hover:text-accent"
                    >
                      {copiedToken === s.token ? "Copied!" : "Copy Link"}
                    </button>
                    <button
                      onClick={() => deleteShare(s.id)}
                      className="rounded border border-danger/30 bg-danger/10 px-2.5 py-1 font-mono text-xs text-danger transition-colors hover:bg-danger/20"
                    >
                      Revoke
                    </button>
                  </div>
                </div>
              ))}
            </div>
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
