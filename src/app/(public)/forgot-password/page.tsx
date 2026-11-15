import type { Metadata } from "next";
import { Card, Notice } from "@/components/ui";
import { ForgotPasswordForm } from "@/components/auth/AuthForms";
import { isBackendConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Reset your password" };

export default async function ForgotPasswordPage(props: PageProps<"/forgot-password">) {
  const { error } = await props.searchParams;
  return (
    <div className="floodlight-sky flex flex-1 items-start justify-center px-4 py-12">
      <Card className="w-full max-w-md p-6 sm:p-8">
        <h1 className="font-display text-5xl">Forgot password</h1>
        <p className="mb-6 mt-1 text-sm text-muted">Enter your account email and we&apos;ll send you a link to choose a new password.</p>
        {!isBackendConfigured() && <Notice tone="warn" className="mb-4">Unavailable until the backend is connected.</Notice>}
        {error === "link" && <Notice tone="warn" className="mb-4">That reset link expired or was opened on a different device. Request a new one below.</Notice>}
        <ForgotPasswordForm disabled={!isBackendConfigured()} />
      </Card>
    </div>
  );
}
