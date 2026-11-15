"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button, Notice } from "@/components/ui";
import { acceptInvitation } from "@/app/(customer)/invite/actions";

export function AcceptInvite({ token }: { token: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="flex flex-col gap-3">
      {msg && <Notice tone={msg.ok ? "ok" : "danger"}>{msg.text}</Notice>}
      <Button size="lg" disabled={pending || msg?.ok} onClick={() => start(async () => {
        const r = await acceptInvitation(token);
        if (!r.ok) return setMsg({ ok: false, text: r.error });
        setMsg({ ok: true, text: "Access granted." });
        router.push(r.role === "gatekeeper" ? "/gate" : "/admin");
        router.refresh();
      })}>{pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}Accept invitation</Button>
    </div>
  );
}
