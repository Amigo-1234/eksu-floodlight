import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, JetBrains_Mono, Manrope } from "next/font/google";
import { brand } from "@/lib/brand";
import { EnvironmentBanner, isTestEnvironment } from "@/components/site/EnvironmentBanner";
import { THEME_BOOT_SCRIPT, THEME_COLOR } from "@/lib/theme";
import "./globals.css";

const display = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"], weight: "variable", axes: ["wdth", "opsz"] });
const sans = Manrope({ variable: "--font-manrope", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-jetbrains-mono", subsets: ["latin"], weight: ["500"] });

export const metadata: Metadata = {
  title: { default: `${brand.name} — Book the lights`, template: `%s · ${brand.name}` },
  description: `${brand.descriptor}. Find a facility, pick a slot and walk in with a digital pass.`,
  applicationName: brand.name,
  robots: isTestEnvironment() ? { index: false, follow: false } : undefined,
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLOR.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLOR.dark },
  ],
  colorScheme: "dark light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-theme is set before paint by the boot script, so React must not "correct" it.
    <html lang="en" suppressHydrationWarning className={`${display.variable} ${sans.variable} ${mono.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <EnvironmentBanner />
        {children}
      </body>
    </html>
  );
}
