"use client";

import { useState, useTransition } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { Button, Notice } from "@/components/ui";
import { startOnlinePayment } from "@/app/(customer)/actions";

export function PayOnlineButton({ bookingId, label }: { bookingId: string; label: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="no-print flex flex-col gap-2">
      {err && <Notice tone="danger">{err}</Notice>}
      <Button size="lg" disabled={pending} onClick={() => start(async () => {
        const r = await startOnlinePayment(bookingId);
        if (!r.ok) return setErr(r.error);
        window.location.assign(r.data.url);
      })}>{pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <CreditCard className="size-4" aria-hidden="true" />}{label}</Button>
      <p className="text-center text-xs text-muted">Your booking is confirmed only after the payment provider confirms the payment to our server.</p>
    </div>
  );
}
