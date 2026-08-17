import type { TwinGraph } from "@/features/digital-twin/schema/types";

/** 楼层拓扑的持久化接口（Phase A 用 localStorage，后端上线后换成 backend 实现，接口不变）。 */
export interface StorageAdapter {
  /** 加载某楼层拓扑；不存在或解析失败返回 null。 */
  load(floor: string): TwinGraph | null;
  /** 保存某楼层拓扑。 */
  save(floor: string, graph: TwinGraph): void;
}
