# Onboard Reconfigure — Refactor Setup into Modular, Section-Based System

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the monolithic `setup.ts` (883 LOC) into a modular, section-based onboarding system that supports both first-run setup AND reconfiguration of existing config — modeled after OpenClaw's configure wizard pattern.

**Architecture:** Split `setup.ts` into focused modules under `src/core/setup/`. First-run flow stays unchanged. When config exists, show a section-based menu (Channels, Agents, Workspace, Run mode, Integrations) where each section displays current status and offers Modify/Disable/Delete/Skip actions. Config is saved after each section change.

**Tech Stack:** TypeScript, @clack/prompts, Zod (existing config schema)

---

## File Structure

### New files to create

| File | Responsibility | ~LOC |
|------|---------------|------|
| `src/core/setup/index.ts` | Re-exports `runSetup`, `runReconfigure`, `printStartBanner`, validation fns | ~20 |
| `src/core/setup/types.ts` | `OnboardSection`, `ConfiguredChannelAction`, color helpers, shared types | ~50 |
| `src/core/setup/helpers.ts` | `guardCancel()`, `summarizeConfig()`, ANSI colors, banner | ~80 |
| `src/core/setup/validation.ts` | `validateBotToken`, `validateChatId`, `validateBotAdmin`, `validateDiscordToken` | ~120 |
| `src/core/setup/setup-channels.ts` | Channel orchestrator: status display, channel selection loop, configured actions | ~150 |
| `src/core/setup/setup-telegram.ts` | `setupTelegram()` with optional existing config pre-fill + `detectChatId()` | ~200 |
| `src/core/setup/setup-discord.ts` | `setupDiscord()` with optional existing config pre-fill | ~80 |
| `src/core/setup/setup-agents.ts` | `setupAgents()` + `detectAgents()` + `validateAgentCommand()` | ~120 |
| `src/core/setup/setup-workspace.ts` | `setupWorkspace()` with pre-fill | ~30 |
| `src/core/setup/setup-run-mode.ts` | `setupRunMode()` with pre-fill | ~50 |
| `src/core/setup/setup-integrations.ts` | `setupIntegrations()` — Claude CLI session transfer | ~40 |
| `src/core/setup/wizard.ts` | `runSetup()` (first-run) + `runReconfigure()` (existing config) | ~200 |

### Files to modify

| File | Change |
|------|--------|
| `src/core/setup.ts` | **DELETE** — replaced by `src/core/setup/` directory |
| `src/cli/commands.ts` | Update imports: `'../core/setup.js'` → `'../core/setup/index.js'`; `cmdOnboard` calls `runReconfigure` when config exists |
| `src/main.ts` | Update imports: `'./core/setup.js'` → `'./core/setup/index.js'` |
| `src/core/config-editor.ts` | Update imports: `'./setup.js'` → `'./setup/index.js'` |
| `src/__tests__/setup.test.ts` | Update imports to `'../core/setup/index.js'` |
| `src/__tests__/setup-integration.test.ts` | Update imports + add reconfigure integration test |

### Files unchanged
- `src/core/config.ts` — no changes needed
- `src/adapters/discord/types.ts` — no changes needed

---

## Chunk 1: Extract modules from monolithic setup.ts

### Task 0: Create the setup directory

- [ ] **Step 1: Create directory**

```bash
mkdir -p src/core/setup
```

---

### Task 1: Create `src/core/setup/types.ts` — Shared types and constants

**Files:**
- Create: `src/core/setup/types.ts`

- [ ] **Step 1: Write the types file**

```typescript
// src/core/setup/types.ts
import type { Config } from "../config.js";

export type OnboardSection =
  | "channels"
  | "agents"
  | "workspace"
  | "runMode"
  | "integrations";

export type ConfiguredChannelAction = "modify" | "disable" | "delete" | "skip";

export type ChannelId = "telegram" | "discord";

export type ChannelStatus = {
  id: ChannelId;
  label: string;
  configured: boolean;
  enabled: boolean;
  hint?: string; // e.g. "Bot: @my_bot"
};

export const ONBOARD_SECTION_OPTIONS: Array<{
  value: OnboardSection;
  label: string;
  hint: string;
}> = [
  { value: "channels", label: "Channels", hint: "Link/update messaging platforms" },
  { value: "agents", label: "Agents", hint: "Install agents, change default" },
  { value: "workspace", label: "Workspace", hint: "Set workspace directory" },
  { value: "runMode", label: "Run mode", hint: "Foreground/daemon, auto-start" },
  { value: "integrations", label: "Integrations", hint: "Claude CLI session transfer" },
];

export const CHANNEL_META: Record<ChannelId, { label: string; method: string }> = {
  telegram: { label: "Telegram", method: "Bot API" },
  discord: { label: "Discord", method: "Bot API" },
};
```

