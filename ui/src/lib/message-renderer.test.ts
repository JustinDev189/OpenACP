import { describe, it, expect } from "vitest";
import { renderForWeb } from "./message-renderer";
import type { FormattedMessage } from "./message-renderer";

describe("renderForWeb", () => {
  it("renders text message", () => {
    const msg: FormattedMessage = {
      summary: "Hello world",
      icon: "",
      originalType: "text",
      style: "text",
    };
    const result = renderForWeb(msg);
    expect(result.kind).toBe("text");
    if (result.kind === "text") {
      expect(result.content).toBe("Hello world");
    }
  });

  it("renders thought — short (not collapsible)", () => {
    const msg: FormattedMessage = {
      summary: "Short thought",
      icon: "💭",
      originalType: "thought",
      style: "thought",
    };
    const result = renderForWeb(msg);
    expect(result.kind).toBe("thought");
    if (result.kind === "thought") {
      expect(result.collapsible).toBe(false);
      expect(result.icon).toBe("💭");
    }
  });

  it("renders thought — long (collapsible)", () => {
    const msg: FormattedMessage = {
      summary: "Short...",
      detail: "Full long thought text here",
      icon: "💭",
      originalType: "thought",
      style: "thought",
    };
    const result = renderForWeb(msg);
    if (result.kind === "thought") {
      expect(result.collapsible).toBe(true);
      expect(result.detail).toBe("Full long thought text here");
    }
  });

  it("renders tool with metadata", () => {
    const msg: FormattedMessage = {
      summary: "🔄 📖 Read src/main.ts",
      detail: "file contents...",
      icon: "📖",
      originalType: "tool_call",
      style: "tool",
      metadata: {
        toolName: "Read",
        toolStatus: "in_progress",
        toolKind: "read",
      },
    };
    const result = renderForWeb(msg);
    expect(result.kind).toBe("tool");
    if (result.kind === "tool") {
      expect(result.toolName).toBe("Read");
      expect(result.status).toBe("in_progress");
      expect(result.collapsible).toBe(true);
      expect(result.detail).toBe("file contents...");
    }
  });

  it("renders tool with viewer links as collapsible", () => {
    const msg: FormattedMessage = {
      summary: "✅ ✏️ Edit src/app.ts",
      icon: "✏️",
      originalType: "tool_update",
      style: "tool",
      metadata: {
        toolName: "Edit",
        toolStatus: "completed",
        viewerLinks: [
          { type: "file", url: "https://example.com/file", label: "View file" },
        ],
      },
    };
    const result = renderForWeb(msg);
    if (result.kind === "tool") {
      expect(result.collapsible).toBe(true);
      expect(result.viewerLinks).toHaveLength(1);
    }
  });

  it("renders tool without detail as non-collapsible", () => {
    const msg: FormattedMessage = {
      summary: "⏳ 🔧 CustomTool",
      icon: "🔧",
      originalType: "tool_call",
      style: "tool",
      metadata: { toolName: "CustomTool", toolStatus: "pending" },
    };
    const result = renderForWeb(msg);
    if (result.kind === "tool") {
      expect(result.collapsible).toBe(false);
    }
  });

  it("renders plan with entries", () => {
    const msg: FormattedMessage = {
      summary: "📋 Plan: 3 steps",
      icon: "📋",
      originalType: "plan",
      style: "plan",
      metadata: {
        planEntries: [
          { content: "Step 1", status: "completed" },
          { content: "Step 2", status: "in_progress" },
          { content: "Step 3", status: "pending" },
        ],
      },
    };
    const result = renderForWeb(msg);
    expect(result.kind).toBe("plan");
    if (result.kind === "plan") {
      expect(result.entries).toHaveLength(3);
      expect(result.entries[0].status).toBe("completed");
    }
  });

  it("renders plan with missing entries gracefully", () => {
    const msg: FormattedMessage = {
      summary: "📋 Plan: 0 steps",
      icon: "📋",
      originalType: "plan",
      style: "plan",
    };
    const result = renderForWeb(msg);
    if (result.kind === "plan") {
      expect(result.entries).toEqual([]);
    }
  });

  it("renders usage with cost", () => {
    const msg: FormattedMessage = {
      summary: "📊 12k tokens · $0.04",
      icon: "📊",
      originalType: "usage",
      style: "usage",
      metadata: { tokens: 12345, contextSize: 50000, cost: 0.04 },
    };
    const result = renderForWeb(msg);
    expect(result.kind).toBe("usage");
    if (result.kind === "usage") {
      expect(result.tokens).toBe(12345);
      expect(result.cost).toBe(0.04);
      expect(result.contextSize).toBe(50000);
    }
  });

  it("renders system message", () => {
    const msg: FormattedMessage = {
      summary: "Session Done (completed)",
      icon: "✅",
      originalType: "session_end",
      style: "system",
    };
    const result = renderForWeb(msg);
    expect(result.kind).toBe("system");
    if (result.kind === "system") {
      expect(result.icon).toBe("✅");
    }
  });

  it("renders error — short (not collapsible)", () => {
    const msg: FormattedMessage = {
      summary: "Something went wrong",
      icon: "❌",
      originalType: "error",
      style: "error",
    };
    const result = renderForWeb(msg);
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.collapsible).toBe(false);
    }
  });

  it("renders error — long (collapsible)", () => {
    const msg: FormattedMessage = {
      summary: "Error: timeout...",
      detail: "Full stack trace here",
      icon: "❌",
      originalType: "error",
      style: "error",
    };
    const result = renderForWeb(msg);
    if (result.kind === "error") {
      expect(result.collapsible).toBe(true);
      expect(result.detail).toBe("Full stack trace here");
    }
  });

  it("renders attachment", () => {
    const msg: FormattedMessage = {
      summary: "image.png",
      icon: "📎",
      originalType: "attachment",
      style: "attachment",
    };
    const result = renderForWeb(msg);
    expect(result.kind).toBe("attachment");
    if (result.kind === "attachment") {
      expect(result.icon).toBe("📎");
    }
  });
});
