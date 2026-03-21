import type { Bot } from 'grammy'
import { markdownToTelegramHtml, splitMessage } from './formatting.js'
import type { TelegramSendQueue } from './send-queue.js'

const FLUSH_INTERVAL = 5000

export class MessageDraft {
  private buffer: string = ''
  private messageId?: number
  private firstFlushPending = false
  private flushTimer?: ReturnType<typeof setTimeout>
  private flushPromise: Promise<void> = Promise.resolve()
  private lastSentBuffer: string = ''

  constructor(
    private bot: Bot,
    private chatId: number,
    private threadId: number,
    private sendQueue: TelegramSendQueue,
    private sessionId: string,
  ) {}

  append(text: string): void {
    if (!text) return
    this.buffer += text
    this.scheduleFlush()
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined
      this.flushPromise = this.flushPromise
        .then(() => this.flush())
        .catch(() => {})
    }, FLUSH_INTERVAL)
  }

  private async flush(): Promise<void> {
    if (!this.buffer) return
    if (this.firstFlushPending) return

    // Truncate markdown BEFORE converting to HTML to avoid breaking HTML tags
    let displayBuffer = this.buffer
    if (displayBuffer.length > 3800) {
      let cutAt = displayBuffer.lastIndexOf('\n', 3800)
      if (cutAt < 800) cutAt = 3800
      displayBuffer = displayBuffer.slice(0, cutAt) + '\n…'
    }
    let html = markdownToTelegramHtml(displayBuffer)
    if (!html) return
    // Safety fallback: if HTML is still too long after markdown truncation
    if (html.length > 4096) {
      html = html.slice(0, 4090) + '\n…'
    }

    if (!this.messageId) {
      this.firstFlushPending = true
      try {
        const result = await this.sendQueue.enqueue(
          () => this.bot.api.sendMessage(this.chatId, html, {
            message_thread_id: this.threadId,
            parse_mode: 'HTML',
            disable_notification: true,
          }),
          { type: 'other' },
        )
        if (result) {
          this.messageId = result.message_id
          this.lastSentBuffer = this.buffer
        }
      } catch {
        // sendMessage failed — next flush will retry
      } finally {
        this.firstFlushPending = false
      }
    } else {
      try {
        await this.sendQueue.enqueue(
          () => this.bot.api.editMessageText(this.chatId, this.messageId!, html, {
            parse_mode: 'HTML',
          }),
          { type: 'text', key: this.sessionId },
        )
        this.lastSentBuffer = this.buffer
      } catch {
        // Don't reset messageId — transient errors (rate limit, network) would cause
        // the next flush to sendMessage the full buffer as a NEW message, creating duplicates.
        // If the message was truly deleted, finalize() handles the fallback.
      }
    }
  }

  async finalize(): Promise<number | undefined> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = undefined
    }

    await this.flushPromise

    if (!this.buffer) return this.messageId

    // Skip if buffer was already sent by flush() and nothing new was appended
    if (this.messageId && this.buffer === this.lastSentBuffer) {
      return this.messageId
    }

    // Split markdown FIRST, then convert each chunk to HTML separately.
    // This prevents breaking HTML tags (e.g. <pre><code>) at split boundaries.
    const mdChunks = splitMessage(this.buffer)

    for (let i = 0; i < mdChunks.length; i++) {
      const html = markdownToTelegramHtml(mdChunks[i])
      try {
        if (i === 0 && this.messageId) {
          await this.sendQueue.enqueue(
            () => this.bot.api.editMessageText(this.chatId, this.messageId!, html, {
              parse_mode: 'HTML',
            }),
            { type: 'other' },
          )
        } else {
          const msg = await this.sendQueue.enqueue(
            () => this.bot.api.sendMessage(this.chatId, html, {
              message_thread_id: this.threadId,
              parse_mode: 'HTML',
              disable_notification: true,
            }),
            { type: 'other' },
          )
          if (msg) {
            this.messageId = msg.message_id
          }
        }
      } catch {
        // HTML failed for this chunk — try plain text fallback
        try {
          if (i === 0 && this.messageId) {
            await this.sendQueue.enqueue(
              () => this.bot.api.editMessageText(this.chatId, this.messageId!, mdChunks[i].slice(0, 4096)),
              { type: 'other' },
            )
          } else {
            const msg = await this.sendQueue.enqueue(
              () => this.bot.api.sendMessage(this.chatId, mdChunks[i].slice(0, 4096), {
                message_thread_id: this.threadId,
                disable_notification: true,
              }),
              { type: 'other' },
            )
            if (msg) {
              this.messageId = msg.message_id
            }
          }
        } catch {
          // Give up on this chunk
        }
      }
    }

    return this.messageId
  }

  getMessageId(): number | undefined {
    return this.messageId
  }
}
