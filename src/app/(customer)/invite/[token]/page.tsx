import type { Metadata } from "next";
import { Card } from "@/components/ui";
import { AcceptInvite } from "@/components/auth/AcceptInvite";
import { requireViewer } from "@/lib/auth";

export const metadata: Metadata = { title: "Staff invitation" };
export const dynamic = "force-dynamic";

export default async function InvitePage(props: PageProps<"/invite/[token]">) {
  const { token } = await props.params;
  const viewer = await requireViewer(`/invite/${token}`);
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <Card className="p-6">
        <p className="eyebrow">Join the crew</p>
        <h1 className="font-display mt-2 text-4xl">Staff invitation</h1>
        <p className="mt-2 text-sm text-muted">
          You&apos;re signed in as <strong className="text-ink">{viewer.email}</strong>. The invitation only works for the email address it was sent to.
        </p>
        <div className="mt-6"><AcceptInvite token={token} /></div>
      </Card>
    </div>
  );
}
