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
import { workoutsForMessages } from "@/server/workouts/store";
import { weeksForMessages } from "@/server/workouts/weeks";
import { blocksForMessages } from "@/server/changes/blocks";
import { changesForMessages } from "@/server/changes/changes";

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

function entry(
  message: Saved,
  workouts: Map<number, ChatEntry["workouts"]>,
  weeks: Map<number, ChatEntry["weeks"]>,
  blocks: Map<number, ChatEntry["blocks"]>,
  changeSets: Map<number, ChatEntry["changeSets"]>,
): ChatEntry {
  const { id, content: text, status, mock, usedProfile: readProfile } = message;
  if (message.role === "user") return { id, from: "you", text };
  const state =
    status === "failed" ? "failed" : status === "done" || status === "shortened" ? "done" : "stopped";
  const problem = message.problem ?? undefined;
  return {
    id,
    from: "coach",
    text,
    state,
    mock,
    readProfile,
    problem,
    workouts: workouts.get(id),
    weeks: weeks.get(id),
    blocks: blocks.get(id),
    changeSets: changeSets.get(id),
  };
}

const action = "flex h-10 items-center gap-2 text-sm text-muted hover:text-foreground";

export default async function CoachPage({ searchParams }: PageProps<"/">) {
  await requireSession();
  const conversation = await openConversation((await searchParams).c);
  const messages = conversation?.messages ?? [];
  const ids = messages.map((message) => message.id);
  const db = getDb();
  const [workouts, weeks, blocks, changeSets] = await Promise.all([
    workoutsForMessages(db, ids),
    weeksForMessages(db, ids),
    blocksForMessages(db, ids),
    changesForMessages(db, ids),
  ]);
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
          : "Claude can read your profile, injuries and Garmin numbers included, your calendar and plans, and your Garmin activities. What you type and what it reads go to Anthropic."}
      </p>
      {/* A new key on every load, so one chat's messages never carry into another. */}
      <Chat
        key={load}
        load={load}
        conversationId={conversation?.id}
        saved={messages.map((message) => entry(message, workouts, weeks, blocks, changeSets))}
        mock={mock}
      />
    </div>
  );
}
