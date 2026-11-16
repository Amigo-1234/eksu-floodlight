import Link from "next/link";
import { ArtLost } from "@/components/brand/Illustrations";
import { Logo } from "@/components/brand/Logo";
import { buttonClass } from "@/components/ui";

export default function NotFound() {
  return (
    <main id="main" className="floodlight-sky relative flex flex-1 flex-col items-center justify-center gap-4 overflow-hidden px-4 py-20 text-center">
      <div className="pitch-lines pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="absolute left-4 top-4 sm:left-8 sm:top-6"><Logo /></div>
      <ArtLost className="relative h-40 w-auto" />
      <p className="eyebrow relative">Error 404 · out of play</p>
      <h1 className="font-display t-display relative">That ball went <span className="text-beam">wide.</span></h1>
      <p className="relative max-w-sm text-muted">This page doesn&apos;t exist, or it isn&apos;t open to the public.</p>
      <div className="relative mt-2 flex flex-wrap justify-center gap-3">
        <Link href="/" className={buttonClass("signal", "lg")}>Back to home</Link>
        <Link href="/facilities" className={buttonClass("outline", "lg")}>Find a field</Link>
      </div>
    </main>
  );
}
