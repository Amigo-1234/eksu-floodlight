import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, Notice } from "@/components/ui";
import { SignUpForm } from "@/components/auth/AuthForms";
import { getViewer } from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";
import { isBackendConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignUpPage(props: PageProps<"/sign-up">) {
  const { next } = await props.searchParams;
  const dest = safeNext(next);
  if (await getViewer()) redirect(dest);
  return (
    <div className="floodlight-sky flex flex-1 items-start justify-center px-4 py-12">
      <Card className="w-full max-w-md p-6 sm:p-8">
        <h1 className="font-display text-5xl">Join the field</h1>
        <p className="mb-6 mt-1 text-sm text-muted">Create an account to book facilities and keep your receipts.</p>
        {!isBackendConfigured() && <Notice tone="warn" className="mb-4">Sign-up is unavailable until the backend is connected.</Notice>}
        <SignUpForm next={dest} disabled={!isBackendConfigured()} />
      </Card>
    </div>
  );
}
