import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

import { LiveAudioEngine, type LiveNoteEvent } from "@/audio/liveSynth";
import { useStudioPlanet } from "@/context/StudioPlanetContext";
import { type StyleId, type StyleInfo, type SonifyMode, fetchStyles } from "@/lib/api";
import { buildLiveWsUrl } from "@/lib/liveWsUrl";
import {
  parseDaysParam,
  parseIntervalMsParam,
  parseModeParam,
  parseSeedParam,
  parseStyleParam,
  parseUseLstmParam,
} from "@/lib/studioQuery";

type WsStatus = "idle" | "connecting" | "streaming" | "completed" | "error" | "stopped";

type WsMessage =
  | { type: "session_start"; planet: string; style: string; count: number; metadata: Record<string, unknown> }
  | { type: "note_event"; index: number; total: number; event: LiveNoteEvent }
  | { type: "session_end"; planet: string }
  | { type: "error"; message: string };

export function StudioLivePage() {
  const { t, i18n } = useTranslation();
  const { planet } = useStudioPlanet();
  const [searchParams, setSearchParams] = useSearchParams();
  const wsRef = useRef<WebSocket | null>(null);
  const engineRef = useRef<LiveAudioEngine | null>(null);

  const [stylesList, setStylesList] = useState<StyleInfo[] | null>(null);
  const [days, setDays] = useState(60);
  const [seed, setSeed] = useState(42);
  const [intervalMs, setIntervalMs] = useState(280);
  const [mode, setMode] = useState<SonifyMode>("ai");
  const [style, setStyle] = useState<StyleId>("calm");
  const [useLstm, setUseLstm] = useState(false);
  const [liveVolume, setLiveVolume] = useState(85);
  const [lastWsUrl, setLastWsUrl] = useState<string | null>(null);

  const [status, setStatus] = useState<WsStatus>("idle");
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [lastEvent, setLastEvent] = useState<LiveNoteEvent | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);

  const pushLog = useCallback((line: string) => {
    setLogLines((prev) => [...prev.slice(-40), `${new Date().toLocaleTimeString()}  ${line}`]);
  }, []);

  useLayoutEffect(() => {
    const d = searchParams.get("days");
    if (d != null && d !== "") setDays(parseDaysParam(d, 60));
    const sd = searchParams.get("seed");
    if (sd != null && sd !== "") setSeed(parseSeedParam(sd, 42));
    const iv = searchParams.get("interval");
    if (iv != null && iv !== "") setIntervalMs(parseIntervalMsParam(iv, 280));
    const m = searchParams.get("mode");
    if (m != null && m !== "") setMode(parseModeParam(m, "ai"));
    const st = searchParams.get("style");
    if (st != null && st !== "") setStyle(parseStyleParam(st, "calm"));
    const ul = searchParams.get("use_lstm");
    if (ul != null && ul !== "") setUseLstm(parseUseLstmParam(ul, false));
  }, [searchParams]);

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        let changed = false;
        const setIf = (k: string, v: string) => {
          if (next.get(k) !== v) {
            next.set(k, v);
            changed = true;
          }
        };
        setIf("days", String(days));
        setIf("seed", String(seed));
        setIf("interval", String(intervalMs));
        setIf("mode", mode);
        setIf("style", style);
        if (useLstm) {
          if (next.get("use_lstm") !== "1") {
            next.set("use_lstm", "1");
            changed = true;
          }
        } else if (next.has("use_lstm")) {
          next.delete("use_lstm");
          changed = true;
        }
        return changed ? next : prev;
      },
      { replace: true },
    );
  }, [days, seed, intervalMs, mode, style, useLstm, setSearchParams]);

  useEffect(() => {
    void fetchStyles()
      .then((r) => setStylesList(r.styles))
      .catch(() => setStylesList(null));
  }, []);

  useEffect(() => {
    engineRef.current?.setVolume(liveVolume / 100);
  }, [liveVolume]);

  const styleLabel = useCallback(
    (s: StyleInfo) => {
      if (i18n.language.startsWith("tr")) {
        const key = `studio.styles.${s.id}`;
        const tr = t(key);
        if (tr !== key) return tr;
      }
      return s.label_en;
    },
    [i18n.language, t],
  );

  const closeSocket = useCallback(() => {
    const w = wsRef.current;
    if (w) {
      w.onclose = null;
      w.close();
      wsRef.current = null;
    }
  }, []);

  useEffect(() => () => closeSocket(), [closeSocket]);

  const handleMessage = useCallback(
    (raw: string) => {
      let msg: WsMessage;
      try {
        msg = JSON.parse(raw) as WsMessage;
      } catch {
        pushLog(t("studio.live.logBadJson"));
        return;
      }

      if (msg.type === "session_start") {
        setProgress({ current: 0, total: msg.count });
        setStatus("streaming");
        setStatusDetail(`${msg.planet} · ${msg.style} · ${msg.count} ${t("studio.live.events")}`);
        engineRef.current?.setActiveStyle(msg.style);
        pushLog(t("studio.live.logSessionStart", { planet: msg.planet, count: msg.count }));
        return;
      }

      if (msg.type === "note_event") {
        setProgress({ current: msg.index + 1, total: msg.total });
        setLastEvent(msg.event);
        const eng = engineRef.current;
        if (eng) eng.playEvent(msg.event);
        return;
      }

      if (msg.type === "session_end") {
        setStatus("completed");
        setStatusDetail(t("studio.live.donePlanet", { planet: msg.planet }));
        pushLog(t("studio.live.logSessionEnd"));
        closeSocket();
        return;
      }

      if (msg.type === "error") {
        setStatus("error");
        setStatusDetail(msg.message);
        pushLog(t("studio.live.logError", { message: msg.message }));
        closeSocket();
      }
    },
    [closeSocket, pushLog, t],
  );

  const onStart = async () => {
    closeSocket();
    setLogLines([]);
    setLastEvent(null);
    setStatusDetail(null);

    if (!engineRef.current) engineRef.current = new LiveAudioEngine();
    try {
      await engineRef.current.ensureContext();
      engineRef.current.setVolume(liveVolume / 100);
      engineRef.current.setActiveStyle(style);
    } catch {
      setStatus("error");
      setStatusDetail(t("studio.live.audioBlocked"));
      return;
    }

    const url = buildLiveWsUrl({
      planet,
      days,
      seed,
      interval_ms: Math.max(50, Math.min(2000, intervalMs)),
      mode,
      style,
      use_lstm: useLstm && mode === "ai",
    });
    setLastWsUrl(url);

    setStatus("connecting");
    pushLog(t("studio.live.logConnecting"));

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      pushLog(t("studio.live.logOpen"));
    };

    ws.onmessage = (ev) => {
      handleMessage(String(ev.data));
    };

    ws.onerror = () => {
      setStatus("error");
      setStatusDetail(t("studio.live.socketError"));
      pushLog(t("studio.live.logSocketError"));
    };

    ws.onclose = () => {
      wsRef.current = null;
    };
  };

  const onStop = () => {
    closeSocket();
    setStatus("stopped");
    setStatusDetail(t("studio.live.stoppedByUser"));
    setLastWsUrl(null);
    pushLog(t("studio.live.logStopped"));
  };

  const inputCls =
    "w-full rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30";
  const labelCls = "mb-1 block text-xs font-medium text-white/55";

  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  const statusColor =
    status === "streaming"
      ? "text-cyan-200"
      : status === "error"
        ? "text-rose-300"
        : status === "completed"
          ? "text-emerald-300"
          : "text-white/70";

  return (
    <>
      <div className="mb-6 sm:mb-8">
        <h1 className="font-display font-bold text-[clamp(1.875rem,3.5vw,2.75rem)] leading-[1.1] tracking-[-0.035em] text-white">{t("studio.live.title")}</h1>
        <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-white/50">{t("studio.live.subtitle")}</p>
      </div>

      <div className="flex flex-col gap-6 sm:gap-8">
        <section className="rounded-2xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur-md sm:p-6">
          <h2 className="font-display text-lg font-semibold text-white">{t("studio.live.controls")}</h2>

          <p className="mt-3 rounded-xl border border-cyan-500/25 bg-cyan-500/[0.07] px-3 py-2.5 text-xs leading-relaxed text-cyan-100/85">
            <span className="text-white/50">{t("studio.form.planet")}: </span>
            <span className="font-semibold text-white">{planet}</span>
            <span className="text-white/40"> — </span>
            <span className="text-white/55">Same 3D target as Generate; change it in the big view.</span>
          </p>

          <div className="mt-5 space-y-4">
            <div>
              <label className={labelCls} htmlFor="live-days">
                {t("studio.form.days")}
              </label>
              <input
                id="live-days"
                type="number"
                min={7}
                max={365}
                className={inputCls}
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="live-seed">
                {t("studio.form.seed")}
              </label>
              <input
                id="live-seed"
                type="number"
                className={inputCls}
                value={seed}
                onChange={(e) => setSeed(Number(e.target.value))}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="live-interval">
                {t("studio.live.interval")}
              </label>
              <input
                id="live-interval"
                type="number"
                min={50}
                max={2000}
                step={10}
                className={inputCls}
                value={intervalMs}
                onChange={(e) => setIntervalMs(Number(e.target.value))}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="live-mode">
                {t("studio.form.mode")}
              </label>
              <select
                id="live-mode"
                className={inputCls}
                value={mode}
                onChange={(e) => setMode(e.target.value as SonifyMode)}
              >
                <option value="ai" className="bg-zinc-900">
                  {t("studio.form.modeAi")}
                </option>
                <option value="baseline" className="bg-zinc-900">
                  {t("studio.form.modeBaseline")}
                </option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="live-use-lstm"
                type="checkbox"
                checked={useLstm && mode === "ai"}
                disabled={mode !== "ai"}
                onChange={(e) => setUseLstm(e.target.checked)}
                className="h-4 w-4 shrink-0 rounded border-white/30 bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              />
              <label htmlFor="live-use-lstm" className={`text-sm ${mode !== "ai" ? "text-white/35" : "text-white/70"}`}>
                {t("studio.live.useLstm")}
              </label>
            </div>
            {mode !== "ai" ? (
              <p className="text-[11px] text-white/35">{t("studio.live.useLstmBaselineHint")}</p>
            ) : useLstm ? (
              <p className="text-[11px] text-white/40">{t("studio.live.useLstmEnvHint")}</p>
            ) : null}
            <div>
              <label className={labelCls} htmlFor="live-style">
                {t("studio.form.style")}
              </label>
              <select
                id="live-style"
                className={inputCls}
                value={style}
                onChange={(e) => setStyle(e.target.value as StyleId)}
              >
                {(stylesList ?? [
                  { id: "calm", label_en: "Calm", label_ar: "" },
                  { id: "pop", label_en: "Pop", label_ar: "" },
                  { id: "study", label_en: "Study", label_ar: "" },
                  { id: "cinematic", label_en: "Cinematic", label_ar: "" },
                ]).map((s) => (
                  <option key={s.id} value={s.id} className="bg-zinc-900">
                    {styleLabel(s)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="live-vol">
                {t("studio.live.volume")} ({liveVolume}%)
              </label>
              <input
                id="live-vol"
                type="range"
                min={0}
                max={100}
                className="w-full accent-cyan-500"
                value={liveVolume}
                onChange={(e) => setLiveVolume(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => void onStart()}
              disabled={status === "connecting" || status === "streaming"}
              className="font-display flex-1 rounded-2xl bg-gradient-to-r from-violet-600 to-cyan-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-600/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {status === "connecting" ? t("studio.live.connecting") : t("studio.live.start")}
            </button>
            <button
              type="button"
              onClick={onStop}
              disabled={status !== "streaming" && status !== "connecting"}
              className="flex-1 rounded-2xl border border-white/20 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
            >
              {t("studio.live.stop")}
            </button>
          </div>

          <p className="mt-4 text-[11px] leading-relaxed text-white/35">{t("studio.live.audioHint")}</p>
        </section>

        <section className="space-y-6">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-md">
            <h3 className="text-sm font-medium text-white/80">{t("studio.live.statusTitle")}</h3>
            <p className={`mt-2 font-display text-lg font-semibold capitalize ${statusColor}`}>{t(`studio.live.status.${status}`)}</p>
            {statusDetail ? <p className="mt-1 text-sm text-white/50">{statusDetail}</p> : null}
            {lastWsUrl && (status === "connecting" || status === "streaming") ? (
              <p className="mt-2 break-all font-mono text-[10px] leading-relaxed text-white/35">
                <span className="text-white/45">{t("studio.live.endpoint")}: </span>
                {lastWsUrl}
              </p>
            ) : null}

            <div className="mt-4">
              <div className="mb-1 flex justify-between text-xs text-white/45">
                <span>{t("studio.live.progress")}</span>
                <span>
                  {progress.total > 0 ? `${progress.current} / ${progress.total} (${pct}%)` : "—"}
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-400 transition-[width] duration-300 ease-out"
                  style={{ width: progress.total > 0 ? `${pct}%` : "0%" }}
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-md">
            <h3 className="text-sm font-medium text-white/80">{t("studio.live.telemetryTitle")}</h3>
            {lastEvent ? (
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                {[
                  ["base_note", lastEvent.base_note],
                  ["lead_note", lastEvent.lead_note],
                  ["velocity", lastEvent.velocity],
                  ["duration", lastEvent.duration],
                  ["speed", lastEvent.speed],
                  ["radius", lastEvent.radius],
                  ["radial_velocity", lastEvent.radial_velocity],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-lg border border-white/10 bg-black/20 px-2 py-1.5">
                    <dt className="font-mono text-[10px] uppercase text-white/40">{k}</dt>
                    <dd className="font-mono text-cyan-200/90">{v != null ? String(v) : "—"}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-3 text-sm text-white/40">{t("studio.live.noTelemetry")}</p>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/35 p-5 backdrop-blur-md">
            <h3 className="text-sm font-medium text-white/80">{t("studio.live.logTitle")}</h3>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] text-white/55">
              {logLines.length ? logLines.join("\n") : t("studio.live.logEmpty")}
            </pre>
          </div>
        </section>
      </div>
    </>
  );
}
