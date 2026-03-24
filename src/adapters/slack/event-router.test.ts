import { describe, expect, it, vi } from "vitest";
import { SlackEventRouter } from "./event-router.js";
import type { SlackChannelConfig } from "./types.js";

function createMockApp() {
  const handlers: Record<string, Function> = {};
  return {
    message: vi.fn((handler: Function) => { handlers["message"] = handler; }),
    _trigger: async (event: string, payload: any) => {
      const handler = handlers[event];
      if (handler) await handler(payload);
    },
  };
}

function makeConfig(overrides: Partial<SlackChannelConfig> = {}): SlackChannelConfig {
  return {
    enabled: true,
    botToken: "xoxb-test",
    appToken: "xapp-test",
    signingSecret: "secret",
    allowedUserIds: [],
    channelPrefix: "openacp",
    autoCreateSession: true,
    ...overrides,
  } as SlackChannelConfig;
}

describe("SlackEventRouter", () => {
  it("ignores bot messages (message has bot_id field)", async () => {
    const onIncoming = vi.fn();
    const onNewSession = vi.fn();
    const sessionLookup = vi.fn().mockReturnValue(undefined);
    const router = new SlackEventRouter(sessionLookup, onIncoming, "BOT1", "NOTIF", onNewSession, makeConfig());
    const app = createMockApp();
    router.register(app as any);

    await app._trigger("message", { message: { channel: "C123", user: "U1", text: "hello", bot_id: "B1" } });

    expect(onIncoming).not.toHaveBeenCalled();
    expect(onNewSession).not.toHaveBeenCalled();
  });

  it("ignores own messages (userId matches botUserId)", async () => {
    const onIncoming = vi.fn();
    const onNewSession = vi.fn();
    const sessionLookup = vi.fn().mockReturnValue(undefined);
    const router = new SlackEventRouter(sessionLookup, onIncoming, "BOT1", "NOTIF", onNewSession, makeConfig());
    const app = createMockApp();
    router.register(app as any);

    await app._trigger("message", { message: { channel: "C123", user: "BOT1", text: "hello" } });

    expect(onIncoming).not.toHaveBeenCalled();
    expect(onNewSession).not.toHaveBeenCalled();
  });

  it("ignores messages with subtype (edited, deleted)", async () => {
    const onIncoming = vi.fn();
    const onNewSession = vi.fn();
    const sessionLookup = vi.fn().mockReturnValue(undefined);
    const router = new SlackEventRouter(sessionLookup, onIncoming, "BOT1", "NOTIF", onNewSession, makeConfig());
    const app = createMockApp();
    router.register(app as any);

    await app._trigger("message", { message: { channel: "C123", user: "U1", text: "edited", subtype: "message_changed" } });

    expect(onIncoming).not.toHaveBeenCalled();
    expect(onNewSession).not.toHaveBeenCalled();
  });

  it("rejects messages from non-allowed users when allowedUserIds is configured", async () => {
    const onIncoming = vi.fn();
    const onNewSession = vi.fn();
    const sessionLookup = vi.fn().mockReturnValue(undefined);
    const router = new SlackEventRouter(
      sessionLookup,
      onIncoming,
      "BOT1",
      "NOTIF",
      onNewSession,
      makeConfig({ allowedUserIds: ["U_ALLOWED"] }),
    );
    const app = createMockApp();
    router.register(app as any);

    await app._trigger("message", { message: { channel: "C123", user: "U_NOT_ALLOWED", text: "hello" } });

    expect(onIncoming).not.toHaveBeenCalled();
    expect(onNewSession).not.toHaveBeenCalled();
  });

  it("allows messages when allowedUserIds is empty (open access mode)", async () => {
    const onIncoming = vi.fn();
    const onNewSession = vi.fn();
    const sessionLookup = vi.fn().mockReturnValue(undefined);
    const router = new SlackEventRouter(
      sessionLookup,
      onIncoming,
      "BOT1",
      "NOTIF",
      onNewSession,
      makeConfig({ allowedUserIds: [] }),
    );
    const app = createMockApp();
    router.register(app as any);

    await app._trigger("message", { message: { channel: "NOTIF", user: "U_ANYONE", text: "hello" } });

    expect(onNewSession).toHaveBeenCalledWith("hello", "U_ANYONE");
  });

  it("routes to onIncoming when sessionLookup returns a match", async () => {
    const onIncoming = vi.fn();
    const onNewSession = vi.fn();
    const sessionLookup = vi.fn().mockReturnValue({ channelId: "C123", channelSlug: "openacp-session-abc1" });
    const router = new SlackEventRouter(sessionLookup, onIncoming, "BOT1", "NOTIF", onNewSession, makeConfig());
    const app = createMockApp();
    router.register(app as any);

    await app._trigger("message", { message: { channel: "C123", user: "U1", text: "hello" } });

    expect(onIncoming).toHaveBeenCalledWith("openacp-session-abc1", "hello", "U1");
    expect(onNewSession).not.toHaveBeenCalled();
  });

  it("routes to onNewSession when message is in notification channel and no session match", async () => {
    const onIncoming = vi.fn();
    const onNewSession = vi.fn();
    const sessionLookup = vi.fn().mockReturnValue(undefined);
    const router = new SlackEventRouter(sessionLookup, onIncoming, "BOT1", "NOTIF_CHAN", onNewSession, makeConfig());
    const app = createMockApp();
    router.register(app as any);

    await app._trigger("message", { message: { channel: "NOTIF_CHAN", user: "U1", text: "new task" } });

    expect(onNewSession).toHaveBeenCalledWith("new task", "U1");
    expect(onIncoming).not.toHaveBeenCalled();
  });
});
