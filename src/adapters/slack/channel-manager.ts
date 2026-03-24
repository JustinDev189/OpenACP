// src/adapters/slack/channel-manager.ts
import type { ISlackSendQueue } from "./send-queue.js";
import { toSlug } from "./slug.js";
import type { SlackSessionMeta } from "./types.js";
import type { SlackChannelConfig } from "./types.js";

export interface ISlackChannelManager {
  createChannel(sessionId: string, sessionName: string): Promise<SlackSessionMeta>;
  archiveChannel(channelId: string): Promise<void>;
  notifyChannel(channelId: string, text: string): Promise<void>;
}

export class SlackChannelManager implements ISlackChannelManager {
  constructor(
    private queue: ISlackSendQueue,
    private config: SlackChannelConfig,
  ) {}

  async createChannel(sessionId: string, sessionName: string): Promise<SlackSessionMeta> {
    let finalSlug = toSlug(sessionName, this.config.channelPrefix ?? "openacp");

    let channelId: string;
    try {
      const res = await this.queue.enqueue<{ channel: { id: string } }>(
        "conversations.create",
        { name: finalSlug, is_private: true }
      );
      channelId = res.channel.id;
    } catch (err: any) {
      if (err?.data?.error === "name_taken") {
        finalSlug = toSlug(sessionName, this.config.channelPrefix ?? "openacp");
        const res = await this.queue.enqueue<{ channel: { id: string } }>(
          "conversations.create",
          { name: finalSlug, is_private: true }
        );
        channelId = res.channel.id;
      } else {
        throw err;
      }
    }

    // Bot is automatically a member of private channels it creates — no join/invite needed.
    // Invite configured users so they can access the channel.
    const userIds = this.config.allowedUserIds ?? [];
    if (userIds.length > 0) {
      await this.queue.enqueue("conversations.invite", {
        channel: channelId,
        users: userIds.join(","),
      });
    }

    return { channelId, channelSlug: finalSlug };
  }

  async archiveChannel(channelId: string): Promise<void> {
    await this.queue.enqueue("conversations.archive", { channel: channelId });
  }

  async notifyChannel(channelId: string, text: string): Promise<void> {
    if (this.config.notificationChannelId) {
      await this.queue.enqueue("chat.postMessage", {
        channel: this.config.notificationChannelId,
        text,
      });
    }
  }
}
