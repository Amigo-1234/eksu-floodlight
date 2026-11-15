import type { Metadata } from "next";
import { Card } from "@/components/ui";
import { ResetPasswordForm } from "@/components/auth/AuthForms";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default function ResetPasswordPage() {
  return (
    <div className="floodlight-sky flex flex-1 items-start justify-center px-4 py-12">
      <Card className="w-full max-w-md p-6 sm:p-8">
        <h1 className="font-display text-5xl">New password</h1>
        <p className="mb-6 mt-1 text-sm text-muted">Choose a new password for your EKSU Floodlight account.</p>
        <ResetPasswordForm />
      </Card>
    </div>
  );
}
