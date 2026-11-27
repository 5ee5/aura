"use client";

import { ArrowUp, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MAX_HISTORY, MAX_MESSAGE, MAX_MESSAGES } from "@/lib/chat-limits";

interface Message {
  id: number;
  from: "you" | "coach";
  text: string;
  state?: "streaming" | "done" | "stopped" | "failed";
  problem?: string;
}

interface Sent {
  role: "user" | "assistant";
  content: string;
}

/** A shortened reply: shown with its reason, and still part of the conversation. */
class Shortened extends Error {}

/** The earlier turns worth sending: no failed exchanges, no empty replies, newest first to fit. */
function history(messages: Message[], next: string): Sent[] {
  const sent: Sent[] = [];
  for (const [index, message] of messages.entries()) {
    if (message.from === "you") {
      if (messages[index + 1]?.state !== "failed") sent.push({ role: "user", content: message.text });
    } else if (message.state !== "failed" && message.text.trim()) {
      sent.push({ role: "assistant", content: message.text });
    }
  }
  sent.push({ role: "user", content: next });
  const size = () => sent.reduce((n, m) => n + m.content.length, 0);
  while (sent.length > 1 && (sent.length > MAX_MESSAGES || size() > MAX_HISTORY || sent[0]?.role !== "user")) {
    sent.shift();
  }
  return sent;
}

/** Reads the reply stream, calling onText for each piece. */
async function streamReply(messages: Sent[], signal: AbortSignal, onText: (text: string) => void) {
  const response = await fetch("/api/coach", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
    signal,
  });
  if (response.status === 401) throw new Error("You’ve been signed out. Reload to sign in.");
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
        text?: string;
        done?: true;
        error?: string;
        keepReply?: boolean;
      };
      if (data.done) return;
      if (data.error) throw new (data.keepReply ? Shortened : Error)(data.error);
      onText(data.text ?? "");
    }
  }
  throw new Error("The reply was cut off. Send your message again.");
}

/** The conversation lives only in this component: nothing is saved yet. */
export function Chat({ mock }: { mock: boolean }) {
  const replyLabel = mock ? "Mock reply" : "Coach";
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const active = useRef<AbortController | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const nextId = useRef(0);
  const busy = messages.at(-1)?.state === "streaming";

  useEffect(() => () => active.current?.abort(), []);

  useEffect(() => {
    if (follow.current && log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages]);

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;

    const controller = new AbortController();
    active.current = controller;
    follow.current = true;
    const replyId = nextId.current + 1;
    nextId.current += 2;
    setDraft("");
    setAnnouncement("");
    setMessages((all) => [
      ...all,
      { id: replyId - 1, from: "you", text },
      { id: replyId, from: "coach", text: "", state: "streaming" },
    ]);
    const update = (change: (message: Message) => Partial<Message>) =>
      setMessages((all) => all.map((m) => (m.id === replyId ? { ...m, ...change(m) } : m)));

    let reply = "";
    try {
      await streamReply(history(messages, text), controller.signal, (piece) => {
        reply += piece;
        update((m) => ({ text: m.text + piece }));
      });
      update(() => ({ state: "done" }));
      setAnnouncement(`${replyLabel}: ${reply}`);
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
                  {replyLabel}
                  {message.state === "stopped" && ", stopped"}
                </p>
                <p className="mt-1 whitespace-pre-wrap">
                  {message.text || (message.state === "streaming" && "Thinking…")}
                </p>
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
