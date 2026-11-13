import { describe, expect, it } from "vitest";
import { createSerialWriteQueue } from "./workspaceSync";

describe("workspace write queue", () => {
  it("runs full-snapshot writes in enqueue order", async () => {
    const enqueue = createSerialWriteQueue();
    const order: string[] = [];
    let releaseFirst!: () => void;

    const first = enqueue(async () => {
      order.push("first-start");
      await new Promise<void>((resolve) => { releaseFirst = resolve; });
      order.push("first-end");
    });
    const second = enqueue(async () => { order.push("second"); });

    await Promise.resolve();
    expect(order).toEqual(["first-start"]);
    releaseFirst();
    await Promise.all([first, second]);
    expect(order).toEqual(["first-start", "first-end", "second"]);
  });

  it("continues processing after a failed write", async () => {
    const enqueue = createSerialWriteQueue();
    const order: string[] = [];
    const failed = enqueue(async () => { order.push("failed"); throw new Error("network"); });
    const next = enqueue(async () => { order.push("next"); return "ok"; });

    await expect(failed).rejects.toThrow("network");
    await expect(next).resolves.toBe("ok");
    expect(order).toEqual(["failed", "next"]);
  });
});
