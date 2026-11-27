import { LogOut } from "lucide-react";
import { AppNav } from "@/components/app-nav";
import { logout } from "@/server/auth/actions";

// The frame around signed-in pages. Not an auth check: each page does its own.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-surface px-4 md:sticky md:top-0 md:h-dvh md:w-56 md:flex-col md:items-stretch md:justify-start md:border-r md:border-b-0 md:px-0 md:py-5">
        <p className="font-display text-xl md:mb-6 md:px-4">Aura</p>
        <AppNav />
        <form action={logout} className="md:mt-auto">
          <button
            type="submit"
            className="flex h-10 w-full cursor-pointer items-center gap-3 text-sm text-muted -outline-offset-2 hover:text-foreground md:border-l-2 md:border-transparent md:px-4"
          >
            <LogOut aria-hidden className="size-5" />
            Sign out
          </button>
        </form>
      </header>
      <main className="min-w-0 flex-1 px-4 pt-6 pb-24 md:px-10 md:pt-8 md:pb-10">{children}</main>
    </div>
  );
}
