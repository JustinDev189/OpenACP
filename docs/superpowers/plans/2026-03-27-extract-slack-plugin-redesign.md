# Extract Slack Plugin from Redesign Branch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the Slack adapter from OpenACP's built-in plugins into a standalone `@openacp/adapter-slack` package in the `slack-plugin` repo, update the Plugin SDK exports, add registry discovery to the setup wizard, and update the plugin-registry manifest.

**Architecture:** The Slack plugin source code lives at `src/plugins/slack/` on the `redesign/microkernel-plugin-architecture` branch as a built-in plugin. We copy it to the `slack-plugin` repo, rewrite all `../../core/...` imports to use `@openacp/plugin-sdk`, remove the built-in plugin from core, and wire the wizard to discover community adapters from the registry.

**Tech Stack:** TypeScript, ESM, Vitest, `@openacp/plugin-sdk`, `@slack/bolt`, `@slack/web-api`, `@clack/prompts`, `p-queue`, `nanoid`, `zod`

**Repos involved (all under `/Users/hieu/Documents/Companies/Lab3/opensource/openacp-group/`):**

| Repo | Path | Branch | Tasks |
|------|------|--------|-------|
| `OpenACP` | `openacp-group/OpenACP` | `feat/extract-slack-plugin` (from `redesign/microkernel-plugin-architecture`) | 1, 5, 6 |
| `slack-plugin` | `openacp-group/slack-plugin` | `feat/redesign-plugin-architecture` (from `main`) | 2, 3, 4 |
| `plugin-registry` | `openacp-group/plugin-registry` | `feat/update-slack-manifest-redesign` (from `main`) | 7 |
| All repos | — | — | 8 |

**Task execution order:** Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7 → Task 8

Tasks 1 must complete before Tasks 3-4 (SDK exports needed for plugin imports).
Tasks 2-4 (slack-plugin) and Task 5 (OpenACP remove) can run in parallel.
Task 7 (plugin-registry) is independent.

---

### Task 1: Update Plugin SDK Exports

> **REPO: `OpenACP`** (`/Users/hieu/Documents/Companies/Lab3/opensource/openacp-group/OpenACP`)
> **BRANCH: `feat/extract-slack-plugin`** (created from `redesign/microkernel-plugin-architecture`)

