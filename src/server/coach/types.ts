export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Told about anything the reply reads, so the athlete can be shown. */
export interface ReplyNotes {
  readProfile(): void;
}

/** What a coach is: the reply to a conversation, in pieces, until done or aborted. */
export type CoachReply = (
  messages: ChatMessage[],
  signal: AbortSignal,
  notes?: ReplyNotes,
) => AsyncIterable<string>;

/** A failure whose message is safe and useful to show in the chat. */
export class CoachError extends Error {
  /** keepReply: what arrived is a real reply, only shortened, and stays in the history. */
  constructor(
    message: string,
    readonly keepReply = false,
  ) {
    super(message);
  }
}
