import { describe, it, expect, vi } from 'vitest'
import { NotificationManager } from '../notification.js'
import type { IChannelAdapter } from '../../../core/channel.js'
import type { NotificationMessage } from '../../../core/types.js'

function mockAdapter(): IChannelAdapter {
  return {
    name: 'test',
    capabilities: { streaming: false, richFormatting: false, threads: false, reactions: false, fileUpload: false, voice: false },
    start: vi.fn(),
    stop: vi.fn(),
    sendMessage: vi.fn(),
    sendPermissionRequest: vi.fn(),
    sendNotification: vi.fn().mockResolvedValue(undefined),
    createSessionThread: vi.fn(),
    renameSessionThread: vi.fn(),
    deleteSessionThread: vi.fn(),
    sendSkillCommands: vi.fn(),
    cleanupSkillCommands: vi.fn(),
  } as unknown as IChannelAdapter
}

describe('NotificationManager', () => {
  const notification: NotificationMessage = {
    sessionId: 'sess-1',
    type: 'completed',
    summary: 'Test notification',
  }

  describe('notify()', () => {
    it('sends notification to specified adapter', async () => {
      const adapter = mockAdapter()
      const adapters = new Map([['telegram', adapter]])
      const manager = new NotificationManager(adapters)

      await manager.notify('telegram', notification)

      expect(adapter.sendNotification).toHaveBeenCalledWith(notification)
    })

    it('does nothing when adapter not found', async () => {
      const adapters = new Map<string, IChannelAdapter>()
      const manager = new NotificationManager(adapters)

      // Should not throw
      await manager.notify('unknown', notification)
    })

    it('does not notify other adapters', async () => {
      const telegram = mockAdapter()
      const discord = mockAdapter()
      const adapters = new Map([
        ['telegram', telegram],
        ['discord', discord],
      ])
      const manager = new NotificationManager(adapters)

      await manager.notify('telegram', notification)

      expect(telegram.sendNotification).toHaveBeenCalledWith(notification)
      expect(discord.sendNotification).not.toHaveBeenCalled()
    })
  })

  describe('notifyAll()', () => {
    it('sends notification to all adapters', async () => {
      const telegram = mockAdapter()
      const discord = mockAdapter()
      const adapters = new Map([
        ['telegram', telegram],
        ['discord', discord],
      ])
      const manager = new NotificationManager(adapters)

      await manager.notifyAll(notification)

      expect(telegram.sendNotification).toHaveBeenCalledWith(notification)
      expect(discord.sendNotification).toHaveBeenCalledWith(notification)
    })

    it('handles empty adapter map', async () => {
      const adapters = new Map<string, IChannelAdapter>()
      const manager = new NotificationManager(adapters)

      // Should not throw
      await manager.notifyAll(notification)
    })

    it('sends to single adapter when only one registered', async () => {
      const adapter = mockAdapter()
      const adapters = new Map([['telegram', adapter]])
      const manager = new NotificationManager(adapters)

      await manager.notifyAll(notification)

      expect(adapter.sendNotification).toHaveBeenCalledTimes(1)
    })
  })

  describe('error resilience', () => {
    it('notify() does not throw when adapter.sendNotification fails', async () => {
      const adapter = mockAdapter()
      ;(adapter.sendNotification as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network error'))
      const adapters = new Map([['telegram', adapter]])
      const manager = new NotificationManager(adapters)

      // Should not throw
      await manager.notify('telegram', notification)
    })

    it('notifyAll() continues to next adapter when one fails', async () => {
      const failing = mockAdapter()
      ;(failing.sendNotification as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network error'))
      const working = mockAdapter()
      const adapters = new Map([
        ['telegram', failing],
        ['discord', working],
      ])
      const manager = new NotificationManager(adapters)

      await manager.notifyAll(notification)

      expect(failing.sendNotification).toHaveBeenCalledWith(notification)
      expect(working.sendNotification).toHaveBeenCalledWith(notification)
    })
  })
})