**Files:**
- Modify: `OpenACP/src/packages/plugin-sdk/src/index.ts`
- Modify: `OpenACP/src/index.ts` (if types aren't already exported from the main package)

The SDK currently exports adapter base classes (`MessagingAdapter`, `BaseRenderer`, `SendQueue`) but is missing several types that adapter plugins need. These must be added before the Slack plugin can compile.

- [ ] **Step 1: Checkout redesign branch in OpenACP**

```bash
cd /Users/hieu/Documents/Companies/Lab3/opensource/openacp-group/OpenACP
git stash
git checkout redesign/microkernel-plugin-architecture
git checkout -b feat/extract-slack-plugin
```

- [ ] **Step 2: Check which types are already exported from `src/index.ts`**

Run:
```bash
grep -n "DisplayVerbosity\|AdapterCapabilities\|Attachment\|MessagingAdapterConfig\|IRenderer\|RenderedMessage\|RenderedPermission" src/index.ts
```

This tells us which types are already in the main package's public API (the SDK re-exports from `@openacp/cli`).

- [ ] **Step 3: Add missing type exports to `src/index.ts`**

Add the following exports to `src/index.ts` if not already present. These are the types adapter plugins need:

```typescript
// Adapter types for external plugins
export type { DisplayVerbosity } from './core/adapter-primitives/format-types.js'
export type { AdapterCapabilities } from './core/channel.js'
export type { Attachment } from './core/types.js'
export type { MessagingAdapterConfig } from './core/adapter-primitives/messaging-adapter.js'
export type { IRenderer, RenderedMessage, RenderedPermission } from './core/adapter-primitives/rendering/renderer.js'
```

- [ ] **Step 4: Update Plugin SDK to re-export new types**

In `src/packages/plugin-sdk/src/index.ts`, add re-exports for the newly exported types:

```typescript
// Add to existing re-exports from '@openacp/cli'
export type {
  // ... existing exports ...
  DisplayVerbosity,
  AdapterCapabilities,
  Attachment,
  MessagingAdapterConfig,
  IRenderer,
  RenderedMessage,
  RenderedPermission,
} from '@openacp/cli'
```

- [ ] **Step 5: Verify build**

```bash
pnpm build
```

Expected: Build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add src/index.ts src/packages/plugin-sdk/src/index.ts
git commit -m "feat(plugin-sdk): export adapter types for external plugins"
```

---

### Task 2: Reset slack-plugin Repo

> **REPO: `slack-plugin`** (`/Users/hieu/Documents/Companies/Lab3/opensource/openacp-group/slack-plugin`)
> **BRANCH: `feat/redesign-plugin-architecture`** (created from `main`)

**Files:**
- Modify: `slack-plugin/package.json`
- Modify: `slack-plugin/tsconfig.json`
- Modify: `slack-plugin/vitest.config.ts`
- Delete: all existing `src/` files

- [ ] **Step 1: Create new branch in slack-plugin**

```bash
cd /Users/hieu/Documents/Companies/Lab3/opensource/openacp-group/slack-plugin
git checkout main
git checkout -b feat/redesign-plugin-architecture
```

- [ ] **Step 2: Delete all existing source files**

```bash
rm -rf src/ dist/
```

- [ ] **Step 3: Create new `src/` directory**

```bash
mkdir -p src/__tests__
```

- [ ] **Step 4: Update `package.json`**

Replace the entire `package.json` content:

```json
{
  "name": "@openacp/adapter-slack",
  "version": "0.1.0",
  "description": "Slack messaging platform adapter plugin for OpenACP",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "prepublishOnly": "npm run build"
  },
  "keywords": ["openacp", "openacp-plugin", "slack", "adapter"],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/Open-ACP/slack-adapter"
  },
  "peerDependencies": {
    "@openacp/plugin-sdk": "^1.0.0"
  },
  "dependencies": {
    "@clack/prompts": "^1.1.0",
    "@slack/bolt": "^4.6.0",
    "@slack/web-api": "^7.15.0",
    "nanoid": "^5.0.0",
    "p-queue": "^9.1.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@openacp/plugin-sdk": "file:../OpenACP/src/packages/plugin-sdk",
    "typescript": "^5.4.0",
    "vitest": "^3.0.0"
  }
}
```

Note: `devDependencies` uses `file:` link to the local SDK for development. For publishing, change to `"^1.0.0"`.

- [ ] **Step 5: Update `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src"],
  "exclude": ["src/__tests__"]
}
```

- [ ] **Step 6: Update `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
})
```

- [ ] **Step 7: Install dependencies**

```bash
npm install
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: reset repo for redesign plugin architecture"
```

---

### Task 3: Copy and Rewrite Slack Plugin Source Files

> **REPO: `slack-plugin`** (`/Users/hieu/Documents/Companies/Lab3/opensource/openacp-group/slack-plugin`)
> **BRANCH: `feat/redesign-plugin-architecture`** (same as Task 2)
> **SOURCE: `OpenACP/src/plugins/slack/`** (on `redesign/microkernel-plugin-architecture` branch)

**Files:**
- Create: `slack-plugin/src/index.ts`
- Create: `slack-plugin/src/adapter.ts`
- Create: `slack-plugin/src/event-router.ts`
- Create: `slack-plugin/src/channel-manager.ts`
- Create: `slack-plugin/src/formatter.ts`
- Create: `slack-plugin/src/renderer.ts`
- Create: `slack-plugin/src/text-buffer.ts`
- Create: `slack-plugin/src/send-queue.ts`
- Create: `slack-plugin/src/permission-handler.ts`
- Create: `slack-plugin/src/slug.ts`
- Create: `slack-plugin/src/types.ts`
- Create: `slack-plugin/src/utils.ts`

**Source:** Copy from `OpenACP/src/plugins/slack/` on `redesign/microkernel-plugin-architecture` branch.

**Import rewrite rules (apply to ALL files):**

| Old import path | New import | Notes |
|---|---|---|
| `from '../../core/plugin/types.js'` | `from '@openacp/plugin-sdk'` | All plugin types |
| `from '../../core/types.js'` | `from '@openacp/plugin-sdk'` | OutgoingMessage, PermissionRequest, etc. |
| `from '../../core/channel.js'` | `from '@openacp/plugin-sdk'` | AdapterCapabilities |
| `from '../../core/adapter-primitives/messaging-adapter.js'` | `from '@openacp/plugin-sdk'` | MessagingAdapter, MessagingAdapterConfig |
| `from '../../core/adapter-primitives/format-types.js'` | `from '@openacp/plugin-sdk'` | DisplayVerbosity |
| `from '../../core/adapter-primitives/rendering/renderer.js'` | `from '@openacp/plugin-sdk'` | BaseRenderer, IRenderer, etc. |
| `from '../../core/core.js'` | Remove — use `ctx.kernel` | OpenACPCore |
| `from '../../core/utils/log.js'` | Remove — use `ctx.log` | createChildLogger |
| `from '../../core/config/config.js'` | Remove — define locally | SlackChannelConfig |

- [ ] **Step 1: Copy all source files from redesign branch**

```bash
cd /Users/hieu/Documents/Companies/Lab3/opensource/openacp-group

