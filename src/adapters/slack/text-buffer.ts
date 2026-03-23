// src/adapters/slack/text-buffer.ts
// Buffers streamed text chunks per session and flushes as a single Slack message.
// This prevents the "many tiny messages" problem from streaming AI responses.

import type { ISlackSendQueue } from "./send-queue.js";
import { markdownToMrkdwn } from "./formatter.js";
import { createChildLogger } from "../../core/log.js";

const log = createChildLogger({ module: "slack-text-buffer" });

const FLUSH_IDLE_MS = 2000; // flush after 2s of no new chunks
const SECTION_LIMIT = 3000;

function splitSafe(text: string, limit = SECTION_LIMIT): string[] {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= limit) { chunks.push(remaining); break; }
    let cut = remaining.lastIndexOf("\n", limit);
    if (cut <= 0) cut = limit;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
  }
  return chunks;
}

export class SlackTextBuffer {
  private buffer = "";
  private timer: ReturnType<typeof setTimeout> | undefined;
  private flushing = false;

  constructor(
    private channelId: string,
    private sessionId: string,
    private queue: ISlackSendQueue,
  ) {}

  append(text: string): void {
    if (!text) return;
    this.buffer += text;
    this.resetTimer();
  }

  private resetTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.flush().catch((err) => log.error({ err, sessionId: this.sessionId }, "Text buffer flush error"));
    }, FLUSH_IDLE_MS);
  }

  async flush(): Promise<void> {
    if (this.flushing) return;
    const text = this.buffer.trim();
    if (!text) return;
    this.buffer = "";
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }

    this.flushing = true;
    try {
      const converted = markdownToMrkdwn(text);
      const chunks = splitSafe(converted);
      for (const chunk of chunks) {
        if (!chunk.trim()) continue;
        await this.queue.enqueue("chat.postMessage", {
          channel: this.channelId,
          text: chunk,
          blocks: [{ type: "section", text: { type: "mrkdwn", text: chunk } }],
        });
      }
    } finally {
      this.flushing = false;
      // Re-flush if content arrived while we were flushing
      if (this.buffer.trim()) {
        await this.flush();
      }
    }
  }

  destroy(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
    this.buffer = "";
  }
}
