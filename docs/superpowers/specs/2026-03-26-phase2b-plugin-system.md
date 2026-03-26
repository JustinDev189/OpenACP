# Phase 2b: Plugin System — Design Spec

**Date:** 2026-03-26
**Scope:** Plugin infrastructure (loader, context, services, middleware, lifecycle) + extraction of built-in modules into plugins
**Depends on:** Phase 1 (adapter refactor) + Phase 2a (folder restructure + ACP core)
**Supersedes:** PR #63 Plugin API v2, microkernel-lifecycle-architecture proposal

---

## Goals

1. **Any feature addable without touching core** — community plugins hook into events, middleware, services
2. **Any built-in replaceable** — `overrides` declaration lets community plugins swap built-in implementations
3. **Clear boundaries** — each module is a self-contained plugin with explicit dependencies
4. **Independent update cycles** — community plugins install/update separately
5. **Full ACP coverage** — 18 middleware hook points cover every ACP interaction
6. **Lifecycle managed** — deterministic boot/shutdown order via dependency graph

## Non-Goals

- Community plugin marketplace/registry (separate project)
- Plugin hot-reload at runtime (restart required)
- Plugin sandboxing/process isolation (same process, error isolation via try/catch)

---

## Section 1: Architecture Overview

```
src/core/                         — Core infrastructure
  plugin/                         — Plugin infrastructure (NEW)
    plugin-loader.ts
    plugin-context.ts
    service-registry.ts
    middleware-chain.ts
    plugin-storage.ts
    error-tracker.ts
    lifecycle-manager.ts
    types.ts
    __tests__/

src/plugins/                      — Built-in plugins (Part 2)
  security/index.ts
  file-service/index.ts
  notifications/index.ts
  usage/index.ts
  speech/index.ts
  context/index.ts
  tunnel/index.ts
  api-server/index.ts
  telegram/index.ts
  discord/index.ts
  slack/index.ts

~/.openacp/plugins/               — Community plugins (installed via CLI)
  package.json
  node_modules/
  data/                           — Per-plugin storage
  checksums.json
```

### What stays in core

| Component | Why |
|-----------|-----|
| EventBus | Communication backbone — must exist before any plugin |
| ConfigManager | Plugins need config to know if they're enabled |
| SessionManager | Too fundamental — every adapter and most plugins interact with sessions |
| AgentManager | Tightly coupled with sessions — ACP subprocess management |
| MessageTransformer | Core pipeline — transforms AgentEvents to OutgoingMessages |
| Plugin infrastructure | LifecycleManager, PluginLoader, ServiceRegistry, etc. |

### What becomes a plugin

| Current module | Plugin name | Service registered |
|---------------|-------------|-------------------|
| SecurityGuard | `@openacp/security` | `security` |
| FileService | `@openacp/file-service` | `file-service` |
| NotificationManager | `@openacp/notifications` | `notifications` |
| UsageStore + UsageBudget | `@openacp/usage` | `usage` |
| SpeechService + providers | `@openacp/speech` | `speech` |
| ContextManager + providers | `@openacp/context` | `context` |
| TunnelService + providers | `@openacp/tunnel` | `tunnel` |
| ApiServer | `@openacp/api-server` | `api-server` |
| TelegramAdapter | `@openacp/telegram` | `adapter:telegram` |
| DiscordAdapter | `@openacp/discord` | `adapter:discord` |
| SlackAdapter | `@openacp/slack` | `adapter:slack` |

---

## Section 2: Plugin Interface

```typescript
interface OpenACPPlugin {
  /** Unique identifier, e.g., '@openacp/security' */
  name: string

  /** Semver version */
  version: string

  /** Human-readable description */
  description?: string

  /** Required plugin dependencies — loaded before this plugin */
  pluginDependencies?: Record<string, string>  // name → semver range

  /** Optional plugin dependencies — used if available, skipped if not */
  optionalPluginDependencies?: Record<string, string>

  /** Override a built-in plugin (replaces it entirely) */
  overrides?: string

  /** Required permissions */
  permissions: PluginPermission[]

  /**
   * Called during startup in dependency order.
   * Register services, hooks, commands, middleware here.
   */
  setup(ctx: PluginContext): Promise<void>

  /**
   * Called during shutdown in reverse order.
   * Cleanup resources, flush data, close connections.
   * Has a timeout (10 seconds default).
   */
  teardown?(): Promise<void>
}

type PluginPermission =
  | 'events:read'          // Subscribe to events
  | 'events:emit'          // Emit custom events
  | 'services:register'    // Register a service
  | 'services:use'         // Lookup and use services
  | 'middleware:register'  // Register middleware hooks
  | 'commands:register'    // Register commands
  | 'storage:read'         // Read from plugin storage
  | 'storage:write'        // Write to plugin storage
  | 'kernel:access'        // Access kernel internals (sessions, config)
```

