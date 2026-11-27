import { randomUUID } from "node:crypto";
import { History, SquarePen } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Chat, type ChatEntry } from "@/components/chat";
import { requireSession } from "@/server/auth/dal";
import { getCoach } from "@/server/coach";
import { listConversations, loadConversation } from "@/server/coach/conversations";
import { getDb } from "@/server/db/client";

export const metadata: Metadata = { title: "Coach" };

/** "/" opens the latest chat, "?c=new" an empty one, "?c=7" that one. */
async function openConversation(wanted: string | string[] | undefined) {
  if (wanted === "new") return undefined;
  const db = getDb();
  if (wanted === undefined) {
    const [latest] = await listConversations(db);
    return latest && loadConversation(db, latest.id);
  }
  const id = typeof wanted === "string" && /^[1-9]\d{0,8}$/.test(wanted) ? Number(wanted) : null;
  return (id && (await loadConversation(db, id))) || notFound();
}

type Saved = NonNullable<Awaited<ReturnType<typeof loadConversation>>>["messages"][number];

function entry(message: Saved): ChatEntry {
  const { id, content: text, status, mock } = message;
  if (message.role === "user") return { id, from: "you", text };
  const state =
    status === "failed" ? "failed" : status === "done" || status === "shortened" ? "done" : "stopped";
  return { id, from: "coach", text, state, mock, problem: message.problem ?? undefined };
}

const action = "flex h-10 items-center gap-2 text-sm text-muted hover:text-foreground";

export default async function CoachPage({ searchParams }: PageProps<"/">) {
  await requireSession();
  const conversation = await openConversation((await searchParams).c);
  const { mock } = getCoach();
  const load = randomUUID();

  // Fills <main>, so only the conversation scrolls.
  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-3xl">Coach</h1>
        <div className="flex gap-5">
          <Link href="/chats" className={action}>
            <History aria-hidden className="size-5" />
            Chats
          </Link>
          <Link href="/?c=new" className={action}>
            <SquarePen aria-hidden className="size-5" />
            New chat
          </Link>
        </div>
      </div>
      <p className="mt-2 border-b border-line pb-3 text-sm text-accent">
        {mock
          ? "Mock coach: replies are canned."
          : "Claude can’t see your profile yet. What you type is saved here and sent to Anthropic."}
      </p>
      {/* A new key on every load, so one chat's messages never carry into another. */}
      <Chat
        key={load}
        load={load}
        conversationId={conversation?.id}
        saved={conversation?.messages.map(entry) ?? []}
        mock={mock}
      />
    </div>
  );
}
