export type NotificationLevel = "info" | "warning" | "danger";

export interface NotificationPayload {
  title: string;
  message: string;
  level?: NotificationLevel;
}

export interface NotificationResult {
  channel: "telegram" | "discord" | "ntfy" | "webhook";
  ok: boolean;
  error?: string;
}

export interface ChannelConfigStatus {
  telegram: boolean;
  discord: boolean;
  ntfy: boolean;
  webhook: boolean;
  totalConfigured: number;
}
