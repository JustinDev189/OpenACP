// src/adapters/shared/format-types.ts

export type MessageStyle =
  | "text"
  | "thought"
  | "tool"
  | "plan"
  | "usage"
  | "system"
  | "error"
  | "attachment";

export interface MessageMetadata {
  toolName?: string;
  toolStatus?: string;
  toolKind?: string;
  filePath?: string;
  command?: string;
  planEntries?: { content: string; status: string }[];
  tokens?: number;
  contextSize?: number;
  cost?: number;
  viewerLinks?: { type: "file" | "diff"; url: string; label: string }[];
}

export interface FormattedMessage {
  summary: string;
  detail?: string;
  icon: string;
  originalType: string;
  style: MessageStyle;
  metadata?: MessageMetadata;
}

export interface MessageRenderer<T = string> {
  render(msg: FormattedMessage, expanded: boolean): T;
  renderFull(msg: FormattedMessage): T;
}

export const STATUS_ICONS: Record<string, string> = {
  pending: "⏳",
  in_progress: "🔄",
  completed: "✅",
  failed: "❌",
  cancelled: "🚫",
  running: "🔄",
  done: "✅",
  error: "❌",
};

export const KIND_ICONS: Record<string, string> = {
  read: "📖",
  edit: "✏️",
  write: "✏️",
  delete: "🗑️",
  execute: "▶️",
  command: "▶️",
  bash: "▶️",
  search: "🔍",
  web: "🌐",
  fetch: "🌐",
  agent: "🧠",
  think: "🧠",
  install: "📦",
  move: "📦",
  other: "🛠️",
};

export const MESSAGE_ICONS: Record<string, string> = {
  thought: "💭",
  plan: "📋",
  usage: "📊",
  error: "❌",
  session_end_completed: "✅",
  session_end_error: "❌",
  system_message: "ℹ️",
  attachment: "📎",
};
