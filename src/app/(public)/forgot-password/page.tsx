import type { Metadata } from "next";
import { Notice } from "@/components/ui";
import { ForgotPasswordForm } from "@/components/auth/AuthForms";
import { AuthShell } from "@/components/auth/AuthShell";
import { isBackendConfigured } from "@/lib/supabase/env";
import { emailDeliveryReady } from "@/lib/auth-settings";

export const metadata: Metadata = { title: "Reset your password" };

export default async function ForgotPasswordPage(props: PageProps<"/forgot-password">) {
  const { error } = await props.searchParams;
  return (
    <AuthShell eyebrow="Account help" title="Forgot password?" subtitle="We'll email you a link to choose a new password.">
      {!isBackendConfigured() && <Notice tone="warn" className="mb-4">Unavailable until the backend is connected.</Notice>}
      {error === "link" && <Notice tone="warn" className="mb-4">That reset link expired or was opened on a different device. Request a new one below.</Notice>}
      {!emailDeliveryReady() && (
        <Notice tone="warn" title="Reset emails aren't available yet" className="mb-4">
          We&apos;re still setting up email, so a reset link may not arrive. If you can&apos;t sign in, ask the facility staff for help.
        </Notice>
      )}
      <ForgotPasswordForm disabled={!isBackendConfigured()} />
    </AuthShell>
  );
}
