import type { Metadata } from "next";
import { Notice } from "@/components/ui";
import { ForgotPasswordForm } from "@/components/auth/AuthForms";
import { AuthShell } from "@/components/auth/AuthShell";
import { isBackendConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Reset your password" };

export default async function ForgotPasswordPage(props: PageProps<"/forgot-password">) {
  const { error } = await props.searchParams;
  return (
    <AuthShell eyebrow="Account help" title="Forgot password?" subtitle="Enter your account email and we'll send you a link to choose a new one.">
      {!isBackendConfigured() && <Notice tone="warn" className="mb-4">Unavailable until the backend is connected.</Notice>}
      {error === "link" && <Notice tone="warn" className="mb-4">That reset link expired or was opened on a different device. Request a new one below.</Notice>}
      <ForgotPasswordForm disabled={!isBackendConfigured()} />
    </AuthShell>
  );
}
