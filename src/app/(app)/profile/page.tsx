import type { Metadata } from "next";
import { EmptyPage } from "@/components/empty-page";
import { requireSession } from "@/server/auth/dal";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  await requireSession();

  return (
    <EmptyPage title="Profile">
      Nothing to show yet. Your goals, personal bests, injury history and availability will live
      here.
    </EmptyPage>
  );
}
