import fs from 'node:fs'
import path from 'node:path'
import type { OpenACPPlugin } from './types.js'

let loadCounter = 0

export class DevPluginLoader {
  private pluginPath: string

  constructor(pluginPath: string) {
    this.pluginPath = path.resolve(pluginPath)
  }

  async load(): Promise<OpenACPPlugin> {
    const distIndex = path.join(this.pluginPath, 'dist', 'index.js')
    const srcIndex = path.join(this.pluginPath, 'src', 'index.ts')

    if (!fs.existsSync(distIndex) && !fs.existsSync(srcIndex)) {
      throw new Error(`Plugin not found at ${this.pluginPath}. Expected dist/index.js or src/index.ts`)
    }

    if (!fs.existsSync(distIndex)) {
      throw new Error(`Built plugin not found at ${distIndex}. Run 'npm run build' first.`)
    }

    // Node.js caches ESM imports by URL. Use a unique query string to bust
    // the cache on each reload while keeping the file in its original directory
    // so that relative imports (e.g., './adapter.js') still resolve correctly.
    const cacheBuster = `v=${Date.now()}-${++loadCounter}`
    const mod = await import(`file://${distIndex}?${cacheBuster}`)
    const plugin = mod.default as OpenACPPlugin

    if (!plugin || !plugin.name || !plugin.setup) {
      throw new Error(`Invalid plugin at ${distIndex}. Must export default OpenACPPlugin with name and setup().`)
    }

    return plugin
  }

  getPluginPath(): string {
    return this.pluginPath
  }

  getDistPath(): string {
    return path.join(this.pluginPath, 'dist')
  }
}
