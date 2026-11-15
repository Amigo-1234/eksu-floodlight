"use client";

import { useState } from "react";
import { Download, Share2, Check } from "lucide-react";
import { Button } from "@/components/ui";

/** Download (print to PDF) and share. Shared text never includes the QR token. */
export function ReceiptActions({ shareText, shareUrl }: { shareText: string; shareUrl: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: "Booking", text: shareText, url: shareUrl }); return; } catch { /* cancelled */ }
    }
    await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="no-print grid grid-cols-2 gap-3">
      <Button variant="outline" onClick={() => window.print()}><Download className="size-4" aria-hidden="true" />Download</Button>
      <Button variant="outline" onClick={share}>
        {copied ? <Check className="size-4" aria-hidden="true" /> : <Share2 className="size-4" aria-hidden="true" />}{copied ? "Copied" : "Share"}
      </Button>
    </div>
  );
}
