import type { Metadata } from "next";
import { LogOut } from "lucide-react";
import { Card } from "@/components/ui";
import { ProfileForm } from "@/components/booking/ProfileForm";
import { ChangePasswordForm } from "@/components/auth/ChangePassword";
import { requireViewer } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const viewer = await requireViewer("/dashboard/profile");
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("profiles").select("full_name, phone, email").eq("id", viewer.userId).maybeSingle();
  const initial = (data?.full_name || viewer.fullName || viewer.email || "?").charAt(0).toUpperCase();
  return (
    <div className="mx-auto w-full max-w-md page-pad">
      <p className="eyebrow">Account</p>
      <h1 className="font-display t-page mt-1.5">Profile</h1>
      <Card className="mt-6 p-5">
        <div className="flex items-center gap-4">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#ffd166,#ff9f1c)] font-display text-2xl text-signal-ink shadow-[0_10px_30px_-10px_rgb(255_197_61/0.8)]">{initial}</span>
          <div className="min-w-0">
            <p className="text-xs text-muted">Signed in as</p>
            <p className="truncate font-bold">{viewer.email}</p>
          </div>
        </div>
        <div className="mt-6"><ProfileForm initial={{ fullName: data?.full_name ?? "", phone: data?.phone ?? "" }} /></div>
      </Card>
      <Card className="mt-4 p-5">
        <p className="font-display text-xl">Password</p>
        <p className="mb-4 mt-1 text-xs text-muted">This is the same sign-in you use for other EKSU sports services on this account.</p>
        <ChangePasswordForm />
      </Card>
      <form action="/auth/sign-out" method="post" className="mt-4">
        <button className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-line-strong text-sm font-bold text-muted transition-colors hover:border-danger/50 hover:text-danger">
          <LogOut className="size-4" aria-hidden="true" />Sign out
        </button>
      </form>
    </div>
  );
}
