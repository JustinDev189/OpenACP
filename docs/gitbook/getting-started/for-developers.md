# Quick Start for Developers

This guide gets you from zero to chatting with an AI agent in your Telegram (or Discord, or Slack) in about ten minutes.

## Prerequisites

- **Node.js 20 or later** — check with `node --version`
- **npm** — comes with Node.js
- **A bot token** for your platform of choice:
  - Telegram: create one via [@BotFather](https://t.me/BotFather)
  - Discord: create one in the [Discord Developer Portal](https://discord.com/developers/applications)
  - Slack: create one at [api.slack.com/apps](https://api.slack.com/apps)
- At least one ACP-compatible agent installed locally (e.g. `claude` CLI, `gemini` CLI)

---

## Step 1: Install OpenACP

```bash
npm install -g @openacp/cli
```

Verify it installed correctly:

```bash
openacp --version
```

---

## Step 2: Run the setup wizard

```bash
openacp
```

The first time you run `openacp` with no arguments, it detects there's no config and launches the interactive setup wizard. The wizard walks you through:

1. **Choose your platform** — Telegram, Discord, or Slack
2. **Enter your bot token** — paste the token you created above
3. **Validate the token** — the wizard confirms it can reach the platform API
4. **Detect agents** — it scans your PATH for installed ACP-compatible agents and shows you what it found
5. **Set your workspace** — the directory your agents will have access to (usually your projects root)
6. **Choose run mode** — foreground (for testing) or daemon (runs in the background)

Work through each prompt. Most have sensible defaults — just press Enter to accept them.

---

## Step 3: Start OpenACP

If you chose foreground mode during setup:

```bash
openacp start
```

If you chose daemon mode, it started automatically at the end of setup. Check with:

```bash
openacp status
```

---

## Step 4: Open your chat app and start a session

Go to the Telegram group (or Discord server, or Slack channel) linked to your bot and send:

```
/new
```

You should see OpenACP create a session and respond. Now send a real prompt:

```
What files are in the src/ directory?
```

---

## Step 5: Verify everything is working

You should see:
- A response from the agent streaming into the chat
- Tool call status messages as the agent reads files
- The session topic renamed automatically after your first message

If something isn't working, check [Troubleshooting](../troubleshooting/) or run `openacp logs` to see what's happening.

---

## What just happened?

When you ran `openacp start`, OpenACP:

1. Loaded your config from `~/.openacp/config.json`
2. Connected your bot to the platform (Telegram/Discord/Slack)
3. Started listening for messages

When you sent `/new`, OpenACP:

1. Created a new **Session** for your user
2. Spawned an **AgentInstance** — a subprocess running your chosen AI agent via ACP
3. Routed your prompt to the agent and streamed the response back to chat

---

## Your data directory

Everything OpenACP stores lives in `~/.openacp/`:

| Path | What's in it |
|---|---|
| `~/.openacp/config.json` | Your configuration (bot token, agent settings, allowed users, etc.) |
| `~/.openacp/sessions.json` | Active and recent session metadata |
| `~/.openacp/usage.json` | Token and cost tracking |
| `~/.openacp/logs/` | Application logs |
| `~/.openacp/files/` | Files shared through the chat |
| `~/.openacp/plugins/` | Installed plugins |

To reconfigure at any time, run:

```bash
openacp onboard
```

---

## Next steps

- Platform Setup — detailed setup guides for [Telegram](../platform-setup/telegram.md), [Discord](../platform-setup/discord.md), and [Slack](../platform-setup/slack.md)
- [Configuration Reference](../self-hosting/configuration.md) — all config options explained
- [Agents](../using-openacp/agents.md) — how to configure and switch between agents
- [Daemon Mode](../self-hosting/daemon-mode.md) — running OpenACP as a persistent background service
