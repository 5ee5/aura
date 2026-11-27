import { AppNav } from "@/components/app-nav";

// The frame around signed-in pages. Not an auth check: each page does its own.
//
// It is exactly one screen tall and only <main> scrolls, so nothing is pinned to
// the window: phone browsers hid pinned bars behind their own toolbars.
// Phones: name and sections in a top bar. Wider: the same in a side rail.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid h-svh grid-cols-[auto_minmax(0,1fr)] grid-rows-[3.5rem_minmax(0,1fr)] md:grid-cols-[14rem_minmax(0,1fr)] md:grid-rows-[auto_minmax(0,1fr)]">
      <p className="col-start-1 row-start-1 flex items-center border-b border-line bg-surface pl-4 font-display text-xl md:border-r md:border-b-0 md:px-4 md:pt-5 md:pb-6">
        Aura
      </p>
      <AppNav />
      <main className="col-span-2 row-start-2 min-h-0 overflow-y-auto px-4 pt-6 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:col-span-1 md:col-start-2 md:row-span-2 md:row-start-1 md:px-10 md:pt-8 md:pb-6">
        {children}
      </main>
    </div>
  );
}
