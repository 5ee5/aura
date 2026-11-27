import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { requireSession } from "@/server/auth/dal";
import { removeConversation } from "@/server/coach/actions";
import { listConversations } from "@/server/coach/conversations";
import { getDb } from "@/server/db/client";

export const metadata: Metadata = { title: "Chats" };

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default async function ChatsPage() {
  await requireSession();
  const conversations = await listConversations(getDb());

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-3xl">Chats</h1>
        <Link href="/?c=new" className="text-accent underline underline-offset-4">
          New chat
        </Link>
      </div>
      {conversations.length === 0 && <p className="mt-3 text-muted">No saved chats yet.</p>}
      <ul className="mt-3 divide-y divide-line">
        {conversations.map((conversation) => (
          <li key={conversation.id} className="flex items-center gap-4 py-2">
            <Link href={`/?c=${conversation.id}`} className="min-w-0 flex-1 py-1 break-words">
              {conversation.title}
              <span className="block text-sm text-muted">{day.format(conversation.updatedAt)}</span>
            </Link>
            <ActionForm
              action={removeConversation}
              submitLabel="Delete"
              confirm="Delete this chat? This cannot be undone."
              quiet
            >
              <input type="hidden" name="id" value={conversation.id} />
            </ActionForm>
          </li>
        ))}
      </ul>
    </div>
  );
}
