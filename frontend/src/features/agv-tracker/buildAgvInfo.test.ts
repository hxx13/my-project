import { describe, it, expect } from "vitest";
import type { MutableRefObject } from "react";
import { buildAgvInfo } from "./buildAgvInfo";

const ROBOT = { ip: "172.22.159.16", label: "AGV-1", color: "#3b82f6" };

/** 构造 buildAgvInfo 的最小参数集，只暴露本用例关心的 coordConfigs */
function callBuild(coordConfigs: Record<string, any> | undefined) {
  const lastKnownRef: MutableRefObject<Record<string, Record<string, unknown>>> = {
    current: {},
  };
  return buildAgvInfo(
    ROBOT,
    () => null,
    () => null,
    { [ROBOT.ip]: { speed: null, avgSpeed: null, maxSpeed: null } },
    { [ROBOT.ip]: [] },
    () => [],
    coordConfigs,
    lastKnownRef,
  );
}

describe("buildAgvInfo — 坐标系参数来源", () => {
  it("三个坐标系参数全部取自后端配置", () => {
    const info = callBuild({
      [ROBOT.ip]: { rotationDeg: 90, offsetX: 1.5, offsetY: -2.5, scale: 1.6 },
    });
    expect(info.coordRotationDeg).toBe(90);
    expect(info.coordOffsetX).toBe(1.5);
    expect(info.coordOffsetY).toBe(-2.5);
    expect(info.coordScale).toBe(1.6);
  });

  it("后端 scale 为 1 时结果就是 1 —— 不得被任何本机状态覆盖", () => {
    // 回归用例：scale 曾只存 localStorage，导致本机看着正常、他人机器坐标整体偏移
    const info = callBuild({
      [ROBOT.ip]: { rotationDeg: 0, offsetX: 0, offsetY: 0, scale: 1 },
    });
    expect(info.coordScale).toBe(1);
  });

  it("后端配置尚未返回时 scale 兜底为 1", () => {
    expect(callBuild(undefined).coordScale).toBe(1);
  });
});
