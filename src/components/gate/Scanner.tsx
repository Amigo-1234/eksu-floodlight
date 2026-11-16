"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ArtVerdict } from "@/components/brand/Illustrations";
import jsQR from "jsqr";
import { Camera, CameraOff, Keyboard, Loader2, RotateCcw, WifiOff } from "lucide-react";
import { Button, Field, Input, Notice, Textarea } from "@/components/ui";
import { gateLookup, gateManualCheckIn, gateScan } from "@/app/gate/actions";
import { formatRange, formatTime } from "@/lib/format";
import type { GateBookingSummary, GateScanResponse } from "@/lib/types";

const RESULT: Record<string, { title: string; body: string; tone: "ok" | "warn" | "danger" }> = {
  VALID: { title: "VALID", body: "Confirmed booking for this facility and time.", tone: "ok" },
  ALREADY_USED: { title: "ALREADY USED", body: "This pass has already been checked in.", tone: "danger" },
  BOOKING_NOT_CONFIRMED: { title: "NOT CONFIRMED", body: "Awaiting approval or payment.", tone: "danger" },
  WRONG_FACILITY: { title: "WRONG FACILITY", body: "This pass is for another facility.", tone: "danger" },
  OUTSIDE_ENTRY_WINDOW: { title: "NOT ENTRY TIME", body: "Too early or too late for this booking.", tone: "warn" },
  BOOKING_CANCELLED: { title: "CANCELLED", body: "This booking was cancelled.", tone: "danger" },
  PASS_REVOKED: { title: "PASS REVOKED", body: "Replaced or revoked — ask for the latest pass.", tone: "danger" },
  UNKNOWN_CREDENTIAL: { title: "UNKNOWN PASS", body: "Not a valid pass. A reference number alone is not a pass.", tone: "danger" },
  ACCESS_DISABLED: { title: "PASSES OFF", body: "Digital passes aren't enabled here.", tone: "warn" },
};

type Verdict =
  | { kind: "result"; token?: string; key: string; res: GateScanResponse; manualBooking?: string }
  | { kind: "offline"; token: string; commit: boolean; key: string }
  | { kind: "error"; message: string };

const deviceLabel = () => (typeof navigator === "undefined" ? "gate" : `gate-${navigator.platform || "phone"}`.slice(0, 60));

