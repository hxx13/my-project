import { describe, expect, it } from "vitest";
import type { TelemetryTagItem } from "@/telemetry-view/types";
import {
  pickChillerMachineTags,
  pickCoolingTowerTags,
  pickCoolingWaterPumpTags,
  pickFrozenChilledWaterPumpTags,
} from "./cockpitPowerStationTags";

const mk = (variableName: string) => ({ variableName, value: "1" }) as TelemetryTagItem;

/** 老取法：筛出来按变量名排序取前 N —— 水泵/冷凝塔仍然走这条 */
const oldWay = (arr: TelemetryTagItem[], n: number) =>
  [...arr]
    .sort((a, b) => String(a.variableName || "").localeCompare(String(b.variableName || ""), "zh-Hans-CN"))
    .slice(0, n)
    .map((t) => t.variableName);

describe("动力站设备挑点", () => {
  it("冷机：三格分别绑 1/2/3 号的「远程开关机」，不掺进温度/运行时间", () => {
    const items = [
      mk("冷机1.温度"),
      mk("冷机2.运行时间"),
      mk("冷机3.温度"),
      mk("冷机1.远程开关机"),
      mk("冷机2远程开关机"),
      mk("冷机3.远程开关机"),
    ];
    expect(pickChillerMachineTags(items, 3).map((t) => t.variableName)).toEqual([
      "冷机1.远程开关机",
      "冷机2远程开关机",
      "冷机3.远程开关机",
    ]);
  });

  it("冷机：横杠命名 + 以「状态」结尾的也认", () => {
    const items = [
      mk("B1F-E10-动力站-冷机-01-温度"),
      mk("B1F-E10-动力站-冷机-01-状态"),
      mk("B1F-E10-动力站-冷机-02-状态"),
      mk("B1F-E10-动力站-冷机-03-状态"),
    ];
    expect(pickChillerMachineTags(items, 3).map((t) => t.variableName)).toEqual([
      "B1F-E10-动力站-冷机-01-状态",
      "B1F-E10-动力站-冷机-02-状态",
      "B1F-E10-动力站-冷机-03-状态",
    ]);
  });

  it("冷机一个状态点都没有时退回老取法，格子不会变空", () => {
    const items = [mk("冷机1.温度"), mk("冷机2.温度")];
    expect(pickChillerMachineTags(items, 3).map((t) => t.variableName)).toEqual(oldWay(items, 3));
  });

  it("冷却塔不算冷机", () => {
    const items = [mk("冷却塔-01-状态"), mk("冷机1.远程开关机")];
    expect(pickChillerMachineTags(items, 3).map((t) => t.variableName)).toEqual(["冷机1.远程开关机"]);
  });

  /* 下面这条是回归墙：改冷机时曾顺手改了共用的挑参函数，把三座塔并成一座、后两格变成「未绑定」。
     水泵/冷凝塔必须逐条保持原样。 */
  it("水泵与冷凝塔：结果与老取法逐条一致（这次改动没碰它们）", () => {
    const towers = ["01", "02", "03"].map((n) => mk(`B1F-E10-动力站-冷却塔-${n}号`));
    const frozen = [1, 2, 3, 4].flatMap((i) => [
      mk(`B1F-E10-动力站-冷冻水泵-0${i}`),
      mk(`B1F-E10-动力站-冷冻水泵-0${i}Z`),
    ]);
    const cooling = [1, 2, 3, 4].map((i) => mk(`B1F-E10-动力站-冷却水泵-0${i}`));

    expect(pickCoolingTowerTags(towers, 3).map((t) => t.variableName)).toEqual(oldWay(towers, 3));
    expect(pickFrozenChilledWaterPumpTags(frozen, 4).map((t) => t.variableName)).toEqual(oldWay(frozen, 4));
    expect(pickCoolingWaterPumpTags(cooling, 4).map((t) => t.variableName)).toEqual(oldWay(cooling, 4));
  });

  it("冷冻泵与冷却泵不互相串台", () => {
    const items = [mk("B1F-E10-动力站-冷冻水泵-01-状态"), mk("B1F-E10-动力站-冷却水泵-01-状态")];
    expect(pickFrozenChilledWaterPumpTags(items, 4).map((t) => t.variableName)).toEqual([
      "B1F-E10-动力站-冷冻水泵-01-状态",
    ]);
    expect(pickCoolingWaterPumpTags(items, 4).map((t) => t.variableName)).toEqual([
      "B1F-E10-动力站-冷却水泵-01-状态",
    ]);
  });
});
