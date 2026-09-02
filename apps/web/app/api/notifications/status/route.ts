import { getConfiguredChannels } from "@app/notifications";

export async function GET() {
  const channels = getConfiguredChannels();
  const batteryThreshold = Math.max(
    5,
    Math.min(50, Number(process.env.BATTERY_ALERT_THRESHOLD ?? 20)),
  );

  return Response.json({
    channels,
    batteryThreshold,
  });
}
