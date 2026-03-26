export interface ErrorBudgetConfig {
  maxErrors: number   // default 10
  windowMs: number    // default 3600000 (1 hour)
}

export class ErrorTracker {
  private errors = new Map<string, { count: number; windowStart: number }>()
  private disabled = new Set<string>()
  private exempt = new Set<string>()
  private config: ErrorBudgetConfig

  onDisabled?: (pluginName: string, reason: string) => void

  constructor(config?: Partial<ErrorBudgetConfig>) {
    this.config = { maxErrors: config?.maxErrors ?? 10, windowMs: config?.windowMs ?? 3600000 }
  }

  increment(pluginName: string): void {
    if (this.exempt.has(pluginName)) return

    const now = Date.now()
    const entry = this.errors.get(pluginName)

    if (!entry || now - entry.windowStart >= this.config.windowMs) {
      this.errors.set(pluginName, { count: 1, windowStart: now })
    } else {
      entry.count += 1
    }

    const current = this.errors.get(pluginName)!
    if (current.count >= this.config.maxErrors && !this.disabled.has(pluginName)) {
      this.disabled.add(pluginName)
      const reason = `Error budget exceeded: ${current.count} errors within ${this.config.windowMs}ms window`
      this.onDisabled?.(pluginName, reason)
    }
  }

  isDisabled(pluginName: string): boolean {
    return this.disabled.has(pluginName)
  }

  reset(pluginName: string): void {
    this.disabled.delete(pluginName)
    this.errors.delete(pluginName)
  }

  setExempt(pluginName: string): void {
    this.exempt.add(pluginName)
  }
}