export function Scanner({ facilityId, facilityName, timezone, live }: { facilityId: string; facilityName: string; timezone: string; live: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const busyRef = useRef(false);
  const [camera, setCamera] = useState<"off" | "starting" | "on" | "denied">("off");
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [manual, setManual] = useState(false);
  const [pending, start] = useTransition();

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopCamera = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamera("off");
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  // While the camera or a verdict fills the screen, the gate tab bar steps aside
  // so it can never cover the viewfinder or the "Check in" / "Scan next" buttons.
  const focusMode = camera === "on" || camera === "starting" || verdict?.kind === "result";
  useEffect(() => {
    const root = document.documentElement;
    if (focusMode) root.setAttribute("data-gate-focus", "");
    else root.removeAttribute("data-gate-focus");
    return () => root.removeAttribute("data-gate-focus");
  }, [focusMode]);

  const verify = (token: string, commit: boolean, key: string) => {
    start(async () => {
      try {
        const r = await gateScan(facilityId, token, commit, key, deviceLabel());
        if (!r.ok) setVerdict({ kind: "error", message: r.error });
        else setVerdict({ kind: "result", token, key, res: r.data });
        if (navigator.vibrate) navigator.vibrate(r.ok && r.data.result === "VALID" ? 80 : [80, 60, 80]);
      } catch {
        // Network failure: never treat as valid. Offer a retry with the SAME key.
        setVerdict({ kind: "offline", token, commit, key });
      } finally {
        busyRef.current = false;
      }
    });
  };

  const scanFrame = (): string | null => {
    const v = videoRef.current, c = canvasRef.current;
    if (!v || !c || v.readyState < 2 || !v.videoWidth) return null;
    const w = Math.min(v.videoWidth, 720), h = Math.round((v.videoHeight / v.videoWidth) * w);
    c.width = w; c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(v, 0, 0, w, h);
    const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
    return code?.data?.trim() || null;
  };

  const startCamera = async () => {
    setVerdict(null);
    setCamera("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCamera("on");
      timerRef.current = setInterval(() => {
        if (busyRef.current) return;
        const data = scanFrame();
        if (data) {
          busyRef.current = true;
          stopCamera();
          verify(data, false, crypto.randomUUID());
        }
      }, 200);
    } catch {
      setCamera("denied");
    }
  };

  const reset = () => { setVerdict(null); setManual(false); };

  if (verdict?.kind === "result") {
    return <VerdictScreen verdict={verdict} live={live} timezone={timezone} pending={pending}
      onCommit={() => verdict.token ? verify(verdict.token, true, verdict.key) : undefined}
      onNext={() => { reset(); startCamera(); }} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="eyebrow">Scanning at</p>
        <h1 className="font-display t-page">{facilityName}</h1>
      </div>

      {verdict?.kind === "offline" && (
        <div role="alert" className="flex flex-col gap-3 rounded-2xl border-2 border-warn bg-warn/10 p-4">
          <p className="flex items-center gap-2 text-lg font-bold text-warn"><WifiOff className="size-6" aria-hidden="true" />VERIFICATION UNAVAILABLE</p>
          <p className="text-sm text-ink">No connection to the server. Do not admit on the basis of this scan. Retry, or escalate to the duty administrator.</p>
          <div className="flex gap-2"><Button onClick={() => verify(verdict.token, verdict.commit, verdict.key)} disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}Retry</Button><Button variant="outline" onClick={reset}>Cancel</Button></div>
        </div>
      )}
      {verdict?.kind === "error" && <Notice tone="danger">{verdict.message}</Notice>}

      <div className="glow-ring relative mx-auto aspect-square w-full max-w-[min(100%,calc(100svh-17rem))] overflow-hidden rounded-[30px] bg-black">
        <video ref={videoRef} playsInline muted className={`h-full w-full object-cover ${camera === "on" ? "" : "hidden"}`} />
        <canvas ref={canvasRef} className="hidden" />
        {camera === "on" && (
          <div className="pointer-events-none absolute inset-[18%]" aria-hidden="true">
            <span className="absolute left-0 top-0 h-10 w-10 rounded-tl-3xl border-l-4 border-t-4 border-signal" />
            <span className="absolute right-0 top-0 h-10 w-10 rounded-tr-3xl border-r-4 border-t-4 border-signal" />
            <span className="absolute bottom-0 left-0 h-10 w-10 rounded-bl-3xl border-b-4 border-l-4 border-signal" />
            <span className="absolute bottom-0 right-0 h-10 w-10 rounded-br-3xl border-b-4 border-r-4 border-signal" />
            <span className="scan-line absolute inset-x-3 top-2 h-0.5 rounded-full bg-signal shadow-[0_0_16px_4px_rgb(255_197_61/0.6)]" />
          </div>
        )}
        {camera !== "on" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            {pending ? <Loader2 className="size-10 animate-spin text-signal" aria-hidden="true" /> : camera === "denied" ? (
              <>
                <CameraOff className="size-10 text-muted" aria-hidden="true" />
                <p className="text-sm text-muted">Camera unavailable or permission denied. Allow camera access, or look up the booking by reference.</p>
              </>
            ) : (
              <Button size="lg" onClick={startCamera} disabled={camera === "starting"}>
                {camera === "starting" ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <Camera className="size-5" aria-hidden="true" />}Start camera
              </Button>
            )}
          </div>
        )}
      </div>
      {pending && <p className="text-center text-sm text-muted" aria-live="polite">Checking with the server…</p>}
      {camera === "on" && (
        <Button variant="outline" size="lg" onClick={stopCamera}><CameraOff className="size-5" aria-hidden="true" />Stop camera</Button>
      )}

      <Button variant="outline" size="lg" onClick={() => { stopCamera(); setManual((m) => !m); }}>
        <Keyboard className="size-5" aria-hidden="true" />{manual ? "Hide manual lookup" : "Look up by reference"}
      </Button>
      {manual && <ManualLookup facilityId={facilityId} timezone={timezone} onResult={(res, key, bookingId) => setVerdict({ kind: "result", res, key, manualBooking: bookingId })} />}
    </div>
  );
}

