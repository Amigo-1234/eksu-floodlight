import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, Notice } from "@/components/ui";
import { SignInForm } from "@/components/auth/AuthForms";
import { getViewer } from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";
import { isBackendConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage(props: PageProps<"/sign-in">) {
  const { next, error } = await props.searchParams;
  const dest = safeNext(next);
  if (await getViewer()) redirect(dest);
  return (
    <div className="floodlight-sky flex flex-1 items-start justify-center px-4 py-12">
      <Card className="w-full max-w-md p-6 sm:p-8">
        <h1 className="font-display text-5xl">Sign in</h1>
        <p className="mb-6 mt-1 text-sm text-muted">Book fields and find your receipts.</p>
        {!isBackendConfigured() && <Notice tone="warn" className="mb-4">Sign-in is unavailable until the backend is connected.</Notice>}
        {error === "confirm-elsewhere" && <Notice tone="ok" className="mb-4">If you just confirmed your email, you’re all set — sign in below to continue.</Notice>}
        {error === "expired" && <Notice tone="warn" className="mb-4">That link has expired. Sign in to get a new confirmation email, or reset your password.</Notice>}
        {error === "link" && <Notice tone="warn" className="mb-4">That link is invalid or was already used. If you just confirmed your email, sign in below.</Notice>}
        <SignInForm next={dest} disabled={!isBackendConfigured()} />
      </Card>
    </div>
  );
}
