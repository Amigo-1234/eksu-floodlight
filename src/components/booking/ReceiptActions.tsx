"use client";

import { useState } from "react";
import { Check, Copy, Download, Share2 } from "lucide-react";
import { Button } from "@/components/ui";

/** Download (the browser's print → "Save as PDF", using the clean print layout) and share. Shared text never includes the QR token. */
export function ReceiptActions({ shareText, shareUrl }: { shareText: string; shareUrl: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: "Booking", text: shareText, url: shareUrl }); return; } catch { /* cancelled */ }
    }
    try { await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`); } catch { return; }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="no-print grid grid-cols-2 gap-2.5">
      <Button variant="outline" onClick={() => window.print()} aria-label="Download receipt (save as PDF or print)">
        <Download className="size-4" aria-hidden="true" />Download
      </Button>
      <Button variant="outline" onClick={share}>
        {copied ? <Check className="size-4" aria-hidden="true" /> : <Share2 className="size-4" aria-hidden="true" />}{copied ? "Copied" : "Share"}
      </Button>
    </div>
  );
}

/** Small "copy" button for a booking reference. */
export function CopyText({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" aria-label={`${label} ${text}`}
      onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1800); } catch { /* unavailable */ } }}
      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-line-strong px-3 text-xs font-bold text-muted transition-colors hover:border-signal/50 hover:text-ink">
      {done ? <Check className="size-3.5 text-ok" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}{done ? "Copied" : label}
    </button>
  );
}
