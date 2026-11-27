export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ToolOutcome {
  content: string;
  is_error?: boolean;
}

/** What the coach can do during a reply; each call is shown to the athlete. */
export interface CoachTools {
  readProfile(): Promise<string>;
  proposeWorkout(input: unknown): Promise<ToolOutcome>;
  getSchedule(input: unknown): Promise<ToolOutcome>;
  proposeWeek(input: unknown): Promise<ToolOutcome>;
  proposeBlock(input: unknown): Promise<ToolOutcome>;
  proposeChanges(input: unknown): Promise<ToolOutcome>;
}

/** What a coach is: the reply to a conversation, in pieces, until done or aborted. */
export type CoachReply = (
  messages: ChatMessage[],
  signal: AbortSignal,
  tools?: CoachTools,
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