---

## Section 3: PluginContext

The single entry point for all plugin capabilities:

```typescript
interface PluginContext {
  // === Identity ===
  pluginName: string
  pluginConfig: Record<string, unknown>

  // === Tier 1 — Events (observe) ===
  on(event: string, handler: (...args: unknown[]) => void): void
  off(event: string, handler: (...args: unknown[]) => void): void

  // === Tier 2 — Actions ===

  // Middleware (modify flow)
  registerMiddleware(hook: MiddlewareHook, opts: MiddlewareOptions): void

  // Services (provide/consume)
  registerService<T>(name: string, implementation: T): void
  getService<T>(name: string): T | undefined

  // Commands
  registerCommand(def: CommandDef): void

  // Storage
  storage: PluginStorage

  // Logging
  log: Logger

  // Send message to session (shortcut)
  sendMessage(sessionId: string, content: OutgoingMessage): Promise<void>

  // === Tier 3 — Kernel access (advanced) ===
  sessions: SessionManager   // read-only access
  config: ConfigManager      // read-only access
  eventBus: EventBus
}
```

### PluginStorage

```typescript
interface PluginStorage {
  /** Simple key-value for plugin state */
  get<T>(key: string): Promise<T | undefined>
  set<T>(key: string, value: T): Promise<void>
  delete(key: string): Promise<void>
  list(): Promise<string[]>

  /** Data directory for advanced use (SQLite, large files, etc.) */
  getDataDir(): string
}
```

Storage location: `~/.openacp/plugins/data/{plugin-name}/`
KV store: JSON file at `~/.openacp/plugins/data/{plugin-name}/kv.json`

### CommandDef

```typescript
interface CommandDef {
  name: string             // without slash, e.g., 'context'
  description: string
  usage?: string           // e.g., '<session-number>'
  handler(args: CommandArgs): Promise<void>
}

interface CommandArgs {
  raw: string              // raw argument string
  sessionId: string | null // null if from notification topic
  channelId: string
  userId: string
  reply(content: string | OutgoingMessage): Promise<void>
}
```

---

## Section 4: Middleware System

### 18 Hook Points

| Hook | Timing | Can modify? | Use case |
|------|--------|-------------|----------|
| **Message flow** | | | |
| `message:incoming` | User message → core | Yes | Content filter, rate limit |
| `message:outgoing` | Core → adapter → user | Yes | Translation, formatting |
| **Agent flow** | | | |
| `agent:beforePrompt` | Before prompt → agent | Yes | Context injection, system prompt |
| `agent:beforeEvent` | Before event → bridge | Yes | Filter tool output, redact content |
| `agent:afterEvent` | After event processed | Read-only | Logging, metrics |
| **Turn lifecycle** | | | |
| `turn:start` | Prompt accepted | Read-only | Timing, turn tracking |
| `turn:end` | stopReason received | Read-only | Metrics, turn limits |
| **File system** | | | |
| `fs:beforeRead` | Before reading file | Yes | Path allowlist, audit |
| `fs:beforeWrite` | Before writing file | Yes | Protect paths, sanitize |
| **Terminal** | | | |
| `terminal:beforeCreate` | Before spawning process | Yes | Command blocklist, sandbox |
| `terminal:afterExit` | After process exits | Read-only | Audit logging |
| **Permission** | | | |
| `permission:beforeRequest` | Before showing UI | Yes | Auto-approve/reject |
| `permission:afterResolve` | After user responds | Read-only | Audit logging |
| **Session** | | | |
| `session:beforeCreate` | Before creation | Yes | Quota check, workspace validation |
| `session:afterDestroy` | After destroyed | Read-only | Cleanup, logging |
| **Control** | | | |
| `mode:beforeChange` | Before set_mode | Yes | Enforce mode policies |
| `config:beforeChange` | Before set_config_option | Yes | Validate config changes |
| `agent:beforeCancel` | Before cancel | Yes | Block or delay cancellation |

### Middleware Function Signature

```typescript
type MiddlewareFn<T> = (payload: T, next: () => Promise<T>) => Promise<T | null>

// null = skip/block (don't proceed to next middleware or core handler)
// return next() = pass through
// return modified payload = transform

interface MiddlewareOptions {
  priority?: number        // override topo-sort order (lower = earlier)
  handler: MiddlewareFn<unknown>
}
```

