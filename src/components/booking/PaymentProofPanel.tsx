"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, FileUp, Hourglass, Landmark, Loader2 } from "lucide-react";
import { Button, Chip, Notice } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { friendlyError } from "@/lib/errors";
import { formatDateTime, formatNaira } from "@/lib/format";

type Proof = { id: string; status: "submitted" | "accepted" | "rejected"; decision_reason: string | null; created_at: string; file_name: string | null };
type Props = {
  bookingId: string;
  reference: string;
  amountKobo: number | null;
  deadline: string | null;
  timezone: string;
  bank: { name: string | null; number: string | null; accountName: string | null };
  proofs: Proof[];
  attemptsLeft: number;
  canUpload: boolean;
  underReview: boolean;
};

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];

/** Customer step after acceptance: bank details, deadline, receipt upload and its review status. */
export function PaymentProofPanel(p: Props) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const bankReady = !!(p.bank.name && p.bank.number && p.bank.accountName);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setMsg(null);
    if (!TYPES.includes(file.type)) return setMsg({ tone: "danger", text: "Upload a photo (JPG, PNG, WebP, HEIC) or a PDF of your receipt." });
    if (file.size > MAX_BYTES) return setMsg({ tone: "danger", text: "That file is over 5 MB. Please upload a smaller photo or PDF." });
    setBusy(true);
    try {
      const sb = supabaseBrowser();
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
      const path = `${p.bookingId}/${crypto.randomUUID()}.${ext}`;
      const up = await sb.storage.from("floodlight-payment-proofs").upload(path, file, { contentType: file.type, upsert: false });
      if (up.error) throw new Error(up.error.message);
      const r = await sb.rpc("submit_payment_proof", { p_booking_id: p.bookingId, p_storage_path: path, p_file_name: file.name });
      if (r.error) throw r.error;
      setMsg({ tone: "ok", text: "Receipt sent. The facility team will check it and confirm your booking." });
      router.refresh();
    } catch (e) {
      setMsg({ tone: "danger", text: friendlyError(e, "Couldn't upload the receipt. Please try again.") });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <section className="no-print panel overflow-hidden" aria-labelledby="pay-h">
      <div className="border-b border-line bg-[linear-gradient(135deg,rgb(255_197_61/0.16),transparent_60%)] p-5">
        <p className="eyebrow">Step 2 of 2 · payment</p>
        <h2 id="pay-h" className="font-display mt-2 text-2xl">
          {p.underReview ? "Receipt under review" : <>Pay <span className="text-signal">{formatNaira(p.amountKobo)}</span> by transfer</>}
        </h2>
        {p.deadline && !p.underReview && (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-muted">
            <Hourglass className="size-4 text-warn" aria-hidden="true" />Upload your receipt before <strong className="text-ink">{formatDateTime(p.deadline, p.timezone)}</strong>, or the session is released.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-4 p-5">
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

        {!p.underReview && (bankReady ? (
          <div className="rounded-2xl border border-line bg-bg p-4">
            <p className="flex items-center gap-2 text-xs font-bold text-muted"><Landmark className="size-4 text-signal" aria-hidden="true" />Transfer to</p>
            <dl className="mt-2 grid gap-1.5 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-muted">Bank</dt><dd className="font-bold">{p.bank.name}</dd></div>
              <div className="flex items-center justify-between gap-3"><dt className="text-muted">Account number</dt>
                <dd className="flex items-center gap-2 font-mono text-base font-bold tracking-wider">{p.bank.number}
                  <button type="button" onClick={() => { navigator.clipboard?.writeText(p.bank.number ?? ""); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                    className="inline-flex size-8 items-center justify-center rounded-lg border border-line-strong text-muted hover:text-signal" aria-label="Copy account number">
                    <Copy className="size-3.5" aria-hidden="true" />
                  </button>
                </dd>
              </div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Account name</dt><dd className="text-right font-bold">{p.bank.accountName}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Narration</dt><dd className="font-mono">{p.reference}</dd></div>
            </dl>
            {copied && <p className="mt-2 text-xs text-ok">Account number copied.</p>}
          </div>
        ) : (
          <Notice tone="warn" title="Payment details coming soon">
            The facility hasn&apos;t published its bank details yet. Don&apos;t pay anyone until they appear here.
          </Notice>
        ))}

        {p.canUpload && bankReady && (
          <>
            <input ref={input} type="file" accept={TYPES.join(",")} className="sr-only" id="proof-file" onChange={(e) => onFile(e.target.files?.[0])} />
            <Button type="button" size="lg" disabled={busy} onClick={() => input.current?.click()}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <FileUp className="size-4" aria-hidden="true" />}
              {p.proofs.some((x) => x.status === "rejected") ? "Upload a new receipt" : "Upload payment receipt"}
            </Button>
            <p className="-mt-2 text-center text-xs text-faint">Photo or PDF, up to 5 MB · {p.attemptsLeft} upload{p.attemptsLeft === 1 ? "" : "s"} left</p>
          </>
        )}

        {p.proofs.length > 0 && (
          <ul className="flex flex-col gap-2">
            {p.proofs.map((x) => (
              <li key={x.id} className="rounded-2xl border border-line p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold">{x.file_name ?? "Receipt"}</span>
                  <Chip tone={x.status === "accepted" ? "ok" : x.status === "rejected" ? "danger" : "info"}>
                    {x.status === "accepted" ? "Verified" : x.status === "rejected" ? "Not accepted" : "Under review"}
                  </Chip>
                </div>
                <p className="mt-1 text-xs text-muted">Sent {formatDateTime(x.created_at, p.timezone)}</p>
                {x.status === "rejected" && x.decision_reason && <p className="mt-1 text-xs text-danger">Reason: {x.decision_reason}</p>}
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-faint">Your booking is only confirmed after the facility team verifies your receipt. Receipts are private — only you and the facility team can see them.</p>
      </div>
    </section>
  );
}
