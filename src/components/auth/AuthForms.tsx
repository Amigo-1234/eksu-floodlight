"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, MailCheck } from "lucide-react";
import { Button, Field, Input, Notice } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/browser";

const signInSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

const signUpSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name").max(120, "Max 120 characters"),
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(8, "Use at least 8 characters").max(72, "Max 72 characters"),
});

function authMessage(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return "Incorrect email or password.";
  if (/email not confirmed/i.test(msg)) return "Please confirm your email address first — check your inbox.";
  if (/already registered|already exists/i.test(msg)) return "An account already exists for that email. Try signing in.";
  if (/rate limit|too many/i.test(msg)) return "Too many attempts. Please wait a few minutes.";
  if (/signups? not allowed|signup.*disabled/i.test(msg)) return "New accounts are by invitation only during testing. Please sign in with the account you were given.";
  return "We couldn't complete that. Please try again.";
}

export function SignInForm({ next, disabled }: { next: string; disabled?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<z.infer<typeof signInSchema>>({ resolver: zodResolver(signInSchema) });

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email: v.email, password: v.password });
    if (error) return setError(authMessage(error.message));
    router.replace(next);
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {error && <Notice tone="danger">{error}</Notice>}
      <Field id="email" label="Email" error={formState.errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" aria-invalid={!!formState.errors.email} {...register("email")} />
      </Field>
      <Field id="password" label="Password" error={formState.errors.password?.message}>
        <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!formState.errors.password} {...register("password")} />
      </Field>
      <Button type="submit" size="lg" disabled={disabled || formState.isSubmitting}>
        {formState.isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}Sign in
      </Button>
      <p className="text-center text-sm text-muted">
        New here? <Link href={`/sign-up?next=${encodeURIComponent(next)}`} className="font-semibold text-signal">Create an account</Link>
      </p>
    </form>
  );
}

export function SignUpForm({ next, disabled }: { next: string; disabled?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<z.infer<typeof signUpSchema>>({ resolver: zodResolver(signUpSchema) });

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    const redirect = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { data, error } = await supabaseBrowser().auth.signUp({
      email: v.email, password: v.password,
      // display_name is read by the shared auth's EKSU Sports Hub profile trigger; full_name by Floodlight.
      options: { data: { full_name: v.fullName, display_name: v.fullName }, emailRedirectTo: redirect },
    });
    if (error) return setError(authMessage(error.message));
    if (data.session) {
      router.replace(next);
      router.refresh();
    } else {
      setSentTo(v.email);
    }
  });

  if (sentTo) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <MailCheck className="size-10 text-signal" aria-hidden="true" />
        <p className="font-display text-3xl">Check your email</p>
        <p className="text-sm text-muted">We sent a confirmation link to <strong className="text-ink">{sentTo}</strong>. Open it to finish creating your account.</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {error && <Notice tone="danger">{error}</Notice>}
      <Field id="fullName" label="Full name" error={formState.errors.fullName?.message}>
        <Input id="fullName" autoComplete="name" aria-invalid={!!formState.errors.fullName} {...register("fullName")} />
      </Field>
      <Field id="email" label="Email" error={formState.errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" aria-invalid={!!formState.errors.email} {...register("email")} />
      </Field>
      <Field id="password" label="Password" hint="At least 8 characters." error={formState.errors.password?.message}>
        <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!formState.errors.password} {...register("password")} />
      </Field>
      <Button type="submit" size="lg" disabled={disabled || formState.isSubmitting}>
        {formState.isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}Create account
      </Button>
      <p className="text-center text-sm text-muted">
        Already have an account? <Link href={`/sign-in?next=${encodeURIComponent(next)}`} className="font-semibold text-signal">Sign in</Link>
      </p>
      <p className="text-center text-xs text-faint">Staff accounts are created by invitation from a facility administrator.</p>
    </form>
  );
}
