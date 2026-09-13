import { describe, expect, it } from "vitest";
import { ackReadGateSatisfied, parseAckReadGate } from "../ackReadGate";

describe("parseAckReadGate", () => {
  it("无配置/空串/非法 JSON 一律按「无门控」，不得把老数据锁死", () => {
    for (const raw of [null, undefined, "", "   ", "not-json", "{}"]) {
      const gate = parseAckReadGate(raw);
      expect(gate).toEqual({ minDwellSeconds: 0, requireScrollToBottom: false });
      expect(ackReadGateSatisfied(gate, 0, false)).toBe(true);
    }
  });

  it("负数秒数归零；requireScrollToBottom 只认严格 true", () => {
    expect(parseAckReadGate('{"minDwellSeconds":-5}').minDwellSeconds).toBe(0);
    expect(parseAckReadGate('{"requireScrollToBottom":"true"}').requireScrollToBottom).toBe(false);
    expect(parseAckReadGate('{"requireScrollToBottom":1}').requireScrollToBottom).toBe(false);
    expect(parseAckReadGate('{"requireScrollToBottom":true}').requireScrollToBottom).toBe(true);
  });

  it("读取正常配置", () => {
    expect(parseAckReadGate('{"minDwellSeconds":8,"requireScrollToBottom":true}')).toEqual({
      minDwellSeconds: 8,
      requireScrollToBottom: true,
    });
  });
});

describe("ackReadGateSatisfied", () => {
  it("最短停留：不足不放行，刚好达标放行", () => {
    const gate = { minDwellSeconds: 5, requireScrollToBottom: false };
    expect(ackReadGateSatisfied(gate, 4, true)).toBe(false);
    expect(ackReadGateSatisfied(gate, 5, false)).toBe(true);
  });

  it("滚到底：未滚不放行，滚动状态与停留时间相互独立", () => {
    const gate = { minDwellSeconds: 0, requireScrollToBottom: true };
    expect(ackReadGateSatisfied(gate, 999, false)).toBe(false);
    expect(ackReadGateSatisfied(gate, 0, true)).toBe(true);
  });

  it("两项都配时必须同时满足", () => {
    const gate = { minDwellSeconds: 3, requireScrollToBottom: true };
    expect(ackReadGateSatisfied(gate, 9, false)).toBe(false);
    expect(ackReadGateSatisfied(gate, 1, true)).toBe(false);
    expect(ackReadGateSatisfied(gate, 3, true)).toBe(true);
  });
});