# Copy source files (not tests)
for file in index.ts adapter.ts event-router.ts channel-manager.ts formatter.ts renderer.ts text-buffer.ts send-queue.ts permission-handler.ts slug.ts types.ts utils.ts; do
  cp OpenACP/src/plugins/slack/$file slack-plugin/src/$file
done
```

Note: The OpenACP repo must be on the `redesign/microkernel-plugin-architecture` branch (or `feat/extract-slack-plugin` which was branched from it).

- [ ] **Step 2: Rewrite `types.ts`**

This file currently re-exports `SlackChannelConfig` from `../../core/config/config.js`. Instead, define the Zod schema locally. Read the current content of `OpenACP/src/core/config/config.ts` to find the `SlackChannelConfig` schema, then write it directly in `types.ts`:

```typescript
import { z } from 'zod'

export const SlackChannelConfigSchema = z.object({
  enabled: z.boolean().default(true),
  botToken: z.string(),
  appToken: z.string(),
  signingSecret: z.string().optional(),
  channelPrefix: z.string().default('openacp'),
  notificationChannelId: z.string().optional(),
  allowedUserIds: z.array(z.string()).default([]),
  autoCreateSession: z.boolean().default(true),
  startupChannelId: z.string().optional(),
})

export type SlackChannelConfig = z.infer<typeof SlackChannelConfigSchema>

export interface SlackSessionMeta {
  channelId: string
  channelSlug: string
}

