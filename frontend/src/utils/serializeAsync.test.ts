import { describe, it, expect } from "vitest";
import { createSerializedQueue } from "./serializeAsync";

describe("createSerializedQueue", () => {
  it("任务按入队顺序串行执行，绝不并发", async () => {
    const q = createSerializedQueue();
    const order: number[] = [];
    let running = 0;
    let maxRunning = 0;

    const task = (id: number, delay: number) => q.run(async () => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, delay));
      order.push(id);
      running -= 1;
    });

    const p1 = task(1, 20);
    const p2 = task(2, 5);
    const p3 = task(3, 1);
    await Promise.all([p1, p2, p3]);

    expect(maxRunning).toBe(1);
    expect(order).toEqual([1, 2, 3]);
  });

  it("前一个任务失败不阻断后续任务", async () => {
    const q = createSerializedQueue();
    const seen: string[] = [];

    await q.run(async () => {
      seen.push("first-start");
      throw new Error("boom");
    }).catch(() => {});

    await q.run(async () => {
      seen.push("second");
    });

    expect(seen).toEqual(["first-start", "second"]);
  });

  it("run 返回本次任务结果", async () => {
    const q = createSerializedQueue();
    await expect(q.run(() => 42)).resolves.toBe(42);
  });
});