function VerdictScreen({ verdict, live, timezone, pending, onCommit, onNext }: {
  verdict: Extract<Verdict, { kind: "result" }>; live: boolean; timezone: string; pending: boolean; onCommit: () => void; onNext: () => void;
}) {
  const { res } = verdict;
  const meta = RESULT[res.result] ?? { title: res.result, body: "", tone: "danger" as const };
  const bg = res.checked_in || meta.tone === "ok" ? "bg-[radial-gradient(120%_70%_at_50%_0%,#0f5a33,#04140b)]" : meta.tone === "warn" ? "bg-[radial-gradient(120%_70%_at_50%_0%,#5c3a00,#140c00)]" : "bg-[radial-gradient(120%_70%_at_50%_0%,#6b1020,#14030a)]";
  const b = res.booking;
  return (
    <div role="status" aria-live="assertive" className={`animate-rise -mx-4 -mt-4 flex min-h-[calc(100svh-var(--header-h)-2rem)] flex-col gap-4 px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6 text-white ${bg}`}>
      <div className="flex items-center gap-3">
        <ArtVerdict ok={res.checked_in || meta.tone === "ok"} className="size-20 shrink-0" />
        <p className="font-display t-display leading-none">{res.checked_in ? "CHECKED IN" : meta.title}</p>
      </div>
      <p className="text-lg">{res.checked_in ? (res.mode === "test" ? "Recorded as a TEST check-in. Not an entry authorization." : "Entry recorded.") : meta.body}</p>
      {res.result === "ALREADY_USED" && res.checked_in_at && <p className="text-base">First checked in at {formatTime(res.checked_in_at, timezone)}.</p>}
      {b && <BookingCard b={b} timezone={timezone} />}
      <div className="mt-auto flex flex-col gap-3">
        {res.result === "VALID" && !res.checked_in && verdict.token && (
          <button onClick={onCommit} disabled={pending} className="flex h-16 items-center justify-center gap-2 rounded-2xl bg-[#3ee08f] text-xl font-extrabold text-[#04140b] shadow-[0_14px_40px_-12px_#3ee08f] transition-transform active:scale-[0.98] disabled:opacity-60">
            {pending && <Loader2 className="size-5 animate-spin" aria-hidden="true" />}{live ? "Check in team" : "Record test check-in"}
          </button>
        )}
        <button onClick={onNext} className="flex h-14 items-center justify-center gap-2 rounded-2xl border-2 border-white/80 text-lg font-bold transition-colors hover:bg-white/10">
          <RotateCcw className="size-5" aria-hidden="true" />Scan next
        </button>
      </div>
    </div>
  );
}

function BookingCard({ b, timezone }: { b: GateBookingSummary; timezone: string }) {
  return (
    <div className="rounded-2xl bg-black/25 p-4">
      <p className="font-display text-3xl tabular">{formatRange(b.starts_at, b.ends_at, timezone)}</p>
      <p className="text-lg font-semibold">{[b.team_name, b.opponent_name].filter(Boolean).join(" vs ") || "Booked session"}</p>
      <p className="text-sm opacity-90">{b.surface} · Organiser: {b.organizer} · <span className="font-mono">{b.reference}</span></p>
    </div>
  );
}

function ManualLookup({ facilityId, timezone, onResult }: { facilityId: string; timezone: string; onResult: (r: GateScanResponse, key: string, bookingId: string) => void }) {
  const [ref, setRef] = useState("");
  const [found, setFound] = useState<{ result: string; booking: GateBookingSummary } | null>(null);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [key] = useState(() => crypto.randomUUID());
  return (
    <div className="panel flex flex-col gap-3 p-4">
      <form className="flex gap-2" onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setErr(null); setFound(null);
          try {
            const r = await gateLookup(facilityId, ref);
            if (!r.ok) return setErr(r.error);
            if (!r.data.found) return setErr("No booking with that reference at this facility today.");
            setFound({ result: r.data.result!, booking: r.data.booking! });
          } catch { setErr("Verification temporarily unavailable. Check the connection and try again."); }
        });
      }}>
        <label className="sr-only" htmlFor="ref">Booking reference</label>
        <Input id="ref" value={ref} onChange={(e) => setRef(e.target.value.toUpperCase())} placeholder="FL-XXXX-XXXX" className="font-mono" autoCapitalize="characters" />
        <Button type="submit" disabled={pending || ref.length < 4}>Find</Button>
      </form>
      {err && <Notice tone="danger">{err}</Notice>}
      {found && (
        <div className="flex flex-col gap-3">
          <div className="rounded-2xl border border-line bg-bg p-3 text-sm">
            <p className="font-semibold">{RESULT[found.result]?.title ?? found.result}</p>
            <p className="font-display text-2xl tabular">{formatRange(found.booking.starts_at, found.booking.ends_at, timezone)}</p>
            <p>{[found.booking.team_name, found.booking.opponent_name].filter(Boolean).join(" vs ")} · {found.booking.organizer}</p>
          </div>
          {found.result === "VALID" ? (
            <>
              <Field id="mreason" label="Why no QR? (required, reviewed by an admin)">
                <Textarea id="mreason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
              <Button disabled={pending || !reason.trim()} onClick={() => start(async () => {
                try {
                  const r = await gateManualCheckIn(facilityId, found.booking.booking_id, reason, key, "gate-manual");
                  if (!r.ok) return setErr(r.error);
                  onResult(r.data, key, found.booking.booking_id);
                } catch { setErr("Verification temporarily unavailable. Nothing was recorded; try again."); }
              })}>Record manual check-in</Button>
            </>
          ) : <p className="text-sm text-danger">Manual check-in is not possible: {RESULT[found.result]?.body}</p>}
        </div>
      )}
    </div>
  );
}
