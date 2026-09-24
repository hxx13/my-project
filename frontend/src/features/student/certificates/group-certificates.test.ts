import { describe, expect, it } from "vitest";
import type { MyCertificate } from "../api/student.api";
import { groupByTraining } from "./group-certificates";

const cert = (o: Partial<MyCertificate>): MyCertificate => ({
  id: 0,
  templateKey: "FACILITY_ACCESS",
  ...o,
});

describe("groupByTraining", () => {
  it("同一培训的证书归一区，日期取最晚的那张", () => {
    const g = groupByTraining([
      cert({ id: 5, trainingId: 1, trainingName: "准入培训", trainingDate: "2026-05-02" }),
      cert({ id: 4, trainingId: 1, trainingName: "准入培训", trainingDate: "2026-05-01" }),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].name).toBe("准入培训");
    expect(g[0].date).toBe("2026-05-02");
    expect(g[0].items.map((c) => c.id)).toEqual([5, 4]);
  });

  it("不同培训各成一区，且保持后端给的先后", () => {
    const g = groupByTraining([
      cert({ id: 9, trainingId: 2, trainingName: "安乐死培训", trainingDate: "2026-06-01" }),
      cert({ id: 8, trainingId: 1, trainingName: "准入培训", trainingDate: "2026-05-01" }),
      cert({ id: 7, trainingId: 2, trainingName: "安乐死培训", trainingDate: "2026-06-01" }),
    ]);
    expect(g.map((x) => x.name)).toEqual(["安乐死培训", "准入培训"]);
    expect(g[0].items.map((c) => c.id)).toEqual([9, 7]);
  });

  it("没有培训归属的兜底成「未关联培训」", () => {
    const g = groupByTraining([cert({ id: 3, trainingId: null, trainingName: null })]);
    expect(g).toHaveLength(1);
    expect(g[0].name).toBe("未关联培训");
    expect(g[0].date).toBeUndefined();
  });

  it("一张证书都不会丢", () => {
    const list = [
      cert({ id: 1, trainingId: 1 }),
      cert({ id: 2, trainingId: null }),
      cert({ id: 3, trainingId: 2 }),
    ];
    const flat = groupByTraining(list).flatMap((g) => g.items);
    expect(flat.map((c) => c.id).sort()).toEqual([1, 2, 3]);
  });
});
