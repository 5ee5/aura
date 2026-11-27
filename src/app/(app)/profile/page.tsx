import { LogOut } from "lucide-react";
import type { Metadata } from "next";
import { EmptyPage } from "@/components/empty-page";
import { logout } from "@/server/auth/actions";
import { requireSession } from "@/server/auth/dal";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  await requireSession();

  return (
    <div className="flex min-h-full flex-col">
      <EmptyPage title="Profile">
        Nothing to show yet. Your goals, personal bests, injury history and availability will live
        here.
      </EmptyPage>
      <form action={logout} className="mt-auto pt-8">
        <button
          type="submit"
          className="flex h-11 w-full cursor-pointer items-center justify-center gap-3 rounded-lg border border-line-strong md:w-auto md:px-5"
        >
          <LogOut aria-hidden className="size-5" />
          Sign out
        </button>
      </form>
    </div>
  );
}
