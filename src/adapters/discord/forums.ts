import { ChannelType } from 'discord.js'
import type { ForumChannel, ThreadChannel, Guild, TextChannel } from 'discord.js'
import { log } from '../../core/log.js'

// ─── ensureForums ─────────────────────────────────────────────────────────────

/**
 * Ensures both the forum channel and notification channel exist.
 * Creates them if their IDs are null, then persists the IDs via saveConfig.
 *
 * saveConfig uses nested object path: { channels: { discord: { forumChannelId: ... } } }
 */
export async function ensureForums(
  guild: Guild,
  config: {
    forumChannelId: string | null
    notificationChannelId: string | null
  },
  saveConfig: (updates: Record<string, unknown>) => Promise<void>,
): Promise<{ forumChannel: ForumChannel; notificationChannel: TextChannel }> {
  let forumChannelId = config.forumChannelId
  let notificationChannelId = config.notificationChannelId

  // Ensure forum channel exists — fetch existing or create new
  let forumChannel: ForumChannel | null = null
  if (forumChannelId) {
    try {
      const ch = guild.channels.cache.get(forumChannelId)
        ?? await guild.channels.fetch(forumChannelId)
      if (ch && ch.type === ChannelType.GuildForum) {
        forumChannel = ch as ForumChannel
        log.info({ forumChannelId }, '[forums] Reusing existing forum channel')
      }
    } catch {
      log.warn({ forumChannelId }, '[forums] Saved forum channel not found, recreating...')
    }
  }
  if (!forumChannel) {
    // Forum channels require Community mode — check before attempting creation
    if (!guild.features.includes('COMMUNITY')) {
      throw new Error(
        'Forum channels require Community mode. Enable it in Server Settings → Community. ' +
        'Alternatively, enable it via: Server Settings → Enable Community → Complete setup.',
      )
    }
    const channel = await guild.channels.create({
      name: 'openacp-sessions',
      type: ChannelType.GuildForum,
    })
    forumChannel = channel as ForumChannel
    await saveConfig({ channels: { discord: { forumChannelId: channel.id } } })
    log.info({ forumChannelId: channel.id }, '[forums] Created forum channel')
  }

  // Ensure notification channel exists — fetch existing or create new
  let notificationChannel: TextChannel | null = null
  if (notificationChannelId) {
    try {
      const ch = guild.channels.cache.get(notificationChannelId)
        ?? await guild.channels.fetch(notificationChannelId)
      if (ch && ch.type === ChannelType.GuildText) {
        notificationChannel = ch as TextChannel
        log.info({ notificationChannelId }, '[forums] Reusing existing notification channel')
      }
    } catch {
      log.warn({ notificationChannelId }, '[forums] Saved notification channel not found, recreating...')
    }
  }
  if (!notificationChannel) {
    const channel = await guild.channels.create({
      name: 'openacp-notifications',
      type: ChannelType.GuildText,
    })
    notificationChannel = channel as TextChannel
    await saveConfig({ channels: { discord: { notificationChannelId: channel.id } } })
    log.info({ notificationChannelId: channel.id }, '[forums] Created notification channel')
  }

  return { forumChannel, notificationChannel }
}

// ─── createSessionThread ──────────────────────────────────────────────────────

/**
 * Creates a new thread in the forum channel with an initial "⏳ Setting up..." message.
 * Returns the created ThreadChannel.
 */
export async function createSessionThread(
  forumChannel: ForumChannel,
  name: string,
): Promise<ThreadChannel> {
  const thread = await forumChannel.threads.create({
    name,
    message: { content: '⏳ Setting up...' },
  })
  return thread
}

// ─── renameSessionThread ──────────────────────────────────────────────────────

/**
 * Fetches and renames a thread. Ignores all errors (thread may be deleted/archived).
 */
export async function renameSessionThread(
  guild: Guild,
  threadId: string,
  newName: string,
): Promise<void> {
  try {
    const channel = guild.channels.cache.get(threadId)
      ?? await guild.channels.fetch(threadId)
    if (channel && 'setName' in channel) {
      await (channel as ThreadChannel).setName(newName)
    }
  } catch {
    // Ignore — thread may be deleted or archived
  }
}

// ─── deleteSessionThread ──────────────────────────────────────────────────────

/**
 * Archives and locks a thread instead of permanently deleting it.
 * Unlike Telegram (which just closes a topic), Discord delete is permanent
 * and destroys all messages. Archiving preserves the conversation history.
 */
export async function deleteSessionThread(
  guild: Guild,
  threadId: string,
): Promise<void> {
  try {
    const channel = guild.channels.cache.get(threadId)
      ?? await guild.channels.fetch(threadId)
    if (channel && channel.isThread()) {
      const thread = channel as ThreadChannel
      if (!thread.archived) {
        await thread.setArchived(true)
      }
      if (!thread.locked) {
        await thread.setLocked(true)
      }
    }
  } catch {
    // Ignore — thread may already be deleted or inaccessible
  }
}

// ─── ensureUnarchived ─────────────────────────────────────────────────────────

/**
 * If the thread is archived, unarchives it.
 */
export async function ensureUnarchived(thread: ThreadChannel): Promise<void> {
  if (thread.archived) {
    try {
      await thread.setArchived(false)
    } catch (err) {
      log.warn({ err, threadId: thread.id }, '[forums] Failed to unarchive thread')
    }
  }
}

// ─── buildDeepLink ────────────────────────────────────────────────────────────

/**
 * Builds a Discord deep link URL to a channel/thread, optionally to a specific message.
 */
export function buildDeepLink(
  guildId: string,
  channelId: string,
  messageId?: string,
): string {
  const base = `https://discord.com/channels/${guildId}/${channelId}`
  return messageId ? `${base}/${messageId}` : base
}
