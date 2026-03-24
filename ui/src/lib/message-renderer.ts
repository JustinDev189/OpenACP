/**
 * Web message renderer — converts FormattedMessage into structured props
 * for React chat components (ToolCallCard, ThoughtCard, PlanCard, etc.)
 *
 * Unlike Telegram/Discord renderers that produce strings,
 * the web renderer returns typed objects consumed directly by React components.
 */

// Re-declare shared types locally to avoid cross-project import from src/adapters/shared.
// The UI is a separate Vite app with its own tsconfig — it cannot import from the Node.js backend.
// These types mirror src/adapters/shared/format-types.ts and must stay in sync.

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

// ─── Rendered props consumed by React components ─────────────────────────────

export interface RenderedTextProps {
  kind: "text";
  content: string;
}

export interface RenderedThoughtProps {
  kind: "thought";
  icon: string;
  summary: string;
  detail?: string;
  collapsible: boolean;
}

export interface RenderedToolProps {
  kind: "tool";
  icon: string;
  summary: string;
  detail?: string;
  status?: string;
  toolName?: string;
  toolKind?: string;
  viewerLinks?: { type: "file" | "diff"; url: string; label: string }[];
  collapsible: boolean;
}

export interface RenderedPlanProps {
  kind: "plan";
  icon: string;
  summary: string;
  entries: { content: string; status: string }[];
}

export interface RenderedUsageProps {
  kind: "usage";
  icon: string;
  summary: string;
  tokens?: number;
  contextSize?: number;
  cost?: number;
}

export interface RenderedSystemProps {
  kind: "system";
  icon: string;
  summary: string;
}

export interface RenderedErrorProps {
  kind: "error";
  icon: string;
  summary: string;
  detail?: string;
  collapsible: boolean;
}

export interface RenderedAttachmentProps {
  kind: "attachment";
  icon: string;
  summary: string;
}

export type RenderedMessageProps =
  | RenderedTextProps
  | RenderedThoughtProps
  | RenderedToolProps
  | RenderedPlanProps
  | RenderedUsageProps
  | RenderedSystemProps
  | RenderedErrorProps
  | RenderedAttachmentProps;

// ─── Renderer ────────────────────────────────────────────────────────────────

export function renderForWeb(msg: FormattedMessage): RenderedMessageProps {
  switch (msg.style) {
    case "text":
      return { kind: "text", content: msg.summary };

    case "thought":
      return {
        kind: "thought",
        icon: msg.icon,
        summary: msg.summary,
        detail: msg.detail,
        collapsible: !!msg.detail,
      };

    case "tool":
      return {
        kind: "tool",
        icon: msg.icon,
        summary: msg.summary,
        detail: msg.detail,
        status: msg.metadata?.toolStatus,
        toolName: msg.metadata?.toolName,
        toolKind: msg.metadata?.toolKind,
        viewerLinks: msg.metadata?.viewerLinks,
        collapsible: !!msg.detail || !!msg.metadata?.viewerLinks?.length,
      };

    case "plan":
      return {
        kind: "plan",
        icon: msg.icon,
        summary: msg.summary,
        entries: msg.metadata?.planEntries ?? [],
      };

    case "usage":
      return {
        kind: "usage",
        icon: msg.icon,
        summary: msg.summary,
        tokens: msg.metadata?.tokens,
        contextSize: msg.metadata?.contextSize,
        cost: msg.metadata?.cost,
      };

    case "system":
      return {
        kind: "system",
        icon: msg.icon,
        summary: msg.summary,
      };

    case "error":
      return {
        kind: "error",
        icon: msg.icon,
        summary: msg.summary,
        detail: msg.detail,
        collapsible: !!msg.detail,
      };

    case "attachment":
      return {
        kind: "attachment",
        icon: msg.icon,
        summary: msg.summary,
      };
  }
}
