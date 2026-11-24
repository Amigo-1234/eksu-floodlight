"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, Loader2, X } from "lucide-react";
import { Button, Chip, Field, Input, Notice } from "@/components/ui";
import { reviewPaymentProof } from "@/app/admin/actions";
import { formatDateTime, formatNaira } from "@/lib/format";

export type ProofView = { id: string; status: "submitted" | "accepted" | "rejected"; decision_reason: string | null; created_at: string; file_name: string | null; url: string | null; isPdf: boolean };

/** Staff check of an uploaded bank-transfer receipt: view it, then verify or reject with a reason. */
export function ProofReview({ proofs, amountKobo, reference, canReview, attemptsLeft }:
  { proofs: ProofView[]; amountKobo: number | null; reference: string; canReview: boolean; attemptsLeft: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (proofId: string, decision: "accept" | "reject") => start(async () => {
    setMsg(null);
    const r = await reviewPaymentProof({ proofId, decision, reason: reason || undefined });
    setMsg(r.ok ? { ok: true, text: decision === "accept" ? (r.data.status === "confirmed" ? "Payment verified — booking confirmed." : "Payment verified.") : (r.data.status === "cancelled" ? "Receipt rejected — booking cancelled and session released." : "Receipt rejected — the customer can upload again.") } : { ok: false, text: r.error });
    if (r.ok) { setReason(""); router.refresh(); }
  });
  return (
    <div className="flex flex-col gap-3">
      {msg && <Notice tone={msg.ok ? "ok" : "danger"}>{msg.text}</Notice>}
      {proofs.map((x) => (
        <div key={x.id} className={`rounded-2xl border p-3 ${x.status === "submitted" ? "border-signal/50 bg-signal/[0.05]" : "border-line"}`}>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate font-semibold">{x.file_name ?? "Receipt"}</span>
            <Chip tone={x.status === "accepted" ? "ok" : x.status === "rejected" ? "danger" : "signal"}>{x.status === "submitted" ? "To review" : x.status === "accepted" ? "Verified" : "Rejected"}</Chip>
          </div>
          <p className="mt-1 text-xs text-muted">Uploaded {formatDateTime(x.created_at)}</p>
          {x.url && (x.isPdf
            ? <a href={x.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-signal">Open PDF receipt<ExternalLink className="size-3.5" aria-hidden="true" /></a>
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from private storage
            : <a href={x.url} target="_blank" rel="noreferrer"><img src={x.url} alt={`Payment receipt for ${reference}`} className="mt-2 max-h-80 w-full rounded-xl border border-line bg-black object-contain" /></a>)}
          {x.status === "rejected" && x.decision_reason && <p className="mt-1 text-xs text-danger">Reason: {x.decision_reason}</p>}
          {x.status === "submitted" && canReview && (
            <div className="mt-3 flex flex-col gap-3">
              <p className="text-xs text-muted">Check the transfer of <strong className="text-ink">{formatNaira(amountKobo)}</strong> with narration <span className="font-mono">{reference}</span> reached the account before verifying.</p>
              <Field id={`reason-${x.id}`} label="Reason (required to reject)">
                <Input id={`reason-${x.id}`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Amount doesn't match" />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button disabled={pending} onClick={() => run(x.id, "accept")}>{pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}Verify payment</Button>
                <Button variant="danger" disabled={pending || !reason.trim()} onClick={() => run(x.id, "reject")}><X className="size-4" aria-hidden="true" />Reject receipt</Button>
              </div>
              <p className="text-[11px] text-faint">{attemptsLeft > 0 ? `If rejected, the customer can upload ${attemptsLeft} more time${attemptsLeft === 1 ? "" : "s"}.` : "This is the customer's last upload — rejecting cancels the booking and releases the session."}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
