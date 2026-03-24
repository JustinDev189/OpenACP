import type { PlanEntry } from "../../core/types.js";
import type {
  FormattedMessage,
  MessageRenderer,
} from "../shared/format-types.js";
import { STATUS_ICONS, KIND_ICONS } from "../shared/format-types.js";
import {
  progressBar,
  formatTokens,
  truncateContent,
  stripCodeFences,
  splitMessage as sharedSplitMessage,
} from "../shared/format-utils.js";
import {
  extractContentText,
  formatToolSummary,
} from "../shared/message-formatter.js";

// Discord-specific override: command uses ⚡ instead of ▶️
const DISCORD_KIND_ICONS: Record<string, string> = {
  ...KIND_ICONS,
  command: "⚡",
};

function formatViewerLinks(
  links?: { file?: string; diff?: string },
  filePath?: string,
): string {
  if (!links) return "";
  const fileName = filePath ? filePath.split("/").pop() || filePath : "";
  let text = "\n";
  if (links.file) text += `\n[View ${fileName || "file"}](${links.file})`;
  if (links.diff)
    text += `\n[View diff${fileName ? ` — ${fileName}` : ""}](${links.diff})`;
  return text;
}

export function formatToolCall(tool: {
  id: string;
  name?: string;
  kind?: string;
  status?: string;
  content?: unknown;
  rawInput?: unknown;
  viewerLinks?: { file?: string; diff?: string };
  viewerFilePath?: string;
}): string {
  const si = STATUS_ICONS[tool.status || ""] || "🔧";
  const name = tool.name || "Tool";
  const summary = formatToolSummary(name, tool.rawInput);
  let text = `${si} **${summary}**`;
  text += formatViewerLinks(tool.viewerLinks, tool.viewerFilePath);
  if (!tool.viewerLinks) {
    const details = stripCodeFences(extractContentText(tool.content));
    if (details) {
      text += `\n\`\`\`\n${truncateContent(details, 500)}\n\`\`\``;
    }
  }
  return text;
}

export function formatToolUpdate(update: {
  id: string;
  name?: string;
  kind?: string;
  status: string;
  content?: unknown;
  rawInput?: unknown;
  viewerLinks?: { file?: string; diff?: string };
  viewerFilePath?: string;
}): string {
  return formatToolCall(update);
}

export function formatPlan(entries: PlanEntry[]): string {
  const statusIcon: Record<string, string> = {
    pending: "⏳",
    in_progress: "🔄",
    completed: "✅",
  };
  const lines = entries.map(
    (e, i) => `${statusIcon[e.status] || "⬜"} ${i + 1}. ${e.content}`,
  );
  return `**Plan:**\n${lines.join("\n")}`;
}

export function formatUsage(usage: {
  tokensUsed?: number;
  contextSize?: number;
}): string {
  const { tokensUsed, contextSize } = usage;
  if (tokensUsed == null) return "📊 Usage data unavailable";
  if (contextSize == null) return `📊 ${formatTokens(tokensUsed)} tokens`;

  const ratio = tokensUsed / contextSize;
  const pct = Math.round(ratio * 100);
  const bar = progressBar(ratio);
  const emoji = pct >= 85 ? "⚠️" : "📊";
  return `${emoji} ${formatTokens(tokensUsed)} / ${formatTokens(contextSize)} tokens\n${bar} ${pct}%`;
}

export function splitMessage(text: string, maxLength = 1800): string[] {
  return sharedSplitMessage(text, maxLength);
}

export const discordRenderer: MessageRenderer = {
  render(msg: FormattedMessage, _expanded: boolean): string {
    if (msg.style === "tool") {
      const detail = msg.detail
        ? `\n\`\`\`\n${truncateContent(stripCodeFences(msg.detail), 500)}\n\`\`\``
        : "";
      return `${msg.summary}${detail}`;
    }
    if (msg.style === "thought") {
      return `💭 _${msg.summary}_`;
    }
    return msg.summary;
  },
  renderFull(msg: FormattedMessage): string {
    return msg.summary;
  },
};
