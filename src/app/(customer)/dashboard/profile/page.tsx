import type { Metadata } from "next";
import { Card } from "@/components/ui";
import { ProfileForm } from "@/components/booking/ProfileForm";
import { requireViewer } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const viewer = await requireViewer("/dashboard/profile");
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("profiles").select("full_name, phone, email").eq("id", viewer.userId).maybeSingle();
  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <h1 className="font-display text-5xl">Profile</h1>
      <Card className="mt-5 p-5">
        <p className="text-sm text-muted">Signed in as</p>
        <p className="font-medium">{viewer.email}</p>
        <div className="mt-5"><ProfileForm initial={{ fullName: data?.full_name ?? "", phone: data?.phone ?? "" }} /></div>
      </Card>
      <form action="/auth/sign-out" method="post" className="mt-5">
        <button className="h-12 w-full rounded-xl border border-line text-sm font-semibold text-muted hover:text-ink">Sign out</button>
      </form>
    </div>
  );
}