### Execution Order

1. **Topo-sort order** (from dependency graph) — plugins loaded earlier run middleware first
2. **Priority override** — if specified, overrides topo-sort position
3. **Same level + same priority** — registration order

### Error Handling in Middleware

Per-call try/catch. If middleware throws:
1. Log error with plugin name
2. Skip this plugin's middleware
3. Continue chain with next middleware
4. Increment plugin error count (for error budget)

---

## Section 5: Lifecycle Management

### Boot Sequence

```
1. Kernel boot
   ├── Load config from ~/.openacp/config.json
   ├── Init EventBus
   ├── Init ServiceRegistry
   ├── Init SessionManager
   ├── Init AgentManager
   └── Init MiddlewareChain

2. Plugin discovery
   ├── Scan built-in plugins (from src/plugins/)
   ├── Scan community plugins (from ~/.openacp/plugins/node_modules/)
   ├── Read each plugin's dependencies + permissions
   ├── Validate: circular deps, missing deps, version mismatches
   ├── Apply overrides (skip overridden built-in plugins)
   └── Compute load order via topological sort

3. Plugin setup (topo-sorted order)
   ├── For each enabled plugin:
   │   ├── Create PluginContext (scoped by permissions)
   │   ├── Create PluginStorage (scoped directory)
   │   ├── Call plugin.setup(ctx) with timeout (30 seconds)
   │   ├── If throws → log error, mark failed, skip dependents
   │   └── Emit 'plugin:loaded' event
   └── If required dependency failed → skip this plugin too

4. Post-setup
   ├── Collect all registered commands → emit 'system:commands-ready'
   ├── Verify adapter plugins registered
   └── Log startup summary

5. Ready
   ├── Emit 'system:ready'
   └── Adapters start accepting messages
```

### Shutdown Sequence

```
1. Receive SIGINT/SIGTERM
   └── Emit 'system:shutdown'

2. Grace period (30 seconds)
   ├── Adapters stop accepting new messages
   └── Wait for in-flight prompts

3. Plugin teardown (REVERSE topo-sort order)
   ├── For each plugin:
   │   ├── Call plugin.teardown() with timeout (10 seconds)
   │   ├── If timeout/throws → log warning, continue
   │   └── Cleanup: remove event listeners, unregister middleware
   └── Adapters teardown last

4. Kernel cleanup
   ├── Destroy remaining sessions
   ├── Stop AgentManager
   ├── Flush EventBus
   └── Exit
```

### Plugin Dependency Resolution

```typescript
// Topological sort with cycle detection
function resolveLoadOrder(plugins: OpenACPPlugin[]): OpenACPPlugin[] {
  // Build adjacency graph from pluginDependencies
  // Detect cycles → throw with cycle path
  // Return topo-sorted array
}
```

**Missing dependency:** Skip plugin + all its dependents. Log error. System continues degraded.

**Circular dependency:** Skip both plugins. Log error with cycle path.

**Version mismatch:** Log warning. Attempt to load anyway. If setup() fails → skip.

---

## Section 6: Service Registry

```typescript
class ServiceRegistry {
  register<T>(name: string, implementation: T, pluginName: string): void
  get<T>(name: string): T | undefined
  has(name: string): boolean
  list(): Array<{ name: string; pluginName: string }>
}
```

### Registration Rules

| Scenario | Behavior |
|----------|----------|
| First registration for a name | Accept |
| Same name, no override declared | Error — plugin skipped |
| Same name, override declared | Replace — overridden plugin's setup() never called |
| Service used before registered | Returns undefined (caller must handle) |

### Provider Extension Pattern

Built-in plugins bundle orchestrator + default providers. Community extends:

```typescript
// Community plugin: @community/speech-elevenlabs
{
  name: '@community/speech-elevenlabs',
  pluginDependencies: { '@openacp/speech': '^1.0.0' },

  async setup(ctx) {
    const speech = ctx.getService<SpeechService>('speech')!
    speech.registerTTSProvider('elevenlabs', new ElevenLabsTTS(ctx.pluginConfig))
  }
}
```

Applies to: Speech (TTS/STT providers), Tunnel (tunnel providers), Context (context providers).

---

## Section 7: Error Isolation

### Per-Call Isolation

Every plugin interaction (event handler, middleware, service call from untrusted plugin) is wrapped:

```typescript
try {
  await handler(payload)
} catch (err) {
  log.error({ plugin: pluginName, err }, 'Plugin error')
  errorTracker.increment(pluginName)
}
```

### Error Budget

