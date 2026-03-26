import { describe, it, expect, vi } from 'vitest'
import { LifecycleManager } from '../lifecycle-manager.js'
import type { OpenACPPlugin } from '../types.js'

function makePlugin(name: string, opts?: Partial<OpenACPPlugin>): OpenACPPlugin {
  return {
    name,
    version: '1.0.0',
    permissions: [],
    setup: vi.fn().mockResolvedValue(undefined),
    teardown: vi.fn().mockResolvedValue(undefined),
    ...opts,
  }
}

describe('LifecycleManager', () => {
  it('calls setup on all plugins in dependency order', async () => {
    const order: string[] = []
    const a = makePlugin('a', { setup: vi.fn(async () => { order.push('a') }) })
    const b = makePlugin('b', {
      pluginDependencies: { 'a': '^1.0.0' },
      setup: vi.fn(async () => { order.push('b') }),
    })
    const mgr = new LifecycleManager()
    await mgr.boot([b, a])
    expect(order).toEqual(['a', 'b'])
  })

  it('calls teardown in reverse order', async () => {
    const order: string[] = []
    const a = makePlugin('a', { teardown: vi.fn(async () => { order.push('a') }) })
    const b = makePlugin('b', {
      pluginDependencies: { 'a': '^1.0.0' },
      teardown: vi.fn(async () => { order.push('b') }),
    })
    const mgr = new LifecycleManager()
    await mgr.boot([b, a])
    await mgr.shutdown()
    expect(order).toEqual(['b', 'a'])
  })

  it('skips plugin if setup throws, continues with others', async () => {
    const a = makePlugin('a', { setup: vi.fn().mockRejectedValue(new Error('fail')) })
    const b = makePlugin('b')
    const mgr = new LifecycleManager()
    await mgr.boot([a, b])
    expect(a.setup).toHaveBeenCalled()
    expect(b.setup).toHaveBeenCalled()
  })

  it('skips dependent when required dependency fails', async () => {
    const a = makePlugin('a', { setup: vi.fn().mockRejectedValue(new Error('fail')) })
    const b = makePlugin('b', { pluginDependencies: { 'a': '^1.0.0' } })
    const mgr = new LifecycleManager()
    await mgr.boot([a, b])
    expect(b.setup).not.toHaveBeenCalled()
  })

  it('reports loaded and failed plugins', async () => {
    const a = makePlugin('a', { setup: vi.fn().mockRejectedValue(new Error('fail')) })
    const b = makePlugin('b')
    const mgr = new LifecycleManager()
    await mgr.boot([a, b])
    expect(mgr.loadedPlugins).toContain('b')
    expect(mgr.failedPlugins).toContain('a')
  })

  it('handles teardown errors gracefully', async () => {
    const a = makePlugin('a', { teardown: vi.fn().mockRejectedValue(new Error('teardown fail')) })
    const mgr = new LifecycleManager()
    await mgr.boot([a])
    // Should not throw
    await expect(mgr.shutdown()).resolves.not.toThrow()
  })

  it('creates PluginContext for each plugin', async () => {
    const a = makePlugin('a', {
      permissions: ['services:register'],
      setup: vi.fn(async (ctx) => {
        expect(ctx.pluginName).toBe('a')
        expect(typeof ctx.registerService).toBe('function')
      }),
    })
    const mgr = new LifecycleManager()
    await mgr.boot([a])
    expect(a.setup).toHaveBeenCalled()
  })
})
