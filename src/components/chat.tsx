"use client";

import { ArrowUp, Square } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MAX_MESSAGE } from "@/lib/chat-limits";
import type { BlockProposal, ChangeSet } from "@/lib/plans";
import type { StatusChange, WeekPlan, Workout } from "@/lib/workout";
import { BlockCard, ChangesCard } from "./plan-cards";
import { WeekCard } from "./week-card";
import { WorkoutCard } from "./workout-card";

export interface ChatEntry {
  id: number;
  from: "you" | "coach";
  text: string;
  state?: "streaming" | "done" | "stopped" | "failed";
  problem?: string;
  mock?: boolean;
  readProfile?: boolean;
  workouts?: Workout[];
  weeks?: WeekPlan[];
  blocks?: BlockProposal[];
  changeSets?: ChangeSet[];
}

/** A shortened reply: shown with its reason, and still a reply. */
class Shortened extends Error {}

interface Handlers {
  onConversation: (id: number) => void;
  onText: (text: string) => void;
  onReadProfile: () => void;
  onWorkout: (workout: Workout, changes: StatusChange[]) => void;
  onWeek: (week: WeekPlan) => void;
  onBlock: (block: BlockProposal) => void;
  onChangeSet: (set: ChangeSet) => void;
}

/** Sends one message and reads the reply stream. */
async function streamReply(body: object, signal: AbortSignal, handlers: Handlers) {
  const response = await fetch("/api/coach", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (response.status === 401) throw new Error("You’ve been signed out. Reload to sign in.");
  if (response.status === 404) throw new Error("That chat was deleted. Start a new one.");
  if (!response.ok || !response.body) throw new Error("The reply failed. Send your message again.");

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    const events = (buffer + value).split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events) {
      const data = JSON.parse(event.slice("data: ".length)) as {
        conversation?: number;
        text?: string;
        readProfile?: true;
        workout?: Workout;
        changes?: StatusChange[];
        week?: WeekPlan;
        block?: BlockProposal;
        changeSet?: ChangeSet;
        done?: true;
        error?: string;
        keepReply?: boolean;
      };
      if (data.done) return;
      if (data.error) throw new (data.keepReply ? Shortened : Error)(data.error);
      if (data.conversation) handlers.onConversation(data.conversation);
      if (data.text) handlers.onText(data.text);
      if (data.readProfile) handlers.onReadProfile();
      if (data.workout) handlers.onWorkout(data.workout, data.changes ?? []);
      if (data.week) handlers.onWeek(data.week);
      if (data.block) handlers.onBlock(data.block);
      if (data.changeSet) handlers.onChangeSet(data.changeSet);
    }
  }
  throw new Error("The reply was cut off. Send your message again.");
}

/**
 * Loads of this page that have since sent something. Back and forward show a
 * stored copy of the page, which for these is out of date.
 */
const outdated = new Set<string>();

interface Props {
  /** Different on every load from the server. */
  load: string;
  /** Absent until the first message of a new chat is saved. */
  conversationId?: number;
  saved: ChatEntry[];
  mock: boolean;
}