```typescript
class ErrorTracker {
  private errors = new Map<string, { count: number; windowStart: number }>()

  increment(pluginName: string): void
  isDisabled(pluginName: string): boolean
  reset(pluginName: string): void
}
```

Config per plugin:
```json
{
  "plugins": [
    {
      "package": "@community/auto-approve",
      "enabled": true,
      "errorBudget": { "maxErrors": 10, "windowMs": 3600000 }
    }
  ]
}
```

Default: 10 errors per hour. Exceeded → auto-disable, emit `plugin:disabled` event, log warning with reason.

Built-in plugins: no error budget (trusted, bugs should be fixed in code).

---

## Section 8: Events

### System Events

| Event | Payload | Emitter |
|-------|---------|---------|
| `system:ready` | `{}` | LifecycleManager |
| `system:shutdown` | `{}` | LifecycleManager |
| `system:commands-ready` | `{ commands: CommandDef[] }` | LifecycleManager |
| `plugin:loaded` | `{ name, version }` | PluginLoader |
| `plugin:failed` | `{ name, error }` | PluginLoader |
| `plugin:disabled` | `{ name, reason }` | ErrorTracker |

### Session Events

| Event | Payload |
|-------|---------|
| `session:created` | `{ sessionId, agentName, userId, channelId, workingDir }` |
| `session:ended` | `{ sessionId, reason }` |
| `session:named` | `{ sessionId, name }` |
| `session:updated` | `{ sessionId, status }` |

### Agent Events

| Event | Payload |
|-------|---------|
| `agent:event` | `{ sessionId, event: AgentEvent }` |
| `agent:prompt` | `{ sessionId, text, attachments? }` |

### Permission Events

| Event | Payload |
|-------|---------|
| `permission:request` | `{ sessionId, request: PermissionRequest }` |
| `permission:resolved` | `{ sessionId, requestId, decision }` |

---

## Section 9: Full Message Flow with Hooks

```
═══ USER → AGENT ═══

User sends message
  → Adapter receives
  → [message:incoming]              ← can modify/block
  → core.handleMessage()
  → security.checkAccess()          ← via getService('security')
  → [session:beforeCreate]          ← can modify/block (if new session)
  → Session.enqueuePrompt()
  → [turn:start]                    ← observe
  → [agent:beforePrompt]            ← can modify prompt
  → AgentInstance.prompt()

═══ AGENT → USER ═══

Agent emits session/update
  → AgentInstance parses event
  → [agent:beforeEvent]             ← can modify/block
  → SessionBridge transforms + routes
  → [message:outgoing]              ← can modify/block
  → Adapter.sendMessage()
  → User sees message
  → [agent:afterEvent]              ← observe

Turn complete (stopReason received)
  → [turn:end]                      ← observe

═══ FILE SYSTEM ═══

Agent requests fs/readTextFile
  → [fs:beforeRead]                 ← can block/modify path
  → FileService.readTextFileWithRange()
  → return content

Agent requests fs/writeTextFile
  → [fs:beforeWrite]                ← can block/modify
  → fs.writeFile()

═══ TERMINAL ═══

Agent requests terminal/create
  → [terminal:beforeCreate]         ← can block/modify env
  → spawn process

Process exits
  → [terminal:afterExit]            ← observe

═══ PERMISSION ═══

Agent requests permission
  → [permission:beforeRequest]      ← can auto-approve/reject
  → PermissionGate → Adapter UI
  → User responds
  → [permission:afterResolve]       ← observe

═══ CONTROL ═══

Mode change  → [mode:beforeChange]    ← can block
Config change → [config:beforeChange]  ← can validate
Cancel       → [agent:beforeCancel]   ← can delay
```

---

## Section 10: Concrete Plugin Examples

### Security Plugin (built-in)

```typescript
const securityPlugin: OpenACPPlugin = {
  name: '@openacp/security',
  version: '1.0.0',
  permissions: ['events:read', 'services:register', 'middleware:register'],

  async setup(ctx) {
    const config = ctx.pluginConfig as { allowedUserIds?: string[]; maxConcurrentSessions?: number }
    const allowed = new Set(config.allowedUserIds ?? [])
    const maxSessions = config.maxConcurrentSessions ?? 5

    // Register middleware to check access on every incoming message
    ctx.registerMiddleware('message:incoming', {
      handler: async (msg: any, next) => {
        if (allowed.size > 0 && !allowed.has(msg.userId)) {
          return null  // block
        }
        return next()
      }
    })

    // Register service for other plugins
    ctx.registerService('security', {
      checkAccess: async (userId: string) => ({
        allowed: allowed.size === 0 || allowed.has(userId),
      }),
      checkSessionLimit: async (userId: string) => ({
        allowed: true,  // simplified
      }),
    })
  }
}
```