export interface SlackFileInfo {
  id: string
  name: string
  mimetype: string
  size: number
  url_private: string
}
```

Verify: Check `OpenACP/src/core/config/config.ts` for the exact `SlackChannelConfig` schema fields. The fields above are from the research but must match exactly.

- [ ] **Step 3: Rewrite imports in `index.ts`**

Change:
```typescript
import type { OpenACPPlugin, InstallContext } from '../../core/plugin/types.js'
import type { OpenACPCore } from '../../core/core.js'
```
To:
```typescript
import type { OpenACPPlugin, InstallContext, PluginContext } from '@openacp/plugin-sdk'
```

Remove any direct reference to `OpenACPCore`. In the `setup()` hook, access core via `ctx.kernel` instead of importing `OpenACPCore` type. The adapter constructor that takes `core` should receive it from `ctx.kernel`.

Also update `essential: true` to `essential: false` (external plugins should not be marked essential).

Remove `pluginDependencies` on `@openacp/security` and `@openacp/notifications` if they are only needed at runtime via `ctx.getService()` — external plugins should use optional lookups rather than hard dependencies on built-in plugins.

- [ ] **Step 4: Rewrite imports in `adapter.ts`**

Change all `../../core/...` imports to `@openacp/plugin-sdk`:

```typescript
import type { OutgoingMessage, PermissionRequest, NotificationMessage, Attachment } from '@openacp/plugin-sdk'
import type { AdapterCapabilities } from '@openacp/plugin-sdk'
import type { FileServiceInterface } from '@openacp/plugin-sdk'
import { MessagingAdapter, type MessagingAdapterConfig } from '@openacp/plugin-sdk'
import type { DisplayVerbosity } from '@openacp/plugin-sdk'
import type { IRenderer } from '@openacp/plugin-sdk'
```

Consolidate into a single import:
```typescript
import {
  MessagingAdapter,
  type MessagingAdapterConfig,
  type OutgoingMessage,
  type PermissionRequest,
  type NotificationMessage,
  type Attachment,
  type AdapterCapabilities,
  type FileServiceInterface,
  type DisplayVerbosity,
  type IRenderer,
} from '@openacp/plugin-sdk'
```

Remove `import { createChildLogger } from '../../core/utils/log.js'`. The adapter receives a logger from the plugin context. Update the constructor to accept a logger parameter, or use a module-level logger approach. The `index.ts` setup() hook should pass `ctx.log` to the adapter constructor.

Remove `import type { OpenACPCore } from '../../core/core.js'`. The adapter constructor currently takes `OpenACPCore` — change the type to `any` or create a minimal interface for what the adapter actually uses from core (typically `handleNewSession`, `handleIncomingMessage`, `findSession`, `handlePermissionResponse`).

- [ ] **Step 5: Rewrite imports in `renderer.ts`**

Change:
```typescript
import { BaseRenderer, type RenderedMessage, type RenderedPermission } from '../../core/adapter-primitives/rendering/renderer.js'
import type { OutgoingMessage, PermissionRequest, NotificationMessage } from '../../core/types.js'
import type { DisplayVerbosity } from '../../core/adapter-primitives/format-types.js'
```
To:
```typescript
import {
  BaseRenderer,
  type RenderedMessage,
  type RenderedPermission,
  type OutgoingMessage,
  type PermissionRequest,
  type NotificationMessage,
  type DisplayVerbosity,
} from '@openacp/plugin-sdk'
```

- [ ] **Step 6: Rewrite imports in `formatter.ts`**

Change:
```typescript
import type { OutgoingMessage, PermissionRequest } from '../../core/types.js'
```
To:
```typescript
import type { OutgoingMessage, PermissionRequest } from '@openacp/plugin-sdk'
```

- [ ] **Step 7: Rewrite imports in `event-router.ts`**

Remove `import { createChildLogger } from '../../core/utils/log.js'`. The event router should accept a logger via constructor parameter instead.

- [ ] **Step 8: Rewrite imports in `text-buffer.ts`**

Remove `import { createChildLogger } from '../../core/utils/log.js'`. Accept logger via constructor parameter.

- [ ] **Step 9: Verify no remaining core imports**

```bash
cd /Users/hieu/Documents/Companies/Lab3/opensource/openacp-group/slack-plugin
grep -rn "from '../../core" src/ --include="*.ts" | grep -v __tests__
```

Expected: No matches.

- [ ] **Step 10: Build**

```bash
npm run build
```

Expected: Build succeeds. If there are type errors, fix them by checking what the SDK actually exports and adjusting imports.

- [ ] **Step 11: Commit**

```bash
git add src/
git commit -m "feat: add Slack plugin source with @openacp/plugin-sdk imports"
```

---

### Task 4: Copy and Rewrite Slack Plugin Tests

> **REPO: `slack-plugin`** (`/Users/hieu/Documents/Companies/Lab3/opensource/openacp-group/slack-plugin`)
> **BRANCH: `feat/redesign-plugin-architecture`** (same as Task 2)
> **SOURCE: `OpenACP/src/plugins/slack/__tests__/`** (on `redesign/microkernel-plugin-architecture` branch)

**Files:**
- Create: `slack-plugin/src/__tests__/adapter-lifecycle.test.ts`
- Create: `slack-plugin/src/__tests__/channel-manager.test.ts`
- Create: `slack-plugin/src/__tests__/conformance.test.ts`
- Create: `slack-plugin/src/__tests__/event-router.test.ts`
- Create: `slack-plugin/src/__tests__/formatter.test.ts`
- Create: `slack-plugin/src/__tests__/permission-handler.test.ts`
- Create: `slack-plugin/src/__tests__/send-queue.test.ts`
- Create: `slack-plugin/src/__tests__/slack-voice.test.ts`
- Create: `slack-plugin/src/__tests__/slug.test.ts`
- Create: `slack-plugin/src/__tests__/text-buffer.test.ts`

- [ ] **Step 1: Copy all test files**

```bash
cd /Users/hieu/Documents/Companies/Lab3/opensource/openacp-group
cp OpenACP/src/plugins/slack/__tests__/*.test.ts slack-plugin/src/__tests__/
```

- [ ] **Step 2: Rewrite test imports**

In each test file, change any `../../core/...` imports to `@openacp/plugin-sdk` or `@openacp/plugin-sdk/testing`:

```bash
cd slack-plugin
# Find all core imports in test files
grep -rn "from '.*core" src/__tests__/ --include="*.ts"
```

For each match, apply the same import rewrite rules as Task 3. Additionally:
- `createTestContext` → `from '@openacp/plugin-sdk/testing'`
- `createTestInstallContext` → `from '@openacp/plugin-sdk/testing'`
- `mockServices` → `from '@openacp/plugin-sdk/testing'`

Change relative imports to source modules (e.g., `from '../../plugins/slack/adapter.js'`) to local relative paths (e.g., `from '../adapter.js'`).

- [ ] **Step 3: Update conformance test**

The `conformance.test.ts` imports `runAdapterConformanceTests` from core. Check if this is exported by the SDK. If not, either:
- Add it to SDK exports, or
- Skip this test for now and note it as a follow-up

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: All tests pass. Fix any import errors or type mismatches.

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/
git commit -m "test: add Slack plugin tests with SDK imports"
```

---

### Task 5: Remove Slack Built-in Plugin from OpenACP

> **REPO: `OpenACP`** (`/Users/hieu/Documents/Companies/Lab3/opensource/openacp-group/OpenACP`)
> **BRANCH: `feat/extract-slack-plugin`** (same as Task 1)

**Files:**
- Delete: `OpenACP/src/plugins/slack/` (entire directory)
- Modify: `OpenACP/src/plugins/index.ts`
- Modify: `OpenACP/src/plugins/core-plugins.ts`
- Modify: `OpenACP/package.json` (remove Slack deps if unused elsewhere)

- [ ] **Step 1: Delete Slack plugin directory**

```bash
cd /Users/hieu/Documents/Companies/Lab3/opensource/openacp-group/OpenACP
rm -rf src/plugins/slack/
```

- [ ] **Step 2: Update `src/plugins/index.ts`**

Remove the Slack import and entry from the `builtInPlugins` array. The file imports all 10 plugins — remove the Slack one so only 9 remain.

Remove:
```typescript
import { createSlackPlugin } from './slack/index.js'
```
And remove the `createSlackPlugin()` entry from the `builtInPlugins` array.

- [ ] **Step 3: Update `src/plugins/core-plugins.ts`**

Same change — remove Slack from the `corePlugins` array.

- [ ] **Step 4: Check if Slack dependencies are used elsewhere**

```bash
grep -rn "@slack/bolt\|@slack/web-api" src/ --include="*.ts" | grep -v plugins/slack
```

If no results: remove `@slack/bolt` and `@slack/web-api` from `package.json` dependencies.

```bash
pnpm remove @slack/bolt @slack/web-api
```

If other files still use them: leave them.

- [ ] **Step 5: Build and test**

```bash
pnpm build
pnpm test
```

Expected: Build succeeds, all tests pass (no tests should reference Slack since the tests were in `src/plugins/slack/__tests__/` which was deleted).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: remove Slack built-in plugin (extracted to @openacp/adapter-slack)"
```

---

### Task 6: Add Registry Discovery to Setup Wizard

> **REPO: `OpenACP`** (`/Users/hieu/Documents/Companies/Lab3/opensource/openacp-group/OpenACP`)
> **BRANCH: `feat/extract-slack-plugin`** (same as Task 1)

**Files:**
- Modify: `OpenACP/src/core/setup/wizard.ts`
- Modify: `OpenACP/src/core/setup/setup-channels.ts`
- Modify: `OpenACP/src/core/setup/types.ts`

- [ ] **Step 1: Update `src/core/setup/types.ts`**

The `ChannelId` type is currently `"telegram" | "discord"`. For community plugins, we need a dynamic approach. Add a type for community channel options:

```typescript
export interface CommunityAdapterOption {
  name: string           // npm package name, e.g. "@openacp/adapter-slack"
  displayName: string    // e.g. "Slack Adapter"
  icon: string           // e.g. "💬"
  verified: boolean
}
```

- [ ] **Step 2: Update `wizard.ts` — fetch community adapters**

Add a helper function that queries the registry for verified adapter plugins:

```typescript
import { RegistryClient } from '../plugin/registry-client.js'

async function fetchCommunityAdapters(): Promise<CommunityAdapterOption[]> {
  try {
    const client = new RegistryClient()
    const registry = await client.getRegistry()
    return registry.plugins
      .filter(p => p.category === 'adapter' && p.verified)
      .map(p => ({
        name: p.npm,
        displayName: p.displayName ?? p.name,
        icon: p.icon,
        verified: p.verified,
      }))
  } catch {
    // Offline or registry unavailable — graceful fallback
    return []
  }
}
```

- [ ] **Step 3: Update `wizard.ts` — merge community adapters into channel selection**

In `runSetup()`, replace the hardcoded `clack.select` options with dynamic options that include community adapters:

```typescript
const communityAdapters = await fetchCommunityAdapters()

const builtInOptions = [
  { label: 'Telegram', value: 'telegram' },
  { label: 'Discord', value: 'discord' },
  { label: 'Both (Telegram + Discord)', value: 'both' },
]

const communityOptions = communityAdapters.map(a => ({
  label: `${a.icon} ${a.displayName}${a.verified ? ' (verified)' : ''}`,
  value: `community:${a.name}`,  // prefix to distinguish from built-in
}))

const channelChoice = guardCancel(
  await clack.select({
    message: 'Which messaging platform do you want to use?',
    options: [
      ...builtInOptions,
      ...(communityOptions.length > 0
        ? [{ label: '── Community Adapters ──', value: '__separator__', disabled: true }, ...communityOptions]
        : []),
    ],
  }),
) as string
```

- [ ] **Step 4: Update `wizard.ts` — handle community adapter selection**

Add handling for `community:` prefixed selections:

```typescript
if (typeof channelChoice === 'string' && channelChoice.startsWith('community:')) {
  const npmPackage = channelChoice.replace('community:', '')
  currentStep++

  if (settingsManager && pluginRegistry) {
    // Auto-install the plugin from npm
    clack.spinner()
    const s = clack.spinner()
    s.start(`Installing ${npmPackage}...`)

    try {
      const { exec } = await import('node:child_process')
      const { promisify } = await import('node:util')
      const execAsync = promisify(exec)
      const pluginsDir = path.join(os.homedir(), '.openacp', 'plugins')
      await execAsync(`npm install ${npmPackage}`, { cwd: pluginsDir })
      s.stop(ok(`${npmPackage} installed`))
    } catch (err) {
      s.stop(fail(`Failed to install ${npmPackage}: ${(err as Error).message}`))
      return false
    }

    // Load and run the plugin's install() hook
    const pluginModule = await import(npmPackage)
    const plugin = pluginModule.default
    if (plugin?.install) {
      const { createInstallContext } = await import('../plugin/install-context.js')
      const ctx = createInstallContext({
        pluginName: plugin.name,
        settingsManager,
        basePath: settingsManager.getBasePath(),
      })
      await plugin.install(ctx)
      pluginRegistry.register(plugin.name, {
        version: plugin.version,
        source: 'npm',
        enabled: true,
        settingsPath: settingsManager.getSettingsPath(plugin.name),
        description: plugin.description,
      })
    }
  }
}
```

Note: The npm install approach should match how `openacp plugin install` works in `src/cli.ts`. Check the existing install command implementation and reuse the same logic.

- [ ] **Step 5: Update `setup-channels.ts` — show installed community adapters**

In `configureChannels()`, add installed community plugins to the channel list. After the built-in channels, query `PluginRegistry` for installed npm plugins with `adapter` in the name:

Update `configureViaPlugin()` to handle community plugins by dynamically importing them from `node_modules`:

```typescript
async function configureViaPlugin(channelId: string): Promise<void> {
  // Built-in plugins
  const pluginMap: Record<string, { importPath: string; name: string }> = {
    telegram: { importPath: '../../plugins/telegram/index.js', name: '@openacp/telegram' },
    discord: { importPath: '../../plugins/discord/index.js', name: '@openacp/discord' },
  }

  const pluginInfo = pluginMap[channelId]

  let plugin: any
  if (pluginInfo) {
    const pluginModule = await import(pluginInfo.importPath)
    plugin = pluginModule.default
  } else {
    // Community plugin — channelId is the npm package name
    try {
      const pluginModule = await import(channelId)
      plugin = pluginModule.default
    } catch {
      return
    }
  }

  if (plugin?.configure) {
    const { SettingsManager } = await import('../plugin/settings-manager.js')
    const { createInstallContext } = await import('../plugin/install-context.js')
    const basePath = path.join(os.homedir(), '.openacp', 'plugins')
    const settingsManager = new SettingsManager(basePath)
    const ctx = createInstallContext({
      pluginName: plugin.name,
      settingsManager,
      basePath,
    })
    await plugin.configure(ctx)
  }
}
```

- [ ] **Step 6: Build and test**

```bash
pnpm build
pnpm test
```

Expected: Build succeeds, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/core/setup/
git commit -m "feat(wizard): discover community adapter plugins from registry"
```

---

### Task 7: Update Plugin Registry Manifest

> **REPO: `plugin-registry`** (`/Users/hieu/Documents/Companies/Lab3/opensource/openacp-group/plugin-registry`)
> **BRANCH: `feat/update-slack-manifest-redesign`** (created from `main`)

**Files:**
- Modify: `plugin-registry/plugins/openacp--adapter-slack.json`

- [ ] **Step 1: Create new branch**

```bash
cd /Users/hieu/Documents/Companies/Lab3/opensource/openacp-group/plugin-registry
git checkout main
git checkout -b feat/update-slack-manifest-redesign
```

- [ ] **Step 2: Update manifest**

Edit `plugins/openacp--adapter-slack.json`:

```json
{
  "name": "adapter-slack",
  "displayName": "Slack Adapter",
  "description": "Slack messaging platform adapter for OpenACP",
  "npm": "@openacp/adapter-slack",
  "repository": "https://github.com/Open-ACP/slack-adapter",
  "author": {
    "name": "OpenACP",
    "github": "Open-ACP"
  },
  "version": "0.1.0",
  "minCliVersion": "2026.0327.1",
  "category": "adapter",
  "tags": ["slack", "messaging", "adapter"],
  "icon": "💬",
  "license": "MIT",
  "verified": true,
  "createdAt": "2026-03-27T00:00:00Z"
}
```

Changes from old manifest:
- `repository` → updated to correct URL
- `minCliVersion` → updated to `2026.0327.1` (redesign branch version)

- [ ] **Step 3: Rebuild registry**

```bash
npm run build
```

This regenerates `registry.json` from the manifests.

- [ ] **Step 4: Commit**

```bash
git add plugins/openacp--adapter-slack.json registry.json
git commit -m "feat: update Slack adapter manifest for redesign architecture"
```

---

### Task 8: Final Verification

> **ALL REPOS** — cross-repo verification

- [ ] **Step 1: Verify OpenACP builds and tests pass**

```bash
cd /Users/hieu/Documents/Companies/Lab3/opensource/openacp-group/OpenACP
pnpm build
pnpm test
```

Expected: All pass. No references to Slack in core.

- [ ] **Step 2: Verify slack-plugin builds and tests pass**

```bash
cd /Users/hieu/Documents/Companies/Lab3/opensource/openacp-group/slack-plugin
npm run build
npm test
```

Expected: All 10 test files pass.

- [ ] **Step 3: Verify no remaining core imports in slack-plugin**

```bash
grep -rn "from '.*core\|from '.*plugin/types\|from '.*config/config" slack-plugin/src/ --include="*.ts"
```

Expected: No matches.

- [ ] **Step 4: Verify SDK exports are complete**

```bash
cd /Users/hieu/Documents/Companies/Lab3/opensource/openacp-group/OpenACP
grep -c "DisplayVerbosity\|AdapterCapabilities\|Attachment\|MessagingAdapterConfig\|IRenderer\|RenderedMessage\|RenderedPermission" src/packages/plugin-sdk/src/index.ts
```

Expected: At least 7 matches (one per type).

- [ ] **Step 5: Create PRs**

Create PRs for each repo:

1. **OpenACP**: `feat/extract-slack-plugin` → `redesign/microkernel-plugin-architecture`
2. **slack-plugin**: `feat/redesign-plugin-architecture` → `main`
3. **plugin-registry**: `feat/update-slack-manifest-redesign` → `main`

PR descriptions should reference each other as related PRs.
