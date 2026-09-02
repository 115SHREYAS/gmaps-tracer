import { getConfiguredChannels, sendNotification } from "@app/notifications";

export async function POST() {
  const config = getConfiguredChannels();
  if (config.totalConfigured === 0) {
    return Response.json(
      {
        ok: false,
        error: "No notification channels configured. Add Telegram, Discord, ntfy, or Webhook in .env.",
        results: [],
      },
      { status: 400 },
    );
  }

  const results = await sendNotification({
    title: "Test Alert",
    message: "This is a test notification from GpsLocationTracer. Your alerts are configured and working properly!",
    level: "info",
  });

  const anySuccess = results.some((r) => r.ok);

  return Response.json({
    ok: anySuccess,
    results,
  });
}
