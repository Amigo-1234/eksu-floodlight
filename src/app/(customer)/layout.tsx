import { BackendNotice, SiteHeader } from "@/components/site/SiteChrome";
import { BottomNav } from "@/components/site/BottomNav";

export default function CustomerLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <BackendNotice />
      <SiteHeader />
      <main id="main" className="flex flex-1 flex-col pb-nav sm:pb-12">{children}</main>
      <BottomNav />
    </>
  );
}
