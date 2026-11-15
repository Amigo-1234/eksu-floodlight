import { BackendNotice, SiteFooter, SiteHeader } from "@/components/site/SiteChrome";

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <BackendNotice />
      <SiteHeader />
      <main id="main" className="flex-1">{children}</main>
      <SiteFooter />
    </>
  );
}
