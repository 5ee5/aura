import type { Metadata } from "next";
import { EmptyPage } from "@/components/empty-page";
import { requireSession } from "@/server/auth/dal";

export const metadata: Metadata = { title: "Coach" };

export default async function CoachPage() {
  await requireSession();

  return (
    <EmptyPage title="Coach">
      Chat isn’t built yet. This is where you’ll talk with your coach about training.
    </EmptyPage>
  );
}
