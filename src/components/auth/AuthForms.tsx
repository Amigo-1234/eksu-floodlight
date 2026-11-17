"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check, Circle, Loader2, MailCheck } from "lucide-react";
import { Button, Field, Input, Notice } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { isExistingAccountResponse, PASSWORD_RULES } from "@/lib/auth-rules";

const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(254, "Email is too long");
const newPassword = z.string()
  .min(8, "Use at least 8 characters")
  .max(72, "Max 72 characters")
  .refine((v) => /[A-Za-z]/.test(v) && /[0-9]/.test(v), "Use letters and at least one number");

const signInSchema = z.object({ email, password: z.string().min(1, "Enter your password") });
const signUpSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name").max(120, "Max 120 characters"),
  email,
  password: newPassword,
  confirm: z.string(),
  website: z.string().max(0).optional(), // honeypot: real people never see or fill this
}).refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match" });
const forgotSchema = z.object({ email });
const resetSchema = z.object({ password: newPassword, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match" });

function authMessage(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return "Incorrect email or password.";
  if (/email not confirmed/i.test(msg)) return "Please confirm your email address first — check your inbox (and spam folder).";
  if (/already registered|already exists|user_already_exists/i.test(msg)) return "An account already exists for that email. Try signing in.";
  if (/rate limit|too many|security purposes/i.test(msg)) return "Too many attempts. Please wait a few minutes and try again.";
  if (/signups? not allowed|signup.*disabled/i.test(msg)) return "New accounts aren't open yet. Please sign in with the account you were given.";
  if (/same.*password|different from the old/i.test(msg)) return "Choose a password you haven't used for this account before.";
  if (/weak|pwned|leaked|compromised/i.test(msg)) return "That password is too easy to guess or has appeared in a data breach. Choose another.";
  if (/sending.*email|smtp|error sending/i.test(msg)) return "We couldn't send the email right now. Please try again later.";
  if (/email address .* is invalid|invalid email|email.*not authorized/i.test(msg)) return "That email address can't be used. Check it for typos or try another address.";
  if (/password should be|password.*(short|length|characters)/i.test(msg)) return "That password doesn't meet the requirements below.";
  if (/expired|invalid.*(token|otp|link)/i.test(msg)) return "That link has expired or was already used. Request a new one.";
  if (/fetch|network/i.test(msg)) return "Can't reach the server. Check your connection and try again.";
  return "We couldn't complete that. Please try again.";
}

function PasswordChecklist({ value }: { value: string }) {
  return (
    <ul id="password-rules" className="-mt-1 grid gap-1 text-xs sm:grid-cols-3" aria-label="Password requirements">
      {PASSWORD_RULES.map((r) => {
        const ok = r.test(value);
        return (
          <li key={r.id} className={`flex items-center gap-1.5 transition-colors ${ok ? "text-ok" : "text-muted"}`}>
            {ok ? <Check className="size-3.5" aria-hidden="true" /> : <Circle className="size-3" aria-hidden="true" />}
            {r.label}<span className="sr-only">{ok ? " — done" : " — not yet"}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Adds ?welcome=1 so the dashboard can greet a brand-new account. Exported for tests via auth-rules. */
const withWelcome = (path: string) => path + (path.includes("?") ? "&" : "?") + "welcome=1";

const callbackUrl = (next: string) => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

/** "Send again" with a cooldown — the auth server also rate-limits emails. */
function ResendConfirmation({ address, next }: { address: string; next: string }) {
  const [wait, setWait] = useState(60);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  async function resend() {
    setState("sending");
    const { error } = await supabaseBrowser().auth.resend({ type: "signup", email: address, options: { emailRedirectTo: callbackUrl(next) } });
    setState(error ? "error" : "sent");
    setWait(60);
  }
  return (
    <div className="flex flex-col items-center gap-2">
      <Button type="button" variant="outline" disabled={wait > 0 || state === "sending"} onClick={resend}>
        {state === "sending" && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        {wait > 0 ? `Send the email again in ${wait}s` : "Send the confirmation email again"}
      </Button>
      {state === "sent" && <p className="text-xs text-muted">If that address has an unconfirmed account, a new link is on its way.</p>}
      {state === "error" && <p className="text-xs text-danger">Couldn&apos;t send right now. Please wait a few minutes.</p>}
    </div>
  );
}

export function SignInForm({ next, disabled }: { next: string; disabled?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<z.infer<typeof signInSchema>>({ resolver: zodResolver(signInSchema) });

  const onSubmit = handleSubmit(async (v) => {
    setError(null); setUnconfirmed(null);
    let error: { message: string } | null = null;
    try {
      ({ error } = await supabaseBrowser().auth.signInWithPassword({ email: v.email, password: v.password }));
    } catch {
      return setError("Can't reach the server. Check your connection and try again.");
    }
    if (error) {
      if (/email not confirmed/i.test(error.message)) setUnconfirmed(v.email);
      return setError(authMessage(error.message));
    }
    router.replace(next);
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {error && <Notice tone="danger">{error}</Notice>}
      {unconfirmed && <ResendConfirmation address={unconfirmed} next={next} />}
      <Field id="email" label="Email" error={formState.errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" inputMode="email" aria-invalid={!!formState.errors.email} {...register("email")} />
      </Field>
      <Field id="password" label="Password" error={formState.errors.password?.message}>
        <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!formState.errors.password} {...register("password")} />
      </Field>
      <div className="-mt-2 text-right text-sm">
        <Link href="/forgot-password" className="font-semibold text-signal">Forgot password?</Link>
      </div>
      <Button type="submit" size="lg" disabled={disabled || formState.isSubmitting}>
        {formState.isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}Sign in
      </Button>
      <p className="text-center text-sm text-muted">
        New here? <Link href={`/sign-up?next=${encodeURIComponent(next)}`} className="font-semibold text-signal">Create an account</Link>
      </p>
    </form>
  );
}

export function SignUpForm({ next, disabled, confirmEmail = true }: { next: string; disabled?: boolean; confirmEmail?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { register, handleSubmit, formState, control } = useForm<z.infer<typeof signUpSchema>>({ resolver: zodResolver(signUpSchema) });
  const pw = useWatch({ control, name: "password" }) ?? "";

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    // Honeypot (invisible to people): if a bot filled it, pretend success so it learns nothing.
    // Real protection is server-side: Supabase Auth's per-IP sign-up/email rate limits.
    if (v.website) { setSentTo(v.email); return; }
    // Only role-neutral profile data is sent. Roles can't be set from here: staff
    // access exists only through invitations, checked in the database.
    let res: Awaited<ReturnType<ReturnType<typeof supabaseBrowser>["auth"]["signUp"]>>;
    try {
      res = await supabaseBrowser().auth.signUp({
        email: v.email, password: v.password,
        // display_name is read by the shared auth's EKSU Sports Hub profile trigger; full_name by Floodlight.
        options: { data: { full_name: v.fullName, display_name: v.fullName, app: "floodlight" }, emailRedirectTo: callbackUrl(next) },
      });
    } catch {
      return setError("Can't reach the server. Check your connection and try again.");
    }
    const { data, error } = res;
    if (error) return setError(authMessage(error.message));
    if (isExistingAccountResponse(data.user)) {
      return setError("An account already exists for that email. Sign in, or use “Forgot password?” if you can't remember it.");
    }
    if (data.session) {
      // Email confirmation is off: the account is active and signed in already.
      router.replace(withWelcome(next));
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
        <p className="text-sm text-muted">
          We sent a confirmation link to <strong className="text-ink">{sentTo}</strong>. Open it on this device to
          activate your account — you can book as soon as your email is confirmed.
        </p>
        <p className="text-xs text-faint">Can&apos;t find it? Check your spam or promotions folder.</p>
        <ResendConfirmation address={sentTo} next={next} />
        <Link href={`/sign-in?next=${encodeURIComponent(next)}`} className="text-sm font-semibold text-signal">Back to sign in</Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {error && <Notice tone="danger">{error}</Notice>}
      <Field id="fullName" label="Full name" error={formState.errors.fullName?.message}>
        <Input id="fullName" autoComplete="name" aria-invalid={!!formState.errors.fullName} {...register("fullName")} />
      </Field>
      <Field id="email" label="Email" hint={confirmEmail ? "We'll send a link to confirm it." : undefined} error={formState.errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" inputMode="email" aria-invalid={!!formState.errors.email} {...register("email")} />
      </Field>
      <Field id="password" label="Password" error={formState.errors.password?.message}>
        <Input id="password" type="password" autoComplete="new-password" aria-describedby="password-rules" aria-invalid={!!formState.errors.password} {...register("password")} />
      </Field>
      <PasswordChecklist value={pw} />
      <Field id="confirm" label="Confirm password" error={formState.errors.confirm?.message}>
        <Input id="confirm" type="password" autoComplete="new-password" aria-invalid={!!formState.errors.confirm} {...register("confirm")} />
      </Field>
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" type="text" tabIndex={-1} autoComplete="off" {...register("website")} />
      </div>
      <Button type="submit" size="lg" disabled={disabled || formState.isSubmitting}>
        {formState.isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}Create account
      </Button>
      <p className="text-center text-sm text-muted">
        Already have an account? <Link href={`/sign-in?next=${encodeURIComponent(next)}`} className="font-semibold text-signal">Sign in</Link>
      </p>
      <p className="text-center text-xs text-faint">Customer account. Staff access is by invitation only.</p>
    </form>
  );
}

export function ForgotPasswordForm({ disabled }: { disabled?: boolean }) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<z.infer<typeof forgotSchema>>({ resolver: zodResolver(forgotSchema) });
  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    const { error } = await supabaseBrowser().auth.resetPasswordForEmail(v.email, { redirectTo: callbackUrl("/reset-password") });
    // Never reveal whether an account exists; only surface rate limiting.
    if (error && /rate limit|too many|security purposes/i.test(error.message)) return setError(authMessage(error.message));
    setDone(true);
  });
  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <MailCheck className="size-10 text-signal" aria-hidden="true" />
        <p className="font-display text-3xl">Check your email</p>
        <p className="text-sm text-muted">If an account exists for that address, we&apos;ve sent a link to choose a new password. Open it on this device.</p>
        <Link href="/sign-in" className="text-sm font-semibold text-signal">Back to sign in</Link>
      </div>
    );
  }
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {error && <Notice tone="danger">{error}</Notice>}
      <Field id="email" label="Email" error={formState.errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" inputMode="email" aria-invalid={!!formState.errors.email} {...register("email")} />
      </Field>
      <Button type="submit" size="lg" disabled={disabled || formState.isSubmitting}>
        {formState.isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}Send reset link
      </Button>
      <p className="text-center text-sm text-muted"><Link href="/sign-in" className="font-semibold text-signal">Back to sign in</Link></p>
    </form>
  );
}

export function ResetPasswordForm() {
  const router = useRouter();
  const [ready, setReady] = useState<"checking" | "ok" | "no-session">("checking");
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<z.infer<typeof resetSchema>>({ resolver: zodResolver(resetSchema) });
  useEffect(() => {
    supabaseBrowser().auth.getUser().then(({ data }) => setReady(data.user ? "ok" : "no-session"));
  }, []);
  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    const { error } = await supabaseBrowser().auth.updateUser({ password: v.password });
    if (error) return setError(authMessage(error.message));
    router.replace("/dashboard?password=updated");
    router.refresh();
  });
  if (ready === "checking") return <p className="text-sm text-muted">Checking your reset link…</p>;
  if (ready === "no-session") {
    return (
      <Notice tone="warn">
        This reset link has expired or was opened on a different device. <Link href="/forgot-password" className="font-semibold underline">Request a new link</Link>.
      </Notice>
    );
  }
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {error && <Notice tone="danger">{error}</Notice>}
      <Field id="password" label="New password" hint="At least 8 characters, with letters and a number." error={formState.errors.password?.message}>
        <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!formState.errors.password} {...register("password")} />
      </Field>
      <Field id="confirm" label="Confirm new password" error={formState.errors.confirm?.message}>
        <Input id="confirm" type="password" autoComplete="new-password" aria-invalid={!!formState.errors.confirm} {...register("confirm")} />
      </Field>
      <Button type="submit" size="lg" disabled={formState.isSubmitting}>
        {formState.isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}Save new password
      </Button>
    </form>
  );
}
