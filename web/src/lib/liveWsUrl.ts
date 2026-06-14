import { getApiBase } from "@/lib/apiBase";

import type { SonifyMode, StyleId } from "@/lib/api";

export type LiveWsParams = {
  planet: string;
  days: number;
  seed: number;
  interval_ms: number;
  mode: SonifyMode;
  style: StyleId;
  /** When true, server resolves checkpoint from request path or LSTM_CHECKPOINT_PATH. */
  use_lstm?: boolean;
  lstm_checkpoint?: string;
  lstm_device?: string;
};

/** WebSocket URL for FastAPI `/live/ws` (works with Vite `/api` proxy when `ws: true`). */
export function buildLiveWsUrl(params: LiveWsParams): string {
  const q = new URLSearchParams({
    planet: params.planet,
    days: String(params.days),
    seed: String(params.seed),
    interval_ms: String(params.interval_ms),
    mode: params.mode,
    style: params.style,
  });
  if (params.use_lstm) {
    q.set("use_lstm", "true");
    const ck = (params.lstm_checkpoint ?? "").trim();
    if (ck) q.set("lstm_checkpoint", ck);
    const dev = (params.lstm_device ?? "cpu").trim();
    if (dev && dev !== "cpu") q.set("lstm_device", dev);
  }

  const base = getApiBase();
  if (/^https?:\/\//i.test(base)) {
    const wsBase = base.replace(/^http/i, "ws");
    return `${wsBase.replace(/\/$/, "")}/live/ws?${q}`;
  }

  const pathBase = base.startsWith("/") ? base : `/${base}`;
  const proto = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = typeof window !== "undefined" ? window.location.host : "localhost:5173";
  return `${proto}//${host}${pathBase}/live/ws?${q}`;
}
