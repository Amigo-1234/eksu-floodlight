import Link from "next/link";
import { LogoMark } from "@/components/brand/Logo";
import { buttonClass } from "@/components/ui";

export default function NotFound() {
  return (
    <main id="main" className="floodlight-sky flex flex-1 flex-col items-center justify-center gap-5 px-4 py-20 text-center">
      <LogoMark size={44} />
      <p className="font-display text-[96px] leading-none text-signal tabular">404</p>
      <h1 className="font-display text-4xl">Off the pitch</h1>
      <p className="max-w-sm text-muted">This page doesn&apos;t exist, or it isn&apos;t open to the public.</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/" className={buttonClass("signal", "lg")}>Home</Link>
        <Link href="/facilities" className={buttonClass("outline", "lg")}>Find a field</Link>
      </div>
    </main>
  );
}
