import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Notice } from "@/components/ui";
import { SignUpForm } from "@/components/auth/AuthForms";
import { AuthShell } from "@/components/auth/AuthShell";
import { getViewer } from "@/lib/auth";
import { signupAvailability } from "@/lib/auth-settings";
import { safeNext } from "@/lib/safe-next";
import { isBackendConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignUpPage(props: PageProps<"/sign-up">) {
  const { next } = await props.searchParams;
  const dest = safeNext(next);
  if (await getViewer()) redirect(dest);
  const availability = isBackendConfigured() ? await signupAvailability() : "unknown";
  const closed = availability === "closed";
  return (
    <AuthShell eyebrow="Free account" title={<>Join the <span className="text-beam">night shift.</span></>}
      subtitle="One account to book every EKSU facility on Floodlight. Takes under a minute.">
      {!isBackendConfigured() && <Notice tone="warn" className="mb-4">Sign-up is unavailable until the backend is connected.</Notice>}
      {closed && (
        <Notice tone="info" title="New accounts open soon" className="mb-4">
          Self-registration hasn&apos;t been switched on yet while email delivery is being set up. Already have an account?{" "}
          <Link href={`/sign-in?next=${encodeURIComponent(dest)}`} className="font-semibold text-signal">Sign in</Link>.
        </Notice>
      )}
      <SignUpForm next={dest} disabled={!isBackendConfigured() || closed} />
    </AuthShell>
  );
}
