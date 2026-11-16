"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Play, Square, X } from "lucide-react";
import { Button, Card, Field, Input, Notice, Select, Textarea } from "@/components/ui";
import { recordActivityEvent, recordOfflinePayment, reviewBooking, staffCancelBooking } from "@/app/admin/actions";
import type { ActivityStatus, ApprovalStatus, BookingStatus, PaymentMode, PaymentStatus } from "@/lib/types";

type Props = {
  bookingId: string;
  status: BookingStatus;
  approval: ApprovalStatus;
  payment: PaymentStatus;
  paymentMode: PaymentMode;
  activity: ActivityStatus | null;
  homeScore: number | null;
  awayScore: number | null;
  isAdmin: boolean;
  canCancel: boolean;
  amountDueNaira: number | null;
  upcoming: boolean;
  isTest?: boolean;
};

export function BookingAdminActions(p: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [reason, setReason] = useState("");
  const [waive, setWaive] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [pay, setPay] = useState({ amount: p.amountDueNaira?.toString() ?? "", method: "cash", receipt: "", note: "" });
  const [home, setHome] = useState(p.homeScore?.toString() ?? "");
  const [away, setAway] = useState(p.awayScore?.toString() ?? "");

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) => start(async () => {
    setMsg(null);
    const r = await fn();
    setMsg(r.ok ? { ok: true, text: success } : { ok: false, text: r.error ?? "Failed." });
    if (r.ok) router.refresh();
  });

  const awaitingApproval = p.status === "pending" && p.approval === "pending";
  const paymentDue = ["pending", "confirmed"].includes(p.status) && ["pending", "failed"].includes(p.payment);
  const offlineEnabled = ["offline", "hybrid", "deposit"].includes(p.paymentMode);
  const activityOpen = ["confirmed", "checked_in", "completed"].includes(p.status);

  return (
    <div className="flex flex-col gap-4">
      {msg && <Notice tone={msg.ok ? "ok" : "danger"}>{msg.text}</Notice>}

      {awaitingApproval && p.isAdmin && (
        <Card className="p-4">
          <h2 className="font-display mb-3 text-xl">Decision</h2>
          {p.payment === "unconfigured" && (
            <p className="mb-3 text-sm text-muted">This facility&apos;s payment policy isn&apos;t set. Approving alone leaves the booking unconfirmed. To confirm it now, you must explicitly mark that no payment is required for this booking (recorded in the audit log).</p>
          )}
          {(p.payment === "unconfigured" || p.payment === "pending") && (
            <label className={`mb-3 flex items-start gap-2 rounded-2xl border p-3 text-sm ${p.isTest ? "border-warn/50 bg-warn/[0.06]" : "border-line"}`}>
              <input type="checkbox" checked={waive} onChange={(e) => setWaive(e.target.checked)} className="mt-0.5 size-4 accent-[var(--signal)]" />
              {p.isTest
                ? <span><strong className="text-warn">TEST-ONLY payment waiver</strong><br /><span className="text-muted">Confirms this test booking without any payment. It is recorded as &ldquo;waived&rdquo;, never as paid.</span></span>
                : <span>No payment required for this booking (waive)</span>}
            </label>
          )}
          <Field id="decision-reason" label="Note / reason (required to decline)">
            <Textarea id="decision-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </Field>
          <div className="mt-3 flex gap-2">
            <Button disabled={pending} onClick={() => run(() => reviewBooking({ bookingId: p.bookingId, decision: "approve", reason, waivePayment: waive }), "Approved.")}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}Approve
            </Button>
            <Button variant="danger" disabled={pending || !reason.trim()} onClick={() => run(() => reviewBooking({ bookingId: p.bookingId, decision: "reject", reason }), "Declined.")}>
              <X className="size-4" aria-hidden="true" />Decline
            </Button>
          </div>
        </Card>
      )}
      {awaitingApproval && !p.isAdmin && <Notice tone="info">A facility administrator must review this request.</Notice>}

      {paymentDue && p.isAdmin && (
        <Card className="p-4">
          <h2 className="font-display mb-3 text-xl">Record payment received</h2>
          {!offlineEnabled ? (
            <p className="text-sm text-muted">Offline payments aren&apos;t enabled for this facility (payment mode: {p.paymentMode}). Change the payment policy first if staff should record payments.</p>
          ) : (
            <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => {
              e.preventDefault();
              run(() => recordOfflinePayment({ bookingId: p.bookingId, amountNaira: Number(pay.amount), method: pay.method, receiptNumber: pay.receipt, note: pay.note }), "Payment recorded.");
            }}>
              <Field id="pay-amount" label="Amount received (₦)"><Input id="pay-amount" inputMode="decimal" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></Field>
              <Field id="pay-method" label="Method">
                <Select id="pay-method" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
                  <option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="pos">POS</option>
                </Select>
              </Field>
              <Field id="pay-receipt" label="Receipt / transfer number"><Input id="pay-receipt" value={pay.receipt} onChange={(e) => setPay({ ...pay, receipt: e.target.value })} /></Field>
              <Field id="pay-note" label="Note (optional)"><Input id="pay-note" value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} /></Field>
              <Button type="submit" disabled={pending} className="sm:col-span-2">Record payment</Button>
            </form>
          )}
        </Card>
      )}

      {activityOpen && (
        <Card className="p-4">
          <h2 className="font-display mb-1 text-xl">Activity</h2>
          <p className="mb-3 text-sm text-muted">Live and full-time status appear publicly only when recorded here.</p>
          <div className="flex flex-wrap items-end gap-2">
            {(p.activity === "scheduled" || p.activity === "postponed") && (
              <Button variant="outline" disabled={pending} onClick={() => run(() => recordActivityEvent({ bookingId: p.bookingId, event: "start" }), "Kick-off recorded.")}>
                <Play className="size-4" aria-hidden="true" />Record start
              </Button>
            )}
            {(p.activity === "in_progress" || p.activity === "completed") && (
              <>
                <Field id="home" label="Home"><Input id="home" inputMode="numeric" className="w-20" value={home} onChange={(e) => setHome(e.target.value)} /></Field>
                <Field id="away" label="Away"><Input id="away" inputMode="numeric" className="w-20" value={away} onChange={(e) => setAway(e.target.value)} /></Field>
                <Button variant="outline" disabled={pending} onClick={() => run(() => recordActivityEvent({
                  bookingId: p.bookingId, event: "score", home: home === "" ? null : Number(home), away: away === "" ? null : Number(away),
                }), "Score saved.")}>Save score</Button>
              </>
            )}
            {p.activity === "in_progress" && (
              <Button disabled={pending} onClick={() => run(() => recordActivityEvent({
                bookingId: p.bookingId, event: "finish", home: home === "" ? null : Number(home), away: away === "" ? null : Number(away),
              }), "Full time recorded.")}><Square className="size-4" aria-hidden="true" />Record full time</Button>
            )}
            {(p.activity === "scheduled" || p.activity === "in_progress") && (
              <Button variant="ghost" disabled={pending} onClick={() => run(() => recordActivityEvent({ bookingId: p.bookingId, event: "postpone" }), "Postponed.")}>Postpone</Button>
            )}
          </div>
        </Card>
      )}

      {p.canCancel && p.upcoming && ["pending", "confirmed", "held"].includes(p.status) && (
        <Card className="p-4">
          <h2 className="font-display mb-3 text-xl">Cancel booking</h2>
          <Field id="cancel-reason" label="Reason (shared with the customer)">
            <Textarea id="cancel-reason" rows={2} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} maxLength={500} />
          </Field>
          <Button variant="danger" className="mt-3" disabled={pending || !cancelReason.trim()}
            onClick={() => run(() => staffCancelBooking(p.bookingId, cancelReason), "Booking cancelled.")}>Cancel booking</Button>
        </Card>
      )}
    </div>
  );
}
