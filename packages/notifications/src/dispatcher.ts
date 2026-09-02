import type { ChannelConfigStatus, NotificationPayload, NotificationResult } from "./types";

export function getConfiguredChannels(): ChannelConfigStatus {
  const telegram = Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
  const discord = Boolean(process.env.DISCORD_WEBHOOK_URL);
  const ntfy = Boolean(process.env.NTFY_URL || process.env.NTFY_TOPIC);
  const webhook = Boolean(process.env.GENERIC_WEBHOOK_URL);

  const totalConfigured = [telegram, discord, ntfy, webhook].filter(Boolean).length;

  return {
    telegram,
    discord,
    ntfy,
    webhook,
    totalConfigured,
  };
}

async function sendTelegram(payload: NotificationPayload): Promise<NotificationResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return { channel: "telegram", ok: false, error: "Telegram bot token or chat ID not configured" };
  }

  const icon = payload.level === "danger" ? "🚨" : payload.level === "warning" ? "⚠️" : "ℹ️";
  const text = `${icon} *${payload.title}*\n\n${payload.message}`;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { channel: "telegram", ok: false, error: `Telegram HTTP ${res.status}: ${body}` };
    }
    return { channel: "telegram", ok: true };
  } catch (err) {
    return {
      channel: "telegram",
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function sendDiscord(payload: NotificationPayload): Promise<NotificationResult> {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) {
    return { channel: "discord", ok: false, error: "Discord webhook URL not configured" };
  }

  const color =
    payload.level === "danger"
      ? 0xef4444
      : payload.level === "warning"
        ? 0xf59e0b
        : 0x10b981;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title: payload.title,
            description: payload.message,
            color,
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { channel: "discord", ok: false, error: `Discord HTTP ${res.status}: ${body}` };
    }
    return { channel: "discord", ok: true };
  } catch (err) {
    return {
      channel: "discord",
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function sendNtfy(payload: NotificationPayload): Promise<NotificationResult> {
  const endpoint =
    process.env.NTFY_URL ??
    (process.env.NTFY_TOPIC ? `https://ntfy.sh/${process.env.NTFY_TOPIC}` : null);

  if (!endpoint) {
    return { channel: "ntfy", ok: false, error: "ntfy URL or topic not configured" };
  }

  const priority =
    payload.level === "danger" ? "urgent" : payload.level === "warning" ? "high" : "default";

  const tags =
    payload.level === "danger"
      ? "warning,rotating_light"
      : payload.level === "warning"
        ? "warning,battery"
        : "information_source";

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Title: payload.title,
        Priority: priority,
        Tags: tags,
      },
      body: payload.message,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { channel: "ntfy", ok: false, error: `ntfy HTTP ${res.status}: ${body}` };
    }
    return { channel: "ntfy", ok: true };
  } catch (err) {
    return {
      channel: "ntfy",
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function sendGenericWebhook(payload: NotificationPayload): Promise<NotificationResult> {
  const url = process.env.GENERIC_WEBHOOK_URL;
  if (!url) {
    return { channel: "webhook", ok: false, error: "Generic webhook URL not configured" };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "gps_alert",
        title: payload.title,
        message: payload.message,
        level: payload.level ?? "info",
        timestamp: new Date().toISOString(),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { channel: "webhook", ok: false, error: `Webhook HTTP ${res.status}: ${body}` };
    }
    return { channel: "webhook", ok: true };
  } catch (err) {
    return {
      channel: "webhook",
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function sendNotification(
  payload: NotificationPayload,
): Promise<NotificationResult[]> {
  const config = getConfiguredChannels();
  if (config.totalConfigured === 0) {
    return [];
  }

  const tasks: Promise<NotificationResult>[] = [];
  if (config.telegram) tasks.push(sendTelegram(payload));
  if (config.discord) tasks.push(sendDiscord(payload));
  if (config.ntfy) tasks.push(sendNtfy(payload));
  if (config.webhook) tasks.push(sendGenericWebhook(payload));

  const results = await Promise.all(tasks);

  for (const r of results) {
    if (!r.ok) {
      console.warn(`[notifications] channel ${r.channel} failed: ${r.error}`);
    } else {
      console.log(`[notifications] sent successfully to ${r.channel}`);
    }
  }

  return results;
}
