import { describe, expect, it, vi } from "vitest";
import { SlackTextBuffer } from "./text-buffer.js";

describe("SlackTextBuffer", () => {
  it("flushes buffered text as a single message", async () => {
    const mockQueue = {
      enqueue: vi.fn().mockResolvedValue({}),
    } as any;
    const buf = new SlackTextBuffer("C123", "sess1", mockQueue);

    buf.append("Hello ");
    buf.append("world");
    await buf.flush();

    expect(mockQueue.enqueue).toHaveBeenCalledTimes(1);
    const call = mockQueue.enqueue.mock.calls[0];
    expect(call[1].text).toContain("Hello");
    expect(call[1].text).toContain("world");
  });

  it("does not post empty content", async () => {
    const mockQueue = { enqueue: vi.fn().mockResolvedValue({}) } as any;
    const buf = new SlackTextBuffer("C123", "sess1", mockQueue);
    await buf.flush();
    expect(mockQueue.enqueue).not.toHaveBeenCalled();
  });

  it("does not lose content appended during flush", async () => {
    const resolvers: Array<() => void> = [];
    const mockQueue = {
      enqueue: vi.fn().mockImplementation(
        () => new Promise<void>(r => { resolvers.push(r); }),
      ),
    } as any;
    const buf = new SlackTextBuffer("C123", "sess1", mockQueue);

    buf.append("first");
    const flushPromise = buf.flush(); // starts flush, blocks on first enqueue

    // Wait for first enqueue to be called
    await new Promise(r => setTimeout(r, 10));

    // Append more content while flush is in progress
    buf.append(" second");

    // Unblock first enqueue — this triggers re-flush in finally block
    resolvers[0]();

    // Wait for re-flush to call enqueue again, then unblock it
    await new Promise(r => setTimeout(r, 20));
    if (resolvers[1]) resolvers[1]();

    await flushPromise;
    await new Promise(r => setTimeout(r, 20));

    const allText = mockQueue.enqueue.mock.calls
      .map((c: any) => c[1].text as string)
      .join(" ");
    expect(allText).toContain("second");
  });

  it("destroy clears buffer and timer", async () => {
    const mockQueue = { enqueue: vi.fn().mockResolvedValue({}) } as any;
    const buf = new SlackTextBuffer("C123", "sess1", mockQueue);
    buf.append("text");
    buf.destroy();
    // After destroy, flush should not post anything
    await buf.flush();
    expect(mockQueue.enqueue).not.toHaveBeenCalled();
  });
});
