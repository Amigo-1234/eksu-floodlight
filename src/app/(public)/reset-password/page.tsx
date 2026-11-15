import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/AuthForms";
import { AuthShell } from "@/components/auth/AuthShell";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default function ResetPasswordPage() {
  return (
    <AuthShell eyebrow="Account help" title="New password" subtitle="Choose a new password for your EKSU Floodlight account.">
      <ResetPasswordForm />
    </AuthShell>
  );
}
