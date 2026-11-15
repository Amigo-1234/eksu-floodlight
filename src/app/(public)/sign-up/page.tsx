import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Notice } from "@/components/ui";
import { SignUpForm } from "@/components/auth/AuthForms";
import { AuthShell } from "@/components/auth/AuthShell";
import { getViewer } from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";
import { isBackendConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignUpPage(props: PageProps<"/sign-up">) {
  const { next } = await props.searchParams;
  const dest = safeNext(next);
  if (await getViewer()) redirect(dest);
  return (
    <AuthShell eyebrow="Free account" title={<>Join the <span className="text-beam">night shift.</span></>}
      subtitle="One account to book every EKSU facility on Floodlight. Takes under a minute.">
      {!isBackendConfigured() && <Notice tone="warn" className="mb-4">Sign-up is unavailable until the backend is connected.</Notice>}
      <SignUpForm next={dest} disabled={!isBackendConfigured()} />
    </AuthShell>
  );
}