- [ ] **Step 2: Commit**

```bash
git add src/core/setup/types.ts
git commit -m "refactor(setup): add shared types for modular onboard system"
```

---

### Task 2: Create `src/core/setup/helpers.ts` — Colors, banner, guardCancel, summarizeConfig

**Files:**
- Create: `src/core/setup/helpers.ts`

- [ ] **Step 1: Write the helpers file**

Extract from `setup.ts` lines 8-36 (colors/formatting), lines 692-728 (banner), and add `summarizeConfig()`:

```typescript
// src/core/setup/helpers.ts
import * as clack from "@clack/prompts";
import type { Config } from "../config.js";
// Note: CHANNEL_META is only used in setup-channels.ts, not here.
// summarizeConfig uses inline channel names for simplicity.

// --- ANSI colors ---
export const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
};

export const ok = (msg: string) =>
  `${c.green}${c.bold}✓${c.reset} ${c.green}${msg}${c.reset}`;
export const warn = (msg: string) => `${c.yellow}⚠ ${msg}${c.reset}`;
export const fail = (msg: string) => `${c.red}✗ ${msg}${c.reset}`;
export const step = (n: number, total: number, title: string) =>
  `\n${c.cyan}${c.bold}[${n}/${total}]${c.reset} ${c.bold}${title}${c.reset}\n`;
export const dim = (msg: string) => `${c.dim}${msg}${c.reset}`;

export function guardCancel<T>(value: T | symbol): T {
  if (clack.isCancel(value)) {
    clack.cancel("Setup cancelled.");
    process.exit(0);
  }
  return value as T;
}

// --- Banner ---

function applyGradient(text: string): string {
  const colors = [135, 99, 63, 33, 39, 44, 44];
  const lines = text.split("\n");
  return lines
    .map((line, i) => {
      const colorIdx = Math.min(i, colors.length - 1);
      return `\x1b[38;5;${colors[colorIdx]}m${line}\x1b[0m`;
    })
    .join("\n");
}

const BANNER = `
   ██████╗ ██████╗ ███████╗███╗   ██╗ █████╗  ██████╗██████╗
  ██╔═══██╗██╔══██╗██╔════╝████╗  ██║██╔══██╗██╔════╝██╔══██╗
  ██║   ██║██████╔╝█████╗  ██╔██╗ ██║███████║██║     ██████╔╝
  ██║   ██║██╔═══╝ ██╔══╝  ██║╚██╗██║██╔══██║██║     ██╔═══╝
  ╚██████╔╝██║     ███████╗██║ ╚████║██║  ██║╚██████╗██║
   ╚═════╝ ╚═╝     ╚══════╝╚═╝  ╚═══╝╚═╝  ╚═╝ ╚═════╝╚═╝
`;

export async function printStartBanner(): Promise<void> {
  let version = "0.0.0";
  try {
    const { getCurrentVersion } = await import("../../cli/version.js");
    version = getCurrentVersion();
  } catch {
    // ignore
  }
  console.log(applyGradient(BANNER));
  console.log(`${c.dim}              AI coding agents, anywhere.  v${version}${c.reset}\n`);
}

// --- Config summary ---

export function summarizeConfig(config: Config): string {
  const lines: string[] = [];

  // Channels
  const channelStatuses: string[] = [];
  for (const [id, meta] of Object.entries({
    telegram: "Telegram",
    discord: "Discord",
  })) {
    const ch = config.channels[id] as { enabled?: boolean } | undefined;
    if (ch?.enabled) {
      channelStatuses.push(`${meta} (enabled)`);
    } else if (ch && Object.keys(ch).length > 1) {
      channelStatuses.push(`${meta} (disabled)`);
    } else {
      channelStatuses.push(`${meta} (not configured)`);
    }
  }
  lines.push(`Channels: ${channelStatuses.join(", ")}`);

  // Default agent
  lines.push(`Default agent: ${config.defaultAgent}`);

  // Workspace
  lines.push(`Workspace: ${config.workspace.baseDir}`);

  // Run mode
  lines.push(`Run mode: ${config.runMode}${config.autoStart ? " (auto-start)" : ""}`);

  return lines.join("\n");
}
```

- [ ] **Step 2: Commit**

```bash
git add src/core/setup/helpers.ts
git commit -m "refactor(setup): extract helpers — colors, banner, guardCancel, summarizeConfig"
```

---

### Task 3: Create `src/core/setup/validation.ts` — All API validation functions

**Files:**
- Create: `src/core/setup/validation.ts`

- [ ] **Step 1: Write the validation file**

Move `validateBotToken`, `validateChatId`, `validateBotAdmin`, `validateDiscordToken` from `setup.ts` (lines 39-99, 101-147, 426-445). These are pure functions with no interactive prompts — clean extraction.

```typescript
// src/core/setup/validation.ts
// Move these functions exactly as-is from setup.ts:
// - validateBotToken (lines 39-63)
// - validateChatId (lines 65-99)
// - validateBotAdmin (lines 101-147)
// - validateDiscordToken (lines 426-445)
// No changes to signatures or behavior.
```

- [ ] **Step 2: Commit**

```bash
git add src/core/setup/validation.ts
git commit -m "refactor(setup): extract validation functions to dedicated module"
```

---

### Task 4: Create `src/core/setup/setup-telegram.ts` — Telegram channel setup

**Files:**
- Create: `src/core/setup/setup-telegram.ts`

- [ ] **Step 1: Write the telegram setup file**

Move from `setup.ts`:
- `promptManualChatId()` (lines 151-163)
- `detectChatId()` (lines 165-296)
- `setupTelegram()` (lines 338-422)

Modify `setupTelegram` to accept optional existing config for pre-fill:

```typescript
// src/core/setup/setup-telegram.ts
import * as clack from "@clack/prompts";
import type { Config } from "../config.js";
import { guardCancel, ok, fail, dim, c, step } from "./helpers.js";
import { validateBotToken, validateChatId, validateBotAdmin } from "./validation.js";

// promptManualChatId() — exact copy from setup.ts
// detectChatId() — exact copy from setup.ts

export async function setupTelegram(opts?: {
  existing?: Config["channels"][string];
  stepNum?: number;
  totalSteps?: number;
}): Promise<Config["channels"][string]> {
  const { existing, stepNum, totalSteps } = opts ?? {};
  if (stepNum != null && totalSteps != null) {
    console.log(step(stepNum, totalSteps, "Telegram Bot"));
  }

  let botToken = "";
  const existingToken = (existing as { botToken?: string } | undefined)?.botToken;

  while (true) {
    botToken = guardCancel(
      await clack.text({
        message: "Bot token (from @BotFather):",
        ...(existingToken ? { initialValue: existingToken } : {}),
        validate: (val) =>
          (val ?? "").toString().trim().length > 0 ? undefined : "Token cannot be empty",
      }),
    ) as string;
    botToken = botToken.trim();

    const s = clack.spinner();
    s.start("Validating token...");
    const result = await validateBotToken(botToken);
    s.stop("Token validated");

    if (result.ok) {
      console.log(ok(`Connected to @${result.botUsername}`));
      break;
    }
    console.log(fail(result.error));
    const action = guardCancel(
      await clack.select({
        message: "What to do?",
        options: [
          { label: "Re-enter token", value: "retry" },
          { label: "Use as-is (skip validation)", value: "skip" },
        ],
      }),
    );
    if (action === "skip") break;
  }

  let chatId: number;
  const existingChatId = (existing as { chatId?: number } | undefined)?.chatId;

  // If existing chatId, offer to keep it
  if (existingChatId && existingChatId !== 0) {
    const keepChat = guardCancel(
      await clack.confirm({
        message: `Keep current chat ID (${existingChatId})?`,
        initialValue: true,
      }),
    );
    if (keepChat) {
      chatId = existingChatId;
    } else {
      chatId = await detectAndValidateChatId(botToken);
    }
  } else {
    chatId = await detectAndValidateChatId(botToken);
  }

  return {
    enabled: true,
    botToken,
    chatId,
    notificationTopicId: (existing as any)?.notificationTopicId ?? null,
    assistantTopicId: (existing as any)?.assistantTopicId ?? null,
  };
}

// Helper: detect + validate loop (extracted from current setupTelegram)
async function detectAndValidateChatId(botToken: string): Promise<number> {
  while (true) {
    const chatId = await detectChatId(botToken);
    const chatResult = await validateChatId(botToken, chatId);
    if (!chatResult.ok) {
      console.log(fail(chatResult.error));
      console.log("");
      console.log(`  ${c.bold}How to fix:${c.reset}`);
      console.log(dim("  1. Make sure the bot is added to the group"));
      console.log(dim("  2. The group must be a Supergroup (Group Settings → convert)"));
      console.log(dim("  3. Send a message in the group after adding the bot"));
      console.log("");
      guardCancel(await clack.text({ message: "Press Enter to try again..." }));
      continue;
    }
    console.log(
      ok(`Group: ${c.bold}${chatResult.title}${c.reset}${c.green}${chatResult.isForum ? " (Topics enabled)" : ""}`),
    );
    const adminResult = await validateBotAdmin(botToken, chatId);
    if (!adminResult.ok) {
      console.log(fail(adminResult.error));
      console.log("");
      console.log(`  ${c.bold}How to fix:${c.reset}`);
      console.log(dim("  1. Open the group in Telegram"));
      console.log(dim("  2. Go to Group Settings → Administrators"));
      console.log(dim("  3. Add the bot as an administrator"));
      console.log("");
      guardCancel(await clack.text({ message: "Press Enter to check again..." }));
      continue;
    }
    console.log(ok("Bot has admin privileges"));
    return chatId;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/core/setup/setup-telegram.ts
git commit -m "refactor(setup): extract Telegram setup with pre-fill support"
```

---

### Task 5: Create `src/core/setup/setup-discord.ts` — Discord channel setup

**Files:**
- Create: `src/core/setup/setup-discord.ts`

- [ ] **Step 1: Write the discord setup file**

Move `setupDiscord()` from `setup.ts` (lines 447-514). Add optional existing config for pre-fill:

```typescript
// src/core/setup/setup-discord.ts
import * as clack from "@clack/prompts";
import type { DiscordChannelConfig } from "../../adapters/discord/types.js";
import { guardCancel, ok, fail, dim, c } from "./helpers.js";
import { validateDiscordToken } from "./validation.js";

export async function setupDiscord(opts?: {
  existing?: DiscordChannelConfig;
}): Promise<DiscordChannelConfig> {
  const { existing } = opts ?? {};

  console.log('\n📱 Discord Setup\n');
  // ... same setup instructions ...

  let botToken = "";
  const existingToken = existing?.botToken;

  while (true) {
    botToken = guardCancel(
      await clack.text({
        message: "Bot token (from Discord Developer Portal):",
        ...(existingToken ? { initialValue: existingToken } : {}),
        validate: (val) =>
          (val ?? "").toString().trim().length > 0 ? undefined : "Token cannot be empty",
      }),
    ) as string;
    botToken = botToken.trim();

    // ... same validation loop ...
  }

  const guildId = guardCancel(
    await clack.text({
      message: "Guild (server) ID:",
      ...(existing?.guildId ? { initialValue: existing.guildId } : {}),
      validate: (val) => {
        const trimmed = (val ?? "").toString().trim();
        if (!trimmed) return "Guild ID cannot be empty";
        if (!/^\d{17,20}$/.test(trimmed)) return "Guild ID must be a numeric Discord snowflake (17-20 digits)";
        return undefined;
      },
    }),
  ) as string;

  return {
    enabled: true,
    botToken,
    guildId: guildId.trim(),
    forumChannelId: existing?.forumChannelId ?? null,
    notificationChannelId: existing?.notificationChannelId ?? null,
    assistantThreadId: existing?.assistantThreadId ?? null,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/core/setup/setup-discord.ts
git commit -m "refactor(setup): extract Discord setup with pre-fill support"
```

---

### Task 6: Create remaining setup modules

**Files:**
- Create: `src/core/setup/setup-agents.ts`
- Create: `src/core/setup/setup-workspace.ts`
- Create: `src/core/setup/setup-run-mode.ts`
- Create: `src/core/setup/setup-integrations.ts`

- [ ] **Step 1: Write `setup-agents.ts`**

Move from `setup.ts`:
- `KNOWN_AGENTS` (lines 300-305)
- `detectAgents()` (lines 307-325)
- `validateAgentCommand()` (lines 327-334)
- `setupAgents()` (lines 516-631)

No changes needed — `setupAgents` already reads from catalog and doesn't need pre-fill since it's catalog-based.

- [ ] **Step 2: Write `setup-workspace.ts`**

Move `setupWorkspace()` (lines 633-645). Add pre-fill:

```typescript
export async function setupWorkspace(opts?: {
  existing?: string;
  stepNum?: number;
  totalSteps?: number;
}): Promise<{ baseDir: string }> {
  const { existing, stepNum, totalSteps } = opts ?? {};
  if (stepNum != null && totalSteps != null) {
    console.log(step(stepNum, totalSteps, "Workspace"));
  }

  const baseDir = guardCancel(
    await clack.text({
      message: "Base directory for workspaces:",
      initialValue: existing ?? "~/openacp-workspace",
      validate: (val) =>
        (val ?? "").toString().trim().length > 0 ? undefined : "Path cannot be empty",
    }),
  ) as string;

  return { baseDir: baseDir.trim().replace(/^['"]|['"]$/g, "") };
}
```

- [ ] **Step 3: Write `setup-run-mode.ts`**

Move `setupRunMode()` (lines 647-689). Add pre-fill from existing config:

```typescript
export async function setupRunMode(opts?: {
  existing?: { runMode: string; autoStart: boolean };
  stepNum?: number;
  totalSteps?: number;
}): Promise<{ runMode: "foreground" | "daemon"; autoStart: boolean }> {
  // ... same logic, but use existing?.runMode as initialValue in select
}
```

- [ ] **Step 4: Write `setup-integrations.ts`**

Extract the Claude CLI integration block from `runSetup()` (lines 767-792):

```typescript
export async function setupIntegrations(config: Config): Promise<void> {
  const claudeIntegration = config.integrations?.claude as { installed?: boolean } | undefined;
  const isInstalled = claudeIntegration?.installed === true;

  const installClaude = guardCancel(
    await clack.confirm({
      message: isInstalled
        ? "Claude CLI integration is installed. Reinstall?"
        : "Install session transfer for Claude? (enables /openacp:handoff in your terminal)",
      initialValue: !isInstalled,
    }),
  );

  if (installClaude) {
    try {
      const { getIntegration } = await import("../../cli/integrate.js");
      const integration = getIntegration("claude");
      if (integration) {
        for (const item of integration.items) {
          const result = await item.install();
          for (const log of result.logs) console.log(`  ${log}`);
        }
      }
      console.log("Claude CLI integration installed.\n");
    } catch (err) {
      console.log(`Could not install: ${err instanceof Error ? err.message : err}`);
      console.log("  You can install it later with: openacp integrate claude\n");
    }
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add src/core/setup/setup-agents.ts src/core/setup/setup-workspace.ts src/core/setup/setup-run-mode.ts src/core/setup/setup-integrations.ts
git commit -m "refactor(setup): extract agents, workspace, run-mode, integrations modules"
```

---

## Chunk 2: Channel orchestrator and reconfigure wizard

### Task 7: Create `src/core/setup/setup-channels.ts` — Channel orchestrator

**Files:**
- Create: `src/core/setup/setup-channels.ts`

- [ ] **Step 1: Write the channel orchestrator**

This is the key new module. It handles:
1. Showing channel status
2. Channel selection loop (with "Finished" option)
3. Configured channel actions (Modify/Disable/Delete/Skip)

```typescript
// src/core/setup/setup-channels.ts
import * as clack from "@clack/prompts";
import type { Config } from "../config.js";
import type { ConfiguredChannelAction, ChannelId, ChannelStatus } from "./types.js";
import { CHANNEL_META } from "./types.js";
import { guardCancel, ok, fail, c, dim } from "./helpers.js";
import { setupTelegram } from "./setup-telegram.js";
import { setupDiscord } from "./setup-discord.js";
import type { DiscordChannelConfig } from "../../adapters/discord/types.js";

export function getChannelStatuses(config: Config): ChannelStatus[] {
  const statuses: ChannelStatus[] = [];

  for (const [id, meta] of Object.entries(CHANNEL_META) as [ChannelId, typeof CHANNEL_META[ChannelId]][]) {
    const ch = config.channels[id] as Record<string, unknown> | undefined;
    const enabled = ch?.enabled === true;
    const configured = !!ch && Object.keys(ch).length > 1;

    let hint: string | undefined;
    if (id === "telegram" && ch?.botToken && typeof ch.botToken === "string" && ch.botToken !== "YOUR_BOT_TOKEN_HERE") {
      hint = `Chat ID: ${ch.chatId}`;
    }
    if (id === "discord" && ch?.guildId) {
      hint = `Guild: ${ch.guildId}`;
    }

    statuses.push({ id, label: meta.label, configured, enabled, hint });
  }

  return statuses;
}

export function noteChannelStatus(config: Config): void {
  const statuses = getChannelStatuses(config);
  const lines = statuses.map((s) => {
    const status = s.enabled ? "enabled" : s.configured ? "disabled" : "not configured";
    const hintStr = s.hint ? ` — ${s.hint}` : "";
    return `  ${s.label}: ${status}${hintStr}`;
  });

  console.log("");
  console.log(`${c.bold}  Channel status${c.reset}`);
  for (const line of lines) console.log(line);
  console.log("");
}

async function promptConfiguredAction(label: string): Promise<ConfiguredChannelAction> {
  return guardCancel(
    await clack.select({
      message: `${label} already configured. What do you want to do?`,
      options: [
        { value: "modify" as const, label: "Modify settings" },
        { value: "disable" as const, label: "Disable (keeps config)" },
        { value: "delete" as const, label: "Delete config" },
        { value: "skip" as const, label: "Skip (leave as-is)" },
      ],
      initialValue: "modify" as const,
    }),
  );
}

export async function configureChannels(config: Config): Promise<Config> {
  const next = structuredClone(config);

  noteChannelStatus(next);

  while (true) {
    const statuses = getChannelStatuses(next);
    const options = statuses.map((s) => {
      const status = s.enabled ? "enabled" : s.configured ? "disabled" : "not configured";
      return {
        value: s.id,
        label: `${s.label} (${CHANNEL_META[s.id].method})`,
        hint: status + (s.hint ? ` · ${s.hint}` : ""),
      };
    });

    const choice = guardCancel(
      await clack.select({
        message: "Select a channel",
        options: [
          ...options,
          { value: "__done__" as const, label: "Finished" },
        ],
      }),
    );

    if (choice === "__done__") break;

    const channelId = choice as ChannelId;
    const meta = CHANNEL_META[channelId];
    const existing = next.channels[channelId] as Record<string, unknown> | undefined;
    const isConfigured = !!existing && Object.keys(existing).length > 1;

    if (isConfigured) {
      const action = await promptConfiguredAction(meta.label);

      if (action === "skip") continue;
      if (action === "disable") {
        (next.channels[channelId] as Record<string, unknown>).enabled = false;
        console.log(ok(`${meta.label} disabled`));
        continue;
      }
      if (action === "delete") {
        const confirmed = guardCancel(
          await clack.confirm({
            message: `Delete ${meta.label} config? This cannot be undone.`,
            initialValue: false,
          }),
        );
        if (confirmed) {
          delete next.channels[channelId];
          console.log(ok(`${meta.label} config deleted`));
        }
        continue;
      }
      // action === "modify" — fall through to setup
    }

    // Run channel setup (fresh or modify)
    if (channelId === "telegram") {
      const result = await setupTelegram({
        existing: isConfigured ? (existing as Config["channels"][string]) : undefined,
      });
      next.channels.telegram = result;
    } else if (channelId === "discord") {
      const result = await setupDiscord({
        existing: isConfigured ? (existing as unknown as DiscordChannelConfig) : undefined,
      });
      next.channels.discord = result as Config["channels"][string];
    }
  }

  return next;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/core/setup/setup-channels.ts
git commit -m "feat(setup): add channel orchestrator with status display and configured actions"
```

---

### Task 8: Create `src/core/setup/wizard.ts` — Main orchestrator with runSetup + runReconfigure

**Files:**
- Create: `src/core/setup/wizard.ts`

- [ ] **Step 1: Write the wizard orchestrator**

```typescript
// src/core/setup/wizard.ts
import * as clack from "@clack/prompts";
import type { Config, ConfigManager } from "../config.js";
import { expandHome } from "../config.js";
import type { OnboardSection } from "./types.js";
import { ONBOARD_SECTION_OPTIONS } from "./types.js";
import { guardCancel, ok, warn, printStartBanner, summarizeConfig } from "./helpers.js";
import { setupTelegram } from "./setup-telegram.js";
import { setupDiscord } from "./setup-discord.js";
import { setupAgents } from "./setup-agents.js";
import { setupWorkspace } from "./setup-workspace.js";
import { setupRunMode } from "./setup-run-mode.js";
import { setupIntegrations } from "./setup-integrations.js";
import { configureChannels } from "./setup-channels.js";
import type { DiscordChannelConfig } from "../../adapters/discord/types.js";

// ─── First-run setup (unchanged flow) ───

export async function runSetup(
  configManager: ConfigManager,
  opts?: { skipRunMode?: boolean },
): Promise<boolean> {
  // Copy body from setup.ts lines 730-883 with these call site changes:
  //
  // IMPORTANT — the following function signatures changed to use opts object:
  //
  //   OLD: setupTelegram(currentStep, totalSteps)
  //   NEW: setupTelegram({ stepNum: currentStep, totalSteps })
  //
  //   OLD: setupWorkspace(currentStep, totalSteps)
  //   NEW: setupWorkspace({ stepNum: currentStep, totalSteps })
  //
  //   OLD: setupRunMode(currentStep, totalSteps)
  //   NEW: setupRunMode({ stepNum: currentStep, totalSteps })
  //
  //   OLD: setupDiscord()  — unchanged (no step numbering)
  //   NEW: setupDiscord()
  //
  //   OLD: setupAgents()   — unchanged
  //   NEW: setupAgents()
  //
  //   The Claude CLI integration block (lines 767-792) is replaced with:
  //     await setupIntegrations(config);
  //   where config is a placeholder {} (no existing integrations on first run)
  //
  // All other logic (channel choice, config construction, writeNew, etc.) stays the same.
}

// ─── Reconfigure (section-based, for existing config) ───

type ReconfigureSection = OnboardSection | "__continue";

async function selectSection(hasSelection: boolean): Promise<ReconfigureSection> {
  return guardCancel(
    await clack.select({
      message: "Select sections to configure",
      options: [
        ...ONBOARD_SECTION_OPTIONS,
        {
          value: "__continue" as const,
          label: "Continue",
          hint: hasSelection ? "Done" : "Skip for now",
        },
      ],
      initialValue: ONBOARD_SECTION_OPTIONS[0].value,
    }),
  ) as ReconfigureSection;
}

export async function runReconfigure(configManager: ConfigManager): Promise<void> {
  await printStartBanner();
  clack.intro("OpenACP — Reconfigure");

  try {
    await configManager.load();
    let config = configManager.get();

    // Show current config summary
    clack.note(summarizeConfig(config), "Current configuration");

    let ranSection = false;

    while (true) {
      const choice = await selectSection(ranSection);
      if (choice === "__continue") break;
      ranSection = true;

      if (choice === "channels") {
        const updated = await configureChannels(config);
        // IMPORTANT: Use writeNew() instead of save() because save() uses deepMerge
        // which cannot delete keys. Channel deletion (delete next.channels.telegram)
        // would be silently ignored by deepMerge. writeNew() overwrites the full config.
        config = { ...config, channels: updated.channels };
        await configManager.writeNew(config);
      }

      if (choice === "agents") {
        const { defaultAgent } = await setupAgents();
        await configManager.save({ defaultAgent });
        config = configManager.get();
      }

      if (choice === "workspace") {
        const { baseDir } = await setupWorkspace({
          existing: config.workspace.baseDir,
        });
        await configManager.save({ workspace: { baseDir } });
        config = configManager.get();
      }

      if (choice === "runMode") {
        const result = await setupRunMode({
          existing: { runMode: config.runMode, autoStart: config.autoStart },
        });
        await configManager.save({
          runMode: result.runMode,
          autoStart: result.autoStart,
        });
        config = configManager.get();
      }

      if (choice === "integrations") {
        await setupIntegrations(config);
      }
    }

    if (!ranSection) {
      clack.outro("No changes made.");
      return;
    }

    clack.outro(`Config saved to ${configManager.getConfigPath()}`);
  } catch (err) {
    if ((err as Error).name === "ExitPromptError") {
      clack.cancel("Setup cancelled.");
      return;
    }
    throw err;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/core/setup/wizard.ts
git commit -m "feat(setup): add wizard orchestrator with runSetup + runReconfigure"
```

---

### Task 9: Create `src/core/setup/index.ts` — Public API re-exports

**Files:**
- Create: `src/core/setup/index.ts`

- [ ] **Step 1: Write the index file**

```typescript
// src/core/setup/index.ts
// Public API — maintains backward compatibility with all existing imports

export { runSetup, runReconfigure } from "./wizard.js";
export { printStartBanner } from "./helpers.js";

// Validation functions (used by config-editor.ts and tests)
export {
  validateBotToken,
  validateChatId,
  validateBotAdmin,
  validateDiscordToken,
} from "./validation.js";

// Agent detection (used by tests)
export { detectAgents, validateAgentCommand } from "./setup-agents.js";

// Setup functions — re-exported for backward compat (were public in old setup.ts)
export { setupTelegram } from "./setup-telegram.js";
export { setupDiscord } from "./setup-discord.js";
export { setupAgents } from "./setup-agents.js";
export { setupWorkspace } from "./setup-workspace.js";
export { setupRunMode } from "./setup-run-mode.js";
```

- [ ] **Step 2: Commit**

```bash
git add src/core/setup/index.ts
git commit -m "refactor(setup): add index.ts re-exports for backward compatibility"
```

---

## Chunk 3: Wire up imports and delete old file

### Task 10: Update all import sites

**Files:**
- Modify: `src/cli/commands.ts:1813-1817` — `cmdOnboard` uses `runReconfigure` when config exists
- Modify: `src/cli/commands.ts:1844` — import path update
- Modify: `src/main.ts:44,58` — import path update
- Modify: `src/core/config-editor.ts:29` — import path update

- [ ] **Step 1: Update `cmdOnboard` in `src/cli/commands.ts`**

```typescript
export async function cmdOnboard(): Promise<void> {
  const { ConfigManager } = await import('../core/config.js')
  const cm = new ConfigManager()

  if (await cm.exists()) {
    // Config exists → reconfigure mode
    const { runReconfigure } = await import('../core/setup/index.js')
    await runReconfigure(cm)
  } else {
    // First run → full setup
    const { runSetup } = await import('../core/setup/index.js')
    await runSetup(cm, { skipRunMode: true })
  }
}
```

- [ ] **Step 2: Update `cmdDefault` import in `src/cli/commands.ts`**

Change line 1844:
```typescript
const { runSetup } = await import('../core/setup/index.js')
```

- [ ] **Step 3: Update `src/main.ts` imports**

Change lines 44 and 58:
```typescript
const { runSetup } = await import('./core/setup/index.js')
// ...
const { printStartBanner } = await import('./core/setup/index.js')
```

- [ ] **Step 4: Update `src/core/config-editor.ts` import**

Change line 29:
```typescript
import { validateBotToken, validateChatId, validateDiscordToken } from './setup/index.js'
```

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands.ts src/main.ts src/core/config-editor.ts
git commit -m "refactor(setup): update all import sites to use new setup/ directory"
```

---

### Task 11: Delete old `src/core/setup.ts`

**Files:**
- Delete: `src/core/setup.ts`

- [ ] **Step 1: Verify all imports are updated**

Run: `grep -r "from.*['\"].*core/setup\.js" src/ --include="*.ts" | grep -v "setup/"`
Expected: No results (all imports now point to `setup/index.js`)

- [ ] **Step 2: Delete old file**

```bash
rm src/core/setup.ts
```

- [ ] **Step 3: Commit**

```bash
git add -u src/core/setup.ts
git commit -m "refactor(setup): remove monolithic setup.ts — replaced by setup/ directory"
```

---

## Chunk 4: Tests

### Task 12: Update existing tests

**Files:**
- Modify: `src/__tests__/setup.test.ts`
- Modify: `src/__tests__/setup-integration.test.ts`

- [ ] **Step 1: Update `setup.test.ts` imports**

Change line 14:
```typescript
import { validateBotToken, validateChatId, detectAgents, validateAgentCommand } from '../core/setup/index.js'
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `pnpm test -- src/__tests__/setup.test.ts`
Expected: All 7 tests pass

- [ ] **Step 3: Update `setup-integration.test.ts` imports**

Change line 72:
```typescript
import { runSetup } from '../core/setup/index.js'
```

- [ ] **Step 4: Run integration test**

Run: `pnpm test -- src/__tests__/setup-integration.test.ts`
Expected: Integration test passes

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/setup.test.ts src/__tests__/setup-integration.test.ts
git commit -m "test(setup): update imports to new setup/ directory"
```

---

### Task 13: Add reconfigure integration test

**Files:**
- Modify: `src/__tests__/setup-integration.test.ts`

- [ ] **Step 1: Write reconfigure test**

Add a new test to `setup-integration.test.ts`:

```typescript
import { runReconfigure } from '../core/setup/index.js'

describe('runReconfigure', () => {
  // ... same beforeEach/afterEach as runSetup tests ...

  it('shows section menu and allows channel reconfiguration', { timeout: 15000 }, async () => {
    // Pre-create config file with existing Telegram config
    const existingConfig = {
      channels: {
        telegram: {
          enabled: true,
          botToken: '123:OLD_TOKEN',
          chatId: -1001234567890,
          notificationTopicId: null,
          assistantTopicId: null,
        },
      },
      defaultAgent: 'claude',
      workspace: { baseDir: '~/openacp-workspace' },
      security: { allowedUserIds: [], maxConcurrentSessions: 20, sessionTimeoutMinutes: 60 },
      logging: { level: 'info', logDir: '~/.openacp/logs', maxFileSize: '10m', maxFiles: 7, sessionLogRetentionDays: 30 },
      runMode: 'foreground',
      autoStart: false,
      api: { port: 21420, host: '127.0.0.1' },
      sessionStore: { ttlDays: 30 },
      tunnel: { enabled: true, port: 3100, provider: 'cloudflare', options: {}, maxUserTunnels: 5, storeTtlMinutes: 60, auth: { enabled: false } },
      usage: { enabled: true, warningThreshold: 0.8, currency: 'USD', retentionDays: 90 },
      integrations: {},
      speech: { stt: { provider: null, providers: {} }, tts: { provider: null, providers: {} } },
    }
    fs.writeFileSync(configPath, JSON.stringify(existingConfig, null, 2))

    // Mock: select "channels" section → select "telegram" → "skip" → select "__continue"
    mockedSelect
      .mockResolvedValueOnce('channels' as any)    // section menu
      .mockResolvedValueOnce('telegram' as any)    // channel selection
      .mockResolvedValueOnce('skip' as any)        // configured action: skip
      .mockResolvedValueOnce('__done__' as any)    // channel loop: finished
      .mockResolvedValueOnce('__continue' as any)  // section menu: continue

    const cm = new ConfigManager()
    await runReconfigure(cm)

    // Config should remain unchanged since we skipped
    const written = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    expect(written.channels.telegram.botToken).toBe('123:OLD_TOKEN')
    expect(written.channels.telegram.enabled).toBe(true)
  })
})
```

- [ ] **Step 2: Run test**

Run: `pnpm test -- src/__tests__/setup-integration.test.ts`
Expected: Both tests pass

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/setup-integration.test.ts
git commit -m "test(setup): add reconfigure integration test"
```

---

## Chunk 5: Build verification

### Task 14: Full build and test verification

- [ ] **Step 1: Run full test suite**

Run: `pnpm test`
Expected: All tests pass

- [ ] **Step 2: Run TypeScript build**

Run: `pnpm build`
Expected: No compilation errors

- [ ] **Step 3: Verify npm publish build**

Run: `pnpm build:publish`
Expected: Builds successfully to `dist-publish/`

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix(setup): address build/test issues from refactor"
```
