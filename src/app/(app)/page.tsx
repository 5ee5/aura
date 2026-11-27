import type { Metadata } from "next";
import { Chat } from "@/components/chat";
import { requireSession } from "@/server/auth/dal";
import { getCoach } from "@/server/coach";

export const metadata: Metadata = { title: "Coach" };

export default async function CoachPage() {
  await requireSession();
  const { mock } = getCoach();

  // Fills <main>, so only the conversation scrolls.
  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col">
      <h1 className="font-display text-3xl">Coach</h1>
      <p className="mt-2 border-b border-line pb-3 text-sm text-accent">
        {mock
          ? "Mock coach: replies are canned, and messages disappear when you leave this page."
          : "Claude can’t see your profile yet. What you type is sent to Anthropic, and the conversation disappears when you leave this page."}
      </p>
      <Chat mock={mock} />
    </div>
  );
}