### Auto-Approve Plugin (community)

```typescript
const autoApprovePlugin: OpenACPPlugin = {
  name: '@community/auto-approve',
  version: '1.0.0',
  pluginDependencies: { '@openacp/security': '^1.0.0' },
  permissions: ['middleware:register', 'services:use'],

  async setup(ctx) {
    const rules = await ctx.storage.get<ApproveRule[]>('rules') ?? []

    ctx.registerMiddleware('permission:beforeRequest', {
      handler: async (payload: any, next) => {
        const rule = rules.find(r => matchesRule(r, payload.request))
        if (rule?.action === 'allow') {
          // Auto-approve — resolve permission without showing UI
          payload.autoResolve = rule.optionId
          return payload
        }
        return next()
      }
    })
  }
}
```

### Translation Plugin (community)

```typescript
const translatePlugin: OpenACPPlugin = {
  name: '@community/translate',
  version: '1.0.0',
  permissions: ['middleware:register'],

  async setup(ctx) {
    const targetLang = (ctx.pluginConfig as any).language ?? 'vi'

    ctx.registerMiddleware('message:outgoing', {
      handler: async (msg: any, next) => {
        if (msg.type === 'text') {
          msg.text = await translate(msg.text, targetLang)
        }
        return next()
      }
    })
  }
}
```

---

## Section 11: Implementation Strategy — 2 Plans

### Plan 1: Plugin Infrastructure (no extraction)

Build the plugin system. Core modules stay hard-wired. Community plugins can load.

| Task | Description |
|------|-------------|
| 1 | Plugin types (`OpenACPPlugin`, `PluginContext`, etc.) |
| 2 | ServiceRegistry |
| 3 | MiddlewareChain (18 hook points) |
| 4 | PluginStorage (KV + dataDir) |
| 5 | ErrorTracker (per-plugin error budget) |
| 6 | PluginLoader (discover, validate, topo-sort) |
| 7 | PluginContext factory |
| 8 | LifecycleManager (boot/shutdown orchestration) |
| 9 | Wire into core.ts — LifecycleManager replaces manual startup |
| 10 | Wire middleware hooks into existing pipeline (handleMessage, SessionBridge, AgentInstance) |
| 11 | CLI: `openacp plugin add/remove/list` commands |
| 12 | Tests for all infrastructure |

**After Plan 1:** Community plugins work. Built-in modules still hard-wired in core. Both coexist.

### Plan 2: Built-in Extraction

Move each built-in module to `src/plugins/` and wrap in `OpenACPPlugin` interface.

| Task | Module | Difficulty | Dependencies |
|------|--------|-----------|-------------|
| 1 | ContextManager | Easy | None |
| 2 | Speech | Easy | file-service (optional) |
| 3 | Usage | Easy | None |
| 4 | Tunnel | Easy | None (already in main.ts) |
| 5 | Security | Medium | None |
| 6 | Notifications | Medium | security |
| 7 | FileService | Medium | None |
| 8 | ApiServer | Easy | security (already in main.ts) |
| 9 | Telegram | Hard | security, notifications |
| 10 | Discord | Hard | security, notifications |
| 11 | Slack | Hard | security, notifications |
| 12 | Remove hard-wired code from core.ts |

**After Plan 2:** Everything is a plugin. Core is minimal.

---

## Section 12: Backward Compatibility

- **Config format:** Plugin entries added to `config.json`. Old config without `plugins` field → auto-migrate (built-in plugins implicitly enabled).
- **CLI commands:** `openacp install/uninstall` still work for agents. New `openacp plugin add/remove` for plugins.
- **Public API:** `src/core/index.ts` exports unchanged. New exports added for plugin types.
- **Adapters:** Phase 1's `IChannelAdapter`, `MessagingAdapter`, `IRenderer` unchanged. Adapter plugins wrap them.

---

## Expected Outcomes

| Metric | Before | After Plan 1 | After Plan 2 |
|--------|--------|-------------|-------------|
| core.ts direct deps | 11 | 11 + LifecycleManager | 3 (EventBus, SessionManager, AgentManager) |
| Plugin types supported | adapter only | adapter + any | adapter + any |
| Community plugin capabilities | install adapter | full (events, middleware, services, commands, storage) | full |
| Built-in modules as plugins | 0 | 0 | 11 |
| Middleware hook points | 0 | 18 | 18 |
| Error isolation | none | per-plugin try/catch + budget | per-plugin try/catch + budget |