export function Chat({ load, conversationId, saved, mock }: Props) {
  const router = useRouter();
  const replyLabel = (isMock: boolean) => (isMock ? "Mock reply" : "Coach");
  const [messages, setMessages] = useState<ChatEntry[]>(saved);
  const [draft, setDraft] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const conversation = useRef(conversationId);
  const active = useRef<AbortController | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  // Negative, so they never collide with saved messages' ids.
  const nextId = useRef(-1);
  const busy = messages.at(-1)?.state === "streaming";

  /** Other cards in this chat whose status a decision or revision changed. */
  function applyChanges(changes: StatusChange[]) {
    const next = new Map(changes.map((change) => [change.id, change.status]));
    const changed = (w: Workout) => ({ ...w, status: next.get(w.id) ?? w.status });
    setMessages((all) =>
      all.map((m) => ({
        ...m,
        workouts: m.workouts?.map(changed),
        weeks: m.weeks?.map((week) => ({
          ...week,
          days: week.days.map((day) => ({ ...day, workouts: day.workouts.map(changed) })),
        })),
      })),
    );
  }

  useEffect(() => () => active.current?.abort(), []);

  useEffect(() => {
    if (outdated.has(load)) router.refresh();
  }, [load, router]);

  useEffect(() => {
    if (follow.current && log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages]);

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;

    outdated.add(load);
    const controller = new AbortController();
    active.current = controller;
    follow.current = true;
    const replyId = nextId.current;
    nextId.current -= 2;
    setDraft("");
    setAnnouncement("");
    setMessages((all) => [
      ...all,
      { id: replyId - 1, from: "you", text },
      { id: replyId, from: "coach", text: "", state: "streaming", mock },
    ]);
    const update = (change: (message: ChatEntry) => Partial<ChatEntry>) =>
      setMessages((all) => all.map((m) => (m.id === replyId ? { ...m, ...change(m) } : m)));

    let reply = "";
    try {
      await streamReply({ conversationId: conversation.current, message: text }, controller.signal, {
        onConversation(id) {
          conversation.current = id;
          // The address changes without loading the page again.
          window.history.replaceState(null, "", `/?c=${id}`);
        },
        onText(piece) {
          reply += piece;
          update((m) => ({ text: m.text + piece }));
        },
        onReadProfile: () => update(() => ({ readProfile: true })),
        onWorkout(workout, changes) {
          applyChanges(changes);
          update((m) => ({ workouts: [...(m.workouts ?? []), workout] }));
        },
        onWeek: (week) => update((m) => ({ weeks: [...(m.weeks ?? []), week] })),
        onBlock: (block) => update((m) => ({ blocks: [...(m.blocks ?? []), block] })),
        onChangeSet: (set) => update((m) => ({ changeSets: [...(m.changeSets ?? []), set] })),
      });
      update(() => ({ state: "done" }));
      setAnnouncement(`${replyLabel(mock)}: ${reply}`);
    } catch (error) {
      if (controller.signal.aborted) {
        update(() => ({ state: "stopped" }));
        setAnnouncement("Reply stopped.");
      } else {
        // fetch's own TypeError is not worth showing.
        const problem =
          error instanceof Error && !(error instanceof TypeError)
            ? error.message
            : "Can’t reach Aura. Check your connection and send again.";
        update(() => ({ state: error instanceof Shortened ? "done" : "failed", problem }));
        setAnnouncement(problem);
      }
    }
  }

  return (
    <>
      <div
        ref={log}
        onScroll={({ currentTarget: el }) => {
          follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        tabIndex={0}
        aria-label="Conversation"
        role="region"
        // "relative" keeps the hidden labels inside, so they cannot stretch the page.
        className="relative min-h-0 flex-1 overflow-y-auto py-4"
      >
        {messages.length === 0 && (
          <p className="text-muted">Send a message to try the chat.</p>
        )}
        <ol className="flex flex-col gap-5">
          {messages.map((message) =>
            message.from === "you" ? (
              <li
                key={message.id}
                className="max-w-[85%] self-end rounded-lg bg-surface px-4 py-2 break-words whitespace-pre-wrap"
              >
                <span className="sr-only">You: </span>
                {message.text}
              </li>
            ) : (
              <li key={message.id} data-from="coach" className="break-words">
                <p className="text-sm text-muted">
                  {replyLabel(message.mock ?? false)}
                  {message.readProfile && ", read your profile"}
                  {message.state === "stopped" && ", stopped"}
                </p>
                <p className="mt-1 whitespace-pre-wrap">
                  {message.text || (message.state === "streaming" && !message.workouts?.length && !message.weeks?.length && !message.blocks?.length && !message.changeSets?.length && "Thinking…")}
                </p>
                {message.workouts?.map((workout) => (
                  // Keyed by status too, so a change made elsewhere redraws the card.
                  <WorkoutCard key={`${workout.id}:${workout.status}`} workout={workout} onChanges={applyChanges} />
                ))}
                {message.weeks?.map((week) => <WeekCard key={week.id} week={week} onChanges={applyChanges} />)}
                {message.blocks?.map((block) => <BlockCard key={block.id} block={block} />)}
                {message.changeSets?.map((set) => <ChangesCard key={set.id} set={set} />)}
                {message.problem && <p className="mt-1 text-danger">{message.problem}</p>}
              </li>
            ),
          )}
        </ol>
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
        className="flex items-end gap-2"
      >
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // On touch keyboards Enter adds a line; the button sends.
            const touch = window.matchMedia("(pointer: coarse)").matches;
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && !touch) {
              event.preventDefault();
              void send();
            }
          }}
          aria-label="Message"
          placeholder="Message your coach"
          rows={2}
          maxLength={MAX_MESSAGE}
          className="min-w-0 flex-1 resize-none rounded-lg border border-line-strong bg-surface px-3 py-2"
        />
        {/* Keyed so that a click on Stop can never submit the form. */}
        {busy ? (
          <button
            key="stop"
            type="button"
            onClick={() => active.current?.abort()}
            aria-label="Stop"
            className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-line-strong"
          >
            <Square aria-hidden className="size-4 fill-current" />
          </button>
        ) : (
          <button
            key="send"
            type="submit"
            disabled={!draft.trim()}
            aria-label="Send"
            className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-accent text-background disabled:cursor-default disabled:opacity-50"
          >
            <ArrowUp aria-hidden className="size-5" />
          </button>
        )}
      </form>
    </>
  );
}
