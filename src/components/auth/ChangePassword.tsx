"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button, Field, Input, Notice } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/browser";

const schema = z.object({
  password: z.string().min(8, "Use at least 8 characters").max(72, "Max 72 characters")
    .refine((v) => /[A-Za-z]/.test(v) && /[0-9]/.test(v), "Use letters and at least one number"),
  confirm: z.string(),
}).refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match" });

/** Change the signed-in account's password (shared EKSU sign-in). */
export function ChangePasswordForm() {
  const [state, setState] = useState<{ tone: "ok" | "danger"; msg: string } | null>(null);
  const { register, handleSubmit, formState, reset } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  const onSubmit = handleSubmit(async (v) => {
    setState(null);
    const { error } = await supabaseBrowser().auth.updateUser({ password: v.password });
    if (error) {
      const m = /same.*password|different from the old/i.test(error.message) ? "Choose a password you haven't used for this account before."
        : /reauthenticat/i.test(error.message) ? "For security, sign out and back in, then try again."
        : "Couldn't update your password. Please try again.";
      return setState({ tone: "danger", msg: m });
    }
    reset();
    setState({ tone: "ok", msg: "Password updated. Use it next time you sign in." });
  });
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {state && <Notice tone={state.tone}>{state.msg}</Notice>}
      <Field id="new-password" label="New password" hint="At least 8 characters, with letters and a number." error={formState.errors.password?.message}>
        <Input id="new-password" type="password" autoComplete="new-password" aria-invalid={!!formState.errors.password} {...register("password")} />
      </Field>
      <Field id="confirm-password" label="Confirm new password" error={formState.errors.confirm?.message}>
        <Input id="confirm-password" type="password" autoComplete="new-password" aria-invalid={!!formState.errors.confirm} {...register("confirm")} />
      </Field>
      <Button type="submit" variant="outline" disabled={formState.isSubmitting}>
        {formState.isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}Update password
      </Button>
    </form>
  );
}
