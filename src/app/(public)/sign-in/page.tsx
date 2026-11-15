import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Notice } from "@/components/ui";
import { SignInForm } from "@/components/auth/AuthForms";
import { AuthShell } from "@/components/auth/AuthShell";
import { getViewer } from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";
import { isBackendConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage(props: PageProps<"/sign-in">) {
  const { next, error, denied } = await props.searchParams;
  const dest = safeNext(next);
  if (await getViewer()) redirect(dest);
  return (
    <AuthShell eyebrow="Welcome back" title="Sign in" subtitle="Pick up where you left off — your bookings and passes are waiting.">
      {!isBackendConfigured() && <Notice tone="warn" className="mb-4">Sign-in is unavailable until the backend is connected.</Notice>}
      {error === "confirm-elsewhere" && <Notice tone="ok" className="mb-4">If you just confirmed your email, you’re all set — sign in below to continue.</Notice>}
      {error === "expired" && <Notice tone="warn" className="mb-4">That link has expired. Sign in to get a new confirmation email, or reset your password.</Notice>}
      {error === "link" && <Notice tone="warn" className="mb-4">That link is invalid or was already used. If you just confirmed your email, sign in below.</Notice>}
      {denied && <Notice tone="warn" className="mb-4">Please sign in with an account that has access to that page.</Notice>}
      <SignInForm next={dest} disabled={!isBackendConfigured()} />
    </AuthShell>
  );
}
