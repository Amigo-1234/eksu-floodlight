import type { Metadata } from "next";
import { LogOut } from "lucide-react";
import { Card } from "@/components/ui";
import { ThemeToggle } from "@/components/site/ThemeToggle";
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
      <Card className="mt-4 p-4 sm:p-5">
        <div className="flex items-center gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#ffd166,#ff9f1c)] font-display text-2xl text-signal-ink shadow-[0_10px_30px_-10px_rgb(255_197_61/0.8)]">{initial}</span>
          <div className="min-w-0">
            <p className="text-xs text-muted">Signed in as</p>
            <p className="truncate font-bold">{viewer.email}</p>
          </div>
        </div>
        <div className="mt-5"><ProfileForm initial={{ fullName: data?.full_name ?? "", phone: data?.phone ?? "" }} /></div>
      </Card>
      <Card className="mt-3 flex items-center justify-between gap-3 p-4">
        <p className="text-sm font-bold">Appearance</p>
        <ThemeToggle showLabels />
      </Card>
      <details className="panel group mt-3 p-4">
        <summary className="flex items-center justify-between text-sm font-bold">Change password<span className="text-signal transition-transform duration-200 group-open:rotate-45" aria-hidden="true">+</span></summary>
        <div className="details-body mt-4"><ChangePasswordForm /></div>
      </details>
      <form action="/auth/sign-out" method="post" className="mt-3">
        <button className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-line-strong text-sm font-bold text-muted transition-colors hover:border-danger/50 hover:text-danger">
          <LogOut className="size-4" aria-hidden="true" />Sign out
        </button>
      </form>
    </div>
  );
}
